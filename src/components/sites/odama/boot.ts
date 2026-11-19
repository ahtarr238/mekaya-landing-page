// Tiny event bus for the boot sequence: the hero reports 3D model download progress, the
// preloader/nav show it, and everyone hears when the boot is done.
export const BOOT_PROGRESS = "odama:boot-progress";
export const BOOT_DONE = "odama:boot-done";

export function emitBootProgress(ratio: number) {
  window.dispatchEvent(new CustomEvent<number>(BOOT_PROGRESS, { detail: ratio }));
}

export function emitBootDone() {
  document.documentElement.dataset.booted = "";
  window.dispatchEvent(new Event(BOOT_DONE));
}

export function onBootDone(cb: () => void): () => void {
  if (typeof document !== "undefined" && "booted" in document.documentElement.dataset) {
    cb();
    return () => undefined;
  }
  window.addEventListener(BOOT_DONE, cb, { once: true });
  return () => window.removeEventListener(BOOT_DONE, cb);
}

export const SCRAMBLE_GLYPHS = "ODAM:/\\";

export function scramble(text: string, revealed: number): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === " ") out += " ";
    else if (i < revealed) out += ch;
    else out += SCRAMBLE_GLYPHS[Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)];
  }
  return out;
}
