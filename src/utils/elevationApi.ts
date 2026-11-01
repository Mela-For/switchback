import type { Trail, TrailCoord } from '../types';

const EPQS_URL = 'https://epqs.nationalmap.gov/v1/json';
const EPQS_TIMEOUT_MS = 8000;
/**
 * EPQS (USGS 3DEP) is single-point-per-request with no documented batch endpoint (~1.5s per
 * call observed). Total wall time is roughly (MAX_SAMPLES / CONCURRENCY) * 1.5s, so both knobs
 * trade accuracy/server load for latency — 15 samples at concurrency 8 is ~2 rounds (~3s) vs.
 * the original 25/5 (~5 rounds, ~8s). Push CONCURRENCY higher only with caution: EPQS has no
 * documented rate limit, and hammering a shared public USGS service isn't free for anyone else
 * using it either.
 */
const MAX_SAMPLES = 15;
const CONCURRENCY = 8;
/** Per-segment elevation deltas smaller than this are treated as DEM noise, not real climbing/descending — USGS 3DEP's ~0.53m RMSE (worse in dense cover) means small deltas aren't trustworthy signal. */
const MIN_SEGMENT_DELTA_M = 2;
/** If more than this fraction of sample points fail to resolve, the gain/loss estimate is too unreliable to keep. */
const MIN_VALID_FRACTION = 0.6;

export interface ElevationStats {
  gainM: number;
  lossM: number;
}

function fetchWithTimeout(url: string, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  if (signal?.aborted) controller.abort();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  });
}

async function fetchElevationM(lat: number, lng: number, signal?: AbortSignal): Promise<number | null> {
  try {
    const url = `${EPQS_URL}?x=${lng}&y=${lat}&wkid=4326&units=Meters&includeDate=false`;
    const res = await fetchWithTimeout(url, EPQS_TIMEOUT_MS, signal);
    if (!res.ok) return null;
    const data = await res.json();
    const value = parseFloat(data?.value);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** Evenly pick up to `maxSamples` points along a polyline, always including the first and last point. */
export function downsampleCoords(coords: TrailCoord[], maxSamples: number): TrailCoord[] {
  if (coords.length <= maxSamples || maxSamples < 2) return coords;
  const step = (coords.length - 1) / (maxSamples - 1);
  const result: TrailCoord[] = [];
  for (let i = 0; i < maxSamples; i++) {
    result.push(coords[Math.round(i * step)]);
  }
  return result;
}

/**
 * Sum elevation gain/loss across a sequence of samples along a trail.
 * Consecutive same-direction deltas are accumulated and only committed once they clear
 * `minSegmentDeltaM` — a naive per-segment threshold would silently drop a long, gentle
 * climb made of many sub-threshold steps, so small moves in the same direction are allowed
 * to build up instead of being discarded individually.
 */
export function computeGainLoss(elevationsM: number[], minSegmentDeltaM = MIN_SEGMENT_DELTA_M): ElevationStats {
  let gainM = 0;
  let lossM = 0;
  let pending = 0;
  for (let i = 1; i < elevationsM.length; i++) {
    const delta = elevationsM[i] - elevationsM[i - 1];
    const reversed = (delta > 0 && pending < 0) || (delta < 0 && pending > 0);
    if (reversed) {
      if (Math.abs(pending) >= minSegmentDeltaM) {
        if (pending > 0) gainM += pending;
        else lossM += -pending;
      }
      pending = 0;
    }
    pending += delta;
  }
  if (Math.abs(pending) >= minSegmentDeltaM) {
    if (pending > 0) gainM += pending;
    else lossM += -pending;
  }
  return { gainM: Math.round(gainM), lossM: Math.round(lossM) };
}

/** Pure helper for backfilling a computed elevation onto a specific trail within a trails array, used after an async elevation lookup resolves. */
export function mergeElevationIntoTrails(trails: Trail[], trailId: string, stats: ElevationStats): Trail[] {
  return trails.map((t) => (t.id === trailId ? { ...t, elevationGainM: stats.gainM, elevationLossM: stats.lossM } : t));
}

async function fetchElevationsWithConcurrency(
  coords: TrailCoord[],
  concurrency: number,
  signal?: AbortSignal
): Promise<(number | null)[]> {
  const results: (number | null)[] = new Array(coords.length).fill(null);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < coords.length) {
      if (signal?.aborted) return;
      const i = nextIndex++;
      results[i] = await fetchElevationM(coords[i].lat, coords[i].lng, signal);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, coords.length) }, worker));
  return results;
}

/**
 * Compute elevation gain/loss for a trail polyline via USGS 3DEP's Elevation Point Query
 * Service (US-only; free, no key). Downsamples to MAX_SAMPLES points, fetches with bounded
 * concurrency, and returns null if too few points resolved to trust the result (offline,
 * rate-limited, or the service being unreachable) rather than showing a misleading number.
 */
export async function computeTrailElevation(geometry: TrailCoord[], signal?: AbortSignal): Promise<ElevationStats | null> {
  if (!geometry || geometry.length < 2) return null;
  const samples = downsampleCoords(geometry, MAX_SAMPLES);
  const elevations = await fetchElevationsWithConcurrency(samples, CONCURRENCY, signal);
  if (signal?.aborted) return null;
  const valid = elevations.filter((e): e is number => e != null);
  if (valid.length < 2 || valid.length < samples.length * MIN_VALID_FRACTION) return null;
  return computeGainLoss(valid);
}

/**
 * Session-lifetime cache keyed by trail id — an OSM trail's `id` (`osm_<wayId>`) and geometry
 * are stable, so re-previewing the same search result (a common back-and-forth while browsing)
 * or hitting the same trail from a different screen doesn't re-run the ~3s EPQS lookup. Not
 * persisted (no app-wide cache/TTL pattern exists elsewhere to extend) — once a trail is added
 * to a trip, its elevation lives on the `Trail` object in Firestore instead, which is what
 * `getTrailElevation` checks first.
 */
const elevationCache = new Map<string, ElevationStats>();

/**
 * De-dupes concurrent callers asking for the same trail id (e.g. a trip's map screen and its
 * trails tab both opportunistically backfilling missing elevation at once) so only one EPQS
 * lookup actually happens; every caller awaits the same in-flight promise.
 */
const inFlightRequests = new Map<string, Promise<ElevationStats | null>>();

/**
 * Preferred entrypoint for screens: returns a trail's already-saved elevation if present,
 * otherwise a cached lookup, otherwise computes and caches it fresh. Returns null immediately
 * for trails with no geometry (manual entries) instead of attempting a lookup.
 */
export async function getTrailElevation(trail: Trail, signal?: AbortSignal): Promise<ElevationStats | null> {
  if (trail.elevationGainM != null) return { gainM: trail.elevationGainM, lossM: trail.elevationLossM ?? 0 };
  if (!trail.geometry || trail.geometry.length < 2) return null;
  const cached = elevationCache.get(trail.id);
  if (cached) return cached;
  const inFlight = inFlightRequests.get(trail.id);
  if (inFlight) return inFlight;
  const promise = computeTrailElevation(trail.geometry, signal)
    .then((stats) => {
      if (stats) elevationCache.set(trail.id, stats);
      return stats;
    })
    .finally(() => {
      inFlightRequests.delete(trail.id);
    });
  inFlightRequests.set(trail.id, promise);
  return promise;
}
