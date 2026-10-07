/** Errors that carry a message safe to show to users (no stack traces or internals). */
export type PdfErrorCode =
  | "not-a-pdf"
  | "corrupted"
  | "password-protected"
  | "too-large"
  | "empty"
  | "export-failed"
  | "unknown";

export class PdfUserError extends Error {
  constructor(
    readonly code: PdfErrorCode,
    readonly userMessage: string,
    options?: { cause?: unknown },
  ) {
    super(userMessage, options);
    this.name = "PdfUserError";
  }
}

export const MAX_FILE_BYTES = 150 * 1024 * 1024;

/** Converts anything thrown while opening a PDF into a PdfUserError. */
export function toLoadError(error: unknown): PdfUserError {
  if (error instanceof PdfUserError) return error;
  const name = (error as { name?: string } | null)?.name;
  if (name === "PasswordException") {
    return new PdfUserError(
      "password-protected",
      "This PDF is password-protected. Password-protected PDFs are not supported yet — remove the password and try again.",
      { cause: error },
    );
  }
  if (name === "InvalidPDFException") {
    return new PdfUserError("corrupted", "This PDF appears to be damaged or invalid and could not be opened.", {
      cause: error,
    });
  }
  return new PdfUserError("unknown", "Something went wrong while opening this PDF.", { cause: error });
}

export function userMessageOf(error: unknown, fallback = "Something went wrong."): string {
  return error instanceof PdfUserError ? error.userMessage : fallback;
}
