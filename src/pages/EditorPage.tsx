/**
 * EditorPage (T7) — the customization studio.
 * Left: form cards (theme / intro / question / gags / disagree flow / notify).
 * Right (lg+): sticky phone-frame live preview; mobile gets the same preview
 * below the form. Autosaves to localStorage ('invite-draft', 300ms debounce),
 * generates a share link via lib/codec, and renders QR codes for the share /
 * ntfy-subscribe URLs.
 */
// allow: SIZE_OK — T7 contract mandates this exact file set; extraction into more files is out of scope.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';

import { InviteView } from '../components/InviteView';
import { PhoneFrame } from '../components/PhoneFrame';
import { DEFAULT_CONFIG, THEME_PRESETS } from '../defaults';
import type { ThemePreset } from '../defaults';
import { buildShareUrl } from '../lib/codec';
import { generateUuid } from '../lib/uuid';
import type {
  DisagreeFlowConfig,
  DisagreeStep,
  GagConfig,
  GagModeId,
  IntroConfig,
  InviteConfig,
  QuestionConfig,
  ThemeConfig,
} from '../types';

const DRAFT_KEY = 'invite-draft';

const INPUT_CLS =
  'w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-violet-500 outline-none';
const LABEL_CLS = 'block text-sm font-medium text-neutral-700';

const GAG_MODE_LABELS: readonly { id: GagModeId; label: string }[] = [
  { id: 'dodge', label: '逃跑按鈕' },
  { id: 'fakeErrors', label: '搞笑錯誤' },
  { id: 'fakeLoad', label: '假載入失敗' },
  { id: 'shrink', label: '同意縮小' },
  { id: 'confirmLoop', label: '確認轉圈圈' },
];

/** JSON round-trip clone — jsdom/Node-safe stand-in for structuredClone. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Boundary parse of the autosaved draft; anything suspicious falls back to defaults. */
function loadDraft(): InviteConfig {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw === null) return clone(DEFAULT_CONFIG);
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'v' in parsed &&
      (parsed as { v?: unknown }).v === 1
    ) {
      return parsed as InviteConfig;
    }
    return clone(DEFAULT_CONFIG);
  } catch {
    return clone(DEFAULT_CONFIG);
  }
}

async function drawQr(canvas: HTMLCanvasElement, text: string): Promise<void> {
  try {
    const mod = await import('qrcode');
    await mod.default.toCanvas(canvas, text, { width: 160, margin: 1 });
  } catch (err) {
    console.warn('[editor] QR 產生失敗', err); // no-excuse-ok: boundary warn
  }
}

function QrImage({ text, testid }: { text: string; testid: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (ctx === null) {
      setSupported(false); // jsdom without canvas: hide instead of a dead box
      return;
    }
    void drawQr(canvas, text);
  }, [text]);

  if (!supported) return null;
  return (
    <canvas
      ref={ref}
      data-testid={testid}
      width={160}
      height={160}
      className="rounded-lg bg-white p-1"
    />
  );
}

