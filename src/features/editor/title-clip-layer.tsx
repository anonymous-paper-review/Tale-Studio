'use client'

// 제목 클립 그림(2단계 ⑥, 시안 E2) — 모니터의 글자 층(TitleTextLayer)과 타임라인 클립 얼굴(TitleClipFace).
//   글자는 흰색 굵은 글씨로 화면 폭 80% 에서 낱말로 줄을 바꾸고, 크기 · 자리는 src/lib/editor/title-clip.ts 가 정한다. 모션은 글자 덩어리를
//   화면 폭 · 높이 비율만큼 옮기고 가운데를 기준으로 키운다(영상 클립과 같은 셈). 불투명도 · 옅기는 모니터 재생 고리가 바깥 틀에 입힌다.
//   약속: tests/editor/title-clips.test.ts
import type { CSSProperties } from 'react'
import { TITLE_FONT_FAMILY } from '@/lib/editor/title-card'
import { titleTextBox } from '@/lib/editor/title-clip'
import { useT } from '@/lib/i18n'
import type { ClipMotion, TitleTextData } from '@/types'

/** 모니터 화면 틀(시퀀스 비율) 위에 얹는 제목 글자 — 빈 글자는 아무것도 그리지 않는다. */
export function TitleTextLayer({ data, frameHeight, motion }: { data: TitleTextData; frameHeight: number; motion?: ClipMotion }) {
  if (!data.text.trim()) return null
  const box = titleTextBox(data, frameHeight)
  const words = (
    <p
      className="max-w-[80%] whitespace-pre-wrap break-words text-center font-bold leading-[1.25] text-white [text-wrap:balance]"
      style={{ fontSize: box.fontPx, fontFamily: TITLE_FONT_FAMILY }}
    >
      {data.text}
    </p>
  )
  const spot: CSSProperties =
    box.place === 'top' ? { top: `${box.offsetPct}%` } : box.place === 'middle' ? { top: '50%', transform: 'translateY(-50%)' } : { bottom: `${box.offsetPct}%` }
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={motion ? { transform: `translate(${motion.x * 100}%, ${motion.y * 100}%) scale(${motion.scale})` } : undefined}
    >
      {box.place === 'band' ? (
        // 배경 띠 — 아래쪽 화면 폭 전체의 반투명 검은 띠 위에 글자(시안 E2 409:5252, "자리인지 꾸밈인지"는 디자이너에게 여쭐 것).
        <div className="absolute inset-x-0 flex justify-center bg-black/55" style={{ ...spot, paddingBlock: box.fontPx * 0.4 }}>
          {words}
        </div>
      ) : (
        <div className="absolute inset-x-0 flex justify-center" style={spot}>
          {words}
        </div>
      )}
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
