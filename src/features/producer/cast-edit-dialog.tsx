'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CastMember } from '@/lib/producer-gate'
import { depthLevelFromRuntime } from '@/lib/depth'

const ROLE_OPTIONS = [
  { value: 'protagonist', label: '주인공 (protagonist)' },
  { value: 'antagonist', label: '적대자 (antagonist)' },
  { value: 'supporting', label: '조연 (supporting)' },
]

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/**
 * 캐스트 멤버(person/object) 상세 편집 Dialog.
 * person: name/role/appearance + (D3+) arc/motivation.
 * object: name/appearance 만 (인물 전용 필드 미노출 — entity_type 분기).
 * 저장은 onSave(patch), 삭제는 onDelete. depth 로 필수 표식만 바꾼다(차단은 게이트가).
 */
export function CastEditDialog({
  member,
  runtimeSeconds,
  open,
  onOpenChange,
  onSave,
  onDelete,
}: {
  member: CastMember | null
  runtimeSeconds: number
  open: boolean
  onOpenChange: (o: boolean) => void
  onSave: (localId: string, patch: Partial<CastMember>) => void
  onDelete: (localId: string) => void
}) {
  const [draft, setDraft] = useState<CastMember | null>(member)

  useEffect(() => {
    setDraft(member)
  }, [member])

  if (!draft) return null

  const isPerson = draft.entityType === 'person'
  const depth = depthLevelFromRuntime(runtimeSeconds || 0)
  const deepPerson = isPerson && depth !== 'D1' && depth !== 'D2' // D3+

  const patch = (p: Partial<CastMember>) => setDraft((d) => (d ? { ...d, ...p } : d))
  const patchArc = (p: Partial<NonNullable<CastMember['arc']>>) =>
    setDraft((d) =>
      d ? { ...d, arc: { start_state: '', end_state: '', arc_type: '', ...d.arc, ...p } } : d,
    )
  const patchMot = (p: Partial<NonNullable<CastMember['motivation']>>) =>
    setDraft((d) => (d ? { ...d, motivation: { want: '', ...d.motivation, ...p } } : d))

  const save = () => {
    onSave(draft.localId, draft)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isPerson ? '인물 편집' : '사물 편집'}
          </DialogTitle>
          <DialogDescription>
            {isPerson
              ? '인물의 정체성을 정의합니다. 이미지는 Artist 단계에서 생성돼요.'
              : '핵심 소품(사물 캐릭터)의 외형을 정의합니다. 단일 레퍼런스 이미지만 가집니다.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <Field label="이름" required>
            <Input
              autoFocus
              value={draft.name}
              placeholder={isPerson ? '예: 지아' : '예: 은빛 반지'}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>

          {isPerson ? (
            <Field label="역할">
              <Select
                value={draft.role ?? 'supporting'}
                onValueChange={(v) => patch({ role: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          <Field
            label="외모 (appearance)"
            required
            hint="Artist의 이미지 생성 입력으로 쓰입니다."
          >
            <Textarea
              value={draft.appearance}
              rows={2}
              placeholder={
                isPerson
                  ? '예: 20대 여성, 검은 후디, 운동화, 날카로운 눈매'
                  : '예: 은빛 고리, 안쪽에 룬 각인, 오래된 광택'
              }
              onChange={(e) => patch({ appearance: e.target.value })}
            />
          </Field>

          {deepPerson ? (
            <>
              <Field label="아크 (arc)" required hint="1분 이상 영상 필수 — 시작/끝/유형">
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    value={draft.arc?.start_state ?? ''}
                    placeholder="시작 상태"
                    onChange={(e) => patchArc({ start_state: e.target.value })}
                  />
                  <Input
                    value={draft.arc?.end_state ?? ''}
                    placeholder="끝 상태"
                    onChange={(e) => patchArc({ end_state: e.target.value })}
                  />
                  <Input
                    value={draft.arc?.arc_type ?? ''}
                    placeholder="유형"
                    onChange={(e) => patchArc({ arc_type: e.target.value })}
                  />
                </div>
              </Field>

              <Field label="동기 (motivation)" required hint="want 필수 — need 는 선택">
                <div className="space-y-2">
                  <Input
                    value={draft.motivation?.want ?? ''}
                    placeholder="want — 무엇을 원하는가 (필수)"
                    onChange={(e) => patchMot({ want: e.target.value })}
                  />
                  <Input
                    value={draft.motivation?.need ?? ''}
                    placeholder="need — 진짜 필요한 것 (선택)"
                    onChange={(e) => patchMot({ need: e.target.value })}
                  />
                </div>
              </Field>
            </>
          ) : null}
        </div>

        <DialogFooter className="justify-between sm:justify-between">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              onDelete(draft.localId)
              onOpenChange(false)
            }}
          >
            <Trash2 className="size-4" />
            삭제
          </Button>
          <Button onClick={save} disabled={!draft.name.trim()}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
