import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import type { TripHistorySnapshot } from '../types';
import { isTripArchived } from '../utils/dateUtils';
import { mergeTripHistory, type TripHistoryEntry } from '../utils/tripHistory';
import { useTripsContext } from '../context/TripsContext';
import { logger } from '../utils/logger';

/**
 * Personal trip history: archived trips the user is still a collaborator on (read live, from the
 * same subscription TripsContext already holds) plus snapshots of trips they've since left (see
 * useFirestoreTrips.ts's deleteTrip). These two sources are mutually exclusive by construction, so
 * mergeTripHistory is a plain concatenation.
 */
export function useTripHistory(): { entries: TripHistoryEntry[]; loading: boolean } {
  const { trips } = useTripsContext();
  const [snapshots, setSnapshots] = useState<TripHistorySnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) {
      setSnapshots([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, 'userTripHistory', uid, 'entries'),
      (snap) => {
        setSnapshots(snap.docs.map((d) => d.data() as TripHistorySnapshot));
        setLoading(false);
      },
      (error) => {
        logger.error('[useTripHistory] onSnapshot error', error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [uid]);

  const archivedTrips = useMemo(() => trips.filter((t) => isTripArchived(t.endDate)), [trips]);
  const entries = useMemo(() => mergeTripHistory(archivedTrips, snapshots), [archivedTrips, snapshots]);

  return { entries, loading };
}
