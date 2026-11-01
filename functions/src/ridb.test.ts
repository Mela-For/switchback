import { formatFacilityAddress, type RidbFacility } from './ridb';

describe('formatFacilityAddress', () => {
  it('joins the physical address parts', () => {
    const facility: RidbFacility = {
      FacilityID: '1',
      FACILITYADDRESS: [
        { FacilityStreetAddress1: '123 Forest Rd', City: 'Ashford', AddressStateCode: 'WA', PostalCode: '98304', FacilityAddressType: 'Physical' },
      ],
    };
    expect(formatFacilityAddress(facility)).toBe('123 Forest Rd, Ashford, WA, 98304');
  });

  it('prefers the Physical address over a Mailing one', () => {
    const facility: RidbFacility = {
      FacilityID: '1',
      FACILITYADDRESS: [
        { FacilityStreetAddress1: 'PO Box 1', City: 'Ashford', AddressStateCode: 'WA', PostalCode: '98304', FacilityAddressType: 'Mailing' },
        { FacilityStreetAddress1: '123 Forest Rd', City: 'Ashford', AddressStateCode: 'WA', PostalCode: '98304', FacilityAddressType: 'Physical' },
      ],
    };
    expect(formatFacilityAddress(facility)).toBe('123 Forest Rd, Ashford, WA, 98304');
  });

  it('falls back to the first address when none are marked Physical', () => {
    const facility: RidbFacility = {
      FacilityID: '1',
      FACILITYADDRESS: [{ FacilityStreetAddress1: '123 Forest Rd', City: 'Ashford' }],
    };
    expect(formatFacilityAddress(facility)).toBe('123 Forest Rd, Ashford');
  });

  it('returns an empty string when there is no address data', () => {
    expect(formatFacilityAddress({ FacilityID: '1' })).toBe('');
    expect(formatFacilityAddress({ FacilityID: '1', FACILITYADDRESS: [] })).toBe('');
  });

  it('skips missing parts rather than leaving stray commas', () => {
    const facility: RidbFacility = {
      FacilityID: '1',
      FACILITYADDRESS: [{ City: 'Ashford', AddressStateCode: 'WA' }],
    };
    expect(formatFacilityAddress(facility)).toBe('Ashford, WA');
  });
});
