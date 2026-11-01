import { createContext, useContext, type ReactNode } from 'react';
import { useFirestoreTrips } from '../hooks/useFirestoreTrips';

type TripsContextValue = ReturnType<typeof useFirestoreTrips>;

const TripsContext = createContext<TripsContextValue | null>(null);

export function TripsProvider({ children }: { children: ReactNode }) {
  const value = useFirestoreTrips();
  return (
    <TripsContext.Provider value={value}>
      {children}
    </TripsContext.Provider>
  );
}

export function useTripsContext(): TripsContextValue {
  const ctx = useContext(TripsContext);
  if (ctx == null) {
    throw new Error('useTripsContext must be used inside TripsProvider');
  }
  return ctx;
}
