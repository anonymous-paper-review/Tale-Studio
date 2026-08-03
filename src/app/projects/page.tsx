'use client'

// 프로젝트 대시보드 (#landing-v2 2026-08-03) — 옛 홈(/)의 #projects 섹션을 독립 페이지로.
//   로그인 전용(middleware 가 /login 으로 보냄). 랜딩(/)은 순수 마케팅 페이지가 됐고,
//   로그인 상태로 / 진입 시 middleware 가 여기로 돌린다.
//   상단 탭: 프로젝트(여기) | Playground(공개 갤러리, /playground).

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronDown,
  Clock,
  Film,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { clearLastProjectId, readLastProjectId } from '@/lib/session-restore'

interface ProjectItem {
  id: string
  title: string
  current_stage: string | null
  updated_at: string | null
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
      className="group flex cursor-pointer flex-col rounded-2xl border border-white/10 bg-white/5 p-6 text-left backdrop-blur-sm transition-all duration-300 hover:border-primary/50 hover:bg-white/10 hover:shadow-[0_10px_30px_rgba(229,9,20,0.1)]"
    >
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
                title="이름 변경"
                aria-label="프로젝트 이름 변경"
                className="rounded p-1 text-gray-500 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteRequest(project)
                }}
                title="프로젝트 삭제"
                aria-label="프로젝트 삭제"
                className="rounded p-1 text-gray-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </>
        )}
      </div>
      <div className="mt-4 flex items-center gap-3 text-xs text-gray-400">
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
  )
}

export default function ProjectsPage() {
  const router = useRouter()
  const switchProject = useProjectStore((s) => s.switchProject)
  const createNewProject = useProjectStore((s) => s.createNewProject)

  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [userInfo, setUserInfo] = useState<{ name: string; avatar: string | null } | null>(null)
  const [nameOpen, setNameOpen] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ProjectItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    // middleware 가 비로그인은 이미 /login 으로 보냈다 — 여기서는 사용자 정보·목록만.
    const supabase = createClient()
    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (!user) {
          setLoading(false)
          return
        }
        setUserInfo({
          name: user.user_metadata?.full_name ?? user.email ?? '',
          avatar: user.user_metadata?.avatar_url ?? null,
        })
        fetch('/api/project/list')
          .then((r) => r.json())
          .then((data) => setProjects(data.projects ?? []))
          .catch(() => {})
          .finally(() => setLoading(false))
      })
      .catch(() => setLoading(false))
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
      setDeleteError(err instanceof Error ? err.message : '삭제에 실패했어요')
    } finally {
      setDeleting(false)
    }
  }

  const handleLogout = async () => {
    clearLastProjectId()
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ── 헤더: 로고 + 탭(프로젝트|Playground) + 새 프로젝트 + 유저 메뉴 ── */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <Film className="size-6 text-primary" />
              <span className="text-lg font-bold tracking-tight">Tale Studio</span>
            </div>
            <nav className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-sm font-medium">
              <span className="rounded-full bg-white px-4 py-1.5 text-black">프로젝트</span>
              <Link
                href="/playground"
                className="rounded-full px-4 py-1.5 text-gray-300 transition-colors hover:text-white"
              >
                Playground
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleNew}
              disabled={creating}
              className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90"
            >
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              새 프로젝트
            </button>
            {userInfo && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-full focus:outline-none">
                    {userInfo.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={userInfo.avatar}
                        alt={userInfo.name}
                        className="size-8 rounded-full border border-white/20 object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex size-8 items-center justify-center rounded-full bg-white/10 text-xs font-medium">
                        {userInfo.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <ChevronDown className="size-4 text-gray-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 size-4" />
                    로그아웃
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      {/* ── 프로젝트 그리드 ── */}
      <main className="mx-auto max-w-7xl px-6 py-10">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="size-6 animate-spin text-gray-500" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/10 py-24">
            <Film className="size-10 text-gray-600" />
            <p className="mt-4 text-sm text-gray-500">아직 프로젝트가 없어요</p>
            <button
              onClick={handleNew}
              disabled={creating}
              className="mt-6 flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-medium transition-all hover:border-primary hover:text-primary"
            >
              <Plus className="size-4" />
              첫 프로젝트 만들기
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
            <DialogTitle>새 프로젝트</DialogTitle>
            <DialogDescription>
              프로젝트 이름을 지어 주세요. 나중에 언제든 바꿀 수 있어요.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            placeholder="예: 비 오는 도시의 하룻밤"
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
              취소
            </Button>
            <Button disabled={creating || !nameValue.trim()} onClick={() => void handleCreate()}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              만들기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 프로젝트 삭제 확인 팝업 ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>프로젝트 삭제</DialogTitle>
            <DialogDescription>
              {`"${deleteTarget?.title || 'Untitled'}" 프로젝트와 모든 산출물(스토리·캐릭터·씬·샷·영상)이 삭제됩니다. 되돌릴 수 없어요.`}
            </DialogDescription>
          </DialogHeader>
          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>
              취소
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void handleDelete()}>
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
