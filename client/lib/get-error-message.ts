/**
 * Extracts a user-facing error message from an unknown error, with a fallback.
 * Use this before calling toastError or logging to avoid empty or inconsistent messages.
 * Handles: null/undefined, string, Error, and objects with a string "message" (e.g. API errors).
 * Trims whitespace and treats empty results as fallback.
 *
 * Discipline: every new UI error should go through this helper (single point of normalization).
 * When adding support for response.data.message (e.g. Axios/fetch): add a dedicated test first,
 * then extend the implementation minimally (TDD).
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error == null) return fallback;
  if (typeof error === "string") {
    const s = error.trim();
    return s || fallback;
  }
  if (error instanceof Error && error.message) {
    const s = error.message.trim();
    return s || fallback;
  }
  if (
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    const s = (error as { message: string }).message.trim();
    return s || fallback;
  }
  return fallback;
}
