'use client'

// 화면에서 고르기(1안, 리뉴얼 1차 2026-10-19 · 프로토타입 E1 · E3 · E4): ① 이야기 재료(글 + 파일) → ② 설정.
//   설정에는 AI가 글을 읽고 고른 추천이 미리 들어 있고, 장르·분위기와 길이는 이유를 한 줄씩 보여준다.
//   화면 비율은 잠금 묶음에 따로 둔다 — [AI로 진행] → 확인 창 [예, 시작]에서 잠기고 산문 초안을 쓴다.
//   형식 고르기(단편 · 광고 · MV …) · 이미지 권리 동의 · 채팅 · 대사 언어 고르기는 없다(채팅 · 대사 언어 = 사이트 언어).
//   시리즈 다음 화(2026-10-26 · 프로토타입 E3s)는 화면 비율에 "앞 화" 표시를 붙이고, 앞 화 대사 언어를 잠금 묶음에 보여 준다.
import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleAlert, Lock, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useLocale, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { fileHasText, picksComplete } from '@/lib/entry/draft'
import {
  MIN_IDEA_CHARS,
  MOODS,
  RATIOS,
  RUNTIMES,
  ideaLength,
  keepUnavailableNote,
  levelAvailable,
  levelQuestion,
  materialProblem,
  tooShortMessage,
} from './options'
import { fileReadLine, isScriptDraft, levelOptionsOf } from './chat-flow'
import { useEntryStore } from './entry-store'
import { FileChip, OptionGroup, UploadingChip, WhyLine, RecommendedBadge } from './entry-parts'
import { dialogueLanguageName, ratioRecommendation } from './series'
import { summaryRows } from './summary'

export function EntryForm() {
  const formStep = useEntryStore((s) => s.formStep)
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <Stepper step={formStep} />
      {formStep === 1 ? <MaterialStep /> : <SettingsStep />}
    </div>
  )
}

