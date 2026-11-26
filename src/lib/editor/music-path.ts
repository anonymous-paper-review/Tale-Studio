// Editor 음악 만들기 곡 파일 자리(2026-11-26 m1126 E1, 리드 승인) — {작업 공간}/{프로젝트}/editor/music/{곡}.mp3, 타이틀 그림 editor/title/ 옆.
//   새 보관함 파일은 이름 조각 규칙(storageKeySegment)을 쓴다. 마무리(finalize)가 무거운 목록 모듈을 끌어오지 않게 따로 둔다.
import { storageKeySegment } from '@/lib/storage/key-segment'

export function editorMusicPath(workspaceId: string, projectId: string, musicId: string): string {
  return `${storageKeySegment(workspaceId)}/${storageKeySegment(projectId)}/editor/music/${musicId}.mp3`
}
