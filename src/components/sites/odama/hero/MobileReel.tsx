"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "../SmoothScroll";
import { PlayIcon } from "./icons";

const FRAMES = [1, 2, 3, 4, 5].map((n) => `/sites/odama/lite/homepage/showreel-${n}.webp`);

/** Phone-only show reel block (source: section[aria-label="Show reel"].md:hidden). */
export function MobileReel() {
  const sectionRef = useRef<HTMLElement>(null);
  const seqRef = useRef<HTMLSpanElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const seq = seqRef.current;
    if (!section || !seq || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tween = gsap.fromTo(
      seq,
      { yPercent: -9 },
      { yPercent: 9, ease: "none", scrollTrigger: { trigger: section, start: "top bottom", end: "bottom top", scrub: true } },
    );
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, []);

  const play = () => {
    setPlaying(true);
    void videoRef.current?.play().catch(() => undefined);
  };

  return (
    <section ref={sectionRef} aria-label="Show reel" className="relative h-[100svh] min-h-[560px] w-full overflow-hidden bg-black md:hidden">
      <video
        ref={videoRef}
        controls={playing}
        preload="none"
        poster="/sites/odama/device/showreel-poster.webp"
        aria-label="Odama show reel"
        className="absolute inset-0 size-full object-contain"
      >
        <source src="/sites/odama/device/showreel-720.mp4" type="video/mp4" />
      </video>
      {!playing && (
        <div className="absolute inset-0">
          <span ref={seqRef} className="absolute inset-x-0 will-change-transform" style={{ top: "-12%", bottom: "-12%" }}>
            {FRAMES.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt=""
                draggable={false}
                loading="lazy"
                className="absolute inset-0 size-full select-none object-cover"
                style={{ opacity: i === 0 ? 1 : 0, animation: "reel-seq 7.5s linear infinite backwards", animationDelay: `${i * 1.5}s` }}
              />
            ))}
          </span>
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <button
              type="button"
              aria-label="Play show reel"
              onClick={play}
              className="pointer-events-auto relative isolate grid size-[54px] cursor-pointer place-items-center rounded-[27px] bg-black/25 text-white backdrop-blur-sm"
            >
              <PlayIcon size={19} />
            </button>
          </div>
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 whitespace-nowrap text-base leading-4 text-white mix-blend-difference">
            Show
          </span>
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 whitespace-nowrap text-base leading-4 text-white mix-blend-difference">
            Reel
          </span>
        </div>
      )}
    </section>
  );
}
