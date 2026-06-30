'use client'

import { useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { HoverBeam } from '@/components/hover-beam'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useArtistStore, type CharacterRole } from '@/stores/artist-store'
import { cn } from '@/lib/utils'

const ROLE_OPTIONS: { value: CharacterRole; label: string }[] = [
  { value: 'protagonist', label: 'Protagonist (주인공)' },
  { value: 'antagonist', label: 'Antagonist (적대자)' },
  { value: 'supporting', label: 'Supporting (조연)' },
]

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {children}
    </div>
  )
}

/**
 * 캐릭터 카드 목록 하단 (+) 버튼 + 신규 캐릭터 입력 Dialog.
 * 제출 시 artist-store.addCharacter 호출 → 카드가 즉시 등장하고 DB 에 영속된다.
 */
export function AddCharacterDialog() {
  const addCharacter = useArtistStore((s) => s.addCharacter)

  const [open, setOpen] = useState(false)
  const [entityType, setEntityType] = useState<'person' | 'object'>('person')
  const [name, setName] = useState('')
  const [role, setRole] = useState<CharacterRole>('supporting')
  const [description, setDescription] = useState('')
  const [appearance, setAppearance] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setEntityType('person')
    setName('')
    setRole('supporting')
    setDescription('')
    setAppearance('')
  }

  const canSubmit = name.trim().length > 0 && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    await addCharacter({
      name,
      role: entityType === 'object' ? 'supporting' : role,
      entityType,
      description,
      appearance,
    })
    setSubmitting(false)
    reset()
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full border-dashed text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-4" />새 캐릭터
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 캐릭터 추가</DialogTitle>
          <DialogDescription>
            이름과 설정을 입력하면 카드가 생성됩니다. 이미지는 카드의
            &quot;Generate All Views&quot;로 만드세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* 인물/사물 토글 */}
          <Field label="유형">
            <div className="flex gap-2">
              {(['person', 'object'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEntityType(t)}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors',
                    entityType === t
                      ? 'border-primary bg-accent text-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t === 'person' ? '인물' : '사물'}
                </button>
              ))}
            </div>
          </Field>

          <Field label="이름">
            <HoverBeam>
              <Input
                autoFocus
                value={name}
                placeholder={entityType === 'object' ? '예: 마법 검' : '예: Kai'}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit()
                }}
              />
            </HoverBeam>
          </Field>

          {/* object 는 role 필드 숨김 */}
          {entityType === 'person' && (
            <Field label="역할">
              <Select
                value={role}
                onValueChange={(v) => setRole(v as CharacterRole)}
              >
                <SelectTrigger className="w-full hover-red-beam">
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
          )}

          <Field label="설정 / 배경" hint="카드 hover 정보에 표시됩니다.">
            <HoverBeam>
              <Textarea
                value={description}
                placeholder={
                  entityType === 'object'
                    ? '사물의 특성·용도·서사적 의미'
                    : '캐릭터의 성격·역할·서사적 배경'
                }
                rows={2}
                onChange={(e) => setDescription(e.target.value)}
              />
            </HoverBeam>
          </Field>

          <Field
            label="외형"
            hint="이미지 생성 프롬프트로 사용됩니다. (선택)"
          >
            <HoverBeam>
              <Textarea
                value={appearance}
                placeholder={
                  entityType === 'object'
                    ? '예: 고대 룬 문자가 새겨진 은빛 검, 빛나는 칼날'
                    : '예: 갈색 머리, 검은 롱코트, 날카로운 눈매'
                }
                rows={2}
                onChange={(e) => setAppearance(e.target.value)}
              />
            </HoverBeam>
          </Field>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">취소</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                추가 중…
              </>
            ) : (
              <>
                <Plus className="size-4" />
                추가
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
