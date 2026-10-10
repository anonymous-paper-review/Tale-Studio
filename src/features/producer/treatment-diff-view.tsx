'use client'

// 트리트먼트 미리 보기의 바뀐 문단(2026-10-02 오너 — "이전 내용은 취소표시로 새로 써진 내용은 초록 배경으로").
//   씬(문단) 단위: 그대로인 씬은 한 번, 바뀐 씬은 새 글(초록 바탕) 아래 이전 글(취소선), 새 씬은 새 글만, 없어진 씬은 이전 글만.
//   상태는 색만으로 보이지 않는다 — 위 범례와 화면 읽기용 표시를 함께 단다(design.md §2.5).
import { useT } from '@/lib/i18n'
import type { TreatmentDiffRow } from '@/lib/producer/scene-story-rewrite'

export function TreatmentDiffView({ rows }: { rows: TreatmentDiffRow[] }) {
  const t = useT()
  return (
    <div className="space-y-3" data-testid="treatment-diff">
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground" aria-hidden>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-success/30 ring-1 ring-success/50" />{t('New text')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="line-through">{t('Previous text')}</span></span>
      </div>
      <article className="max-h-[32rem] space-y-4 overflow-y-auto pr-1">
        {rows.map((row, index) => (
          <div key={index} className="flex gap-3" data-diff-row={row.kind}>
            <span className="w-7 shrink-0 pt-1 font-mono text-[11px] text-muted-foreground">{row.number ? `S${row.number}` : ''}</span>
            <div className="min-w-0 flex-1 space-y-2">
              {row.kind === 'same' ? <p className="text-[15px] leading-8 text-foreground/90">{row.after}</p> : null}
              {row.kind === 'changed' || row.kind === 'added' ? (
                <p data-diff="new" className="rounded-md bg-success/10 px-2 py-0.5 text-[15px] leading-8 text-foreground ring-1 ring-success/30">
                  <span className="sr-only">{t('New text')}: </span>
                  {row.after}
                </p>
              ) : null}
              {row.kind === 'changed' || row.kind === 'removed' ? (
                <p data-diff="old" className="px-2 text-[12.5px] leading-6 text-muted-foreground line-through decoration-muted-foreground/70">
                  <span className="sr-only">{t('Previous text')}: </span>
                  {row.before}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </article>
    </div>
  )
}
