import type { Message } from '@/lib/messages';

export default defineBackground(() => {

  browser.tabCapture.onStatusChanged.addListener((info) => {
    console.debug('[siren] capture status', info.tabId, info.status, 'fullscreen', info.fullscreen);
    if (info.status !== 'active' || !info.fullscreen) return;
    browser.runtime
      .sendMessage({ type: 'detach', tabId: info.tabId, auto: true } satisfies Message)
      .catch(() => {}); // no offscreen document: nothing to release
  });
});
