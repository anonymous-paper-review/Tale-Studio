// 구조가 맞는 이야기라도 모르는 참조와 문장 속 식별자·명백한 언어 불일치를 별도로 검사한다.
import type { AppLocale } from '@/lib/locale'
import { detectLocaleFromText } from '@/lib/locale'
import type { PipelineLogger } from '@/lib/writer/logger'
import type { BackgroundContract, Characters, Scenes } from '@/lib/writer/types/pipeline'

export interface SceneContentIssue {
  code: 'unknown_character' | 'unknown_location' | 'unresolved_identifier' | 'output_language'
  path: string
  value: string
}

// 영어 고유명사·일반 영어 문장을 금지하지 않는다. 번호식 또는 snake_case 내부 표기만 식별한다.
const INTERNAL_TOKEN = /(?<![A-Za-z0-9_])(?:char(?:acter)?_?\d+|loc(?:ation)?_?\d+|[a-z][a-z0-9]*(?:_[a-z0-9]+)+)(?![A-Za-z0-9_])/gi

export function validateSceneContent(scenes: Scenes, characters: Characters, world?: BackgroundContract, locale?: AppLocale): SceneContentIssue[] {
  const issues: SceneContentIssue[] = []
  const cast = [...characters.characters, ...(scenes.new_characters ?? [])]
  const characterIds = new Set(cast.map((c) => c.id))
  const locationIds = new Set((world?.locations ?? []).flatMap((l) => [l.id, l.name]))
  const displayNames = new Set([...cast, ...(world?.locations ?? [])].map((e) => e.name))
  for (const [index, scene] of scenes.scenes.entries()) {
    const path = `scenes.${index}`
    for (const [j, id] of (scene.characters_in_scene ?? []).entries()) {
      if (!characterIds.has(id)) issues.push({ code: 'unknown_character', path: `${path}.characters_in_scene.${j}`, value: id })
    }
    for (const [j, dialogue] of (scene.key_dialogue ?? []).entries()) {
      if (!characterIds.has(dialogue.character_id)) issues.push({ code: 'unknown_character', path: `${path}.key_dialogue.${j}.character_id`, value: dialogue.character_id })
    }
    // 짧고 구체적인 새 장소명은 기존 오픈 월드 계약으로 허용한다. 미등록 내부 표기는 별도 오류다.
    if (!locationIds.has(scene.location) && scene.location.match(INTERNAL_TOKEN)) {
      issues.push({ code: 'unknown_location', path: `${path}.location`, value: scene.location })
    }
    const prose: Array<[string, string]> = [
      ...(scene.scene_actions ?? []).map((text, j): [string, string] => [`scene_actions.${j}`, text]),
      ['dialogue_summary', scene.dialogue_summary ?? ''],
      ...(scene.key_dialogue ?? []).flatMap((d, j): Array<[string, string]> => [[`key_dialogue.${j}.line`, d.line], [`key_dialogue.${j}.delivery`, d.delivery]]),
    ]
    for (const [field, text] of prose) {
      for (const token of text.match(INTERNAL_TOKEN) ?? []) {
        if (!displayNames.has(token)) issues.push({ code: 'unresolved_identifier', path: `${path}.${field}`, value: token })
      }
      // 대사 언어는 별도 설정이다. 언어 판정은 서사 비트에만 적용하고 고유명사는 제외한다.
      if (!locale || !field.startsWith('scene_actions.')) continue
      let narrative = text
      for (const name of [...displayNames].sort((a, b) => b.length - a.length)) {
        if (name) narrative = narrative.split(name).join('')
      }
      // 공용 감지기는 한글 이외를 en으로 분류한다. 여기서는 일본어/한자 서사가
      // 문자 검사 자체를 건너뛰거나 영어로 통과하는 명백한 불일치만 함께 막는다.
      const nonEnglishScript = locale === 'en'
        && /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(narrative)
        && !/\p{Script=Latin}/u.test(narrative)
      if (/\p{L}/u.test(narrative) && (detectLocaleFromText(narrative) !== locale || nonEnglishScript)) {
        issues.push({ code: 'output_language', path: `${path}.${field}`, value: text })
      }
    }
  }
  return issues
}

export async function assertSceneContent(scenes: Scenes, characters: Characters, world: BackgroundContract | undefined, locale: AppLocale | undefined, logger: PipelineLogger, stage: string): Promise<void> {
  const issues = validateSceneContent(scenes, characters, world, locale)
  if (!issues.length) return
  await logger.markStage(stage, 'failed', { validation_issues: issues })
  throw new Error(`이야기 검증 실패: ${issues.map((i) => `${i.code} (${i.path}: ${i.value})`).join(' | ')}`)
}
