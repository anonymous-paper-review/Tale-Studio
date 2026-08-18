import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'

// Docs (#landing-v2 2026-08-03) — 시작 가이드 + 자주 묻는 질문. 단일 페이지 앵커 구성.
//   내용이 늘어나면 /docs/[slug] 로 쪼갠다 — 지금은 온보딩에 필요한 최소만.

export const metadata: Metadata = {
  title: 'Docs — Tale Studio',
  description: 'Tale Studio getting started guide — how to turn a story into a previz video with the 5-stage pipeline.',
}

const STAGE_GUIDE = [
  {
    id: 'producer',
    name: 'Producer — The Meeting Room',
    color: 'text-stage-producer',
    body: 'Tell the Producer the story you want to make, right in the chat. Together you\'ll nail down the basics — characters, setting, runtime, genre. Once everything required is filled in, you can hand off to the Writer from the chat.',
  },
  {
    id: 'writer',
    name: "Writer — The Writers' Room",
    color: 'text-stage-writer',
    body: 'The Writer breaks the story into scenes and shots, sketching a rough storyboard for each one. Edit the prose in the Treatment tab, and write character-by-character dialogue in the Dialogue tab.',
  },
  {
    id: 'artist',
    name: 'Artist — The Visual Studio',
    color: 'text-stage-artist',
    body: 'The Concept Artist creates character turnaround sheets and background concept art. The look you lock in here becomes the reference for every shot that follows.',
  },
  {
    id: 'director',
    name: 'Director — The Set',
    color: 'text-stage-director',
    body: 'The Director adjusts camera and lighting for each shot, captures a live-action still, then generates video. Shoot as many takes as you need and pick your favorite.',
  },
  {
    id: 'editor',
    name: 'Editor — Post-Production Suite',
    color: 'text-stage-editor',
    body: 'The Editor stitches together the takes marked Final into one finished piece. Export it or share it with a link.',
  },
]

const FAQ = [
  {
    q: 'Can I use what I generate commercially?',
    a: 'During the beta, usage rights to generated output belong to the person who created it. That said, third-party model policies apply too, so please reach out before using anything in a commercial project.',
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

export default function DocsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-20 pt-32">
        <h1 className="mb-3 text-4xl font-semibold tracking-tighter md:text-5xl">Docs</h1>
        <p className="mb-14 text-base font-light text-gray-400">
          From a one-line story to a previz video — your guide to the 5-stage pipeline.
        </p>

        <section className="mb-16">
          <h2 className="mb-6 text-2xl font-semibold tracking-tight">Getting started</h2>
          <ol className="space-y-3 text-sm leading-relaxed text-gray-300">
            <li>
              1. <Link href="/login" className="text-primary underline-offset-4 hover:underline">Log in</Link>{' '}
              and create a new project.
            </li>
            <li>2. Tell the Producer chat your story idea in one line.</li>
            <li>3. Once the required fields are filled in, say &ldquo;Hand this to the Writer&rdquo; in the chat.</li>
            <li>4. Review and refine the output at each stage, then move on to the next.</li>
          </ol>
        </section>

        <section className="mb-16">
          <h2 className="mb-6 text-2xl font-semibold tracking-tight">Pipeline</h2>
          <div className="space-y-6">
            {STAGE_GUIDE.map((stage, i) => (
              <div key={stage.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <h3 className={`mb-2 font-semibold ${stage.color}`}>
                  <span className="mr-2 font-mono text-xs text-gray-500">P{i + 1}</span>
                  {stage.name}
                </h3>
                <p className="text-sm font-light leading-relaxed text-gray-300">{stage.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-6 text-2xl font-semibold tracking-tight">FAQ</h2>
          <div className="space-y-6">
            {FAQ.map((item) => (
              <div key={item.q}>
                <h3 className="mb-1.5 text-sm font-semibold text-gray-100">{item.q}</h3>
                <p className="text-sm font-light leading-relaxed text-gray-400">{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
