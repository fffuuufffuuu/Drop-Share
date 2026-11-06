import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const FocusContext = createContext<{ focused: string | null; focus: (id: string | null) => void } | null>(null);
export const useWorkCardFocus = () => useContext(FocusContext);

export function WorkCardGrid({ children }: { children: ReactNode }) {
  const [focused, setFocused] = useState<string | null>(null);
  const owner = useId();
  const grid = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<HTMLElement, DOMRect>());
  function focus(id: string | null) {
    if (id) document.dispatchEvent(new CustomEvent("work-grid-focused", { detail: owner }));
    positions.current.clear();
    grid.current?.querySelectorAll<HTMLElement>(".work-preview-card").forEach(card => {
      const rect = card.getBoundingClientRect();
      card.getAnimations?.().forEach(animation => animation.cancel());
      positions.current.set(card, rect);
    });
    setFocused(id);
  }
  useEffect(() => {
    const changed = (event: Event) => { if ((event as CustomEvent).detail !== owner) focus(null); };
    document.addEventListener("work-grid-focused", changed);
    return () => document.removeEventListener("work-grid-focused", changed);
  }, [owner]);
  useLayoutEffect(() => {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const card = grid.current?.querySelector<HTMLElement>('[data-expanded="true"]');
    // Read the final grid position before FLIP applies temporary transforms.
    const bounds = card?.getBoundingClientRect();
    let focusedAnimation: Animation | undefined;
    if (!reducedMotion) {
      positions.current.forEach((before, card) => {
        const after = card.getBoundingClientRect();
        if (!after.width || !after.height || !card.animate) return;
        const animation = card.animate([
          { transformOrigin: "top left", transform: `translate(${before.x - after.x}px, ${before.y - after.y}px) scale(${before.width / after.width}, ${before.height / after.height})` },
          { transformOrigin: "top left", transform: "none" },
        ], { duration: 420, easing: "cubic-bezier(.22,.8,.25,1)" });
        if (card.dataset.expanded === "true") focusedAnimation = animation;
      });
    }
    positions.current.clear();
    if (!focused || !bounds) return;
    const documentTop = window.scrollY + bounds.top;
    let height = bounds.height;
    const reveal = () => {
      const inset = height > window.innerHeight - 48 ? 24 : (window.innerHeight - height) / 2;
      window.scrollTo({ top: Math.max(0, documentTop - inset), behavior: reducedMotion ? "instant" : "smooth" });
    };
    reveal();
    // Description loading can change the final height during expansion. Retarget
    // from layout height, never from the temporarily scaled animation bounds.
    const observer = !reducedMotion && focusedAnimation && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
        if (!card || Math.abs(card.offsetHeight - height) < 1) return;
        height = card.offsetHeight; reveal();
      }) : undefined;
    if (observer && card) observer.observe(card);
    if (focusedAnimation) void focusedAnimation.finished.then(() => observer?.disconnect(), () => observer?.disconnect());
    return () => {
      observer?.disconnect();
      if (!reducedMotion) window.scrollTo({ top: window.scrollY, behavior: "instant" });
    };
  }, [focused]);
  useEffect(() => {
    if (!focused) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (target.closest('[role="dialog"], .space-modal-overlay')) return;
      if (grid.current?.contains(target) && target.closest(".work-preview-card")) return;
      focus(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if ((event.target as Element).closest('[role="dialog"]')) return;
      const card = grid.current?.querySelector<HTMLElement>('[data-expanded="true"]');
      focus(null);
      requestAnimationFrame(() => card?.querySelector<HTMLButtonElement>(".work-preview-open-overlay")?.focus());
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [focused]);
  return <FocusContext.Provider value={{ focused, focus }}><div ref={grid} className="work-card-grid">{children}</div></FocusContext.Provider>;
}
