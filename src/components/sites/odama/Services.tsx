"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import type { ServiceScene } from "./services/serviceScene";
import { HighlightFire } from "./services/HighlightFire";
import { canHover, prefersReducedMotion, useCanHover } from "./footer/hooks";
import { registerOdamaEase } from "./footer/odamaEase";

const SERVICES = [
  { name: "Product", mark: "UI", icon: "/sites/odama/homepage/services/ui.svg" },
  { name: "Brand Story", mark: "Branding", icon: "/sites/odama/homepage/services/branding.svg" },
  { name: "End-to-End Website", mark: "Website", icon: "/sites/odama/homepage/services/website.svg" },
  { name: "Launch & Promotional", mark: "Graphic", icon: "/sites/odama/homepage/services/graphic-design.svg" },
] as const;

/** What the voxel object shows while no service is hovered. */
const IDLE_SHAPE = "Device";
const GLB = "/sites/odama/services/service-icons.glb";

export function Services() {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [ready, setReady] = useState(false);
  const hover = useCanHover();
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const sceneRef = useRef<ServiceScene | null>(null);

  // Build the scene lazily (when the section nears the viewport, or when the browser is idle),
  // render only while the canvas is on screen, and tear everything down on unmount.
  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!section || !canvas || !stage) return;
    let dead = false;
    let visible = false;
    let started = false;
    const boot = () => {
      if (started) return;
      started = true;
      import("./services/serviceScene")
        .then(({ createServiceScene }) =>
          createServiceScene(canvas, stage, {
            reduced: prefersReducedMotion(),
            maxDpr: canHover() ? 2 : 1.5,
            start: IDLE_SHAPE,
            glbUrl: GLB,
            cancelled: () => dead,
          }),
        )
        .then((scene) => {
          if (!scene) return;
          if (dead) {
            scene.destroy();
            return;
          }
          sceneRef.current = scene;
          scene.run(visible);
          setReady(true);
        })
        .catch((err: unknown) => {
          if (process.env.NODE_ENV !== "production") console.warn("services scene failed", err);
        });
    };
    const near = new IntersectionObserver(([e]) => e.isIntersecting && boot(), { rootMargin: "800px 0px" });
    const onScreen = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      sceneRef.current?.run(visible);
    });
    near.observe(section);
    onScreen.observe(canvas);
    const ric = window.requestIdleCallback;
    const idle = typeof ric === "function" ? ric(boot, { timeout: 4000 }) : window.setTimeout(boot, 1500);
    return () => {
      dead = true;
      if (typeof ric === "function") window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      near.disconnect();
      onScreen.disconnect();
      sceneRef.current?.destroy();
      sceneRef.current = null;
    };
  }, []);

  // Touch devices always show the selected service; mouse users see it while hovering the list.
  const showing = hovered || !hover;
  useEffect(() => {
    sceneRef.current?.show(showing ? SERVICES[index].mark : IDLE_SHAPE);
  }, [index, showing, ready]);

  // The voxel object leans toward the pointer.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || !canHover()) return;
    const move = (e: PointerEvent) => {
      const r = section.getBoundingClientRect();
      sceneRef.current?.lean(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
    };
    const leave = () => sceneRef.current?.lean(0, 0);
    section.addEventListener("pointermove", move, { passive: true });
    section.addEventListener("pointerleave", leave);
    return () => {
      section.removeEventListener("pointermove", move);
      section.removeEventListener("pointerleave", leave);
    };
  }, []);

  // The highlight glides to the selected row.
  useEffect(() => {
    const pill = pillRef.current;
    const row = listRef.current?.children[index + 1] as HTMLElement | undefined;
    if (!pill || !row) return;
    const ease = registerOdamaEase();
    const tween = gsap.to(pill, {
      y: row.offsetTop,
      height: row.offsetHeight,
      duration: prefersReducedMotion() ? 0 : 0.55,
      ease,
      overwrite: "auto",
    });
    return () => {
      tween.kill();
    };
  }, [index]);

  return (
    <section ref={sectionRef} id="services" aria-labelledby="services-title" className="relative bg-bg section-y">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -inset-y-24 z-10 block h-[calc(100%+12rem)] w-full transition-opacity duration-700"
        style={{ opacity: ready ? 1 : 0 }}
      />
      <div className="page-x">
        <div className="grid gap-x-2 gap-y-3 md:grid-cols-12">
          <p id="services-title" className="u-label md:col-span-6">
            Services
          </p>
          <h2 className="text-h2 font-medium leading-none tracking-[-0.01em] text-pretty md:col-span-4 md:col-start-7 md:text-h3">
            We approach design as a process of understanding. Each service is a step toward clarity.
          </h2>
        </div>
      </div>
      <div className="relative mt-10 md:mt-20">
        <div
          ref={stageRef}
          aria-hidden="true"
          className="pointer-events-none relative mx-auto aspect-[4/3] w-[min(92vw,480px)] md:absolute md:top-1/2 md:left-[14%] md:w-[min(34vw,560px)] md:-translate-y-1/2"
        />
        <ul ref={listRef} className="relative mt-6 md:mt-0" onPointerLeave={() => setHovered(false)}>
          <span
            ref={pillRef}
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-[var(--gutter)] top-0 h-12 overflow-hidden rounded-card bg-surface transition-opacity duration-500 ${
              showing ? "opacity-100" : "opacity-0"
            }`}
          >
            <HighlightFire active={showing} />
          </span>
          {SERVICES.map((s, i) => (
            <li
              key={s.name}
              className="relative page-x"
              onPointerEnter={(e) => {
                if (e.pointerType !== "mouse") return;
                setHovered(true);
                setIndex(i);
              }}
            >
              <button
                type="button"
                aria-pressed={index === i}
                onClick={() => setIndex(i)}
                onFocus={() => {
                  setIndex(i);
                  setHovered(true);
                }}
                onBlur={() => setHovered(false)}
                className="grid w-full grid-cols-12 items-center gap-x-2 py-1 text-left md:py-1.5"
              >
                <span className="relative z-20 col-span-2 pl-2 text-sm font-medium tabular-nums md:col-span-1">
                  [{String(i + 1).padStart(2, "0")}]
                </span>
                <span
                  className={`col-span-10 flex items-center gap-3 whitespace-nowrap text-[clamp(18px,5.6vw,28px)] leading-[1.15] tracking-[-0.02em] transition-colors duration-300 md:col-span-6 md:col-start-7 md:text-[40px] ${
                    index === i ? "text-ink" : "text-ink/85"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="size-6 shrink-0 bg-current md:size-8"
                    style={{
                      WebkitMask: `url(${s.icon}) center / contain no-repeat`,
                      mask: `url(${s.icon}) center / contain no-repeat`,
                    }}
                  />
                  {s.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
