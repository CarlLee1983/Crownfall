import { execFileSync, spawnSync } from 'node:child_process';
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alertClips } from './alerts-audio';
import { combatClips } from './combat-audio';
import { musicClips } from './music-clips';

export interface Clip {
  readonly name: string;
  readonly download: string;
  readonly rawFile?: string;
  readonly archiveMember?: string;
  readonly edit?: string;
  readonly gainDb?: number;
  readonly minimumSourceSeconds?: number;
}

// War Horns by Eldritch Grim (CC0), https://opengameart.org/node/153572
const clips: readonly Clip[] = [
  {
    name: 'war-horns',
    download: 'https://opengameart.org/sites/default/files/war_horns.wav',
    edit: 'atrim=start=0.2:end=4.7,asetpts=PTS-STARTPTS,afade=t=out:st=3.8:d=0.7',
  },
  ...combatClips,
  ...alertClips,
  ...musicClips,
];

const targetLufs = -21;
const peakHeadroom = -2;
const maximumTruePeak = -1;
const outputDir = fileURLToPath(new URL('../src/audio/clips/', import.meta.url));

function run(command: string, args: string[], stdout: 'pipe' | number = 'pipe'): string {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', stdout, 'pipe'] });
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

const curlDownload = ['--fail', '--silent', '--show-error', '--location', '--max-time', '120'];

function downloadSource(source: URL, output: string): void {
  const headers: string[] = [];
  let url = source.href;
  if (source.origin === 'https://kenney.nl' && source.pathname.startsWith('/assets/')) {
    // Kenney's public asset pages issue a short-lived link for each download.
    const pack = Buffer.from(source.pathname.slice(1)).toString('hex');
    headers.push('--user-agent', 'Mozilla/5.0', '--referer', source.href);
    const response = execFileSync(
      'curl',
      [...curlDownload, ...headers, `https://kenney.nl/download-link/${pack}`],
      { encoding: 'utf8' },
    );
    const signed = new URL(JSON.parse(response).url);
    if (signed.origin !== source.origin) throw new Error('Unexpected Kenney download origin');
    url = signed.href;
  }
  run('curl', [...curlDownload, ...headers, '--output', output, url]);
}

function sourceFor(clip: Clip, workspace: string): string {
  const source = new URL(clip.download);
  const downloadName = basename(source.pathname);
  const rawName = clip.rawFile ?? basename(clip.archiveMember ?? downloadName);
  const rawDirectory = process.env.CROWNFALL_AUDIO_SOURCES;
  const localSource = rawDirectory === undefined ? undefined : join(rawDirectory, rawName);
  if (localSource !== undefined && existsSync(localSource)) return localSource;

  const downloaded = join(workspace, downloadName);
  try {
    if (!existsSync(downloaded)) downloadSource(source, downloaded);
    if (clip.archiveMember === undefined) return downloaded;

    const extracted = join(workspace, rawName);
    const output = openSync(extracted, 'w');
    try {
      if (downloadName.endsWith('.7z')) {
        run('bsdtar', ['-xOf', downloaded, clip.archiveMember], output);
      } else {
        run('unzip', ['-p', downloaded, clip.archiveMember], output);
      }
    } finally {
      closeSync(output);
    }
    return extracted;
  } catch (error) {
    throw new Error(
      `Could not get ${rawName} from ${clip.download}. Extract "${clip.archiveMember ?? rawName}" into CROWNFALL_AUDIO_SOURCES and rerun.`,
      { cause: error },
    );
  }
}

function buildClip(clip: Clip, workspace: string): void {
  const { name, edit = '', gainDb = 0, minimumSourceSeconds } = clip;
  const output = join(outputDir, `${name}.opus`);
  mkdirSync(dirname(output), { recursive: true });
  const source = sourceFor(clip, workspace);
  if (minimumSourceSeconds !== undefined) {
    const durationProbe = spawnSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', source],
      { encoding: 'utf8' },
    );
    if (durationProbe.error !== undefined) throw durationProbe.error;
    if (durationProbe.status !== 0) throw new Error(durationProbe.stderr);
    if (!(Number(durationProbe.stdout.trim()) >= minimumSourceSeconds)) {
      throw new Error(`${name} source is shorter than ${minimumSourceSeconds} seconds`);
    }
  }
  const { lufs, truePeak } = measure(source, edit);
  const gain = Math.min(targetLufs - lufs, peakHeadroom - truePeak) + gainDb;
  const prepared = join(workspace, `${name}.opus`);
  ffmpeg(source, [
    '-af',
    `${edit ? `${edit},` : ''}volume=${gain}dB`,
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
}

const workspace = mkdtempSync(join(tmpdir(), 'crownfall-audio-'));
try {
  for (const clip of clips) buildClip(clip, workspace);
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
