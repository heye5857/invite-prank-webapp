/**
 * Invite-config codec: InviteConfig <-> URL-hash payload (`#p=<data>`).
 * Pipeline: JSON.stringify -> fflate.deflateSync -> unpadded base64url.
 * decodeConfig never throws: every failure mode returns { ok:false, error }.
 * Unknown extra keys in a payload are ignored (dropped on rebuild), never rejected.
 * v1 legacy payloads (disagreeFlow era) are migrated to v2: disagreeFlow is
 * dropped and `success` is filled with the DEFAULT success values.
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

import { DEFAULT_CONFIG } from '../defaults';
import type {
  GagConfig,
  GagModeId,
  IntroConfig,
  InviteConfig,
  NotifyConfig,
  QuestionConfig,
  SuccessConfig,
  ThemeConfig,
} from '../types';

export const CODEC_VERSION = 2;

export type DecodeResult =
  | { ok: true; config: InviteConfig }
  | { ok: false; error: string };

/** Internal parse failure carrying a user-facing zh-TW message. */
class CodecError extends Error {}

const KNOWN_MODES: ReadonlySet<string> = new Set<GagModeId>([
  'dodge',
  'fakeErrors',
  'fakeLoad',
  'shrink',
  'confirmLoop',
]);

function isGagMode(v: string): v is GagModeId {
  return KNOWN_MODES.has(v);
}

// ---------- base64url (browser/jsdom-safe: String.fromCharCode + btoa/atob, no Buffer) ----------

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(raw: string): Uint8Array {
  const bin = atob(raw.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---------- structural validation (hand-written, no zod) ----------

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function req(v: Rec, key: string, path: string): unknown {
  const val = v[key];
  if (val === undefined) throw new CodecError(`缺少「${path}」`);
  return val;
}

function reqObj(v: Rec, key: string, path: string): Rec {
  const val = req(v, key, path);
  if (!isRec(val)) throw new CodecError(`「${path}」必須是物件`);
  return val;
}

function isStrArr(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x): x is string => typeof x === 'string');
}

function reqStrArr(v: Rec, key: string, path: string): string[] {
  const val = req(v, key, path);
  if (!isStrArr(val)) throw new CodecError(`「${path}」必須是字串陣列`);
  return val;
}

function reqStr(v: Rec, key: string, path: string): string {
  const val = req(v, key, path);
  if (typeof val !== 'string') throw new CodecError(`「${path}」必須是字串`);
  return val;
}

function reqNum(v: Rec, key: string, path: string): number {
  const val = req(v, key, path);
  if (typeof val !== 'number') throw new CodecError(`「${path}」必須是數字`);
  return val;
}

function reqBool(v: Rec, key: string, path: string): boolean {
  const val = req(v, key, path);
  if (typeof val !== 'boolean') throw new CodecError(`「${path}」必須是布林值`);
  return val;
}

// ---------- section parsers (rebuild typed objects; extras are dropped) ----------

function parseTheme(v: Rec): ThemeConfig {
  return {
    presetId: reqStr(v, 'presetId', 'theme.presetId'),
    bg: reqStr(v, 'bg', 'theme.bg'),
    accent: reqStr(v, 'accent', 'theme.accent'),
    textColor: reqStr(v, 'textColor', 'theme.textColor'),
    fontScale: reqNum(v, 'fontScale', 'theme.fontScale'),
    emojiDecor: reqStrArr(v, 'emojiDecor', 'theme.emojiDecor'),
  };
}

function parseIntro(v: Rec): IntroConfig {
  return {
    title: reqStr(v, 'title', 'intro.title'),
    subtitle: reqStr(v, 'subtitle', 'intro.subtitle'),
    cta: reqStr(v, 'cta', 'intro.cta'),
  };
}

function parseQuestion(v: Rec): QuestionConfig {
  return {
    text: reqStr(v, 'text', 'question.text'),
    agreeLabel: reqStr(v, 'agreeLabel', 'question.agreeLabel'),
    disagreeLabel: reqStr(v, 'disagreeLabel', 'question.disagreeLabel'),
  };
}