function Stepper({ step }: { step: 1 | 2 }) {
  const t = useT()
  const items = [t('Story material'), t('Settings')]
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label={t('Producer steps')}>
      {items.map((label, i) => {
        const n = (i + 1) as 1 | 2
        const done = n < step
        const current = n === step
        return (
          <li key={label} className="flex items-center gap-2" aria-current={current ? 'step' : undefined}>
            {i > 0 ? <span className="h-px w-6 bg-border" aria-hidden /> : null}
            <span
              className={cn(
                'inline-flex size-5 items-center justify-center rounded-full border font-mono text-xs tabular-nums',
                current ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground',
              )}
              aria-hidden
            >
              {done ? <Check className="size-3" /> : n}
            </span>
            <span className={current ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

function MaterialStep() {
  const t = useT()
  const locale = useLocale()
  const draft = useEntryStore((s) => s.draft)
  const showLengthError = useEntryStore((s) => s.showLengthError)
  const upload = useEntryStore((s) => s.upload)
  const reading = useEntryStore((s) => s.reading)
  const readError = useEntryStore((s) => s.readError)
  const setIdea = useEntryStore((s) => s.setIdea)
  const formNext = useEntryStore((s) => s.formNext)
  const removeFile = useEntryStore((s) => s.removeFile)
  const openFileDialog = useEntryStore((s) => s.openFileDialog)

  const length = ideaLength(draft.idea)
  const problem = materialProblem(draft.idea, draft.file)
  const lengthError = showLengthError && problem ? tooShortMessage(locale, problem.length) : null
  const busy = !!reading || upload.status === 'uploading'

  return (
    <section className="flex flex-col gap-6" aria-labelledby="entry-material-title">
      <h2 id="entry-material-title" className="text-xl font-semibold">
        {t('What shall we make?')}
      </h2>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="entry-idea" className="text-sm font-medium">
            {t('Idea or plot')}
          </label>
          <span className="font-mono text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {t('{n} characters', { n: length })}
          </span>
        </div>
        <Textarea
          id="entry-idea"
          value={draft.idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder={t('Write who goes through what, and where')}
          aria-invalid={lengthError ? true : undefined}
          aria-describedby="entry-idea-help"
          className="min-h-40 resize-y text-sm"
        />
        {lengthError ? (
          <p id="entry-idea-help" role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{lengthError}</span>
          </p>
        ) : (
          <p id="entry-idea-help" className="text-xs text-muted-foreground">
            {t('Write at least {min} characters, or attach a file instead.', { min: MIN_IDEA_CHARS })}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3">
        {upload.status === 'uploading' ? (
          <UploadingChip name={upload.name ?? ''} />
        ) : draft.file ? (
          <FileChip file={draft.file} onRemove={() => void removeFile()} disabled={busy} />
        ) : (
          <p className="text-sm text-muted-foreground">{t('You can upload a script or memo file, or an image that contains text. You can also skip it.')}</p>
        )}
        <Button variant="outline" size="sm" className="ml-auto" onClick={openFileDialog} disabled={busy}>
          <Paperclip aria-hidden />
          {t('Attach a file')}
        </Button>
      </div>

      {readError ? (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("Couldn't make recommendations. Please try again.")}
        </p>
      ) : null}

      <footer className="flex items-center justify-between gap-4 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">{t('On the next screen, AI recommends the genre and mood and the length.')}</p>
        <Button onClick={() => void formNext()} disabled={busy}>
          {t('Next')}
          <ArrowRight aria-hidden />
        </Button>
      </footer>
    </section>
  )
}

function SettingsStep() {
  const t = useT()
  const draft = useEntryStore((s) => s.draft)
  const entryLocale = useEntryStore((s) => s.locale)
  const formPick = useEntryStore((s) => s.formPick)
  const formBack = useEntryStore((s) => s.formBack)
  const start = useEntryStore((s) => s.start)
  const writing = useEntryStore((s) => s.writing)
  const series = useEntryStore((s) => s.series)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const rec = draft.rec
  const { picks } = draft
  const isScript = isScriptDraft(draft)
  const levels = levelOptionsOf(draft)
  const level = levels.find((l) => l.key === picks.level) ?? null
  const keepOpen = levelAvailable('keep', draft.idea, draft.file)
  const complete = picksComplete(picks) && (picks.level !== 'keep' || keepOpen)
  const lengthFollowsOriginal = picks.level === 'keep'
  const starting = writing.status === 'starting' || writing.status === 'writing'

  return (
    <section className="flex flex-col gap-6" aria-labelledby="entry-settings-title">
      <div className="flex flex-col gap-1">
        <h2 id="entry-settings-title" className="text-xl font-semibold">
          {t('Shall we make it like this?')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('AI read your story material and picked these. If they fit, just go ahead.')}</p>
      </div>

      <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col gap-2">
          <OptionGroup
            label={t('Genre and mood')}
            options={MOODS.map((m) => ({ value: m.key, label: t(m.label) }))}
            value={picks.mood}
            recommended={rec?.mood}
            onChange={(v) => void formPick('mood', v)}
            className="grid-cols-2 sm:grid-cols-5"
          />
          <WhyLine text={rec?.moodWhy} />
        </div>

        <div className="flex flex-col gap-2">
          {/* 원작 그대로면 길이는 원작이 정한다 — 길이 단추를 끄고 그 까닭을 보인다(2026-10-27 오너). */}
          <OptionGroup
            label={t('Length')}
            options={RUNTIMES.map((r) => ({
              value: r.key,
              label: t(r.label),
              sub: t(r.sub),
              disabled: lengthFollowsOriginal,
              disabledReason: t('When the original is kept as is, the length follows the original.'),
            }))}
            value={lengthFollowsOriginal ? null : picks.runtime}
            recommended={lengthFollowsOriginal ? null : rec?.runtime}
            onChange={(v) => void formPick('runtime', v)}
            className="grid-cols-2 sm:grid-cols-4"
          />
          {lengthFollowsOriginal ? (
            <p className="flex items-center gap-1.5 text-xs text-foreground" data-testid="entry-length-follows-original">
              <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              {t('When the original is kept as is, the length follows the original.')}
            </p>
          ) : (
            <WhyLine text={rec?.runtimeWhy} />
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium" id="entry-level-title">
              {t(levelQuestion(isScript))}
            </span>
            {draft.file && fileHasText(draft.file) ? <p className="text-xs text-muted-foreground">{fileReadLine(draft, t)}</p> : null}
          </div>
          <div role="radiogroup" aria-labelledby="entry-level-title" className="grid gap-2 sm:grid-cols-3">
            <LevelOptions
              options={levels.map((l, i) => ({
                value: l.key,
                n: i + 1,
                label: t(l.label),
                sub: t(l.sub),
                disabled: l.key === 'keep' && !keepOpen,
                disabledReason: t(keepUnavailableNote('form')),
              }))}
              value={picks.level}
              recommended={rec?.level ?? null}
              onChange={(v) => void formPick('level', v)}
            />
          </div>
          {level ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md bg-muted/50 px-3 py-2 text-xs">
              <dt className="font-medium text-muted-foreground">{t('Keeps')}</dt>
              <dd>{t(level.keeps)}</dd>
              <dt className="font-medium text-muted-foreground">{t('Changes')}</dt>
              <dd>{t(level.changes)}</dd>
            </dl>
          ) : null}
          {!keepOpen ? <p className="text-xs text-muted-foreground">{t(keepUnavailableNote('form'))}</p> : null}
        </div>
      </div>

      <div data-entry-lock className="flex flex-col gap-4 rounded-xl border border-border p-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Lock className="size-4 text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-medium">{t('Screen ratio')}</h3>
          <span className="text-xs text-muted-foreground">
            {t(series?.ratio ? 'Picked the previous episode value. It cannot be changed after you start' : 'It cannot be changed after you start')}
          </span>
        </div>
        <OptionGroup
          label={t('Screen ratio')}
          hideLabel
          options={RATIOS.map((r) => ({ value: r.key, label: r.key, sub: t(r.sub), mono: true }))}
          value={picks.ratio}
          recommended={ratioRecommendation(series)}
          recommendedLabel={series?.ratio ? t('Previous episode') : undefined}
          onChange={(v) => void formPick('ratio', v)}
          className="grid-cols-2 sm:grid-cols-4"
        />
        {series?.dialogueLanguage ? (
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Lock className="size-4 text-muted-foreground" aria-hidden />
              <h3 className="text-sm font-medium">{t('Language')}</h3>
              <span className="text-xs text-muted-foreground">{t('Same as the previous episode. Locked to carry over the voices')}</span>
            </div>
            <span className="w-fit rounded-md border border-foreground bg-accent px-3 py-2 text-sm font-medium">{dialogueLanguageName(series.dialogueLanguage)}</span>
          </div>
        ) : null}
      </div>

      <footer className="flex items-start justify-between gap-4 border-t border-border pt-4">
        <Button variant="ghost" onClick={formBack} disabled={starting}>
          <ArrowLeft aria-hidden />
          {t('Story material')}
        </Button>
        <div className="flex flex-col items-end gap-1">
          <Button onClick={() => setConfirmOpen(true)} disabled={!complete || starting} aria-describedby={complete ? undefined : 'entry-start-help'}>
            {t('Proceed with AI')}
          </Button>
          {!complete ? (
            <p id="entry-start-help" className="text-xs text-muted-foreground">
              {t('Choose all the settings first.')}
            </p>
          ) : null}
        </div>
      </footer>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('Start like this?')}</DialogTitle>
            <DialogDescription>{t('When you start, the screen ratio is locked.')}</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
            {summaryRows(draft, { t, locale: entryLocale, series }).map((row) => (
              <div key={row.key} className="contents">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  {row.locked ? <Lock className="size-3.5" aria-hidden /> : null}
                  {row.label}
                </dt>
                <dd className="break-words">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">{t('You can change the genre and mood and the length again in Writer.')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t('No, let me fix it')}
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false)
                void start()
              }}
            >
              {t('Yes, start')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

interface LevelOptionItem {
  value: string
  n: number
  label: string
  sub: string
  disabled?: boolean
  disabledReason?: string
}

/** 바꿈 정도 카드(번호 · 이름 · 한 줄 설명) — OptionGroup 과 같은 라디오 규칙(화살표로 옮기며 고른다). */
function LevelOptions({ options, value, recommended, onChange }: { options: LevelOptionItem[]; value: string | null; recommended: string | null; onChange: (v: string) => void }) {
  const enabled = options.filter((o) => !o.disabled)
  const tabStop = enabled.find((o) => o.value === value)?.value ?? enabled[0]?.value
  const move = (from: string, dir: 1 | -1, target: HTMLElement) => {
    if (!enabled.length) return
    const at = enabled.findIndex((o) => o.value === from)
    const next = enabled[(at + dir + enabled.length) % enabled.length]
    onChange(next.value)
    const group = target.closest('[role="radiogroup"]')
    group?.querySelector<HTMLButtonElement>(`[data-level="${next.value}"]`)?.focus()
  }
  return (
    <>
      {options.map((o) => {
        const checked = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            data-level={o.value}
            aria-checked={checked}
            aria-disabled={o.disabled || undefined}
            title={o.disabled ? o.disabledReason : undefined}
            tabIndex={o.value === tabStop ? 0 : -1}
            onClick={() => {
              if (!o.disabled) onChange(o.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault()
                move(o.value, 1, e.currentTarget)
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault()
                move(o.value, -1, e.currentTarget)
              }
            }}
            className={cn(
              'flex flex-col items-start gap-1 rounded-md border px-3 py-2.5 text-left text-sm outline-none transition-colors duration-100 ease-out focus-visible:ring-[3px] focus-visible:ring-ring/50',
              checked ? 'border-foreground bg-accent' : 'border-border bg-background hover:border-border-strong hover:bg-accent/50',
              o.disabled && 'cursor-not-allowed opacity-50 hover:border-border hover:bg-background',
            )}
          >
            {/* 번호 · 이름은 한 덩어리, 추천 표시는 자리가 모자라면 다음 줄로 — 한 줄에 묶여 이름이 한 낱말씩 꺾이던 것(2026-10-27 오너). */}
            <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs tabular-nums text-muted-foreground" aria-hidden>
                  {o.n}
                </span>
                <span className="break-keep text-pretty font-medium">{o.label}</span>
              </span>
              {o.value === recommended ? (
                <span className="ml-auto">
                  <RecommendedBadge />
                </span>
              ) : null}
            </span>
            <span className="break-keep text-pretty text-xs text-muted-foreground">{o.sub}</span>
          </button>
        )
      })}
    </>
  )
}
