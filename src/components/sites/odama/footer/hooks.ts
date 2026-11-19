"use client";

import { useSyncExternalStore } from "react";

function mediaStore(query: string) {
  return (cb: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  };
}

const HOVER = "(hover: hover) and (pointer: fine)";
const subscribeHover = mediaStore(HOVER);
const subscribeMobile = mediaStore("(max-width: 767px)");

/** Fine pointer with hover. Server snapshot is `serverValue` (the source assumes hover until mounted). */
export function useCanHover(serverValue = true) {
  return useSyncExternalStore(
    subscribeHover,
    () => window.matchMedia(HOVER).matches,
    () => serverValue,
  );
}

export function useIsMobile() {
  return useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}

export const canHover = () => window.matchMedia(HOVER).matches;
export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