function parseGag(v: Rec): GagConfig {
  const modes: GagModeId[] = [];
  for (const m of reqStrArr(v, 'modes', 'gag.modes')) {
    if (!isGagMode(m)) throw new CodecError(`「gag.modes」包含未知的整人模式：${m}`);
    modes.push(m);
  }
  const dodge = reqObj(v, 'dodge', 'gag.dodge');
  const errors = reqObj(v, 'errors', 'gag.errors');
  const fakeLoad = reqObj(v, 'fakeLoad', 'gag.fakeLoad');
  const shrink = reqObj(v, 'shrink', 'gag.shrink');
  const confirmLoop = reqObj(v, 'confirmLoop', 'gag.confirmLoop');
  const milestones = reqObj(v, 'milestones', 'gag.milestones');
  return {
    modes,
    dodge: { times: reqNum(dodge, 'times', 'gag.dodge.times') },
    errors: { messages: reqStrArr(errors, 'messages', 'gag.errors.messages') },
    fakeLoad: {
      delayMs: reqNum(fakeLoad, 'delayMs', 'gag.fakeLoad.delayMs'),
      failText: reqStr(fakeLoad, 'failText', 'gag.fakeLoad.failText'),
    },
    shrink: { minScale: reqNum(shrink, 'minScale', 'gag.shrink.minScale') },
    confirmLoop: { prompts: reqStrArr(confirmLoop, 'prompts', 'gag.confirmLoop.prompts') },
    milestones: {
      everyN: reqNum(milestones, 'everyN', 'gag.milestones.everyN'),
      messages: reqStrArr(milestones, 'messages', 'gag.milestones.messages'),
    },
  };
}

function parseSuccess(v: Rec): SuccessConfig {
  return {
    title: reqStr(v, 'title', 'success.title'),
    text: reqStr(v, 'text', 'success.text'),
    emoji: reqStr(v, 'emoji', 'success.emoji'),
  };
}

function parseNotify(v: Rec): NotifyConfig {
  const topic = v['topic'];
  if (topic === undefined) throw new CodecError('缺少「notify.topic」');
  if (topic !== null && typeof topic !== 'string') {
    throw new CodecError('「notify.topic」必須是字串或 null');
  }
  return { enabled: reqBool(v, 'enabled', 'notify.enabled'), topic };
}

function parseInviteConfig(v: unknown): InviteConfig {
  if (!isRec(v)) throw new CodecError('邀請設定必須是 JSON 物件');
  const version = req(v, 'v', 'v');
  const sections = {
    theme: parseTheme(reqObj(v, 'theme', 'theme')),
    intro: parseIntro(reqObj(v, 'intro', 'intro')),
    question: parseQuestion(reqObj(v, 'question', 'question')),
    gag: parseGag(reqObj(v, 'gag', 'gag')),
    notify: parseNotify(reqObj(v, 'notify', 'notify')),
  };
  if (version === 1) {
    // Legacy v1 payload: disagreeFlow is dropped; success defaults are filled in.
    return { v: CODEC_VERSION, ...sections, success: { ...DEFAULT_CONFIG.success } };
  }
  if (version === CODEC_VERSION) {
    return { v: CODEC_VERSION, ...sections, success: parseSuccess(reqObj(v, 'success', 'success')) };
  }
  throw new CodecError(
    `不支援的設定版本：${String(version)}（僅支援 v=1（自動升級）與 v=${CODEC_VERSION}）`,
  );
}

// ---------- public API ----------

export function encodeConfig(cfg: InviteConfig): string {
  return bytesToB64url(deflateSync(strToU8(JSON.stringify(cfg))));
}

export function decodeConfig(raw: string): DecodeResult {
  try {
    const json = strFromU8(inflateSync(b64urlToBytes(raw)));
    return { ok: true, config: parseInviteConfig(JSON.parse(json)) };
  } catch (e) {
    if (e instanceof CodecError) return { ok: false, error: e.message };
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `連結資料無法解析：${detail}` };
  }
}

export function buildShareUrl(base: string, cfg: InviteConfig): string {
  const hashAt = base.indexOf('#');
  const root = hashAt === -1 ? base : base.slice(0, hashAt);
  return `${root}#p=${encodeConfig(cfg)}`;
}
