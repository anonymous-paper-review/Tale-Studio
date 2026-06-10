'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { STAGES } from '@/lib/constants'
import { handoffToStage } from '@/lib/stage-nav'
import type { StageId } from '@/types'

interface HandoffButtonProps {
  label: string
  targetStage: StageId
  disabled?: boolean
}

export function HandoffButton({ label, targetStage, disabled }: HandoffButtonProps) {
  const router = useRouter()
  const target = STAGES.find((s) => s.id === targetStage)

  if (!target) return null

  const handleClick = async () => {
    const path = await handoffToStage(targetStage)
    if (path) router.push(path)
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
