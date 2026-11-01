import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import type { TripMessage } from '../types';
import { logger } from '../utils/logger';

export function useTripMessages(tripId: string) {
  const [messages, setMessages] = useState<TripMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'trips', tripId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: TripMessage[] = snapshot.docs.map((d) => ({
        ...(d.data() as TripMessage),
        id: d.id,
      }));
      setMessages(data);
      setLoading(false);
    }, (error) => {
      logger.error('[useTripMessages onSnapshot] error', error);
      setLoading(false);
    });

    return unsubscribe;
  }, [tripId]);

  const sendMessage = useCallback(
    async (text: string, senderUid: string, senderName: string) => {
      const msg: Record<string, unknown> = {
        senderUid,
        senderName,
        text,
        createdAt: new Date().toISOString(),
      };
      await addDoc(collection(db, 'trips', tripId, 'messages'), msg);
    },
    [tripId]
  );

  return { messages, loading, sendMessage };
}
