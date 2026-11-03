'use client'

// 랜딩(로그인 전 첫 화면). v3(2026-11-03): 첫 화면(히어로)은 시안 144-668 "v3 · Home 예시" — 극장 같은 바탕에 단계 색 흐린 빛,
//   Tale 로고 묶음, 크림 알약 단추. 구조 · 글은 그대로 두고(서비스 · 프로젝트 · 꼬리말 섹션도), 색 · 글꼴 · 단추 · 카드만 v3 토큰.
//   밝은 섹션 · 빨간 빛 · 유리(white/5 + 흐림)는 없앴다(design.md 6 hard rules: dark only · no glassmorphism).
//   로그인 전 화면이라 큰 Lumi(움직이는 파일은 로그인 미들웨어를 탄다)는 두지 않는다.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Loader2,
  Film,
  Pencil,
  Trash2,
  Clock,
  ArrowRight,
  Sparkles,
  ChevronDown,
  Video,
  Camera,
  Users,
  ShieldCheck,
  LogOut,
} from 'lucide-react'
import { TaleLockup } from '@/components/tale-lockup'
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
import { ContactPopover } from '@/components/contact-popover'
import { LegalFooter } from '@/components/legal/legal-footer'
import { toast } from 'sonner'
import { projectOpenPath, projectStageLabel } from '@/lib/project/open-path'

interface ProjectItem {
  id: string
  title: string
  current_stage: string | null
  updated_at: string | null
}

const SERVICES = [
  {
    icon: <Users className="size-6" />,
    title: 'AI Production Team',
    desc: 'Collaborate with specialized AI agents — Producer, Writer, Artist, Director, Editor.',
    image:
      'https://images.unsplash.com/photo-1770233621425-5d9ee7a0a700?auto=format&fit=crop&q=80&w=800',
  },
  {
    icon: <Camera className="size-6" />,
    title: 'AI Cinematography',
    desc: 'Real-time AI adjustments for 6-axis camera angles and cinematic lighting.',
    image:
      'https://images.unsplash.com/photo-1642286941365-89da3e29c0a2?auto=format&fit=crop&q=80&w=800',
  },
  {
    icon: <Video className="size-6" />,
    title: 'T2V & I2V Generation',
    desc: 'Text-to-Video and Image-to-Video powered by Kling, Hunyuan, and self-hosted models.',
    image:
      'https://images.unsplash.com/photo-1612180768015-56180b567352?auto=format&fit=crop&q=80&w=800',
  },
  {
    icon: <ShieldCheck className="size-6" />,
    title: 'Security Vault',
    desc: 'Isolated environment. Your creativity and IP are never used for external AI training.',
    image:
      'https://images.unsplash.com/photo-1687715997916-4030568eda97?auto=format&fit=crop&q=80&w=800',
  },
]

// 시안 Home(144-668)의 흐린 빛 다섯 — 히어로 가운데 기준 자리(px) · 크기 · 단계 색과 진하기. 흐림은 Figma 160 ≈ CSS 80.
const HERO_GLOWS = [
  { className: 'bg-stage-writer/32', w: 420, h: 360, x: -130, y: 60 },
  { className: 'bg-stage-storyboard/32', w: 440, h: 380, x: 140, y: 20 },
  { className: 'bg-stage-director/26', w: 380, h: 320, x: 330, y: 70 },
  { className: 'bg-stage-producer/18', w: 360, h: 260, x: 20, y: 150 },
  { className: 'bg-stage-editor/16', w: 320, h: 240, x: 240, y: 170 },
]

function formatDate(dateStr: string | null) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
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
      // v3: 큰 내용 판 하나(판 아래 그림자 하나만) — 올리면 한 단 밝아진다. 빨간 빛 · 유리는 없앴다.
      className="group flex cursor-pointer flex-col rounded-xl bg-panel p-6 text-left shadow-panel transition-colors duration-150 hover:bg-card"
    >
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
              if (e.key === 'Escape') { setTitle(project.title || 'Untitled'); setEditing(false) }
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
                title="Rename"
                aria-label="Rename project"
                className="rounded-md p-1 text-subtle-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteRequest(project)
                }}
                title="Delete project"
                aria-label="Delete project"
                className="rounded-md p-1 text-subtle-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </>
        )}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className="rounded-[6px] bg-card px-[7px] py-0.5 text-micro font-semibold text-muted-foreground">
          {projectStageLabel(project.current_stage)}
        </span>
        {project.updated_at && (
          <span className="flex items-center gap-1 font-num text-meta font-medium text-subtle-foreground">
            <Clock className="size-3" aria-hidden />
            {formatDate(project.updated_at)}
          </span>
        )}
      </div>
    </div>
  )
}

