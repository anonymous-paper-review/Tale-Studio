'use client'
// 로컬 검수 전용: 실제 채팅 컴포넌트에 실행/승인 대기 응답을 고정한다. 제품 경로에는 남기지 않는다.
import { useEffect, useState } from 'react'
import { GlobalChat } from '@/components/layout/global-chat'
import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { restartWriterStatus } from '@/lib/writer/use-writer-status'
import { domToPng } from 'modern-screenshot'
const pid = 'local-chat-harness-fixture'
export default function HarnessFixture() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!['localhost', '127.0.0.1'].includes(location.hostname)) return
    const original = window.fetch
    const assets = { images_ready: true, chars_ready: 1, chars_total: 1, worlds_ready: 1, worlds_total: 1, queued_count: 0, failed_count: 0 }
    const state = { mode: 'running', requests: [] as Array<{ url: string; method: string; body?: unknown }> }
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href)
      if (!url.pathname.startsWith('/api/') && !url.hostname.includes('supabase')) return original(input, init)
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
      state.requests.push({ url: url.pathname, method: init?.method ?? 'GET', body })
      let data: unknown = []
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (url.pathname === '/api/writer/chat') data = body.toolMessages?.length ? { reply: '현재 실행 중이며 씬 1개, 샷 2개가 저장되어 있습니다. 조회만 수행했습니다.', toolSupport: true } : { toolTurn: { stopReason: 'tool_use', content: [{ type: 'tool_use', id: 'status', name: 'project_workflow', input: { action: 'status' } }] } }
      else if (url.pathname.startsWith('/api/writer/status/')) data = { projectId: pid, started: true, pipeline_completed: false, pipeline_failed: false, current_stage: 'scenes', current_status: state.mode === 'gate' ? 'awaiting_confirmation' : 'running', progress_percent: 13, available: {}, assets }
      else if (url.pathname === '/api/generation/active') data = { data: { jobs: [], batches: [], completions: [] } }
      else if (url.pathname.endsWith('/rest/v1/projects')) data = { id: pid, current_stage: 'artist', producer_draft: null, story_text: '고정 이야기', settings: { dialogueLanguage: 'ko' }, style_anchor_key: 'watercolor' }
      else if (url.pathname.endsWith('/rest/v1/scenes') || url.pathname.endsWith('/rest/v1/shots')) { headers['content-range'] = `0-0/${url.pathname.endsWith('scenes') ? 1 : 2}`;data = [] }
      else if (url.pathname.includes('/auth/')) data = { user: null }
      else if (init?.method === 'POST' && /writer\/(?:start|resume|scene-gate)|generate/.test(url.pathname)) return Response.json({ error: 'generation excluded' }, { status: 403 })
      return new Response(init?.method === 'HEAD' ? null : JSON.stringify(data), { headers })
    }
    useLocaleStore.getState().setLocaleForDisplay('ko')
    project.setState({ projectId: pid, projectTitle: '채팅 하네스 브라우저 경계 검수', currentStage: 'writer', reachedStage: 'artist', artistImagesReady: true, writerComplete: false, writerActive: true, initLoading: false, projectLocale: 'ko', projectLocaleLocked: true })
    chat.getState().reset()
    const prepare = (mode: string) => {
      state.mode = mode; state.requests = []
      chat.getState().reset()
      if (mode === 'gate') chat.getState().offerSuggestion({ id: `scene-gate:${pid}`, stage: 'writer', dismissible: false, content: '씬 확인 대기 — 질문해도 확정 카드는 유지됩니다.', action: { kind: 'confirmScenes', label: '이대로 확정' } }, { preempt: true })
      restartWriterStatus(pid)
    }
    Object.assign(window, { __harness: { state, chat, project, prepare, capture: () => domToPng(document.body, { scale: 1 }) } })
    prepare('running'); setReady(true)
    return () => { window.fetch = original }
  }, [])
  return <main className="min-h-screen bg-background p-8 text-foreground"><h1>채팅 하네스 — 고정 상태 브라우저 검수</h1><p>실행·승인 대기를 고정한 실제 채팅 컴포넌트. 실제 생성·DB 저장 없음.</p>{ready && <GlobalChat />}</main>
}
