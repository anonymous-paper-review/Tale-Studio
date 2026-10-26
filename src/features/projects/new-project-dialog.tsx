'use client'

// [새 프로젝트]를 눌렀을 때 여는 창(2026-10-26 오너 — 카드마다 붙어 있던 [다음 화 만들기]를 여기로 옮겼다).
//   1단계: 처음부터 만들기 / 앞 화에서 이어 만들기.
//   2단계: 이어 만들 화 고르기 — 다음 화를 만들 수 있는 화만, 이름 검색, 최근에 고친 순서.
//   화를 고르면 카드에서 쓰던 만들기 창(NextEpisodeDialog)을 그대로 연다. 서버 주소 · 검사는 바뀌지 않았다.
//   판정은 ./series-list(순수)가 한다. 이어 만들 화가 하나도 없으면 부르는 쪽이 이 창 없이 /projects/new 로 간다(newProjectEntry).
//   프로젝트를 만들기 전에 갈라야 한다 — /projects/new 는 들어가자마자 빈 프로젝트를 만들어 칸 하나를 쓴다.
import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronRight, Layers, Lock, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useT } from '@/lib/i18n'
import { relativeTime } from '@/lib/i18n/relative-time'
import { projectStageLabel } from '@/lib/project/open-path'
import {
  continuableEpisodes,
  continueEntry,
  type ContinuableProject,
  type NextEpisodeFailure,
  type SeriesPlanState,
} from './series-list'
import { NextEpisodeDialog, SeriesPlanDialog, SeriesSlotLimitDialog, type SeriesTarget } from './next-episode-dialog'

/** 고를 화 목록 한 줄 — 목록 API(GET /api/project/list)의 프로젝트. */
export interface NewProjectChoice extends ContinuableProject {
  current_stage?: string | null
}

/** 1단계의 큰 선택지 하나. */
function ChoiceButton({
  icon,
  title,
  description,
  onClick,
  testId,
}: {
  icon: ReactNode
  title: string
  description: string
  onClick: () => void
  testId: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex w-full items-center gap-3 rounded-xl border border-border p-4 text-left transition-colors hover:border-primary/60 hover:bg-accent"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  )
}

export function NewProjectDialog({
  open,
  projects,
  plan,
  onClose,
}: {
  open: boolean
  projects: readonly NewProjectChoice[]
  plan: SeriesPlanState
  onClose: () => void
}) {
  const t = useT()
  const router = useRouter()
  const [step, setStep] = useState<'choose' | 'pick'>('choose')
  const [query, setQuery] = useState('')
  // 이 창을 닫은 뒤에도 뜨는 창들 — 만들기(N2) · 요금제(LU) · 칸(LS). 그래서 open 과 따로 둔다.
  const [target, setTarget] = useState<SeriesTarget | null>(null)
  const [block, setBlock] = useState<NextEpisodeFailure | null>(null)

  const close = () => {
    setStep('choose')
    setQuery('')
    onClose()
  }

  const startFresh = () => {
    close()
    router.push('/projects/new')
  }

  // 요금제 · 칸을 고르기 전에 먼저 알린다. 서버 검사는 만들 때 한 번 더 한다.
  const continueFromPrevious = () => {
    const entry = continueEntry(plan)
    if (entry === 'pick') {
      setStep('pick')
      return
    }
    close()
    setBlock(entry)
  }

  const pick = (project: NewProjectChoice) => {
    close()
    setTarget({ id: project.id, title: project.title || 'Untitled' })
  }

  const locked = !plan.canUseReference
  const episodes = step === 'pick' ? continuableEpisodes(projects, query) : []

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent className="sm:max-w-md">
          {step === 'choose' ? (
            <>
              <DialogHeader>
                <DialogTitle>{t('How do you want to start?')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <ChoiceButton
                  icon={<Plus className="size-4" aria-hidden />}
                  title={t('Start from scratch')}
                  description={t('Start a new story with new characters and backgrounds.')}
                  onClick={startFresh}
                  testId="new-project-scratch"
                />
                <ChoiceButton
                  icon={locked ? <Lock className="size-4" aria-hidden /> : <Layers className="size-4" aria-hidden />}
                  title={t('Continue from a previous episode')}
                  description={
                    locked
                      ? t('Available on Producer10 and above')
                      : t('Pick an episode and carry over its characters, backgrounds, art style and voices.')
                  }
                  onClick={continueFromPrevious}
                  testId="new-project-continue"
                />
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t('Which episode do you want to continue?')}</DialogTitle>
                <DialogDescription>
                  {t('Only episodes where you started making the character and background images appear. Most recently edited first.')}
                </DialogDescription>
              </DialogHeader>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('Find by project name')}
                  aria-label={t('Find by project name')}
                  className="pl-9"
                  autoFocus
                  data-testid="new-project-search"
                />
              </div>
              <div className="-mx-1 max-h-72 overflow-y-auto px-1">
                {episodes.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">{t('No episode matches that name.')}</p>
                ) : (
                  <ul className="space-y-1">
                    {episodes.map((project) => (
                      <li key={project.id}>
                        <button
                          type="button"
                          onClick={() => pick(project)}
                          data-testid="new-project-episode"
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">{project.title || 'Untitled'}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {projectStageLabel(project.current_stage)}
                              {project.updated_at ? ` · ${relativeTime(project.updated_at, t)}` : ''}
                            </span>
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep('choose')
                    setQuery('')
                  }}
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  {t('Back')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <NextEpisodeDialog project={target} onClose={() => setTarget(null)} onFailure={(failure) => setBlock(failure)} />
      <SeriesPlanDialog open={block === 'plan'} onClose={() => setBlock(null)} />
      <SeriesSlotLimitDialog open={block === 'slots'} slotLimit={plan.slotLimit} onClose={() => setBlock(null)} />
    </>
  )
}
