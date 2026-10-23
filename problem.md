# rain-siren — Problem Statement

## Problem

I often run two audio sources in the browser at the same time and need to hear both, but not equally:

- Two Google Meet calls at once (same account, separate tabs).
- A call (Meet / Discord web) plus YouTube or music.

Today every tab plays at the same loudness. Muting one is not an option because I still need to follow it. Two voices compete and I can't focus on either.

## Scope (v1) — two features only

### 1. Per-tab volume
- List every tab currently producing audio.
- Slider per tab, 0–100% (up to 200% boost is cheap to add).
- Must work on WebRTC call audio (Meet, Discord web), not just YouTube-style `<video>` players.
- Must keep working when the page swaps audio elements (Meet does this when people join/leave).

### 2. Per-tab sound preset
One dropdown per tab. Each preset is a fixed chain of built-in Web Audio nodes — no custom DSP.

| Preset | Feels like | Use for | Node chain |
|---|---|---|---|
| **Normal** | Unchanged | Default | none (bypass) |
| **Clear** | Voice sharper, easier to follow | Foreground call | highpass 100 Hz → peaking +4 dB @ 3 kHz → compressor |
| **Background** | Someone talking across the room | Second call you half-listen to | lowpass 1.5 kHz → light reverb (~20% wet) |
| **Muffled** | Through a wall / next room | Music/YouTube behind a call | lowpass 500 Hz |
| **Radio** | Thin phone/walkie-talkie voice | Makes one voice clearly "different" from the other | bandpass 300–3400 Hz |

Why these work: the brain separates two voices more easily when they *sound different*, not only when one is quieter. Clear vs Background or Clear vs Radio is the intended pairing.

Preset values are starting points — tune by ear.

### Out of scope (v1)
- Native desktop apps (Discord desktop, Spotify). Windows Volume Mixer covers per-app volume.
- Microphone/input processing. Only what I *hear*.
- Custom EQ sliders, saving settings across browser restarts.
- Custom DSP (noise removal, voice separation, AudioWorklet/WASM). Built-in Web Audio nodes only.

## Technical approach

`chrome.tabCapture` + offscreen document (Manifest V3). Capturing a tab grabs its full audio output (including WebRTC) and mutes the original, so we replay it through our own chain:

```
popup (user click) ──getMediaStreamId(tabId)──▶ offscreen document
offscreen: MediaStream → AudioContext
           → preset chain (filters / compressor / reverb)
           → GainNode (volume)
           → destination
```

- Permissions: `tabCapture`, `offscreen`, `tabs`.
- Capture must start from a user gesture (clicking the popup) — Chrome rule.
- Reverb: `ConvolverNode` with a short generated impulse (decaying noise), no audio file needed.

Rejected: setting `el.volume` on media elements via `chrome.scripting` — misses WebRTC audio, resets when elements are replaced, can't do effects.

Requires Chrome 116+ (first version allowing `tabCapture` from the service worker and consuming the stream id in an offscreen document). Reference: Chrome's official "Tab Capture - Recorder" sample.

## Stack & structure

**Framework: [WXT](https://wxt.dev) + TypeScript, vanilla popup.**

- WXT is the current default for MV3 extensions: Vite-based, file-based entrypoints, generates `manifest.json`, hot reload, `wxt zip` for the ZIP install. Plasmo is semi-maintained (Parcel); CRXJS is only a Vite plugin, so you write the conventions yourself.
- Vanilla TS popup, no React: the UI is one list of sliders + dropdowns. React would be more code than the feature. Switch to WXT's React template only if the UI grows.
- Plain Web Audio API for audio. No audio libraries.

```
rain-siren/
├── entrypoints/
│   ├── popup/
│   │   ├── index.html
│   │   ├── main.ts          # list audible tabs, attach (stream id + offscreen doc), slider + preset per tab
│   │   └── style.css
│   └── offscreen/
│       ├── index.html
│       └── main.ts          # one AudioContext; per tab: capture → preset chain → gain → out
├── lib/
│   ├── presets.ts           # preset name → node chain builder (the table above)
│   └── messages.ts          # typed message shapes popup ↔ background ↔ offscreen
├── public/icon/             # 16/32/48/128 png
├── wxt.config.ts            # manifest: permissions tabCapture, offscreen, tabs
├── package.json
└── problem.md
```

Rules:
- No background service worker: the popup gets the stream id and creates the offscreen doc itself. Add one only if something must run with the popup closed.
- Audio graph + per-tab settings live in the offscreen document (survives popup closing).
- Popup never touches audio — sends `attach` / `detach` / `set` / `list` messages only.
- Chrome only lets `tabCapture` grab a tab where the extension icon was clicked. So: open popup on a tab → "Control this tab" once; after that it's controllable from any tab. Other audible tabs get a "Go to tab" button.
- A captured tab plays only through rain-siren. "Release" hands audio back to the tab.
- Build popup DOM with `textContent`, never `innerHTML` with tab titles.
- Release: `wxt zip` → `.output/*.zip` → unzip → `chrome://extensions` → Developer mode → Load unpacked.

## Zero-code fallback

Volume only, two sources: run them in two different browsers (Chrome + Edge) and use the Windows Volume Mixer. Existing extensions ("Volume Master") do per-tab volume. rain-siren is worth building for the presets.
