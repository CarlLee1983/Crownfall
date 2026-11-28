import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// War Horns by Eldritch Grim (CC0), https://opengameart.org/node/153572
const clips = [
  {
    name: 'war-horns',
    download: 'https://opengameart.org/sites/default/files/war_horns.wav',
    edit: 'atrim=start=0.2:end=4.7,asetpts=PTS-STARTPTS,afade=t=out:st=3.8:d=0.7',
  },
];

const targetLufs = -21;
const peakHeadroom = -2;
const maximumTruePeak = -1;
const outputDir = fileURLToPath(new URL('../src/audio/clips/', import.meta.url));

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stderr;
}

function ffmpeg(input: string, args: string[]): string {
  return run('ffmpeg', ['-hide_banner', '-nostats', '-y', '-i', input, ...args]);
}

function measure(input: string, edit = ''): { lufs: number; truePeak: number } {
  const report = ffmpeg(input, [
    '-af',
    `${edit ? `${edit},` : ''}apad=pad_dur=0.4,loudnorm=I=${targetLufs}:TP=${peakHeadroom}:LRA=7:print_format=json`,
    '-f',
    'null',
    '-',
  ]);
  const json = report.match(/\{[^}]+\}/)?.[0];
  if (json === undefined) throw new Error(`FFmpeg did not report loudness for ${input}`);
  const values = JSON.parse(json);
  const lufs = Number(values.input_i);
  const truePeak = Number(values.input_tp);
  if (!Number.isFinite(lufs) || !Number.isFinite(truePeak)) {
    throw new Error(`Could not measure finite loudness and true peak for ${input}`);
  }
  return { lufs, truePeak };
}

function buildClip({ name, download, edit }: (typeof clips)[number]): void {
  const workspace = mkdtempSync(join(tmpdir(), 'crownfall-audio-'));
  const output = join(outputDir, `${name}.opus`);
  mkdirSync(dirname(output), { recursive: true });
  try {
    const source = join(workspace, 'source.wav');
    run('curl', [
      '--fail',
      '--silent',
      '--show-error',
      '--location',
      '--max-time',
      '120',
      '--output',
      source,
      download,
    ]);

    const { lufs, truePeak } = measure(source, edit);
    const gain = Math.min(targetLufs - lufs, peakHeadroom - truePeak);
    const prepared = join(workspace, `${name}.opus`);
    ffmpeg(source, [
      '-af',
      `${edit},volume=${gain}dB`,
      '-ar',
      '48000',
      '-c:a',
      'libopus',
      '-b:a',
      '96k',
      '-map_metadata',
      '-1',
      '-fflags',
      '+bitexact',
      prepared,
    ]);

    const decoded = measure(prepared);
    if (decoded.truePeak > maximumTruePeak) {
      throw new Error(`${name} exceeded ${maximumTruePeak} dBTP after encoding`);
    }
    copyFileSync(prepared, output);
    console.log(`${name}: ${decoded.lufs} LUFS, ${decoded.truePeak} dBTP`);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

for (const clip of clips) buildClip(clip);
