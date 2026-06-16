'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  Box,
  CheckCircle2,
  Clock,
  Film,
  Languages,
  Monitor,
  Palette,
  Pencil,
  Plus,
  Sparkles,
  Tag,
  User,
  Wand2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useProducerStore } from '@/stores/producer-store'
import { depthLevelFromRuntime } from '@/lib/depth'
import type { BackgroundSource, CastMember, GateIssue, GateResult, EntityType } from '@/lib/producer-gate'
import { isProducerBackgroundComplete } from '@/lib/producer-gate'
import type { ProjectFormat } from '@/types'
import { CastEditDialog } from './cast-edit-dialog'
import { TagInput } from './tag-input'

const FORMAT_OPTIONS: { value: ProjectFormat; label: string }[] = [
  { value: 'horizontal_16:9', label: '16:9 Horizontal' },
  { value: 'vertical_9:16', label: '9:16 Vertical' },
  { value: 'cinema_2.39:1', label: '2.39:1 Cinema' },
  { value: 'square_1:1', label: '1:1 Square' },
]

const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
]

const ROLE_LABEL: Record<string, string> = {
  protagonist: '주인공',
  antagonist: '적대자',
  supporting: '조연',
}

function FieldShell({
  icon,
  label,
  issue,
  softIssue,
  children,
}: {
  icon: ReactNode
  label: string
  issue?: GateIssue
  softIssue?: GateIssue
  children: ReactNode
}) {
  const state = issue ? 'missing' : softIssue ? 'recommended' : 'ready'
  return (
    <div className="rounded-xl border border-border bg-card/70 p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="text-muted-foreground">{icon}</span>
          {label}
        </div>
        {state === 'ready' ? (
          <Badge variant="outline" className="gap-1 border-success/40 text-success">
            <CheckCircle2 className="size-3" /> 준비됨
          </Badge>
        ) : state === 'missing' ? (
          <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
            <AlertCircle className="size-3" /> 필요
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 border-warning/40 text-warning">
            <AlertCircle className="size-3" /> 권장
          </Badge>
        )}
      </div>
      <div>{children}</div>
      {(issue ?? softIssue) ? (
        <p className={`mt-2 text-xs ${issue ? 'text-destructive' : 'text-warning'}`}>
          {(issue ?? softIssue)?.label}
          {(issue ?? softIssue)?.detail ? ` · ${(issue ?? softIssue)?.detail}` : ''}
        </p>
      ) : null}
    </div>
  )
}

function issueByField(issues: GateIssue[], field: string) {
  return issues.find((i) => i.field === field)
}

function castIssuesFor(gate: GateResult, localId: string) {
  return gate.hardMissing.filter((i) => i.field.startsWith(`cast:${localId}:`))
}

function castDraftPrompt(member: CastMember, issue?: GateIssue) {
  const label = member.name || (member.entityType === 'person' ? '이 인물' : '이 사물')
  const current = [
    member.name ? `이름: ${member.name}` : null,
    member.appearance ? `외형: ${member.appearance}` : null,
    member.role ? `역할: ${ROLE_LABEL[member.role] ?? member.role}` : null,
  ].filter(Boolean).join(' / ')
  const target = issue?.label ?? `${label}의 비어 있는 필드`
  return `Producer, ${target}을 채울 수 있게 한 가지 질문을 해 주세요.${current ? ` 현재 정보: ${current}.` : ''}`
}

