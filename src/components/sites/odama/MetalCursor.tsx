"use client";

import { useEffect, useRef } from "react";

type Kind = "metal" | "pointer" | "grab" | "grabbing" | "input";

// Image size (px) and hotspot as a fraction of the image, matching the source sprites.
const SPRITES: Record<Kind, { src: string; w: number; h: number; hx: number; hy: number }> = {
  metal: { src: "/sites/odama/device/cursor-metal-sm.webp", w: 216, h: 289, hx: 0.04, hy: 0.03 },
  pointer: { src: "/sites/odama/device/cursor-pointer-sm.webp", w: 248, h: 248, hx: 0.14, hy: 0.04 },
  grab: { src: "/sites/odama/device/cursor-grab-sm.webp", w: 265, h: 285, hx: 0.45, hy: 0.35 },
  grabbing: { src: "/sites/odama/device/cursor-grabbing-sm.webp", w: 268, h: 253, hx: 0.45, hy: 0.4 },
  input: { src: "/sites/odama/device/cursor-input-sm.webp", w: 193, h: 272, hx: 0.5, hy: 0.5 },
};
const HEIGHT = 26;

function kindFor(target: Element | null, down: boolean): Kind {
  if (!target) return "metal";
  const el = target.closest<HTMLElement>("input:not([type=button]):not([type=submit]),textarea,[contenteditable=true],[data-cursor],a,button,summary,label,[role=button],.cursor-pointer,.cursor-grab");
  if (!el) return "metal";
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable) return "input";
  const cursor = el.dataset.cursor;
  if (cursor === "grab" || el.classList.contains("cursor-grab")) return down ? "grabbing" : "grab";
  if (cursor === "") return "metal";
  return "pointer";
}

/**
 * Chrome cursor that follows a fine pointer. The native cursor is hidden only while this is
 * active (hover-capable fine pointers, no reduced motion), mirroring the source's data-metal-cursor.
 */
export function MetalCursor() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRefs = useRef<Partial<Record<Kind, HTMLImageElement | null>>>({});
  const ringRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const wrap = wrapRef.current;
    if (!fine.matches || !wrap) return;
    const root = document.documentElement;
    root.setAttribute("data-metal-cursor", "");
    let x = -100;
    let y = -100;
    let down = false;
    let kind: Kind = "metal";
    let raf = 0;

    const render = () => {
      raf = 0;
      wrap.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };
    const setKind = (next: Kind) => {
      if (next === kind) return;
      kind = next;
      for (const [k, img] of Object.entries(imgRefs.current)) {
        if (img) img.style.opacity = k === next ? "1" : "0";
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX;
      y = e.clientY;
      wrap.style.opacity = "1";
      const fromSection = (e.target as Element | null)?.closest<HTMLElement>("[data-cursor=pointer]");
      setKind(fromSection ? "pointer" : kindFor(e.target as Element | null, down));
      if (!raf) raf = requestAnimationFrame(render);
    };
    const onDown = (e: PointerEvent) => {
      down = true;
      setKind(kindFor(e.target as Element | null, true));
      const ring = ringRef.current;
      if (ring) {
        ring.getAnimations().forEach((a) => a.cancel());
        ring.animate(
          [
            { opacity: 0.9, transform: "translate(-50%,-50%) scale(0.2)" },
            { opacity: 0, transform: "translate(-50%,-50%) scale(1)" },
          ],
          { duration: 450, easing: "cubic-bezier(0.16,1,0.3,1)" },
        );
      }
    };
    const onUp = (e: PointerEvent) => {
      down = false;
      setKind(kindFor(e.target as Element | null, false));
    };
    const onLeave = () => {
      wrap.style.opacity = "0";
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      root.removeAttribute("data-metal-cursor");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-[200] opacity-0 max-md:hidden"
      style={{ transform: "translate3d(-100px,-100px,0)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={ringRef} src="/sites/odama/device/click-ring.webp" alt="" className="absolute top-0 left-0 size-12 max-w-none opacity-0" />
      {(Object.keys(SPRITES) as Kind[]).map((k) => {
        const s = SPRITES[k];
        const w = (HEIGHT * s.w) / s.h;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={k}
            ref={(el) => {
              imgRefs.current[k] = el;
            }}
            src={s.src}
            alt=""
            draggable={false}
            className="absolute max-w-none drop-shadow-[0_2px_3px_rgba(0,0,0,0.25)] transition-opacity duration-150"
            style={{ width: w, height: HEIGHT, left: -s.hx * w, top: -s.hy * HEIGHT, opacity: k === "metal" ? 1 : 0 }}
          />
        );
      })}
    </div>
  );
}
