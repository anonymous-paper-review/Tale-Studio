'use client'

// 제작 여정 퀘스트 저널 (#quest-journal 2026-08-07) — producer 뷰어 리디자인 1단계.
//
// 지향: "가볍게 널어놓으면 에이전트가 엮어준다" — 화면은 입력 폼이 아니라 **달성의 뷰어**.
// 참조: research/ui-references/producer-viewer-mock.html 변형 C (퀘스트 저널).
//   - 세로 여정(씨앗→설정→주인공→무대→Writer 호출)은 목업의 저니맵을 그대로 차용.
//   - 진행 판정은 evaluateProducerGate 가 단일 진실 — 여기는 그 결과를 그리기만 한다.
//   - 저널은 순수 뷰어 — 버튼/경고 없음. Writer 호출도 채팅이 담당한다(게이트가 열리면
//     프로액티브 제안이 뜨고, "Writer로 넘겨줘"라고 말해도 된다). (#feedback 2026-08-07:
//     저널의 호출 버튼 제거 — 행동 진입점이 채팅 하나로 수렴해야 직관적이다.)
//
// StoryFoundationBadges: 옛 Story Foundation 폼의 대체물(설정 뱃지 + popover 편집).
//   저널이 아니라 Brief Story 섹션(우측 컬럼)에 산다 — 설정은 이야기의 파생물이라
//   스토리 텍스트 옆에 있어야 맥락이 맞는다(#feedback 2026-08-07).

import { useEffect, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TagInput } from './tag-input'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import type { GateResult } from '@/lib/producer-gate'
import type { ProjectFormat } from '@/types'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

const FORMAT_OPTIONS: { value: ProjectFormat; label: string }[] = [
  { value: 'horizontal_16:9', label: '16:9 Horizontal' },
  { value: 'vertical_9:16', label: '9:16 Vertical' },
  { value: 'cinema_2.39:1', label: '2.39:1 Cinema' },
  { value: 'square_1:1', label: '1:1 Square' },
]

// 언어명은 각 언어의 자국어 표기(endonym) — 앱 UI 로케일과 무관하게 고정.
//   copy-style.md 의 고유명사 예외와 동일 취급, 사전화 대상 아님.
const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'ko', label: '한국어' }, // i18n-ok: 언어 자국어 표기(endonym), 번역 대상 아님
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
]

// 설정 뱃지 — 빈 상태(점선)와 점등 상태를 오간다. 값이 바뀌면 key 재마운트로 pop 연출.
const BADGE_BASE =
  'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors'
const BADGE_FILLED =
  'border-transparent bg-stage-producer/20 font-medium text-foreground hover:bg-stage-producer/30 animate-in fade-in-0 zoom-in-90 duration-300 motion-reduce:animate-none'
const BADGE_EMPTY =
  'border-dashed border-border-strong text-muted-foreground hover:border-stage-producer/60 hover:text-foreground'

function BadgeFace({ k, value }: { k: string; value: string | null }) {
  const t = useT()
  return (
    <>
      <span className="shrink-0 text-[9px] uppercase tracking-wide opacity-60">{k}</span>
      <span className="truncate">{value ?? t('Empty')}</span>
    </>
  )
}

/** popover 편집이 붙은 설정 뱃지 — 편집은 이 팝업 안에만(#quest-journal). */
function SettingBadge({
  k,
  value,
  children,
}: {
  k: string
  value: string | null
  children: ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" key={value ?? ''} className={cn(BADGE_BASE, value ? BADGE_FILLED : BADGE_EMPTY)}>
          <BadgeFace k={k} value={value} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" sideOffset={6} className="w-64 p-3">
        {children}
      </PopoverContent>
    </Popover>
  )
}

/** popover 안 옵션 나열형(포맷/언어) — Select 를 팝업에 겹치지 않고 버튼 목록으로. */
function OptionList({
  options,
  value,
  onSelect,
}: {
  options: { value: string; label: string }[]
  value: string
  onSelect: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onSelect(o.value)}
          className={cn(
            'flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent',
            o.value === value ? 'font-medium text-foreground' : 'text-muted-foreground',
          )}
        >
          {o.label}
          {o.value === value && <Check className="size-3 text-success" />}
        </button>
      ))}
    </div>
  )
}

