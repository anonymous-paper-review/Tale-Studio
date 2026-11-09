'use client'

/**
 * Design system showcase(v3, 2026-11-03) — 살아있는 토큰/패턴 카탈로그.
 * 값은 globals.css(여기서는 계산된 값을 읽어 보인다), 규칙은 specs/design.md. 새 색·variant 는 여기서 먼저 시각 확인.
 * studio 레이아웃 밖(사이드바·채팅 없음) — 단계 색 예시는 data-stage 를 붙인 상자 안에서 보인다.
 */

import { useEffect, useState } from 'react'
import { ArrowRight, Plus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AiBusyCard } from '@/components/ai-busy-overlay'
import { ChoiceChip, OptionCard, RecommendBadge } from '@/components/controls/choice-chip'
import { StageChip } from '@/components/controls/stage-chip'
import { StageConfirm } from '@/components/controls/stage-confirm'
import { DoneBadge, NodeWaitCard, STAGE_FRAME } from '@/components/feedback/node-wait'
import { ConfirmLumi } from '@/components/handoff/confirm-lumi'
import { PageHeader } from '@/components/layout/page-header'
import * as Icons from '@/components/icons/v3-icons'
import { Lumi, LumiAvatar } from '@/components/lumi/lumi'
import { STAGES } from '@/lib/constants'
import { LUMI_PERSONAS, LUMI_SIZE, LUMI_STATES, STAGE_PERSONA, type LumiPersona, type LumiSize, type LumiState } from '@/lib/lumi'

type Swatch = { token: string; role: string }

const NEUTRALS: Swatch[] = [
  { token: 'shell', role: 'Work screen background (= background)' },
  { token: 'side', role: 'Sidebar · chat' },
  { token: 'panel', role: 'Large content panel (prose · settings · cards)' },
  { token: 'card', role: 'Card · input · secondary button' },
  { token: 'chip', role: 'Chip · pressed secondary (= accent)' },
  { token: 'surface-elevated', role: 'Tooltip · topmost' },
]
const TEXT: Swatch[] = [
  { token: 'foreground', role: 'Text' },
  { token: 'muted-foreground', role: 'Text 2 · secondary' },
  { token: 'subtle-foreground', role: 'Meta · hint · placeholder' },
  { token: 'primary', role: 'Primary CTA (cream)' },
  { token: 'primary-foreground', role: 'Text on cream' },
  { token: 'on-stage', role: 'Text on stage colour' },
]
const STATUS: Swatch[] = [
  { token: 'info', role: 'Link · focus (= ring)' },
  { token: 'success', role: 'Done · saved' },
  { token: 'warning', role: 'Caution · credit' },
  { token: 'destructive', role: 'Error · delete (always with an icon)' },
]
const BORDERS: Swatch[] = [
  { token: 'border-subtle', role: 'Non-interactive separator' },
  { token: 'border', role: 'Default hairline' },
  { token: 'border-strong', role: 'Hover border' },
]
const CHAT: Swatch[] = [
  { token: 'chat-bg', role: 'Chat panel' },
  { token: 'chat-lumi-bubble', role: 'Lumi bubble' },
  { token: 'chat-my-bubble', role: 'My bubble' },
  { token: 'chat-chip', role: 'Quick reply' },
  { token: 'chat-input', role: 'Composer' },
  { token: 'chat-send', role: 'Send button' },
]
const STAGE_KEYS = ['producer', 'writer', 'artist', 'storyboard', 'director', 'editor'] as const

const BUTTON_VARIANTS = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const
const BUTTON_SIZES = ['xs', 'sm', 'default', 'lg'] as const
const BADGE_VARIANTS = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link', 'stage', 'tag'] as const

