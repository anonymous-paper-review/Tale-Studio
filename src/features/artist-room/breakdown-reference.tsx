'use client'

// Artist 브레이크다운 줄의 레퍼런스 칸(2026-10-27 오너 "인물과 배경의 레퍼런스 입력할 수 있는 기능", 프로토타입 A1 "레퍼런스").
//   줄마다 그림 한 장 — 비어 있으면 점선 [＋], 붙어 있으면 작은 그림(누르면 바꾸기)과 [×](빼기). 올린 그림은 [만들기] 때 그대로
//   그 카드의 그림이 되고, 그림이 없는 줄만 AI 가 그린다. 올리기 전에 그림 사용 권리를 확인한다(채팅 · 그림체 올리기와 같은 창).
//   목록을 고칠 수 있을 때(산문 확정 뒤 [만들기] 전)만 단추가 켜진다. 약속: tests/artist/breakdown-reference.test.ts
import { useRef, useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThumbImage } from '@/components/thumb-image'
import { useImageUploadConsent } from '@/components/upload/image-upload-consent'
import { addBreakdownImage, BREAKDOWN_IMAGE_ERROR_TEXT } from '@/lib/artist/breakdown-image'
import type { BreakdownRow } from '@/lib/artist/breakdown'
import { isDemoSession } from '@/lib/demo/context'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

const TILE =
  'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50'

export function BreakdownReference({ row, onBusyChange }: { row: BreakdownRow; onBusyChange?: (busy: boolean) => void }) {
  const t = useT()
  const projectId = useProjectStore((s) => s.projectId)
  // 줄 설명 고치기와 같은 조건(producer-store castLocked) — 산문을 확정해도 [만들기] 전(산문 초안 실행)에는 고친다.
  const editable = useProjectStore((s) => !s.producerLocked || s.treatmentDraft) && !isDemoSession()
  const { requestImageUploadConsent, imageUploadConsentDialog } = useImageUploadConsent(projectId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const disabled = !editable || busy

  const pick = () => {
    if (!disabled) fileRef.current?.click()
  }
  const onFile = async (file: File) => {
    if (!projectId) return
    setError(null)
    const result = await addBreakdownImage({ projectId, kind: row.kind, localId: row.id }, file, {
      confirm: requestImageUploadConsent,
      onBusy: (value) => {
        setBusy(value)
        onBusyChange?.(value)
      },
    })
    if (result.status === 'error') setError(t(BREAKDOWN_IMAGE_ERROR_TEXT[result.error]))
  }
  const remove = () => {
    setError(null)
    useProducerStore.getState().setBreakdownImage(row.kind, row.id, null)
  }

  return (
    <div className="space-y-1 pt-1" data-testid="breakdown-reference">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">{t('Reference')}</span>
        {busy ? (
          <span className={cn(TILE, 'border border-border bg-muted/40')} role="status" aria-label={t('Uploading…')}>
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
          </span>
        ) : row.imageUrl ? (
          <>
            <button
              type="button"
              onClick={pick}
              disabled={disabled}
              title={t('Change the reference image')}
              aria-label={t('Change the reference image')}
              className={cn(TILE, 'border border-border hover:border-border-strong')}
              data-testid="breakdown-image-thumb"
            >
              <ThumbImage src={row.imageUrl} alt="" className="size-full object-cover" />
            </button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={remove}
              disabled={disabled}
              title={t('Remove the reference')}
              aria-label={t('Remove the reference')}
              className="text-muted-foreground"
              data-testid="breakdown-image-remove"
            >
              <X aria-hidden />
            </Button>
          </>
        ) : (
          <button
            type="button"
            onClick={pick}
            disabled={disabled}
            title={t('Upload a reference image')}
            aria-label={t('Upload a reference image')}
            className={cn(TILE, 'border border-dashed border-border-strong text-muted-foreground hover:bg-accent hover:text-foreground')}
            data-testid="breakdown-image-add"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        )}
        {/* 그대로 쓰는 그림인지(레퍼런스 · 배경 그림), 시트를 새로 그리는 출처인지(채팅에서 붙인 인물 그림, #image-to-artist) 줄에서 밝힌다. */}
        {row.imageUrl && !busy ? (
          <span className="text-[11px] text-muted-foreground">{row.imageAsIs ? t('Used as is') : t('The sheet follows this picture')}</span>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
      <input
        ref={fileRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        className="hidden"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void onFile(file)
        }}
      />
      {imageUploadConsentDialog}
    </div>
  )
}
