import { ALL_CATEGORIES, filterProjects } from '../portfolio';

/**
 * Category filter for a list of items.
 * Markup inside [data-filter-root]:
 *   <button data-filter="all|<category>" aria-pressed>
 *   <li data-category="<category>">
 *   <p data-filter-status data-template="Показано: {n}" aria-live="polite">
 */
export function initFilters(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-filter-root]').forEach((group) => {
    const buttons = [...group.querySelectorAll<HTMLButtonElement>('[data-filter]')];
    const items = [...group.querySelectorAll<HTMLElement>('[data-category]')].map((el) => ({
      el,
      category: el.dataset.category ?? '',
    }));
    const status = group.querySelector<HTMLElement>('[data-filter-status]');

    const apply = (category: string) => {
      const visible = new Set(filterProjects(items, category).map((item) => item.el));
      for (const button of buttons) {
        button.setAttribute('aria-pressed', String(button.dataset.filter === category));
      }
      for (const { el } of items) el.hidden = !visible.has(el);
      if (status) {
        const template = status.dataset.template ?? '{n}';
        status.textContent = template.replace('{n}', String(visible.size));
      }
      group.dataset.activeFilter = category;
    };

    for (const button of buttons) {
      button.addEventListener('click', () => apply(button.dataset.filter ?? ALL_CATEGORIES));
    }
  });
}
