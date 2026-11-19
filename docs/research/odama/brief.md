# odama.io clone brief (Full experience mode)

Source: https://www.odama.io/ in **Full experience** mode (cookie `odama-mode=full`). Desktop reference viewport 1440x900.
Local route: `/` -> `src/app/page.tsx`. Dev server: http://localhost:3100.

## Stack and shared files (do not edit unless you own them)
- `src/app/globals.css` (owner: lead). Tokens via `@theme`: colors `bg`, `surface`, `surface-2`, `ink`, `muted`, `line`, `accent` (#ff7021), `flame` (#ff5b01), `olive` (#6d6e5e), `glass`; text `text-display`, `text-h1`, `text-h2`, `text-h3`, `text-body`; radii `rounded-card|chip|panel|pill`; variants `phone-land:` and `pricing-stage:` (min-width 1024 + min-height 600). Component classes: `page-x`, `section-y`, `section-pt`, `glass-chip`, `glass-blur`, `pixel-icon`, `u-label`, `section-title`, `section-lead`, `faq-word`, `stream-word`, `faq-caret`, `faq-dot`, `selection-blend`, keyframes `faq-word-in`, `faq-rise-in`, `faq-caret-blink`, `faq-dot-pulse`, `stream-word-out`, `odama-marquee`, `reel-seq`. If you need more global CSS, put it in a CSS module next to your component or a `<style>` you own, not globals.css.
- Font: whole page uses **Geist Pixel** (`font-sans`, already the body default). Space Mono available as `font-space-mono`.
- `src/components/sites/odama/SmoothScroll.tsx`: Lenis + GSAP ScrollTrigger already registered. Import `{ gsap, ScrollTrigger }` from `./SmoothScroll` for scroll-driven work. three@0.170, gsap 3.12, lenis are installed. Do not add other dependencies.
- `html.js` class is set before paint; `[data-reveal]` hides elements under `html.js` (see globals.css).

## Source evidence
- Server-rendered HTML per section, already converted to JSX with Tailwind classes and local asset paths: `docs/research/odama/jsx/part-NN.jsx` (the raw HTML is `part-NN.html`). These are the initial (pre-animation) DOM states, so they are the best source for markup, copy and classes. Strip the decorative `<canvas>` hover-shader overlays (`opacity-0` spans holding a canvas) unless you implement them.
  - part-05 about, part-06..10 why (Our Value), part-11 works, part-12 services, part-13 testimonials, part-14/15 pricing, part-16 faq, part-17 contact, part-18 footer.
- Site-specific CSS (lite mode, but several rules shared): `docs/research/odama/1qc76ij-uzufh.css`; main compiled CSS: `docs/research/odama/0doyekv0igvkn.css` (selectors carry `:not(#\#)` specificity padding; ignore it).
- Screenshots of the source in Full mode at 1440x900 (scaled to 800x500), readable with the Read tool, in `C:\Users\AHTAR\.claude\projects\C--Users-AHTAR-ai-website-cloner\f860db0d-eed6-4f04-839f-dd468787ddcd\tool-results\`:
  - about: `mcp-Claude_Browser-blob-1795061932098-280nyu.jpg`, `...-vlhkiy.jpg`, `...-s028f6.jpg`
  - why/Our Value: `mcp-Claude_Browser-blob-1795061949766-4uxn4b.jpg`
  - works: `mcp-Claude_Browser-blob-1795061949766-wetx0g.jpg`
  - services: `mcp-Claude_Browser-blob-1795061949766-pzuvo5.jpg`, `mcp-Claude_Browser-blob-1795061966568-r6cbyk.jpg`
  - testimonials: `...1795061966568-r6cbyk.jpg`, `mcp-Claude_Browser-blob-1795061966569-qeuztg.jpg`, `...-1tzzh3.jpg`
  - pricing/faq pinned stage (in scroll order): `mcp-Claude_Browser-blob-1795061966569-1tzzh3.jpg`, `mcp-Claude_Browser-blob-1795061987239-lnyvzq.jpg`, `...-e26578.jpg`, `mcp-Claude_Browser-blob-1795062006622-wm44ru.jpg`, `...-otjvq5.jpg`, `...-z825jl.jpg`, `mcp-Claude_Browser-blob-1795061987240-8xs4d4.jpg`, `...-8jx6mp.jpg`
  - contact + footer: `mcp-Claude_Browser-blob-1795061987240-8jx6mp.jpg`, `mcp-Claude_Browser-blob-1795062395445-hnqn13.jpg`, `...-4f7vkh.jpg`
- Measured section geometry in full mode (document y at 1440x900): hero 0-4275 (sticky, pinned 3D), about top 3375 h 989, why 4364 h 920, works 5284 h 756, services 6040 h 584, testimonials 6624 h 1315, pricing 7875 h 2790 (pinned stage incl. FAQ), contact 10665 h 545, footer 11210 h 902.

## Assets (local, under `public/sites/odama/`, URL prefix `/sites/odama/`)
Same paths as the source with that prefix, e.g. `/sites/odama/homepage/about/clients/1.webp`, `/sites/odama/homepage/why/new-example-1.webp`, `/sites/odama/work-page/our-work/Karwa.webp`, `/sites/odama/services/service-icons.glb` (meshes: Branding, Graphic, UI, Website; material "Silver mate"; Draco NOT used), `/sites/odama/homepage/services/*.svg`, `/sites/odama/homepage/testimonial/Adam Liang.png` (spaces in names), `/sites/odama/footer/wordmark.svg`, `/sites/odama/device/showreel-card.mp4`, `/sites/odama/homepage/works/board/all-works-full.webp`. If a source asset is missing locally, download it with curl from `https://www.odama.io/<path>` into `public/sites/odama/<path>` and note it.

## Links
Keep real outbound destinations. Internal source routes (`/work`, `/work/<slug>`, `/privacy-policy`, `/machine`) are out of scope: point them to `https://www.odama.io/<path>`.

## Rules
- TypeScript strict, no `any`, named exports, 2-space indent, Tailwind utilities. Client components only where behavior needs it (`"use client"`).
- Clean up every listener, animation frame, ScrollTrigger and WebGL context on unmount.
- Respect `prefers-reduced-motion` for heavy motion.
- Only edit the files you own. Run `npx tsc --noEmit` and `npx eslint <your files>` before finishing.
- Browser: you may open your OWN new tab with the browser tools (`tabs_create`, then pass that `tabId` to every call) to inspect https://www.odama.io/ (the cookie for Full mode is already set in this browser) or http://localhost:3100. Never use or close tabs `seed` or `tab-1`. Do not click cookie banners or submit forms on the source site.
