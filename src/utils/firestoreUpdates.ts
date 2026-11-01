import { deleteField } from 'firebase/firestore';

/**
 * Firestore's updateDoc() rejects raw `undefined` values, so this converts
 * them to deleteField() sentinels — letting callers pass `undefined` to mean
 * "remove this field" the same way they would with a plain JS object.
 */
export function sanitizeFirestoreUpdate(
  updates: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    sanitized[key] = value === undefined ? deleteField() : value;
  }
  return sanitized;
}
