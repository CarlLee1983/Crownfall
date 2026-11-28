// PROTOTYPE #105: ?fx=now|hit|death|crumble switches the enemy hit/death presentation.
export type Fx = 'now' | 'hit' | 'death' | 'crumble';

const raw = new URLSearchParams(location.search).get('fx');
export const FX: Fx = raw === 'hit' || raw === 'death' || raw === 'crumble' ? raw : 'now';
export const DYING = FX === 'death' || FX === 'crumble';
/** Length of the death clip as played, in ms. */
export const DEATH_CLIP_MS = FX === 'crumble' ? 1000 : 800;
export const SINK_MS = 300;

const label = document.createElement('div');
label.textContent = `PROTOTYPE #105 fx=${FX}`;
label.style.cssText =
  'position:fixed;left:8px;bottom:8px;z-index:99;padding:2px 6px;font:12px monospace;color:#fff;background:#000a;pointer-events:none';
document.body.append(label);
