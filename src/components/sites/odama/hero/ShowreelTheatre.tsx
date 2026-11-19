"use client";

import { useEffect, useRef } from "react";

/** Full-screen show reel player (the source's `lite-theatre` popover: black/85 backdrop). */
export function ShowreelTheatre({ open, onClose }: { open: boolean; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!open || !video) return;
    video.currentTime = 0;
    void video.play().catch(() => undefined);
    window.lenis?.stop();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      video.pause();
      window.lenis?.start();
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Odama show reel"
      aria-hidden={!open}
      onClick={onClose}
      className={`fixed inset-0 z-[120] flex flex-col items-center justify-center bg-black/85 p-[var(--gutter)] transition-opacity duration-300 ${open ? "opacity-100" : "pointer-events-none invisible opacity-0"}`}
    >
      <video
        ref={videoRef}
        controls
        playsInline
        preload="none"
        poster="/sites/odama/device/showreel-poster.webp"
        className="max-h-full w-full max-w-[1600px] rounded-card bg-black object-contain"
        onClick={(e) => e.stopPropagation()}
      >
        <source src="/sites/odama/device/showreel-720.mp4" media="(max-width: 767px)" type="video/mp4" />
        <source src="/sites/odama/device/showreel-1080.mp4" type="video/mp4" />
      </video>
      <button
        type="button"
        onClick={onClose}
        className="glass-chip absolute top-[max(1rem,env(safe-area-inset-top))] right-[var(--gutter)] flex h-10 items-center px-4 text-sm font-medium"
      >
        Close
      </button>
    </div>
  );
}
