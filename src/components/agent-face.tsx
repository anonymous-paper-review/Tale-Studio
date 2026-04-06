'use client'

import { useEffect, useState } from 'react'

type Expression = 'idle' | 'thinking' | 'talking'

interface AgentFaceProps {
  expression?: Expression
  color?: string
  size?: number
  name?: string
}

export function AgentFace({
  expression = 'idle',
  color = '#E50914',
  size = 48,
  name,
}: AgentFaceProps) {
  const [blinking, setBlinking] = useState(false)
  const [mouthFrame, setMouthFrame] = useState(0)

  // Blink randomly
  useEffect(() => {
    const blink = () => {
      setBlinking(true)
      setTimeout(() => setBlinking(false), 150)
    }
    const interval = setInterval(blink, 2500 + Math.random() * 2000)
    return () => clearInterval(interval)
  }, [])

  // Mouth animation when talking
  useEffect(() => {
    if (expression !== 'talking') {
      setMouthFrame(0)
      return
    }
    const interval = setInterval(() => {
      setMouthFrame((f) => (f + 1) % 4)
    }, 120)
    return () => clearInterval(interval)
  }, [expression])

  const eyeH = blinking ? 1 : 4
  const eyeY = blinking ? 19 : 17

  // Mouth shapes
  const getMouth = () => {
    if (expression === 'thinking') {
      // Small 'o' shape
      return <ellipse cx="24" cy="30" rx="2.5" ry="2" fill="#1a1a1a" />
    }
    if (expression === 'talking') {
      const shapes = [
        <ellipse key="0" cx="24" cy="30" rx="4" ry="3" fill="#1a1a1a" />,
        <ellipse key="1" cx="24" cy="30" rx="3" ry="1.5" fill="#1a1a1a" />,
        <ellipse key="2" cx="24" cy="30" rx="5" ry="4" fill="#1a1a1a" />,
        <ellipse key="3" cx="24" cy="30" rx="3" ry="2" fill="#1a1a1a" />,
      ]
      return shapes[mouthFrame]
    }
    // Idle: gentle smile
    return (
      <path
        d="M19 28 Q24 33 29 28"
        fill="none"
        stroke="#1a1a1a"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    )
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative"
        style={{
          width: size,
          height: size,
          filter: expression === 'thinking' ? 'none' : 'none',
        }}
      >
        <svg
          viewBox="0 0 48 48"
          width={size}
          height={size}
          className="drop-shadow-sm"
        >
          {/* Head */}
          <circle
            cx="24"
            cy="24"
            r="20"
            fill={color}
            opacity="0.15"
          />
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke={color}
            strokeWidth="2"
            opacity="0.6"
          />

          {/* Eyes */}
          <ellipse cx="17" cy={eyeY} rx="2.5" ry={eyeH} fill="#1a1a1a">
            {expression === 'thinking' && (
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,0;-1,0;0,0;1,0;0,0"
                dur="2s"
                repeatCount="indefinite"
              />
            )}
          </ellipse>
          <ellipse cx="31" cy={eyeY} rx="2.5" ry={eyeH} fill="#1a1a1a">
            {expression === 'thinking' && (
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,0;-1,0;0,0;1,0;0,0"
                dur="2s"
                repeatCount="indefinite"
              />
            )}
          </ellipse>

          {/* Eye highlights */}
          {!blinking && (
            <>
              <circle cx="18" cy="16" r="1" fill="white" opacity="0.7" />
              <circle cx="32" cy="16" r="1" fill="white" opacity="0.7" />
            </>
          )}

          {/* Eyebrows */}
          <line
            x1="13.5"
            y1={expression === 'thinking' ? '12' : '13'}
            x2="20.5"
            y2={expression === 'thinking' ? '11' : '13'}
            stroke="#1a1a1a"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <line
            x1="27.5"
            y1={expression === 'thinking' ? '11' : '13'}
            x2="34.5"
            y2={expression === 'thinking' ? '12' : '13'}
            stroke="#1a1a1a"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* Mouth */}
          {getMouth()}
        </svg>

        {/* Thinking pulse ring */}
        {expression === 'thinking' && (
          <div
            className="absolute inset-0 animate-ping rounded-full opacity-20"
            style={{ border: `2px solid ${color}` }}
          />
        )}
      </div>

      {name && (
        <span className="text-[10px] font-medium text-muted-foreground">
          {name}
        </span>
      )}
    </div>
  )
}
