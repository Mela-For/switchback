/**
 * US-customary display helpers. Internal trail data stays metric (km/meters — matches
 * OSM/Overpass geometry math and USGS elevation output) since that's the natural unit for the
 * underlying data sources; only display and manual-entry input are US customary.
 */

const KM_PER_MI = 1.609344;
const M_PER_FT = 0.3048;

export function kmToMi(km: number): number {
  return km / KM_PER_MI;
}

export function miToKm(mi: number): number {
  return mi * KM_PER_MI;
}

export function mToFt(m: number): number {
  return m / M_PER_FT;
}

export function ftToM(ft: number): number {
  return ft * M_PER_FT;
}

/** e.g. "4.2 mi" */
export function formatMiles(km: number): string {
  return `${kmToMi(km).toFixed(1)} mi`;
}

/** e.g. "1,050 ft" */
export function formatFeet(m: number): string {
  return `${Math.round(mToFt(m)).toLocaleString('en-US')} ft`;
}
