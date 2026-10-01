// 프로젝트 화면 포맷(2026-09-30) — Producer 에서 정한 projects.settings.format 의 화면 쪽 보관 장소(한 곳).
//   Director 의 이미지·영상 틀이 읽는다. 의존이 가벼워야 한다(화면 컴포넌트·테스트가 무거운 스토어를 끌고 오지 않게):
//   zustand 와 타입만 쓴다. 값은 project-store 가 프로젝트를 열 때, producer-store 가 설정을 저장할 때 채운다.
import { create } from 'zustand'
import type { ProjectFormat } from '@/types/project'

interface ProjectFormatState {
  /** null = 모름·미조회 → 화면은 종전 16:9 틀. */
  format: ProjectFormat | null
  setFormat: (format: ProjectFormat | null) => void
}

export const useProjectFormatStore = create<ProjectFormatState>((set) => ({
  format: null,
  setFormat: (format) => set({ format }),
}))
