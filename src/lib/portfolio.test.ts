import { describe, expect, it } from 'vitest';
import {
  ALL_CATEGORIES,
  filterProjects,
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
