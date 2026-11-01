import { httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import { functions } from '../firebase/config';

/** Mirrors functions/src/index.ts's RecreationGovLookupResult — kept as a separate copy since the client and functions/ are different TypeScript projects with no shared package. */
export interface RecreationGovLookupResult {
  facilityId: string;
  name: string;
  description: string;
  rawDescription: string;
  address: string;
  lat: number | null;
  lng: number | null;
  activities: string[];
  photoUrl: string | null;
  sourceUrl: string;
  facilityType: string | null;
  feeDescription: string | null;
  stayLimit: string | null;
  adaAccess: string | null;
  reservable: boolean;
  reservationUrl: string | null;
  directions: string | null;
  phone: string | null;
}

const recreationGovLookupCallable = httpsCallable<{ url: string }, RecreationGovLookupResult>(
  functions,
  'recreationGovLookup'
);

/**
 * Resolves a pasted recreation.gov campground URL into structured facility data via the
 * `recreationGovLookup` Cloud Function (see functions/src/index.ts). Requires sign-in — the
 * function rejects unauthenticated calls itself, but callers should already be signed in given
 * this app's whole data model is gated on auth.
 */
export async function lookupRecreationGovUrl(url: string): Promise<RecreationGovLookupResult> {
  const result: HttpsCallableResult<RecreationGovLookupResult> = await recreationGovLookupCallable({ url });
  return result.data;
}
