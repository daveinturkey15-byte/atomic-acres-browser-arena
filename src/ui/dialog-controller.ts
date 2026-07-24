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

export function bindDialog(binding: DialogBinding): DialogController {
  const { button, panel, backdrop, closeButton } = binding;

  const isOpen = (): boolean => !panel.hidden;

  const close = (restoreFocus = true): void => {
    if (!isOpen()) return;
    panel.hidden = true;
    backdrop.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (restoreFocus) button.focus();
  };

  const open = (): void => {
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
    if (event.key !== 'Escape' || !isOpen()) return;
    event.preventDefault();
    close();
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
