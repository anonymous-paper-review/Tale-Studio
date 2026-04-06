'use client'

import { useEffect, useRef, useState } from 'react'

interface TypingTextProps {
  text: string
  speed?: number
  onDone?: () => void
  onTyping?: (isTyping: boolean) => void
}

export function TypingText({ text, speed = 8, onDone, onTyping }: TypingTextProps) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const onDoneRef = useRef(onDone)
  const onTypingRef = useRef(onTyping)
  onDoneRef.current = onDone
  onTypingRef.current = onTyping

  useEffect(() => {
    setDisplayed('')
    setDone(false)
    onTypingRef.current?.(true)
    let i = 0
    const interval = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) {
        clearInterval(interval)
        setDone(true)
        onTypingRef.current?.(false)
        onDoneRef.current?.()
      }
    }, speed)
    return () => {
      clearInterval(interval)
      onTypingRef.current?.(false)
    }
  }, [text, speed])

  return (
    <span>
      {displayed}
      {!done && <span className="animate-pulse">|</span>}
    </span>
  )
}
