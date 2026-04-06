'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Loader2,
  Film,
  Pencil,
  Clock,
  ArrowRight,
  Sparkles,
  ChevronDown,
  Video,
  Camera,
  Users,
  ShieldCheck,
} from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import type { StageId } from '@/types'

interface ProjectItem {
  id: string
  title: string
  current_stage: string | null
  updated_at: string | null
}

const STAGE_LABELS: Record<string, string> = {
  producer: 'Producer',
  writer: 'Writer',
  artist: 'Concept Artist',
  director: 'Director',
  editor: 'Editor',
}

const SERVICES = [
  {
    icon: <Users className="size-6" />,
    title: 'AI Production Team',
    desc: 'Collaborate with specialized AI agents — Producer, Writer, Artist, Director, Editor.',
    image:
      'https://images.unsplash.com/photo-1770233621425-5d9ee7a0a700?auto=format&fit=crop&q=80&w=800',
  },
  {
    icon: <Camera className="size-6" />,
    title: 'AI Cinematography',
    desc: 'Real-time AI adjustments for 6-axis camera angles and cinematic lighting.',
    image:
      'https://images.unsplash.com/photo-1642286941365-89da3e29c0a2?auto=format&fit=crop&q=80&w=800',
  },
  {
    icon: <Video className="size-6" />,
    title: 'T2V & I2V Generation',
    desc: 'Text-to-Video and Image-to-Video powered by Kling, Hunyuan, and self-hosted models.',
    image:
      'https://images.unsplash.com/photo-1612180768015-56180b567352?auto=format&fit=crop&q=80&w=800',
  },
  {
    icon: <ShieldCheck className="size-6" />,
    title: 'Security Vault',
    desc: 'Isolated environment. Your creativity and IP are never used for external AI training.',
    image:
      'https://images.unsplash.com/photo-1687715997916-4030568eda97?auto=format&fit=crop&q=80&w=800',
  },
]

function formatDate(dateStr: string | null) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return d.toLocaleDateString()
}

