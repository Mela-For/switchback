import { createContext, useContext, type ReactNode } from 'react';
import { useTripHistory } from '../hooks/useTripHistory';

type TripHistoryContextValue = ReturnType<typeof useTripHistory>;

const TripHistoryContext = createContext<TripHistoryContextValue | null>(null);

// Depends on useTripsContext() internally, so TripHistoryProvider must be nested inside TripsProvider.
export function TripHistoryProvider({ children }: { children: ReactNode }) {
  const value = useTripHistory();
  return (
    <TripHistoryContext.Provider value={value}>
      {children}
    </TripHistoryContext.Provider>
  );
}

export function useTripHistoryContext(): TripHistoryContextValue {
  const ctx = useContext(TripHistoryContext);
  if (ctx == null) {
    throw new Error('useTripHistoryContext must be used inside TripHistoryProvider');
  }
  return ctx;
}
