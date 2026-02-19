import { useState, useEffect, useRef } from "react";

export function useManagerDashboardModals() {
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const settingsModalRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const previousBodyOverflowRef = useRef<string | null>(null);

  useEffect(() => {
    const modalElement = settingsModalRef.current;

    if (!showSettingsModal) {
      if (
        typeof document !== "undefined" &&
        previousBodyOverflowRef.current !== null
      ) {
        document.body.style.overflow = previousBodyOverflowRef.current;
        previousBodyOverflowRef.current = null;
      }
      if (lastFocusedElementRef.current) {
        lastFocusedElementRef.current.focus();
      }
      return;
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
        setShowSettingsModal(false);
        return;
      }

      if (event.key === "Tab" && modalElement) {
        const focusableSelectors = [
          "a[href]",
          "button:not([disabled])",
          "textarea:not([disabled])",
          "input:not([disabled])",
          "select:not([disabled])",
          '[tabindex]:not([tabindex="-1"])',
        ];

        const focusableElements = Array.from(
          modalElement.querySelectorAll<HTMLElement>(
            focusableSelectors.join(","),
          ),
        ).filter((el) => !el.hasAttribute("aria-hidden"));

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

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (
        typeof document !== "undefined" &&
        previousBodyOverflowRef.current !== null
      ) {
        document.body.style.overflow = previousBodyOverflowRef.current;
        previousBodyOverflowRef.current = null;
      }
    };
  }, [showSettingsModal]);

  const openSettingsModal = () => {
    if (typeof document !== "undefined") {
      lastFocusedElementRef.current =
        document.activeElement as HTMLElement | null;
    }
    setShowSettingsModal(true);
  };

  return {
    showNewTaskModal,
    setShowNewTaskModal,
    showSettingsModal,
    setShowSettingsModal,
    openSettingsModal,
    settingsModalRef,
  };
}
