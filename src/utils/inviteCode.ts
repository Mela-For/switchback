import { getRandomValues } from 'expo-crypto';

// Unambiguous characters (no 0/O, 1/I/L confusion). 32 characters, which divides 256 evenly, so
// `byte % 32` below is uniform with no modulo bias.
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * 8 characters → 32^8 ≈ 1.1 trillion codes, so blind guessing against `inviteCodes/{code}` gets
 * (which any signed-in user may do, by design) isn't a practical way to find someone's trip.
 * Older 6-character codes still resolve — lookups are by exact document ID, not by length.
 */
export const INVITE_CODE_LENGTH = 8;

/** Uses a CSPRNG (not Math.random(), which is predictable) since the code is an access credential. */
export function generateInviteCode(): string {
  const bytes = getRandomValues(new Uint8Array(INVITE_CODE_LENGTH));
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join('');
}
