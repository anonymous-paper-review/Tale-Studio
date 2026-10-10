'use client'

// 새 프로젝트(2026-10-02 오너 — tale-proto-v04 0.1). 무엇을 만들지와 자료 · 아이디어를 묻고 Producer 로 시작한다.
import { DashboardHeader } from '@/components/dashboard/dashboard-header'
import { NewProjectFlow } from '@/features/project-new/new-project-flow'

export default function NewProjectPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader active="projects" />
      <NewProjectFlow />
    </div>
  )
}
