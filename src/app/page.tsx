import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  Clapperboard,
  Film,
  Palette,
  PenTool,
  Share2,
  Sparkles,
  Users,
} from 'lucide-react'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SectionNav } from '@/components/marketing/section-nav'
import { LANDING_SHOWCASE, type ShowcaseSlot } from '@/lib/landing-content'
import { cn } from '@/lib/utils'

// 랜딩 (#landing-v2 2026-08-03) — aistudio.google.com/models/veo 참고: 풀스크린 몰입 섹션들이
//   한 기능씩 보여준다. 프로젝트 목록은 /projects 로 분리됐고, 로그인 상태는 middleware 가
//   이 페이지 진입 자체를 /projects 로 돌린다.
// 스크롤(#landing-v2c): 스냅(y-mandatory)은 트랙패드에서 뚝뚝 끊겨 제거 — 연속 스크롤 +
//   우측 "-" 목차(SectionNav)로 섹션 점프. 섹션 id 는 아래 LANDING_SECTIONS 가 진실.

export const metadata: Metadata = {
  title: 'Tale Studio — 스토리 한 줄이 Previz 영상이 되기까지',
  description:
    '5명의 AI 프로덕션 팀(Producer·Writer·Artist·Director·Editor)과 함께 콘티부터 Previz 영상까지. 링크 하나로 공유하고 리뷰받으세요.',
  openGraph: {
    title: 'Tale Studio',
    description: '스토리 한 줄이 Previz 영상이 되기까지 — AI 프리프로덕션 스튜디오',
  },
}

// 우측 "-" 목차의 진실 — 섹션 id·표시명 (SectionNav 와 아래 <section id> 가 함께 쓴다)
const LANDING_SECTIONS = [
  { id: 'hero', label: '홈' },
  { id: 'pipeline', label: 'AI 팀' },
  { id: 'previz', label: 'Previz' },
  { id: 'collab', label: '공유·리뷰' },
  { id: 'start', label: '시작하기' },
] as const

const STAGES_SHOWCASE = [
  {
    label: 'Producer',
    color: 'text-stage-producer',
    border: 'border-stage-producer/40',
    icon: Users,
    desc: '스토리 한 줄을 받아 캐릭터·배경·구조를 함께 정리합니다',
  },
  {
    label: 'Writer',
    color: 'text-stage-writer',
    border: 'border-stage-writer/40',
    icon: PenTool,
    desc: '씬과 샷을 나누고 러프 스토리보드를 그립니다',
  },
  {
    label: 'Artist',
    color: 'text-stage-artist',
    border: 'border-stage-artist/40',
    icon: Palette,
    desc: '캐릭터 턴어라운드 시트와 배경 컨셉을 만듭니다',
  },
  {
    label: 'Director',
    color: 'text-stage-director',
    border: 'border-stage-director/40',
    icon: Clapperboard,
    desc: '카메라·조명을 조정하고 실사 이미지와 영상을 촬영합니다',
  },
  {
    label: 'Editor',
    color: 'text-stage-editor',
    border: 'border-stage-editor/40',
    icon: Film,
    desc: '테이크를 고르고 이어 붙여 한 편으로 완성합니다',
  },
] as const

/** 쇼케이스 영상 — URL 이 비어 있으면 시네마틱 그라디언트로 대체(빈 슬롯을 드러내지 않음). */
function ShowcaseVideo({
  slot,
  className,
  overlay = true,
}: {
  slot: ShowcaseSlot
  className?: string
  overlay?: boolean
}) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {slot.videoUrl ? (
        <video
          src={slot.videoUrl}
          poster={slot.poster ?? undefined}
          autoPlay
          muted
          loop
          playsInline
          className="size-full object-cover"
        />
      ) : (
        <div className="size-full bg-[radial-gradient(ellipse_at_top,rgba(229,9,20,0.14),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(70,130,180,0.10),transparent_60%)]" />
      )}
      {overlay && (
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/30 to-black/80" />
      )}
    </div>
  )
}

