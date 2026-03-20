'use client'

import { usePathname, useRouter } from 'next/navigation'
import {
  Users,
  PenTool,
  Palette,
  Clapperboard,
  Film,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { STAGES } from '@/lib/constants'
import { UserMenu } from '@/components/layout/user-menu'
import { useProjectStore } from '@/stores/project-store'
import type { StageId } from '@/types'

const STAGE_ICONS: Record<StageId, React.ElementType> = {
  producer: Users,
  writer: PenTool,
  artist: Palette,
  director: Clapperboard,
  editor: Film,
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const canNavigateTo = useProjectStore((s) => s.canNavigateTo)

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-full w-16 flex-col items-center border-r border-border bg-card py-4">
      <div className="flex flex-1 flex-col items-center gap-2">
        {STAGES.map((stage) => {
          const Icon = STAGE_ICONS[stage.id]
          const isActive = pathname.startsWith(stage.path)
          const isLocked = !canNavigateTo(stage.id)

          return (
            <Tooltip key={stage.id} delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => !isLocked && router.push(stage.path)}
                  disabled={isLocked}
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-lg transition-colors',
                    isLocked && 'cursor-not-allowed opacity-30',
                    isActive && !isLocked
                      ? 'border-l-2 border-primary bg-accent text-primary'
                      : !isLocked && 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex flex-col">
                <span className="font-medium">{stage.name}</span>
                <span className="text-xs text-muted-foreground">
                  {isLocked ? 'Complete previous step first' : stage.agent}
                </span>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      <UserMenu />
    </aside>
  )
}
