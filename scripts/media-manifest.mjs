/**
 * Which originals become web media, and how (input for scripts/media-build.mjs).
 *
 * `source` is the path inside media-src/ (Anna's originals, git-ignored, see
 * docs/MEDIA.md). `key` is the storage key under the media root — the same
 * in public/media/ (demo) and in an S3 bucket / CDN (production).
 * `poster` is the second of the frame used as the poster: picked by hand so
 * it is not a transition, a title card or a blank frame — and shows only
 * adults, and only footage that is Anna's own work (the showreel opens with
 * shots that look like stock; those are never used as stills).
 *
 * Folder names: Windows cannot keep the trailing space of the Yandex Disk
 * folder "Горизонтальные видео ", so it is stored without it.
 */
export const showreel = {
  key: 'showreel',
  source: 'Шоурил.mp4',
  // Studio interview + the «Институт семьи» shoot (0:11.6).
  poster: 11.6,
};

/**
 * Anna's portrait from her previous (Tilda) site, original 1667×2500 PNG,
 * stored in media-src/Tilda/ (see _sources.txt there). Kept at its 2:3 ratio.
 */
export const portrait = {
  key: 'about',
  source: 'Tilda/noroot.png',
  width: 900,
};

/** Still for the hero frame (16:9 crop of a horizontal source). */
export const hero = {
  key: 'hero',
  // Podcast intro, Anna's editing work (0:32).
  source: 'Горизонтальные видео/Подкаст монтаж (интро).mp4',
  at: 32,
};

export const work = [
  {
    key: 'work/vizitka',
    source: 'Вертикальные ролики/1. видео-визитка (съемка + монтаж).mp4',
    poster: 27,
  },
  { key: 'work/fashion', source: 'Вертикальные ролики/Мода (съемка + монтаж) .mp4', poster: 11 },
  {
    key: 'work/conference',
    source: 'Вертикальные ролики/Конференция (съемка + монтаж) mp4.mp4',
    poster: 26,
  },
  { key: 'work/corporate', source: 'Вертикальные ролики/Корпоратив.mp4', poster: 14 },
  {
    key: 'work/motorcycles',
    source: 'Вертикальные ролики/Ролик_3.Мотобат(съемка + монтаж).mp4',
    poster: 7,
  },
  { key: 'work/dance-bw', source: 'Вертикальные ролики/Съемки + монтаж 1.mp4', poster: 13 },
  {
    key: 'work/dance-reel',
    source: 'Вертикальные ролики/Танцевальный рилс (монтаж).mp4',
    poster: 16,
  },
  { key: 'work/podcast', source: 'Горизонтальные видео/Подкаст монтаж (интро).mp4', poster: 30 },
  { key: 'work/stage-promo', source: 'Горизонтальные видео/ПРОМО 1024 x 640.mov', poster: 13 },
];
