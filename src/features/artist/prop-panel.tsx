'use client'

// Artist 소품 묶음(D7, 오너 2026-11-22) — 소품(props 행)마다 그림 한 장짜리 카드. 카드는 다음 조각(소품 읽기 · 카드)에서 채운다.
//   columns · onZoomStep 은 인물 · 배경 묶음과 같은 축척 계약이다(슬라이더 하나가 세 묶음을 함께 바꾼다, D13).
import { useArtistStore } from '@/stores/artist-store'

export function PropPanel({
  columns = 1,
  onZoomStep,
}: { columns?: number; onZoomStep?: (dir: 1 | -1) => void } = {}) {
  const propAssets = useArtistStore((s) => s.propAssets)
  void columns
  void onZoomStep
  if (propAssets.length === 0) return null
  return <div data-testid="artist-prop-cards" />
}
