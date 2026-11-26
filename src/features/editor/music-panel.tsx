'use client'

// Editor 위 왼쪽 판 [생성] — 음악 만들기(2026-11-26 오너 요청 E1 · 리드 답 O2 · O3, 시안 없음 — 효과 컨트롤과 같은 부품 · 토큰).
//   위: 만들기 칸(모델 칩 · 분위기 글 · 반주만/노래 · 가사(MiniMax 노래만) · 길이(ElevenLabs 만) · [음악 만들기 · 1 Take]).
//   아래: "만든 음악 · N" — 만드는 중(빛 테두리, 편집은 그대로) · 실패(까닭 + [다시 만들기]) · 끝(듣기 · [타임라인 추가] · [빼기]).
//   메인(크림) 단추는 화면에 하나(맨 위 [내보내기]) — [음악 만들기]는 보조 단추다(design.md §1 규칙 2).
//   약속: tests/editor/music-panel.test.ts
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2, Pause, Play, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ChoiceChip } from '@/components/controls/choice-chip'
import { useEditorMusicStore, placeableMusic, type EditorMusicItem } from '@/stores/editor-music-store'
import { useEditorStore, selectVideoLayout } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import { useTakeBalance } from '@/lib/billing/use-take-balance'
import { takeCostForMusic, takeValuesShown } from '@/lib/billing/take-cost'
import { sequenceLengthSec } from '@/lib/editor/sequence-info'
import {
  MUSIC_LENGTH_MAX_SEC,
  MUSIC_LENGTH_MIN_SEC,
  MUSIC_MODELS,
  MUSIC_MODEL_ORDER,
  defaultMusicLengthSec,
  formatMusicLength,
} from '@/lib/editor/music-models'
import { countText } from '@/lib/i18n/count-text'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** 이름 · 내용 한 줄 — 효과 컨트롤의 줄과 같은 모양. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-start gap-3">
      <span className="w-14 shrink-0 text-meta leading-8 text-muted-foreground">{label}</span>
      <div className="flex min-h-8 min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

/** 실패 까닭 → 고칠 수 있는 안내 한 줄. */
function failureText(code: string | null, t: ReturnType<typeof useT>): string {
  switch (code) {
    case 'content_policy':
      return t('The music service did not accept this text. Change the mood and make it again.')
    case 'insufficient_takes':
      return t('There were not enough Takes.')
    case 'timed_out':
      return t('It took too long and stopped.')
    default:
      return t('Something went wrong while making it. Make it again.')
  }
}

