import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import type { Trip, TripType, TripHistorySnapshot } from '../types';
import { generateInviteCode } from '../utils/inviteCode';
import { sanitizeFirestoreUpdate } from '../utils/firestoreUpdates';
import { isTripArchived } from '../utils/dateUtils';
import { buildTripHistorySnapshot } from '../utils/tripHistory';
import { logger } from '../utils/logger';

export function useFirestoreTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    logger.log('[useFirestoreTrips] uid:', uid);
    if (!uid) {
      setTrips([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'trips'),
      where('collaboratorUids', 'array-contains', uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      logger.log('[onSnapshot] docs received:', snapshot.docs.length);
      const data: Trip[] = snapshot.docs.map((d) => ({
        ...(d.data() as Trip),
        id: d.id,
      }));
      // Sort newest first by createdAt
      data.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
      setTrips(data);
      setLoading(false);
    }, (error) => {
      logger.error('[onSnapshot] error', error);
      setLoading(false);
    });

    return unsubscribe;
  }, [uid]);

  const addTrip = useCallback(
    async (params: {
      name: string;
      startDate: string;
      endDate: string;
      type: TripType;
      location?: string;
    }) => {
      const user = auth.currentUser;
      logger.log('[addTrip] currentUser:', user?.uid ?? 'null');
      if (!user) return;

      const now = new Date().toISOString();
      const tripRef = doc(collection(db, 'trips'));
      const trimmedLocation = params.location?.trim();
      const inviteCode = generateInviteCode();
      const newTrip: Trip = {
        id: tripRef.id,
        name: params.name,
        startDate: params.startDate,
        endDate: params.endDate,
        type: params.type,
        ...(trimmedLocation ? { location: trimmedLocation } : {}),
        packingList: [],
        notes: '',
        createdAt: now,
        updatedAt: now,
        ownerUid: user.uid,
        collaboratorUids: [user.uid],
        collaborators: { [user.uid]: user.displayName ?? user.email ?? 'Unknown' },
        inviteCode,
      };
      try {
        const batch = writeBatch(db);
        batch.set(tripRef, newTrip);
        batch.set(doc(db, 'inviteCodes', inviteCode), {
          tripId: tripRef.id,
          ownerUid: user.uid,
        });
        await batch.commit();
        logger.log('[addTrip] batch commit succeeded, id:', tripRef.id);
      } catch (e) {
        logger.error('[addTrip] error', e);
        throw e;
      }
    },
    []
  );

  const updateTrip = useCallback(
    async (id: string, updates: Partial<Omit<Trip, 'id'>>) => {
      const now = new Date().toISOString();
      const tripRef = doc(db, 'trips', id);
      const sanitized = { updatedAt: now, ...sanitizeFirestoreUpdate(updates) };
      try {
        await updateDoc(tripRef, sanitized);
      } catch (e) {
        logger.error('[updateTrip] Firestore error', e);
        throw e;
      }
    },
    []
  );

  const deleteTrip = useCallback(async (id: string) => {
    const user = auth.currentUser;
    if (!user) return;

    const tripRef = doc(db, 'trips', id);
    const trip = trips.find((t) => t.id === id);

    if (trip?.ownerUid === user.uid) {
      // Owner deletes the entire trip, retiring its invite code with it
      const batch = writeBatch(db);
      batch.delete(tripRef);
      if (trip.inviteCode) {
        batch.delete(doc(db, 'inviteCodes', trip.inviteCode));
      }
      await batch.commit();
    } else {
      // Collaborator leaves the trip (removes themselves). If the trip is already archived, this is
      // the one moment its data would otherwise vanish from the leaving user's history — snapshot it
      // into their personal userTripHistory collection in the same atomic write. Leaving a trip that
      // hasn't happened yet snapshots nothing; there's no history to preserve.
      const nextUids = (trip?.collaboratorUids ?? []).filter((u) => u !== user.uid);
      const nextCollaborators = { ...(trip?.collaborators ?? {}) };
      delete nextCollaborators[user.uid];
      const now = new Date().toISOString();

      const batch = writeBatch(db);
      batch.update(tripRef, {
        collaboratorUids: nextUids,
        collaborators: nextCollaborators,
        updatedAt: now,
      });
      if (trip && isTripArchived(trip.endDate)) {
        const snapshot: TripHistorySnapshot = { ...buildTripHistorySnapshot(trip), snapshottedAt: now };
        batch.set(doc(db, 'userTripHistory', user.uid, 'entries', trip.id), snapshot);
      }
      await batch.commit();
    }
  }, [trips]);

  const joinTripByCode = useCallback(async (code: string): Promise<'joined' | 'already' | 'not_found'> => {
    const user = auth.currentUser;
    if (!user) return 'not_found';

    // Invite codes live in their own collection (not `trips`) so a code
    // only ever resolves to a tripId — never exposes trip content — and the
    // collection can't be listed/enumerated (see firestore.rules).
    const codeSnap = await getDoc(doc(db, 'inviteCodes', code.trim().toUpperCase()));
    if (!codeSnap.exists()) return 'not_found';

    const { tripId } = codeSnap.data() as { tripId: string };

    // We can't read the trip doc to check membership until we're a
    // collaborator, so use the already-subscribed `trips` list instead.
    if (trips.some((t) => t.id === tripId)) return 'already';

    try {
      await updateDoc(doc(db, 'trips', tripId), {
        collaboratorUids: arrayUnion(user.uid),
        [`collaborators.${user.uid}`]: user.displayName ?? user.email ?? 'Unknown',
        updatedAt: new Date().toISOString(),
      });
      return 'joined';
    } catch (e) {
      logger.error('[joinTripByCode] error', e);
      return 'not_found';
    }
  }, [trips]);

  return { trips, loading, addTrip, updateTrip, deleteTrip, joinTripByCode, refresh: () => {} };
}
