# Siren Audio Mixer

A Chrome extension that sets the volume and a sound preset separately for each tab, so two audio sources don't drown each other out.

## Problem

Sometimes you need to hear two things in the browser at once, but not equally:

- two Google Meet calls in separate tabs
- a call (Meet, Discord web) plus YouTube or music

Chrome plays every tab at the same loudness. Muting one isn't an option, because you still need to follow it. Two voices at the same level compete, and you can't focus on either.

Volume alone only partly fixes this. It's easier to tell two voices apart when they *sound different*, not just when one is quieter. So Siren Audio Mixer also lets you give each tab a different sound: one stays clear in front, the other sounds like it's coming from across the room.

See [problem.md](problem.md) for the full spec.

## Features

- **Volume per tab**, from 0 to 100%. It works on WebRTC call audio (Meet, Discord web), not just `<video>` players, and keeps working when the page swaps out its audio elements.
- **Sound preset per tab:**

  | Preset | Sounds like | Use for |
  |---|---|---|
  | Normal | Unchanged | Default |
  | Clear | Sharper voice | The call you're focused on |
  | Background | Someone talking across the room | A second call you're half-listening to |
  | Muffled | Through a wall | Music or YouTube behind a call |
  | Radio | Thin, phone-like voice | Making one voice clearly different from the other |

- **Mute per tab.** Unmuting goes back to your previous volume.
- **Lock per tab.** A controlled tab shows a closed lock. Click it to release the tab: audio goes back to the tab and the lock opens. Your volume and preset are remembered, so clicking the open lock takes the tab back with the same settings. A released tab is never re-taken on its own.
- **Tabs add themselves.** The popup lists the tabs that are playing audio right now, in tab order. Opening the popup on a tab that's playing takes control of it straight away, with no extra button. A tab that goes quiet drops off the list and comes back when it plays again.
- **Settings stay with the tab.** Volume and preset belong to the tab, not to the site. Turn YouTube down, then open a different music site in that same tab, and it starts at the same volume and preset without touching the popup.
- **Keeps running with the popup closed.** A tab stays controlled until you close it.

## Usage

1. Play audio in a tab.
2. Click the Siren Audio Mixer icon on that tab. You can now use its slider and preset.
3. Do the same on any other tab you want to control. After that, you can change all of them from the popup on any tab.

## What it can't do

- **It can't take over a tab you haven't clicked the icon on.** This is a Chrome rule. Other tabs playing audio still show up and can be muted, but their volume and preset stay locked until you open that tab and click the icon.
- **It can't share a tab with another audio extension.** Chrome lets only one extension capture a tab at a time. If another extension (Volume Master, a volume booster, a tab recorder) already has a tab, you'll see "Cannot capture a tab with an active stream." Turn that extension off for the tab, or reload the tab, then try again. Using the two extensions on different tabs works fine.
- **Fullscreen stays inside the tab while a tab is controlled.** Chrome confines fullscreen for any tab it is capturing — every site, not only YouTube. Siren Audio Mixer releases a tab as soon as it goes fullscreen, so fullscreen behaves normally. That release is temporary: tabs default to locked, so the next time you open the popup on that tab it is taken back with the same volume and preset. Releasing by hand with the lock button is permanent until you click the lock again. You can also release a tab yourself with its lock button, and take it back the same way. F11 window fullscreen is unaffected.
- **Desktop apps:** it doesn't work on Discord desktop, Spotify or other apps outside Chrome. Use the Windows Volume Mixer for those.
- **Microphone:** it only changes what you hear, never your mic.
- **Volume above 100%:** not available.
- **Custom EQ sliders:** you get five fixed presets, and nothing else.
- **Noise removal or separating voices:** it only uses Chrome's built-in audio effects.
- **Remembering settings:** volume and presets stay with a tab for the whole session, through navigation and through releasing and re-taking it, but reset when the tab closes or Chrome restarts. Nothing is written to disk.
- **Other browsers:** it needs Chrome 116 or newer (or another Chromium browser such as Edge or Brave). Firefox and Safari aren't supported.

## Tech stack

- **[WXT](https://wxt.dev) and TypeScript:** builds the Manifest V3 extension.
- **Popup:** plain TypeScript, with no UI framework.
- **Audio:** the plain Web Audio API (`BiquadFilterNode`, `DynamicsCompressorNode`, `ConvolverNode`, `GainNode`), with no audio libraries.
- **Chrome APIs:** `chrome.tabCapture` and an offscreen document.

```
popup (icon click) ──getMediaStreamId(tabId)──▶ offscreen document
offscreen: tab audio → preset chain → GainNode (volume) → speakers
```

Capturing a tab grabs all of its audio output and silences the original. Siren Audio Mixer then plays that audio back through its own chain of effects. The audio runs in the offscreen document, so it keeps going after the popup closes.

| Path | Role |
|---|---|
| `entrypoints/popup/` | UI: the tab list, sliders and presets. Sends messages only and never touches audio. |
| `entrypoints/offscreen/` | One AudioContext, with a capture → preset → gain chain per tab |
| `entrypoints/background.ts` | Service worker: watches `tabCapture.onStatusChanged` and releases a tab that goes fullscreen |
| `lib/presets.ts` | The node chain for each preset. Tune the numbers here by ear. |
| `lib/messages.ts` | Message types shared by the popup and the offscreen document |

## Develop

```sh
npm install
npm run dev      # opens Chrome with the extension loaded, hot reload
npm run check    # type-check
```

## Install

```sh
npm run build    # outputs .output/chrome-mv3
npm run zip      # outputs .output/rain-siren-<version>-chrome.zip
```

1. Go to `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select `.output/chrome-mv3`. If you're using the zip, unzip it first and select that folder.

## Privacy

Audio is processed on your device only. It is never recorded, stored or sent anywhere. No data is collected, there are no analytics and no network requests. Settings live in memory only. The full policy is on the About page in the popup.

## Copyright

© 2026 Rainoutside
