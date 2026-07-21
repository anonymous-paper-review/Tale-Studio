'use client'

// Writer 실행 중 캐릭터 사이드바(#story-stream 2026-07-21).
//   스토리 줄글 옆에 등장인물 정보(이름/역할/네이티브 설명)를 표시하고,
//   중간에 캐릭터 초안이 완성되면 카드에 정면샷(portrait)을 페이드 인한다.
//   카드 클릭 → 캐릭터 템플릿(턴어라운드 시트, view_main) 팝업 (2026-07-21 피드백).

import { useState } from 'react'
import { User } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
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

function CharacterCard({
  character,
  onOpen,
}: {
  character: PreviewCharacter
  onOpen: (c: PreviewCharacter) => void
}) {
  // 카드 이미지 = 정면샷(portrait). 아직 없으면 템플릿으로 폴백, 둘 다 없으면 플레이스홀더.
  const cardImage = character.portraitUrl ?? character.templateUrl
  const clickable = !!character.templateUrl
  return (
    <button
      type="button"
      onClick={() => clickable && onOpen(character)}
      disabled={!clickable}
      className={cn(
        'w-full rounded-lg border border-border/60 bg-card/40 p-2.5 text-left transition-colors',
        clickable &&
          'cursor-zoom-in hover:border-border hover:bg-card/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50',
      )}
      aria-label={clickable ? `${character.name} 캐릭터 템플릿 보기` : character.name}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted">
        {cardImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- 원격 초안 이미지, 최적화 불필요(프리뷰)
          <img
            src={cardImage}
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
    </button>
  )
}

export function WriterCharacterPanel({
  characters,
  className,
}: {
  characters: PreviewCharacter[]
  className?: string
}) {
  const [detail, setDetail] = useState<PreviewCharacter | null>(null)

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
            <CharacterCard key={c.id} character={c} onOpen={setDetail} />
          ))}
        </div>
      )}

      {/* 캐릭터 템플릿 팝업 — 턴어라운드 시트(view_main) 전체 보기 */}
      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-3xl">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detail.name}
                  {detail.role ? (
                    <span className="rounded-full border border-border/70 px-2 py-0.5 text-xs font-normal text-muted-foreground">
                      {roleLabel(detail.role)}
                    </span>
                  ) : null}
                </DialogTitle>
                {detail.description ? (
                  <DialogDescription>{detail.description}</DialogDescription>
                ) : null}
              </DialogHeader>
              {detail.templateUrl ? (
                <div className="overflow-hidden rounded-lg border border-border/60 bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 원격 템플릿 시트 */}
                  <img
                    src={detail.templateUrl}
                    alt={`${detail.name} 캐릭터 템플릿`}
                    className="w-full object-contain"
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </aside>
  )
}