const TYPE_SCALE = [
  { cls: 'text-display font-bold', label: 'text-display · 32/700 — big question (E3)' },
  { cls: 'text-title font-bold', label: 'text-title · 28/700 — page title' },
  { cls: 'text-prose', label: 'text-prose · 16/29.6 — prose paragraph' },
  { cls: 'text-body font-semibold', label: 'text-body · 15 — card title · option title' },
  { cls: 'text-label font-medium', label: 'text-label · 13.5/500 — button · chip · UI label' },
  { cls: 'text-chat', label: 'text-chat · 13.5/20.9 — chat body' },
  { cls: 'text-caption text-muted-foreground', label: 'text-caption · 12.5 — description · hint' },
  { cls: 'font-num text-meta font-medium text-subtle-foreground', label: 'font-num text-meta · Inter 12/500 — Scene 2 · 6 shots · 16s' },
  { cls: 'text-micro font-semibold', label: 'text-micro · 11.5/600 — rail label · stage chip' },
  { cls: 'font-num text-micro font-semibold', label: 'font-num text-micro · Inter 11.5/600 — S1 · tag number' },
  { cls: 'text-tag font-semibold', label: 'text-tag · 10/600 — Recommended badge' },
]

const RADII = ['rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-3xl', 'rounded-full']

/** 계산된 토큰 값(globals.css 정본)을 읽어 보인다 — 값을 이 파일에 복제하지 않는다. */
function TokenValue({ token }: { token: string }) {
  const [value, setValue] = useState('')
  useEffect(() => {
    setValue(getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim())
  }, [token])
  return <span className="font-num text-[11px] text-subtle-foreground">{value || '…'}</span>
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-body font-semibold">{title}</h2>
        {hint && <p className="text-caption text-subtle-foreground">{hint}</p>}
      </div>
      <div className="rounded-xl bg-panel p-6 shadow-panel">{children}</div>
    </section>
  )
}

function SwatchGrid({ items }: { items: Swatch[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((s) => (
        <div key={s.token} className="space-y-1.5">
          <div className="h-14 w-full rounded-md border border-border-subtle" style={{ backgroundColor: `var(--${s.token})` }} />
          <div className="font-num text-[11px] leading-tight">--{s.token}</div>
          <TokenValue token={s.token} />
          <div className="text-[11px] leading-tight text-muted-foreground">{s.role}</div>
        </div>
      ))}
    </div>
  )
}

