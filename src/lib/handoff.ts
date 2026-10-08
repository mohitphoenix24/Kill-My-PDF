/**
 * Passes a finished PDF from one tool to the next ("Merge → Organize → Edit text") without
 * going through the file system. Lives in module memory, which survives client-side
 * navigation but never touches a server or storage.
 */
let pending: File | null = null;

export function setHandoff(file: File): void {
  pending = file;
}

/** Returns the waiting file once, then forgets it. */
export function takeHandoff(): File | null {
  const file = pending;
  pending = null;
  return file;
}
