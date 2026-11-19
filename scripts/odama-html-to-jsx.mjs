// Converts server-rendered HTML fragments from odama.io into JSX snippets.
// Research helper only: the output is a starting point that is then edited by hand.
// Usage: NODE_PATH=<dir with node-html-parser> node scripts/odama-html-to-jsx.mjs <in.html> [out.jsx]
// Also appends every referenced asset URL to docs/research/odama/assets.txt.
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parse } = require("node-html-parser");

const ATTR_MAP = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  srcset: "srcSet",
  crossorigin: "crossOrigin",
  autoplay: "autoPlay",
  playsinline: "playsInline",
  readonly: "readOnly",
  maxlength: "maxLength",
  minlength: "minLength",
  autocomplete: "autoComplete",
  enterkeyhint: "enterKeyHint",
  inputmode: "inputMode",
  fetchpriority: "fetchPriority",
  spellcheck: "spellCheck",
  contenteditable: "contentEditable",
  datetime: "dateTime",
  popovertarget: "popoverTarget",
  popovertargetaction: "popoverTargetAction",
  viewbox: "viewBox",
  "xlink:href": "xlinkHref",
  "xmlns:xlink": "xmlnsXlink",
  "xml:space": "xmlSpace",
  colspan: "colSpan",
  rowspan: "rowSpan",
  allowfullscreen: "allowFullScreen",
  formaction: "formAction",
  formmethod: "formMethod",
  novalidate: "noValidate",
  accesskey: "accessKey",
  usemap: "useMap",
  preserveaspectratio: "preserveAspectRatio",
  gradientunits: "gradientUnits",
  gradienttransform: "gradientTransform",
  patternunits: "patternUnits",
  maskunits: "maskUnits",
  clippathunits: "clipPathUnits",
  filterunits: "filterUnits",
  stddeviation: "stdDeviation",
};
const BOOLEAN = new Set([
  "hidden", "muted", "loop", "playsInline", "autoPlay", "disabled", "checked", "open", "required",
  "readOnly", "multiple", "selected", "defer", "async", "allowFullScreen", "noValidate", "inert",
]);
const OMIT = new Set(["data-dgst"]);

const assets = new Set();

function camel(name) {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function localUrl(url) {
  if (!url) return url;
  let u = url.trim();
  const m = u.match(/^\/_next\/image\?url=([^&]+)/);
  if (m) u = decodeURIComponent(m[1]);
  if (u.startsWith("https://www.odama.io/")) u = u.slice("https://www.odama.io".length);
  if (u.startsWith("/") && !u.startsWith("//") && /\.(webp|png|jpe?g|svg|gif|avif|mp4|webm|mp3|wav|glb|woff2?)(\?|$)/i.test(u)) {
    assets.add(u);
    return "/sites/odama" + u;
  }
  return url;
}

function styleToObject(style) {
  const out = [];
  for (const decl of style.split(/;(?![^(]*\))/)) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    let value = decl.slice(i + 1).trim();
    if (!prop) continue;
    value = value.replace(/url\(([^)]+)\)/g, (all, inner) => `url(${localUrl(inner.replace(/["']/g, ""))})`);
    const key = prop.startsWith("--") ? JSON.stringify(prop) : camel(prop.replace(/^-ms-/, "ms-"));
    out.push(`${key}: ${JSON.stringify(value)}`);
  }
  return `{{ ${out.join(", ")} }}`;
}

function attrName(name, isSvg) {
  const lower = name.toLowerCase();
  if (ATTR_MAP[lower]) return ATTR_MAP[lower];
  if (lower.startsWith("data-") || lower.startsWith("aria-")) return lower;
  if (isSvg && lower.includes("-")) return camel(lower);
  if (lower.includes(":")) return camel(lower.replace(":", "-"));
  return name;
}

function escapeText(t) {
  return t.replace(/[{}]/g, (c) => `{"${c}"}`).replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function convert(node, depth, inSvg) {
  if (node.nodeType === 8) return ""; // comment
  if (node.nodeType === 3) {
    const t = node.rawText;
    if (!t.trim()) return t.includes("\n") ? "" : t ? " " : "";
    return escapeText(t);
  }
  const tag = node.rawTagName;
  if (!tag) return node.childNodes.map((c) => convert(c, depth, inSvg)).join("");
  if (tag === "template" || tag === "script" || tag === "noscript") return "";
  const isSvg = inSvg || tag === "svg";
  const parts = [];
  for (const [rawName, rawValue] of Object.entries(node.rawAttributes)) {
    if (OMIT.has(rawName)) continue;
    const name = attrName(rawName, isSvg);
    let value = rawValue;
    if (name === "style") {
      parts.push(`style=${styleToObject(value)}`);
      continue;
    }
    if (["src", "href", "poster", "xlinkHref", "data-src"].includes(name)) value = localUrl(value);
    if (name === "srcSet") value = value.split(",").map((s) => { const [u, d] = s.trim().split(/\s+/); return [localUrl(u), d].filter(Boolean).join(" "); }).join(", ");
    if (BOOLEAN.has(name) && (value === "" || value === name)) {
      parts.push(name === "checked" ? "defaultChecked" : name);
      continue;
    }
    if (name === "value" && (tag === "input" || tag === "textarea")) {
      parts.push(`defaultValue=${JSON.stringify(value)}`);
      continue;
    }
    if (name === "popover" && value === "") value = "auto";
    parts.push(`${name}=${JSON.stringify(value)}`);
  }
  const open = `<${tag}${parts.length ? " " + parts.join(" ") : ""}`;
  const kids = node.childNodes.map((c) => convert(c, depth + 1, isSvg)).join("");
  if (!kids.trim()) return `${open} />`;
  return `${open}>${kids}</${tag}>`;
}

const [input, output] = process.argv.slice(2);
const html = fs.readFileSync(input, "utf8");
const root = parse(html, { comment: false, blockTextElements: { script: false, style: true, pre: true } });
const jsx = convert(root, 0, false);
if (output) fs.writeFileSync(output, jsx);
else process.stdout.write(jsx);
fs.appendFileSync("docs/research/odama/assets.txt", [...assets].join("\n") + "\n");