export default function DesignShowcasePage() {
  const [genre, setGenre] = useState('Comedy')
  const [length, setLength] = useState('15-60s')
  const [avatarState, setAvatarState] = useState<LumiState>('idle')
  const [bigPersona, setBigPersona] = useState<LumiPersona>('writer')
  const [ratio, setRatio] = useState('9:16')

  return (
    <div className="mx-auto max-w-5xl space-y-10 p-8">
      <PageHeader
        title="Design system v3"
        tag="2026-11-03"
        meta="globals.css · specs/design.md"
        actions={
          <Button>
            Primary CTA <ArrowRight />
          </Button>
        }
      />
      <p className="text-label text-muted-foreground">
        Dark only. Warm neutrals, one cream primary button, and the current stage colour only for that stage&apos;s chip, selection and badges.
      </p>

      <Section title="Color · neutrals" hint="design.md §2.1 — brand guide 04 system colours">
        <SwatchGrid items={NEUTRALS} />
      </Section>
      <Section title="Color · text and primary" hint="design.md §2.3">
        <SwatchGrid items={TEXT} />
      </Section>
      <Section title="Color · status" hint="design.md §2.5 — errors, done, caution and links only">
        <SwatchGrid items={STATUS} />
      </Section>
      <Section title="Color · borders" hint="design.md §2.4">
        <SwatchGrid items={BORDERS} />
      </Section>
      <Section title="Color · chat" hint="design.md §2.10 — Lumi guide chat colours (neutral frame)">
        <SwatchGrid items={CHAT} />
      </Section>

      <Section title="Stage colours · badge · gradient" hint="design.md §2.9 — data-stage sets --stage for the subtree">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STAGE_KEYS.map((key) => (
            <div key={key} data-stage={key} className="space-y-2 rounded-lg bg-card p-3">
              <div className="h-12 rounded-md bg-stage-gradient" />
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-stage" />
                <TokenValue token={`stage-${key}`} />
              </div>
              <span className="inline-flex h-[22px] items-center rounded-full bg-stage-badge px-2.5 text-micro font-semibold text-stage-badge-foreground">
                {key}
              </span>
            </div>
          ))}
        </div>
        <Separator className="my-5" />
        <div className="flex flex-wrap gap-2">
          {STAGES.map((stage) => (
            <StageChip key={stage.id} stage={stage.id} />
          ))}
        </div>
        <div className="mt-5 h-10 rounded-lg bg-pearl-vivid" />
        <p className="mt-1.5 text-caption text-subtle-foreground">Pearl Vivid: logo, home headline, app icon and the finished moment only.</p>
        <p className="mt-4 text-display font-bold text-gradient">Your Tale Deserves a Take</p>
      </Section>

      <Section title="Typography" hint="design.md §4 — Pretendard for text, Inter (font-num) for numbers and meta">
        <div className="space-y-3">
          {TYPE_SCALE.map((t) => (
            <div key={t.label} className={t.cls}>
              {t.label}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Button · variants × sizes" hint="design.md §13.8 — one cream primary per screen">
        <div className="space-y-5">
          {BUTTON_SIZES.map((size) => (
            <div key={size} className="flex flex-wrap items-center gap-3">
              <span className="w-16 font-num text-xs text-subtle-foreground">{size}</span>
              {BUTTON_VARIANTS.map((variant) => (
                <Button key={variant} variant={variant} size={size}>
                  {variant}
                </Button>
              ))}
            </div>
          ))}
          <Separator />
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-16 font-num text-xs text-subtle-foreground">state</span>
            <Button>
              Next: Director <ArrowRight />
            </Button>
            <Button variant="secondary">
              <Icons.DrawIcon /> Write it myself
            </Button>
            <Button variant="ghost" className="rounded-full">
              Back to story material
            </Button>
            <Button disabled>disabled</Button>
            <Button size="icon" className="rounded-full" aria-label="Send">
              <ArrowRight className="-rotate-90" />
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Choice chip · option card · recommended" hint="design.md §13.9 — selected = stage border + 18% tint (aria-pressed)">
        <div className="space-y-6">
          {(['producer', 'artist', 'storyboard'] as const).map((key) => (
            <div key={key} data-stage={key} className="space-y-3">
              <span className="font-num text-xs text-subtle-foreground">data-stage=&quot;{key}&quot;</span>
              <div className="flex flex-wrap gap-2">
                {['Comedy', 'Drama', 'Romance', 'Thriller'].map((label) => (
                  <ChoiceChip key={label} selected={genre === label} recommended={label === 'Comedy'} onClick={() => setGenre(label)}>
                    {label}
                  </ChoiceChip>
                ))}
                <ChoiceChip tone="chat">Rewrite all of it</ChoiceChip>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  ['Under 15s', 'Short form'],
                  ['15-60s', 'Ad · teaser'],
                  ['1-5 min', 'MV · web drama'],
                  ['5-20 min', 'Short film'],
                ].map(([title, description]) => (
                  <OptionCard
                    key={title}
                    title={title}
                    description={description}
                    selected={length === title}
                    recommended={title === '15-60s'}
                    onClick={() => setLength(title)}
                  />
                ))}
              </div>
            </div>
          ))}
          <div data-stage="writer" className="flex items-center gap-2">
            <RecommendBadge />
            <Badge variant="tag">Unnamed</Badge>
            <Badge variant="tag">Character</Badge>
          </div>
        </div>
      </Section>

      <Section title="Radio chips · option cards" hint="role=&quot;radio&quot; inside role=&quot;radiogroup&quot; → aria-checked (pick one); without role → aria-pressed (toggle)">
        <div data-stage="producer" className="space-y-3">
          <div role="radiogroup" aria-label="Aspect ratio" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              ['16:9', 'Landscape'],
              ['9:16', 'Vertical · short form'],
              ['1:1', 'Square'],
              ['2.39:1', 'Cinema'],
            ].map(([title, description]) => (
              <OptionCard
                key={title}
                role="radio"
                title={title}
                description={description}
                selected={ratio === title}
                recommended={title === '9:16'}
                onClick={() => setRatio(title)}
              />
            ))}
          </div>
          <div role="radiogroup" aria-label="Aspect ratio chips" className="flex flex-wrap gap-2">
            {['16:9', '9:16', '1:1', '2.39:1'].map((value) => (
              <ChoiceChip key={value} role="radio" selected={ratio === value} onClick={() => setRatio(value)}>
                {value}
              </ChoiceChip>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Loading card (11/5 SYS)" hint="components/ai-busy-overlay.tsx AiBusyCard — lumi given: Feedback/Loading Card (372 · Lumi L · steps ✓ ● ○ · bar). pearl = default (cream on the project list), six stages = stage colour. Stopped: error Lumi. No lumi: small spinner card as before">
        <div className="grid justify-items-center gap-6 md:grid-cols-2 xl:grid-cols-4">
          {(['pearl', 'producer', 'writer', 'artist', 'storyboard', 'director', 'editor'] as const).map((persona) => (
            <AiBusyCard
              key={persona}
              title="Making it now"
              description="Please wait a moment. It keeps going even if you close the window."
              progress={64}
              steps={[
                { label: 'Read the request', state: 'done' },
                { label: 'Making', state: 'current' },
                { label: 'Finish', state: 'todo' },
              ]}
              lumi={persona}
            />
          ))}
          <AiBusyCard
            title="Could not write the draft"
            description="Try again in a moment."
            busy={false}
            lumi="writer"
            footer={<Button size="sm">Try again</Button>}
          />
          <AiBusyCard title="Making the image" description="Minho · White shirt" />
        </div>
      </Section>

      <Section title="Node waiting · done mark (11/5 SYS)" hint="components/feedback/node-wait.tsx — NodeWaitCard fills its node (padding 18 · Lumi S · stage border 1.5 · bar); DoneBadge + STAGE_FRAME for a finished node">
        <div data-stage="director" className="flex flex-wrap gap-6">
          <div className="relative h-[264px] w-[240px] rounded-[14px] bg-background shadow-node">
            <NodeWaitCard lumi="director" title="Making the video" description="Shot 3 · I2V 4s · about 1 min left" progress={60} note="Next up: New shot → Shot 2" />
          </div>
          <div className={`flex h-[264px] w-[240px] flex-col gap-2 rounded-[14px] bg-background p-3 shadow-node ${STAGE_FRAME}`}>
            <div className="flex items-center justify-between text-[11px] text-subtle-foreground">
              <span>Video</span>
              <DoneBadge />
            </div>
            <p className="text-[14px] font-semibold">Shot 1 · Video</p>
            <div className="flex-1 rounded-[14px] bg-art-placeholder" />
          </div>
          <div className="relative h-[150px] w-[150px] rounded-[14px] bg-art-placeholder">
            <NodeWaitCard lumi="artist" title="Drawing" progress={55} />
          </div>
        </div>
      </Section>

      <Section title="Stage confirm (11/5)" hint="components/controls/stage-confirm.tsx — stage = current stage id; left = next stage icon + label (cream), right = revise. tone=&quot;chat&quot; inside a Lumi bubble">
        <div className="flex flex-col gap-4">
          {STAGES.map((stage) => (
            <StageConfirm key={stage.id} stage={stage.id} onConfirm={() => toast('Next')} onRevise={() => toast('Revise')} />
          ))}
          <div className="w-fit rounded-xl rounded-tl-[6px] bg-chat-lumi-bubble px-[22px] py-[18px]">
            <StageConfirm stage="entry" tone="chat" onConfirm={() => toast('Next')} onRevise={() => toast('Revise')} />
          </div>
        </div>
      </Section>

      <Section title="Badge" hint="design.md §7.1">
        <div data-stage="director" className="flex flex-wrap gap-2">
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="Tabs" hint="default = segmented (Mode Toggle) · pill = chips (Rough | Script) · line">
        <div data-stage="artist" className="space-y-4">
          <Tabs defaultValue="screen">
            <TabsList>
              <TabsTrigger value="screen">
                <Icons.ListIcon /> Choose on screen
              </TabsTrigger>
              <TabsTrigger value="chat">
                <Icons.ChatIcon /> Make it with chat
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs defaultValue="all">
            <TabsList variant="pill">
              <TabsTrigger value="all">All 4</TabsTrigger>
              <TabsTrigger value="people">Characters 3</TabsTrigger>
              <TabsTrigger value="places">Backgrounds 1</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs defaultValue="nodes">
            <TabsList variant="line">
              <TabsTrigger value="nodes">Nodes</TabsTrigger>
              <TabsTrigger value="board">Storyboard</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </Section>

      <Section title="Input · textarea · select" hint="design.md §6.2 — card fill, no border, Info focus ring">
        <div className="grid max-w-md gap-4">
          <Input placeholder="E.g. make the team leader more annoying" />
          <Input placeholder="disabled" disabled />
          <Input placeholder="invalid" aria-invalid />
          <Textarea placeholder="Story material" />
          <Select defaultValue="cu">
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ecu">ECU</SelectItem>
              <SelectItem value="cu">CU</SelectItem>
              <SelectItem value="ms">MS</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Section>

      <Section title="Card" hint="panel = large content container · raised = small box on a panel">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Minho</CardTitle>
              <CardDescription>Office worker in his twenties, loose tie</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <div className="size-24 rounded-xl bg-art-placeholder" />
              <div className="size-24 rounded-xl bg-art-placeholder" />
            </CardContent>
          </Card>
          <Card variant="raised">
            <CardTitle>Keeps · Changes</CardTitle>
            <CardDescription>Material · genre · length / plot · characters · ending</CardDescription>
          </Card>
        </div>
      </Section>

      <Section title="Dialog · popover · tooltip · toast" hint="design.md §9 — one drop shadow, no glass">
        <div className="flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <ConfirmLumi stage="writer" />
                <DialogTitle>Hand over to Director?</DialogTitle>
                <DialogDescription>The storyboard stays as it is. You can come back any time.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="secondary">Cancel</Button>
                <Button>
                  Next: Director <ArrowRight />
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Open wide dialog</Button>
            </DialogTrigger>
            <DialogContent size="wide">
              <DialogHeader>
                <ConfirmLumi persona="pearl" />
                <DialogTitle>Which style should we draw in?</DialogTitle>
                <DialogDescription>Wide popup (748) for choices like the style picker.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-4 gap-3">
                {['Real', '3D', 'Anime', 'Cartoon'].map((style) => (
                  <OptionCard key={style} title={style} description="Example" />
                ))}
              </div>
              <DialogFooter>
                <Button variant="secondary">Cancel</Button>
                <Button>Draw in Real</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary">Open popover</Button>
            </PopoverTrigger>
            <PopoverContent className="text-label">Popover on the card surface with one shadow.</PopoverContent>
          </Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary">Hover for tooltip</Button>
            </TooltipTrigger>
            <TooltipContent>Tooltip</TooltipContent>
          </Tooltip>
          <Button variant="secondary" onClick={() => toast.success('Saved')}>
            Show toast
          </Button>
        </div>
      </Section>

      <Section title="Page header" hint="components/layout/page-header.tsx — big title, tag, Inter meta, cream CTA on the right">
        <div className="space-y-5">
          <PageHeader title="Storyboard" tag="Unnamed" meta="Scene 2 · 6 shots · 16s" actions={<Button>Next: Director <ArrowRight /></Button>} />
          <PageHeader
            title="Prose"
            meta="Scene 2 · about 15s"
            actions={
              <>
                <Button variant="secondary">
                  <Icons.DrawIcon /> Write it myself
                </Button>
                <Button variant="secondary">
                  <Sparkles /> Rewrite with AI
                </Button>
                <Button>Breakdown <ArrowRight /></Button>
              </>
            }
          />
        </div>
      </Section>

      <Section title="Lumi · chat avatars (still)" hint="components/lumi/lumi.tsx LumiAvatar — 80px webp in public/lumi/avatar">
        <div className="mb-4 flex flex-wrap gap-2">
          {LUMI_STATES.filter((s) => s !== 'loading').map((s) => (
            <ChoiceChip key={s} selected={avatarState === s} onClick={() => setAvatarState(s)}>
              {s}
            </ChoiceChip>
          ))}
        </div>
        <div className="flex flex-wrap gap-6">
          {LUMI_PERSONAS.map((persona) => (
            <div key={persona} className="flex flex-col items-center gap-1.5">
              <LumiAvatar persona={persona} state={avatarState} size={40} />
              <span className="font-num text-[11px] text-subtle-foreground">{persona}</span>
            </div>
          ))}
        </div>
        <Separator className="my-5" />
        <div className="flex flex-wrap gap-6">
          {STAGES.map((stage) => (
            <div key={stage.id} className="flex flex-col items-center gap-1.5">
              <LumiAvatar persona={STAGE_PERSONA[stage.id]} size={28} />
              <span className="font-num text-[11px] text-subtle-foreground">{stage.id}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Lumi · big (web component)" hint="Loads /lumi-persona.js only here. Still image until loaded, without WebGL, or if loading fails. Paused under reduced motion.">
        <div className="mb-4 flex flex-wrap gap-2">
          {LUMI_PERSONAS.map((persona) => (
            <ChoiceChip key={persona} selected={bigPersona === persona} onClick={() => setBigPersona(persona)}>
              {persona}
            </ChoiceChip>
          ))}
        </div>
        <Lumi persona={bigPersona} state="idle" size={240} label="Lumi" />
      </Section>

      <Section title="Lumi · sizes (11/5 SYS)" hint="lib/lumi.ts LUMI_SIZE — width, box 1 : 0.77. xl first greeting · l loading popup · page head · m popup title · s node waiting · xs chat avatar · chat side-chat avatar">
        <div className="flex flex-wrap items-end gap-8">
          {(['xl', 'l', 'm', 's'] as LumiSize[]).map((size) => (
            <div key={size} className="flex flex-col items-center gap-2">
              <Lumi persona="pearl" state="idle" size={size} />
              <span className="font-num text-xs text-subtle-foreground">
                {size.toUpperCase()} · {LUMI_SIZE[size]}
              </span>
            </div>
          ))}
          {(['xs', 'chat'] as LumiSize[]).map((size) => (
            <div key={size} className="flex flex-col items-center gap-2">
              <LumiAvatar persona="pearl" size={size} />
              <span className="font-num text-xs text-subtle-foreground">
                {size.toUpperCase()} · {LUMI_SIZE[size]}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Icons · v3 fill" hint="components/icons/v3-icons.tsx — currentColor, 24×24">
        <div className="flex flex-wrap gap-5 text-muted-foreground">
          {Object.entries(Icons).map(([name, Icon]) => (
            <div key={name} className="flex w-20 flex-col items-center gap-1.5">
              <Icon className="size-6" />
              <span className="truncate font-num text-[10px] text-subtle-foreground">{name.replace('Icon', '')}</span>
            </div>
          ))}
          <div className="flex w-20 flex-col items-center gap-1.5">
            <Plus className="size-5" />
            <span className="font-num text-[10px] text-subtle-foreground">lucide line</span>
          </div>
        </div>
      </Section>

      <Section title="Radius" hint="design.md §7 — --radius 12px">
        <div className="flex flex-wrap gap-4">
          {RADII.map((r) => (
            <div key={r} className="space-y-1.5">
              <div className={`size-16 bg-card ${r}`} />
              <div className="font-num text-[11px] text-subtle-foreground">{r}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
