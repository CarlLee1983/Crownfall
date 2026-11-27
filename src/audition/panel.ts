import type { Candidate } from './types';
import './panel.css';

const sections = [
  {
    title: '背景音樂',
    music: true,
    tracks: [
      ['prep', '備戰'],
      ['wave', '一般波次'],
      ['boss', '巫妖波次'],
    ],
  },
  {
    title: '戰鬥與波次音效',
    tracks: [
      ['archer', '弓箭塔發射'],
      ['archerHit', '弓箭塔命中'],
      ['ballista', '弩砲塔發射'],
      ['ballistaHit', '弩砲塔命中'],
      ['mage', '法師塔攻擊'],
      ['killed', '擊殺'],
      ['lich', '巫妖倒下'],
      ['leaked', '漏怪'],
      ['startWave', '開波'],
      ['waveCleared', '清波'],
      ['victory', '勝利'],
      ['defeat', '落敗'],
    ],
  },
  {
    title: '介面音效',
    tracks: [
      ['placeTower', '建塔'],
      ['upgradeTower', '升級'],
      ['sellTower', '賣出'],
      ['rejected', '操作無法執行'],
    ],
  },
] as const;

const busLabels = {
  master: '總音量',
  music: '背景音樂',
  effects: '戰鬥與波次',
  ui: '介面音效',
};
type Bus = keyof typeof busLabels;

function element<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className: string,
  text?: string,
): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text: string, action: () => void, label = text): HTMLButtonElement {
  const node = element('button', 'audition-button', text);
  node.type = 'button';
  if (label !== text) node.setAttribute('aria-label', label);
  node.addEventListener('click', action);
  return node;
}

function slider(
  id: string,
  name: string,
  initial: number,
  max: number,
  unit: string,
  change: (value: number) => void,
): HTMLDivElement {
  const row = element('div', 'audition-slider');
  const label = element('label', '', name);
  const input = element('input', '');
  const value = element('span', 'audition-slider-value');
  label.htmlFor = input.id = `audition-${id}`;
  input.type = 'range';
  input.min = '0';
  input.max = String(max);
  input.value = String(initial);
  value.setAttribute('aria-hidden', 'true');
  const showValue = () => {
    value.textContent = `${input.value}${unit}`;
    input.setAttribute('aria-valuetext', value.textContent);
  };
  showValue();
  input.addEventListener('input', () => {
    showValue();
    change(input.valueAsNumber);
  });
  row.append(label, input, value);
  return row;
}

