import { describe, expect, it } from 'vitest';
import { SECTIONS, categoryLabel, content, serviceTitle } from './content';

describe('portfolio content integrity', () => {
  const serviceIds = content.services.map((s) => s.id);
  const categoryIds = content.categories.map((c) => c.id);

  it('offers exactly the four services from the brief', () => {
    expect(content.services.map((s) => s.title)).toEqual([
      'Видеопроизводство',
      'Монтаж',
      'Озвучка',
      'Съёмка путешествий',
    ]);
  });

  it('uses unique ids everywhere', () => {
    for (const list of [content.services, content.projects, content.contacts]) {
      const ids = list.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const sectionIds = SECTIONS.map((s) => s.id);
    expect(new Set(sectionIds).size).toBe(sectionIds.length);
  });

  it('lists sections in page order', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(['showreel', 'work', 'services', 'about', 'contact']);
  });

  it('references only known categories and services', () => {
    for (const project of content.projects) {
      expect(categoryIds).toContain(project.category);
      for (const role of project.roles) expect(serviceIds).toContain(role);
    }
  });

  it('gives every project at least one role, without duplicates', () => {
    for (const project of content.projects) {
      expect(project.roles.length, project.id).toBeGreaterThan(0);
      expect(new Set(project.roles).size, project.id).toBe(project.roles.length);
    }
  });

  it('flags every project without real media as a placeholder', () => {
    for (const project of content.projects) {
      const hasMedia = Boolean(project.poster ?? project.video);
      if (!hasMedia) expect(project.placeholder, project.id).toBe(true);
    }
  });

  it('never presents an unattributed review as real', () => {
    for (const t of content.testimonials ?? []) {
      if (!t.placeholder) {
        expect(t.author.trim(), t.id).not.toBe('');
        expect(t.company?.trim(), t.id).toBeTruthy();
      }
    }
  });

  it('flags every contact without a real link as a placeholder', () => {
    for (const c of content.contacts) {
      if (!c.href) expect(c.placeholder, c.id).toBe(true);
    }
  });

  it('has a placeholder showreel and bio until real material arrives', () => {
    expect(content.showreel.video).toBeUndefined();
    expect(content.showreel.placeholder).toBe(true);
    expect(content.person.placeholderBio).toBe(true);
  });

  it('references media only inside /public (no third-party URLs)', () => {
    const paths = [
      content.showreel.video,
      content.showreel.poster,
      content.hero.still?.poster,
      content.hero.still?.video,
      content.person.portrait,
      ...content.projects.flatMap((p) => [p.video, p.poster]),
    ].filter((p): p is string => Boolean(p));
    for (const path of paths) expect(path.startsWith('/') && !path.startsWith('//')).toBe(true);
  });

  it('resolves labels for services and categories', () => {
    expect(serviceTitle('voice')).toBe('Озвучка');
    expect(categoryLabel('travel')).toBe('Путешествия');
    expect(serviceTitle('unknown')).toBe('unknown');
  });
});

describe('professional positioning', () => {
  it('presents Anna as a videographer first: filming, editing, voice-over', () => {
    expect(content.hero.lead).toMatch(/^Видеограф\./);
    expect(content.hero.lead).toContain('Снимаю, монтирую и озвучиваю');
    expect(content.hero.lead).not.toMatch(/туристическ|путешеств/i);
  });

  it('frames travel production as a new direction without claimed projects', () => {
    expect(content.hero.next).toMatch(/новое направление/i);
    const travelService = content.services.find((s) => s.id === 'travel');
    expect(travelService?.summary).toMatch(/^Новое направление/);
  });

  it('keeps travel a minority of the invented demo projects', () => {
    const travel = content.projects.filter((p) => p.category === 'travel');
    expect(travel.length).toBeLessThan(content.projects.length / 2);
    expect(content.projects.every((p) => p.placeholder)).toBe(true);
  });
});
