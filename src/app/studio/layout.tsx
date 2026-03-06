'use client'

import { useEffect } from 'react'
import { useProjectStore } from '@/stores/project-store'

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const initProject = useProjectStore((s) => s.initProject)

  useEffect(() => {
    initProject()
  }, [initProject])

  return <div className="flex h-screen flex-col">{children}</div>
}
