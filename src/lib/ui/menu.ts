/**
 * Accessible disclosure menu.
 * Markup: <button data-menu-toggle aria-controls="id" aria-expanded="false">
 *         <div id="id" hidden> ... links ... <button data-menu-close> </div>
 * Closes on link click, close button and Escape; returns focus to the toggle.
 */
export function initMenus(root: ParentNode = document): void {
  root.querySelectorAll<HTMLButtonElement>('[data-menu-toggle]').forEach((toggle) => {
    const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    if (!panel) return;

    const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';
    const setOpen = (open: boolean, restoreFocus = false) => {
      toggle.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
      document.documentElement.toggleAttribute('data-menu-open', open);
      if (open) panel.querySelector<HTMLElement>('a[href], button')?.focus();
      else if (restoreFocus) toggle.focus();
    };

    toggle.addEventListener('click', () => setOpen(!isOpen()));
    panel.addEventListener('click', (event) => {
      const target = event.target as Element | null;
      if (target?.closest('a[href]')) setOpen(false);
      if (target?.closest('[data-menu-close]')) setOpen(false, true);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isOpen()) setOpen(false, true);
    });
  });
}
