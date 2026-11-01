import { isSafeExternalUrl } from './safeUrl';

describe('isSafeExternalUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isSafeExternalUrl('https://www.recreation.gov/camping/campgrounds/232447')).toBe(true);
    expect(isSafeExternalUrl('http://example.com/recipe')).toBe(true);
    expect(isSafeExternalUrl('  HTTPS://Example.com  ')).toBe(true);
  });

  it('rejects other schemes', () => {
    for (const url of ['tel:5551234', 'sms:5551234', 'javascript:alert(1)', 'file:///etc/passwd', 'myapp://do-thing', 'intent://x#Intent;end']) {
      expect(isSafeExternalUrl(url)).toBe(false);
    }
  });

  it('rejects empty, relative, and host-less values', () => {
    for (const url of [undefined, null, '', 'example.com', '/recipes/1', 'https://', 'https:// space.com']) {
      expect(isSafeExternalUrl(url)).toBe(false);
    }
  });
});
