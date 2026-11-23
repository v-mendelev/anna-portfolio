import { describe, expect, it } from 'vitest';
import { ALL_CATEGORIES, filterProjects, usedCategories } from './portfolio';

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
