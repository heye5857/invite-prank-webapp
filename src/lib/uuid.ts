/**
 * crypto.randomUUID with a jsdom-safe fallback.
 * jsdom's Crypto historically lacks randomUUID while providing getRandomValues;
 * tests and the editor both call this helper instead of touching raw crypto.
 */
export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  // RFC 4122 v4 bits
  buf[6] = ((buf[6] ?? 0) & 0x0f) | 0x40;
  buf[8] = ((buf[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
