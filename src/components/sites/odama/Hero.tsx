"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { emitBootProgress, onBootDone, scramble } from "./boot";
import type { MachineKey, MachineProject } from "./hero/machineScene";
import { ShowreelTheatre } from "./hero/ShowreelTheatre";
import { PlayIcon } from "./hero/icons";

const PROJECTS: MachineProject[] = [
  { name: "Mimikry", marquee: "WEBSITE PROJECT - MIMIKRY", video: "/sites/odama/device/projects/mimikry.mp4" },
  { name: "Karwa", marquee: "MOBILE APP - KARWA", video: "/sites/odama/device/projects/karwa.mp4" },
  { name: "Banter", marquee: "RIVE ANIMATION - BANTER", video: "/sites/odama/device/projects/banter.mp4" },
  { name: "Socialistic", marquee: "WEBSITE PROJECT - SOCIALISTIC", video: "/sites/odama/device/projects/socialistic.mp4" },
];
const REEL_CARD = "/sites/odama/device/showreel-card.mp4";
const WORK_URL = "https://www.odama.io/work";

const REST_WORDS = ["Digital", "Agency"] as const;
const NOISE_WORDS = ["/O:D", "/\\/\\/\\:"] as const;
const REEL_WORDS = ["Watch", "Show Reel"] as const;
type Phase = "rest" | "noise" | "reel";
const phaseOf = (p: number): Phase => (p < 0.28 ? "rest" : p < 0.6 ? "noise" : "reel");

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const kickerRef = useRef<HTMLParagraphElement>(null);
  const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const chipRef = useRef<HTMLSpanElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const scanRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const reelVideoRef = useRef<HTMLVideoElement>(null);
  const sceneRef = useRef<import("./hero/machineScene").MachineScene | null>(null);
  const projectRef = useRef(0);
  const [project, setProject] = useState(0);
  const [reelActive, setReelActive] = useState(false);
  const [theatre, setTheatre] = useState(false);

  const showProject = useCallback((index: number) => {
    const next = (index + PROJECTS.length) % PROJECTS.length;
    projectRef.current = next;
    setProject(next);
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setMarqueeText(PROJECTS[next].marquee);
    const video = videoRefs.current[next];
    if (video) scene.setVideo(video);
  }, []);

  const pressKey = useCallback(
    (key: MachineKey) => {
      const scene = sceneRef.current;
      scene?.press(key, true);
      window.setTimeout(() => scene?.press(key, false), 140);
      const click = new Audio(`/sites/odama/device/sounds/click_${1 + Math.floor(Math.random() * 4)}.mp3`);
      click.volume = 0.5;
      void click.play().catch(() => undefined);
      if (key === "prev") showProject(projectRef.current - 1);
      else if (key === "next") showProject(projectRef.current + 1);
      else window.open(WORK_URL, "_blank", "noopener");
    },
    [showProject],
  );

  // 3D scene lifecycle.
  useEffect(() => {
    const canvas = canvasRef.current;
    const section = sectionRef.current;
    if (!canvas || !section) return;
    let disposed = false;
    let stopBoot = () => undefined as void;
    const still = window.matchMedia("(max-width: 767px)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    void import("./hero/machineScene").then(({ MachineScene }) => {
      if (disposed) return;
      const scene = new MachineScene(canvas, { still, reduced });
      sceneRef.current = scene;
      scene.onProgress = (r) => emitBootProgress(r);
      scene.onReady = () => {
        emitBootProgress(1);
        scene.setMarqueeText(PROJECTS[projectRef.current].marquee);
        const video = videoRefs.current[projectRef.current];
        if (video) scene.setVideo(video);
        stopBoot = onBootDone(() => {
          const start = performance.now();
          const step = (now: number) => {
            const t = clamp01((now - start) / 1400);
            scene.setEntrance(1 - Math.pow(1 - t, 3));
            if (t < 1 && !disposed) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        });
      };
      void scene.load().catch(() => emitBootProgress(1));
    });

    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);
    const io = new IntersectionObserver(([entry]) => sceneRef.current?.setVisible(entry.isIntersecting));
    io.observe(section);
    return () => {
      disposed = true;
      stopBoot();
      io.disconnect();
      window.removeEventListener("resize", onResize);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Scroll choreography: progress runs over the first 2.5 viewport heights of the section.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    let raf = 0;
    let phase: Phase | null = null;
    let active = false;
    let scrambleTimer = 0;

    const setWords = (words: readonly string[]) => {
      wordRefs.current.forEach((el, i) => {
        if (el) el.textContent = words[i];
      });
    };

    const startNoise = () => {
      window.clearInterval(scrambleTimer);
      scrambleTimer = window.setInterval(() => {
        wordRefs.current.forEach((el, i) => {
          if (el) el.textContent = scramble(NOISE_WORDS[i], 0);
        });
      }, 70);
    };

    const enterPhase = (next: Phase) => {
      if (next === phase) return;
      phase = next;
      window.clearInterval(scrambleTimer);
      const scene = sceneRef.current;
      if (next === "rest") {
        setWords(REST_WORDS);
        scene?.setNoise(false);
        const video = videoRefs.current[projectRef.current];
        if (video) scene?.setVideo(video);
      } else if (next === "noise") {
        startNoise();
        scene?.setNoise(true);
      } else {
        // Resolve the scramble into the reel words.
        let n = 0;
        const target = REEL_WORDS;
        scrambleTimer = window.setInterval(() => {
          n += 1;
          wordRefs.current.forEach((el, i) => {
            if (el) el.textContent = scramble(target[i], n);
          });
          if (n > 10) {
            window.clearInterval(scrambleTimer);
            setWords(target);
          }
        }, 45);
        scene?.setNoise(false);
        if (reelVideoRef.current) scene?.setVideo(reelVideoRef.current);
      }
    };

    const layoutKicker = (p: number, isActive: boolean) => {
      const kicker = kickerRef.current;
      const [a, b] = wordRefs.current;
      if (!kicker || !a || !b) return;
      const vw = window.innerWidth;
      const gutter = vw >= 768 ? 16 : 12;
      // The wrapper's px-4 cancels out: words land exactly on the page gutters.
      const full = vw - 2 * gutter - a.offsetWidth - b.offsetWidth;
      const drift = 0.18 * smoothstep(0.28, 0.9, p);
      const gap = isActive ? 4.5 : Math.max(4.5, full * (1 - drift));
      kicker.style.gap = `${gap}px`;
    };

    const update = () => {
      raf = 0;
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight;
      const mobile = window.innerWidth < 768;
      const p = mobile ? 0 : clamp01(-rect.top / (2.5 * vh));
      sceneRef.current?.setScroll(p);

      const r = Math.min(1, p / 0.28);
      if (titleRef.current) {
        titleRef.current.style.transform = `translateY(${140 * r}px)`;
        titleRef.current.style.opacity = String(1 - r);
      }
      if (scanRef.current) scanRef.current.style.opacity = String(smoothstep(0.75, 1, p) * 0.9);

      if (!mobile) enterPhase(phaseOf(p));
      const nowActive = !mobile && p >= 0.9;
      if (nowActive !== active) {
        active = nowActive;
        setReelActive(nowActive);
      }
      layoutKicker(p, nowActive);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    // Word widths change once Geist Pixel loads; re-measure then.
    void document.fonts?.ready.then(schedule);
    const stopBoot = onBootDone(schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      stopBoot();
      window.clearInterval(scrambleTimer);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  // Pointer: tilt the machine, hover/press keys.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      sceneRef.current?.setPointer(x, y, true);
      const key = sceneRef.current?.hitKey(e.clientX, e.clientY) ?? null;
      section.dataset.cursor = key ? "pointer" : "";
    };
    const onLeave = () => sceneRef.current?.setPointer(0, 0, false);
    const onClick = (e: MouseEvent) => {
      if (window.scrollY > window.innerHeight * 0.6) return;
      const key = sceneRef.current?.hitKey(e.clientX, e.clientY);
      if (key) pressKey(key);
    };
    const onKey = (e: KeyboardEvent) => {
      if (window.scrollY > window.innerHeight || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") pressKey("prev");
      else if (e.key === "ArrowRight") pressKey("next");
      else if (e.key.toLowerCase() === "f") setTheatre(true);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    section.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      section.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [pressKey]);

  return (
    <>
      <section
        ref={sectionRef}
        aria-label="Odama"
        style={{ "--hero-h": "calc(100lvh * (2 + 2.5 + 0.25))", background: "#eeeeee" } as React.CSSProperties}
        className="relative h-[max(100lvh,var(--screen-h,0px))] md:h-[var(--hero-h)] data-[cursor=pointer]:cursor-pointer"
      >
        <div className="sticky top-0 h-[100lvh] overflow-hidden" style={{ background: "#eeeeee" }}>
          {/* Backdrop: the source paints a soft lit studio wall behind the machine. */}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(45% 45% at 50% 55%, rgba(255,255,255,0.55), rgba(255,255,255,0) 100%), radial-gradient(120% 120% at 50% 50%, transparent 70%, rgba(150,150,150,0.10) 100%), #eeeeee",
            }}
          />
          <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 size-full" />
          <div ref={scanRef} aria-hidden="true" className="lcd-scan pointer-events-none absolute inset-0 max-md:hidden" style={{ opacity: 0 }} />

          <div className="pointer-events-none absolute inset-x-0 top-0 h-[100svh]">
            <div className="pointer-events-none absolute inset-x-0 bottom-0 page-x pb-[clamp(1.5rem,4.5vh,2.75rem)]">
              <h1
                ref={titleRef}
                className="selection-blend pointer-events-auto max-w-[11em] text-h1 font-medium text-[#161617] md:max-w-[14em] md:text-white lg:max-w-[24em] md:mix-blend-difference phone-land:max-w-[32vw] phone-land:text-[1.5rem] phone-land:text-[#161617] phone-land:mix-blend-normal"
              >
                <span className="lg:whitespace-nowrap">We design products that feel clear</span>{" "}
                <span className="lg:whitespace-nowrap">from the first interaction.</span>
              </h1>
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center max-md:hidden">
              <div
                className={`flex items-center gap-2.5 ${reelActive ? "pointer-events-auto cursor-pointer" : ""}`}
                onClick={() => reelActive && setTheatre(true)}
              >
                <div className="relative px-4 py-3">
                  <span
                    ref={chipRef}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-chip backdrop-blur-sm transition-[opacity,transform] duration-[450ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
                    style={{
                      backgroundColor: "rgba(0,0,0,0.55)",
                      opacity: reelActive ? 1 : 0,
                      transform: reelActive ? "scale(1)" : "scale(0.72,0.86)",
                    }}
                  />
                  <p
                    ref={kickerRef}
                    className="relative flex items-center text-base leading-none tracking-[-0.02em] transition-[gap] duration-[450ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
                    style={{ gap: "0.28em" }}
                  >
                    {REST_WORDS.map((w, i) => (
                      <span
                        key={w}
                        ref={(el) => {
                          wordRefs.current[i] = el;
                        }}
                        className={`selection-blend block whitespace-pre ${reelActive ? "text-white" : "text-white mix-blend-difference"}`}
                      >
                        {w}
                      </span>
                    ))}
                  </p>
                </div>
                <button
                  ref={playRef}
                  type="button"
                  aria-label="Play show reel"
                  tabIndex={reelActive ? 0 : -1}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTheatre(true);
                  }}
                  className="relative isolate grid size-10 cursor-pointer place-items-center rounded-[20px] text-white backdrop-blur-sm transition-[opacity,transform,background-color] duration-[450ms] ease-[cubic-bezier(0.34,1.4,0.5,1)] hover:bg-black/70"
                  style={{
                    backgroundColor: "rgba(0,0,0,0.55)",
                    opacity: reelActive ? 1 : 0,
                    transform: reelActive ? "none" : "translateX(-16px) scale(0.55)",
                  }}
                >
                  <PlayIcon size={14} />
                </button>
              </div>
            </div>
          </div>

          <div className="sr-only">
            <p>
              Showing project: {PROJECTS[project].name}. Use the arrow keys to change project and Enter to see the work, or F to watch the show
              reel.
            </p>
            <button type="button" onClick={() => pressKey("prev")}>
              Previous project
            </button>
            <button type="button" onClick={() => pressKey("next")}>
              Next project
            </button>
            <button type="button" onClick={() => pressKey("select")}>
              See the work
            </button>
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-hidden opacity-0">
            {PROJECTS.map((p, i) => (
              <video
                key={p.video}
                ref={(el) => {
                  videoRefs.current[i] = el;
                }}
                src={p.video}
                muted
                loop
                playsInline
                crossOrigin="anonymous"
                preload={i === 0 ? "auto" : "metadata"}
              />
            ))}
            <video ref={reelVideoRef} src={REEL_CARD} muted loop playsInline preload="none" aria-label="Odama show reel" />
          </div>
        </div>
      </section>
      <ShowreelTheatre open={theatre} onClose={() => setTheatre(false)} />
    </>
  );
}
