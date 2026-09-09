import type { GenerationJobReceipt } from '@/lib/generation-jobs-client'

export type VideoBatchStatus = 'running' | 'cancelled' | 'completed' | 'paused'

/** #batch-resume: 화면 숫자는 저장한 항목과 작업의 상태에서 계산한다. */
export interface VideoBatchSummary {
  id: string
  projectId: string
  status: VideoBatchStatus
  total: number
  /** 접수된 뒤 실패한 영상도 포함한다. */
  started: number
  /** 제공 업체에 접수되기 전에 실패한 항목 수. */
  failedToStart: number
  done: number
  failed: number
  pending: number
  active: number
  stopReason: string | null
  jobs: GenerationJobReceipt[]
}

export interface VideoBatchStartRequest {
  batchId: string
  projectId: string
  items: Array<{ shotId: string; request: Record<string, unknown> }>
}

export interface VideoBatchStartResponse {
  batch: VideoBatchSummary
  skipped: Array<{ shotId: string; reason: string }>
}
