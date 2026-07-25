export type DialogController = Readonly<{
  open: () => void;
  close: (restoreFocus?: boolean) => void;
  isOpen: () => boolean;
  destroy: () => void;
}>;

export type DialogBinding = Readonly<{
  button: HTMLButtonElement;
  panel: HTMLElement;
  backdrop: HTMLElement;
  closeButton: HTMLButtonElement;
  initialFocus?: HTMLElement;
}>;

const MODAL_OPEN_EVENT = 'atomic-acres:modal-open';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
    .filter((element) => !element.hidden && !element.closest('[hidden]') && element.getAttribute('aria-hidden') !== 'true');
}

export function bindDialog(binding: DialogBinding): DialogController {
  const { button, panel, backdrop, closeButton } = binding;
  let returnFocus: HTMLElement | null = null;

  const isOpen = (): boolean => !panel.hidden;

  const close = (restoreFocus = true): void => {
    if (!isOpen()) return;
    panel.hidden = true;
    backdrop.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (restoreFocus) (returnFocus?.isConnected ? returnFocus : button).focus();
    returnFocus = null;
  };

  const open = (): void => {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : button;
    window.dispatchEvent(new CustomEvent(MODAL_OPEN_EVENT, { detail: panel.id }));
    panel.hidden = false;
    backdrop.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    (binding.initialFocus ?? closeButton).focus();
  };

  const onButtonClick = (): void => open();
  const onCloseClick = (): void => close();
  const onBackdropClick = (): void => close();
  const onKeydown = (event: KeyboardEvent): void => {
    if (!isOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = focusableElements(panel);
    if (focusable.length === 0) {
      event.preventDefault();
      closeButton.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const onAnotherModal = (event: Event): void => {
    const targetPanelId = (event as CustomEvent<string>).detail;
    if (targetPanelId !== panel.id) close(false);
  };

  button.addEventListener('click', onButtonClick);
  closeButton.addEventListener('click', onCloseClick);
  backdrop.addEventListener('click', onBackdropClick);
  window.addEventListener('keydown', onKeydown);
  window.addEventListener(MODAL_OPEN_EVENT, onAnotherModal);

  return {
    open,
    close,
    isOpen,
    destroy: () => {
      button.removeEventListener('click', onButtonClick);
      closeButton.removeEventListener('click', onCloseClick);
      backdrop.removeEventListener('click', onBackdropClick);
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener(MODAL_OPEN_EVENT, onAnotherModal);
    },
  };
}
