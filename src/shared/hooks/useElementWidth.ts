import { useCallback, useRef, useState } from "react"

// Live content width (px) of whatever element the returned callback ref is
// attached to, tracked via ResizeObserver. Returns null until an element is
// attached and measured. The initial measurement happens synchronously in the
// ref callback (commit phase), so consumers re-render before first paint and
// width-dependent layout decisions don't flash.
//
// A callback ref (not a ref object) so it works on conditionally-rendered
// elements — attach/detach re-wires the observer whenever the element
// mounts or unmounts.
export default function useElementWidth(): [(el: HTMLElement | null) => void, number | null] {
  const [width, setWidth] = useState<number | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)

  const attach = useCallback((el: HTMLElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    observerRef.current = observer
  }, [])

  return [attach, width]
}
