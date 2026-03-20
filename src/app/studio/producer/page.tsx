'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MeetingChat } from '@/features/producer/meeting-chat'
import { ProjectDashboard } from '@/features/producer/project-dashboard'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

export default function MeetingPage() {
  const router = useRouter()
  const projectId = useProjectStore((s) => s.projectId)
  const loadProject = useProducerStore((s) => s.loadProject)
  const { saveAndHandoff, syncing, projectSettings, storyText, error, clearError } =
    useProducerStore()

  useEffect(() => {
    if (projectId) loadProject()
  }, [projectId, loadProject])

  const hasMinSettings =
    projectSettings.genre || projectSettings.toneStyle || storyText.length > 0

  const handleHandoff = async () => {
    const ok = await saveAndHandoff()
    if (ok) router.push('/studio/writer')
  }

  return (
    <>
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Left: Meeting Chat */}
        <div className="flex flex-1 flex-col border-b border-border lg:border-b-0 lg:border-r">
          <MeetingChat />
        </div>

        {/* Right: Project Dashboard */}
        <ProjectDashboard />
      </div>

      {/* Error bar */}
      {error && (
        <button
          type="button"
          className="w-full border-t border-destructive/30 bg-destructive/10 px-6 py-2 text-left text-sm text-destructive"
          onClick={clearError}
        >
          {error}
        </button>
      )}

      {/* Handoff */}
      <div className="border-t border-border p-4">
        <Button
          onClick={handleHandoff}
          disabled={!hasMinSettings || syncing}
          className="w-full"
          size="lg"
        >
          {syncing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              Hand over to Writer
              <ArrowRight className="ml-2 size-4" />
            </>
          )}
        </Button>
      </div>
    </>
  )
}