export default function HomePage() {
  const router = useRouter()
  const switchProject = useProjectStore((s) => s.switchProject)
  const createNewProject = useProjectStore((s) => s.createNewProject)

  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [userInfo, setUserInfo] = useState<{ name: string; avatar: string | null } | null>(null)
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null)
  // 새 프로젝트 이름 지정 팝업(#a1) — 모든 생성 진입점(Get Started/New Project)이 이 팝업을 거친다.
  const [nameOpen, setNameOpen] = useState(false)
  const [nameValue, setNameValue] = useState('')
  // 삭제 확인 팝업(#a2) — 타일 휴지통 클릭 시 대상 지정.
  const [deleteTarget, setDeleteTarget] = useState<ProjectItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    // 인증 먼저 확인 → 로그인한 경우에만 프로젝트 목록 요청(비로그인 헛요청 방지).
    import('@/lib/supabase/client').then(({ createClient }) => {
      const supabase = createClient()
      supabase.auth
        .getUser()
        .then(({ data: { user } }) => {
          setIsAuthed(!!user)
          if (!user) {
            // 비로그인: 프로젝트가 있을 수 없으므로 목록 요청 생략.
            setLoading(false)
            return
          }
          setUserInfo({
            name: user.user_metadata?.full_name ?? user.email ?? '',
            avatar: user.user_metadata?.avatar_url ?? null,
          })
          fetch('/api/project/list')
            .then((r) => r.json())
            .then((data) => {
              setProjects(Array.isArray(data?.projects) ? data.projects : [])
            })
            .catch(() => {})
            .finally(() => setLoading(false))
        })
        .catch(() => setLoading(false))
    })
  }, [])

  // 로그인 직후(#projects 로 착지) 프로젝트 목록이 렌더된 뒤 그 섹션으로 스크롤.
  // 이메일/OAuth 로그인 모두 next 없으면 '/#projects' 로 보내므로 양쪽을 커버.
  useEffect(() => {
    if (loading) return
    if (window.location.hash !== '#projects') return
    document
      .getElementById('projects')
      ?.scrollIntoView({ behavior: 'smooth' })
  }, [loading])

  const handleOpen = (project: ProjectItem) => {
    const stage = project.current_stage ?? 'producer'
    switchProject(project.id, project.title, stage as StageId)
    // 단계 값과 화면 주소가 다르다(entry = /studio/start) — 주소는 단계 표에서 찾는다(프로젝트 목록과 같은 규칙).
    router.push(projectOpenPath(project.current_stage, project.id))
  }

  const handleNew = () => {
    // 비로그인 → 로그인부터. 로그인 후 홈으로 복귀하면 다시 눌러 생성.
    if (isAuthed === false) {
      router.push('/login')
      return
    }
    setNameValue('')
    setNameOpen(true)
  }

  const handleCreate = async () => {
    const name = nameValue.trim()
    if (!name || creating) return
    setCreating(true)
    const result = await createNewProject(name, { entry: true })
    if (!result.ok) {
      toast.error(result.error ?? 'Failed to create project')
      setCreating(false)
      return
    }
    const newId = result.projectId ?? useProjectStore.getState().projectId
    // 새 프로젝트는 Producer 시작 화면(아이디어 · 조건)에서 시작한다(리뉴얼 1차).
    router.push(newId ? `/studio/start?projectId=${newId}` : '/studio/start')
  }

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/project/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? res.statusText)
      }
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id))
      // 세션 복원 힌트가 방금 지운 프로젝트를 가리키면 제거 (재진입 시 죽은 링크 방지).
      if (readLastProjectId() === deleteTarget.id) clearLastProjectId()
      setDeleteTarget(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete the project')
    } finally {
      setDeleting(false)
    }
  }

  const scrollToProjects = () => {
    document
      .getElementById('projects')
      ?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleLogout = async () => {
    // 공용 브라우저에서 다음 계정에게 마지막 프로젝트 힌트가 안 새도록 제거.
    clearLastProjectId()
    const supabase = createClient()
    await supabase.auth.signOut()
    // 홈에 머무르므로(로그아웃 버튼이 홈에만 있음) 로그인 UI 상태를 즉시 초기화.
    setUserInfo(null)
    setIsAuthed(false)
    setProjects([])
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-landing text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* ── Navbar(시안 Home: 로고 묶음 · 흐린 글자 메뉴 · 크림 알약 Get Started) ── */}
      <nav className="fixed top-0 z-50 w-full bg-gradient-to-b from-landing via-landing/70 to-transparent px-6 py-6">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between">
          <TaleLockup size={36} />
          <a
            href="/pricing"
            className="flex min-h-11 items-center rounded-sm px-2 text-body font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring md:hidden"
          >
            Pricing
          </a>
          <div className="hidden items-center gap-6 text-body font-medium md:flex lg:gap-9">
            <a
              href="#services"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Services
            </a>
            <a
              href="#projects"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Projects
            </a>
            <a
              href="/pricing"
              className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              Pricing
            </a>
            <button
              onClick={handleNew}
              disabled={creating}
              className="rounded-full bg-primary px-[22px] py-[11px] font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Get Started'}
            </button>
            {userInfo && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    {userInfo.avatar ? (
                      <img
                        src={userInfo.avatar}
                        alt={userInfo.name}
                        className="size-8 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex size-8 items-center justify-center rounded-full bg-card text-label font-semibold text-foreground">
                        {userInfo.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="max-w-[120px] truncate text-caption text-muted-foreground">
                      {userInfo.name}
                    </span>
                    <ChevronDown className="size-4 text-subtle-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-landing">
        {/* 단계 색 흐린 빛(시안 Home 의 Ellipse 5개, 흐림 160) — 여섯 단계 색이 한데 비친다. 배경 영상 대신. */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {HERO_GLOWS.map((glow) => (
            <span
              key={glow.className}
              className={`absolute left-1/2 top-1/2 rounded-full blur-[80px] ${glow.className}`}
              style={{ width: glow.w, height: glow.h, transform: `translate(calc(-50% + ${glow.x}px), calc(-50% + ${glow.y}px))` }}
            />
          ))}
        </div>

        <div className="relative z-10 mx-auto max-w-5xl px-6 pt-24 text-center">
          {/* Badge */}
          <div className="mb-2 inline-flex items-center gap-2.5 rounded-full bg-foreground/6 px-[18px] py-[9px] text-body font-medium text-foreground">
            <span className="size-2 rounded-full bg-pearl-vivid" aria-hidden />
            The Future of Filmmaking is Here
          </div>

          {/* Title — 둘째 줄의 Pre-visualization. 은 v3 헤드라인 글자 그라데이션(흰색 → 따뜻한 회색) */}
          <h1 className="mb-6 text-4xl font-extrabold leading-[1.08] tracking-[-0.03em] text-foreground sm:text-6xl lg:text-[76px]">
            Your Tale Deserves a Take <br className="hidden md:block" />
            by{' '}
            <span className="text-gradient">Pre-visualization.</span>
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mb-10 max-w-[674px] text-lg leading-[1.6] text-muted-foreground md:text-[22px]">
            Tale Studio redefines the production pipeline. Experience the
            perfect synergy of cinematic artistry and AI precision.
          </p>

          {/* CTA — 크림 알약(View Projects) · 흐린 알약(Get Started) */}
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              onClick={scrollToProjects}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-[34px] py-[18px] text-[19px] font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
            >
              View Projects
              <ArrowRight className="size-5 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" />
            </button>

            <button
              onClick={handleNew}
              disabled={creating}
              className="inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-foreground/6 px-[34px] py-[18px] text-[19px] font-semibold text-foreground transition-colors duration-150 hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 sm:w-auto"
            >
              <Sparkles className="size-5" aria-hidden />
              {creating ? 'Creating...' : 'Get Started'}
            </button>
          </div>
        </div>

        {/* Scroll indicator */}
        <div
          className="group absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 cursor-pointer flex-col items-center gap-3"
          onClick={scrollToProjects}
        >
          <span className="text-micro font-semibold uppercase tracking-[0.3em] text-subtle-foreground transition-colors duration-150 group-hover:text-muted-foreground">
            Scroll to explore
          </span>
          <div className="rounded-full bg-foreground/6 p-2 transition-colors group-hover:bg-foreground/10">
            <ChevronDown className="size-6 text-muted-foreground" />
          </div>
        </div>
      </section>

      {/* ── Services ── */}
      <section
        id="services"
        className="mx-auto max-w-7xl px-6 pb-32 pt-10 md:px-12"
      >
        <div className="mb-24 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-micro font-semibold uppercase tracking-widest text-muted-foreground">
            <Sparkles className="size-3" />
            Platform Capabilities
          </div>
          <h2 className="mb-8 text-5xl font-extrabold tracking-[-0.03em] text-foreground md:text-6xl">
            Our Services
          </h2>
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
            Tale Studio transforms the traditional filmmaking process into an
            efficient, secure, and limitless AI-powered experience.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-12">
          {SERVICES.map((service) => (
            <div
              key={service.title}
              // v3: 큰 내용 판(판 아래 그림자 하나만) — 빨간 빛 없앴다.
              className="group relative aspect-[4/3] cursor-pointer overflow-hidden rounded-2xl bg-panel shadow-panel"
            >
              <img
                src={service.image}
                alt={service.title}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none"
              />
              {/* 글자가 읽히도록 사진 아래쪽을 랜딩 바탕색으로 덮는다. */}
              <div className="absolute inset-0 bg-gradient-to-t from-landing via-landing/40 to-transparent" />

              {/* AI Active badge */}
              <div className="absolute right-6 top-6 z-20 flex items-center gap-2 rounded-full bg-landing/80 px-3 py-1.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <div className="size-2 rounded-full bg-pearl-vivid" />
                <span className="text-tag font-semibold uppercase tracking-widest text-foreground">
                  AI Active
                </span>
              </div>

              {/* Content */}
              <div className="absolute inset-0 z-20 flex flex-col justify-end p-8 text-foreground md:p-10">
                <div className="mb-4 flex items-center gap-3 text-foreground">
                  <div className="rounded-lg bg-foreground/10 p-2">
                    {service.icon}
                  </div>
                  <span className="text-micro font-semibold uppercase tracking-widest">
                    Tale AI
                  </span>
                </div>
                <h3 className="mb-3 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                  {service.title}
                </h3>
                <p className="line-clamp-2 text-label leading-relaxed text-muted-foreground md:text-body">
                  {service.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Projects ── */}
      <section id="projects" className="bg-landing px-6 py-24 md:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 flex items-center justify-between">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-micro font-semibold uppercase tracking-widest text-muted-foreground">
                <Film className="size-3" />
                Your Workspace
              </div>
              <h2 className="text-4xl font-extrabold tracking-[-0.03em] text-foreground md:text-5xl">
                Projects
              </h2>
            </div>
            <button
              onClick={handleNew}
              disabled={creating}
              className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              New Project
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-subtle-foreground" />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl bg-panel py-20">
              <Film className="size-10 text-subtle-foreground" />
              <p className="mt-4 text-label text-muted-foreground">No projects yet</p>
              <button
                onClick={handleNew}
                disabled={creating}
                className="mt-6 flex items-center gap-2 rounded-full bg-card px-6 py-3 text-label font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
              >
                <Plus className="size-4" />
                Create your first project
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
                    setProjects((prev) =>
                      prev.map((p) => (p.id === id ? { ...p, title } : p)),
                    )
                  }
                  onDeleteRequest={(p) => {
                    setDeleteError(null)
                    setDeleteTarget(p)
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── 새 프로젝트 이름 지정 팝업 (#a1) ── */}
      <Dialog open={nameOpen} onOpenChange={(o) => !creating && setNameOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Give your project a name. You can change it anytime.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            placeholder="E.g. a rainy night in the city"
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
            <Button
              variant="ghost"
              disabled={creating}
              onClick={() => setNameOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={creating || !nameValue.trim()}
              onClick={() => void handleCreate()}
            >
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 프로젝트 삭제 확인 팝업 (#a2) ── */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete project</DialogTitle>
            <DialogDescription>
              {`Deleting "${deleteTarget?.title || 'Untitled'}" will remove all its assets (story, characters, scenes, shots, videos). This can't be undone.`}
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p className="text-sm text-destructive">{deleteError}</p>
          ) : null}
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Footer ── */}
      <footer className="bg-landing px-6 pb-12 pt-24 text-foreground md:px-12">
        <div className="mx-auto mb-20 grid max-w-7xl grid-cols-1 gap-12 md:grid-cols-3 md:gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="mb-6 flex items-center">
              <TaleLockup size={32} />
            </div>
            <p className="max-w-md leading-relaxed text-muted-foreground">
              Pioneering the next era of cinematic storytelling through advanced
              artificial intelligence and human collaboration.
            </p>
          </div>

          <div>
            <h4 className="mb-6 font-semibold text-foreground">Studio</h4>
            <ul className="space-y-4 text-muted-foreground">
              <li>
                <ContactPopover />
              </li>
            </ul>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl flex-col gap-4 border-t border-border-subtle pt-8">
          <p className="text-label text-subtle-foreground">
            &copy; {new Date().getFullYear()} Tale Studio. All rights reserved.
          </p>
          <div className="text-label text-subtle-foreground">
            <LegalFooter />
          </div>
        </div>
      </footer>
    </div>
  )
}