export function MusicPanel() {
  const t = useT()
  const projectId = useProjectStore((s) => s.projectId)
  const draft = useEditorMusicStore((s) => s.draft)
  const items = useEditorMusicStore((s) => s.items)
  const decoded = useEditorMusicStore((s) => s.decoded)
  const creating = useEditorMusicStore((s) => s.creating)
  const setDraft = useEditorMusicStore((s) => s.setDraft)
  const create = useEditorMusicStore((s) => s.create)
  const retry = useEditorMusicStore((s) => s.retry)
  const remove = useEditorMusicStore((s) => s.remove)
  const setProject = useEditorMusicStore((s) => s.setProject)
  // 시퀀스 길이 — 모든 영상 줄 끝 · 소리 끝 중 늦은 쪽(위 둘째 줄과 같은 값). 길이 칸 처음 값이다.
  const sequenceSec = useEditorStore((s) => sequenceLengthSec(selectVideoLayout(s), s.audioClips))
  const placeMusicAtPlayhead = useEditorStore((s) => s.placeMusicAtPlayhead)
  const takes = useTakeBalance()
  const spec = MUSIC_MODELS[draft.model]
  const length = draft.durationSec ?? defaultMusicLengthSec(sequenceSec)
  const placeable = placeableMusic(items, decoded)

  // 듣기 — 한 번에 한 곡. 판을 닫으면 멈춘다.
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  useEffect(() => () => audioRef.current?.pause(), [])
  const togglePlay = (item: EditorMusicItem) => {
    if (!item.url) return
    if (playingId === item.id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    audioRef.current?.pause()
    const audio = new Audio(item.url)
    audio.onended = () => setPlayingId((id) => (id === item.id ? null : id))
    audioRef.current = audio
    setPlayingId(item.id)
    void audio.play().catch(() => setPlayingId(null))
  }

  // 만들기를 보내면 새 줄(목록 맨 위)이 보이게 판을 조금만 내린다 — 판이 낮아 목록이 칸 아래에 숨어 있으면 만드는 중인지 모른다.
  const listRef = useRef<HTMLElement | null>(null)
  const onCreate = async () => {
    if (projectId) setProject(projectId)
    const sent = await create(sequenceSec)
    if (!sent) return
    requestAnimationFrame(() => listRef.current?.querySelector('[data-music-row]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }
  const cost = takeCostForMusic()
  const makeLabel = takeValuesShown(takes) ? countText(t, cost, 'Make music · 1 Take', 'Make music · {count} Takes', { count: cost }) : t('Make music')

  return (
    <div className="flex flex-col gap-4 px-4 py-3">
      <section className="flex flex-col gap-2">
        <h3 className="text-meta font-semibold text-subtle-foreground">{t('Make music')}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {MUSIC_MODEL_ORDER.map((key) => (
            <ChoiceChip key={key} selected={draft.model === key} onClick={() => setDraft({ model: key })}>
              {MUSIC_MODELS[key].label}
            </ChoiceChip>
          ))}
        </div>
        <Textarea
          aria-label={t('Mood')}
          placeholder={t('Describe the music: genre, instruments, tempo, mood')}
          className="min-h-20"
          value={draft.prompt}
          onChange={(e) => setDraft({ prompt: e.target.value })}
        />
        <Row label={t('Vocals')}>
          <ChoiceChip selected={draft.instrumental} onClick={() => setDraft({ instrumental: true })}>
            {t('Instrumental')}
          </ChoiceChip>
          <ChoiceChip selected={!draft.instrumental} onClick={() => setDraft({ instrumental: false })}>
            {t('With vocals')}
          </ChoiceChip>
        </Row>
        {spec.lyrics && !draft.instrumental ? (
          <Row label={t('Lyrics')}>
            <Textarea
              aria-label={t('Lyrics')}
              placeholder={t('Leave empty and the model writes lyrics from the mood')}
              className="min-h-16"
              value={draft.lyrics}
              onChange={(e) => setDraft({ lyrics: e.target.value })}
            />
          </Row>
        ) : null}
        <Row label={t('Length')}>
          {spec.length === 'exact' ? (
            <>
              <Input
                type="number"
                aria-label={t('Length')}
                value={length}
                min={MUSIC_LENGTH_MIN_SEC}
                max={MUSIC_LENGTH_MAX_SEC}
                step={1}
                className="h-8 w-20 font-num tabular-nums"
                onChange={(e) => {
                  const next = Number(e.target.value)
                  setDraft({ durationSec: e.target.value === '' || !Number.isFinite(next) ? null : next })
                }}
              />
              <span className="text-meta text-subtle-foreground">{t('seconds')}</span>
              <span className="text-meta text-subtle-foreground">{t('3 seconds to 3 minutes')}</span>
            </>
          ) : (
            <span className="text-meta leading-8 text-subtle-foreground">{t('The model picks the length.')}</span>
          )}
        </Row>
        <Button variant="secondary" className="self-start rounded-full" disabled={creating || !projectId} onClick={() => void onCreate()}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {makeLabel}
        </Button>
      </section>

      <section ref={listRef} className="flex flex-col gap-1.5">
        <h3 className="text-meta font-semibold text-subtle-foreground">{t('Made music · {count}', { count: items.length })}</h3>
        {items.length === 0 ? <p className="text-meta text-subtle-foreground">{t('Music you make appears here.')}</p> : null}
        {items.map((item) => {
          const info = decoded[item.id]
          const lengthSec = info?.durationSec ?? item.requestedDurationSec
          const ready = placeable.find((m) => m.id === item.id)
          return (
            <div key={item.id} data-music-row={item.id} className="relative flex flex-col gap-1 rounded-xl bg-card px-3 py-2">
              {item.status === 'queued' ? <span aria-hidden className="tale-beam pointer-events-none absolute inset-0 rounded-[inherit]" /> : null}
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-label text-foreground" title={item.prompt}>
                  {item.title}
                </span>
                {item.status === 'completed' && lengthSec ? (
                  <span className="shrink-0 font-num text-meta text-subtle-foreground tabular-nums">{formatMusicLength(lengthSec)}</span>
                ) : null}
              </div>
              {item.status === 'queued' ? (
                <p className="flex items-center gap-1.5 text-meta text-subtle-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  {t('Making… this can take a few minutes')}
                </p>
              ) : null}
              {item.status === 'failed' ? (
                <>
                  <p className="text-meta font-medium text-destructive">{t('Could not make this music')}</p>
                  <p className="text-meta text-subtle-foreground">{failureText(item.error, t)}</p>
                  <Button size="sm" variant="secondary" className="h-7 self-start rounded-full px-3" onClick={() => retry(item.id)}>
                    {t('Make again')}
                  </Button>
                </>
              ) : null}
              {item.status === 'completed' ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 gap-1 rounded-full px-3"
                    aria-pressed={playingId === item.id}
                    onClick={() => togglePlay(item)}
                  >
                    {playingId === item.id ? <Pause className="size-3" /> : <Play className="size-3" />}
                    {playingId === item.id ? t('Stop') : t('Play')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 gap-1 rounded-full px-3"
                    disabled={!ready}
                    title={ready ? undefined : t('Loading…')}
                    onClick={() => {
                      if (ready) placeMusicAtPlayhead(ready)
                    }}
                  >
                    <Plus className="size-3" />
                    {t('Add to timeline')}
                  </Button>
                  <button
                    type="button"
                    data-music-remove={item.id}
                    onClick={() => void remove(item.id)}
                    className={cn('ml-auto flex items-center gap-1 rounded px-1 text-meta font-medium text-subtle-foreground transition-colors hover:text-foreground')}
                  >
                    <X className="size-3" />
                    {t('Remove from list')}
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
      </section>
    </div>
  )
}
