"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

export function useTabIndicator<K extends string>(activeId: K) {
  const refs = useRef(new Map<K, HTMLButtonElement>())
  const [rect, setRect] = useState<{ left: number; width: number } | null>(null)

  const measure = useCallback(() => {
    const el = refs.current.get(activeId)
    if (el) setRect({ left: el.offsetLeft, width: el.offsetWidth })
  }, [activeId])

  useLayoutEffect(() => {
    measure()
  }, [measure])

  useEffect(() => {
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [measure])

  const setRef = (id: K) => (el: HTMLButtonElement | null) => {
    if (el) refs.current.set(id, el)
    else refs.current.delete(id)
  }

  return { rect, setRef }
}
