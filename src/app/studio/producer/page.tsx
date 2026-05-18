'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProjectDashboard } from '@/features/producer/project-dashboard'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

export default function MeetingPage() {
  const router = useRouter()
  const projectId = useProjectStore((s) => s.projectId)
  const loadProject = useProducerStore((s) => s.loadProject)
  const { saveAndHandoff, syncing, projectSettings, error, clearError } =
    useProducerStore()

  useEffect(() => {
    if (projectId) loadProject()
  }, [projectId, loadProject])

  const storyReady = useProducerStore((s) => s.storyReady)
  const hasMinSettings =
    storyReady && (projectSettings.genre || projectSettings.toneStyle)

  // Redirect via useEffect to avoid router.push failing inside async handlers
  const [redirectTo, setRedirectTo] = useState<string | null>(null)
  useEffect(() => {
    if (redirectTo) router.replace(redirectTo)
  }, [redirectTo, router])

  const handleHandoff = async () => {
    const ok = await saveAndHandoff()
    if (ok) setRedirectTo('/studio/writer')
  }

  return (
    <>
      <div className="flex flex-1 overflow-hidden">
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
          className={`w-full ${hasMinSettings && !syncing ? 'animate-pulse bg-green-600 hover:bg-green-700' : ''}`}
          size="lg"
        >
          {syncing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </>
          ) : hasMinSettings ? (
            <>
              Ready! Hand over to Script Room
              <ArrowRight className="ml-2 size-4" />
            </>
          ) : (
            <>
              Complete your story to continue
              <ArrowRight className="ml-2 size-4" />
            </>
          )}
        </Button>
      </div>
    </>
  )
}
