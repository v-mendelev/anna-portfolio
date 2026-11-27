#!/usr/bin/env node
/**
 * Builds web media from Anna's originals (media-src/, git-ignored) into
 * public/media/<key>/ — or any folder given as the first argument, e.g. a
 * staging folder for an S3 upload:
 *
 *   video.mp4    H.264 High + AAC, +faststart, 720 px on the short side
 *                (vertical 720×1280, horizontal ≤1280×720), capped bitrate
 *   poster.webp  the hand-picked frame, same size as the video
 *   hero: still.avif + still.webp (16:9, 1600 px wide)
 *   about: portrait.avif + portrait.webp (original ratio, 900 px wide)
 *
 * Needs ffmpeg: on PATH, or its path in the FFMPEG environment variable.
 * Usage: pnpm media:build [out-dir] [--stills]   (see docs/MEDIA.md)
 *   --stills  rebuild only the still images (hero, portrait), not the videos
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { hero, portrait, showreel, work } from './media-manifest.mjs';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const SRC = 'media-src';
const args = process.argv.slice(2);
const stillsOnly = args.includes('--stills');
const OUT = args.find((a) => !a.startsWith('--')) || 'public/media';

function ffmpeg(ffArgs) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-v', 'error', '-y', ...ffArgs], {
    stdio: 'inherit',
  });
  if (r.error || r.status !== 0) {
    throw new Error(`ffmpeg failed (${r.error?.message ?? `exit ${r.status}`})`);
  }
}

function source(path) {
  const full = join(SRC, path);
  if (!existsSync(full)) throw new Error(`Missing original: ${full} (see docs/MEDIA.md)`);
  return full;
}

// Fit inside 720 px on the short side, never upscale, even dimensions.
const SCALE =
  "scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)':flags=lanczos,format=yuv420p";

function video(item) {
  const dir = join(OUT, item.key);
  mkdirSync(dir, { recursive: true });
  const input = source(item.source);
  ffmpeg([
    ...['-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-vf', SCALE],
    ...['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '27'],
    ...['-maxrate', '1400k', '-bufsize', '2800k', '-fpsmax', '30'],
    ...['-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-movflags', '+faststart'],
    join(dir, 'video.mp4'),
  ]);
  ffmpeg([
    ...['-ss', String(item.poster), '-i', input, '-frames:v', '1', '-vf', SCALE],
    ...['-c:v', 'libwebp', '-quality', '78'],
    join(dir, 'poster.webp'),
  ]);
}

/** One still as AVIF + WebP: `seek` is the second for a video source, else omitted. */
function image(input, vf, base, seek) {
  const at = seek === undefined ? [] : ['-ss', String(seek)];
  ffmpeg([
    ...at,
    ...['-i', input, '-frames:v', '1', '-vf', `${vf},format=yuv420p`],
    ...['-c:v', 'libaom-av1', '-still-picture', '1', '-crf', '32', '-cpu-used', '4'],
    `${base}.avif`,
  ]);
  ffmpeg([
    ...at,
    ...['-i', input, '-frames:v', '1', '-vf', vf],
    ...['-c:v', 'libwebp', '-quality', '78'],
    `${base}.webp`,
  ]);
}

const kb = (p) => `${Math.round(statSync(p).size / 1024)} KB`;

if (!stillsOnly) {
  for (const item of [showreel, ...work]) {
    video(item);
    const dir = join(OUT, item.key);
    process.stdout.write(
      `${item.key}: video ${kb(join(dir, 'video.mp4'))}, poster ${kb(join(dir, 'poster.webp'))}\n`,
    );
  }
}

mkdirSync(join(OUT, hero.key), { recursive: true });
image(
  source(hero.source),
  'crop=ih*16/9:ih,scale=1600:-2:flags=lanczos',
  join(OUT, hero.key, 'still'),
  hero.at,
);
process.stdout.write(`${hero.key}: still ${kb(join(OUT, hero.key, 'still.avif'))} avif\n`);

// Portrait: original 2:3 ratio, no crop; grey PNG converted to RGB.
mkdirSync(join(OUT, portrait.key), { recursive: true });
image(
  source(portrait.source),
  `scale=${portrait.width}:-2:flags=lanczos`,
  join(OUT, portrait.key, 'portrait'),
);
process.stdout.write(
  `${portrait.key}: portrait ${kb(join(OUT, portrait.key, 'portrait.avif'))} avif, ${kb(join(OUT, portrait.key, 'portrait.webp'))} webp\n`,
);
