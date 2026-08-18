'use client'

// 프로젝트 대시보드 (#landing-v2 2026-08-03) — 옛 홈(/)의 #projects 섹션을 독립 페이지로.
//   로그인 전용(middleware 가 /login 으로 보냄). 랜딩(/)은 순수 마케팅 페이지가 됐고,
//   로그인 상태로 / 진입 시 middleware 가 여기로 돌린다.
//   상단 탭: 프로젝트(여기) | Playground(공개 갤러리, /playground).

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Film, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
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
import { DashboardHeader } from '@/components/dashboard/dashboard-header'
import { useT } from '@/lib/i18n'
import { clearLastProjectId, readLastProjectId } from '@/lib/session-restore'

interface ProjectItem {
  id: string
  title: string
  current_stage: string | null
  updated_at: string | null
  /** 대표 이미지(실사 스토리보드 > 러프 > 캐릭터, api/project/list) — 없으면 그라디언트 폴백 */
  thumbnail_url: string | null
}

const STAGE_LABELS: Record<string, string> = {
  producer: 'Producer',
  writer: 'Writer',
  artist: 'Concept Artist',
  director: 'Director',
  editor: 'Editor',
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return d.toLocaleDateString()
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
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-left backdrop-blur-sm transition-all duration-300 hover:border-primary/50 hover:bg-white/10 hover:shadow-[0_10px_30px_rgba(229,9,20,0.1)]"
    >
      {/* 대표 썸네일(#landing-v2b) — 이름만으로는 구별이 어려워 프로젝트의 첫 그림을 얹는다.
          아직 그림이 없는 프로젝트는 제목 이니셜 워터마크가 구별을 돕는다. */}
      <div className="relative aspect-video overflow-hidden bg-black/60">
        {project.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.thumbnail_url}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-[radial-gradient(ellipse_at_top_left,rgba(229,9,20,0.18),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(70,130,180,0.12),transparent_60%)]">
            <span className="select-none text-5xl font-bold text-white/15">
              {(project.title || 'U').charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col p-5">
      <div className="flex items-center justify-between">
        {editing ? (
          <Input
            ref={inputRef}
            className="h-9 text-lg font-semibold text-white caret-white placeholder:text-gray-500"
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
            <h3 className="text-lg font-semibold text-white transition-colors group-hover:text-primary">
              {title}
            </h3>
            <div className="flex items-center gap-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing(true)
                }}
                title={t('Rename')}
                aria-label={t('Rename project')}
                className="rounded p-1 text-gray-500 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
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
                className="rounded p-1 text-gray-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
        <span className="rounded-md bg-white/10 px-2.5 py-1 font-medium">
          {STAGE_LABELS[project.current_stage ?? 'producer'] ?? 'Producer'}
        </span>
        {project.updated_at && (
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {formatDate(project.updated_at)}
          </span>
        )}
      </div>
      </div>
    </div>
  )
}

export default function ProjectsPage() {
  const router = useRouter()
  const t = useT()
  const switchProject = useProjectStore((s) => s.switchProject)
  const createNewProject = useProjectStore((s) => s.createNewProject)

  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [nameOpen, setNameOpen] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ProjectItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    // middleware 가 비로그인은 이미 /login 으로 보냈다 — 여기서는 목록만(유저 메뉴는 헤더 담당).
    fetch('/api/project/list')
      .then((r) => r.json())
      .then((data) => setProjects(data.projects ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleOpen = (project: ProjectItem) => {
    const stage = project.current_stage ?? 'producer'
    switchProject(project.id, project.title, stage as StageId)
    router.push(`/studio/${stage}?projectId=${project.id}`)
  }

  const handleNew = () => {
    setNameValue('')
    setNameOpen(true)
  }

  const handleCreate = async () => {
    const name = nameValue.trim()
    if (!name || creating) return
    setCreating(true)
    await createNewProject(name)
    const newId = useProjectStore.getState().projectId
    router.push(newId ? `/studio/producer?projectId=${newId}` : '/studio/producer')
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
    <div className="min-h-screen bg-black text-white">
      {/* 공용 대시보드 헤더(#landing-v2b) — 탭·유저 메뉴는 헤더가, 새 프로젝트 버튼만 이 페이지 전용 */}
      <DashboardHeader active="projects">
        <button
          onClick={handleNew}
          disabled={creating}
          className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90"
        >
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {t('New project')}
        </button>
      </DashboardHeader>

      {/* ── 프로젝트 그리드 ── */}
      <main className="mx-auto max-w-7xl px-6 py-10">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="size-6 animate-spin text-gray-500" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/10 py-24">
            <Film className="size-10 text-gray-600" />
            <p className="mt-4 text-sm text-gray-500">{t('No projects yet')}</p>
            <button
              onClick={handleNew}
              disabled={creating}
              className="mt-6 flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-medium transition-all hover:border-primary hover:text-primary"
            >
              <Plus className="size-4" />
              {t('Create your first project')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
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
        )}
      </main>

      {/* ── 새 프로젝트 이름 지정 팝업 ── */}
      <Dialog open={nameOpen} onOpenChange={(o) => !creating && setNameOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('New project')}</DialogTitle>
            <DialogDescription>
              {t('Name your project — you can rename it anytime.')}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            placeholder={t('e.g. One rainy night in the city')}
            autoFocus
            maxLength={120}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void handleCreate()
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" disabled={creating} onClick={() => setNameOpen(false)}>
              {t('Cancel')}
            </Button>
            <Button disabled={creating || !nameValue.trim()} onClick={() => void handleCreate()}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {t('Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 프로젝트 삭제 확인 팝업 ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Delete project')}</DialogTitle>
            <DialogDescription>
              {t('This deletes "{title}" and everything in it — story, characters, scenes, shots, videos. This cannot be undone.', { title: deleteTarget?.title || 'Untitled' })}
            </DialogDescription>
          </DialogHeader>
          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>
              {t('Cancel')}
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void handleDelete()}>
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {t('Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
