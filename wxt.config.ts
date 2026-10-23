import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Siren Audio Mixer',
    description: 'Per-tab volume and sound presets.',
    // activeTab: clicking the icon grants tabCapture for that tab
    permissions: ['tabCapture', 'offscreen', 'tabs', 'activeTab'],
    minimum_chrome_version: '116',
  },
});
