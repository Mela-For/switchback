import { Linking } from 'react-native';
import { logger } from './logger';

/**
 * True only for absolute http(s) URLs. URLs stored on a trip (recipe links, recreation.gov
 * reservation links) are editable by any collaborator, so they're untrusted input — without this,
 * a collaborator could plant a `tel:`, `sms:`, or another app's deep-link scheme that fires the
 * moment someone taps "open."
 */
export function isSafeExternalUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  return /^https?:\/\/[^\s/]+/i.test(url.trim());
}

/** Opens a trip-stored URL in the browser, refusing anything that isn't http(s). */
export function openExternalUrl(url: string | null | undefined): void {
  if (!isSafeExternalUrl(url)) {
    logger.error('[openExternalUrl] refused non-http(s) URL');
    return;
  }
  Linking.openURL(url.trim()).catch((e) => logger.error('[openExternalUrl] failed to open URL', e));
}
