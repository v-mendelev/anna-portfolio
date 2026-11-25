/**
 * Generic portfolio content contracts (reusable across projects).
 *
 * Honesty rule: anything that is not real client material MUST be flagged
 * with `placeholder: true` so the site renders a visible label for it.
 * Never ship invented clients, achievements or reviews as if they were real.
 *
 * Media paths (`poster`, `video`) are paths inside `public/`, e.g.
 * "/media/showreel.mp4"; components resolve them with `withBase()`.
 */

/** A still image or a video with an optional poster. Absent fields = not provided yet. */
export interface Media {
  /** Still image (or video poster) in /public. */
  poster?: string;
  /** Video file in /public (MP4/H.264 for the widest support). */
  video?: string;
}

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
  /** Horizon height in % of the frame (default 58). Varies placeholder compositions. */
  horizon?: number;
  /** Light source position in % (defaults 72 / 30). */
  sunX?: number;
  sunY?: number;
}

export interface Project extends Media {
  id: string;
  title: string;
  category: string;
  /** One or two sentences about the project, once it is real. */
  description?: string;
  /** Where it was filmed, if relevant. */
  place?: string;
  /** What Anna did on the project (service ids). */
  roles: readonly string[];
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
  /** What the visitor sees, e.g. "@username" or the e-mail address. */
  value?: string;
  placeholder: boolean;
}

export interface PortfolioContent {
  person: {
    name: string;
    role: string;
    location?: string;
    placeholderBio: boolean;
    bio: string;
    /** Portrait (image path). Absent until provided. */
    portrait?: string;
  };
  hero: {
    /** One plain sentence: who Anna is and what she does. */
    lead: string;
    /** Optional second line (e.g. a new direction). */
    next?: string;
    /** Still frame next to the name. Absent until provided. */
    still?: Media;
  };
  showreel: Media & {
    title: string;
    description: string;
    durationLabel?: string;
    placeholder: boolean;
  };
  services: readonly Service[];
  categories: readonly ProjectCategory[];
  projects: readonly Project[];
  /** Real reviews only (with the author's permission). Not rendered yet. */
  testimonials?: readonly Testimonial[];
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

/**
 * What a media slot can show right now: a playable video, a still image, or
 * a labelled placeholder. Components branch on this so a slot never renders
 * a player without a file.
 */
export function mediaState(media: Media | undefined): 'video' | 'image' | 'placeholder' {
  if (media?.video) return 'video';
  if (media?.poster) return 'image';
  return 'placeholder';
}

/** Contact channels that can actually be used (real link present). */
export function usableContacts<T extends Pick<ContactChannel, 'href'>>(
  contacts: readonly T[],
): T[] {
  return contacts.filter((c) => Boolean(c.href));
}

/** Human-readable label for placeholder content. */
export const PLACEHOLDER_LABEL = 'Заглушка';
