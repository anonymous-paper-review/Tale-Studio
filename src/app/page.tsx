'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, Film, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/project-store'
import type { StageId } from '@/types'

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

export default function HomePage() {
  const router = useRouter()
  const switchProject = useProjectStore((s) => s.switchProject)
  const createNewProject = useProjectStore((s) => s.createNewProject)

  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/project/list')
      .then((r) => r.json())
      .then((data) => setProjects(data.projects ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleOpen = (project: ProjectItem) => {
    const stage = project.current_stage ?? 'producer'
    switchProject(project.id, project.title, stage as StageId)
    router.push(`/studio/${stage}`)
  }

  const handleNew = async () => {
    setCreating(true)
    await createNewProject()
    router.push('/studio/producer')
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border px-8 py-6">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-2xl font-bold tracking-tight">Tale Studio</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI Video Generation Pipeline
          </p>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto w-full max-w-5xl flex-1 px-8 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Projects</h2>
          <Button onClick={handleNew} disabled={creating} className="gap-2">
            {creating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            New Project
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/30 py-20">
            <Film className="size-10 text-muted-foreground/40" />
            <p className="mt-4 text-sm text-muted-foreground">
              No projects yet
            </p>
            <Button
              variant="outline"
              className="mt-4 gap-2"
              onClick={handleNew}
              disabled={creating}
            >
              <Plus className="size-4" />
              Create your first project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => handleOpen(project)}
                className="group flex flex-col rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/50 hover:bg-accent/50"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  {project.title || 'Untitled'}
                </h3>
                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="rounded-md bg-muted px-2 py-0.5">
                    {STAGE_LABELS[project.current_stage ?? 'producer'] ?? 'Producer'}
                  </span>
                  {project.updated_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {formatDate(project.updated_at)}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
