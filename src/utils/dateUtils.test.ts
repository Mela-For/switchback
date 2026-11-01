import { generateTripDays, getTripStatus, isTripArchived } from './dateUtils';

describe('generateTripDays', () => {
  it('returns a single date for a single-day trip', () => {
    expect(generateTripDays('2026-06-10', '2026-06-10')).toEqual(['2026-06-10']);
  });

  it('returns every date in an inclusive multi-day range', () => {
    expect(generateTripDays('2026-06-10', '2026-06-13')).toEqual([
      '2026-06-10',
      '2026-06-11',
      '2026-06-12',
      '2026-06-13',
    ]);
  });

  it('handles a range that crosses a month boundary', () => {
    expect(generateTripDays('2026-06-29', '2026-07-02')).toEqual([
      '2026-06-29',
      '2026-06-30',
      '2026-07-01',
      '2026-07-02',
    ]);
  });

  it('handles a range that crosses a year boundary', () => {
    expect(generateTripDays('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });
});

describe('isTripArchived', () => {
  it('is false while endDate is today', () => {
    expect(isTripArchived('2026-06-15', '2026-06-15')).toBe(false);
  });

  it('is false while endDate is in the future', () => {
    expect(isTripArchived('2026-06-20', '2026-06-15')).toBe(false);
  });

  it('is true the day after endDate', () => {
    expect(isTripArchived('2026-06-15', '2026-06-16')).toBe(true);
  });
});

describe('getTripStatus', () => {
  it('is upcoming before startDate', () => {
    expect(getTripStatus('2026-06-20', '2026-06-25', '2026-06-15')).toBe('upcoming');
  });

  it('is ongoing on startDate, not upcoming', () => {
    expect(getTripStatus('2026-06-20', '2026-06-25', '2026-06-20')).toBe('ongoing');
  });

  it('is ongoing on endDate, not past', () => {
    expect(getTripStatus('2026-06-20', '2026-06-25', '2026-06-25')).toBe('ongoing');
  });

  it('is ongoing between startDate and endDate', () => {
    expect(getTripStatus('2026-06-20', '2026-06-25', '2026-06-22')).toBe('ongoing');
  });

  it('is past the day after endDate', () => {
    expect(getTripStatus('2026-06-20', '2026-06-25', '2026-06-26')).toBe('past');
  });

  it('is upcoming for a same-day trip before it happens', () => {
    expect(getTripStatus('2026-06-20', '2026-06-20', '2026-06-19')).toBe('upcoming');
  });

  it('is ongoing for a same-day trip on the day itself', () => {
    expect(getTripStatus('2026-06-20', '2026-06-20', '2026-06-20')).toBe('ongoing');
  });
});
