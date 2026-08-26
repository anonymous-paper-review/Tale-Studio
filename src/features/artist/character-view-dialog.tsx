'use client'

import { useState } from 'react'
import { Loader2, Sparkles, RefreshCw, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { HoverBeam } from '@/components/hover-beam'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { useArtistStore } from '@/stores/artist-store'
import { CHARACTER_VIEW_LABELS, type CharacterViewKey } from '@/types/asset'
import { classifyImageStale } from '@/lib/image-provenance'
import { SAFE_RETRY_CAP } from '@/lib/artist/safe-retry'
import { useGuardedAction } from '@/hooks/use-guarded-action'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

type Props = {
  charId: string | null
  view: CharacterViewKey | null
  onClose: () => void
}

/**
 * 캐릭터 뷰 상세 — 선택 뷰 프리뷰 + 단일 뷰 재생성 (crop 폐기, 2026-06-05).
 * main = 대표 포트레이트(T2I), 방향 뷰 = main 을 reference 로 한 i2i. 각 뷰를 개별 재생성한다.
 */
export function CharacterViewDialog({ charId, view, onClose }: Props) {
  const t = useT()
  const char = useArtistStore((s) =>
    s.characterAssets.find((c) => c.characterId === charId),
  )
  const generateCharacterView = useArtistStore((s) => s.generateCharacterView)
  const updateCharacter = useArtistStore((s) => s.updateCharacter)
  const viewFailures = useArtistStore((s) => s.viewFailures)
  const retryCharacterViewSafe = useArtistStore((s) => s.retryCharacterViewSafe)
  const isGenerating = useArtistStore((s) =>
    view ? s.generatingViews.includes(`${charId}:${view}`) : false,
  )

  // 외형 프롬프트(수정 후 재생성, 월드 다이얼로그와 대칭) — 대상(캐릭터×뷰) 전환 시 초기화.
  const [prompt, setPrompt] = useState('')
  const [promptKey, setPromptKey] = useState<string | null>(null)

  // 클릭 즉시 잠금(#double-fire) — generatingViews 는 sendCharacterPatchNow 왕복 *뒤에* 세워지므로,
  //   느린 서버에서 그 사이 버튼이 열려 있어 두 번째 클릭이 기존 중복 가드까지 통과했다.
  //   아래 훅은 store 상태를 기다리지 않고 클릭 순간 잠그고, busy 가 올라오면 잠금을 넘긴다.
  const generate = useGuardedAction({
    actionKey: `artist:character:${charId}:${view}`,
    stage: 'artist',
    label: t('Character image'),
    busy: isGenerating,
    action: async () => {
      if (!char || !view) return
      // 프롬프트가 편집됐으면 원천(appearance)에 먼저 반영 — 생성 직전 flush(#11)가 저장을 보장.
      const next = prompt.trim()
      const base = char.appearanceNative || char.fixedPrompt || ''
      if (view === 'main' && next && next !== base) {
        updateCharacter(char.characterId, { appearance: next })
      }
      await generateCharacterView(char.characterId, view)
    },
  })
  const safeRetry = useGuardedAction({
    actionKey: `artist:character-safe:${charId}:${view}`,
    stage: 'artist',
    label: t('Character image (bypass retry)'),
    busy: isGenerating,
    action: async () => {
      if (!char || !view) return
      await retryCharacterViewSafe(char.characterId, view)
    },
  })

  const open = !!charId && !!view
  if (!open || !char || !view) return null

  const imageUrl = char.views[view] ?? null
  const label = t(CHARACTER_VIEW_LABELS[view])
  const isObject = char.entityType === 'object'
  // object 캐릭터는 방향뷰 개념 없음 — isDirectional/needsMain 로직 미적용
  const isDirectional = !isObject && view !== 'main'
  const needsMain = isDirectional && !char.views.main
  // 사람 main = 와이드 턴어라운드 시트 → 넓은 다이얼로그 + 16:9 프레임으로 전체 표시(잘림 방지, #4).
  const isSheet = !isObject && view === 'main'

  const initialPrompt = char.appearanceNative || char.fixedPrompt || ''
  const key = `${charId}:${view}`
  if (promptKey !== key) {
    setPromptKey(key)
    setPrompt(initialPrompt)
  }

  // stale 원인 분류(027): look-pending(룩만 도착) vs edited(외형 변경). dialog 포커스에서만 표시.
  const candidates = char.viewCandidates[view] ?? []
  const selectedCandidate = candidates.find((c) => c.isSelected)
  const staleClass = classifyImageStale(char.fixedPrompt, char.lookFingerprint ?? null, {
    sourceHash: selectedCandidate?.sourceHash ?? null,
    appearanceHash: selectedCandidate?.appearanceHash ?? null,
  })
  // 생성 실패(reload-survivable) — moderation(콘텐츠정책) 이면 우회(safe) 재시도 버튼, cap 도달 시 비활성.
  const failure = charId ? viewFailures[charId]?.[view] : undefined
  const capReached = (failure?.safeFailCount ?? 0) >= SAFE_RETRY_CAP

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          isSheet ? 'sm:max-w-3xl' : 'sm:max-w-lg',
          'max-h-[92vh] overflow-y-auto scrollbar-thin',
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-sm">
            {char.name} — {label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {staleClass !== 'fresh' && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <RefreshCw className="size-3.5 shrink-0" />
              {staleClass === 'look-pending'
                ? t('This is a draft from before the final look — regenerating remakes it in the final art style')
                : t('The appearance changed — regenerating will apply the new appearance')}
            </div>
          )}

          {failure && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>
                {failure.moderation
                  ? t('Generation was declined by content policy. You can retry below with "Redo with bypass (safe)."')
                  : t('Generation failed. Please try again.')}
              </span>
            </div>
          )}

          {/* 사람 main = 시트 전체(16:9), 그 외 = 기존 1:1 프레임 */}
          <div className={cn('mx-auto w-full', !isSheet && 'max-w-sm')}>
            <ImagePlaceholder
              label={label}
              aspectRatio={isSheet ? 'video' : 'square'}
              imageUrl={imageUrl}
              generating={isGenerating}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {isObject
              ? imageUrl
                ? t('Regenerating creates a new image.')
                : t('This generates the image.')
              : view === 'main'
                ? t('This is the turnaround sheet. Edit the appearance prompt below and regenerate to apply it.')
                : needsMain
                  ? t('Directional views are generated from Main. Generate Main first.')
                  : t('This view is regenerated based on the Main image.')}
          </p>

          {/* 외형 프롬프트(#4) — 월드 다이얼로그와 대칭. 수정하면 재생성 시 캐릭터 원천(appearance)에 반영. */}
          {view === 'main' && (
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                {t('Appearance prompt (edit, then regenerate)')}
              </label>
              <HoverBeam>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  placeholder={t("This character's appearance description")}
                />
              </HoverBeam>
            </div>
          )}

          {/* 후보 히스토리 스트립 제거(#5) — 이미지 1장 정책: 재생성은 누적 아닌 교체(finalize 가 최신 1장만 보관). */}

          <Button className="w-full" disabled={generate.locked || needsMain} onClick={generate.run}>
            {generate.locked ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('Generating…')}
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                {imageUrl ? t('Regenerate {label}', { label }) : t('Generate {label}', { label })}
              </>
            )}
          </Button>

          {failure?.moderation && (
            <Button
              variant="outline"
              className="w-full"
              disabled={safeRetry.locked || capReached}
              onClick={safeRetry.run}
            >
              {safeRetry.locked ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {capReached ? t('Bypass retry limit reached') : t('Redo with bypass (safe)')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
