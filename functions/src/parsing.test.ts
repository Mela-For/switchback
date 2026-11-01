import { parseFacilityId, stripHtml } from './parsing';

describe('parseFacilityId', () => {
  it('extracts the id from a standard campground URL', () => {
    expect(parseFacilityId('https://www.recreation.gov/camping/campgrounds/232447')).toBe('232447');
  });

  it('extracts the id with trailing path segments or query params', () => {
    expect(parseFacilityId('https://www.recreation.gov/camping/campgrounds/232447/campsites')).toBe('232447');
    expect(parseFacilityId('https://www.recreation.gov/camping/campgrounds/232447?tab=info')).toBe('232447');
  });

  it('is case-insensitive on the host', () => {
    expect(parseFacilityId('https://www.RECREATION.gov/camping/campgrounds/1234')).toBe('1234');
  });

  it('returns null for a non-campground recreation.gov URL', () => {
    expect(parseFacilityId('https://www.recreation.gov/permits/234567/registration')).toBeNull();
  });

  it('returns null for an unrelated URL', () => {
    expect(parseFacilityId('https://www.alltrails.com/trail/us/california/mist-trail')).toBeNull();
  });
});

describe('stripHtml', () => {
  it('removes tags and collapses whitespace', () => {
    expect(stripHtml('<p>Great campground.</p>\n<p>  Book early.</p>')).toBe('Great campground. Book early.');
  });

  it('unescapes common entities', () => {
    expect(stripHtml('Fish&amp;Wildlife area&nbsp;nearby')).toBe('Fish&Wildlife area nearby');
  });

  it('returns an empty string unchanged', () => {
    expect(stripHtml('')).toBe('');
  });
});
