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

  const eyeH = blinking ? 1 : 4.5
  const eyeY = blinking ? 20 : 18

  // Mouth shapes
  const getMouth = () => {
    if (expression === 'thinking') {
      return <ellipse cx="24" cy="31" rx="2.5" ry="2" fill="#555" />
    }
    if (expression === 'talking') {
      const shapes = [
        <ellipse key="0" cx="24" cy="31" rx="4" ry="3.5" fill="#555" />,
        <ellipse key="1" cx="24" cy="31" rx="3" ry="1.5" fill="#555" />,
        <ellipse key="2" cx="24" cy="31" rx="5" ry="4" fill="#555" />,
        <ellipse key="3" cx="24" cy="31" rx="3" ry="2" fill="#555" />,
      ]
      return shapes[mouthFrame]
    }
    // Idle: gentle smile
    return (
      <path
        d="M19 29 Q24 34 29 29"
        fill="none"
        stroke="#555"
        strokeWidth="2"
        strokeLinecap="round"
      />
    )
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 48 48"
          width={size}
          height={size}
          className="drop-shadow-md"
        >
          {/* White face circle */}
          <circle cx="24" cy="24" r="21" fill="white" />
          <circle
            cx="24"
            cy="24"
            r="21"
            fill="none"
            stroke={color}
            strokeWidth="2.5"
          />

          {/* Eyes */}
          <ellipse cx="16" cy={eyeY} rx="3" ry={eyeH} fill="#333">
            {expression === 'thinking' && (
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,0;-1.5,0;0,0;1.5,0;0,0"
                dur="2s"
                repeatCount="indefinite"
              />
            )}
          </ellipse>
          <ellipse cx="32" cy={eyeY} rx="3" ry={eyeH} fill="#333">
            {expression === 'thinking' && (
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,0;-1.5,0;0,0;1.5,0;0,0"
                dur="2s"
                repeatCount="indefinite"
              />
            )}
          </ellipse>

          {/* Eye highlights */}
          {!blinking && (
            <>
              <circle cx="17.5" cy="16.5" r="1.5" fill="white" />
              <circle cx="33.5" cy="16.5" r="1.5" fill="white" />
            </>
          )}

          {/* Eyebrows */}
          <path
            d={
              expression === 'thinking'
                ? 'M12 12 Q16 10 21 12'
                : 'M12 13.5 Q16 12 21 13.5'
            }
            fill="none"
            stroke="#333"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d={
              expression === 'thinking'
                ? 'M27 12 Q32 10 36 12'
                : 'M27 13.5 Q32 12 36 13.5'
            }
            fill="none"
            stroke="#333"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Cheeks (blush) */}
          <circle cx="10" cy="24" r="3" fill={color} opacity="0.15" />
          <circle cx="38" cy="24" r="3" fill={color} opacity="0.15" />

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
