import type { Trail, TrailCoord } from '../types';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'OutdoorTripPlanner/1.0';

class AbortError extends Error {
  constructor() {
    super('Aborted');
    this.name = 'AbortError';
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortError());
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new AbortError());
    }, { once: true });
  });
}

/**
 * fetch() with a hard client-side timeout layered on top of an optional caller signal.
 * Without this, a hung/unreachable host doesn't fail fast — it sits until the platform's
 * own (much longer, and inconsistent across iOS/Android) default socket timeout fires.
 */
function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, externalSignal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  if (externalSignal?.aborted) controller.abort();
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  });
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function geometryLengthKm(coords: TrailCoord[]): number {
  let km = 0;
  for (let i = 1; i < coords.length; i++) {
    km += haversineKm(coords[i - 1].lat, coords[i - 1].lng, coords[i].lat, coords[i].lng);
  }
  return Math.round(km * 10) / 10;
}

/** Thrown when the Overpass API responds with a non-2xx status. `status` lets callers special-case rate limiting (429). */
export class OverpassError extends Error {
  constructor(public status: number, statusText: string, body: string) {
    super(`Overpass API returned ${status} ${statusText}: ${body.slice(0, 200)}`);
    this.name = 'OverpassError';
  }
}

/** Geocode a location string to lat/lng using Nominatim (OpenStreetMap). */
export async function geocodeLocation(
  location: string,
  signal?: AbortSignal
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(location)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal });
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

/** centerLat/centerLng are used only to sort by proximity before truncating to 20 results. */
function toTrails(data: any, centerLat: number, centerLng: number): Trail[] {
  const trails: Trail[] = (data.elements ?? [])
    .filter((el: any) => el.geometry?.length > 1 && el.tags?.name)
    .map((el: any): Trail => {
      const coords: TrailCoord[] = el.geometry.map((g: any) => ({
        lat: g.lat,
        lng: g.lon,
      }));
      return {
        id: `osm_${el.id}`,
        osmId: String(el.id),
        name: el.tags.name,
        distanceKm: geometryLengthKm(coords),
        geometry: coords,
        trailheadLat: coords[0].lat,
        trailheadLng: coords[0].lng,
      };
    });
  // Sort closest-first before truncating — otherwise "up to 20 results" is an arbitrary 20
  // (whatever order Overpass returned), not the nearest 20, which matters a lot once a
  // location-only search can match far more than 20 named trails in the radius.
  trails.sort((a, b) =>
    haversineKm(centerLat, centerLng, a.trailheadLat!, a.trailheadLng!) -
    haversineKm(centerLat, centerLng, b.trailheadLat!, b.trailheadLng!)
  );
  return trails.slice(0, 20);
}

/**
 * Search for hiking trails near a coordinate via the Overpass API. A blank `query` skips the
 * name filter entirely and returns every named trail in the radius, closest-first — lets users
 * browse what's nearby instead of needing to already know a specific trail's name.
 * Returns up to 20 results with full polyline geometry and computed distance.
 * Retries up to MAX_ATTEMPTS times with backoff on rate-limit/timeout/server-error responses
 * (429/502/503/504) or network errors — the public instance is shared/best-effort, and a retry
 * a second or two later frequently succeeds. Other failures (e.g. a malformed query) throw
 * immediately since retrying wouldn't help. Each attempt is capped at OVERPASS_TIMEOUT_MS so a
 * hung connection fails fast instead of stalling on the platform's own long default timeout.
 */
export async function searchTrails(
  query: string,
  lat: number,
  lng: number,
  radiusM = 50000,
  signal?: AbortSignal
): Promise<Trail[]> {
  const trimmed = query.trim();
  // Escape special regex characters for the Overpass regex filter
  const nameFilter = trimmed ? `["name"~"${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}",i]` : '';
  const overpassQuery = `[out:json][timeout:25];
way["highway"~"path|footway|track"]${nameFilter}(around:${radiusM},${lat},${lng});
out geom;`;

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(800 * attempt, signal);
    try {
      const res = await fetchWithTimeout(OVERPASS_URL, {
        method: 'POST',
        body: overpassQuery,
        headers: { 'Content-Type': 'text/plain', 'User-Agent': USER_AGENT },
      }, OVERPASS_TIMEOUT_MS, signal);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new OverpassError(res.status, res.statusText, body);
      }
      const data = await res.json();
      return toTrails(data, lat, lng);
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
      const retryable = err instanceof OverpassError ? RETRYABLE_STATUSES.has(err.status) : true;
      if (!retryable) throw err;
    }
  }
  throw lastError;
}
