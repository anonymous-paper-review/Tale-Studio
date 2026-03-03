'use client'

import { Sparkles } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export function Samantha() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-110">
          <Sparkles className="h-5 w-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-72">
        <div className="space-y-2">
          <h4 className="font-medium">Samantha</h4>
          <p className="text-sm text-muted-foreground">
            AI Assistant — Coming Soon
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
