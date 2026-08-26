import type { InviteConfig, ThemeConfig } from './types';

export interface ThemePreset {
  id: string;
  name: string;
  bg: string;
  accent: string;
  textColor: string;
}

/** Built-in palettes shown as swatch cards in the editor (T7). */
export const THEME_PRESETS: ThemePreset[] = [
  { id: 'grape', name: '葡萄紫', bg: '#faf5ff', accent: '#7c3aed', textColor: '#3b0764' },
  { id: 'peach', name: '蜜桃粉', bg: '#fff1f2', accent: '#f43f5e', textColor: '#881337' },
  { id: 'ocean', name: '海洋藍', bg: '#eff6ff', accent: '#3b82f6', textColor: '#1e3a8a' },
  { id: 'forest', name: '森林綠', bg: '#f0fdf4', accent: '#22c55e', textColor: '#14532d' },
  { id: 'sunset', name: '落日橘', bg: '#fff7ed', accent: '#f97316', textColor: '#7c2d12' },
];

export function presetById(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.id === id);
}

/**
 * The default invite everyone starts from. Doubles as the codec roundtrip fixture.
 * All copy is zh-TW with a playful tone.
 */
export const DEFAULT_CONFIG: InviteConfig = {
  v: 2,
  theme: {
    presetId: 'grape',
    bg: '#faf5ff',
    accent: '#7c3aed',
    textColor: '#3b0764',
    fontScale: 1,
    emojiDecor: ['🥺', '🙏', '✨', '💫'],
  },
  intro: {
    title: '有一件事想跟你說',
    subtitle: '看完請務必認真回答，這對我很重要 🙏',
    cta: '好，我看了',
  },
  question: {
    text: '週末要不要一起出門玩？',
    agreeLabel: '同意 🥰',
    disagreeLabel: '不同意 😢',
  },
  gag: {
    modes: ['dodge', 'fakeErrors', 'fakeLoad', 'shrink', 'confirmLoop'],
    dodge: { times: 3 },
    errors: {
      messages: [
        '系統繁忙中，請稍後再試',
        '操作過於頻繁，你的手指還好嗎？',
        '偵測到真心，暫時無法同意',
        '伺服器表示：我也很想，但不准',
      ],
    },
    fakeLoad: {
      delayMs: 2200,
      failText: '提交失敗（工程師正在裝忙），請重試',
    },
    shrink: { minScale: 0.35 },
    confirmLoop: {
      prompts: ['你確定嗎？', '真的要同意？', '再想一下？', '確定不是手滑？'],
    },
    milestones: {
      everyN: 5,
      messages: ['毅力可嘉，但還是不行 💪', '你已經成為傳說了，可惜還是不能同意'],
    },
  },
  success: {
    title: '🎉 耶！約成功了！',
    text: '那就說定了，不見不散喔！',
    emoji: '🎉',
  },
  notify: {
    enabled: true,
    topic: null,
  },
};

// ThemePreset re-export guard: keep import surface minimal for delegates.
export type { InviteConfig, ThemeConfig };
