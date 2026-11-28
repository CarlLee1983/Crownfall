// PROTOTYPE #107: ?read=none|outline|rim|accent switches the dense-wave readability aid.
export type Read = 'none' | 'outline' | 'rim' | 'accent';

const raw = new URLSearchParams(location.search).get('read');
export const READ: Read = raw === 'outline' || raw === 'rim' || raw === 'accent' ? raw : 'none';

const label = document.createElement('div');
label.textContent = `PROTOTYPE #107 read=${READ}`;
label.style.cssText =
  'position:fixed;left:8px;bottom:32px;z-index:99;padding:2px 6px;font:12px monospace;color:#fff;background:#000a;pointer-events:none';
document.body.append(label);

/** Per-kind glow tint for read=accent; neutral white otherwise. */
export const ACCENT: Readonly<Record<string, number>> = {
  grunt: 0xffd060,
  runner: 0x60ff90,
  tank: 0x60a0ff,
  boss: 0xff60e0,
};
