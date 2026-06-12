'use client'

import { useState } from 'react'
import { User, Box, Plus, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useProducerStore } from '@/stores/producer-store'
import { depthLevelFromRuntime } from '@/lib/depth'
import type { CastMember, EntityType } from '@/lib/producer-gate'
import { CastEditDialog } from './cast-edit-dialog'

const ROLE_LABEL: Record<string, string> = {
  protagonist: '주인공',
  antagonist: '적대자',
  supporting: '조연',
}

function CastCard({
  member,
  onEdit,
}: {
  member: CastMember
  onEdit: () => void
}) {
  const isPerson = member.entityType === 'person'
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-border-strong"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {isPerson ? <User className="size-5" /> : <Box className="size-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {member.name || (isPerson ? '이름 미정 인물' : '이름 미정 사물')}
          </span>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {isPerson ? ROLE_LABEL[member.role ?? 'supporting'] ?? '인물' : '사물'}
          </Badge>
          {member.origin === 'writer' ? (
            <Badge variant="ghost" className="shrink-0 text-[10px] text-muted-foreground">
              writer 추가
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {member.appearance || '외모 미입력 — 클릭해 채우기'}
        </p>
      </div>
    </button>
  )
}

/**
 * Producer 캐스트 패널 — 인물/사물 카드 + 추가 버튼.
 * 카드 = 캐스팅 풀 등록(존재 정의). 등장은 스토리가 결정(#57). 이미지는 Artist 단계.
 * 게이트 사유 표시·핸드오프 게이팅은 페이지 footer(GateStatus + Button)가 담당.
 */
export function CastPanel() {
  const cast = useProducerStore((s) => s.cast)
  const playtime = useProducerStore((s) => s.projectSettings.playtime)
  const addCastMember = useProducerStore((s) => s.addCastMember)
  const updateCastMember = useProducerStore((s) => s.updateCastMember)
  const removeCastMember = useProducerStore((s) => s.removeCastMember)

  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = cast.find((m) => m.localId === editingId) ?? null

  const depth = depthLevelFromRuntime(playtime || 0)
  const persons = cast.filter((m) => m.entityType === 'person')
  const objects = cast.filter((m) => m.entityType === 'object')

  const add = (entityType: EntityType) => {
    const id = addCastMember(entityType)
    setEditingId(id)
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-l border-border">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">캐스트</span>
          <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
            {depth}
          </Badge>
          <span className="text-xs text-muted-foreground">
            인물 {persons.length} · 사물 {objects.length}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => add('person')}>
            <Plus className="size-4" />
            인물
          </Button>
          <Button variant="outline" size="sm" onClick={() => add('object')}>
            <Plus className="size-4" />
            사물
          </Button>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-3 overflow-y-auto p-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cast.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Users className="size-12 text-muted-foreground" />
            <p className="text-base font-medium">아직 캐스트가 없어요</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              스토리 속 인물·사물을 카드로 정의하면 Writer가 이 캐스트를 재료로 씬을 짭니다.
              짧은 영상({depth})은 인물 없이도 진행할 수 있어요.
            </p>
          </div>
        ) : (
          cast.map((m) => (
            <CastCard key={m.localId} member={m} onEdit={() => setEditingId(m.localId)} />
          ))
        )}
      </div>

      <CastEditDialog
        member={editing}
        runtimeSeconds={playtime || 0}
        open={editingId !== null}
        onOpenChange={(o) => {
          if (!o) setEditingId(null)
        }}
        onSave={updateCastMember}
        onDelete={removeCastMember}
      />
    </div>
  )
}
