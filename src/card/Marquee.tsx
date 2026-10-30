import { useLayoutEffect, useRef, useState } from "react";

// A name too long for its row glides to its end and back, with a pause at
// each end; one that fits sits still. The distance is measured, so the speed
// stays the same for every length.
export function Marquee({ text }: { text: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      if (!box.current || !inner.current) return;
      const over = inner.current.scrollWidth - box.current.clientWidth;
      // Past the end by the fade's width, so the last letters land clear of it.
      setShift(over > 1 ? Math.ceil(over) + 16 : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [text]);
  return (
    <b ref={box} className={`rde-marquee${shift ? " is-moving" : ""}`}>
      <span
        ref={inner}
        style={
          shift
            ? ({ "--rde-shift": `-${shift}px`, "--rde-time": `${Math.max(6, 4 + shift / 18)}s` } as React.CSSProperties)
            : undefined
        }
      >
        {text}
      </span>
    </b>
  );
}
