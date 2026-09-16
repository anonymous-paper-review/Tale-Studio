'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useT } from '@/lib/i18n'

export function ImageUploadConsentDialog({
  fileNames,
  onDecision,
}: {
  fileNames: string[]
  onDecision: (accepted: boolean) => void
}) {
  const t = useT()
  const [checked, setChecked] = useState(false)

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onDecision(false) }}>
      <DialogContent className="sm:max-w-md" onKeyDown={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t('Confirm image usage rights')}</DialogTitle>
          <DialogDescription>{t('Confirm your rights before uploading.')}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-24 overflow-y-auto text-sm text-muted-foreground">
          {fileNames.map((name, index) => <li key={index} className="break-all">{name}</li>)}
        </ul>
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm leading-relaxed">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
            className="mt-1 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <span lang="en">I have the right to use this image, and if it shows an identifiable person, I have their consent to use it here.</span>
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onDecision(false)}>{t('Cancel')}</Button>
          <Button type="button" disabled={!checked} onClick={() => { if (checked) onDecision(true) }}>{t('Upload')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A fresh decision belongs only to the files selected in this screen, never to the account. */
export function useImageUploadConsent(scope: string | null) {
  const [pending, setPending] = useState<{ id: number; scope: string | null; fileNames: string[] } | null>(null)
  const sequence = useRef(0)
  const decision = useRef<{ id: number; resolve: (accepted: boolean) => void } | null>(null)

  useEffect(() => () => {
    decision.current?.resolve(false)
    decision.current = null
    setPending(null)
  }, [scope])

  const requestImageUploadConsent = useCallback((files: readonly File[]): Promise<boolean> => {
    decision.current?.resolve(false)
    const id = ++sequence.current
    return new Promise<boolean>((resolve) => {
      decision.current = { id, resolve }
      setPending({ id, scope, fileNames: files.map(file => file.name) })
    })
  }, [scope])

  const finish = (id: number, accepted: boolean) => {
    if (decision.current?.id !== id) return
    decision.current.resolve(accepted)
    decision.current = null
    setPending(null)
  }

  const imageUploadConsentDialog = pending && pending.scope === scope ? (
    <ImageUploadConsentDialog
      key={pending.id}
      fileNames={pending.fileNames}
      onDecision={(accepted) => finish(pending.id, accepted)}
    />
  ) : null

  return { requestImageUploadConsent, imageUploadConsentDialog }
}
