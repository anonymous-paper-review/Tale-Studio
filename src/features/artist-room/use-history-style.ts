'use client'

// 카드 상세 기록(시계)의 스타일 가리기(2026-10-28 오너, 프로토타입 A7) — 지금 작품 스타일과 같은 스타일 그림만 불러온다.
//   다른 스타일 버전에서 그린 그림은 보이되 꺼지고 "v{n} · {스타일} · 다른 스타일"로 어느 버전 것인지 보인다.
//   기록이 하나뿐이면(버전을 바꾼 적이 없으면) 가리지 않는다. 판정은 style-versions historyPick(그린 때의 버전).
import { useLocale, useT } from '@/lib/i18n'
import { historyPick, versionStyleLabel } from '@/lib/artist/style-versions'
import { styleIdOf } from '@/lib/series/snapshot'
import type { HistoryItemState } from '@/features/artist/detail-parts'
import { useArtistVersionStore } from '@/stores/artist-version-store'
import { useProducerStore } from '@/stores/producer-store'

export function useHistoryStyle(): { describe?: (candidate: { generatedAt?: string }) => HistoryItemState | null; hint?: string } {
  const t = useT()
  const locale = useLocale()
  const versions = useArtistVersionStore((s) => s.versions)
  const anchors = useProducerStore((s) => s.styleAnchors)
  const styleKey = useProducerStore((s) => s.styleAnchorKey)
  const custom = useProducerStore((s) => s.customStyleAnchor)
  if (versions.length < 2) return {}
  const currentStyleId = styleIdOf({ style_anchor_key: styleKey, custom_style_anchor: custom })
  const currentLabel = versionStyleLabel({ styleKey, customStyle: custom }, anchors, locale)
  return {
    describe: (candidate) => {
      if (!candidate.generatedAt) return null
      const pick = historyPick({ generatedAt: candidate.generatedAt, versions, currentStyleId })
      if (pick.loadable || !pick.version) return null
      const n = pick.version.n
      const view = versions.find((version) => version.n === n)
      const style = view ? versionStyleLabel(view, anchors, locale) : ''
      return { disabled: true, note: t('v{n} · {style} · another style', { n, style }) } // copy-ok: 버전 표기 v{n}(프로토타입 A7 그대로 소문자)
    },
    hint: t('Only the same style ({style}) can be loaded', { style: currentLabel }),
  }
}
