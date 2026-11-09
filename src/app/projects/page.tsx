'use client'

// 프로젝트 대시보드 (#landing-v2 2026-08-03) — 옛 홈(/)의 #projects 섹션을 독립 페이지로.
//   로그인 전용(middleware 가 /login 으로 보냄). 랜딩(/)은 순수 마케팅 페이지가 됐고,
//   로그인 상태로 / 진입 시 middleware 가 여기로 돌린다.
//   상단 탭: 프로젝트(여기) | Playground(공개 갤러리, /playground).
//   v3(2026-11-03): 작업 화면과 같은 따뜻한 무채색 바탕 · 카드는 큰 내용 판(panel), 첫 화면에 큰 Lumi(화이트 펄 · 기본 모습,
//   오너 11/3 결정 8 · Lumi 가이드 "pearl = 시작 · 홈, 프로젝트 목록"). 한 화면에 큰 Lumi 는 하나 — 빈 목록이면 빈 안내 자리에 둔다.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  useProjectStore,
} from '@/stores/project-store'
import { PageHeader } from '@/components/layout/page-header'
import { Lumi } from '@/components/lumi/lumi'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { StageId } from '@/types'
import { projectOpenPath, projectStageLabel } from '@/lib/project/open-path'
import { DASHBOARD_CONTAINER, DashboardHeader } from '@/components/dashboard/dashboard-header'
import { useLocale, useT } from '@/lib/i18n'
import { relativeTime } from '@/lib/i18n/relative-time'
import { clearLastProjectId, readLastProjectId } from '@/lib/session-restore'
import {
  continuingEpisodes,
  newProjectEntry,
  prevEpisodeLink,
  type SeriesPlanState,
} from '@/features/projects/series-list'
import { DEFAULT_PROJECT_SORT, visibleProjects, type ProjectSort } from '@/features/projects/project-list'
import { ProjectListTools } from '@/features/projects/project-list-tools'
import { SeriesDeleteWarningDialog } from '@/features/projects/next-episode-dialog'
import { NewProjectDialog } from '@/features/projects/new-project-dialog'

interface ProjectItem {
  id: string
  title: string
  current_stage: string | null
  updated_at: string | null
  /** 대표 이미지(실사 스토리보드 > 러프 > 캐릭터, api/project/list) — 없으면 그라디언트 폴백 */
  thumbnail_url: string | null
  /** 시리즈(2026-10-26, api/project/list) — 앞 화 번호. 앞 화를 지우면 null 이 된다. */
  referenceProjectId: string | null
  /** 앞 화를 지워도 카드에 남는 앞 화 제목. 시리즈가 아니면 null. */
  seriesPrevTitle: string | null
  /** 이 화로 다음 화를 만들 수 있나 — 인물 · 배경 그림을 만들기 시작해 씬이 1개 이상 생긴 화. */
  canContinue: boolean
}

// #thumb-fit(2026-08-23 오너): 16:9 박스에 object-cover 로 욱여넣으면 이형 해상도(웹툰 세로 스트립,
//   시네마 와이드)가 잘려 보인다. 박스는 16:9 그대로 두고 — 세로형은 가로폭을 맞춰 위부터 넣고
//   호버 시 위→아래로 훑어 내려가며(넘친 만큼), 와이드형은 가로폭 맞춤 = 상하 레터박스.
//   판정은 로드된 실제 비율로 — 16:9 근방(±3%)만 종전 cover 유지.
function ProjectThumb({ url }: { url: string }) {
  const [fit, setFit] = useState<'cover' | 'tall' | 'wide'>('cover')
  const [panMs, setPanMs] = useState(0)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      onLoad={(e) => {
        const im = e.currentTarget
        if (!im.naturalWidth || !im.naturalHeight) return
        const ratio = im.naturalWidth / im.naturalHeight
        const box = 16 / 9
        if (ratio < box * 0.97) {
          setFit('tall')
          // 팬 시간은 넘친 높이에 비례 — 짧은 초과는 최소 1.2s, 웹툰 스트립도 6s 안에 완주.
          setPanMs(Math.min(6000, Math.max(1200, (box / ratio - 1) * 2600)))
        } else {
          setFit(ratio > box * 1.03 ? 'wide' : 'cover')
        }
      }}
      style={fit === 'tall' ? { transitionDuration: `${panMs}ms` } : undefined}
      className={
        fit === 'tall'
          ? 'absolute inset-x-0 top-0 w-full transition-transform ease-in-out group-hover:translate-y-[calc(100cqh-100%)]'
          : fit === 'wide'
            ? 'absolute inset-x-0 top-1/2 w-full -translate-y-1/2 transition-transform duration-500 group-hover:scale-[1.03]'
            : 'size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]'
      }
    />
  )
}

