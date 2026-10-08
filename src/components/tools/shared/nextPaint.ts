/** Lets React paint a "working…" state before a long synchronous job (building a big PDF) starts. */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}
