import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { SECTIONS, categoryLabel, content, roleTitle, serviceTitle } from './content';

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
    expect(SECTIONS.map((s) => s.id)).toEqual([
      'showreel',
      'work',
      'services',
      'about',
      'testimonials',
      'contact',
    ]);
  });

  it('references only known categories and roles', () => {
    const roleIds = [...serviceIds, ...(content.roles ?? []).map((r) => r.id)];
    for (const project of content.projects) {
      expect(categoryIds).toContain(project.category);
      for (const role of project.roles) expect(roleIds).toContain(role);
    }
  });

  it('never repeats a role, and leaves roles empty only on unconfirmed work', () => {
    for (const project of content.projects) {
      expect(new Set(project.roles).size, project.id).toBe(project.roles.length);
      if (project.roles.length === 0) expect(project.unconfirmed, project.id).toBe(true);
    }
  });

  it('uses only categories that have projects', () => {
    for (const c of content.categories) {
      expect(
        content.projects.some((p) => p.category === c.id),
        c.id,
      ).toBe(true);
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
        // Attribution: the company, or the task the review was left for.
        expect((t.company ?? t.context)?.trim(), t.id).toBeTruthy();
      }
    }
  });

  it('shows the four real reviews from the previous site, word for word', () => {
    const reviews = content.testimonials ?? [];
    expect(reviews.map((t) => t.author)).toEqual([
      'Svetlana K.',
      'Алена К.',
      'Юлия Ф.',
      'Александра Х.',
    ]);
    for (const t of reviews) {
      expect(t.placeholder, t.id).toBe(false);
      expect(t.rating, t.id).toBe(5);
    }
    expect(reviews[3]?.quote).toBe(
      'Отличный специалист со своим стилем и вкусом! Все очень быстро и качественно',
    );
  });

  it('flags every contact without a real link as a placeholder', () => {
    for (const c of content.contacts) {
      if (!c.href) expect(c.placeholder, c.id).toBe(true);
    }
  });

  it("shows Anna's real showreel, portrait and biography", () => {
    expect(content.showreel.placeholder).toBe(false);
    expect(content.showreel.video).toBeTruthy();
    expect(content.showreel.poster).toBeTruthy();
    expect(content.person.placeholderBio).toBe(false);
    expect(content.person.portrait).toBe('about/portrait.webp');
    expect(content.person.portraitAvif).toBe('about/portrait.avif');
    expect(content.person.portraitAlt).toMatch(/Анна Шеленкова/);
  });

  it('keeps the biography to facts from her previous site, without "сейчас"', () => {
    const bio = content.person.bio.join(' ');
    for (const fact of [
      'видеомонтажёр и рилсмейкер',
      'IDC',
      'VK Stadium',
      'AGUUTEENS FEST',
      '«Большие и маленькие»',
      '«Россия К»',
      'пресс-службе Склифа',
      'С января 2026 года',
      'Станислава Стрелкова',
    ]) {
      expect(bio, fact).toContain(fact);
    }
    expect(bio).not.toMatch(/сейчас|лучший|№ ?1|лет опыта/i);
  });

  it('uses the confirmed contacts and keeps only YouDo as a placeholder', () => {
    const byId = Object.fromEntries(content.contacts.map((c) => [c.id, c]));
    expect(byId.telegram?.href).toBe('https://t.me/Anna_NRL');
    expect(byId.telegram?.value).toBe('@Anna_NRL');
    expect(byId.phone?.href).toBe('tel:+79651461372');
    expect(byId.phone?.value).toBe('8(965)-146-13-72');
    expect(byId.email?.href).toBe('mailto:annashelenkova_nrl@mail.ru');
    expect(byId.email?.value).toBe('annashelenkova_nrl@mail.ru');
    expect(byId.youdo?.href).toBeUndefined();
    expect(content.contacts.filter((c) => c.placeholder).map((c) => c.id)).toEqual(['youdo']);
  });

  const keys = [
    content.showreel.video,
    content.showreel.poster,
    content.hero.still?.poster,
    content.hero.still?.posterAvif,
    content.hero.still?.video,
    content.person.portrait,
    ...content.projects.flatMap((p) => [p.video, p.poster, p.posterAvif]),
  ].filter((p): p is string => Boolean(p));

  it('references media by relative keys only (no third-party URLs)', () => {
    for (const key of keys) {
      expect(key, key).toMatch(/^[a-z0-9-]+(\/[a-z0-9-]+)*\.(mp4|webp|avif)$/);
    }
  });

  it('every media key exists in public/media, within the demo size budget', () => {
    let total = 0;
    for (const key of keys) {
      const file = `public/media/${key}`;
      expect(existsSync(file), file).toBe(true);
      const size = statSync(file).size;
      // Per file: posters stay small, video previews ≤ 12 MB (GitHub Pages demo).
      expect(size, file).toBeLessThan(key.endsWith('.mp4') ? 12_000_000 : 300_000);
      total += size;
    }
    expect(total).toBeLessThan(90_000_000);
  });

  it('gives every real video a poster, an orientation and a duration', () => {
    for (const p of content.projects.filter((x) => x.video)) {
      expect(p.poster, p.id).toBeTruthy();
      expect(p.orientation, p.id).toBeDefined();
      expect(p.duration, p.id).toMatch(/^\d+:\d{2}$/);
    }
  });

  it('resolves labels for services and categories', () => {
    expect(serviceTitle('voice')).toBe('Озвучка');
    expect(categoryLabel('events')).toBe('Мероприятия');
    expect(serviceTitle('unknown')).toBe('unknown');
    expect(roleTitle('filming')).toBe('Съёмка');
    expect(roleTitle('editing')).toBe('Монтаж');
    expect(roleTitle('voice')).toBe('Озвучка');
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

  it('claims no travel project until there is one', () => {
    expect(content.projects.some((p) => p.category === 'travel')).toBe(false);
  });

  it('shows only real work, every detail Anna has not confirmed flagged', () => {
    expect(content.projects.length).toBeGreaterThan(0);
    for (const p of content.projects) {
      expect(p.placeholder, p.id).toBe(false);
      expect(p.video, p.id).toBeTruthy();
      expect(p.unconfirmed, p.id).toBe(true);
      // No client names or invented case-study text until Anna confirms them.
      expect(p.description, p.id).toBeUndefined();
    }
  });

  it('mixes vertical and horizontal work', () => {
    const o = new Set(content.projects.map((p) => p.orientation));
    expect(o).toEqual(new Set(['vertical', 'horizontal']));
  });
});