function ProjectCard({
  project,
  onOpen,
  onRenamed,
  onDeleteRequest,
}: {
  project: ProjectItem
  onOpen: (p: ProjectItem) => void
  onRenamed: (id: string, title: string) => void
  onDeleteRequest: (p: ProjectItem) => void
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(project.title || 'Untitled')
  const inputRef = useRef<HTMLInputElement>(null)

  const link = prevEpisodeLink(project)

  const handleSave = async () => {
    setEditing(false)
    const trimmed = title.trim() || 'Untitled'
    setTitle(trimmed)
    onRenamed(project.id, trimmed)
    await fetch(`/api/project/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: trimmed }),
    })
  }

  return (
    <div
      onClick={() => !editing && onOpen(project)}
      // v3: 유리(white/5 + 흐림) · 빨간 빛 대신 큰 내용 판 하나 — 올리면 한 단 밝아진다.
      //   11/5 시안(R2): 스튜디오 밖 바탕(lobby) 위에 한 단 밝은 판(side) · 모서리 18 · 그림자 없음.
      className="group flex cursor-pointer flex-col overflow-hidden rounded-[18px] bg-side text-left transition-colors duration-150 hover:bg-card"
    >
      {/* 대표 썸네일(#landing-v2b) — 이름만으로는 구별이 어려워 프로젝트의 첫 그림을 얹는다.
          아직 그림이 없는 프로젝트는 제목 이니셜 워터마크가 구별을 돕는다 — 바탕은 v3 그림 자리(Content/Art Placeholder).
          [container-type:size] 는 #thumb-fit 의 100cqh(박스 높이 기준 팬 종점) 용. */}
      <div className="relative aspect-video overflow-hidden bg-art-placeholder [container-type:size]">
        {project.thumbnail_url ? (
          <ProjectThumb url={project.thumbnail_url} />
        ) : (
          <div className="flex size-full items-center justify-center">
            <span className="select-none text-5xl font-bold text-foreground/15">
              {(project.title || 'U').charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col px-5 pb-5 pt-4">
      <div className="flex items-center justify-between gap-2">
        {editing ? (
          <Input
            ref={inputRef}
            className="h-9 text-body font-semibold"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') {
                setTitle(project.title || 'Untitled')
                setEditing(false)
              }
            }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <h3 className="min-w-0 truncate text-body font-semibold text-foreground">
              {title}
            </h3>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing(true)
                }}
                title={t('Rename')}
                aria-label={t('Rename project')}
                className="rounded-md p-1 text-subtle-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteRequest(project)
                }}
                title={t('Delete project')}
                aria-label={t('Delete project')}
                className="rounded-md p-1 text-subtle-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </>
        )}
      </div>
      {/* 시리즈(2026-10-26, 프로토타입 L1): 다음 화 카드에는 "← 앞 화 제목". 앞 화를 지우면 연결만 끊기고 제목은 남는다. */}
      {link ? (
        <div
          className={`mt-1.5 truncate text-caption ${link.deleted ? 'text-subtle-foreground' : 'text-muted-foreground'}`}
          data-testid="project-prev-episode"
        >
          {'← '}
          {link.title}
          {link.deleted ? ` · ${t('The previous episode was deleted')}` : ''}
        </div>
      ) : null}
      {/* 단계 · 며칠 전(11/5 시안 R2: 사이 8, 시계 아이콘 없음) */}
      <div className="mt-3 flex items-center gap-2">
        <Badge variant="tag">{projectStageLabel(project.current_stage)}</Badge>
        {project.updated_at && (
          <span className="font-num text-meta font-medium text-subtle-foreground">{relativeTime(project.updated_at, t)}</span>
        )}
      </div>
      </div>
    </div>
  )
}

export default function ProjectsPage() {
  const router = useRouter()
  const t = useT()
  const locale = useLocale()
  const switchProject = useProjectStore((s) => s.switchProject)
  // 이름으로 찾기 · 정렬(11/5 시안 R2) — 화면 안에서만 거르고, 정렬은 기억하지 않아 들어올 때마다 최신순이다.
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ProjectSort>(DEFAULT_PROJECT_SORT)

  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<ProjectItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // 시리즈(2026-10-26): 요금제 · 칸은 목록 응답이 주는 것을 그대로 쓴다(칸 수 계산은 서버가 소유).
  const [canUseReference, setCanUseReference] = useState(false)
  const [slotLimit, setSlotLimit] = useState<number | null>(null)
  const [chooserOpen, setChooserOpen] = useState(false)

  useEffect(() => {
    // middleware 가 비로그인은 이미 /login 으로 보냈다 — 여기서는 목록만(유저 메뉴는 헤더 담당).
    fetch('/api/project/list')
      .then((r) => r.json())
      .then((data) => {
        setProjects(Array.isArray(data?.projects) ? data.projects : [])
        setCanUseReference(data?.canUseReference === true)
        setSlotLimit(typeof data?.slotLimit === 'number' ? data.slotLimit : null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const plan: SeriesPlanState = { canUseReference, slotLimit, used: projects.length }
  const shown = visibleProjects(projects, { query, sort, locale })
  // 이 화를 이어받은 다음 화가 있으면 지우기 전에 먼저 경고한다(프로토타입 LDq · LD).
  const deleteNextEpisodes = deleteTarget ? continuingEpisodes(projects, deleteTarget.id) : []

  const handleOpen = (project: ProjectItem) => {
    const stage = project.current_stage ?? 'producer'
    switchProject(project.id, project.title, stage as StageId)
    // 단계 값과 화면 주소가 다르다(entry = /studio/start) — 주소는 단계 표에서 찾는다(홈 목록과 같은 규칙).
    router.push(projectOpenPath(project.current_stage, project.id))
  }

  // 새 프로젝트(2026-10-26 오너): 이어 만들 수 있는 화가 있으면 "처음부터 / 앞 화에서 이어" 고르는 창,
  //   없으면 바로 빈 프로젝트를 만드는 화면으로 간다.
  const handleNew = () => {
    if (newProjectEntry(projects) === 'choose') {
      setChooserOpen(true)
      return
    }
    router.push('/projects/new')
  }

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/project/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? res.statusText)
      }
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id))
      if (readLastProjectId() === deleteTarget.id) clearLastProjectId()
      setDeleteTarget(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('Failed to delete'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-lobby text-foreground">
      {/* 공용 대시보드 헤더(#landing-v2b) — 탭·유저 메뉴는 헤더가, 새 프로젝트 버튼만 이 페이지 전용(화면의 크림 단추 하나).
          11/5 시안 R2: 높이 34 · 양옆 16 · 13px 600 알약, "+" 는 글자와 같은 굵기의 글자 기호. */}
      <DashboardHeader active="projects">
        <Button onClick={handleNew} className="h-[34px] gap-1 rounded-full px-4 text-[13px]" data-testid="projects-new">
          <span aria-hidden>+</span>
          {t('New project')}
        </Button>
      </DashboardHeader>

      {/* ── 프로젝트 그리드 ── */}
      <main className={`${DASHBOARD_CONTAINER} pb-16 pt-6`}>
        {loading ? (
          <div className="flex items-center justify-center py-24" role="status" aria-label={t('Loading…')}>
            <Loader2 className="size-6 animate-spin text-subtle-foreground motion-reduce:animate-none" aria-hidden />
          </div>
        ) : projects.length === 0 ? (
          // 빈 목록 — 큰 Lumi 가 빈 안내 자리에 선다(한 화면에 큰 Lumi 하나). 크림 단추는 위 막대의 [새 프로젝트] 하나라 여기는 보조.
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Lumi persona="pearl" state="idle" size={320} />
            <p className="mt-2 text-body text-muted-foreground">{t('No projects yet')}</p>
            <Button variant="secondary" onClick={handleNew} className="mt-6 rounded-full px-5">
              <Plus aria-hidden />
              {t('Create your first project')}
            </Button>
          </div>
        ) : (
          <>
          {/* 첫 화면 머리 — 큰 Lumi(화이트 펄)가 목록 쪽을 바라본다(꼬리는 왼쪽, 얼굴은 오른쪽). */}
          {/* 11/5 시안 R2 머리 — 제목 30 · 다음 줄 메타(stacked), 찾기 · 정렬은 머리 오른쪽(List Tools). */}
          <section className="mb-6 flex items-center gap-2">
            <Lumi persona="pearl" state="idle" size={320} className="-ml-12 shrink-0" />
            <PageHeader
              variant="stacked"
              className="min-w-0 flex-1"
              title={t('Projects')}
              meta={t('Total {n}', { n: projects.length })}
              actions={<ProjectListTools query={query} onQueryChange={setQuery} sort={sort} onSortChange={setSort} />}
            />
          </section>
          {shown.length === 0 ? (
            <p className="py-16 text-center text-label text-muted-foreground" role="status">
              {t('No project matches that name.')}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={handleOpen}
                onRenamed={(id, title) =>
                  setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, title } : p)))
                }
                onDeleteRequest={(p) => {
                  setDeleteError(null)
                  setDeleteTarget(p)
                }}
              />
            ))}
          </div>
          </>
        )}
      </main>

      {/* ── 프로젝트 삭제 확인 팝업 ── 다음 화가 없는 화는 지금과 같다(프로토타입 LD0) */}
      <Dialog open={!!deleteTarget && deleteNextEpisodes.length === 0} onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Delete project')}</DialogTitle>
            <DialogDescription>
              {t('This deletes "{title}" and everything in it: story, characters, scenes, shots, videos. This cannot be undone.', { title: deleteTarget?.title || 'Untitled' })}
            </DialogDescription>
          </DialogHeader>
          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          <DialogFooter>
            <Button variant="secondary" disabled={deleting} onClick={() => setDeleteTarget(null)}>
              {t('Cancel')}
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void handleDelete()}>
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {t('Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 시리즈 창들(2026-10-26) ── 다음 화가 있는 화의 지우기 경고(LD) · 새 프로젝트 고르기(만들기 N2 · 요금제 LU · 칸 LS 포함) */}
      <SeriesDeleteWarningDialog
        open={!!deleteTarget && deleteNextEpisodes.length > 0}
        project={deleteTarget}
        nextEpisodes={deleteNextEpisodes}
        deleting={deleting}
        error={deleteError}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
      />
      <NewProjectDialog open={chooserOpen} projects={projects} plan={plan} onClose={() => setChooserOpen(false)} />
    </div>
  )
}
