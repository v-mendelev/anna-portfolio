/**
 * Native <dialog> wiring.
 * Trigger: <button data-dialog-open="dialog-id">. Dialog: <dialog id data-dialog>.
 * Close: [data-dialog-close], Escape (native) or a click on the backdrop.
 * The trigger's click point is exposed as --origin-x/--origin-y on the dialog,
 * so a design can grow the dialog out of the button (e.g. an iris wipe).
 * Focus returns to the trigger on close.
 */
export function initDialogs(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-dialog-open]').forEach((trigger) => {
    const dialog = document.getElementById(trigger.dataset.dialogOpen ?? '');
    if (!(dialog instanceof HTMLDialogElement)) return;

    trigger.addEventListener('click', (event) => {
      const rect = trigger.getBoundingClientRect();
      const pointer = event instanceof MouseEvent && event.detail > 0;
      const x = pointer ? event.clientX : rect.left + rect.width / 2;
      const y = pointer ? event.clientY : rect.top + rect.height / 2;
      dialog.style.setProperty('--origin-x', `${Math.round(x)}px`);
      dialog.style.setProperty('--origin-y', `${Math.round(y)}px`);
      dialog.showModal();
      dialog.addEventListener('close', () => trigger.focus(), { once: true });
    });
  });

  root.querySelectorAll<HTMLDialogElement>('dialog[data-dialog]').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.querySelectorAll('[data-dialog-close]').forEach((button) => {
      button.addEventListener('click', () => dialog.close());
    });
  });
}
