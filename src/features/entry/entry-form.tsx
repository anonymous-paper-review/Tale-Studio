'use client'

// 화면에서 고르기(1안, 리뉴얼 1차 2026-10-19 · 프로토타입 E1 · E3 · E4): ① 이야기 재료(글 + 파일) → ② 설정.
//   설정에는 AI가 글을 읽고 고른 추천이 미리 들어 있고, 장르·분위기와 길이는 이유를 한 줄씩 보여준다.
//   화면 비율은 잠금 묶음에 따로 둔다 — [AI로 진행] → 확인 창 [예, 시작]에서 잠기고 산문 초안을 쓴다.
//   형식 고르기(단편 · 광고 · MV …) · 이미지 권리 동의 · 채팅 · 대사 언어 고르기는 없다(채팅 · 대사 언어 = 사이트 언어).
//   시리즈 다음 화(2026-10-26 · 프로토타입 E3s)는 화면 비율에 "앞 화" 표시를 붙이고, 앞 화 대사 언어를 잠금 묶음에 보여 준다.
import { useId, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleAlert, Lock, Paperclip } from 'lucide-react'
import { OptionCard } from '@/components/controls/choice-chip'
import { PageHeader } from '@/components/layout/page-header'
import { Lumi, LumiView } from '@/components/lumi/lumi'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { STAGE_PERSONA } from '@/lib/lumi'
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
import { FileChip, OPTION_OFF_CLASS, OptionGroup, UploadingChip, WhyLine, WithOffReason } from './entry-parts'
import { dialogueLanguageName, ratioRecommendation } from './series'
import { summaryRows } from './summary'

export function EntryForm() {
  const formStep = useEntryStore((s) => s.formStep)
  return (
    // 가운데 단 860(시안 E3 Column) + 좌우 32.
    <div className="mx-auto flex w-full max-w-[924px] flex-col gap-6 px-8 py-10">
      <Stepper step={formStep} />
      {formStep === 1 ? <MaterialStep /> : <SettingsStep />}
    </div>
  )
}

