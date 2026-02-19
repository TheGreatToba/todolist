import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTORS = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusableElements(modalElement: HTMLDivElement): HTMLElement[] {
  return Array.from(
    modalElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS),
  ).filter((el) => !el.hasAttribute("aria-hidden"));
}

/**
 * Handles modal accessibility: focus trap (Tab + focus containment),
 * Escape to close, body scroll lock, and focus save/restore when opening/closing.
 * Uses refs for onClose so the effect does not re-run on parent re-renders and
 * overwrite lastFocusedRef with an element inside the modal.
 *
 * Focus containment skips pulling focus back when the new target is inside an
 * element with [data-focus-trap-allow], so portaled content (e.g. dropdowns,
 * popovers) can receive focus without being forced back into the modal.
 *
 * If you later support stacked modals, consider a "top-most modal only" strategy
 * for the focusin handler (e.g. only the topmost modal's trap runs).
 */
export function useModalA11y(
  modalRef: React.RefObject<HTMLDivElement | null>,
  isOpen: boolean,
  onClose: () => void,
) {
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const previousBodyOverflowRef = useRef<string | null>(null);
  const prevIsOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const modalElement = modalRef.current;

    if (!isOpen) {
      prevIsOpenRef.current = false;
      if (
        typeof document !== "undefined" &&
        previousBodyOverflowRef.current !== null
      ) {
        document.body.style.overflow = previousBodyOverflowRef.current;
        previousBodyOverflowRef.current = null;
      }
      if (lastFocusedRef.current) {
        try {
          lastFocusedRef.current.focus();
        } catch {
          // element may be gone
        }
        lastFocusedRef.current = null;
      }
      return;
    }

    // Only save focus when transitioning from closed to open (avoids overwriting with modal-internal element on re-runs)
    if (!prevIsOpenRef.current) {
      lastFocusedRef.current = document.activeElement as HTMLElement | null;
      prevIsOpenRef.current = true;
    }

    if (typeof document !== "undefined") {
      if (previousBodyOverflowRef.current === null) {
        previousBodyOverflowRef.current = document.body.style.overflow;
      }
      document.body.style.overflow = "hidden";
    }

    if (modalElement) {
      modalElement.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key === "Tab" && modalElement) {
        const focusableElements = getFocusableElements(modalElement);

        if (focusableElements.length === 0) {
          event.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const isShift = event.shiftKey;

        if (!isShift && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        } else if (isShift && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      }
    };

    // Strict focus trap: if focus leaves the modal, bring it back to the first focusable element.
    // Skip when focus moved into portaled content (menu/popover) so it stays usable with keyboard.
    const handleFocusIn = (event: FocusEvent) => {
      if (!modalElement || !(event.target instanceof Node)) return;
      if (modalElement.contains(event.target)) return;
      const target = event.target as HTMLElement;
      if (target.closest?.("[data-focus-trap-allow]")) return;
      const focusable = getFocusableElements(modalElement);
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("focusin", handleFocusIn, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("focusin", handleFocusIn, true);
      if (
        typeof document !== "undefined" &&
        previousBodyOverflowRef.current !== null
      ) {
        document.body.style.overflow = previousBodyOverflowRef.current;
        previousBodyOverflowRef.current = null;
      }
    };
  }, [isOpen, modalRef]);
}
