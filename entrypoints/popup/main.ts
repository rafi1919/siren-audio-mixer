import { PRESETS, type AttachResult, type Message, type TabState } from '@/lib/messages';
import type { Browser } from 'wxt/browser';

const list = document.getElementById('tabs')!;
const count = document.getElementById('count')!;
const errorEl = document.getElementById('error')!;

const send = <T = void>(msg: Message) => browser.runtime.sendMessage(msg) as Promise<T>;

async function hasOffscreen() {
  const contexts = await browser.runtime.getContexts({
    contextTypes: [browser.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  return contexts.length > 0;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  await browser.offscreen.createDocument({
    url: browser.runtime.getURL('/offscreen.html'),
    reasons: [browser.offscreen.Reason.USER_MEDIA],
    justification: 'Play captured tab audio through volume and effect nodes',
  });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: object = {}): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props);
}

function showError(e: unknown) {
  errorEl.textContent = String(e instanceof Error ? e.message : e);
  errorEl.hidden = false;
}

async function attach(tabId: number) {
  await ensureOffscreen();
  const streamId = await browser.tabCapture.getMediaStreamId({ targetTabId: tabId });
  const res = await send<AttachResult>({ type: 'attach', tabId, streamId });
  if ('error' in res) throw new Error(res.error);
}

// static icons, no user data
const MUTE_ICONS =
  '<svg class="w" viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>' +
  '<svg class="x" viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>';
const LOCK_ICON =
  '<svg viewBox="0 0 24 24"><rect x="4" y="10.5" width="16" height="10.5" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>';
const UNLOCK_ICON =
  '<svg viewBox="0 0 24 24"><rect x="4" y="10.5" width="16" height="10.5" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 7.5-1.3"/></svg>';

const label = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

function host(url?: string) {
  try {
    return new URL(url!).hostname;
  } catch {
    return '';
  }
}

const seen = new Set<number>(); // rows already shown: animate only new ones

type Tab = Browser.tabs.Tab;

function row(tab: Tab, state: TabState | undefined, isActive: boolean) {
  const tabId = tab.id!;
  const locked = !!state?.locked; // locked = we hold the capture; released keeps its settings for next time
  const card = el('div', { className: 'row' });
  if (!seen.has(tabId)) card.classList.add('new');
  seen.add(tabId);
  if (!tab.audible) card.classList.add('silent');

  const fav = el('div', { className: 'fav', textContent: (tab.title ?? '?')[0] });
  if (tab.favIconUrl) {
    const img = el('img', { src: tab.favIconUrl, alt: '' });
    img.addEventListener('load', () => fav.replaceChildren(img));
  }

  const title = el('div', { className: 'title', title: tab.title ?? '' });
  const sub = el('small');
  if (isActive) sub.append(el('em', { textContent: 'This tab · ' }));
  sub.append(
    locked
      ? host(tab.url)
      : state
        ? isActive
          ? 'Released · click the lock to take it back'
          : 'Released · open this tab to take it back'
        : 'Click to open, then click Siren Audio Mixer for volume/effects',
  );
  title.append(el('b', { textContent: tab.title ?? tab.url ?? 'Untitled' }), sub);

  const eq = el('div', { className: 'eq' });
  eq.append(el('u'), el('u'), el('u'));

  const preset = el('select', { ariaLabel: 'Sound preset', disabled: !locked });
  for (const p of PRESETS) preset.append(el('option', { value: p, textContent: label(p), selected: p === state?.preset }));

  const mute = el('button', { className: 'mbtn', ariaLabel: 'Mute', innerHTML: MUTE_ICONS });
  // Chrome keeps fullscreen inside a captured tab, so unlocking is the only way back to normal fullscreen.
  const lock = el('button', {
    className: locked ? 'mbtn lbtn' : 'mbtn lbtn open',
    ariaLabel: locked ? 'Release tab' : 'Take control of tab',
    title: locked
      ? 'Locked: this tab plays through Siren Audio Mixer. Click to release it, fullscreen works again.'
      : isActive
        ? 'Unlocked: click to take control of this tab'
        : 'Unlocked: open this tab, then click the lock to take control',
    innerHTML: locked ? LOCK_ICON : UNLOCK_ICON,
    disabled: !locked && !isActive, // Chrome only captures the tab whose icon was clicked
  });
  const slider = el('input', { type: 'range', min: '0', max: '100', ariaLabel: 'Volume', disabled: !locked });
  const pct = el('span', { className: 'pct' });

  let volume = Math.round((state?.volume ?? 1) * 100);
  let muted = locked ? state!.muted : !!tab.mutedInfo?.muted;
  const paint = () => {
    slider.value = String(volume);
    slider.style.setProperty('--v', `${volume}%`);
    pct.textContent = `${volume}%`;
    card.classList.toggle('muted', muted);
  };
  paint();

  if (state) {
    slider.addEventListener('input', () => {
      volume = Number(slider.value);
      muted = false; // dragging the slider unmutes
      send({ type: 'set', tabId, volume: volume / 100, muted });
      paint();
    });
    preset.addEventListener('change', () => send({ type: 'set', tabId, preset: preset.value as TabState['preset'] }));
    mute.addEventListener('click', () => {
      muted = !muted;
      send({ type: 'set', tabId, muted });
      paint();
    });
    lock.addEventListener('click', async () => {
      await send({ type: 'detach', tabId });
      await render();
    });
  } else {
    // Chrome only allows capturing a tab where the extension icon was clicked: native mute here, full control there.
    mute.addEventListener('click', (e) => {
      e.stopPropagation();
      muted = !muted;
      browser.tabs.update(tabId, { muted });
      paint();
    });
    lock.addEventListener('click', async (e) => {
      e.stopPropagation();
      await attach(tabId).catch(showError);
      await render();
    });
    if (!isActive) {
      card.classList.add('remote');
      card.addEventListener('click', async () => {
        await browser.tabs.update(tabId, { active: true });
        await browser.windows.update(tab.windowId, { focused: true });
        window.close();
      });
    }
  }

  const ctrl1 = el('div', { className: 'ctrl' });
  ctrl1.append(preset, lock);
  const ctrl2 = el('div', { className: 'ctrl' });
  ctrl2.append(mute, slider, pct);
  card.append(fav, title, eq, ctrl1, ctrl2);
  return card;
}

function empty() {
  const box = el('div', { className: 'empty' });
  box.append(
    el('div', { className: 'orb' }),
    el('b', { textContent: 'Quiet on the water' }),
    el('small', { textContent: 'No tabs are playing audio. Play something and it will appear here.' }),
  );
  return box;
}

async function render() {
  const [active] = await browser.tabs.query({ active: true, currentWindow: true });
  const states = (await hasOffscreen()) ? await send<TabState[]>({ type: 'list' }) : [];
  const attached = new Map(states.map((s) => [s.tabId, s]));
  const tabs = (await browser.tabs.query({})).filter((t) => t.id !== undefined && (attached.has(t.id) || t.audible));

  list.replaceChildren(...(tabs.length ? tabs.map((t) => row(t, attached.get(t.id!), t.id === active?.id)) : [empty()]));
  count.textContent = `${tabs.length} ${tabs.length === 1 ? 'tab' : 'tabs'}`;
}

async function init() {
  // Opening the popup on an audible tab takes control of it, no button needed.
  const [active] = await browser.tabs.query({ active: true, currentWindow: true });
  if (active?.id !== undefined && active.audible) {
    const states = (await hasOffscreen()) ? await send<TabState[]>({ type: 'list' }) : [];
    if (!states.some((s) => s.tabId === active.id)) await attach(active.id).catch(showError);
  }
  await render();
}

browser.tabs.onUpdated.addListener((_id, change) => {
  if ('audible' in change || 'mutedInfo' in change || 'title' in change || 'favIconUrl' in change) render().catch(showError);
});
browser.tabs.onRemoved.addListener(() => render().catch(showError));

// About page swaps in place of the tab list
const main = document.getElementById('main')!;
const about = document.getElementById('about')!;
const aboutBtn = document.getElementById('aboutBtn')!;
aboutBtn.addEventListener('click', () => {
  main.hidden = !main.hidden;
  about.hidden = !main.hidden;
  aboutBtn.textContent = main.hidden ? 'Back' : 'About';
});

init().catch(showError);