/** 단계 표시(v3 시안 E3) — 지금 단계는 단계 배지 알약, 끝낸 단계는 체크, 남은 단계는 흐린 번호. */
function Stepper({ step }: { step: 1 | 2 }) {
  const t = useT()
  const items = [t('Story material'), t('Settings')]
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label={t('Producer steps')}>
      {items.map((label, i) => {
        const n = (i + 1) as 1 | 2
        const done = n < step
        const current = n === step
        return (
          <li
            key={label}
            className={cn('inline-flex items-center gap-1.5 rounded-full py-[5px] pl-1.5 pr-3', current && 'bg-stage-badge text-stage-badge-foreground')}
            aria-current={current ? 'step' : undefined}
          >
            <span
              className={cn(
                'inline-flex size-5 items-center justify-center rounded-full font-num text-micro font-semibold tabular-nums',
                current ? 'bg-background text-foreground' : done ? 'bg-card text-foreground' : 'bg-card text-subtle-foreground',
              )}
              aria-hidden
            >
              {done ? <Check className="size-3" /> : n}
            </span>
            <span className={current ? 'text-label font-semibold' : done ? 'text-caption text-muted-foreground' : 'text-caption text-subtle-foreground'}>{label}</span>
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
      <PageHeader title={<span id="entry-material-title">{t('What shall we make?')}</span>} />

      {/* 이야기 재료 판 — 설정 화면(시안 E3)과 같은 큰 내용 판 하나에 글 · 파일을 담는다. */}
      <Card className="gap-5 rounded-[22px] px-6 py-[22px]">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="entry-idea" className="text-body font-semibold">
              {t('Idea or plot')}
            </label>
            <span className="font-num text-meta font-medium tabular-nums text-subtle-foreground" aria-live="polite">
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
            className="min-h-40 resize-y text-body"
          />
          {lengthError ? (
            <p id="entry-idea-help" role="alert" className="flex items-start gap-1.5 text-caption text-destructive">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{lengthError}</span>
            </p>
          ) : (
            <p id="entry-idea-help" className="text-caption text-subtle-foreground">
              {t('Write at least {min} characters, or attach a file instead.', { min: MIN_IDEA_CHARS })}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {upload.status === 'uploading' ? (
            <UploadingChip name={upload.name ?? ''} />
          ) : draft.file ? (
            <FileChip file={draft.file} onRemove={() => void removeFile()} disabled={busy} />
          ) : (
            <p className="text-caption text-muted-foreground">{t('You can upload a script or memo file, or an image that contains text. You can also skip it.')}</p>
          )}
          <Button variant="secondary" size="sm" className="ml-auto" onClick={openFileDialog} disabled={busy}>
            <Paperclip aria-hidden />
            {t('Attach a file')}
          </Button>
        </div>

        {readError ? (
          <p role="alert" className="flex items-start gap-1.5 text-label text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("Couldn't make recommendations. Please try again.")}
          </p>
        ) : null}
      </Card>

      <footer className="flex items-center justify-between gap-4">
        <p className="text-caption text-subtle-foreground">{t('On the next screen, AI recommends the genre and mood and the length.')}</p>
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
      <div className="flex flex-col gap-2.5">
        <PageHeader title={<span id="entry-settings-title">{t('Shall we make it like this?')}</span>} />
        {/* 시안 E3: 부제 앞에 Lumi(멈춘 그림, 작은 크기) — 추천을 골라 둔 것이 Lumi 라는 표시. */}
        <p className="flex items-center gap-2 text-body text-muted-foreground">
          <LumiView mode="still" persona={STAGE_PERSONA.entry} state="idle" size={30} className="shrink-0" />
          {t('AI read your story material and picked these. If they fit, just go ahead.')}
        </p>
      </div>

      {/* 설정 판(시안 E3 Settings Card) — 장르·분위기 · 길이 · 바꿈 정도 · 화면 비율(잠금 묶음)을 한 판에 칸마다 나눠 담는다. */}
      <Card className="gap-1 rounded-[22px] p-0">
        <div className="px-6 py-[22px]">
          <OptionGroup
            variant="chip"
            label={t('Genre and mood')}
            aside={<WhyLine text={rec?.moodWhy} className="justify-end" />}
            options={MOODS.map((m) => ({ value: m.key, label: t(m.label) }))}
            value={picks.mood}
            recommended={rec?.mood}
            onChange={(v) => void formPick('mood', v)}
          />
        </div>

        <div className="px-6 py-[22px]">
          {/* 원작 그대로면 길이는 원작이 정한다 — 길이 단추를 끄고 그 까닭을 보인다(2026-10-27 오너). */}
          <OptionGroup
            label={t('Length')}
            aside={
              lengthFollowsOriginal ? (
                <p className="flex items-center justify-end gap-1.5 text-caption text-foreground" data-testid="entry-length-follows-original">
                  <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  {t('When the original is kept as is, the length follows the original.')}
                </p>
              ) : (
                <WhyLine text={rec?.runtimeWhy} className="justify-end" />
              )
            }
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
        </div>

        <div className="flex flex-col gap-3 px-6 py-[22px]">
          <div className="flex flex-col gap-1">
            <span className="text-body font-semibold" id="entry-level-title">
              {t(levelQuestion(isScript))}
            </span>
            {draft.file && fileHasText(draft.file) ? <p className="text-caption text-muted-foreground">{fileReadLine(draft, t)}</p> : null}
          </div>
          <div role="radiogroup" aria-labelledby="entry-level-title" className="grid gap-2.5 sm:grid-cols-3">
            <LevelOptions
              options={levels.map((l) => ({
                value: l.key,
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
            <dl className="flex flex-wrap gap-x-[18px] gap-y-1 rounded-xl bg-card px-3.5 py-2.5">
              <div className="flex items-baseline gap-2">
                <dt className="shrink-0 text-micro font-semibold text-subtle-foreground">{t('Keeps')}</dt>
                <dd className="text-caption">{t(level.keeps)}</dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="shrink-0 text-micro font-semibold text-subtle-foreground">{t('Changes')}</dt>
                <dd className="text-caption">{t(level.changes)}</dd>
              </div>
            </dl>
          ) : null}
          {!keepOpen ? <p className="text-caption text-muted-foreground">{t(keepUnavailableNote('form'))}</p> : null}
        </div>

        {/* 잠금 묶음 — 화면 비율은 시작하는 순간 잠긴다. 판 안의 따로 된 칸, 잠금 표시와 경고 글자로 무게를 보인다(시안 E3). */}
        <div data-entry-lock className="flex flex-col gap-3 px-6 py-[22px]">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="flex items-center gap-1.5">
              <Lock className="size-4 text-muted-foreground" aria-hidden />
              <h3 className="text-body font-semibold">{t('Screen ratio')}</h3>
            </span>
            <span className="text-micro font-semibold text-lock-note">
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
            <div className="flex flex-col gap-3 pt-3">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="flex items-center gap-1.5">
                  <Lock className="size-4 text-muted-foreground" aria-hidden />
                  <h3 className="text-body font-semibold">{t('Language')}</h3>
                </span>
                <span className="text-micro font-semibold text-lock-note">{t('Same as the previous episode. Locked to carry over the voices')}</span>
              </div>
              {/* 바꿀 수 없는 값 — 고른 선택 카드 모양으로 보이기만 한다(누르는 칸이 아니다). */}
              <span className="w-fit rounded-[14px] border-[1.5px] border-stage bg-stage/18 px-4 py-3 text-body font-semibold">{dialogueLanguageName(series.dialogueLanguage)}</span>
            </div>
          ) : null}
        </div>
      </Card>

      <footer className="flex items-start justify-between gap-4">
        <Button variant="ghost" size="sm" className="rounded-full" onClick={formBack} disabled={starting}>
          <ArrowLeft aria-hidden />
          {t('Story material')}
        </Button>
        <div className="flex flex-col items-end gap-1">
          <Button onClick={() => setConfirmOpen(true)} disabled={!complete || starting} aria-describedby={complete ? undefined : 'entry-start-help'}>
            {t('Proceed with AI')}
            <ArrowRight aria-hidden />
          </Button>
          {!complete ? (
            <p id="entry-start-help" className="text-caption text-subtle-foreground">
              {t('Choose all the settings first.')}
            </p>
          ) : null}
        </div>
      </footer>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          {/* 확인 창의 큰 Lumi(오너 11/3 결정 8) — 지금 단계(Producer) 옷 · 기본 모습. */}
          <Lumi persona={STAGE_PERSONA.entry} state="idle" size={180} className="-mb-2 self-center" />
          <DialogHeader>
            <DialogTitle>{t('Start like this?')}</DialogTitle>
            <DialogDescription>{t('When you start, the screen ratio is locked.')}</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 rounded-xl bg-card px-4 py-3 text-label">
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
          <p className="text-caption text-subtle-foreground">{t('You can change the genre and mood and the length again in Writer.')}</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
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
  label: string
  sub: string
  disabled?: boolean
  disabledReason?: string
}

/** 바꿈 정도 카드(이름 · 한 줄 설명, v3 선택 카드) — OptionGroup 과 같은 라디오 규칙(화살표로 옮기며 고른다). */
function LevelOptions({ options, value, recommended, onChange }: { options: LevelOptionItem[]; value: string | null; recommended: string | null; onChange: (v: string) => void }) {
  const reasonBase = useId()
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
        const reason = o.disabled ? o.disabledReason : undefined
        const reasonId = `${reasonBase}-off-${o.value}`
        return (
          <WithOffReason key={o.value} reason={reason} id={reasonId}>
            <OptionCard
              role="radio"
              selected={o.value === value}
              recommended={o.value === recommended}
              data-level={o.value}
              aria-disabled={o.disabled || undefined}
              aria-describedby={reason ? reasonId : undefined}
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
              className={OPTION_OFF_CLASS}
              // 이름 · 설명은 낱말 단위로만 줄을 바꾼다 — 한 낱말씩 꺾이던 것(2026-10-27 오너).
              title={<span className="break-keep text-pretty">{o.label}</span>}
              description={<span className="break-keep text-pretty">{o.sub}</span>}
            />
          </WithOffReason>
        )
      })}
    </>
  )
}
