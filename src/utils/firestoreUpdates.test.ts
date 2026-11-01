import { deleteField } from 'firebase/firestore';
import { sanitizeFirestoreUpdate } from './firestoreUpdates';

describe('sanitizeFirestoreUpdate', () => {
  it('passes non-undefined values through unchanged', () => {
    expect(sanitizeFirestoreUpdate({ name: 'Trip', count: 3, active: false })).toEqual({
      name: 'Trip',
      count: 3,
      active: false,
    });
  });

  it('replaces undefined values with a deleteField() sentinel', () => {
    const result = sanitizeFirestoreUpdate({ location: undefined });
    expect(result.location).toEqual(deleteField());
  });

  it('handles a mix of defined and undefined values in one call', () => {
    const result = sanitizeFirestoreUpdate({ name: 'Trip', location: undefined, notes: 'hi' });
    expect(result.name).toBe('Trip');
    expect(result.notes).toBe('hi');
    expect(result.location).toEqual(deleteField());
  });

  it('returns an empty object for empty input', () => {
    expect(sanitizeFirestoreUpdate({})).toEqual({});
  });
});
