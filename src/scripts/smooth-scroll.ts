import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;

/* Smooth scrolling, driven by the GSAP ticker so ScrollTrigger stays in step. */
export function startSmoothScroll() {
  if (lenis || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  lenis = new Lenis({ autoRaf: false, anchors: true });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

/** Scrolls an element to the middle of the screen, through Lenis when it runs. */
export function scrollToCenter(element: HTMLElement) {
  if (lenis) {
    lenis.scrollTo(element, { offset: -(window.innerHeight - element.offsetHeight) / 2 });
  } else {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
