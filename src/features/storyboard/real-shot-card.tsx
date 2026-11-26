'use client'

// Storyboard 실사 카드(오너 2026-11-26 m1126 S1 · S2 · S5 · G3) — 지금 Storyboard 카드 모양 그대로(머리 · 그림 · 샷 글 · 대사 한 줄 · 칩)이고
//   그림만 바뀐다: 실사가 있으면 실사(시작 · 연출 · 끝), 없으면 Writer 콘티의 목각 그림에 "콘티" 꼬리표, 둘 다 없으면 콘티 그림이 없다는 자리.
//   실사 · 콘티 그림을 그리거나 [시작]의 차례를 기다리는 동안 이 카드에만 기다림 카드(NodeWaitCard — Lumi 는 그림이라 여러 장이어도 WebGL 을 열지 않는다)를 덮는다.
//   그냥 누르면 샷 상세, ⌘/Ctrl+클릭은 채팅 멘션(lib/storyboard/mention). 지난 판 줄(m-history)은 이 카드를 바깥에서 감싼다.
//   무엇을 보일지는 lib/storyboard/real-board 가 정한다 — 여기는 그리기만 한다. 약속: tests/writer/real-card.test.ts
import { Fragment } from 'react'
import { AtSign, ImageOff, MoreHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { NodeWaitCard } from '@/components/feedback/node-wait'
import { RoughFrameCycle } from '@/components/rough-frame-cycle'
import { SHOT_TYPE_DESCRIPTIONS } from '@/features/writer/shot-type-info'
import { useT } from '@/lib/i18n'
import type { AppLocale } from '@/lib/locale'
import { cn } from '@/lib/utils'
import { cardDialogue, mentionSegments, shotCardChips } from '@/lib/writer/board-card'
import { resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import { mentionOnModifierClick, stopModifierPointerDown } from '@/lib/storyboard/mention'
import type { StoryboardCardPicture, StoryboardCardWait } from '@/lib/storyboard/real-board'
import type { Shot } from '@/types'

export interface RealShotCardProps {
  shot: Shot
  /** 카드 이름("씬 1 · 샷 2") — 보드 전체 번호, 화면 언어. */
  label: string
  picture: StoryboardCardPicture
  wait: StoryboardCardWait
  /** 좁은 카드(축척 5 · 6열) — 기다림 카드의 설명을 뺀다. */
  compact: boolean
  /** 화면 읽기에 기다림을 알리는 카드(여럿이면 보드 순서로 첫 장 하나만). */
  announceWait: boolean
  /** 샷 글 글자 크기(열 수에 따라 — lib/writer/board-card boardStoryFontSize). */
  storyFontSize: string
  locale: AppLocale
  /** 설명에 새어 나온 id(char_3 · location_2)를 이름으로 — 보기만 바꾼다. */
  entityNames: ReadonlyArray<{ id: string; name: string }>
  /** 대사 한 줄의 화자 이름. */
  characterNames: ReadonlyMap<string, string>
  /** 샷 글 속 인물 이름(멘션 색). */
  mentionNames: readonly string[]
  /** ⌘/Ctrl+클릭 멘션 이름("샷 2") — 없으면 멘션하지 않는다. */
  mentionLabel?: string
  /** 채팅 입력에 이 카드의 "@샷 N"이 붙어 있다 — 하늘색 테두리. */
  mentioned: boolean
  /** ⌘/Ctrl 를 누르고 있다 — 멘션 알약 · 붙이기 커서. */
  armed: boolean
  onOpen: () => void
}

export function RealShotCard({
  shot,
  label,
  picture,
  wait,
  compact,
  announceWait,
  storyFontSize,
  locale,
  entityNames,
  characterNames,
  mentionNames,
  mentionLabel,
  mentioned,
  armed,
  onOpen,
}: RealShotCardProps) {
  const t = useT()
  const seconds = t('{seconds}s', { seconds: shot.durationSeconds })
  const dialogue = cardDialogue(shot.dialogueLines, characterNames)
  const dialogueText = dialogue ? resolveEntityNames(dialogue.text, entityNames) : ''
  return (
    <article
      role="button"
      tabIndex={0}
      data-shot-id={shot.shotId}
      data-picture={picture.kind}
      data-wait={wait}
      onClick={onOpen}
      onPointerDownCapture={stopModifierPointerDown}
      onClickCapture={(event) => {
        mentionOnModifierClick(event, mentionLabel)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'group relative flex cursor-pointer flex-col gap-2.5 rounded-xl bg-panel p-3 transition-colors duration-100 hover-red-beam focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50',
        // 입력에 "@샷 N"이 붙은 카드 — Producer · Artist 카드와 같은 하늘색 테두리.
        mentioned && 'mention-flash bg-sky-400/10 ring-2 ring-sky-400/70',
        armed && mentionLabel && 'cursor-copy',
      )}
    >
      {mentionLabel ? (
        // ⌘/Ctrl 를 누르고 있는 동안만 보이는 멘션 알약(Producer 카드와 같은 말 · 같은 모양).
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute -top-2.5 right-3 z-20 inline-flex items-center gap-1 rounded-full border border-sky-400/50 bg-popover px-2 py-0.5 text-[10px] font-medium text-sky-300 opacity-0 shadow-sm transition-opacity',
            armed && 'opacity-100',
          )}
        >
          <AtSign className="size-3" /> {mentioned ? t('⌘/Ctrl+click to unmention') : t('⌘/Ctrl+click to mention')}
        </span>
      ) : null}
      {/* 카드 머리 — 전체 번호 이름 · 길이 · ···(샷 상세, 카드 누르기와 같다). */}
      <div className="flex items-center gap-1.5">
        <span className="font-num text-micro font-semibold text-foreground">{label}</span>
        <span className="font-num text-meta font-medium tabular-nums text-subtle-foreground">{seconds}</span>
        <Button
          size="icon-xs"
          variant="ghost"
          className="ml-auto text-subtle-foreground"
          aria-label={t('{label} · edit', { label })}
          title={t('{label} · edit', { label })}
          onClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
        >
          <MoreHorizontal />
        </Button>
      </div>

      <CardPicture picture={picture} label={label} />

      {/* 샷 글 — 전문(잘라내지 않는다, 축소하면 글자도 준다). 인물 이름은 멘션 색. */}
      <p className="font-medium leading-[1.4] text-foreground" style={{ fontSize: storyFontSize }}>
        {mentionSegments(resolveEntityNames(shot.actionDescription, entityNames), mentionNames).map((part, i) =>
          part.mention ? (
            <span key={i} className="font-semibold text-mention">{part.text}</span>
          ) : (
            <Fragment key={i}>{part.text}</Fragment>
          ),
        )}
      </p>
      {dialogue ? (
        <p className="truncate text-caption text-muted-foreground" title={`${dialogue.speaker} “${dialogueText}”`}>
          {dialogue.speaker} &ldquo;{dialogueText}&rdquo;
          {dialogue.more > 0 ? <span className="ml-1.5 font-num text-subtle-foreground">+{dialogue.more}</span> : null}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {shotCardChips(shot, locale).map((chip) =>
          chip.kind === 'size' ? (
            <TooltipProvider key={chip.kind}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="tag" className="cursor-help">
                    {chip.label}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{t(SHOT_TYPE_DESCRIPTIONS[shot.shotType] ?? shot.shotType)}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Badge key={chip.kind} variant="tag">
              {chip.label}
            </Badge>
          ),
        )}
      </div>

      {wait !== 'none' ? (
        // 카드 전체를 덮는다(SYS "그 노드 크기에 맞춘다") — 덮인 카드도 누르면 상세가 열린다. 화면 읽기에는 첫 장만 알린다.
        <NodeWaitCard
          lumi="storyboard"
          title={wait === 'drawing' ? t('Drawing the image') : wait === 'rough' ? t('Drawing the rough sketch') : t('Waiting to generate image')}
          description={compact ? undefined : `${label} · ${seconds}`}
          announce={announceWait}
          className={compact ? 'gap-2 p-2.5' : undefined}
        />
      ) : null}
    </article>
  )
}

/** 카드 그림 칸 — 실사 · 콘티(꼬리표) · 없음. 그림을 눌러도 순환을 멈추지 않고 카드 누르기(상세)로 넘긴다. */
function CardPicture({ picture, label }: { picture: StoryboardCardPicture; label: string }) {
  const t = useT()
  if (picture.kind === 'none') {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-1.5 rounded-[14px] bg-art-placeholder p-3 text-center">
        <ImageOff className="size-6 text-subtle-foreground" aria-hidden />
        <p className="text-caption font-medium text-muted-foreground">{t('No rough storyboard yet')}</p>
        <p className="text-micro text-subtle-foreground">{t('Draw it in Writer, then press Start.')}</p>
      </div>
    )
  }
  return (
    <div className="relative overflow-hidden rounded-[14px]">
      <RoughFrameCycle
        panel={picture.panel}
        alt={picture.kind === 'real' ? label : t('{label} (previz)', { label })}
        introPlay
        sizeToImage
        pauseOnClick={false}
        frameTag
      />
      {picture.kind === 'conti' ? (
        // 아직 실사가 아니다 — 콘티(목각 연필) 그림이라는 꼬리표(혼자 정한 것 m).
        <span className="pointer-events-none absolute left-2 top-2 z-[1] rounded-full bg-background/85 px-2 py-0.5 text-tag font-semibold text-muted-foreground">
          {t('Rough sketch')}
        </span>
      ) : null}
    </div>
  )
}
