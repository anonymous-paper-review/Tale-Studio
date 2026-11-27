'use client'

// 샷 팝업의 대사 칸(오너 2026-11-27 P1 "shot 단위로 보여주는 곳에서 대사 꼭 보이게") — Storyboard 샷 팝업 · Director 샷 상세(팝업 · 노드형 왼쪽 패널)가 같이 쓴다.
//   머리 "대사" 아래 글이 있는 줄마다 말하는 사람 · 대사(카드 · 대사 탭과 같은 이름 규칙 — lib/writer/board-card dialogueLinesView), 없으면 "대사 없음".
//   보기만 한다 — 어디서 고치는지는 부르는 쪽이 안내 줄(hint)로 준다(지금 사실인 곳만). 시안 없음.
//   약속: tests/writer/real-dialog-lines.test.ts · tests/director/shot-detail-dialogue.test.ts
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { dialogueLinesView } from '@/lib/writer/board-card'
import { resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import type { DialogueLine } from '@/types'

export function ShotDialogue({ lines, characterNames, entityNames, hint, className }: {
  lines: readonly DialogueLine[] | null | undefined
  /** 인물 id → 이름(Writer 인물 목록). */
  characterNames: ReadonlyMap<string, string>
  /** 대사에 새어 나온 id(char_3 · location_2)를 이름으로 — 보기만 바꾼다. */
  entityNames: ReadonlyArray<{ id: string; name: string }>
  /** 어디서 고치는지 한 줄(없으면 싣지 않는다). */
  hint?: string | null
  className?: string
}) {
  const t = useT()
  const view = dialogueLinesView(lines, characterNames)
  return (
    <section className={cn('flex flex-col gap-2', className)} data-testid="shot-dialogue">
      <h3 className="text-label font-semibold text-foreground">{t('Dialogue')}</h3>
      {view.length > 0 ? (
        <ul className="flex flex-col gap-1.5 text-label">
          {view.map((line, i) => (
            <li key={i} className="leading-relaxed">
              <span className="font-semibold text-foreground">{line.speaker}</span>{' '}
              <span className="text-muted-foreground">&ldquo;{resolveEntityNames(line.text, entityNames)}&rdquo;</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-label text-subtle-foreground">{t('No dialogue')}</p>
      )}
      {hint ? <p className="text-caption text-subtle-foreground">{hint}</p> : null}
    </section>
  )
}
