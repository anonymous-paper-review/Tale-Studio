'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WriterHeader } from '@/features/writer/writer-header'
import { useWriterPreview } from '@/lib/writer/use-writer-preview'
import { useT } from '@/lib/i18n'

export function WriterV2Preview({ projectId }: { projectId: string }) {
  const t = useT()
  const { preview, loading } = useWriterPreview(projectId)
  const pkg = preview?.v2Package
  const router = useRouter()
  const [applying, setApplying] = useState(false)
  const [applyMessage, setApplyMessage] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)

  const applyDownstream = async () => {
    setApplying(true)
    setApplyMessage(null)
    try {
      const response = await fetch('/api/writer/v2/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      const body = (await response.json()) as {
        error?: string
        scenes?: number
        shots?: number
      }
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
      setApplyMessage(
        t('Applied to the existing downstream contract. {scenes} scenes · {shots} shots', {
          scenes: body.scenes ?? 0,
          shots: body.shots ?? 0,
        }),
      )
      router.push(`/studio/artist?projectId=${encodeURIComponent(projectId)}`)
    } catch (error) {
      setApplyMessage(error instanceof Error ? error.message : t('Failed to apply.'))
    } finally {
      setApplying(false)
    }
  }

  const resolveReview = async (action: 'accept' | 'hold') => {
    setReviewing(true)
    setApplyMessage(null)
    try {
      const response = await fetch('/api/writer/v2/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, action }),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
      window.location.reload()
    } catch (error) {
      setApplyMessage(
        error instanceof Error ? error.message : t('Failed to save the review result.'),
      )
    } finally {
      setReviewing(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WriterHeader
        description={t(
          'V2 experimental previz: review story and visual together within each semantic unit',
        )}
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-6xl space-y-5 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{t('V2 semantic unit experiment')}</Badge>
            <Badge variant="secondary">{t('Admin only')}</Badge>
            <span className="text-sm text-muted-foreground">
              {t(
                'Not applied automatically. Once approved via User Review and applied, Artist and Director will read this result.',
              )}
            </span>
          </div>

          {loading && !pkg ? (
            <p className="text-sm text-muted-foreground">{t('Loading V2 results…')}</p>
          ) : null}

          {!loading && !pkg ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              {t('No V2 previz results yet.')}
            </div>
          ) : null}

          {pkg ? (
            <>
              <section className="rounded-xl border border-border bg-card/70 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{t('Review status')}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('Revision {revisionId} · current attempt {attempt}', {
                        revisionId: pkg.revision_id,
                        attempt: pkg.current_attempt,
                      })}
                    </p>
                  </div>
                  <Badge variant={pkg.status === 'ready' ? 'outline' : 'secondary'}>
                    {pkg.status === 'ready' ? t('Writer candidate') : t('Needs User Review')}
                  </Badge>
                </div>
                {pkg.status === 'ready' && preview?.v2Apply?.available ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button type="button" onClick={applyDownstream} disabled={applying}>
                      {applying
                        ? t('Connecting Artist·Director…')
                        : t('Apply the selected V2 result to downstream')}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {t(
                        'After applying, Artist reads characters and backgrounds, and Director reads scenes and shots.',
                      )}
                    </span>
                  </div>
                ) : null}
                {pkg.status === 'review' && pkg.user_review.required ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      onClick={() => void resolveReview('accept')}
                      disabled={reviewing}
                    >
                      {reviewing ? t('Saving review…') : t('Select this result as the candidate')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void resolveReview('hold')}
                      disabled={reviewing}
                    >
                      {t('Hold')}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {t(
                        'This selection is recorded as a Writer review. Final production decisions happen downstream.',
                      )}
                    </span>
                  </div>
                ) : null}
                {applyMessage ? (
                  <p className="mt-3 text-sm text-muted-foreground">{applyMessage}</p>
                ) : null}
                {pkg.user_review.required ? (
                  <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
                    {pkg.user_review.reason}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {t('The first result passed the semantic check.')}
                  </p>
                )}
              </section>

              <section className="rounded-xl border border-border bg-card/70 p-5">
                <h2 className="font-semibold">{t('Generation attempt history')}</h2>
                <div className="mt-3 space-y-2">
                  {pkg.attempts.map((attempt) => (
                    <div
                      key={attempt.attempt}
                      className="rounded-lg border border-border/80 px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">Attempt {attempt.attempt}</span>
                        <Badge variant="outline">
                          {attempt.invocation === 'complete' ? t('Call complete') : t('Call failed')}
                        </Badge>
                        <Badge variant={attempt.status === 'passed' ? 'outline' : 'destructive'}>
                          {attempt.status === 'passed' ? t('Check passed') : t('Check failed')}
                        </Badge>
                      </div>
                      {attempt.check.failures.length ? (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                          {attempt.check.failures.slice(0, 5).map((failure) => (
                            <li key={failure}>{failure}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <div>
                  <h2 className="font-semibold">{t('Semantic units')}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(
                      'Each unit holds story intent, action, and reaction together with multiple shot expressions.',
                    )}
                  </p>
                </div>
                {pkg.units.map((unit, index) => (
                  <article
                    key={unit.unit_id}
                    className="rounded-xl border border-border bg-card/70 p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-medium">
                        {index + 1}. {unit.unit_id}
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {t('{count} shots', { count: unit.shots.length })}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div className="space-y-2 text-sm">
                        <p>
                          <strong>{t('Intent:')}</strong> {unit.story.intent}
                        </p>
                        <p>
                          <strong>{t('Action:')}</strong> {unit.story.action}
                        </p>
                        <p>
                          <strong>{t('Reaction:')}</strong> {unit.story.reaction}
                        </p>
                        <p>
                          <strong>{t('Emotion:')}</strong> {unit.story.emotion}
                        </p>
                        {unit.story.dialogue.length ? (
                          <div>
                            <strong>{t('Dialogue:')}</strong>
                            <ul className="mt-1 space-y-1 text-muted-foreground">
                              {unit.story.dialogue.map((line) => (
                                <li key={`${line.character_id}:${line.timing}`}>
                                  {line.character_id} · {line.timing}: {line.line}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                      <div className="space-y-2 text-sm">
                        <p>
                          <strong>{t('Direction intent:')}</strong> {unit.visual.direction_intent}
                        </p>
                        <p>
                          <strong>{t('References:')}</strong>{' '}
                          {unit.visual.character_refs.join(', ') || t('No character set')} ·{' '}
                          {unit.visual.background_ref || t('No background set')}
                        </p>
                        <p>
                          <strong>{t('Composition:')}</strong> {unit.visual.composition}
                        </p>
                        <p>
                          <strong>{t('Camera:')}</strong> {unit.visual.camera}
                        </p>
                        <p>
                          <strong>{t('Blocking:')}</strong> {unit.visual.blocking}
                        </p>
                        <p>
                          <strong>{t('Transition:')}</strong> {unit.visual.transition}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 border-t border-border/70 pt-3">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t('Shot expression')}
                      </p>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        {unit.shots.map((shot) => (
                          <div
                            key={shot.shot_id}
                            className="rounded-lg bg-muted/40 p-3 text-xs"
                          >
                            <p className="font-medium">
                              {shot.shot_id} · {shot.duration_seconds}s
                            </p>
                            <p className="mt-1 text-muted-foreground">{shot.purpose}</p>
                            <p className="mt-1 text-muted-foreground">
                              {shot.composition} · {shot.camera} · {shot.blocking}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </section>
            </>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
