'use client'

import Image from 'next/image'
import type { StageId } from '@/types/project'

// #agent-crew(2026-08-28 오너): 공용 원형 얼굴(색만 스테이지 구분) → 스테이지별 사물 마스코트
//   GIF 로 교체 — producer=클립보드 · writer=노트 · artist=태블릿 · director=클래퍼 ·
//   editor=모니터. 상태 애니메이션은 GIF 자체에 들어 있어 예전 SVG 깜빡임/입모양 장치와
//   정적 PNG(agent-face/*.png)는 폐기했다. 에셋 2벌: full(512px)/preview(224px).
type Expression = 'idle' | 'thinking' | 'talking' | 'working' | 'happy'

const STATE_OF: Record<Expression, 'idle' | 'talking' | 'thinking' | 'working'> = {
  idle: 'idle',
  thinking: 'thinking',
  talking: 'talking',
  working: 'working',
  happy: 'talking', // 인사/호응 전용 에셋은 없다 — 입이 움직이는 talking 이 가장 가깝다
}

export function agentFaceAsset(stage: StageId, expression: Expression, size: number): string {
  // editor 는 idle 한 종뿐(채팅 에이전트가 아니라 상태 연기가 없다) — 전 상태 idle 폴백.
  const state = stage === 'editor' ? 'idle' : STATE_OF[expression]
  const variant = size > 64 ? 'full' : 'preview'
  return `/agent-face/${variant}/${stage}_${state}.gif`
}

interface AgentFaceProps {
  stage: StageId
  expression?: Expression
  size?: number
  name?: string
}

export function AgentFace({ stage, expression = 'idle', size = 48, name }: AgentFaceProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <Image
        src={agentFaceAsset(stage, expression, size)}
        alt=""
        width={size}
        height={size}
        unoptimized // 애니메이션 GIF — 옵티마이저를 거치면 정지 프레임이 된다
        className="shrink-0 object-contain drop-shadow-sm"
        style={{ width: size, height: size }}
      />
      {name && (
        <span className="text-[10px] font-medium text-muted-foreground">{name}</span>
      )}
    </div>
  )
}
