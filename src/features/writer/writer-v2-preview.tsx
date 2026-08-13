'use client'

import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WriterHeader } from '@/features/writer/writer-header'
import { useWriterPreview } from '@/lib/writer/use-writer-preview'

export function WriterV2Preview({ projectId }: { projectId: string }) {
  const { preview, loading } = useWriterPreview(projectId)
  const pkg = preview?.v2Package

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WriterHeader description="V2 실험 프리비즈 — 의미 단위 안에서 story와 visual을 함께 검토합니다" />
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-6xl space-y-5 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">V2 의미 단위 실험</Badge>
            <Badge variant="secondary">관리자 전용</Badge>
            <span className="text-sm text-muted-foreground">
              현재는 프리비즈 비교용 결과이며, 기존 에셋·영상 파이프라인에는 자동 반영하지 않습니다.
            </span>
          </div>

          {loading && !pkg ? (
            <p className="text-sm text-muted-foreground">V2 결과를 불러오는 중…</p>
          ) : null}

          {!loading && !pkg ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              아직 V2 프리비즈 결과가 없습니다.
            </div>
          ) : null}

          {pkg ? (
            <>
              <section className="rounded-xl border border-border bg-card/70 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">검토 상태</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      revision {pkg.revision_id} · 현재 attempt {pkg.current_attempt}
                    </p>
                  </div>
                  <Badge variant={pkg.status === 'ready' ? 'outline' : 'secondary'}>
                    {pkg.status === 'ready' ? 'Writer 후보' : 'User Review 필요'}
                  </Badge>
                </div>
                {pkg.user_review.required ? (
                  <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
                    {pkg.user_review.reason}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    첫 번째 결과가 semantic check를 통과했습니다.
                  </p>
                )}
              </section>

              <section className="rounded-xl border border-border bg-card/70 p-5">
                <h2 className="font-semibold">생성 시도 이력</h2>
                <div className="mt-3 space-y-2">
                  {pkg.attempts.map((attempt) => (
                    <div
                      key={attempt.attempt}
                      className="rounded-lg border border-border/80 px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">Attempt {attempt.attempt}</span>
                        <Badge variant="outline">
                          {attempt.invocation === 'complete' ? '호출 완료' : '호출 실패'}
                        </Badge>
                        <Badge variant={attempt.status === 'passed' ? 'outline' : 'destructive'}>
                          {attempt.status === 'passed' ? 'check 통과' : 'check 실패'}
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
                  <h2 className="font-semibold">의미 단위</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    한 단위 안에 이야기 의도·행동·반응과 여러 Shot 표현을 함께 보관합니다.
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
                        Shot {unit.shots.length}개
                      </span>
                    </div>
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div className="space-y-2 text-sm">
                        <p>
                          <strong>의도:</strong> {unit.story.intent}
                        </p>
                        <p>
                          <strong>행동:</strong> {unit.story.action}
                        </p>
                        <p>
                          <strong>반응:</strong> {unit.story.reaction}
                        </p>
                        <p>
                          <strong>감정:</strong> {unit.story.emotion}
                        </p>
                        {unit.story.dialogue.length ? (
                          <div>
                            <strong>대사:</strong>
                            <ul className="mt-1 space-y-1 text-muted-foreground">
                              {unit.story.dialogue.map((line) => (
                                <li key={`${line.character_id}:${line.timing}`}>
                                  {line.character_id} · {line.timing} — {line.line}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                      <div className="space-y-2 text-sm">
                        <p>
                          <strong>연출 의도:</strong> {unit.visual.direction_intent}
                        </p>
                        <p>
                          <strong>참조:</strong>{' '}
                          {unit.visual.character_refs.join(', ') || '캐릭터 미정'} ·{' '}
                          {unit.visual.background_ref || '배경 미정'}
                        </p>
                        <p>
                          <strong>구도:</strong> {unit.visual.composition}
                        </p>
                        <p>
                          <strong>카메라:</strong> {unit.visual.camera}
                        </p>
                        <p>
                          <strong>동선:</strong> {unit.visual.blocking}
                        </p>
                        <p>
                          <strong>전환:</strong> {unit.visual.transition}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 border-t border-border/70 pt-3">
                      <p className="text-xs font-medium text-muted-foreground">Shot 표현</p>
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
