'use client'

// 샷 팝업의 대사 칸(오너 2026-11-27 P1 "shot 단위로 보여주는 곳에서 대사 꼭 보이게") — Storyboard 샷 팝업 · Director 샷 상세(팝업 · 노드형 왼쪽 패널)가 같이 쓴다.
//   머리 "대사" 아래 글이 있는 줄마다 말하는 사람 · 대사(카드 · 대사 탭과 같은 이름 규칙 — lib/writer/board-card dialogueLinesView), 없으면 "대사 없음".
//   고칠 Writer 샷(edit)을 주면 줄을 눌러 그 자리에서 글을 고친다(오너 Q1 "추천대로") — 대사 탭과 같은 줄(DialogueLineRow) · 키 · 규칙 · 저장 길(use-dialogue-line-edits).
//   말하는 사람 · 줄 더하기 · 빼기는 여기서 하지 않는다 — 어디서 하는지는 부르는 쪽이 안내 줄로 준다(지금 사실인 곳만): 대사가 있을 때 hint, 없을 때 emptyHint.
//   대사를 아직 못 읽었으면 "대사 없음"이라고 하지 않는다 — 불러오는 중 · 불러오지 못함(+ [다시 불러오기])(검토 rev-flow-2-2 1번). 시안 없음.
//   약속: tests/writer/real-dialog-lines.test.ts · tests/director/shot-detail-dialogue.test.ts · tests/writer/dialogue-line-edits.test.ts
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogueLineRow } from '@/features/writer/dialogue-line-row'
import { useDialogueLineEdits } from '@/features/writer/use-dialogue-line-edits'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { dialogueLinesView } from '@/lib/writer/board-card'
import { lineKey } from '@/lib/writer/dialogue-line-edits'
import { resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import type { DialogueLine } from '@/types'

export function ShotDialogue({ lines, characterNames, entityNames, hint, emptyHint, status = 'ready', onRetry, edit, className }: {
  lines: readonly DialogueLine[] | null | undefined
  /** 인물 id → 이름(Writer 인물 목록). */
  characterNames: ReadonlyMap<string, string>
  /** 대사에 새어 나온 id(char_3 · location_2)를 이름으로 — 보기만 바꾼다. */
  entityNames: ReadonlyArray<{ id: string; name: string }>
  /** 대사가 있을 때 어디서 고치는지 한 줄(없으면 싣지 않는다). */
  hint?: string | null
  /** 대사가 없을 때 어디서 넣는지 한 줄(없으면 싣지 않는다). */
  emptyHint?: string | null
  /** 대사를 다 읽었나 — loading · failed 면 줄 · "대사 없음" · 안내 대신 그 상태를 말한다. */
  status?: 'ready' | 'loading' | 'failed'
  /** failed 일 때 [다시 불러오기]가 부른다(없으면 단추를 싣지 않는다). */
  onRetry?: () => void
  /** 줄을 눌러 고칠 Writer 샷과 화면(빈 줄 알림이 말하는 곳) — 없으면 보기만(공유 보기 · 고칠 Writer 샷 없음). */
  edit?: { shotId: string; screen: 'storyboard' | 'director' } | null
  className?: string
}) {
  const t = useT()
  const lineEdits = useDialogueLineEdits(edit?.screen ?? 'storyboard')
  const view = dialogueLinesView(lines, characterNames)
  const note = status === 'ready' ? (view.length > 0 ? hint : emptyHint) : null
  // 고칠 수 있는 줄 — 저장된 목록의 자리(index)를 지킨다(보기는 빈 줄을 뺀다). 보기와 같은 이름 규칙.
  const editable = edit
    ? (lines ?? []).flatMap((line, index) => (line.text?.trim() ? [{ line, index, speaker: line.characterId ? (characterNames.get(line.characterId) ?? line.characterId) : 'V.O.' }] : []))
    : []
  const display = (text: string) => resolveEntityNames(text, entityNames)
  return (
    <section className={cn('flex flex-col gap-2', className)} data-testid="shot-dialogue">
      <h3 className="text-label font-semibold text-foreground">{t('Dialogue')}</h3>
      {status === 'loading' ? (
        <p className="text-label text-subtle-foreground" data-testid="shot-dialogue-loading">{t('Loading the dialogue…')}</p>
      ) : status === 'failed' ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="shot-dialogue-failed">
          <p className="text-label text-muted-foreground">{t("Couldn't load the dialogue.")}</p>
          {onRetry ? (
            <Button type="button" size="sm" variant="outline" className="h-7" onClick={onRetry} data-testid="shot-dialogue-retry">
              <RefreshCw className="size-3.5" />{t('Load it again')}
            </Button>
          ) : null}
        </div>
      ) : edit && editable.length > 0 ? (
        <div className="flex flex-col gap-1" data-testid="shot-dialogue-lines">
          {editable.map(({ line, index, speaker }) => {
            const key = lineKey(edit.shotId, index)
            return (
              <DialogueLineRow
                key={index}
                compact
                rowRef={lineEdits.rowRef(key)}
                rowClassName="-mx-1.5 rounded-sm px-1.5 py-0.5 hover:bg-accent/30"
                speaker={speaker}
                speakerClassName={line.characterId ? 'text-foreground' : 'italic text-muted-foreground'}
                text={display(line.text.trim())}
                label={t('Edit dialogue line {line} ({speaker})', { line: index + 1, speaker })}
                state={lineEdits.lineState(key, display)}
                onStart={() => lineEdits.start(edit.shotId, index, line)}
                onDraftChange={(draft) => lineEdits.setDraft(key, draft)}
                onCommit={(via) => lineEdits.commit(via)}
                onCancel={lineEdits.cancel}
                onRetry={() => lineEdits.retry(key)}
                onRevert={() => lineEdits.revert(key)}
              />
            )
          })}
        </div>
      ) : view.length > 0 ? (
        <ul className="flex flex-col gap-1.5 text-label">
          {view.map((line, i) => (
            <li key={i} className="leading-relaxed">
              <span className="font-semibold text-foreground">{line.speaker}</span>{' '}
              <span className="text-muted-foreground">&ldquo;{display(line.text)}&rdquo;</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-label text-subtle-foreground">{t('No dialogue')}</p>
      )}
      {note ? <p className="text-caption text-subtle-foreground">{note}</p> : null}
    </section>
  )
}