function CastCard({
  member,
  issues,
  onPatch,
  onEdit,
  onAskProducer,
}: {
  member: CastMember
  issues: GateIssue[]
  onPatch: (localId: string, patch: Partial<CastMember>) => void
  onEdit: () => void
  onAskProducer: (prompt: string) => void
}) {
  const isPerson = member.entityType === 'person'
  const ready = issues.length === 0
  const nameIssue = issues.find((i) => i.field.endsWith(':name'))
  const appearanceIssue = issues.find((i) => i.field.endsWith(':appearance'))
  const complexIssues = issues.filter(
    (i) => !i.field.endsWith(':name') && !i.field.endsWith(':appearance'),
  )

  return (
    <div className="rounded-xl border border-border bg-card/70 p-4">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {isPerson ? <User className="size-5" /> : <Box className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">
              {member.name || (isPerson ? '이름 미정 인물' : '이름 미정 사물')}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {isPerson ? ROLE_LABEL[member.role ?? 'supporting'] ?? '인물' : '사물'}
            </Badge>
            {member.origin === 'writer' ? (
              <Badge variant="ghost" className="text-[10px] text-muted-foreground">
                writer 추가
              </Badge>
            ) : null}
            {ready ? (
              <Badge variant="outline" className="ml-auto gap-1 border-success/40 text-success">
                <CheckCircle2 className="size-3" /> 준비됨
              </Badge>
            ) : (
              <Badge variant="outline" className="ml-auto gap-1 border-destructive/40 text-destructive">
                <AlertCircle className="size-3" /> {issues.length}개 필요
              </Badge>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {member.appearance || '외모 미입력'}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">이름 quick edit</label>
          <Input
            value={member.name}
            placeholder={isPerson ? '예: 지아' : '예: 은빛 반지'}
            aria-invalid={!!nameIssue}
            onChange={(e) => onPatch(member.localId, { name: e.target.value })}
          />
          {nameIssue ? <p className="text-xs text-destructive">{nameIssue.label}</p> : null}
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">외모 quick edit</label>
          <Textarea
            value={member.appearance}
            rows={2}
            placeholder={isPerson ? '복장, 나이, 특징' : '형태, 재질, 특징'}
            aria-invalid={!!appearanceIssue}
            onChange={(e) => onPatch(member.localId, { appearance: e.target.value })}
          />
          {appearanceIssue ? <p className="text-xs text-destructive">{appearanceIssue.label}</p> : null}
        </div>
      </div>

      {complexIssues.length > 0 ? (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs font-medium text-destructive">상세 필드 필요</p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {complexIssues.map((issue) => (
              <li key={issue.field}>{issue.label}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="size-3.5" /> 상세 편집
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onAskProducer(castDraftPrompt(member, issues[0]))}
        >
          <Wand2 className="size-3.5" /> 프로듀서에게 채워달라
        </Button>
      </div>
    </div>
  )
}

function backgroundReady(background: BackgroundSource): boolean {
  return isProducerBackgroundComplete(background)
}

function backgroundDraftPrompt(background?: BackgroundSource) {
  const current = background
    ? [
        background.name ? `이름: ${background.name}` : null,
        background.visualDescription ? `시각 설명: ${background.visualDescription}` : null,
        background.purpose ? `목적: ${background.purpose}` : null,
      ].filter(Boolean).join(' / ')
    : ''
  return `Producer, writer와 artist가 바로 쓸 수 있는 배경 카드 1개를 채워 주세요. 필수는 이름, 시각 설명, 이야기 속 목적입니다.${current ? ` 현재 정보: ${current}.` : ''}`
}

function BackgroundCard({
  background,
  onPatch,
  onAskProducer,
  onDelete,
}: {
  background: BackgroundSource
  onPatch: (localId: string, patch: Partial<BackgroundSource>) => void
  onAskProducer: (prompt: string) => void
  onDelete: (localId: string) => void
}) {
  const ready = backgroundReady(background)
  return (
    <div className="rounded-xl border border-border bg-card/70 p-4">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Monitor className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{background.name || '이름 미정 배경'}</span>
            {background.origin === 'writer' ? (
              <Badge variant="ghost" className="text-[10px] text-muted-foreground">writer 추가</Badge>
            ) : null}
            {background.stale ? (
              <Badge variant="outline" className="text-[10px] text-warning">stale</Badge>
            ) : null}
            {ready ? (
              <Badge variant="outline" className="ml-auto gap-1 border-success/40 text-success">
                <CheckCircle2 className="size-3" /> 준비됨
              </Badge>
            ) : (
              <Badge variant="outline" className="ml-auto gap-1 border-destructive/40 text-destructive">
                <AlertCircle className="size-3" /> 필요
              </Badge>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {background.visualDescription || '시각 설명 미입력'}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">이름</label>
          <Input
            value={background.name}
            placeholder="예: 네온 뒷골목"
            onChange={(e) => onPatch(background.localId, { name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">목적</label>
          <Input
            value={background.purpose}
            placeholder="예: 추격이 시작되는 공간"
            onChange={(e) => onPatch(background.localId, { purpose: e.target.value })}
          />
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">시각 설명</label>
        <Textarea
          value={background.visualDescription}
          rows={2}
          placeholder="색감, 구조, 소품, 분위기"
          onChange={(e) => onPatch(background.localId, { visualDescription: e.target.value })}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={() => onAskProducer(backgroundDraftPrompt(background))}>
          <Wand2 className="size-3.5" /> 프로듀서에게 채워달라
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDelete(background.localId)}>
          삭제
        </Button>
      </div>
    </div>
  )
}

export function ProducerReadinessBoard({ gate }: { gate: GateResult }) {
  const projectSettings = useProducerStore((s) => s.projectSettings)
  const updateSettings = useProducerStore((s) => s.updateSettings)
  const storyText = useProducerStore((s) => s.storyText)
  const storyReady = useProducerStore((s) => s.storyReady)
  const cast = useProducerStore((s) => s.cast)
  const syncing = useProducerStore((s) => s.syncing)
  const addCastMember = useProducerStore((s) => s.addCastMember)
  const updateCastMember = useProducerStore((s) => s.updateCastMember)
  const removeCastMember = useProducerStore((s) => s.removeCastMember)
  const backgrounds = useProducerStore((s) => s.backgrounds)
  const addBackground = useProducerStore((s) => s.addBackground)
  const updateBackground = useProducerStore((s) => s.updateBackground)
  const removeBackground = useProducerStore((s) => s.removeBackground)
  const requestDraftPrompt = useChatUiStore((s) => s.requestDraftPrompt)

  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = cast.find((m) => m.localId === editingId) ?? null
  const depth = depthLevelFromRuntime(projectSettings.playtime || 0)
  const persons = cast.filter((m) => m.entityType === 'person')
  const objects = cast.filter((m) => m.entityType === 'object')
  const readyBackgrounds = backgrounds.filter(backgroundReady)

  const hardByField = useMemo(
    () => new Map(gate.hardMissing.map((issue) => [issue.field, issue])),
    [gate.hardMissing],
  )
  const softByField = useMemo(
    () => new Map(gate.softMissing.map((issue) => [issue.field, issue])),
    [gate.softMissing],
  )

  const askProducer = (prompt: string) => requestDraftPrompt(prompt)
  const add = (entityType: EntityType) => {
    const id = addCastMember(entityType)
    setEditingId(id)
  }
  const addBg = () => {
    addBackground()
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Handoff readiness board</h1>
            {gate.canHandoff ? (
              <Badge variant="outline" className="gap-1 border-success/40 text-success">
                <CheckCircle2 className="size-3" /> Writer 계약 준비 완료
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                <AlertCircle className="size-3" /> 남은 {gate.hardMissing.length}개
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            오른쪽 GlobalChat이 채우고, 이 보드가 writer로 넘길 계약 준비 상태를 확인합니다.
          </p>
        </div>
        {syncing ? <Badge variant="outline">저장 중</Badge> : null}
      </div>

      <div className="flex-1 overflow-y-auto p-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mx-auto max-w-6xl space-y-5">
          <FieldShell
            icon={<Sparkles className="size-4" />}
            label="스토리 준비"
            issue={hardByField.get('storyText')}
          >
            <div className="rounded-lg border border-border bg-background/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Story brief</span>
                {storyReady ? (
                  <Badge variant="outline" className="border-success/40 text-success">준비됨</Badge>
                ) : (
                  <Badge variant="outline">더 구체화 필요</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground italic">
                {storyText
                  ? storyText.slice(0, 360).concat(storyText.length > 360 ? '…' : '')
                  : '채팅으로 촬영 가능한 스토리를 정리해 주세요.'}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-3"
                onClick={() => askProducer('Producer, 이 이야기가 writer로 넘어갈 수 있게 캐릭터·장소·시작-갈등-결말 중 부족한 한 가지를 질문해 주세요.')}
              >
                <Wand2 className="size-3.5" /> 스토리 보강 질문 채우기
              </Button>
            </div>
          </FieldShell>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Story foundation</h2>
              <Badge variant="outline" className="text-[10px]">settings</Badge>
            </div>
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              <FieldShell icon={<Clock className="size-4" />} label="러닝타임" issue={hardByField.get('playtime')}>
                <Input
                  type="number"
                  min={5}
                  value={projectSettings.playtime || ''}
                  placeholder="예: 120"
                  onChange={(e) => updateSettings({ playtime: Number(e.target.value) || 0 })}
                  className="font-mono tabular-nums"
                />
              </FieldShell>

              <FieldShell icon={<Film className="size-4" />} label="장르" issue={hardByField.get('genre')}>
                <Input
                  value={projectSettings.genre}
                  placeholder="예: thriller"
                  onChange={(e) => updateSettings({ genre: e.target.value })}
                />
              </FieldShell>

              <FieldShell icon={<Tag className="size-4" />} label="세부 장르" softIssue={softByField.get('subGenre')}>
                <Input
                  value={projectSettings.subGenre ?? ''}
                  placeholder="예: psychological"
                  onChange={(e) => updateSettings({ subGenre: e.target.value })}
                />
              </FieldShell>

              <FieldShell icon={<Monitor className="size-4" />} label="포맷" issue={hardByField.get('format')}>
                <Select
                  value={projectSettings.format}
                  onValueChange={(v) => updateSettings({ format: v as ProjectFormat })}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORMAT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>

              <FieldShell icon={<Palette className="size-4" />} label="톤" softIssue={softByField.get('tone')}>
                <TagInput
                  values={projectSettings.tone}
                  onChange={(tone) => updateSettings({ tone })}
                  placeholder="예: dark"
                />
              </FieldShell>

              <FieldShell icon={<Languages className="size-4" />} label="대사 언어" issue={hardByField.get('dialogueLanguage')}>
                <Select
                  value={projectSettings.dialogueLanguage || undefined}
                  onValueChange={(v) => updateSettings({ dialogueLanguage: v })}
                >
                  <SelectTrigger className="w-full"><SelectValue placeholder="선택…" /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Cast readiness</h2>
                <Badge variant="outline" className="font-mono text-[10px] tabular-nums">{depth}</Badge>
                <span className="text-xs text-muted-foreground">인물 {persons.length} · 사물 {objects.length}</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => add('person')}>
                  <Plus className="size-4" /> 인물
                </Button>
                <Button size="sm" variant="outline" onClick={() => add('object')}>
                  <Plus className="size-4" /> 사물
                </Button>
              </div>
            </div>

            {issueByField(gate.hardMissing, 'cast:minPerson') ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {issueByField(gate.hardMissing, 'cast:minPerson')?.label}
              </div>
            ) : null}

            {cast.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center">
                <User className="size-10 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">아직 캐스트가 없어요</p>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">
                  채팅이 만든 인물·사물을 이 보드에서 확인하고, 부족한 필드는 quick edit나 채팅 보강으로 채웁니다.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {cast.map((member) => (
                  <CastCard
                    key={member.localId}
                    member={member}
                    issues={castIssuesFor(gate, member.localId)}
                    onPatch={updateCastMember}
                    onEdit={() => setEditingId(member.localId)}
                    onAskProducer={askProducer}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Background readiness</h2>
                <Badge variant="outline" className="text-[10px]">locations</Badge>
                <span className="text-xs text-muted-foreground">준비됨 {readyBackgrounds.length} / 전체 {backgrounds.length}</span>
              </div>
              <Button size="sm" variant="outline" onClick={addBg}>
                <Plus className="size-4" /> 배경
              </Button>
            </div>

            {issueByField(gate.hardMissing, 'background:minComplete') ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {issueByField(gate.hardMissing, 'background:minComplete')?.label}
                <span className="ml-2 text-xs text-muted-foreground">
                  {issueByField(gate.hardMissing, 'background:minComplete')?.detail}
                </span>
              </div>
            ) : null}

            {backgrounds.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center">
                <Monitor className="size-10 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">아직 배경 카드가 없어요</p>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">
                  Producer가 만든 배경은 writer의 장소 풀과 artist의 월드 이미지 시작점이 됩니다.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {backgrounds.map((background) => (
                  <BackgroundCard
                    key={background.localId}
                    background={background}
                    onPatch={updateBackground}
                    onAskProducer={askProducer}
                    onDelete={removeBackground}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <CastEditDialog
        member={editing}
        runtimeSeconds={projectSettings.playtime || 0}
        open={editingId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingId(null)
        }}
        onSave={updateCastMember}
        onDelete={removeCastMember}
      />
    </div>
  )
}
