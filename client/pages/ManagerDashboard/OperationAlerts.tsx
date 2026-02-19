import React from "react";
import { X } from "lucide-react";

interface OperationAlertsProps {
  error: string | null;
  success: string | null;
  onDismissError: () => void;
  onDismissSuccess: () => void;
}

export function OperationAlerts({
  error,
  success,
  onDismissError,
  onDismissSuccess,
}: OperationAlertsProps) {
  return (
    <>
      {error && (
        <div className="mb-6 bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-sm text-destructive flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={onDismissError}
            className="text-destructive hover:opacity-70"
            type="button"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="mb-6 bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 text-sm text-primary flex items-center justify-between">
          <span>{success}</span>
          <button
            onClick={onDismissSuccess}
            className="text-primary hover:opacity-70"
            type="button"
            aria-label="Dismiss success"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
}