function Card({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black text-neutral-800">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

export default function EditorPage() {
  const [draft, setDraft] = useState<InviteConfig>(loadDraft);
  const [linkRevealed, setLinkRevealed] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  // ---- autosave (300ms debounce; cleanup cancels on every draft change) ----
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch (err) {
        console.warn('[editor] 自動儲存失敗', err); // no-excuse-ok: boundary warn
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [draft]);

  // ---- topic auto-generation: exactly once, when enabled but missing -------
  useEffect(() => {
    if (draft.notify.enabled && draft.notify.topic === null) {
      setDraft((d) => ({ ...d, notify: { ...d.notify, topic: generateUuid() } }));
    }
  }, [draft.notify]);

  // ---- immutable patch helpers --------------------------------------------
  const setTheme = (patch: Partial<ThemeConfig>) =>
    setDraft((d) => ({ ...d, theme: { ...d.theme, ...patch } }));
  const setIntro = (patch: Partial<IntroConfig>) =>
    setDraft((d) => ({ ...d, intro: { ...d.intro, ...patch } }));
  const setQuestion = (patch: Partial<QuestionConfig>) =>
    setDraft((d) => ({ ...d, question: { ...d.question, ...patch } }));
  const setGag = (patch: Partial<GagConfig>) =>
    setDraft((d) => ({ ...d, gag: { ...d.gag, ...patch } }));
  const setFlow = (patch: Partial<DisagreeFlowConfig>) =>
    setDraft((d) => ({ ...d, disagreeFlow: { ...d.disagreeFlow, ...patch } }));

  const applyPreset = (preset: ThemePreset) =>
    setTheme({
      presetId: preset.id,
      bg: preset.bg,
      accent: preset.accent,
      textColor: preset.textColor,
    });

  const toggleMode = (id: GagModeId, on: boolean) =>
    setGag({
      modes: on ? [...draft.gag.modes, id] : draft.gag.modes.filter((m) => m !== id),
    });

  /** Swap a mode with its neighbour so the user controls which gag hits first. */
  const moveMode = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= draft.gag.modes.length) return;
    setGag({
      modes: draft.gag.modes.map((m, i) =>
        i === index
          ? (draft.gag.modes[target] ?? m)
          : i === target
            ? (draft.gag.modes[index] ?? m)
            : m,
      ),
    });
  };

  const updateStep = (index: number, patch: Partial<DisagreeStep>) =>
    setFlow({
      steps: draft.disagreeFlow.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    });

  const numFrom = (e: ChangeEvent<HTMLInputElement>): number => e.target.valueAsNumber;

  // The share link auto-refreshes with the draft: once revealed, it can never
  // go stale — editing settings always updates the link + QR before copying.
  const shareUrl = useMemo(
    () =>
      linkRevealed
        ? buildShareUrl(window.location.origin + window.location.pathname, draft)
        : null,
    [linkRevealed, draft],
  );

  const copyLink = async () => {
    if (shareUrl === null) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* clipboard unavailable (permission / non-secure ctx) — noop by contract */
    }
  };

  const confirmReset = () => {
    localStorage.removeItem(DRAFT_KEY);
    setDraft(clone(DEFAULT_CONFIG));
    setLinkRevealed(false);
    setShowResetModal(false);
  };

  const subscribeUrl = draft.notify.topic === null ? null : `https://ntfy.sh/${draft.notify.topic}`;

  return (
    <main data-testid="editor-root" className="min-h-dvh bg-neutral-100 pb-16">
      <header className="border-b border-neutral-200 bg-white px-6 py-4 shadow-sm">
        <h1 className="text-xl font-black text-neutral-800">來約我嘛 編輯器 🥺</h1>
        <p className="text-sm text-neutral-500">客製化你的整人邀請函，右邊即時預覽 ✨</p>
      </header>

      <div className="mx-auto max-w-6xl lg:flex lg:gap-6 lg:px-6">
        {/* ---------------- form column ---------------- */}
        <form
          className="flex-1 space-y-6 px-4 pt-6 lg:px-0"
          onSubmit={(e) => e.preventDefault()}
        >
          {/* A. 主題 */}
          <Card icon="🎨" title="主題">
            <div>
              <span className={LABEL_CLS}>配色組合</span>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {THEME_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p)}
                    aria-pressed={draft.theme.presetId === p.id}
                    className={`rounded-xl border border-neutral-200 px-2 py-2 text-xs font-bold transition ${
                      draft.theme.presetId === p.id
                        ? 'ring-2 ring-violet-500'
                        : 'hover:bg-neutral-50'
                    }`}
                  >
                    <span
                      aria-hidden
                      className="mx-auto mb-1 block h-4 w-4 rounded-full border border-black/10"
                      style={{ backgroundColor: p.accent }}
                    />
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className={LABEL_CLS}>背景</span>
                <input
                  type="color"
                  aria-label="背景"
                  className="h-10 w-full cursor-pointer rounded-lg"
                  value={draft.theme.bg}
                  onChange={(e) => setTheme({ bg: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className={LABEL_CLS}>強調色</span>
                <input
                  type="color"
                  aria-label="強調色"
                  className="h-10 w-full cursor-pointer rounded-lg"
                  value={draft.theme.accent}
                  onChange={(e) => setTheme({ accent: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className={LABEL_CLS}>文字色</span>
                <input
                  type="color"
                  aria-label="文字色"
                  className="h-10 w-full cursor-pointer rounded-lg"
                  value={draft.theme.textColor}
                  onChange={(e) => setTheme({ textColor: e.target.value })}
                />
              </label>
            </div>
            <label className="space-y-1">
              <span className={LABEL_CLS}>
                字體大小（{draft.theme.fontScale.toFixed(2)}×）
              </span>
              <input
                type="range"
                min={0.85}
                max={1.3}
                step={0.05}
                value={draft.theme.fontScale}
                onChange={(e) => setTheme({ fontScale: Number(e.target.value) })}
                className="w-full accent-violet-600"
              />
            </label>
            <label className="space-y-1">
              <span className={LABEL_CLS}>表情符號裝飾</span>
              <input
                type="text"
                className={INPUT_CLS}
                value={draft.theme.emojiDecor.join('')}
                onChange={(e) => setTheme({ emojiDecor: [...e.target.value] })}
              />
            </label>
          </Card>

          {/* B. 開場頁 */}
          <Card icon="👋" title="開場頁">
            <label className="space-y-1">
              <span className={LABEL_CLS}>開場標題</span>
              <input
                id="f-intro-title"
                type="text"
                className={INPUT_CLS}
                value={draft.intro.title}
                onChange={(e) => setIntro({ title: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className={LABEL_CLS}>開場副標</span>
              <input
                type="text"
                className={INPUT_CLS}
                value={draft.intro.subtitle}
                onChange={(e) => setIntro({ subtitle: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className={LABEL_CLS}>開場按鈕</span>
              <input
                type="text"
                className={INPUT_CLS}
                value={draft.intro.cta}
                onChange={(e) => setIntro({ cta: e.target.value })}
              />
            </label>
          </Card>

          {/* C. 提問頁 */}
          <Card icon="❓" title="提問頁">
            <label className="space-y-1">
              <span className={LABEL_CLS}>提問文字</span>
              <input
                type="text"
                className={INPUT_CLS}
                value={draft.question.text}
                onChange={(e) => setQuestion({ text: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className={LABEL_CLS}>同意按鈕文字</span>
              <input
                type="text"
                className={INPUT_CLS}
                value={draft.question.agreeLabel}
                onChange={(e) => setQuestion({ agreeLabel: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className={LABEL_CLS}>不同意按鈕文字</span>
              <input
                type="text"
                className={INPUT_CLS}
                value={draft.question.disagreeLabel}
                onChange={(e) => setQuestion({ disagreeLabel: e.target.value })}
              />
            </label>
          </Card>

          {/* D. 整人手法 */}
          <Card icon="😈" title="整人手法">
            <fieldset>
              <legend className={LABEL_CLS}>啟用的手法（順序＝點選順序）</legend>
              <div className="mt-2 space-y-2">
                {GAG_MODE_LABELS.map(({ id, label }) => (
                  <label
                    key={id}
                    className="flex items-center gap-2 text-sm font-medium text-neutral-700"
                  >
                    <input
                      type="checkbox"
                      checked={draft.gag.modes.includes(id)}
                      onChange={(e) => toggleMode(id, e.target.checked)}
                      className="h-4 w-4 accent-violet-600"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {draft.gag.modes.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-neutral-500">
                  手法會依序輪替（排第一個的最先出現）——用 ↑↓ 調整順序
                </p>
                <ul className="flex flex-wrap gap-2">
                  {draft.gag.modes.map((id, i) => {
                    const found = GAG_MODE_LABELS.find((m) => m.id === id);
                    const label = found?.label ?? id;
                    return (
                      <li
                        key={id}
                        data-testid={`mode-chip-${id}`}
                        className="flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700"
                      >
                        <span>
                          {i + 1} {label}
                        </span>
                        <button
                          type="button"
                          aria-label={`把${label}往前移`}
                          disabled={i === 0}
                          onClick={() => moveMode(i, -1)}
                          className="rounded px-1 leading-none hover:bg-violet-200 disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label={`把${label}往後移`}
                          disabled={i === draft.gag.modes.length - 1}
                          onClick={() => moveMode(i, 1)}
                          className="rounded px-1 leading-none hover:bg-violet-200 disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {draft.gag.modes.includes('dodge') && (
              <label className="space-y-1">
                <span className={LABEL_CLS}>逃跑次數（之後換下一招）</span>
                <input
                  type="number"
                  min={1}
                  className={INPUT_CLS}
                  value={draft.gag.dodge.times}
                  onChange={(e) => {
                    const n = numFrom(e);
                    setGag({ dodge: { times: Number.isFinite(n) && n >= 1 ? n : 1 } });
                  }}
                />
              </label>
            )}
            {draft.gag.modes.includes('fakeErrors') && (
              <label className="space-y-1">
                <span className={LABEL_CLS}>錯誤訊息（一行一句）</span>
                <textarea
                  rows={4}
                  className={INPUT_CLS}
                  value={draft.gag.errors.messages.join('\n')}
                  onChange={(e) =>
                    setGag({
                      errors: { messages: e.target.value.split('\n').filter(Boolean) },
                    })
                  }
                />
              </label>
            )}
            {draft.gag.modes.includes('fakeLoad') && (
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className={LABEL_CLS}>載入時間（毫秒）</span>
                  <input
                    type="number"
                    min={0}
                    className={INPUT_CLS}
                    value={draft.gag.fakeLoad.delayMs}
                    onChange={(e) => {
                      const n = numFrom(e);
                      setGag({
                        fakeLoad: {
                          ...draft.gag.fakeLoad,
                          delayMs: Number.isFinite(n) && n >= 0 ? n : 0,
                        },
                      });
                    }}
                  />
                </label>
                <label className="space-y-1">
                  <span className={LABEL_CLS}>載入失敗文案</span>
                  <input
                    type="text"
                    className={INPUT_CLS}
                    value={draft.gag.fakeLoad.failText}
                    onChange={(e) =>
                      setGag({
                        fakeLoad: { ...draft.gag.fakeLoad, failText: e.target.value },
                      })
                    }
                  />
                </label>
              </div>
            )}
            {draft.gag.modes.includes('shrink') && (
              <label className="space-y-1">
                <span className={LABEL_CLS}>
                  最小縮小比例（{draft.gag.shrink.minScale.toFixed(2)}×）
                </span>
                <input
                  type="range"
                  min={0.2}
                  max={0.6}
                  step={0.05}
                  value={draft.gag.shrink.minScale}
                  onChange={(e) => setGag({ shrink: { minScale: Number(e.target.value) } })}
                  className="w-full accent-violet-600"
                />
              </label>
            )}
            {draft.gag.modes.includes('confirmLoop') && (
              <label className="space-y-1">
                <span className={LABEL_CLS}>確認台詞（一行一句）</span>
                <textarea
                  rows={4}
                  className={INPUT_CLS}
                  value={draft.gag.confirmLoop.prompts.join('\n')}
                  onChange={(e) =>
                    setGag({
                      confirmLoop: {
                        prompts: e.target.value.split('\n').filter(Boolean),
                      },
                    })
                  }
                />
              </label>
            )}

            <label className="space-y-1">
              <span className={LABEL_CLS}>里程碑間隔（每幾次按壓）</span>
              <input
                type="number"
                min={1}
                className={INPUT_CLS}
                value={draft.gag.milestones.everyN}
                onChange={(e) => {
                  const n = numFrom(e);
                  setGag({
                    milestones: {
                      ...draft.gag.milestones,
                      everyN: Number.isFinite(n) && n >= 1 ? n : 1,
                    },
                  });
                }}
              />
            </label>
            <label className="space-y-1">
              <span className={LABEL_CLS}>里程碑訊息（一行一句）</span>
              <textarea
                rows={3}
                className={INPUT_CLS}
                value={draft.gag.milestones.messages.join('\n')}
                onChange={(e) =>
                  setGag({
                    milestones: {
                      ...draft.gag.milestones,
                      messages: e.target.value.split('\n').filter(Boolean),
                    },
                  })
                }
              />
            </label>
          </Card>

          {/* E. 不同意流程 */}
          <Card icon="🥺" title="不同意流程">
            {draft.disagreeFlow.steps.map((step, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-neutral-200 p-3">
                <p className="text-sm font-bold text-violet-600">第 {i + 1} 段</p>
                <label className="space-y-1">
                  <span className={LABEL_CLS}>說明文字</span>
                  <input
                    type="text"
                    aria-label={`第 ${i + 1} 段說明文字`}
                    className={INPUT_CLS}
                    value={step.text}
                    onChange={(e) => updateStep(i, { text: e.target.value })}
                  />
                </label>
                <div className="flex items-end gap-2">
                  <label className="flex-1 space-y-1">
                    <span className={LABEL_CLS}>按鈕文字</span>
                    <input
                      type="text"
                      aria-label={`第 ${i + 1} 段按鈕文字`}
                      className={INPUT_CLS}
                      value={step.buttonLabel}
                      onChange={(e) => updateStep(i, { buttonLabel: e.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={`刪除第 ${i + 1} 段`}
                    onClick={() =>
                      setFlow({ steps: draft.disagreeFlow.steps.filter((_, j) => j !== i) })
                    }
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-500 hover:bg-red-50"
                  >
                    刪除
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setFlow({
                  steps: [...draft.disagreeFlow.steps, { text: '', buttonLabel: '繼續' }],
                })
              }
              className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-bold text-violet-600 hover:bg-violet-50"
            >
              ＋ 新增一段
            </button>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
              <input
                type="checkbox"
                checked={draft.disagreeFlow.loop}
                onChange={(e) => setFlow({ loop: e.target.checked })}
                className="h-4 w-4 accent-violet-600"
              />
              永遠循環（永遠到不了最後一頁 😈）
            </label>
            <label className="space-y-1">
              <span className={LABEL_CLS}>最終標題</span>
              <input
                type="text"
                className={INPUT_CLS}
                value={draft.disagreeFlow.finalTitle}
                onChange={(e) => setFlow({ finalTitle: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className={LABEL_CLS}>最終內容</span>
              <input
                type="text"
                className={INPUT_CLS}
                value={draft.disagreeFlow.finalText}
                onChange={(e) => setFlow({ finalText: e.target.value })}
              />
            </label>
          </Card>

          {/* F. 通知 */}
          <Card icon="🔔" title="通知">
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
              <input
                type="checkbox"
                data-testid="notify-toggle"
                checked={draft.notify.enabled}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    notify: { ...d.notify, enabled: e.target.checked },
                  }))
                }
                className="h-4 w-4 accent-violet-600"
              />
              啟用開啟通知（朋友一打開你就知道 👀）
            </label>
            {draft.notify.enabled && draft.notify.topic !== null && (
              <div className="space-y-3">
                <p
                  className="break-all font-mono text-xs text-neutral-600"
                  data-testid="topic-display"
                >
                  {draft.notify.topic}
                </p>
                <div className="space-y-2 rounded-xl bg-violet-50 p-4">
                  <a
                    href={subscribeUrl ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-violet-600 underline"
                  >
                    {subscribeUrl}
                  </a>
                  <p className="text-sm text-neutral-600">
                    手機安裝 ntfy App 後點連結訂閱即可收到通知
                  </p>
                  <QrImage text={subscribeUrl ?? ''} testid="subscribe-qr" />
                </div>
              </div>
            )}
          </Card>

          {/* Share */}
          <Card icon="🔗" title="產生連結">
            <button
              type="button"
              data-testid="generate-link-btn"
              onClick={() => setLinkRevealed(true)}
              className="rounded-xl bg-violet-600 px-5 py-3 font-bold text-white shadow-md transition hover:bg-violet-700 active:scale-95"
            >
              產生邀請連結
            </button>
            <p className="text-xs text-neutral-500">
              連結會隨著設定自動更新——改完內容直接重新複製就好 📋
            </p>
            {shareUrl !== null && (
              <div className="space-y-3">
                {shareUrl.length > 6000 && (
                  <p
                    data-testid="share-warning"
                    className="rounded-lg bg-yellow-100 px-3 py-2 text-sm font-bold text-yellow-800"
                  >
                    ⚠️ 連結有點長，部分通訊軟體可能無法預覽
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    aria-label="產生的連結"
                    data-testid="share-link-output"
                    value={shareUrl}
                    className={`${INPUT_CLS} font-mono text-xs`}
                  />
                  <button
                    type="button"
                    data-testid="copy-link-btn"
                    onClick={copyLink}
                    className="shrink-0 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-bold hover:bg-neutral-50"
                  >
                    複製連結
                  </button>
                  {typeof navigator.share === 'function' && (
                    <button
                      type="button"
                      onClick={() => void navigator.share({ url: shareUrl })}
                      className="shrink-0 rounded-lg bg-neutral-800 px-3 py-2 text-sm font-bold text-white"
                    >
                      分享
                    </button>
                  )}
                </div>
                <QrImage text={shareUrl} testid="share-qr" />
              </div>
            )}
            <button
              type="button"
              data-testid="reset-btn"
              onClick={() => setShowResetModal(true)}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-50"
            >
              重置所有設定
            </button>
          </Card>
        </form>

        {/* ---------------- preview column ---------------- */}
        <aside className="hidden pt-6 lg:block">
          <div className="sticky top-6">
            <PhoneFrame>
              <InviteView config={draft} rootTestId="preview-invite-root" />
            </PhoneFrame>
          </div>
        </aside>
      </div>

      {/* mobile preview: same draft, below the form */}
      <div className="mt-8 px-4 lg:hidden">
        <PhoneFrame>
          <InviteView config={draft} />
        </PhoneFrame>
      </div>

      {/* reset confirm modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div
            role="dialog"
            aria-modal
            data-testid="reset-modal"
            className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-6 text-center shadow-2xl"
          >
            <p className="text-lg font-bold text-neutral-800">確定要重置所有設定？</p>
            <p className="text-sm text-neutral-500">這動作沒有復原喔 🥲</p>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-bold hover:bg-neutral-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmReset}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600"
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="pb-4 pt-2 text-center text-xs text-neutral-400">
        來約我嘛 build {__APP_VERSION__}
      </footer>
    </main>
  );
}
