export const PRESETS = ['normal', 'clear', 'background', 'muffled', 'radio'] as const;
export type Preset = (typeof PRESETS)[number];

export interface TabState {
  tabId: number;
  volume: number; // 0..1
  preset: Preset;
  muted: boolean;
}

// popup → offscreen
export type Message =
  | { type: 'attach'; tabId: number; streamId: string }
  | { type: 'set'; tabId: number; volume?: number; preset?: Preset; muted?: boolean }
  | { type: 'list' };

export type AttachResult = { ok: true } | { error: string };
