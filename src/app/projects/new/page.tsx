'use client'

// 새 프로젝트(리뉴얼 1차 2026-10-19, 프로토타입 20261013). 빈 프로젝트를 만들고 Producer 시작 화면
//   (/studio/start: 이야기 재료 → 설정)으로 보낸다. 예전 "무엇을 만들까요 · 자료 · 길이" 화면(new-project-flow)은 쓰지 않는다.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { DashboardHeader } from '@/components/dashboard/dashboard-header'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/project-store'
import { useT } from '@/lib/i18n'

export default function NewProjectPage() {
  const router = useRouter()
  const t = useT()
  const createNewProject = useProjectStore((s) => s.createNewProject)
  const [error, setError] = useState<string | null>(null)
  // 개발 모드의 effect 두 번 실행에도 프로젝트를 한 번만 만든다.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      const result = await createNewProject(undefined, { entry: true })
      if (!result.ok || !result.projectId) {
        setError(result.error ?? t('Failed to create project'))
        return
      }
      router.replace(`/studio/start?projectId=${result.projectId}`)
    })()
  }, [createNewProject, router, t])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader active="projects" />
      <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
        {error ? (
          <>
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
            <Button variant="outline" onClick={() => router.push('/projects')}>
              {t('Back to Projects')}
            </Button>
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" />
            {t('Creating a new project…')}
          </p>
        )}
      </main>
    </div>
  )
}
