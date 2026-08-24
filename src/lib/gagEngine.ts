import type { GagConfig, MilestonesCfg } from '../types';

/**
 * Pure agree-button gag state machine (T4). Zero React/DOM: the UI layer owns
 * rendering and gating, this module only answers "what happens next".
 *
 * Agree NEVER succeeds — there is no success state in any type or branch.
 */

/** Dodge displacement range in px (offset.x ∈ [-120, 120]). */
const DODGE_RANGE_X_PX = 120;
/** Dodge displacement range in px (offset.y ∈ [-60, 60]). */
const DODGE_RANGE_Y_PX = 60;
/** Agree button shrinks by this factor per shrink press until minScale. */
const SHRINK_FACTOR = 0.85;
/** Disagree button grows by this factor per shrink press until the cap. */
const ENLARGE_FACTOR = 1.12;
/** Disagree button scale cap. */
const SCALE_DISAGREE_MAX = 1.6;
/** Toast text when cfg.errors.messages is empty. */
const FALLBACK_ERROR_MESSAGE = '系統異常';
/** Confirm prompt when cfg.confirmLoop.prompts is empty. */
const FALLBACK_CONFIRM_PROMPT = '你確定嗎？';

export type GagAction =
  | { type: 'AGREE_PRESS'; rand?: () => number }
  | { type: 'DISMISS' };

export type GagOverlay =
  | { kind: 'toast'; message: string }
  | { kind: 'loading'; delayMs: number }
  | { kind: 'confirm'; prompt: string }
  | null;

export interface GagState {
  /** total agree presses */
  attempt: number;
  /** index into cfg.modes (wraps) */
  modeIdx: number;
  /** presses consumed by the current mode visit */
  stepInMode: number;
  /** agree button scale, starts at 1 */
  scaleAgree: number;
  /** disagree button scale, starts at 1 */
  scaleDisagree: number;
  /** dodge displacement, px */
  offset: { x: number; y: number };
  overlay: GagOverlay;
  /** set only on milestone attempts, null otherwise */
  milestoneMessage: string | null;
}

function assertNever(value: never): never {
  throw new Error(`unexpected value: ${String(value)}`);
}

export function createInitialGagState(): GagState {
  return {
    attempt: 0,
    modeIdx: 0,
    stepInMode: 0,
    scaleAgree: 1,
    scaleDisagree: 1,
    offset: { x: 0, y: 0 },
    overlay: null,
    milestoneMessage: null,
  };
}

export function reduceGag(state: GagState, action: GagAction, cfg: GagConfig): GagState {
  switch (action.type) {
    case 'AGREE_PRESS':
      return agreePress(state, action.rand, cfg);
    case 'DISMISS':
      return dismissOverlay(state, cfg);
    default:
      return assertNever(action);
  }
}

/**
 * Pressing while a toast/confirm/loading overlay is open is NOT blocked here:
 * the engine simply replaces the overlay per current-mode behavior. Whether a
 * press is allowed while an overlay shows (e.g. waiting out the spinner) is
 * the UI layer's decision.
 */
function agreePress(state: GagState, rand: (() => number) | undefined, cfg: GagConfig): GagState {
  const attempt = state.attempt + 1;
  const milestoneMessage = milestoneFor(attempt, cfg.milestones);
  if (cfg.modes.length === 0) {
    // Empty modes array: pure counter — only attempt + milestones advance.
    return { ...state, attempt, milestoneMessage };
  }

  // Fall-through: once the current mode visit has consumed cfg.dodge.times
  // presses, the NEXT press advances to the next mode (wrapping), resets
  // stepInMode, and the new mode's first effect applies on this same press.
  // cfg.dodge.times is the per-visit budget for every mode — it is the only
  // press count the config exposes.
  const fallThrough = state.stepInMode >= cfg.dodge.times;
  const modeIdx = fallThrough ? (state.modeIdx + 1) % cfg.modes.length : state.modeIdx;
  const stepInMode = fallThrough ? 0 : state.stepInMode;

  const mode = cfg.modes[modeIdx];
  if (mode === undefined) {
    // Unreachable while 0 <= modeIdx < modes.length; keeps the index access honest.
    return { ...state, attempt, milestoneMessage };
  }

  switch (mode) {
    case 'dodge': {
      // Two draws per dodge press: x first, then y, mapped linearly onto ±120 / ±60 px.
      const draw = rand ?? Math.random;
      const offset = {
        x: (draw() * 2 - 1) * DODGE_RANGE_X_PX,
        y: (draw() * 2 - 1) * DODGE_RANGE_Y_PX,
      };
      return { ...state, attempt, milestoneMessage, modeIdx, stepInMode: stepInMode + 1, offset };
    }
    case 'fakeErrors': {
      const messages = cfg.errors.messages;
      const message =
        messages.length > 0
          ? (messages[stepInMode % messages.length] ?? FALLBACK_ERROR_MESSAGE)
          : FALLBACK_ERROR_MESSAGE;
      return {
        ...state,
        attempt,
        milestoneMessage,
        modeIdx,
        stepInMode: stepInMode + 1,
        overlay: { kind: 'toast', message },
      };
    }
    case 'fakeLoad':
      return {
        ...state,
        attempt,
        milestoneMessage,
        modeIdx,
        stepInMode: stepInMode + 1,
        overlay: { kind: 'loading', delayMs: cfg.fakeLoad.delayMs },
      };
    case 'shrink':
      return {
        ...state,
        attempt,
        milestoneMessage,
        modeIdx,
        stepInMode: stepInMode + 1,
        scaleAgree: Math.max(cfg.shrink.minScale, state.scaleAgree * SHRINK_FACTOR),
        scaleDisagree: Math.min(SCALE_DISAGREE_MAX, state.scaleDisagree * ENLARGE_FACTOR),
      };
    case 'confirmLoop': {
      const prompts = cfg.confirmLoop.prompts;
      const prompt =
        prompts.length > 0
          ? (prompts[stepInMode % prompts.length] ?? FALLBACK_CONFIRM_PROMPT)
          : FALLBACK_CONFIRM_PROMPT;
      return {
        ...state,
        attempt,
        milestoneMessage,
        modeIdx,
        stepInMode: stepInMode + 1,
        overlay: { kind: 'confirm', prompt },
      };
    }
    default:
      return assertNever(mode);
  }
}

function dismissOverlay(state: GagState, cfg: GagConfig): GagState {
  if (state.overlay === null) return state;
  switch (state.overlay.kind) {
    case 'loading':
      return { ...state, overlay: { kind: 'toast', message: cfg.fakeLoad.failText } };
    case 'toast':
    case 'confirm':
      return { ...state, overlay: null };
    default:
      return assertNever(state.overlay);
  }
}

/** Milestone message for the given (already incremented) attempt, or null. */
function milestoneFor(attempt: number, milestones: MilestonesCfg): string | null {
  if (milestones.everyN <= 0 || milestones.messages.length === 0) return null;
  if (attempt % milestones.everyN !== 0) return null;
  const index = (attempt / milestones.everyN - 1) % milestones.messages.length;
  return milestones.messages[index] ?? null;
}
