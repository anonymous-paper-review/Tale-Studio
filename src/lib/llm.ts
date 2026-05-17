/**
 * LLM Abstraction Layer
 *
 * 2026-05-17 (F-7): Gemini → Claude 전환.
 * 6개 API 라우트(produce/chat, write/generate-scenes, write/chat,
 * director/chat, director/generate-shots, artist/chat)가 이 파일의
 * llmChat / llmJSON 을 사용. 모델 교체는 여기 re-export만 수정.
 *
 * 환경변수: `ANTHROPIC_API_KEY` (Anthropic SDK 기본).
 *
 * 향후 Agent SDK / tool-use 전환 시 `claude.ts` 에 tool loop 추가하거나
 * 별도 어댑터를 만들어 여기서 re-export 한다.
 */

export { claudeChat as llmChat, claudeJSON as llmJSON } from './claude'
