import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

const RIDB_BASE_URL = 'https://ridb.recreation.gov/api/v1';

/** Field names/nesting confirmed against RIDB's published OpenAPI spec (v1.0.0, ridb.recreation.gov/api/v1). */
export interface RidbFacility {
  FacilityID: string;
  FacilityName?: string;
  FacilityDescription?: string;
  /** e.g. "Campground", "Day Use Area", "Trailhead". */
  FacilityTypeDescription?: string;
  FacilityUseFeeDescription?: string;
  FacilityDirections?: string;
  FacilityPhone?: string;
  FacilityEmail?: string;
  FacilityReservationURL?: string;
  /** Free text — RIDB has no structured ADA field, e.g. "Fully Accessible" or "N". */
  FacilityAdaAccess?: string;
  StayLimit?: string;
  Reservable?: boolean;
  FacilityLatitude?: number;
  FacilityLongitude?: number;
  ACTIVITY?: { ActivityName?: string }[];
  MEDIA?: { URL?: string; IsPrimary?: boolean }[];
  FACILITYADDRESS?: {
    FacilityStreetAddress1?: string;
    City?: string;
    AddressStateCode?: string;
    PostalCode?: string;
    /** Confirmed via RIDB's OpenAPI spec: "FacilityAddressType", not "AddressType", enum is Default/Mailing/Physical. */
    FacilityAddressType?: 'Default' | 'Mailing' | 'Physical';
  }[];
}

/** Best-effort single-line address from RIDB's address array, preferring the physical address. */
export function formatFacilityAddress(facility: RidbFacility): string {
  const addresses = facility.FACILITYADDRESS ?? [];
  const addr = addresses.find((a) => a.FacilityAddressType === 'Physical') ?? addresses[0];
  if (!addr) return '';
  return [addr.FacilityStreetAddress1, addr.City, addr.AddressStateCode, addr.PostalCode]
    .filter(Boolean)
    .join(', ');
}

/** Fetches a single facility by ID. `full=true` is RIDB's documented flag for including nested activities/media on the response. */
export async function fetchFacility(facilityId: string, apiKey: string): Promise<RidbFacility> {
  const res = await fetch(`${RIDB_BASE_URL}/facilities/${facilityId}?full=true`, {
    headers: { apikey: apiKey },
  });
  if (res.status === 404) {
    throw new HttpsError('not-found', `No recreation.gov facility found for ID ${facilityId}.`);
  }
  if (!res.ok) {
    // RIDB's response body distinguishes "no/malformed auth header" ("Unauthorized Access")
    // from "header shape is right but the key itself is wrong" ("invalid auth token") — both
    // are 401, so the status code alone doesn't say which. The body is logged server-side for
    // that diagnosis but never returned to the client: upstream error text can describe our API
    // key/auth setup, and callers don't need it to retry.
    const body = await res.text().catch(() => '');
    logger.error('RIDB request failed', { facilityId, status: res.status, body });
    throw new HttpsError('unavailable', 'recreation.gov lookup is temporarily unavailable. Please try again later.');
  }
  return res.json() as Promise<RidbFacility>;
}
