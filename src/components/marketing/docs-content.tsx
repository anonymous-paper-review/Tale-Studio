'use client'

// 이용 가이드 본문 (#landing-v2 2026-08-03). 2026-11-25 오너: 한국어 화면에서는 한국어로 보인다(문구 = 사전 키).
//   약속: tests/ui-text/docs-korean.test.ts · tests/ui-text/docs-faq.test.ts
import Link from 'next/link'
import { useT } from '@/lib/i18n'

export const STAGE_GUIDE = [
  {
    id: 'producer',
    name: 'Producer · The Meeting Room',
    color: 'text-stage-producer',
    body: 'Tell the Producer the story you want to make, right in the chat. Together you\'ll nail down the basics: characters, setting, runtime, genre. Once everything required is filled in, you can hand off to the Writer from the chat.',
  },
  {
    id: 'writer',
    name: "Writer · The Writers' Room",
    color: 'text-stage-writer',
    body: 'The Writer breaks the story into scenes and shots, sketching a rough storyboard for each one. Edit scene stories in the Producer, and write character-by-character dialogue in the Dialogue tab.',
  },
  {
    id: 'artist',
    name: 'Artist · The Visual Studio',
    color: 'text-stage-artist',
    body: 'The Concept Artist creates character turnaround sheets and background concept art. The look you lock in here becomes the reference for every shot that follows.',
  },
  {
    id: 'director',
    name: 'Director · The Set',
    color: 'text-stage-director',
    body: 'The Director adjusts camera and lighting for each shot, captures a live-action still, then generates video. Shoot as many takes as you need and pick your favorite.',
  },
  {
    id: 'editor',
    name: 'Editor · Post-Production Suite',
    color: 'text-stage-editor',
    body: 'The Editor stitches together the takes marked Final into one finished piece. Export it or share it with a link.',
  },
]

export const FAQ = [
  {
    q: 'Can I use what I generate commercially?',
    a: 'Yes. You may use your output commercially. You must have the rights to any material you upload, follow our content rules and the applicable AI model terms, and stay within your plan’s export limits.',
  },
  {
    q: 'How long does it take to make a video?',
    a: 'Rough storyboards take tens of seconds per scene; live-action images and video run about 1-3 minutes per shot. Generation happens in the background, so it keeps going even if you leave the tab.',
  },
  {
    q: 'How do I show my work to someone else?',
    a: "Use the share button on the studio's left rail to create a read-only link. Whoever opens it can view the whole project without logging in.",
  },
  {
    q: 'What aspect ratios are supported?',
    a: 'Choose from 16:9 landscape, 9:16 portrait, 2.39:1 cinema, or 1:1 square in project settings.',
  },
]

/** 화면 머리·시작 순서 문구(번역 누락 검사용 목록). */
export const DOCS_COPY = [
  'Docs',
  'From a one-line story to a previz video. Your guide to the 5-stage pipeline.',
  'Getting started',
  'Log in',
  'and create a new project.', // copy-ok: fragment
  'Tell the Producer chat your story idea in one line.',
  'Once the required fields are filled in, say “Hand this to the Writer” in the chat.',
  'Review and refine the output at each stage, then move on to the next.',
  'Pipeline',
  'FAQ',
]

export function DocsContent() {
  const t = useT()
  return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-20 pt-32">
        <h1 className="mb-3 text-4xl font-semibold tracking-tighter md:text-5xl">{t('Docs')}</h1>
        <p className="mb-14 text-base font-light text-gray-400">
          {t('From a one-line story to a previz video. Your guide to the 5-stage pipeline.')}
        </p>

        <section className="mb-16">
          <h2 className="mb-6 text-2xl font-semibold tracking-tight">{t('Getting started')}</h2>
          <ol className="space-y-3 text-sm leading-relaxed text-gray-300">
            <li>
              1. <Link href="/login" className="text-primary underline-offset-4 hover:underline">{t('Log in')}</Link>{' '}
              {t('and create a new project.')} {/* copy-ok: fragment */}
            </li>
            <li>2. {t('Tell the Producer chat your story idea in one line.')}</li>
            <li>3. {t('Once the required fields are filled in, say “Hand this to the Writer” in the chat.')}</li>
            <li>4. {t('Review and refine the output at each stage, then move on to the next.')}</li>
          </ol>
        </section>

        <section className="mb-16">
          <h2 className="mb-6 text-2xl font-semibold tracking-tight">{t('Pipeline')}</h2>
          <div className="space-y-6">
            {STAGE_GUIDE.map((stage, i) => (
              <div key={stage.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <h3 className={`mb-2 font-semibold ${stage.color}`}>
                  <span className="mr-2 font-num text-xs text-muted-foreground">{i + 1}</span>
                  {t(stage.name)}
                </h3>
                <p className="text-sm font-light leading-relaxed text-gray-300">{t(stage.body)}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-6 text-2xl font-semibold tracking-tight">{t('FAQ')}</h2>
          <div className="space-y-6">
            {FAQ.map((item) => (
              <div key={item.q}>
                <h3 className="mb-1.5 text-sm font-semibold text-gray-100">{t(item.q)}</h3>
                <p className="text-sm font-light leading-relaxed text-gray-400">{t(item.a)}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
  )
}
