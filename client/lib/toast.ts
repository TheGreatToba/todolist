import { toast as sonnerToast } from "sonner";

/**
 * Unified UI feedback for success, error and info messages across Manager and Employee dashboards.
 * Uses Sonner toasts (Toaster is mounted in App.tsx).
 */
export function toastSuccess(message: string, description?: string) {
  sonnerToast.success(message, description ? { description } : undefined);
}

export function toastError(message: string, description?: string) {
  sonnerToast.error(message, description ? { description } : undefined);
}

export function toastInfo(message: string, description?: string) {
  sonnerToast.info(message, description ? { description } : undefined);
}
