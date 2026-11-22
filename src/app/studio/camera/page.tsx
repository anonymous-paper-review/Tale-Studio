'use client'

// Camera(단계 id camera, 오너 2026-11-22 D2~D5) — Director 앞 새 탭. 위에 씬 단추, 아래에 그 씬의 샷이 세로로 서고
//   샷마다 실사 그림 · 영상 이력이 쌓인다(옛 Director 스토리보드 보기의 일). 데이터는 Director 와 같은 캔버스 상점이다.
//   조각 1(단계 등록): 화면 틀 · 위 막대 [다음: Director] · Storyboard → Camera 넘김 마무리 · 넘어가면서 이미지 만들기(D0) ·
//   영상 묶음 되살리기. 샷 줄 · 이력 줄 · 고치기 · 만들기 줄은 features/camera 의 다음 조각.
//   약속: tests/camera/stage.test.ts · handoff.test.ts · tests/writer/director-handover-images.test.ts
import { useEffect } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StageHelpBadge } from '@/components/stage-help-badge'
import { NextStepButton } from '@/components/handoff/next-step-button'
import { TopBarActions } from '@/components/layout/studio-top-bar'
import { STAGE_LABEL } from '@/lib/constants'
import { useT } from '@/lib/i18n'
import { takeImagesOnDirectorEntry } from '@/lib/director/entry-images-intent'
import { runRealBatch } from '@/lib/director/real-batch-client'
import { restoreVideoBatch } from '@/lib/director/video-batch-client'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterDirectorSync } from '@/features/director/hooks/use-writer-director-sync'
import { useQueueRehydrate } from '@/features/director/hooks/use-queue-rehydrate'
import { CameraBoard } from '@/features/camera/camera-board'
import { CameraShotDetailDialog } from '@/features/camera/shot-detail-dialog'

export default function CameraPage() {
  const t = useT()
  // Storyboard 에서 부탁한 넘김은 실제 Camera 화면이 붙은 뒤에만 끝났다고 알린다(라우터 요청이 아니라 이 화면의 mount 가 확인한다).
  const handoffProjectId = useProjectStore((s) => s.projectId)
  useEffect(() => {
    if (handoffProjectId) useGlobalChatStore.getState().confirmDirectorHandoff(handoffProjectId, '/studio/camera')
  }, [handoffProjectId])

  // ⤢ 상세는 이 화면의 창에서만 연다 — 다른 화면에서 열어 둔 상세가 들어오자마자 뜨지 않게, 떠날 때도 닫는다.
  useEffect(() => {
    useDirectorCanvasStore.getState().closeShotDetail()
    return () => useDirectorCanvasStore.getState().closeShotDetail()
  }, [])

  const projectId = useDirectorCanvasStore((s) => s.projectId)
  // 프로젝트 init(resetChildStores)이 끝난 뒤에만 시작한다 — 그 전에 시작한 일은 reset 에 지워진다.
  const stageReady = useProjectStore((s) => s.currentStage === 'camera' && !s.initLoading)

  // Writer 씬 · 샷 → 캔버스 노드(Director 와 같은 동기화) · 생성이 끝나면 바로 다시 읽기.
  useWriterDirectorSync()
  useQueueRehydrate(projectId && projectId !== 'default' ? projectId : null)

  // 영상 묶음 되살리기 — 탭을 닫았다 와도 서버 묶음의 차례 · 진행이 이어진다(Director 화면과 같은 길).
  useEffect(() => {
    if (!stageReady || !projectId || projectId === 'default') return
    const restore = () => {
      if (document.hidden) return
      void restoreVideoBatch(projectId).catch((error) => {
        console.error('[camera] video batch restore failed:', error)
      })
    }
    restore()
    document.addEventListener('visibilitychange', restore)
    return () => document.removeEventListener('visibilitychange', restore)
  }, [projectId, stageReady])

  // D0(디자이너 1110 확정 · 2026-11-14): Storyboard 넘기기 창에서 "넘어가면서 이미지 만들기"를 고르고 넘어온 경우에만 실사 일괄을 한 번 시작한다.
  //   들어오기만 해서는 만들지 않는다(8/27 #c5).
  useEffect(() => {
    if (!stageReady || !projectId || projectId === 'default') return
    if (takeImagesOnDirectorEntry(projectId)) void runRealBatch(projectId)
  }, [projectId, stageReady])

  return (
    <div className="flex flex-1 flex-col overflow-hidden pb-2">
      <TopBarActions>
        <NextStepButton />
      </TopBarActions>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-canvas-bg" data-testid="camera-page">
        <div className="flex shrink-0 items-center gap-2 px-4 pb-3 pt-4">
          <h1 className="shrink-0 text-[15px] font-bold text-foreground">{STAGE_LABEL.camera}</h1>
          <StageHelpBadge text={t("Make real images and videos shot by shot. Every image and video stays in the shot's history.")} />
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-4 pb-6">
            <CameraBoard />
          </div>
        </ScrollArea>
      </div>
      <CameraShotDetailDialog />
    </div>
  )
}
