/**
 * Generic portfolio content contracts (reusable across projects).
 *
 * Honesty rule: anything that is not real client material MUST be flagged
 * with `placeholder: true` so every design renders a visible label for it.
 * Never ship invented clients, achievements or reviews as if they were real.
 */

export interface Service {
  id: string;
  title: string;
  /**
   * Title with soft hyphens (­) for very large display sizes, where a long
   * Russian word would not fit a phone screen. Browsers hyphenate Russian
   * inconsistently, so break points are authored, not automatic.
   */
  displayTitle?: string;
  summary: string;
  /** Short concrete deliverables, plain language. */
  includes: readonly string[];
}

export interface ProjectCategory {
  id: string;
  label: string;
}

/** Colour story used to paint a placeholder frame until real footage exists. */
export interface FrameTone {
  from: string;
  to: string;
}

export interface Project {
  id: string;
  title: string;
  category: string;
  /** Where it was filmed, if relevant. */
  place?: string;
  /** What Anna did on the project (services ids). */
  roles: readonly string[];
  /** Real media: poster image path in /public and optional video URL. */
  poster?: string;
  video?: string;
  tone: FrameTone;
  placeholder: boolean;
}

export interface Testimonial {
  id: string;
  quote: string;
  author: string;
  company?: string;
  placeholder: boolean;
}

export interface ContactChannel {
  id: string;
  label: string;
  /** Real href (mailto:, tel:, https://t.me/...). Absent until provided. */
  href?: string;
  value?: string;
  placeholder: boolean;
}

export interface ProcessStep {
  title: string;
  text: string;
}

export interface PortfolioContent {
  person: { name: string; role: string; location?: string; placeholderBio: boolean; bio: string };
  showreel: {
    title: string;
    video?: string;
    poster?: string;
    durationLabel?: string;
    placeholder: boolean;
  };
  services: readonly Service[];
  categories: readonly ProjectCategory[];
  projects: readonly Project[];
  travel: { intro: string; steps: readonly ProcessStep[]; formats: readonly string[] };
  testimonials: readonly Testimonial[];
  contacts: readonly ContactChannel[];
}

export const ALL_CATEGORIES = 'all';

/** Pure filter used by the interactive portfolio grids. */
export function filterProjects<T extends Pick<Project, 'category'>>(
  projects: readonly T[],
  category: string,
): T[] {
  if (category === ALL_CATEGORIES) return [...projects];
  return projects.filter((p) => p.category === category);
}

/** Categories that actually have at least one project, in declared order. */
export function usedCategories(
  categories: readonly ProjectCategory[],
  projects: readonly Pick<Project, 'category'>[],
): ProjectCategory[] {
  const used = new Set(projects.map((p) => p.category));
  return categories.filter((c) => used.has(c.id));
}

/** Human-readable label for placeholder content (shown in every concept). */
export const PLACEHOLDER_LABEL = 'Заглушка';
