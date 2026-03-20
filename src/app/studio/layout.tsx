'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useProjectStore } from '@/stores/project-store'
import { Sidebar } from '@/components/layout/sidebar'
import { Samantha } from '@/components/layout/samantha'
import { useIdleTimeout } from '@/hooks/use-idle-timeout'
import { STAGES } from '@/lib/constants'
import type { StageId } from '@/types'

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const initProject = useProjectStore((s) => s.initProject)
  const canNavigateTo = useProjectStore((s) => s.canNavigateTo)
  const initLoading = useProjectStore((s) => s.initLoading)
  const pathname = usePathname()
  const router = useRouter()
  useIdleTimeout()

  useEffect(() => {
    initProject()
  }, [initProject])

  // Redirect to producer if user navigates to a locked stage (URL direct / back button)
  useEffect(() => {
    if (initLoading) return
    const stage = STAGES.find((s) => pathname.startsWith(s.path))
    if (stage && !canNavigateTo(stage.id as StageId)) {
      router.replace('/studio/producer')
    }
  }, [pathname, canNavigateTo, initLoading, router])

  return (
    <>
      <Sidebar />
      <main className="ml-16 min-h-screen">
        <div className="flex h-screen flex-col">{children}</div>
      </main>
      <Samantha />
    </>
  )
}
