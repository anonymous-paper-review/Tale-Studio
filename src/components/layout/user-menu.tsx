'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CreditCard, LogOut, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { clearLastProjectId } from '@/lib/session-restore'
import { useProjectStore } from '@/stores/project-store'
import { STAGES } from '@/lib/constants'
import { useT } from '@/lib/i18n'
import { relativeTime } from '@/lib/i18n/relative-time'
import { newProjectEntry, type SeriesPlanState } from '@/features/projects/series-list'
import { NewProjectDialog, type NewProjectChoice } from '@/features/projects/new-project-dialog'
import { toast } from 'sonner'

interface ProjectItem extends NewProjectChoice {
  title: string
  updated_at: string
}

export function UserMenu() {
  const router = useRouter()
  const supabase = createClient()
  const { projectId, createNewProject, switchProject } = useProjectStore()
  const t = useT()

  const [open, setOpen] = useState(false)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [initials, setInitials] = useState('U')
  const [projects, setProjects] = useState<ProjectItem[]>([])
  // 새 프로젝트 고르기 창(2026-10-26) — 프로젝트 목록 화면과 같은 창. 요금제 · 칸은 목록 응답을 그대로 쓴다.
  const [chooserOpen, setChooserOpen] = useState(false)
  const [canUseReference, setCanUseReference] = useState(false)
  const [slotLimit, setSlotLimit] = useState<number | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setAvatar(user.user_metadata?.avatar_url ?? null)
      const name = user.user_metadata?.full_name ?? user.email ?? ''
      setInitials(
        name
          .split(' ')
          .map((w: string) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase() || 'U',
      )
    })
  }, [supabase])

  const fetchProjects = useCallback(async () => {
    const res = await fetch('/api/project/list')
    if (res.ok) {
      const data = await res.json()
      setProjects(Array.isArray(data?.projects) ? data.projects : [])
      setCanUseReference(data?.canUseReference === true)
      setSlotLimit(typeof data?.slotLimit === 'number' ? data.slotLimit : null)
    }
  }, [])

  const plan: SeriesPlanState = { canUseReference, slotLimit, used: projects.length }

  const handleLogout = async () => {
    // 공용 브라우저에서 다음 계정에게 마지막 프로젝트 힌트가 안 새도록 제거.
    // (서버가 워크스페이스 범위로 거르긴 하지만 명시적 의도 표시로 클라에서도 정리)
    clearLastProjectId()
    await supabase.auth.signOut()
    router.push('/login')
  }

  // 새 프로젝트(2026-10-26 오너): 이어 만들 수 있는 화가 있으면 프로젝트 목록과 같은 고르기 창,
  //   없으면 바로 빈 프로젝트를 만드는 화면으로 간다. 목록은 메뉴를 열 때 받아 둔 것을 쓴다.
  const handleNewProject = () => {
    setOpen(false)
    if (newProjectEntry(projects) === 'choose') {
      setChooserOpen(true)
      return
    }
    router.push('/projects/new')
  }

  const handleSwitch = (p: ProjectItem) => {
    if (p.id === projectId) return
    switchProject(p.id, p.title)
    setOpen(false)
    router.push(`/studio/producer?projectId=${p.id}`)
  }

  const handleRename = async (p: ProjectItem) => {
    const newTitle = window.prompt(t('Project name'), p.title)
    if (!newTitle?.trim() || newTitle === p.title) return
    const res = await fetch(`/api/project/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim() }),
    })
    if (!res.ok) return
    setProjects((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, title: newTitle.trim() } : x)),
    )
    if (p.id === projectId) {
      useProjectStore.setState({ projectTitle: newTitle.trim() })
    }
  }

  const handleDelete = async (p: ProjectItem) => {
    if (!window.confirm(t('Delete project "{title}"?', { title: p.title }))) return
    const res = await fetch(`/api/project/${p.id}`, { method: 'DELETE' })
    if (!res.ok) return
    const remaining = projects.filter((x) => x.id !== p.id)
    setProjects(remaining)
    if (p.id === projectId) {
      setOpen(false)
      if (remaining.length > 0) {
        switchProject(remaining[0].id, remaining[0].title)
      } else {
        const result = await createNewProject(undefined, { entry: true })
        if (!result.ok) {
          toast.error(result.error ?? t('Failed to create project'))
          return
        }
      }
      const nextId = useProjectStore.getState().projectId
      // 남은 프로젝트로 옮기면 그 단계로, 새로 만들었으면 Producer 시작 화면으로(리뉴얼 1차).
      const nextStage = useProjectStore.getState().currentStage
      const nextPath = STAGES.find((s) => s.id === nextStage)?.path ?? '/studio/start'
      router.push(nextId ? `${nextPath}?projectId=${nextId}` : nextPath)
    }
  }

  return (
    <>
    <DropdownMenu
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (v) fetchProjects()
      }}
    >
      <DropdownMenuTrigger asChild>
        <button className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none">
          {avatar ? (
            <img
              src={avatar}
              alt="User"
              className="h-10 w-10 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            initials
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-60">
        {/* Project list */}
        <div className="max-h-52 overflow-y-auto py-1">
          {projects.map((p) => {
            const isCurrent = p.id === projectId
            return (
              <div
                key={p.id}
                onClick={() => handleSwitch(p)}
                className={cn(
                  'group flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent',
                  isCurrent && 'bg-accent/50',
                )}
              >
                <Check
                  className={cn(
                    'h-3 w-3 shrink-0',
                    !isCurrent && 'invisible',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{p.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {relativeTime(p.updated_at, t)}
                  </div>
                </div>
                <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRename(p)
                    }}
                    className="rounded p-0.5 hover:bg-muted-foreground/20"
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(p)
                    }}
                    className="rounded p-0.5 hover:bg-destructive/20"
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleNewProject}>
          <Plus className="mr-2 h-4 w-4" />
          {t('New project')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* #payments-phase-3 P9a: 계정·결제 페이지 */}
        <DropdownMenuItem onClick={() => router.push('/account')}>
          <CreditCard className="mr-2 h-4 w-4" />
          {t('Account & billing')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <NewProjectDialog open={chooserOpen} projects={projects} plan={plan} onClose={() => setChooserOpen(false)} />
    </>
  )
}
