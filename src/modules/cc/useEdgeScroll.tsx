import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

// Horizontal scroll affordances for the receipts table, matching the
// projection grid (useOverlayScroll): a soft veil on each side that still
// hides columns, the native bar hidden, and a slim 3px thumb riding the
// table's bottom edge (draggable). Only the visuals are copied; the grid's
// pinned headers and cloned label strip don't apply here.
export function useEdgeScroll(contentKey?: unknown) {
  const scrollRef = useRef<HTMLDivElement>(null),
    thumbRef = useRef<HTMLDivElement>(null),
    frameRef = useRef<HTMLDivElement>(null),
    quiet = useRef<number | undefined>(undefined);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const left = el.scrollLeft > 1,
      right = el.scrollLeft < el.scrollWidth - el.clientWidth - 1;
    setEdges((p) =>
      p.left === left && p.right === right ? p : { left, right },
    );
    const thumb = thumbRef.current;
    if (thumb) {
      const track = thumb.parentElement as HTMLElement;
      const size = Math.max(
        track.clientWidth * (el.clientWidth / el.scrollWidth),
        24,
      );
      const max = el.scrollWidth - el.clientWidth;
      const offset =
        max > 0 ? (track.clientWidth - size) * (el.scrollLeft / max) : 0;
      thumb.style.width = `${size}px`;
      thumb.style.transform = `translateX(${offset}px)`;
    }
  }, []);

  const onScroll = useCallback(() => {
    update();
    const frame = frameRef.current;
    if (!frame) return;
    frame.classList.add("cc-scrolling");
    window.clearTimeout(quiet.current);
    quiet.current = window.setTimeout(
      () => frame.classList.remove("cc-scrolling"),
      800,
    );
  }, [update]);

  // Re-measure on resize and whenever the rows change (tab, search, page).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      ro.disconnect();
      window.clearTimeout(quiet.current);
    };
  }, [update, contentKey]);

  // Thumb placement once it mounts (it renders only while scrollable).
  useEffect(() => {
    update();
  }, [edges, update]);

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el || e.button !== 0) return;
    e.preventDefault();
    const thumb = e.currentTarget,
      track = thumb.parentElement as HTMLElement;
    const startX = e.clientX,
      startScroll = el.scrollLeft;
    const scale =
      (el.scrollWidth - el.clientWidth) /
      Math.max(track.clientWidth - thumb.offsetWidth, 1);
    const move = (ev: PointerEvent) => {
      el.scrollLeft = startScroll + (ev.clientX - startX) * scale;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      frameRef.current?.classList.remove("cc-sb-dragging");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    frameRef.current?.classList.add("cc-sb-dragging");
  };

  const frameClass =
    "cc-scroll-frame" +
    (edges.left ? " cc-can-left" : "") +
    (edges.right ? " cc-can-right" : "");

  const affordances = (
    <>
      <div className="cc-veil cc-veil-left" aria-hidden="true" />
      <div className="cc-veil cc-veil-right" aria-hidden="true" />
      {(edges.left || edges.right) && (
        <div className="cc-sb-h" aria-hidden="true">
          <div
            className="cc-sb-thumb"
            ref={thumbRef}
            onPointerDown={startDrag}
          />
        </div>
      )}
    </>
  );

  return { scrollRef, frameRef, frameClass, onScroll, affordances };
}
