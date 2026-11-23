import { describe, expect, it } from 'vitest';
import { HERO, SECTIONS, TRAVEL_HEADING, categoryLabel, content, serviceTitle } from './content';

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
    for (const list of [
      content.services,
      content.projects,
      content.testimonials,
      content.contacts,
    ]) {
      const ids = list.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const sectionIds = SECTIONS.map((s) => s.id);
    expect(new Set(sectionIds).size).toBe(sectionIds.length);
  });

  it('references only known categories and services', () => {
    for (const project of content.projects) {
      expect(categoryIds).toContain(project.category);
      for (const role of project.roles) expect(serviceIds).toContain(role);
    }
  });

  it('flags every project without real media as a placeholder', () => {
    for (const project of content.projects) {
      const hasMedia = 'poster' in project || 'video' in project;
      if (!hasMedia) expect(project.placeholder, project.id).toBe(true);
    }
  });

  it('never presents an unattributed review as real', () => {
    for (const t of content.testimonials) {
      if (!t.placeholder) {
        expect(t.author.trim(), t.id).not.toBe('');
        expect(t.company?.trim(), t.id).toBeTruthy();
      }
    }
  });

  it('flags every contact without a real link as a placeholder', () => {
    for (const c of content.contacts) {
      if (!('href' in c)) expect(c.placeholder, c.id).toBe(true);
    }
  });

  it('has a placeholder showreel and bio until real material arrives', () => {
    expect('video' in content.showreel).toBe(false);
    expect(content.showreel.placeholder).toBe(true);
    expect(content.person.placeholderBio).toBe(true);
  });

  it('resolves labels for services and categories', () => {
    expect(serviceTitle('voice')).toBe('Озвучка');
    expect(categoryLabel('travel')).toBe('Путешествия');
    expect(serviceTitle('unknown')).toBe('unknown');
  });
});

describe('professional positioning', () => {
  it('presents Anna as a videographer first: filming, editing, voice-over', () => {
    expect(HERO.lead).toMatch(/^Видеограф\./);
    expect(HERO.lead).toContain('Снимаю, монтирую и озвучиваю');
    expect(HERO.lead).not.toMatch(/туристическ|путешеств/i);
  });

  it('frames travel production as a new direction without claimed projects', () => {
    expect(HERO.next).toMatch(/новое направление/i);
    expect(TRAVEL_HEADING.sub).toBe('новое направление');
    expect(content.travel.intro).toMatch(/^Я начинаю/);
    expect(content.travel.intro).toContain('Готовых туристических проектов пока нет');
    const travelService = content.services.find((s) => s.id === 'travel');
    expect(travelService?.summary).toMatch(/^Новое направление/);
  });

  it('keeps travel a minority of the invented demo projects', () => {
    const travel = content.projects.filter((p) => p.category === 'travel');
    expect(travel.length).toBeLessThan(content.projects.length / 2);
    expect(content.projects.every((p) => p.placeholder)).toBe(true);
  });
});
