// Holds the audio: one AudioContext, per tab: capture → preset chain → gain → speakers.
import { buildChain, type Chain } from '@/lib/presets';
import type { AttachResult, Message, Preset, TabState } from '@/lib/messages';

interface Settings {
  volume: number;
  preset: Preset;
  muted: boolean;
}

interface Tab extends Settings {
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  chain: Chain;
  gain: GainNode;
}

const ctx = new AudioContext({ latencyHint: 'interactive' });
const tabs = new Map<number, Tab>();
// Outlives detach, so a released tab keeps its slider and preset.
// manual: the user clicked the lock, so stay released until they click it again. An automatic
// release (fullscreen) is temporary — the popup takes the tab back, since tabs default to locked.
const saved = new Map<number, Settings & { manual: boolean }>();

async function attach(tabId: number, streamId: string) {
  if (tabs.has(tabId)) return;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
  } as MediaStreamConstraints);
  await ctx.resume();
  const { volume, preset, muted } = saved.get(tabId) ?? { volume: 1, preset: 'normal' as Preset, muted: false };
  saved.delete(tabId);
  const source = ctx.createMediaStreamSource(stream);
  const gain = new GainNode(ctx, { gain: muted ? 0 : volume });
  const chain = buildChain(ctx, preset);
  source.connect(chain.input);
  chain.output.connect(gain).connect(ctx.destination);
  tabs.set(tabId, { stream, source, chain, gain, volume, preset, muted });
  // tab closed or Chrome stopped the capture
  stream.getAudioTracks()[0]?.addEventListener('ended', () => detach(tabId, true));
}

// Settings stay with the tab for the session: they are kept here through navigation, and only
// a closed tab or a Chrome restart drops them.
function detach(tabId: number, auto = false) {
  const t = tabs.get(tabId);
  if (!t) return;
  saved.set(tabId, { volume: t.volume, preset: t.preset, muted: t.muted, manual: !auto });
  t.stream.getTracks().forEach((track) => track.stop());
  t.source.disconnect();
  t.chain.output.disconnect();
  t.gain.disconnect();
  tabs.delete(tabId);
}

function set(tabId: number, volume?: number, preset?: Preset, muted?: boolean) {
  const t = tabs.get(tabId);
  if (!t) return;
  if (volume !== undefined) t.volume = volume;
  if (muted !== undefined) t.muted = muted;
  if (volume !== undefined || muted !== undefined) {
    // muted keeps t.volume, so unmute restores the slider value
    t.gain.gain.setTargetAtTime(t.muted ? 0 : t.volume, ctx.currentTime, 0.02); // smooth, no clicks
  }
  if (preset && preset !== t.preset) {
    t.source.disconnect();
    t.chain.output.disconnect();
    t.chain = buildChain(ctx, preset);
    t.preset = preset;
    t.source.connect(t.chain.input);
    t.chain.output.connect(t.gain);
  }
}

browser.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  switch (msg.type) {
    case 'attach':
      attach(msg.tabId, msg.streamId).then(
        () => sendResponse({ ok: true } satisfies AttachResult),
        (e) => sendResponse({ error: String(e) } satisfies AttachResult),
      );
      return true; // async response
    case 'detach':
      detach(msg.tabId, msg.auto);
      break;
    case 'set':
      set(msg.tabId, msg.volume, msg.preset, msg.muted);
      break;
    case 'list':
      sendResponse([
        ...[...tabs].map(
          ([tabId, t]): TabState => ({
            tabId,
            volume: t.volume,
            preset: t.preset,
            muted: t.muted,
            locked: true,
          }),
        ),
        ...[...saved]
          .filter(([, s]) => s.manual)
          .map(([tabId, { manual: _, ...s }]): TabState => ({ tabId, locked: false, ...s })),
      ]);
      break;
  }
});
