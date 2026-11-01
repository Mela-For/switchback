import { getRandomValues } from 'expo-crypto';
import { generateInviteCode, INVITE_CODE_LENGTH } from './inviteCode';

// jest-expo's expo-crypto mock returns constant bytes; back it with Node's CSPRNG instead.
// jest.mock factories can't reference top-level imports, so require() is the standard pattern here.
jest.mock('expo-crypto', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  getRandomValues: jest.fn(<T extends Uint8Array>(arr: T) => require('crypto').webcrypto.getRandomValues(arr)),
}));

describe('generateInviteCode', () => {
  it('returns an 8-character code', () => {
    expect(INVITE_CODE_LENGTH).toBe(8);
    expect(generateInviteCode()).toHaveLength(INVITE_CODE_LENGTH);
  });

  it('only uses unambiguous characters (no 0/O, 1/I/L)', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateInviteCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });

  it('draws its randomness from expo-crypto, not Math.random()', () => {
    const mathRandom = jest.spyOn(Math, 'random');
    generateInviteCode();
    expect(getRandomValues).toHaveBeenCalled();
    expect(mathRandom).not.toHaveBeenCalled();
    mathRandom.mockRestore();
  });

  it('is not deterministic across calls', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateInviteCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
