'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { STAGES } from '@/lib/constants'
import { useProjectStore } from '@/stores/project-store'
import { createClient } from '@/lib/supabase/client'
import type { StageId } from '@/types'

interface HandoffButtonProps {
  label: string
  targetStage: StageId
  disabled?: boolean
}

export function HandoffButton({ label, targetStage, disabled }: HandoffButtonProps) {
  const router = useRouter()
  const target = STAGES.find((s) => s.id === targetStage)
  const { projectId, setStage, canNavigateTo } = useProjectStore()

  if (!target) return null

  const handleClick = async () => {
    // Update current_stage in DB so navigation guard unlocks the target
    if (projectId && !canNavigateTo(targetStage)) {
      try {
        const supabase = createClient()
        await supabase
          .from('projects')
          .update({ current_stage: targetStage })
          .eq('id', projectId)
      } catch {
        // non-blocking — worst case sidebar stays locked until reload
      }
    }
    setStage(targetStage)
    router.push(target.path)
  }

  return (
    <div className="border-t border-border p-4">
      <Button
        onClick={handleClick}
        disabled={disabled}
        className="w-full"
        size="lg"
      >
        {label}
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  )
}