export default function LandingPage() {
  return (
    <div className="bg-black text-white">
      <SiteHeader />
      <SectionNav sections={LANDING_SECTIONS} />

      {/* ── 1. Hero — 무엇을 하는 곳인지 한 문장 + 대표 영상 ── */}
      <section id="hero" className="relative flex min-h-svh flex-col items-center justify-center px-6">
        <ShowcaseVideo slot={LANDING_SHOWCASE.hero} />
        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium tracking-wide text-gray-300 backdrop-blur-md">
            <Sparkles className="size-3.5 text-primary" />
            AI previz studio
          </div>
          <h1 className="mb-6 text-5xl font-semibold leading-[1.08] tracking-tighter md:text-7xl">
            스토리 한 줄이
            <br />
            <span className="bg-gradient-to-r from-primary via-red-400 to-orange-400 bg-clip-text text-transparent">
              Previz 영상
            </span>
            이 되기까지
          </h1>
          <p className="mx-auto mb-12 max-w-2xl text-lg font-light leading-relaxed text-gray-300 md:text-xl">
            5명의 AI 프로덕션 팀과 함께 콘티부터 영상까지.
            <br className="hidden md:block" />
            만든 결과물은 링크 하나로 공유하고 리뷰받으세요.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/login"
              className="group inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-base font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_40px_rgba(229,9,20,0.4)]"
            >
              무료로 시작하기
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/playground"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-8 py-4 text-base font-medium text-white backdrop-blur-sm transition-all hover:border-white hover:bg-white hover:text-black"
            >
              Playground 구경하기
            </Link>
          </div>
        </div>
      </section>

      {/* ── 2. 파이프라인 — 5명의 AI 팀이 이어달리는 과정 ── */}
      <section id="pipeline" className="relative flex min-h-svh flex-col items-center justify-center px-6 py-20">
        <div className="mx-auto w-full max-w-6xl">
          <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.25em] text-gray-500">
            How it works
          </p>
          <h2 className="mb-4 text-center text-4xl font-semibold tracking-tighter md:text-5xl">
            다섯 명의 AI 팀이 이어달립니다
          </h2>
          <p className="mx-auto mb-14 max-w-2xl text-center text-base font-light text-gray-400">
            각 단계의 에이전트가 앞 단계의 산출물을 이어받아 다음을 만듭니다 — 당신은
            채팅으로 지시하고, 마음에 들 때 다음으로 넘깁니다.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STAGES_SHOWCASE.map((stage, i) => (
              <div
                key={stage.label}
                className={cn(
                  'relative flex flex-col rounded-2xl border bg-white/[0.03] p-6 backdrop-blur-sm transition-colors hover:bg-white/[0.06]',
                  stage.border,
                )}
              >
                <span className="mb-4 font-mono text-xs text-gray-500">P{i + 1}</span>
                <stage.icon className={cn('mb-3 size-6', stage.color)} />
                <h3 className={cn('mb-2 text-lg font-semibold', stage.color)}>{stage.label}</h3>
                <p className="text-sm font-light leading-relaxed text-gray-400">{stage.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. Previz — 같은 샷의 3단 변신 ── */}
      <section id="previz" className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-6 py-20">
        <ShowcaseVideo slot={LANDING_SHOWCASE.previz} />
        <div className="relative z-10 mx-auto w-full max-w-5xl text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-gray-500">Previz</p>
          <h2 className="mb-4 text-4xl font-semibold tracking-tighter md:text-5xl">
            목각 콘티에서 실사 영상까지, 같은 샷으로
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-base font-light text-gray-400">
            러프 스토리보드로 구도를 확정하고, 같은 샷을 실사 이미지로, 다시 영상으로
            촬영합니다 — 촬영 전에 편집본을 미리 봅니다.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {(['목각 previz', '실사 이미지', '영상'] as const).map((step, i) => (
              <div
                key={step}
                className="flex aspect-video flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/50 backdrop-blur-sm"
              >
                <span className="mb-2 font-mono text-xs text-gray-500">{i + 1}</span>
                <span className="text-lg font-medium text-gray-200">{step}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. 공유·리뷰 ── */}
      <section id="collab" className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-6 py-20">
        <ShowcaseVideo slot={LANDING_SHOWCASE.collab} />
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <Share2 className="mx-auto mb-6 size-10 text-primary" />
          <h2 className="mb-4 text-4xl font-semibold tracking-tighter md:text-5xl">
            링크 하나로 공유하고 리뷰받으세요
          </h2>
          <p className="mx-auto mb-10 max-w-2xl text-base font-light leading-relaxed text-gray-400">
            로그인 없이 열리는 읽기 전용 링크로 팀·클라이언트에게 작업 전체를
            보여줄 수 있습니다. 완성작은 Playground 에 공개해 다른 창작자들과
            나눠 보세요.
          </p>
          <Link
            href="/playground"
            className="group inline-flex items-center gap-2 rounded-full border border-white/20 px-8 py-4 text-base font-medium text-white transition-all hover:border-primary hover:text-primary"
          >
            공개 작품 보러 가기
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      {/* ── 5. 마지막 CTA + 푸터 ── */}
      <section id="start" className="relative flex min-h-svh flex-col justify-between">
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <h2 className="mb-6 text-4xl font-semibold tracking-tighter md:text-6xl">
            오늘의 아이디어를
            <br />
            내일의 영상으로
          </h2>
          <Link
            href="/login"
            className="group inline-flex items-center gap-2 rounded-full bg-primary px-10 py-5 text-lg font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_40px_rgba(229,9,20,0.4)]"
          >
            무료로 시작하기
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
        <SiteFooter />
      </section>
    </div>
  )
}
