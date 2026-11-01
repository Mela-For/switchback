/**
 * Extracts a numeric RIDB facility ID from a recreation.gov campground URL
 * (e.g. https://www.recreation.gov/camping/campgrounds/232447). Permit and
 * ticket/day-use URLs use different path shapes that aren't confirmed yet —
 * so only campground links resolve for now.
 */
export function parseFacilityId(url: string): string | null {
  const match = url.match(/recreation\.gov\/camping\/campgrounds\/(\d+)/i);
  return match ? match[1] : null;
}

/** Strips HTML tags and collapses whitespace — RIDB facility descriptions are HTML-formatted. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
