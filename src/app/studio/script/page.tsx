import { HandoffButton } from '@/components/layout/handoff-button'

export default function ScriptPage() {
  return (
    <>
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">The Script Room</h1>
          <p className="mt-2 text-muted-foreground">
            Writer Agent — Coming Soon
          </p>
        </div>
      </div>
      <HandoffButton label="Ask Concept Artist" targetStage="visual" />
    </>
  )
}
