export type StageId = 'producer' | 'writer' | 'artist' | 'director' | 'editor'

export interface StageConfig {
  id: StageId
  name: string
  agent: string
  path: string
  handoffLabel: string
  nextStage: StageId | null
}

// 합집합 enum (producer-story-gate 결정 1): writer Genre.format 네이밍을 표준으로 채택 +
//   producer가 빠뜨렸던 정사각형(square_1:1) 추가. framing 의미를 라벨에 보존한다.
export type ProjectFormat =
  | 'horizontal_16:9'
  | 'vertical_9:16'
  | 'cinema_2.39:1'
  | 'square_1:1'

export interface ProjectSettings {
  playtime: number // seconds
  genre: string
  subGenre?: string
  format: ProjectFormat
  // 톤·목표감정은 본질적으로 다중값(어두움+긴장+쓸쓸함) → 태그 배열. 비면 writer에 빈 채로 전달(drop 원칙).
  tone: string[]
  targetEmotion: string[]
  dialogueLanguage: string // BCP-47 short code: 'en', 'ko', 'ja', 'zh', ...
}

// 비율 문자열은 저장하지 않고 format에서 파생한다 (architecture §0: 파생값 저장 금지).
//   생성 경로(fal aspect_ratio)·표시 라벨이 이 함수를 호출한다.
export function aspectRatioFromFormat(format: ProjectFormat): string {
  switch (format) {
    case 'horizontal_16:9':
      return '16:9'
    case 'vertical_9:16':
      return '9:16'
    case 'cinema_2.39:1':
      return '2.39:1'
    case 'square_1:1':
      return '1:1'
  }
}

export interface Project {
  id: string
  title: string
  storyText: string
  settings: ProjectSettings
  currentStage: StageId
  createdAt: string
  updatedAt: string
}
