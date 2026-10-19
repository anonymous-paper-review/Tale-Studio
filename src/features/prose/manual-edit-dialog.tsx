'use client'

// 직접 작성 팝업(리뉴얼 1차 2026-10-19, 프로토타입 W5). 열려 있는 동안 에이전트 채팅은 잠긴다(sceneStoryEdit).
//   제목과 씬마다 글을 고친다. 저장하면 "다음 단계로 넘어갈까요?"를 묻는다(WP). 씬 더하기는 2차(지금 서버는 씬 수가 같아야 저장).
import { useEffect, useRef, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/lib/i18n'
import { createSceneStoryDraft, saveSceneStory, sceneStoryEdits, type SceneStoryDraft } from '@/lib/producer/scene-story-edit'
import type { WriterPreview } from '@/lib/writer/use-writer-preview'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'

interface Draft {
  projectId: string
  version: string
  storyVersion?: string
  title: string
  originalTitle: string
  scenes: SceneStoryDraft[]
}

export function ManualEditDialog({ preview, enabled }: { preview: WriterPreview | null; enabled: boolean }) {
  const t = useT()
  const projectId = useProjectStore((s) => s.projectId)
  const projectTitle = useProjectStore((s) => s.projectTitle)
  const session = useGlobalChatStore((s) => s.sceneStoryEdit)
  const edit = session?.projectId === projectId ? session : null
  const manualRequest = useWriterRoomStore((s) => s.manualRequest)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const handled = useRef(manualRequest)

  const open = () => {
    if (!enabled || !projectId || !preview?.updatedAt || !useGlobalChatStore.getState().beginSceneStoryEdit('manual')) return
    setSaveError(null)
    const title = projectTitle === 'Untitled' ? '' : projectTitle
    setDraft({ projectId, version: preview.updatedAt, storyVersion: preview.storyVersion, title, originalTitle: title, scenes: createSceneStoryDraft(preview.scenes, preview.roster) })
  }

  // 버튼 · 채팅 카드 · "직접 고치기" 어디서 눌러도 같은 팝업을 연다.
  useEffect(() => {
    if (manualRequest === handled.current) return
    handled.current = manualRequest
    open()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualRequest])

  // 화면을 떠나면 채팅 잠금을 푼다.
  useEffect(() => () => {
    const chat = useGlobalChatStore.getState()
    if (chat.sceneStoryEdit?.projectId === projectId && !chat.sceneStoryEdit.busy) chat.endSceneStoryEdit()
  }, [projectId])

  const close = () => {
    if (useGlobalChatStore.getState().sceneStoryEdit?.busy) return
    useGlobalChatStore.getState().endSceneStoryEdit()
    setDraft(null)
    setSaveError(null)
  }

  const changed = !!draft && (draft.title.trim() !== draft.originalTitle.trim() || draft.scenes.some((scene) => scene.text !== scene.originalText))
  const save = async () => {
    if (!draft || draft.projectId !== projectId || edit?.mode !== 'manual' || edit.busy) return
    const chat = useGlobalChatStore.getState()
    chat.setSceneStoryEditBusy(true)
    const savingSession = useGlobalChatStore.getState().sceneStoryEdit
    setSaveError(null)
    const scenesChanged = draft.scenes.some((scene) => scene.text !== scene.originalText)
    const result = scenesChanged
      ? await saveSceneStory(draft.projectId, draft.version, sceneStoryEdits(draft.scenes), draft.storyVersion)
      : { ok: true as const }
    if (useProjectStore.getState().projectId !== draft.projectId || useGlobalChatStore.getState().sceneStoryEdit !== savingSession) return
    chat.setSceneStoryEditBusy(false)
    if (!result.ok) {
      setSaveError(t(result.reason === 'conflict'
        ? 'The prose changed while you were editing. Copy your changes, close this window, and open the latest prose.'
        : 'Could not save the prose. Your changes are still here. Please try again.'))
      return
    }
    const title = draft.title.trim()
    if (title && title !== draft.originalTitle.trim()) await useProjectStore.getState().renameProject(title)
    chat.refreshSceneStory()
    close()
    toast.success(t('Saved the prose you edited.'))
    // 프로토타입 WP — 고친 걸 저장하면 다음 단계로 넘어갈지 묻는다.
    useGlobalChatStore.getState().offerWriterNext('ask')
  }

  return (
    <Dialog open={edit?.mode === 'manual' && draft?.projectId === projectId} onOpenChange={(next) => { if (!next) close() }}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl" showCloseButton={!edit?.busy} onInteractOutside={(event) => event.preventDefault()} data-testid="prose-manual-edit">
        <DialogHeader>
          <DialogTitle>{t('Write directly')}</DialogTitle>
          <DialogDescription>{t('While this window is open, the agent chat is locked. Nothing changes until you save.')}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-5 overflow-y-auto py-2">
          <div className="space-y-2">
            <label htmlFor="prose-edit-title" className="text-xs font-medium text-muted-foreground">{t('Title')}</label>
            <Input
              id="prose-edit-title"
              value={draft?.title ?? ''}
              disabled={edit?.busy}
              onChange={(event) => setDraft((current) => current && ({ ...current, title: event.target.value }))}
            />
          </div>
          {draft?.scenes.map((scene, index) => (
            <div key={scene.sceneId} className="space-y-2">
              <label htmlFor={`prose-edit-${index}`} className="font-mono text-xs font-medium text-muted-foreground">S{index + 1}</label>
              <Textarea
                id={`prose-edit-${index}`}
                value={scene.text}
                disabled={edit?.busy}
                rows={Math.min(10, Math.max(3, scene.text.split('\n').length * 2))}
                className="resize-y text-sm leading-7"
                onChange={(event) => setDraft((current) => current && ({ ...current, scenes: current.scenes.map((item, i) => i === index ? { ...item, text: event.target.value } : item) }))}
              />
            </div>
          ))}
        </div>
        {saveError ? <p role="alert" className="text-sm text-destructive">{saveError}</p> : null}
        <DialogFooter className="border-t border-border pt-4">
          <Button variant="outline" disabled={edit?.busy} onClick={close}>{t('Cancel')}</Button>
          <Button onClick={() => void save()} disabled={edit?.busy || !draft?.scenes.length || draft.scenes.some((scene) => !scene.text.trim()) || !changed} data-testid="prose-manual-save">
            {edit?.busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {t(edit?.busy ? 'Saving…' : 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
