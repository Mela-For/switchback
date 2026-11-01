import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { parseFacilityId, stripHtml } from './parsing';
import { fetchFacility, formatFacilityAddress } from './ridb';
import { summarizeDescription } from './anthropic';

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
const ridbApiKey = defineSecret('RIDB_API_KEY');

export interface RecreationGovLookupResult {
  facilityId: string;
  name: string;
  /** AI-summarized (or passed-through, if already short) description. */
  description: string;
  /** Full plain-text description, in case the summary drops something the user wanted. */
  rawDescription: string;
  address: string;
  lat: number | null;
  lng: number | null;
  activities: string[];
  photoUrl: string | null;
  sourceUrl: string;
  /** e.g. "Campground", "Day Use Area" — straight from RIDB, not AI-inferred. */
  facilityType: string | null;
  feeDescription: string | null;
  stayLimit: string | null;
  adaAccess: string | null;
  reservable: boolean;
  reservationUrl: string | null;
  directions: string | null;
  phone: string | null;
}

/**
 * Paste a recreation.gov campground URL, get back structured trip-place data. Resolves the
 * facility ID from the URL, fetches it from the official RIDB API (not scraping), and uses AI
 * only for the narrow job of summarizing a long description — RIDB already returns structured,
 * trustworthy data, so nothing here is extracted or guessed by the model.
 *
 * Requires Firebase Auth (this app's whole data model is sign-in-gated) and the Blaze billing
 * plan (outbound network calls aren't available on the free Spark plan).
 */
export const recreationGovLookup = onCall<{ url?: string }, Promise<RecreationGovLookupResult>>(
  { secrets: [anthropicApiKey, ridbApiKey], region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }

    const url = typeof request.data?.url === 'string' ? request.data.url.trim() : '';
    if (!url) {
      throw new HttpsError('invalid-argument', 'A recreation.gov URL is required.');
    }

    const facilityId = parseFacilityId(url);
    if (!facilityId) {
      throw new HttpsError(
        'invalid-argument',
        'Could not find a facility ID in that link. Only recreation.gov campground links ' +
          '(recreation.gov/camping/campgrounds/...) are supported right now.'
      );
    }

    const facility = await fetchFacility(facilityId, ridbApiKey.value());
    const rawDescription = stripHtml(facility.FacilityDescription ?? '');
    const description = rawDescription ? await summarizeDescription(rawDescription, anthropicApiKey.value()) : '';

    const activities = (facility.ACTIVITY ?? [])
      .map((a) => a.ActivityName)
      .filter((name): name is string => Boolean(name));

    const media = facility.MEDIA ?? [];
    const primaryMedia = media.find((m) => m.IsPrimary === true) ?? media[0];

    return {
      facilityId,
      name: facility.FacilityName || 'Unnamed facility',
      description,
      rawDescription,
      address: formatFacilityAddress(facility),
      lat: facility.FacilityLatitude ?? null,
      lng: facility.FacilityLongitude ?? null,
      activities,
      photoUrl: primaryMedia?.URL ?? null,
      sourceUrl: `https://www.recreation.gov/camping/campgrounds/${facilityId}`,
      facilityType: facility.FacilityTypeDescription || null,
      feeDescription: stripHtml(facility.FacilityUseFeeDescription ?? '') || null,
      stayLimit: facility.StayLimit || null,
      adaAccess: facility.FacilityAdaAccess || null,
      reservable: facility.Reservable === true,
      reservationUrl: facility.FacilityReservationURL || null,
      directions: stripHtml(facility.FacilityDirections ?? '') || null,
      phone: facility.FacilityPhone || null,
    };
  }
);
