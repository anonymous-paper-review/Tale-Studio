'use client'

// Writer 실행 중 캐릭터 사이드바(#story-stream 2026-07-21).
//   스토리 줄글 옆에 등장인물 정보(이름/역할/네이티브 설명)를 표시하고,
//   중간에 캐릭터 초안 이미지가 완성되면(view_main) 그 자리에 이미지를 페이드 인한다.

import { User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PreviewCharacter } from '@/lib/writer/use-writer-preview'

const ROLE_LABEL: Record<string, string> = {
  protagonist: '주인공',
  antagonist: '적대자',
  supporting: '조연',
  deuteragonist: '주요 인물',
  minor: '단역',
}
function roleLabel(role: string): string {
  return ROLE_LABEL[role.toLowerCase()] ?? role
}

function CharacterCard({ character }: { character: PreviewCharacter }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-2.5">
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted">
        {character.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 원격 초안 이미지, 최적화 불필요(프리뷰)
          <img
            src={character.imageUrl}
            alt={character.name}
            className="animate-in fade-in zoom-in-95 size-full object-cover duration-500"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <User className="size-8 animate-pulse text-muted-foreground/50" />
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="truncate text-sm font-semibold text-foreground">{character.name}</span>
        {character.role ? (
          <span className="shrink-0 rounded-full border border-border/70 px-1.5 py-px text-[10px] text-muted-foreground">
            {roleLabel(character.role)}
          </span>
        ) : null}
      </div>
      {character.description ? (
        <p className="mt-1 line-clamp-4 text-xs leading-5 text-muted-foreground">
          {character.description}
        </p>
      ) : null}
    </div>
  )
}

export function WriterCharacterPanel({
  characters,
  className,
}: {
  characters: PreviewCharacter[]
  className?: string
}) {
  return (
    <aside
      className={cn(
        'scrollbar-thin w-64 shrink-0 overflow-y-auto border-l border-border bg-background/40 px-3 py-4',
        className,
      )}
    >
      <h2 className="mb-3 px-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        등장인물
      </h2>
      {characters.length === 0 ? (
        <p className="px-0.5 text-xs text-muted-foreground/70">
          캐릭터를 준비하고 있어요…
        </p>
      ) : (
        <div className="space-y-3">
          {characters.map((c) => (
            <CharacterCard key={c.id} character={c} />
          ))}
        </div>
      )}
    </aside>
  )
}
