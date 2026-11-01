/**
 * React Navigation param lists.
 */

/** Unauthenticated flow */
export type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
};

/** Stack inside the My Trips tab */
export type TripsStackParamList = {
  TripsList: undefined;
  NewTrip: undefined;
  MyHistory: undefined;
  TripDetail: { tripId: string };
  EditPackingList: { tripId: string };
  TripMap: { tripId: string };
  /** `uid` is optional and defaults to the current user — pass another collaborator's uid to view (read-only) their assignments. */
  MyAssignments: { tripId: string; uid?: string };
  TripItinerary: { tripId: string; initialDate?: string; openAddEvent?: boolean };
  TripSleeping: { tripId: string };
  TripChat: { tripId: string };
};

/** Backwards-compat alias so existing screen files don't need updating */
export type RootStackParamList = TripsStackParamList;

/** Bottom tab navigator */
export type TabParamList = {
  TripsTab: undefined;
  PlacesTab: undefined;
  TrailsTab: undefined;
};
