import { describe, expect, it } from 'vitest';
import {
  ALL_CATEGORIES,
  filterProjects,
  formatDuration,
  frameRatio,
  mediaState,
  usableContacts,
  usedCategories,
} from './portfolio';

const projects = [
  { id: 'a', category: 'travel' },
  { id: 'b', category: 'brand' },
  { id: 'c', category: 'travel' },
];

describe('filterProjects', () => {
  it('returns a copy of everything for "all"', () => {
    const result = filterProjects(projects, ALL_CATEGORIES);
    expect(result.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(result).not.toBe(projects);
  });

  it('keeps only the requested category, preserving order', () => {
    expect(filterProjects(projects, 'travel').map((p) => p.id)).toEqual(['a', 'c']);
  });

  it('returns an empty list for an unknown category', () => {
    expect(filterProjects(projects, 'nope')).toEqual([]);
  });
});

describe('usedCategories', () => {
  it('drops categories without projects and keeps declared order', () => {
    const categories = [
      { id: 'brand', label: 'Бренды' },
      { id: 'voice', label: 'Озвучка' },
      { id: 'travel', label: 'Путешествия' },
    ];
    expect(usedCategories(categories, projects).map((c) => c.id)).toEqual(['brand', 'travel']);
  });
});

describe('mediaState', () => {
  it('prefers a video, then a still, then a placeholder', () => {
    expect(mediaState({ video: '/v.mp4', poster: '/p.jpg' })).toBe('video');
    expect(mediaState({ poster: '/p.jpg' })).toBe('image');
    expect(mediaState({})).toBe('placeholder');
    expect(mediaState(undefined)).toBe('placeholder');
  });

  it('treats empty strings as not provided', () => {
    expect(mediaState({ video: '', poster: '' })).toBe('placeholder');
  });
});

describe('usableContacts', () => {
  it('keeps only channels with a real link, in order', () => {
    const contacts = [
      { id: 'telegram', href: 'https://t.me/example' },
      { id: 'email' },
      { id: 'phone', href: '' },
      { id: 'youdo', href: 'https://youdo.com/' },
    ];
    expect(usableContacts(contacts).map((c) => c.id)).toEqual(['telegram', 'youdo']);
  });
});

describe('frameRatio', () => {
  it('frames vertical video 9:16 and everything else 16:9', () => {
    expect(frameRatio({ orientation: 'vertical' })).toBe('9 / 16');
    expect(frameRatio({ orientation: 'horizontal' })).toBe('16 / 9');
    expect(frameRatio({})).toBe('16 / 9');
  });

  it('keeps an explicit ratio (e.g. a 16:10 source) so nothing is cropped', () => {
    expect(frameRatio({ orientation: 'horizontal', ratio: '16 / 10' })).toBe('16 / 10');
  });
});

describe('formatDuration', () => {
  it('formats m:ss, rounding to whole seconds', () => {
    expect(formatDuration(93.07)).toBe('1:33');
    expect(formatDuration(25.56)).toBe('0:26');
    expect(formatDuration(146.08)).toBe('2:26');
    expect(formatDuration(59.6)).toBe('1:00');
  });

  it('never goes negative', () => {
    expect(formatDuration(-3)).toBe('0:00');
  });
});
