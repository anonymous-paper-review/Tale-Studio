import { HandoffButton } from '@/components/layout/handoff-button'

export default function MeetingPage() {
  return (
    <>
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">The Meeting Room</h1>
          <p className="mt-2 text-muted-foreground">
            Producer Agent — Coming Soon
          </p>
        </div>
      </div>
      <HandoffButton label="Hand over to Writer" targetStage="script" />
    </>
  )
}