function ProjectCard({
  project,
  onOpen,
  onRenamed,
}: {
  project: ProjectItem
  onOpen: (p: ProjectItem) => void
  onRenamed: (id: string, title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(project.title || 'Untitled')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSave = async () => {
    setEditing(false)
    const trimmed = title.trim() || 'Untitled'
    setTitle(trimmed)
    onRenamed(project.id, trimmed)
    await fetch(`/api/project/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: trimmed }),
    })
  }

  return (
    <div
      onClick={() => !editing && onOpen(project)}
      className="group flex cursor-pointer flex-col rounded-2xl border border-white/10 bg-white/5 p-6 text-left backdrop-blur-sm transition-all duration-300 hover:border-[#E50914]/50 hover:bg-white/10 hover:shadow-[0_10px_30px_rgba(229,9,20,0.1)]"
    >
      <div className="flex items-center justify-between">
        {editing ? (
          <input
            ref={inputRef}
            className="w-full rounded bg-white/10 px-2 py-1 text-lg font-semibold text-white outline-none focus:ring-1 focus:ring-[#E50914]"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') { setTitle(project.title || 'Untitled'); setEditing(false) }
            }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <h3 className="text-lg font-semibold text-white transition-colors group-hover:text-[#E50914]">
              {title}
            </h3>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setEditing(true)
              }}
              className="rounded p-1 text-gray-500 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
            >
              <Pencil className="size-3.5" />
            </button>
          </>
        )}
      </div>
      <div className="mt-4 flex items-center gap-3 text-xs text-gray-400">
        <span className="rounded-md bg-white/10 px-2.5 py-1 font-medium">
          {STAGE_LABELS[project.current_stage ?? 'producer'] ?? 'Producer'}
        </span>
        {project.updated_at && (
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {formatDate(project.updated_at)}
          </span>
        )}
      </div>
    </div>
  )
}

export default function HomePage() {
  const router = useRouter()
  const switchProject = useProjectStore((s) => s.switchProject)
  const createNewProject = useProjectStore((s) => s.createNewProject)

  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/project/list')
      .then((r) => r.json())
      .then((data) => setProjects(data.projects ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleOpen = (project: ProjectItem) => {
    const stage = project.current_stage ?? 'producer'
    switchProject(project.id, project.title, stage as StageId)
    router.push(`/studio/${stage}`)
  }

  const handleNew = async () => {
    setCreating(true)
    await createNewProject()
    router.push('/studio/producer')
  }

  const scrollToProjects = () => {
    document
      .getElementById('projects')
      ?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-white text-black selection:bg-[#E50914] selection:text-white">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 z-50 w-full bg-gradient-to-b from-black/80 to-transparent px-6 py-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="size-8 text-[#E50914]" />
            <span className="text-2xl font-bold tracking-tight text-white">
              Tale Studio
            </span>
          </div>
          <div className="hidden items-center gap-10 text-sm font-medium md:flex">
            <a
              href="#services"
              className="text-gray-300 transition-colors hover:text-[#E50914]"
            >
              Services
            </a>
            <a
              href="#projects"
              className="text-gray-300 transition-colors hover:text-[#E50914]"
            >
              Projects
            </a>
            <button
              onClick={handleNew}
              disabled={creating}
              className="rounded-full bg-white px-6 py-2.5 font-semibold text-black transition-all duration-300 hover:bg-[#E50914] hover:text-white hover:shadow-lg hover:shadow-[#E50914]/20"
            >
              {creating ? 'Creating...' : 'Get Started'}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black">
        {/* Background video */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-50 mix-blend-screen"
          poster="https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?auto=format&fit=crop&q=80&w=1080"
        >
          <source
            src="https://assets.mixkit.co/videos/preview/mixkit-network-of-connections-in-a-dark-background-22204-large.mp4"
            type="video/mp4"
          />
        </video>

        {/* Overlays */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black/80" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,black_100%)] opacity-60" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-48 w-full bg-gradient-to-t from-white via-white/80 to-transparent" />

        <div className="relative z-10 mx-auto max-w-5xl px-6 pt-24 text-center">
          {/* Badge */}
          <div className="mb-10 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium tracking-wide text-white backdrop-blur-md">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E50914] opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-[#E50914]" />
            </span>
            The Future of Filmmaking is Here
          </div>

          {/* Title */}
          <h1 className="mb-8 text-6xl font-semibold leading-[1.05] tracking-tighter text-white md:text-[5.5rem] lg:text-9xl">
            Create Beyond <br className="hidden md:block" />
            <span className="relative inline-block">
              <span className="relative z-10 bg-gradient-to-r from-[#E50914] via-red-500 to-orange-500 bg-clip-text text-transparent">
                Human Limits
              </span>
              <span className="pointer-events-none absolute -inset-2 z-0 animate-pulse rounded-full bg-[#E50914]/20 opacity-50 blur-2xl" />
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mb-14 max-w-3xl text-xl font-light leading-relaxed tracking-wide text-gray-300 md:text-2xl">
            Tale Studio redefines the production pipeline. Experience the
            perfect synergy of cinematic artistry and AI precision.
          </p>

          {/* CTA */}
          <div className="flex flex-col items-center justify-center gap-6 sm:flex-row">
            <button
              onClick={scrollToProjects}
              className="group relative inline-flex w-full items-center justify-center gap-3 overflow-hidden rounded-full bg-[#E50914] px-8 py-5 text-lg font-medium text-white transition-all duration-300 hover:bg-red-600 hover:shadow-[0_0_40px_rgba(229,9,20,0.4)] sm:w-auto"
            >
              <span className="relative z-10 flex items-center gap-2">
                View Projects
                <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </button>

            <button
              onClick={handleNew}
              disabled={creating}
              className="group inline-flex w-full items-center justify-center gap-3 rounded-full border border-white/20 bg-black/30 px-8 py-5 text-lg font-medium text-white backdrop-blur-sm transition-all duration-300 hover:border-white hover:bg-white hover:text-black hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] sm:w-auto"
            >
              <Sparkles className="size-5 transition-transform duration-300 group-hover:scale-110" />
              {creating ? 'Creating...' : 'Get Started'}
            </button>
          </div>
        </div>

        {/* Scroll indicator */}
        <div
          className="group absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 cursor-pointer flex-col items-center gap-3"
          onClick={scrollToProjects}
        >
          <span className="text-xs font-bold uppercase tracking-[0.3em] text-gray-400 transition-colors duration-300 group-hover:text-black">
            Scroll to explore
          </span>
          <div className="rounded-full border border-white/10 bg-white/10 p-2 backdrop-blur-sm transition-colors group-hover:border-black/10 group-hover:bg-black/5">
            <ChevronDown className="size-6 text-[#E50914]" />
          </div>
        </div>
      </section>

      {/* ── Services ── */}
      <section
        id="services"
        className="mx-auto max-w-7xl px-6 pb-32 pt-10 md:px-12"
      >
        <div className="mb-24 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-bold uppercase tracking-widest text-gray-600">
            <Sparkles className="size-3 text-[#E50914]" />
            Platform Capabilities
          </div>
          <h2 className="mb-8 text-5xl font-semibold tracking-tighter text-black md:text-6xl">
            Our Services
          </h2>
          <p className="mx-auto max-w-2xl text-lg font-light leading-relaxed text-gray-500 md:text-xl">
            Tale Studio transforms the traditional filmmaking process into an
            efficient, secure, and limitless AI-powered experience.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-12">
          {SERVICES.map((service) => (
            <div
              key={service.title}
              className="group relative aspect-[4/3] cursor-pointer overflow-hidden rounded-[2rem] bg-black shadow-sm transition-all duration-500 hover:shadow-[0_20px_40px_rgba(229,9,20,0.15)]"
            >
              <img
                src={service.image}
                alt={service.title}
                className="absolute inset-0 h-full w-full object-cover saturate-[1.2] transition-all duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent opacity-50" />
              <div className="absolute inset-0 bg-[#E50914]/10 opacity-0 mix-blend-overlay transition-opacity duration-700 group-hover:opacity-100" />

              {/* AI Active badge */}
              <div className="absolute right-6 top-6 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 opacity-0 backdrop-blur-md transition-all duration-500 group-hover:opacity-100">
                <div className="size-2 animate-pulse rounded-full bg-[#E50914]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white">
                  AI Active
                </span>
              </div>

              {/* Content */}
              <div className="absolute inset-0 z-20 flex flex-col justify-end p-8 text-white md:p-10">
                <div className="flex items-center gap-3 mb-4 text-[#E50914]">
                  <div className="rounded-lg border border-[#E50914]/30 bg-[#E50914]/20 p-2 backdrop-blur-sm">
                    {service.icon}
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest">
                    Tale AI
                  </span>
                </div>
                <h3 className="mb-3 text-2xl font-bold tracking-tight text-white md:text-3xl">
                  {service.title}
                </h3>
                <p className="line-clamp-2 text-sm font-light leading-relaxed text-gray-200 md:text-base">
                  {service.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Projects ── */}
      <section id="projects" className="bg-black px-6 py-24 md:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 flex items-center justify-between">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold uppercase tracking-widest text-gray-400">
                <Film className="size-3 text-[#E50914]" />
                Your Workspace
              </div>
              <h2 className="text-4xl font-semibold tracking-tighter text-white md:text-5xl">
                Projects
              </h2>
            </div>
            <button
              onClick={handleNew}
              disabled={creating}
              className="flex items-center gap-2 rounded-full bg-[#E50914] px-6 py-3 font-semibold text-white transition-all duration-300 hover:bg-red-600 hover:shadow-[0_0_30px_rgba(229,9,20,0.3)]"
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              New Project
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-gray-500" />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/10 py-20">
              <Film className="size-10 text-gray-600" />
              <p className="mt-4 text-sm text-gray-500">No projects yet</p>
              <button
                onClick={handleNew}
                disabled={creating}
                className="mt-6 flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-white transition-all hover:border-[#E50914] hover:text-[#E50914]"
              >
                <Plus className="size-4" />
                Create your first project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={handleOpen}
                  onRenamed={(id, title) =>
                    setProjects((prev) =>
                      prev.map((p) => (p.id === id ? { ...p, title } : p)),
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-black px-6 pb-12 pt-24 text-white md:px-12">
        <div className="mx-auto mb-20 grid max-w-7xl grid-cols-1 gap-12 md:grid-cols-4 md:gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="mb-6 flex items-center gap-2 text-white">
              <Film className="size-8 text-[#E50914]" />
              <span className="text-2xl font-medium tracking-tight">
                Tale Studio
              </span>
            </div>
            <p className="max-w-md font-light leading-relaxed text-gray-400">
              Pioneering the next era of cinematic storytelling through advanced
              artificial intelligence and human collaboration.
            </p>
          </div>

          <div>
            <h4 className="mb-6 font-semibold text-gray-200">Platform</h4>
            <ul className="space-y-4 font-light text-gray-400">
              <li>
                <a
                  href="#services"
                  className="transition-colors hover:text-[#E50914]"
                >
                  AI Production
                </a>
              </li>
              <li>
                <a
                  href="#services"
                  className="transition-colors hover:text-[#E50914]"
                >
                  Cinematography
                </a>
              </li>
              <li>
                <a
                  href="#services"
                  className="transition-colors hover:text-[#E50914]"
                >
                  Video Generation
                </a>
              </li>
              <li>
                <a
                  href="#services"
                  className="transition-colors hover:text-[#E50914]"
                >
                  Security
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-6 font-semibold text-gray-200">Studio</h4>
            <ul className="space-y-4 font-light text-gray-400">
              <li>
                <a
                  href="#projects"
                  className="transition-colors hover:text-[#E50914]"
                >
                  Projects
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="transition-colors hover:text-[#E50914]"
                >
                  About Us
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="transition-colors hover:text-[#E50914]"
                >
                  Careers
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="transition-colors hover:text-[#E50914]"
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-gray-800 pt-8 md:flex-row">
          <p className="text-sm font-light text-gray-500">
            &copy; {new Date().getFullYear()} Tale Studio. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm font-light text-gray-500">
            <a href="#" className="transition-colors hover:text-white">
              Privacy Policy
            </a>
            <a href="#" className="transition-colors hover:text-white">
              Terms of Service
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
