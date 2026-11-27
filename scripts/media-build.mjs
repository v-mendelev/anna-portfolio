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
 *
 * Needs ffmpeg: on PATH, or its path in the FFMPEG environment variable.
 * Usage: pnpm media:build [out-dir]   (see docs/MEDIA.md)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { hero, showreel, work } from './media-manifest.mjs';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const SRC = 'media-src';
const OUT = process.argv[2] || 'public/media';

function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-v', 'error', '-y', ...args], {
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

function still(item) {
  const dir = join(OUT, item.key);
  mkdirSync(dir, { recursive: true });
  const input = source(item.source);
  const vf = 'crop=ih*16/9:ih,scale=1600:-2:flags=lanczos';
  ffmpeg([
    ...['-ss', String(item.at), '-i', input, '-frames:v', '1', '-vf', `${vf},format=yuv420p`],
    ...['-c:v', 'libaom-av1', '-still-picture', '1', '-crf', '32', '-cpu-used', '4'],
    join(dir, 'still.avif'),
  ]);
  ffmpeg([
    ...['-ss', String(item.at), '-i', input, '-frames:v', '1', '-vf', vf],
    ...['-c:v', 'libwebp', '-quality', '78'],
    join(dir, 'still.webp'),
  ]);
}

const kb = (p) => `${Math.round(statSync(p).size / 1024)} KB`;
for (const item of [showreel, ...work]) {
  video(item);
  const dir = join(OUT, item.key);
  process.stdout.write(
    `${item.key}: video ${kb(join(dir, 'video.mp4'))}, poster ${kb(join(dir, 'poster.webp'))}\n`,
  );
}
still(hero);
process.stdout.write(`${hero.key}: ${kb(join(OUT, hero.key, 'still.avif'))} avif\n`);
