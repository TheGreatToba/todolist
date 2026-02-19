import React from "react";
import { X } from "lucide-react";
import { useModalA11y } from "./useModalA11y";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamName: string;
  modalRef: React.RefObject<HTMLDivElement | null>;
}

export function SettingsModal({
  isOpen,
  onClose,
  teamName,
  modalRef,
}: SettingsModalProps) {
  useModalA11y(modalRef, isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="bg-card rounded-xl shadow-lg max-w-md w-full p-6 border border-border max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            id="settings-modal-title"
            className="text-xl font-bold text-foreground"
          >
            Team Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded-lg transition"
            aria-label="Close settings modal"
            type="button"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-secondary/30 border border-border rounded-lg p-4">
            <p className="text-sm font-medium text-foreground mb-1">Team</p>
            <p className="text-sm text-muted-foreground">{teamName}</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Display options
            </p>
            <p className="text-xs text-muted-foreground">
              Basic settings are available today. More advanced configuration
              (notifications, templates, reports) will be added here in a future
              version.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-input text-foreground rounded-lg hover:bg-secondary transition text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
