/**
 * Marks fixed/sticky site headers with `data-scrolled` once page content
 * starts to pass underneath them, so a concept can switch from a transparent
 * or floating header to an opaque bar and text never collides with the
 * header's own labels.
 *
 * Markup: `<header data-site-header data-solid-after="#top">`.
 * `data-solid-after` (optional) names an element; the header turns solid when
 * that element's bottom edge reaches the header. Without it, the header turns
 * solid as soon as the page is scrolled at all.
 *
 * The threshold is the header's *resting* height (measured while it is not
 * solid). A solid header is usually shorter; measuring the current height
 * would make the state flip back and forth inside that difference.
 */
export function initHeaderState(root: ParentNode = document): void {
  const headers = [...root.querySelectorAll<HTMLElement>('[data-site-header]')];
  if (headers.length === 0) return;

  const resting = new Map<HTMLElement, number>();
  const restingHeight = (header: HTMLElement): number => {
    if (!header.hasAttribute('data-scrolled')) {
      resting.set(header, header.getBoundingClientRect().height);
    }
    return resting.get(header) ?? header.getBoundingClientRect().height;
  };

  let frame = 0;
  const update = () => {
    frame = 0;
    for (const header of headers) {
      const selector = header.dataset.solidAfter;
      const anchor = selector ? document.querySelector(selector) : null;
      const solid = anchor
        ? anchor.getBoundingClientRect().bottom <= restingHeight(header)
        : window.scrollY > 8;
      header.toggleAttribute('data-scrolled', solid);
    }
  };
  const schedule = () => {
    if (frame === 0) frame = requestAnimationFrame(update);
  };

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('hashchange', schedule);
  update();
}
