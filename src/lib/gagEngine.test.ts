import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../defaults';
import type { GagConfig } from '../types';
import { createInitialGagState, reduceGag, type GagState } from './gagEngine';

/** Deterministic baseline config; each test overrides only what it cares about. */
function makeCfg(patch: Partial<GagConfig> = {}): GagConfig {
  return {
    modes: ['fakeErrors'],
    dodge: { times: 99 },
    errors: { messages: ['E1', 'E2', 'E3'] },
    fakeLoad: { delayMs: 1500, failText: '載入失敗了' },
    shrink: { minScale: 0.35 },
    confirmLoop: { prompts: ['P1', 'P2', 'P3'] },
    milestones: { everyN: 0, messages: [] },
    ...patch,
  };
}

function press(state: GagState, cfg: GagConfig, rand?: () => number): GagState {
  return reduceGag(state, rand ? { type: 'AGREE_PRESS', rand } : { type: 'AGREE_PRESS' }, cfg);
}

function presses(state: GagState, cfg: GagConfig, n: number, rand?: () => number): GagState {
  let next = state;
  for (let i = 0; i < n; i += 1) next = press(next, cfg, rand);
  return next;
}

/** rand() that walks a fixed sequence (x draw first, then y per dodge press). */
function seqRand(values: number[]): () => number {
  let i = 0;
  return () => {
    const value = values[i];
    i += 1;
    return value ?? 0;
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('createInitialGagState', () => {
  it('returns the documented zero state', () => {
    expect(createInitialGagState()).toEqual({
      attempt: 0,
      modeIdx: 0,
      stepInMode: 0,
      scaleAgree: 1,
      scaleDisagree: 1,
      offset: { x: 0, y: 0 },
      overlay: null,
      milestoneMessage: null,
    });
  });

  it('returns a fresh object (and fresh offset) on every call', () => {
    const a = createInitialGagState();
    const b = createInitialGagState();
    expect(a).not.toBe(b);
    expect(a.offset).not.toBe(b.offset);
  });
});

describe('fakeErrors', () => {
  const cfg = makeCfg();

  it('shows messages[0] as a toast on the first press', () => {
    const next = press(createInitialGagState(), cfg);
    expect(next.overlay).toEqual({ kind: 'toast', message: 'E1' });
    expect(next.stepInMode).toBe(1);
  });

  it('cycles messages in order across presses', () => {
    let state = createInitialGagState();
    state = press(state, cfg);
    expect(state.overlay).toEqual({ kind: 'toast', message: 'E1' });
    state = press(state, cfg);
    expect(state.overlay).toEqual({ kind: 'toast', message: 'E2' });
    state = press(state, cfg);
    expect(state.overlay).toEqual({ kind: 'toast', message: 'E3' });
  });

  it('wraps back to the first message after len+2 presses', () => {
    // presses 1..5 -> E1,E2,E3,E1,E2
    expect(presses(createInitialGagState(), cfg, 4).overlay).toEqual({ kind: 'toast', message: 'E1' });
    expect(presses(createInitialGagState(), cfg, 5).overlay).toEqual({ kind: 'toast', message: 'E2' });
  });

  it('falls back to 系統異常 when the messages array is empty', () => {
    const empty = makeCfg({ errors: { messages: [] } });
    const next = press(createInitialGagState(), empty);
    expect(next.overlay).toEqual({ kind: 'toast', message: '系統異常' });
  });
});

describe('dodge', () => {
  it('moves to deterministic offsets from an injected rand sequence', () => {
    const cfg = makeCfg({ modes: ['dodge'] });
    const rand = seqRand([0, 0, 1, 1, 0.75, 0.5]);
    let state = createInitialGagState();
    state = press(state, cfg, rand);
    expect(state.offset).toEqual({ x: -120, y: -60 });
    state = press(state, cfg, rand);
    expect(state.offset).toEqual({ x: 120, y: 60 });
    state = press(state, cfg, rand);
    expect(state.offset).toEqual({ x: 60, y: 0 });
  });

  it('stays within inclusive ±120/±60 bounds for extreme rand 0 and 1', () => {
    const cfg = makeCfg({ modes: ['dodge'] });
    const atZero = press(createInitialGagState(), cfg, () => 0);
    expect(atZero.offset).toEqual({ x: -120, y: -60 });
    const atOne = press(createInitialGagState(), cfg, () => 1);
    expect(atOne.offset).toEqual({ x: 120, y: 60 });
  });

  it('keeps offsets bounded on the default Math.random path (no rand injected)', () => {
    const cfg = makeCfg({ modes: ['dodge'] });
    const next = press(createInitialGagState(), cfg);
    expect(Number.isFinite(next.offset.x)).toBe(true);
    expect(Number.isFinite(next.offset.y)).toBe(true);
    expect(next.offset.x).toBeGreaterThanOrEqual(-120);
    expect(next.offset.x).toBeLessThanOrEqual(120);
    expect(next.offset.y).toBeGreaterThanOrEqual(-60);
    expect(next.offset.y).toBeLessThanOrEqual(60);
  });

  it('stays in dodge for exactly dodge.times presses before falling through', () => {
    const cfg = makeCfg({ modes: ['dodge', 'fakeErrors'], dodge: { times: 2 } });
    const rand = () => 0.5;
    const p1 = press(createInitialGagState(), cfg, rand);
    expect(p1.modeIdx).toBe(0);
    expect(p1.stepInMode).toBe(1);
    expect(p1.overlay).toBeNull();
    const p2 = press(p1, cfg, rand);
    expect(p2.modeIdx).toBe(0);
    expect(p2.stepInMode).toBe(2);
    expect(p2.overlay).toBeNull();
  });

  it('falls through to the next mode on press times+1 with its first effect same press', () => {
    const cfg = makeCfg({ modes: ['dodge', 'fakeErrors'], dodge: { times: 2 } });
    const p3 = presses(createInitialGagState(), cfg, 3, () => 0.5);
    expect(p3.modeIdx).toBe(1);
    expect(p3.overlay).toEqual({ kind: 'toast', message: 'E1' });
    expect(p3.stepInMode).toBe(1);
  });
});

describe('multi-mode transitions [fakeErrors, fakeLoad]', () => {
  const cfg = makeCfg({ modes: ['fakeErrors', 'fakeLoad'], dodge: { times: 2 } });

  it('transitions fakeErrors -> fakeLoad after the visit budget', () => {
    let state = createInitialGagState();
    state = press(state, cfg);
    expect(state.overlay).toEqual({ kind: 'toast', message: 'E1' });
    state = press(state, cfg);
    expect(state.overlay).toEqual({ kind: 'toast', message: 'E2' });
    state = press(state, cfg);
    expect(state.overlay).toEqual({ kind: 'loading', delayMs: 1500 });
    expect(state.modeIdx).toBe(1);
  });

  it('resets stepInMode when falling through', () => {
    const p3 = presses(createInitialGagState(), cfg, 3);
    expect(p3.modeIdx).toBe(1);
    expect(p3.stepInMode).toBe(1);
  });

  it('wraps modeIdx past the last mode back to the first', () => {
    // P3 enters fakeLoad, P4 finishes its visit, P5 wraps to fakeErrors again.
    const p5 = presses(createInitialGagState(), cfg, 5);
    expect(p5.modeIdx).toBe(0);
    expect(p5.overlay).toEqual({ kind: 'toast', message: 'E1' });
  });

  it('works against the real DEFAULT_CONFIG.gag fixture', () => {
    // 3 dodges then fall through into fakeErrors' first message.
    const p4 = presses(createInitialGagState(), DEFAULT_CONFIG.gag, 4, () => 0.5);
    expect(p4.modeIdx).toBe(1);
    expect(p4.overlay).toEqual({ kind: 'toast', message: '系統繁忙中，請稍後再試' });
  });
});

describe('fakeLoad', () => {
  const cfg = makeCfg({ modes: ['fakeLoad'] });

  it('shows a loading overlay with the configured delayMs on press', () => {
    const next = press(createInitialGagState(), cfg);
    expect(next.overlay).toEqual({ kind: 'loading', delayMs: 1500 });
    expect(next.stepInMode).toBe(1);
  });

  it('replaces with the same loading overlay on subsequent presses in the visit', () => {
    const p2 = presses(createInitialGagState(), cfg, 2);
    expect(p2.overlay).toEqual({ kind: 'loading', delayMs: 1500 });
    expect(p2.stepInMode).toBe(2);
  });
});

describe('dismiss', () => {
  it('turns a loading overlay into the failText toast', () => {
    const cfg = makeCfg({ modes: ['fakeLoad'] });
    const loading = press(createInitialGagState(), cfg);
    const dismissed = reduceGag(loading, { type: 'DISMISS' }, cfg);
    expect(dismissed.overlay).toEqual({ kind: 'toast', message: '載入失敗了' });
    expect(dismissed.attempt).toBe(1);
  });

  it('closes a toast overlay', () => {
    const opened = press(createInitialGagState(), makeCfg());
    const dismissed = reduceGag(opened, { type: 'DISMISS' }, makeCfg());
    expect(dismissed.overlay).toBeNull();
    expect(dismissed.attempt).toBe(1);
  });

  it('closes a confirm overlay', () => {
    const cfg = makeCfg({ modes: ['confirmLoop'] });
    const opened = press(createInitialGagState(), cfg);
    const dismissed = reduceGag(opened, { type: 'DISMISS' }, cfg);
    expect(dismissed.overlay).toBeNull();
  });

  it('leaves an overlay-free state untouched', () => {
    const dismissed = reduceGag(createInitialGagState(), { type: 'DISMISS' }, makeCfg());
    expect(dismissed).toEqual(createInitialGagState());
  });
});

describe('shrink', () => {
  const cfg = makeCfg({ modes: ['shrink'] });

  it('decreases scaleAgree monotonically, never below minScale, never NaN over 30 presses', () => {
    let state = createInitialGagState();
    for (let i = 0; i < 30; i += 1) {
      const prev = state.scaleAgree;
      state = press(state, cfg);
      expect(state.scaleAgree).toBeLessThanOrEqual(prev);
      expect(state.scaleAgree).toBeGreaterThanOrEqual(0.35);
      expect(Number.isFinite(state.scaleAgree)).toBe(true);
    }
  });

  it('converges exactly at minScale', () => {
    const final = presses(createInitialGagState(), cfg, 30);
    expect(final.scaleAgree).toBe(0.35);
  });

  it('grows scaleDisagree monotonically and caps it at exactly 1.6', () => {
    let state = createInitialGagState();
    for (let i = 0; i < 30; i += 1) {
      const prev = state.scaleDisagree;
      state = press(state, cfg);
      expect(state.scaleDisagree).toBeGreaterThanOrEqual(prev);
      expect(state.scaleDisagree).toBeLessThanOrEqual(1.6);
      expect(Number.isFinite(state.scaleDisagree)).toBe(true);
    }
    expect(state.scaleDisagree).toBe(1.6);
  });

  it('sets no overlay', () => {
    const final = presses(createInitialGagState(), cfg, 30);
    expect(final.overlay).toBeNull();
  });
});

describe('confirmLoop', () => {
  const cfg = makeCfg({ modes: ['confirmLoop'] });

  it('shows prompts[0] as a confirm overlay on the first press', () => {
    const next = press(createInitialGagState(), cfg);
    expect(next.overlay).toEqual({ kind: 'confirm', prompt: 'P1' });
  });

  it('wraps prompts forever: len+2 presses revisit prompt[0]', () => {
    let state = createInitialGagState();
    const seen: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      state = press(state, cfg);
      if (state.overlay?.kind === 'confirm') seen.push(state.overlay.prompt);
    }
    expect(seen).toEqual(['P1', 'P2', 'P3', 'P1', 'P2']);
  });

  it('falls back to 你確定嗎？ when prompts are empty', () => {
    const empty = makeCfg({ modes: ['confirmLoop'], confirmLoop: { prompts: [] } });
    const next = press(createInitialGagState(), empty);
    expect(next.overlay).toEqual({ kind: 'confirm', prompt: '你確定嗎？' });
  });
});

describe('milestones', () => {
  const cfg = makeCfg({
    modes: ['fakeErrors'],
    milestones: { everyN: 2, messages: ['MA', 'MB'] },
  });

  it('fire at everyN attempts with cyclic messages and are null otherwise', () => {
    let state = createInitialGagState();
    const seen: (string | null)[] = [];
    for (let i = 0; i < 4; i += 1) {
      state = press(state, cfg);
      seen.push(state.milestoneMessage);
    }
    expect(seen).toEqual([null, 'MA', null, 'MB']);
  });

  it('never fire when everyN is 0', () => {
    const off = makeCfg({ milestones: { everyN: 0, messages: ['X'] } });
    const p4 = presses(createInitialGagState(), off, 4);
    expect(p4.milestoneMessage).toBeNull();
  });

  it('are null when milestone messages are empty even on a multiple attempt', () => {
    const silent = makeCfg({ milestones: { everyN: 2, messages: [] } });
    const p2 = presses(createInitialGagState(), silent, 2);
    expect(p2.milestoneMessage).toBeNull();
  });

  it('coexist with the mode effect on the same press', () => {
    const every = makeCfg({ modes: ['fakeErrors'], milestones: { everyN: 1, messages: ['M'] } });
    const p1 = press(createInitialGagState(), every);
    expect(p1.milestoneMessage).toBe('M');
    expect(p1.overlay).toEqual({ kind: 'toast', message: 'E1' });
  });
});

describe('cross-cutting', () => {
  it('counts attempts across mode transitions', () => {
    const cfg = makeCfg({ modes: ['fakeErrors', 'fakeLoad'], dodge: { times: 1 } });
    const p3 = presses(createInitialGagState(), cfg, 3);
    expect(p3.attempt).toBe(3);
    expect(p3.modeIdx).toBe(0); // wrapped: fakeErrors -> fakeLoad -> fakeErrors
  });

  it('survives an empty modes array: counters advance, nothing visual changes', () => {
    const cfg = makeCfg({ modes: [], milestones: { everyN: 2, messages: ['M'] } });
    const p1 = press(createInitialGagState(), cfg);
    expect(p1).toEqual({
      attempt: 1,
      modeIdx: 0,
      stepInMode: 0,
      scaleAgree: 1,
      scaleDisagree: 1,
      offset: { x: 0, y: 0 },
      overlay: null,
      milestoneMessage: null,
    });
    const p2 = press(p1, cfg);
    expect(p2.attempt).toBe(2);
    expect(p2.milestoneMessage).toBe('M');
    expect(p2.overlay).toBeNull();
    expect(p2.offset).toEqual({ x: 0, y: 0 });
  });

  it('does not mutate a deep-frozen input state or config', () => {
    const frozenState = deepFreeze(createInitialGagState());
    const frozenCfg = deepFreeze(makeCfg({ modes: ['dodge'] }));
    const next = press(frozenState, frozenCfg, () => 0.5);
    expect(Object.isFrozen(frozenState)).toBe(true);
    expect(frozenState.attempt).toBe(0);
    expect(frozenState.offset).toEqual({ x: 0, y: 0 });
    expect(next).not.toBe(frozenState);
    expect(next.attempt).toBe(1);
    expect(next.offset).toEqual({ x: 0, y: 0 }); // rand 0.5 maps to the center
  });
});
