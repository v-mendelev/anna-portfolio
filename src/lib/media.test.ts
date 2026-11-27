import { describe, expect, it } from 'vitest';
import { mediaRoot, mediaUrl } from './media';

describe('mediaRoot', () => {
  it('uses public/media under the site base by default', () => {
    expect(mediaRoot(undefined, '/anna-portfolio/')).toBe('/anna-portfolio/media');
    expect(mediaRoot('', '/')).toBe('/media');
    expect(mediaRoot('   ', '/')).toBe('/media');
  });

  it('prefers the CDN base when configured', () => {
    expect(mediaRoot('https://cdn.example.ru/portfolio/', '/anna-portfolio/')).toBe(
      'https://cdn.example.ru/portfolio/',
    );
  });
});

describe('mediaUrl', () => {
  it('joins root and key with exactly one slash', () => {
    expect(mediaUrl('work/a/preview.mp4', '/anna-portfolio/media')).toBe(
      '/anna-portfolio/media/work/a/preview.mp4',
    );
    expect(mediaUrl('/work/a.webp', 'https://cdn.example.ru/p/')).toBe(
      'https://cdn.example.ru/p/work/a.webp',
    );
  });

  it('leaves absolute URLs untouched', () => {
    expect(mediaUrl('https://other.example/v.mp4', '/media')).toBe('https://other.example/v.mp4');
    expect(mediaUrl('//cdn.example/v.mp4', '/media')).toBe('//cdn.example/v.mp4');
  });
});
