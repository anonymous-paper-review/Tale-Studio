'use client'

// 제목 클립 그림(2단계 ⑥, 시안 E2) — 모니터의 글자 층(TitleTextLayer)과 타임라인 클립 얼굴(TitleClipFace).
//   글자는 흰색 굵은 글씨로 화면 폭 80% 에서 줄을 바꾸고, 줄 · 크기 · 자리는 src/lib/editor/title-clip.ts 가 정한다 — 내보내기(drawTitleText)와
//   같은 셈 · 같은 글꼴로 잰 줄이라 같은 줄 · 같은 자리에 그려진다(2단계 ⑦). 모션은 글자 덩어리를 화면 폭 · 높이 비율만큼 옮기고 가운데를 기준으로
//   키운다(영상 클립과 같은 셈). 불투명도 · 옅기는 모니터 재생 고리가 바깥 틀에 입힌다.
//   약속: tests/editor/title-clips.test.ts · tests/editor/frame-plan.test.ts
import { TITLE_FONT_FAMILY } from '@/lib/editor/title-card'
import { TITLE_TEXT_WIDTH, titleTextBox, titleTextFont, titleTextGeometry, titleTextLines } from '@/lib/editor/title-clip'
import { useT } from '@/lib/i18n'
import type { ClipMotion, TitleTextData } from '@/types'

let measureCanvas: HTMLCanvasElement | null = null
/** 내보내기와 같은 글꼴로 글자 폭을 잰다(화면 밖 캔버스). 화면이 없으면(서버 그림) 글자 수로 어림한다. */
function measureWith(font: string): (s: string) => number {
  if (typeof document === 'undefined') return (s) => s.length * 10
  measureCanvas ??= document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) return (s) => s.length * 10
  ctx.font = font
  return (s) => ctx.measureText(s).width
}

/** 모니터 화면 틀(시퀀스 비율) 위에 얹는 제목 글자 — 빈 글자는 아무것도 그리지 않는다. */
export function TitleTextLayer({ data, frameWidth, frameHeight, motion }: { data: TitleTextData; frameWidth: number; frameHeight: number; motion?: ClipMotion }) {
  if (!data.text.trim()) return null
  const box = titleTextBox(data, frameHeight)
  const lines = titleTextLines(data.text, frameWidth * TITLE_TEXT_WIDTH, measureWith(titleTextFont(box.fontPx)))
  if (lines.length === 0) return null
  const geo = titleTextGeometry(box, lines.length, frameHeight)
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={motion ? { transform: `translate(${motion.x * 100}%, ${motion.y * 100}%) scale(${motion.scale})` } : undefined}
    >
      {/* 배경 띠 — 아래쪽 화면 폭 전체의 반투명 검은 띠(시안 E2 409:5252, "자리인지 꾸밈인지"는 디자이너에게 여쭐 것). */}
      {geo.band ? <div className="absolute inset-x-0 bg-black/55" style={{ top: geo.band.top, height: geo.band.height }} /> : null}
      {lines.map((line, i) => (
        <div
          key={i}
          className="absolute inset-x-0 whitespace-pre text-center font-bold text-white"
          style={{ top: geo.top + i * geo.lineHeight, height: geo.lineHeight, lineHeight: `${geo.lineHeight}px`, fontSize: box.fontPx, fontFamily: TITLE_FONT_FAMILY }}
        >
          {line || ' '}
        </div>
      ))}
    </div>
  )
}

/** 타임라인 제목 클립 얼굴 — "T 글자"(시안 E2 409:5500). 색은 지금 토큰(결정 페이지: 장미색 대신 토큰 색). */
export function TitleClipFace({ text }: { text: string }) {
  const t = useT()
  return (
    <div className="pointer-events-none flex h-full w-full items-start gap-1 overflow-hidden bg-surface-elevated px-2 py-1.5">
      <span className="font-num text-[10.5px] font-bold leading-[13px] text-foreground">T</span>
      <span className="min-w-0 truncate text-[10.5px] font-medium leading-[13px] text-foreground">{text.trim() || t('New title')}</span>
    </div>
  )
}