export function createPanel(
  groups: Record<string, Candidate[]>,
  onChange: (key: string) => void,
  onPreview: (key: string, nearEnd: boolean) => void,
  onVolume: (bus: Bus, n: number) => void,
  onDuck: (db: number) => void,
): { selected: (key: string) => Candidate; status: (text: string) => void } {
  const panel = element('details', 'audition-panel');
  panel.open = true;
  const summary = element('summary', 'audition-summary');
  summary.append(
    element('span', 'audition-open-label', '音訊試聽 · 收合'),
    element('span', 'audition-closed-label', '展開音訊試聽'),
  );

  const body = element('div', 'audition-body');
  const toolbar = element('div', 'audition-toolbar');
  const message = element('p', 'audition-status');
  message.setAttribute('role', 'status');
  const status = (text: string) => {
    message.textContent = text;
  };

  const choices = new Map<string, Candidate>();
  const selected = (key: string) => {
    const candidate = choices.get(key);
    if (!candidate) throw new Error(`找不到音訊候選：${key}`);
    return candidate;
  };
  const mix = { master: 1, music: 1, effects: 1, ui: 1, duckDb: 12, muted: false };

  const resume = button('恢復遊戲配樂', () => {
    status('已恢復遊戲配樂。');
    onPreview('resume', false);
  });
  const mute = button('靜音', () => {
    mix.muted = !mix.muted;
    mute.setAttribute('aria-pressed', String(mix.muted));
    onVolume('master', mix.muted ? 0 : mix.master);
  });
  mute.setAttribute('aria-pressed', 'false');
  const exportMix = button('匯出 JSON', () => {
    const manifest = { selected: Object.fromEntries(choices), mix };
    const file = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'crownfall-audio-audition.json';
    body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('已匯出音訊選擇與混音設定。');
  });
  toolbar.append(resume, mute, exportMix);
  body.append(toolbar, message);

  const mixer = element('details', 'audition-section');
  const levels = element('div', 'audition-levels');
  for (const bus of Object.keys(busLabels) as Bus[]) {
    levels.append(
      slider(bus, busLabels[bus], 100, 100, '%', (value) => {
        mix[bus] = value / 100;
        if (bus !== 'master' || !mix.muted) onVolume(bus, mix[bus]);
      }),
    );
  }
  levels.append(
    slider('duck', '事件壓低配樂', mix.duckDb, 24, ' dB', (value) => {
      mix.duckDb = value;
      onDuck(value);
    }),
  );
  mixer.append(element('summary', '', '混音'), levels);
  body.append(mixer);

  for (const section of sections) {
    const isMusic = 'music' in section;
    const disclosure = element('details', 'audition-section');
    disclosure.open = isMusic;
    disclosure.append(element('summary', '', section.title));

    for (const [key, name] of section.tracks) {
      const candidates = groups[key];
      if (!candidates?.[0]) throw new Error(`缺少音訊候選：${key}`);
      choices.set(key, candidates[0]);

      const row = element('div', 'audition-track');
      const label = element('label', 'audition-track-label', name);
      const select = element('select', 'audition-select');
      select.id = label.htmlFor = `audition-track-${key}`;
      for (const [index, candidate] of candidates.entries()) {
        const option = element('option', '', candidate.label);
        option.value = String(index);
        select.add(option);
      }

      const controls = element('div', 'audition-track-controls');
      const preview = (nearEnd: boolean) => {
        status(`試聽${nearEnd ? '循環接點' : ''} · ${name} · ${selected(key).label}`);
        onPreview(key, nearEnd);
      };
      controls.append(
        select,
        button('試聽', () => preview(false), `試聽 ${name}`),
      );
      if (isMusic) {
        controls.append(button('循環接點', () => preview(true), `試聽循環接點 ${name}`));
      }

      const attribution = element('div', 'audition-attribution');
      const source = element('a', '', '來源');
      source.target = '_blank';
      source.rel = 'noopener';
      source.setAttribute('aria-label', `${name}素材來源（另開分頁）`);
      const license = element('a', '');
      license.target = '_blank';
      license.rel = 'noopener';
      const updateAttribution = () => {
        const candidate = selected(key);
        source.href = candidate.source;
        const licenseUrl = /^https?:\/\//i.test(candidate.license);
        if (licenseUrl) {
          license.href = candidate.license;
          license.textContent = candidate.license.includes('/publicdomain/zero/') ? 'CC0' : '授權';
          license.setAttribute('aria-label', `${license.textContent} · ${name}素材（另開分頁）`);
        } else {
          license.removeAttribute('href');
          license.removeAttribute('aria-label');
          license.textContent = candidate.license;
        }
      };
      updateAttribution();
      select.addEventListener('change', () => {
        const candidate = candidates[select.selectedIndex];
        if (!candidate) return;
        choices.set(key, candidate);
        updateAttribution();
        status(`已套用 · ${name} · ${candidate.label}`);
        onChange(key);
      });
      attribution.append(source, license);
      row.append(label, controls, attribution);
      disclosure.append(row);
    }
    body.append(disclosure);
  }

  panel.append(summary, body);
  panel.addEventListener('keydown', (event) => {
    if (panel.open && event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      panel.open = false;
      summary.focus();
    }
    if (panel.open || event.key === ' ' || event.key === 'Escape') event.stopPropagation();
  });
  panel.addEventListener('wheel', (event) => event.stopPropagation());
  panel.addEventListener('click', (event) => event.stopPropagation());
  document.body.append(panel);
  return { selected, status };
}
