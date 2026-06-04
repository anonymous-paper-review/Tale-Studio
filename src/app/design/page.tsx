'use client'

/**
 * Design system 쇼케이스 — 살아있는 토큰/패턴 카탈로그.
 * 새 색·variant 추가 시 여기서 먼저 시각 확인 (specs/design.md §13.8).
 * studio 레이아웃 밖 (사이드바·채팅 없음). root layout이 다크·폰트 배선.
 */

import { ArrowRight, Send, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { AgentFace } from '@/components/agent-face'
import { STAGES } from '@/lib/constants'

type Swatch = { token: string; role: string }

const SURFACES: Swatch[] = [
  { token: 'background', role: '앱 배경' },
  { token: 'card', role: 'elevated surface' },
  { token: 'popover', role: 'floating overlay' },
  { token: 'muted', role: 'subdued surface' },
  { token: 'accent', role: 'ghost hover/active' },
  { token: 'surface-elevated', role: 'depth 3' },
]

const BRAND: Swatch[] = [
  { token: 'primary', role: 'CTA / accent (Netflix Red)' },
  { token: 'secondary', role: '보조 액션' },
  { token: 'destructive', role: '위험' },
  { token: 'success', role: '완료' },
  { token: 'warning', role: '경고' },
  { token: 'info', role: '도움말' },
]

const BORDERS: Swatch[] = [
  { token: 'border-subtle', role: '비-interactive separator' },
  { token: 'border', role: '기본 hairline' },
  { token: 'border-strong', role: 'hovered border' },
  { token: 'ring', role: 'focus ring' },
]

const CHART: Swatch[] = [
  { token: 'chart-1', role: 'Actor 노드' },
  { token: 'chart-2', role: 'World 노드' },
  { token: 'chart-3', role: 'Scene 노드' },
  { token: 'chart-4', role: 'Shot 노드' },
  { token: 'chart-5', role: 'Video 노드' },
]

const STAGE: Swatch[] = [
  { token: 'stage-producer', role: 'P1 Producer' },
  { token: 'stage-writer', role: 'P2 Writer' },
  { token: 'stage-artist', role: 'P3 Artist' },
  { token: 'stage-director', role: 'P4 Director' },
  { token: 'stage-editor', role: 'P5 Editor' },
]

const BUTTON_VARIANTS = [
  'default',
  'secondary',
  'outline',
  'ghost',
  'destructive',
  'link',
] as const
const BUTTON_SIZES = ['xs', 'sm', 'default', 'lg'] as const
const BADGE_VARIANTS = [
  'default',
  'secondary',
  'outline',
  'ghost',
  'destructive',
  'link',
] as const

const TYPE_SCALE = [
  { cls: 'text-2xl font-semibold', label: 'text-2xl / semibold — 페이지 타이틀' },
  { cls: 'text-lg font-medium', label: 'text-lg / medium — 섹션 헤더' },
  { cls: 'text-base', label: 'text-base — 본문' },
  { cls: 'text-sm', label: 'text-sm — 기본 UI' },
  { cls: 'text-xs text-muted-foreground', label: 'text-xs / muted — 캡션' },
  { cls: 'font-mono text-sm', label: 'font-mono — camera 값 / render ID (-10 +10)' },
]

const RADII = ['rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-full']

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="rounded-lg border border-border bg-card p-6">{children}</div>
    </section>
  )
}

