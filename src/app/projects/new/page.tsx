'use client'

// 새 프로젝트(리뉴얼 1차 2026-10-19, 프로토타입 20261013). 빈 프로젝트를 만들고 Producer 시작 화면
//   (/studio/start: 이야기 재료 → 설정)으로 보낸다. 앞 화에 이어지는 프로젝트는 [새 프로젝트] → "앞 화에서 이어 만들기"가 만든다.
//   v3(2026-11-03): 만드는 동안은 Producer 로 넘어가며 기다리는 화면 — 큰 Lumi 가 Producer 옷으로 로딩 연기를 한다
//   (오너 11/3 결정 8 · Lumi 가이드 "화이트 펄 → Producer(제작 시작)"). 만들지 못하면 Lumi 는 오류 모습.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/dashboard-header'
import { Lumi } from '@/components/lumi/lumi'
import { Button } from '@/components/ui/button'
import { STAGE_PERSONA } from '@/lib/lumi'
import { useProjectStore } from '@/stores/project-store'
import { useT } from '@/lib/i18n'
import { newProjectError } from '@/lib/project/new-project-error'

export default function NewProjectPage() {
  const router = useRouter()
  const t = useT()
  const createNewProject = useProjectStore((s) => s.createNewProject)
  const [error, setError] = useState<{ message: string; showPricing: boolean } | null>(null)
  // 개발 모드의 effect 두 번 실행에도 프로젝트를 한 번만 만든다.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      const result = await createNewProject(undefined, { entry: true })
      if (!result.ok || !result.projectId) {
        setError(newProjectError(result.error))
        return
      }
      router.replace(`/studio/start?projectId=${result.projectId}`)
    })()
  }, [createNewProject, router])

  return (
    <div className="min-h-screen bg-lobby text-foreground">
      <DashboardHeader active="projects" />
      <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-20 text-center">
        <Lumi persona={STAGE_PERSONA.entry} state={error ? 'error' : 'loading'} size={300} />
        {error ? (
          <>
            <p className="text-label text-destructive" role="alert">
              {t(error.message)}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" onClick={() => router.push('/projects')}>
                {t('Back to Projects')}
              </Button>
              {error.showPricing ? (
                <Button onClick={() => router.push('/pricing')}>{t('See plans')}</Button>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-body text-muted-foreground" role="status">
            {t('Creating a new project…')}
          </p>
        )}
      </main>
    </div>
  )
}
