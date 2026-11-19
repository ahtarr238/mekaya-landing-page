import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";

let registered = false;

/** The source registers `odama` = cubic-bezier(0.16, 1, 0.3, 1) as a named GSAP ease. */
export function registerOdamaEase(): string {
  if (!registered) {
    gsap.registerPlugin(CustomEase);
    CustomEase.create("odama", "0.16, 1, 0.3, 1");
    registered = true;
  }
  return "odama";
}
