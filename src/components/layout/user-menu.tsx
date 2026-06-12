'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, LogOut, Pencil, Plus, Trash2 } from 'lucide-react'
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

interface ProjectItem {
  id: string
  title: string
  updated_at: string
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}일 전`
  return `${Math.floor(days / 30)}달 전`
}

export function UserMenu() {
  const router = useRouter()
  const supabase = createClient()
  const { projectId, createNewProject, switchProject } = useProjectStore()

  const [open, setOpen] = useState(false)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [initials, setInitials] = useState('U')
  const [projects, setProjects] = useState<ProjectItem[]>([])

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
      setProjects(data.projects)
    }
  }, [])

  const handleLogout = async () => {
    // 공용 브라우저에서 다음 계정에게 마지막 프로젝트 힌트가 안 새도록 제거.
    // (서버가 워크스페이스 범위로 거르긴 하지만 명시적 의도 표시로 클라에서도 정리)
    clearLastProjectId()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleNewProject = async () => {
    await createNewProject()
    setOpen(false)
    // createNewProject가 set한 새 projectId를 URL 쿼리에 직접 실어 push.
    // (쿼리 없이 push하면 layout의 replaceState 보정이 push에 덮여 URL이 안 바뀜)
    const newId = useProjectStore.getState().projectId
    router.push(newId ? `/studio/producer?projectId=${newId}` : '/studio/producer')
  }

  const handleSwitch = (p: ProjectItem) => {
    if (p.id === projectId) return
    switchProject(p.id, p.title)
    setOpen(false)
    router.push(`/studio/producer?projectId=${p.id}`)
  }

  const handleRename = async (p: ProjectItem) => {
    const newTitle = window.prompt('프로젝트 이름', p.title)
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
    if (!window.confirm(`"${p.title}" 프로젝트를 삭제하시겠습니까?`)) return
    const res = await fetch(`/api/project/${p.id}`, { method: 'DELETE' })
    if (!res.ok) return
    const remaining = projects.filter((x) => x.id !== p.id)
    setProjects(remaining)
    if (p.id === projectId) {
      setOpen(false)
      if (remaining.length > 0) {
        switchProject(remaining[0].id, remaining[0].title)
      } else {
        await createNewProject()
      }
      const nextId = useProjectStore.getState().projectId
      router.push(nextId ? `/studio/producer?projectId=${nextId}` : '/studio/producer')
    }
  }

  return (
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
                    {relativeTime(p.updated_at)}
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
          New Project
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
