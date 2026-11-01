import { useEffect, useRef } from 'react';
import type { Trip } from '../types';
import { getTrailElevation, mergeElevationIntoTrails } from '../utils/elevationApi';

/**
 * Opportunistically backfills elevation for any of a trip's trails that are missing it —
 * trails added before elevation existed, or where a prior fetch failed and nothing ever
 * retried it. Runs whenever the trip's trails are actually being viewed (pass `enabled` to
 * gate that — e.g. only while a "Trails" tab is active) rather than for every trip a user has.
 *
 * Trails are backfilled one at a time, not in parallel, out of consideration for the shared
 * public USGS elevation service — a trip with many missing trails fills in gradually rather
 * than firing a burst of concurrent lookups.
 */
export function useTrailElevationBackfill(
  trip: Trip | null,
  updateTrip: (id: string, updates: Partial<Omit<Trip, 'id'>>) => void,
  enabled = true
) {
  const tripRef = useRef(trip);
  useEffect(() => { tripRef.current = trip; }, [trip]);

  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || !trip) return;
    const missing = (trip.trails ?? []).filter(
      (t) => t.elevationGainM == null && t.geometry && t.geometry.length >= 2 && !inFlight.current.has(t.id)
    );
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const t of missing) {
        if (cancelled) return;
        inFlight.current.add(t.id);
        const stats = await getTrailElevation(t);
        inFlight.current.delete(t.id);
        if (cancelled || !stats) continue;
        const currentTrip = tripRef.current;
        if (!currentTrip?.trails?.some((x) => x.id === t.id)) continue; // removed while we were fetching
        updateTrip(currentTrip.id, { trails: mergeElevationIntoTrails(currentTrip.trails, t.id, stats) });
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, trip, updateTrip]);
}