/**
 * Story Foundation 뱃지 스트립 — 옛 폼 섹션의 대체물. Brief Story 카드 아래에 산다.
 * 빈 값 = 점선, 채워지면 producer 색 점등. 클릭 = popover 편집 (기본 동선은 채팅).
 */
export function StoryFoundationBadges({ className }: { className?: string }) {
  const t = useT()
  const settings = useProducerStore((s) => s.projectSettings)
  const updateSettings = useProducerStore((s) => s.updateSettings)
  const styleAnchors = useProducerStore((s) => s.styleAnchors)
  const styleAnchorKey = useProducerStore((s) => s.styleAnchorKey)
  const customStyleAnchor = useProducerStore((s) => s.customStyleAnchor)
  const loadStyleAnchors = useProducerStore((s) => s.loadStyleAnchors)
  const projectId = useProjectStore((s) => s.projectId)
  useEffect(() => {
    if (projectId) void loadStyleAnchors()
  }, [projectId, loadStyleAnchors])

  // 커스텀 앵커(custom_<uuid>)는 카탈로그에 행이 없어 위 조회가 비어 온다 — 라벨은 store 가 든다.
  const styleLabel =
    styleAnchors.find((a) => a.key === styleAnchorKey)?.label ?? customStyleAnchor?.label ?? null
  const formatLabel = FORMAT_OPTIONS.find((o) => o.value === settings.format)?.label ?? null
  const langLabel = LANGUAGE_OPTIONS.find((o) => o.value === settings.dialogueLanguage)?.label ?? null

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      <SettingBadge k={t('Runtime')} value={settings.playtime ? t('{sec}s', { sec: settings.playtime }) : null}>
        <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
          {t('Runtime (sec)')}
        </label>
        <Input
          type="number"
          min={5}
          value={settings.playtime || ''}
          placeholder={t('e.g. 120')}
          onChange={(e) => updateSettings({ playtime: Number(e.target.value) || 0 })}
          className="number-spin h-8 font-mono tabular-nums"
        />
      </SettingBadge>

      <SettingBadge k={t('Genre')} value={settings.genre || null}>
        <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">{t('Genre')}</label>
        <Input
          value={settings.genre}
          placeholder={t('e.g. thriller')}
          onChange={(e) => updateSettings({ genre: e.target.value })}
          className="h-8"
        />
      </SettingBadge>

      {/* 스타일 뱃지 — 표시 전용(#style-entry #feedback 2026-08-07): 선택 진입점은 채팅 툴바의
          스타일 버튼 하나로 수렴. hover 어포던스 없이 현재 값만 보여준다. */}
      <span
        className={cn(
          BADGE_BASE,
          'cursor-default',
          styleLabel
            ? 'border-transparent bg-stage-producer/20 font-medium text-foreground animate-in fade-in-0 zoom-in-90 duration-300 motion-reduce:animate-none'
            : 'border-dashed border-border-strong text-muted-foreground',
        )}
      >
        <BadgeFace k={t('Style')} value={styleLabel} />
      </span>

      <SettingBadge k={t('Format')} value={formatLabel}>
        <OptionList
          options={FORMAT_OPTIONS}
          value={settings.format}
          onSelect={(v) => updateSettings({ format: v as ProjectFormat })}
        />
      </SettingBadge>

      <SettingBadge k={t('Tone')} value={settings.tone.length ? settings.tone.join(', ') : null}>
        <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
          {t('Tone — fill this in for a better script')}
        </label>
        <TagInput
          values={settings.tone}
          onChange={(tone) => updateSettings({ tone })}
          placeholder={t('e.g. dark')}
        />
      </SettingBadge>

      <SettingBadge k={t('Dialogue language')} value={langLabel}>
        <OptionList
          options={LANGUAGE_OPTIONS}
          value={settings.dialogueLanguage || ''}
          onSelect={(v) => updateSettings({ dialogueLanguage: v })}
        />
      </SettingBadge>
    </div>
  )
}