function SwatchGrid({ items }: { items: Swatch[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((s) => (
        <div key={s.token} className="space-y-1.5">
          <div
            className="h-16 w-full rounded-md border border-border"
            style={{ backgroundColor: `var(--${s.token})` }}
          />
          <div className="font-mono text-[11px] leading-tight">--{s.token}</div>
          <div className="text-[11px] leading-tight text-muted-foreground">
            {s.role}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function DesignShowcasePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-12 p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Design system 쇼케이스</h1>
        <p className="text-sm text-muted-foreground">
          살아있는 토큰 + shadcn primitive 카탈로그. 값=
          <span className="font-mono">globals.css</span>, 룰=
          <span className="font-mono">specs/design.md</span>.
        </p>
      </header>

      {/* ── Color palette ── */}
      <Section title="Color — Surfaces" hint="design.md §2.1">
        <SwatchGrid items={SURFACES} />
      </Section>
      <Section title="Color — Brand / Semantic" hint="design.md §2.1 / §2.5">
        <SwatchGrid items={BRAND} />
      </Section>
      <Section title="Color — Borders" hint="design.md §2.4">
        <SwatchGrid items={BORDERS} />
      </Section>
      <Section title="Color — Chart (엔티티 노드)" hint="design.md §2.2">
        <SwatchGrid items={CHART} />
      </Section>
      <Section title="Color — Stage (파이프라인 P1~P5)" hint="design.md §2.9">
        <SwatchGrid items={STAGE} />
      </Section>

      {/* ── Buttons ── */}
      <Section title="Button — variants × sizes" hint="design.md §13.8 / §6.2">
        <div className="space-y-6">
          {BUTTON_SIZES.map((size) => (
            <div key={size} className="flex flex-wrap items-center gap-3">
              <span className="w-16 font-mono text-xs text-muted-foreground">
                {size}
              </span>
              {BUTTON_VARIANTS.map((variant) => (
                <Button key={variant} variant={variant} size={size}>
                  {variant}
                </Button>
              ))}
            </div>
          ))}
          <Separator />
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-16 font-mono text-xs text-muted-foreground">
              state
            </span>
            <Button>
              CTA <ArrowRight className="ml-1 size-4" />
            </Button>
            <Button disabled>disabled</Button>
            <Button variant="secondary" disabled>
              disabled
            </Button>
            <Button size="icon" aria-label="send">
              <Send className="size-4" />
            </Button>
            <Button size="icon-lg" aria-label="send-lg">
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </Section>

      {/* ── Inputs ── */}
      <Section title="Input — states" hint="design.md §6.2. footer 정렬 시 h-10">
        <div className="grid max-w-md gap-4">
          <Input placeholder="default (h-9)" />
          <Input className="h-10" placeholder="footer 정렬용 h-10" />
          <Input placeholder="disabled" disabled />
          <Input placeholder="invalid (aria-invalid)" aria-invalid />
          <div className="rounded-md border border-border p-4">
            <p className="mb-2 text-xs text-muted-foreground">
              패널 footer 패턴 (Input h-10 + icon-lg = 72px)
            </p>
            <div className="flex gap-2">
              <Input className="h-10" placeholder="메시지…" />
              <Button size="icon-lg" aria-label="send">
                <Send className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Select ── */}
      <Section title="Select" hint="design.md §6.2 / §13.8">
        <div className="flex max-w-md flex-wrap gap-4">
          <Select defaultValue="cu">
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ecu">ECU</SelectItem>
              <SelectItem value="cu">CU</SelectItem>
              <SelectItem value="ms">MS</SelectItem>
              <SelectItem value="ws">WS</SelectItem>
            </SelectContent>
          </Select>
          <Select>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue placeholder="sm / placeholder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a">Option A</SelectItem>
              <SelectItem value="b">Option B</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Section>

      {/* ── Badges ── */}
      <Section title="Badge — variants + stage" hint="design.md §2.9 / §7.1">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {BADGE_VARIANTS.map((variant) => (
              <Badge key={variant} variant={variant}>
                {variant}
              </Badge>
            ))}
          </div>
          <Separator />
          <div className="flex flex-wrap gap-2">
            {STAGE.map((s) => (
              <span
                key={s.token}
                className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: `color-mix(in oklch, var(--${s.token}) 15%, transparent)`,
                  color: `var(--${s.token})`,
                  borderColor: `color-mix(in oklch, var(--${s.token}) 30%, transparent)`,
                }}
              >
                {s.role}
              </span>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Agent faces ── */}
      <Section title="AgentFace — stage 색 (badge와 동일)" hint="components/agent-face.tsx">
        <div className="flex flex-wrap gap-6">
          {STAGES.map((stage) => (
            <div key={stage.id} className="flex flex-col items-center gap-1">
              <AgentFace
                color={`var(--stage-${stage.id})`}
                size={48}
                expression="idle"
              />
              <span className="font-mono text-[11px] text-muted-foreground">
                {stage.id}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Typography ── */}
      <Section title="Typography — scale" hint="design.md §4">
        <div className="space-y-3">
          {TYPE_SCALE.map((t) => (
            <div key={t.label} className={t.cls}>
              {t.label}
            </div>
          ))}
        </div>
      </Section>

      {/* ── Radius ── */}
      <Section title="Radius" hint="design.md §7">
        <div className="flex flex-wrap gap-4">
          {RADII.map((r) => (
            <div key={r} className="space-y-1.5">
              <div className={`size-16 border border-border bg-muted ${r}`} />
              <div className="font-mono text-[11px] text-muted-foreground">
                {r}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Motion ── */}
      <Section title="Motion — duration tiers" hint="design.md §10.1 (hover로 확인)">
        <div className="flex flex-wrap gap-3">
          {(['duration-100', 'duration-150', 'duration-250', 'duration-350'] as const).map(
            (d) => (
              <button
                key={d}
                className={`rounded-md border border-border bg-muted px-4 py-2 text-sm transition-all ease-out hover:scale-105 hover:bg-accent ${d}`}
              >
                <Sparkles className="mr-1 inline size-3" />
                <span className="font-mono text-xs">{d}</span>
              </button>
            ),
          )}
        </div>
      </Section>
    </div>
  )
}
