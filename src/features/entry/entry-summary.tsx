'use client'

// 시작한 프로젝트의 Producer 화면(리뉴얼 1차 2026-10-19) — 고칠 수 없는 완료 화면.
//   넘어간 Producer 는 잠금이 아니라 할 일을 끝낸 "완료"다(프로토타입 원칙). 고른 값 · 잠긴 화면 비율을 보여주고 [Writer로 가기].
//   산문 초안 쓰기가 실패했거나 시작하지 못했으면 그 자리에서 [다시 시도](같은 값으로 Writer 시작을 다시 보낸다).
import { useRouter } from 'next/navigation'
import { ArrowRight, CircleCheck, Lock, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { useProjectStore } from '@/stores/project-store'
import { useEntryStore } from './entry-store'
import { FileChip } from './entry-parts'
import { materialPreview, summaryRows } from './summary'


export function EntrySummary() {
  const t = useT()
  const router = useRouter()
  const draft = useEntryStore((s) => s.draft)
  const locale = useEntryStore((s) => s.locale)
  const writer = useEntryStore((s) => s.writer)
  const writerStart = useEntryStore((s) => s.writerStart)
  const writing = useEntryStore((s) => s.writing)
  const retryWriter = useEntryStore((s) => s.retryWriter)
  const projectId = useEntryStore((s) => s.projectId)

  const fromNewFlow = !!draft.startedAt
  // 시작했는데 Writer 실행이 없거나 산문 초안이 실패했다 — 같은 값으로 초안을 다시 쓰게 한다.
  //   확정 뒤의 Writer 작업이 실패한 것은 Writer 화면에서 다시 돌린다(여기서 다시 쓰면 초안부터 새로 쓴다).
  const draftFailed = !!writer?.started && writer.status === 'failed' && writer.draft
  const needsRetry = fromNewFlow && !!writerStart && (!writer?.started || draftFailed) && writing.status !== 'done'
  const busy = writing.status === 'starting' || writing.status === 'writing'
  const preview = materialPreview(draft)

  const goWriter = () => {
    useProjectStore.getState().unlockThrough('producer')
    router.push(`/studio/producer?projectId=${encodeURIComponent(projectId ?? '')}`)
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <CircleCheck className="size-5 shrink-0 text-success" aria-hidden />
          <h2 className="text-xl font-semibold">{t('This project has started')}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {fromNewFlow
            ? t('The Producer settings are done and cannot be changed. Continue in Writer.')
            : t('This project was started before the new start screen. Continue in Writer.')}
        </p>
      </div>

      {fromNewFlow && (preview || draft.file) ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6" aria-label={t('Story material')}>
          <h3 className="text-sm font-medium">{t('Story material')}</h3>
          {preview ? <p className="line-clamp-6 select-text whitespace-pre-wrap text-sm">{preview}</p> : null}
          {draft.file ? (
            <div>
              <FileChip file={draft.file} />
            </div>
          ) : null}
        </section>
      ) : null}

      {fromNewFlow ? (
        <section className="rounded-xl border border-border bg-card p-6" aria-label={t('Settings')}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            {summaryRows(draft, { t, locale, mode: 'done' }).map((row) => (
              <div key={row.key} className="contents">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="flex flex-wrap items-center gap-2 break-words">
                  <span className={row.key === 'ratio' ? 'font-mono tabular-nums' : undefined}>{row.value}</span>
                  {row.locked ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      <Lock className="size-3" aria-hidden />
                      {t('Locked')}
                    </span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
        {needsRetry ? (
          <>
            <p className="mr-auto text-sm text-muted-foreground" role="status">
              {t('The prose draft has not been written yet.')}
            </p>
            <Button onClick={() => void retryWriter()} disabled={busy}>
              <RotateCcw aria-hidden />
              {t('Try again')}
            </Button>
          </>
        ) : (
          <Button onClick={goWriter}>
            {t('Go to Writer')}
            <ArrowRight aria-hidden />
          </Button>
        )}
      </footer>
    </div>
  )
}