interface JourneyNode {
  title: string
  desc: string
  done: boolean
}

export function ProducerQuestJournal({
  gate,
  personCount,
  className,
}: {
  gate: GateResult
  /** 게이트가 평가한 producer 원천 인물 수. 0명이면 "주인공 등장"은 아직 미달성이다. */
  personCount: number
  className?: string
}) {
  const t = useT()
  const hard = new Set(gate.hardMissing.map((i) => i.field))
  const castIssues = gate.hardMissing.filter((i) => i.field.startsWith('cast'))
  const settingsDone = !['playtime', 'genre', 'format', 'dialogueLanguage'].some((f) => hard.has(f))
  const storyDone = !hard.has('storyText')
  // 인물 수를 같이 봐야 한다 — 게이트는 D1·D2(러닝타임 60초 이하, 새 프로젝트의 playtime 0 포함)에서
  //   인물 0명을 통과시켜 cast 이슈를 하나도 안 낸다. 이슈 없음만 보면 빈 프로젝트가 첫 화면부터
  //   "주인공 등장" 체크로 뜬다.
  const castDone = personCount > 0 && castIssues.length === 0
  const stageDone = !hard.has('background:minComplete')

  const nodes: JourneyNode[] = [
    {
      title: t('Story seed'),
      desc: t('One scene, one feeling is enough — drop it in chat.'),
      done: storyDone,
    },
    {
      title: t('Settings locked in'),
      desc: t('These fill in as you talk — runtime, genre, format, language.'),
      done: settingsDone,
    },
    {
      title: t('Protagonist appears'),
      desc: castDone
        ? t('A vividly-drawn character is ready.')
        : personCount === 0
          ? t('No character yet — describe one in chat.')
          : t('{count} fields are empty — try describing a character.', { count: castIssues.length }),
      done: castDone,
    },
    {
      title: t('Stage complete'),
      desc: stageDone
        ? t('A background with a name, look, and purpose is ready.')
        : t('You need at least one background with a name, look, and purpose.'),
      done: stageDone,
    },
    {
      title: t('Call Writer'),
      desc: gate.canHandoff
        ? t("Everything's ready — call Writer from the chat.")
        : t('Complete the milestones to call Writer.'),
      done: false,
    },
  ]
  const nowIdx = nodes.findIndex((n) => !n.done)

  return (
    <aside className={cn('lg:sticky lg:top-0', className)}>
      <h2 className="mb-4 text-sm font-semibold">{t('Production journey')}</h2>
      {/* 세로 여정 레일 — 목업 저니맵 차용: 완료 = 초록 체크, 현재 = producer 색 링. */}
      <div className="relative pl-9">
        <span aria-hidden className="absolute bottom-3 left-[11px] top-2 w-0.5 bg-muted" />
        {nodes.map((n, i) => (
          <div key={n.title} className="relative pb-6 last:pb-0">
            <span
              className={cn(
                'absolute -left-9 top-0 z-10 flex size-6 items-center justify-center rounded-full border-2 border-card text-[11px] font-extrabold transition-colors',
                n.done
                  ? 'bg-success text-background'
                  : i === nowIdx
                    ? 'bg-stage-producer text-white ring-4 ring-stage-producer/25'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {n.done ? <Check className="size-3.5" strokeWidth={3.5} /> : i + 1}
            </span>
            <h3
              className={cn(
                'text-[13px] font-bold leading-6',
                n.done
                  ? 'text-muted-foreground/60 line-through decoration-muted-foreground/30'
                  : i === nowIdx
                    ? 'text-foreground'
                    : 'text-muted-foreground',
              )}
            >
              {n.title}
            </h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground/80">{n.desc}</p>
          </div>
        ))}
      </div>
    </aside>
  )
}
