#!/usr/bin/env node
/**
 * Computes metric overrides for local fallback fonts so that text set in the
 * fallback occupies the same space as the web font (no layout shift on swap).
 *
 * Usage:
 *   node scripts/font-fallback-metrics.mjs
 *   node scripts/font-fallback-metrics.mjs --serif <times.ttf> --sans <arial.ttf>
 *
 * Reads WOFF2 (Brotli, Node built-in) and TTF directly: head, hhea, hmtx,
 * cmap. size-adjust compares average advance widths over representative
 * Russian text; ascent/descent/line-gap follow the web font's hhea metrics.
 * Output: JSON to paste into src/site/fonts.ts. No dependencies.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { brotliDecompressSync } from 'node:zlib';

const require = createRequire(import.meta.url);

const SAMPLE_LOWER =
  'видеограф снимаю монтирую и озвучиваю ролики для туристических компаний и брендов. ' +
  'съёмка путешествий, монтаж, цветокоррекция, звук и музыка, закадровый голос — 2026';
const SAMPLE_UPPER = SAMPLE_LOWER.toUpperCase();

const FONTS = [
  {
    name: 'Onest Variable',
    file: 'onest/files/onest-cyrillic-wght-normal.woff2',
    fallback: 'sans',
  },
];

// WOFF2 known-table index (spec section 5.1); names padded to 4 characters.
const WOFF2_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
];

function readBase128(buf, state) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = buf[state.pos++];
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  throw new Error('Invalid UIntBase128');
}

/** Returns { tag: { data: Buffer, transformed: boolean } } */
function parseWoff2(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('Not a WOFF2 file');
  const numTables = buf.readUInt16BE(12);
  const state = { pos: 48 };
  const entries = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[state.pos++];
    const tagIndex = flags & 0x3f;
    let tag;
    if (tagIndex === 63) {
      tag = buf.toString('latin1', state.pos, state.pos + 4);
      state.pos += 4;
    } else {
      tag = WOFF2_TAGS[tagIndex];
    }
    const version = (flags >> 6) & 0x3;
    const origLength = readBase128(buf, state);
    const isGlyfLoca = tag === 'glyf' || tag === 'loca';
    const transformed = isGlyfLoca ? version === 0 : version !== 0;
    const length = transformed ? readBase128(buf, state) : origLength;
    entries.push({ tag, length, transformed });
  }
  const compressedSize = buf.readUInt32BE(20);
  const stream = brotliDecompressSync(buf.subarray(state.pos, state.pos + compressedSize));
  const tables = {};
  let offset = 0;
  for (const e of entries) {
    tables[e.tag] = {
      data: stream.subarray(offset, offset + e.length),
      transformed: e.transformed,
    };
    offset += e.length;
  }
  return tables;
}

function parseTtf(buf) {
  const numTables = buf.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = buf.toString('latin1', rec, rec + 4);
    const offset = buf.readUInt32BE(rec + 8);
    const length = buf.readUInt32BE(rec + 12);
    tables[tag] = { data: buf.subarray(offset, offset + length), transformed: false };
  }
  return tables;
}

/** Unicode code point -> glyph id, from cmap format 4 or 12. */
function parseCmap(cmap) {
  const count = cmap.readUInt16BE(2);
  let best = null;
  for (let i = 0; i < count; i++) {
    const rec = 4 + i * 8;
    const platform = cmap.readUInt16BE(rec);
    const encoding = cmap.readUInt16BE(rec + 2);
    const offset = cmap.readUInt32BE(rec + 4);
    const format = cmap.readUInt16BE(offset);
    if (platform === 3 && encoding === 10 && format === 12) best = { offset, format };
    else if (!best && ((platform === 3 && encoding === 1) || platform === 0) && format === 4)
      best = { offset, format };
  }
  if (!best) throw new Error('No usable cmap subtable');
  const map = new Map();
  const o = best.offset;
  if (best.format === 4) {
    const segX2 = cmap.readUInt16BE(o + 6);
    const ends = o + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = cmap.readUInt16BE(ends + s * 2);
      const start = cmap.readUInt16BE(starts + s * 2);
      const delta = cmap.readInt16BE(deltas + s * 2);
      const rangeOffset = cmap.readUInt16BE(ranges + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let gid;
        if (rangeOffset === 0) gid = (c + delta) & 0xffff;
        else {
          const addr = ranges + s * 2 + rangeOffset + (c - start) * 2;
          gid = cmap.readUInt16BE(addr);
          if (gid !== 0) gid = (gid + delta) & 0xffff;
        }
        if (gid) map.set(c, gid);
      }
    }
  } else {
    const groups = cmap.readUInt32BE(o + 12);
    for (let g = 0; g < groups; g++) {
      const rec = o + 16 + g * 12;
      const start = cmap.readUInt32BE(rec);
      const end = cmap.readUInt32BE(rec + 4);
      const startGid = cmap.readUInt32BE(rec + 8);
      for (let c = start; c <= end; c++) map.set(c, startGid + (c - start));
    }
  }
  return map;
}

function metrics(tables, sample) {
  const head = tables.head.data;
  const hhea = tables.hhea.data;
  const upm = head.readUInt16BE(18);
  const ascender = hhea.readInt16BE(4);
  const descender = hhea.readInt16BE(6);
  const lineGap = hhea.readInt16BE(8);
  const numberOfHMetrics = hhea.readUInt16BE(34);

  const hmtx = tables.hmtx;
  // A transformed WOFF2 hmtx starts with a flags byte, then the advance array.
  const base = hmtx.transformed ? 1 : 0;
  const stride = hmtx.transformed ? 2 : 4;
  const advance = (gid) => {
    const index = Math.min(gid, numberOfHMetrics - 1);
    return hmtx.data.readUInt16BE(base + index * stride);
  };

  const cmap = parseCmap(tables.cmap.data);
  let total = 0;
  let counted = 0;
  for (const ch of sample) {
    const gid = cmap.get(ch.codePointAt(0));
    if (gid === undefined) continue;
    total += advance(gid);
    counted++;
  }
  return { upm, ascender, descender, lineGap, avgWidth: total / counted / upm, coverage: counted };
}

function argPath(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const fallbackFiles = {
  serif: argPath('--serif', 'C:/Windows/Fonts/times.ttf'),
  sans: argPath('--sans', 'C:/Windows/Fonts/arial.ttf'),
};

const pct = (n) => `${(n * 100).toFixed(2)}%`;
const results = {};
for (const font of FONTS) {
  const sample = font.upper ? SAMPLE_UPPER : SAMPLE_LOWER;
  const pkgDir = require
    .resolve(`@fontsource-variable/${font.file.split('/')[0]}/package.json`)
    .replace(/package\.json$/, '');
  const web = metrics(
    parseWoff2(readFileSync(pkgDir + font.file.split('/').slice(1).join('/'))),
    sample,
  );
  const fb = metrics(parseTtf(readFileSync(fallbackFiles[font.fallback])), sample);
  const sizeAdjust = web.avgWidth / fb.avgWidth;
  results[font.name] = {
    fallback: font.fallback,
    sizeAdjust: pct(sizeAdjust),
    ascentOverride: pct(web.ascender / web.upm / sizeAdjust),
    descentOverride: pct(Math.abs(web.descender) / web.upm / sizeAdjust),
    lineGapOverride: pct(web.lineGap / web.upm / sizeAdjust),
  };
}
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
