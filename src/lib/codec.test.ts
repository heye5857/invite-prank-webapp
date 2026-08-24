import { deflateSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../defaults';
import type { InviteConfig } from '../types';
import { CODEC_VERSION, buildShareUrl, decodeConfig, encodeConfig } from './codec';

// ---------------------------------------------------------------------------
// Local helpers — intentionally independent of codec.ts internals so the
// tests re-implement the packing pipeline rather than trusting it.
// ---------------------------------------------------------------------------

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Compress+encode an arbitrary (possibly invalid) value like encodeConfig would. */
function packRaw(value: unknown): string {
  return bytesToB64url(deflateSync(strToU8(JSON.stringify(value))));
}

/** Unwrap a DecodeResult expected to succeed; returns the config. */
function expectOk(res: ReturnType<typeof decodeConfig>): InviteConfig {
  if (!res.ok) throw new Error(`expected ok:true, got error: ${res.error}`);
  return res.config;
}

/** Unwrap a DecodeResult expected to fail; asserts a non-empty error message. */
function expectErr(res: ReturnType<typeof decodeConfig>): string {
  if (res.ok) throw new Error('expected ok:false but decode succeeded');
  expect(typeof res.error).toBe('string');
  expect(res.error.length).toBeGreaterThan(0);
  return res.error;
}

// ~5KB of zh-TW + emoji text to stress the deflate/base64 pipeline.
const LONG_TITLE = '週末花蓮小旅行邀請，請務必認真考慮🥺'.repeat(120);

const EXOTIC: InviteConfig = {
  ...DEFAULT_CONFIG,
  theme: {
    ...DEFAULT_CONFIG.theme,
    presetId: 'ocean',
    emojiDecor: ['🍉', '🦄', '🌈', '🥝', '🎉'],
  },
  intro: {
    title: LONG_TITLE,
    subtitle: '超長標題測試 ✍️🔥',
    cta: '點我點我 👉',
  },
};

describe('CODEC_VERSION', () => {
  it('is 1', () => {
    expect(CODEC_VERSION).toBe(1);
  });
});

describe('encodeConfig/decodeConfig roundtrip', () => {
  it('roundtrips DEFAULT_CONFIG with deep equality', () => {
    expect(decodeConfig(encodeConfig(DEFAULT_CONFIG))).toEqual({ ok: true, config: DEFAULT_CONFIG });
  });

  it('roundtrips zh-TW + emoji + ~5KB long strings', () => {
    expect(LONG_TITLE.length).toBeGreaterThan(2000);
    const encoded = encodeConfig(EXOTIC);
    expect(expectOk(decodeConfig(encoded))).toEqual(EXOTIC);
  });

  it('roundtrips empty emojiDecor and empty steps arrays', () => {
    const cfg: InviteConfig = {
      ...DEFAULT_CONFIG,
      theme: { ...DEFAULT_CONFIG.theme, emojiDecor: [] },
      disagreeFlow: { ...DEFAULT_CONFIG.disagreeFlow, steps: [] },
    };
    expect(expectOk(decodeConfig(encodeConfig(cfg)))).toEqual(cfg);
  });

  it('preserves emojiDecor order', () => {
    const out = expectOk(decodeConfig(encodeConfig(EXOTIC)));
    expect(out.theme.emojiDecor).toEqual(['🍉', '🦄', '🌈', '🥝', '🎉']);
  });

  it('is stable: decode(encode(x)) twice yields identical results', () => {
    const first = decodeConfig(encodeConfig(DEFAULT_CONFIG));
    const second = decodeConfig(encodeConfig(DEFAULT_CONFIG));
    expect(first).toEqual(second);
  });
});

describe('encodeConfig output format', () => {
  it('produces unpadded base64url matching /^[\\w-]+$/', () => {
    const encoded = encodeConfig(DEFAULT_CONFIG);
    expect(encoded).toMatch(/^[\w-]+$/);
    expect(encoded).not.toContain('=');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
  });

  it('gives different encodings for different configs', () => {
    const other: InviteConfig = {
      ...DEFAULT_CONFIG,
      question: { ...DEFAULT_CONFIG.question, text: '看電影好嗎？' },
    };
    expect(encodeConfig(DEFAULT_CONFIG)).not.toBe(encodeConfig(other));
  });
});

describe('buildShareUrl', () => {
  it('strips any existing #fragment from base', () => {
    const url = buildShareUrl('https://example.com/invite#old=stuff', DEFAULT_CONFIG);
    expect(url.startsWith('https://example.com/invite#p=')).toBe(true);
    expect(url).not.toContain('old=stuff');
  });

  it('appends #p=<encoded> that decodes back to the original config', () => {
    const url = buildShareUrl('https://example.com/invite', DEFAULT_CONFIG);
    const marker = '#p=';
    const idx = url.indexOf(marker);
    expect(idx).toBeGreaterThan(0);
    expect(expectOk(decodeConfig(url.slice(idx + marker.length)))).toEqual(DEFAULT_CONFIG);
  });
});

describe('decodeConfig rejects malformed input without throwing', () => {
  it('rejects "!!!" (invalid base64url characters)', () => {
    expect(expectErr(decodeConfig('!!!'))).toBeTruthy();
  });

  it('rejects empty string', () => {
    expect(expectErr(decodeConfig(''))).toBeTruthy();
  });

  it('rejects valid base64url of garbage bytes', () => {
    const garbage = bytesToB64url(new Uint8Array([0x00, 0xff, 0x10, 0x28, 0xde, 0xad]));
    expect(expectErr(decodeConfig(garbage))).toBeTruthy();
  });

  it('rejects a valid deflate stream whose plaintext is not JSON', () => {
    const payload = bytesToB64url(deflateSync(strToU8('這不是 JSON {{{')));
    expect(expectErr(decodeConfig(payload))).toBeTruthy();
  });

  it('rejects a JSON array instead of an object', () => {
    expect(expectErr(decodeConfig(packRaw([1, 2, 3])))).toBeTruthy();
  });

  it('rejects v:2 payloads with a version-specific message', () => {
    expect(expectErr(decodeConfig(packRaw({ ...DEFAULT_CONFIG, v: 2 })))).toContain('版本');
  });

  it('rejects missing gag.fakeLoad and names the field', () => {
    const { fakeLoad: _drop, ...restGag } = DEFAULT_CONFIG.gag;
    const err = expectErr(decodeConfig(packRaw({ ...DEFAULT_CONFIG, gag: restGag })));
    expect(err).toContain('fakeLoad');
  });

  it('rejects missing notify.topic', () => {
    const { topic: _drop, ...restNotify } = DEFAULT_CONFIG.notify;
    expect(expectErr(decodeConfig(packRaw({ ...DEFAULT_CONFIG, notify: restNotify })))).toBeTruthy();
  });

  it('rejects shrink.minScale of wrong type (string)', () => {
    const gag = { ...DEFAULT_CONFIG.gag, shrink: { minScale: '0.35' } };
    expect(expectErr(decodeConfig(packRaw({ ...DEFAULT_CONFIG, gag })))).toBeTruthy();
  });

  it('rejects unknown gag mode id "bomb" and names it', () => {
    const gag = { ...DEFAULT_CONFIG.gag, modes: [...DEFAULT_CONFIG.gag.modes, 'bomb'] };
    expect(expectErr(decodeConfig(packRaw({ ...DEFAULT_CONFIG, gag })))).toContain('bomb');
  });

  it('rejects a step missing buttonLabel and names the field', () => {
    const disagreeFlow = { ...DEFAULT_CONFIG.disagreeFlow, steps: [{ text: '嗯…' }] };
    const err = expectErr(decodeConfig(packRaw({ ...DEFAULT_CONFIG, disagreeFlow })));
    expect(err).toContain('buttonLabel');
  });
});

describe('decodeConfig accepts valid variants', () => {
  it('accepts notify.topic:null', () => {
    const notify = { enabled: false, topic: null };
    const out = expectOk(decodeConfig(packRaw({ ...DEFAULT_CONFIG, notify })));
    expect(out.notify).toEqual({ enabled: false, topic: null });
  });

  it("accepts out-of-range fontScale (clamping is the UI's job)", () => {
    const theme = { ...DEFAULT_CONFIG.theme, fontScale: 42 };
    const out = expectOk(decodeConfig(packRaw({ ...DEFAULT_CONFIG, theme })));
    expect(out.theme.fontScale).toBe(42);
  });

  it('ignores unknown extra keys instead of rejecting', () => {
    const out = expectOk(decodeConfig(packRaw({ ...DEFAULT_CONFIG, futureField: { deep: [1, 2] } })));
    expect(out).toEqual(DEFAULT_CONFIG);
  });
});
