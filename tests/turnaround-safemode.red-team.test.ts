import { describe, expect, it } from 'vitest'
import {
  buildCharacterMainPrompt,
  buildCharacterViewPrompt,
  type CharacterPromptInput,
} from '@/lib/artist/turnaround'

const SAFE_TOKENS =
  'depicted as an adult, age-ambiguous, stylized non-graphic illustration, tasteful, safe-for-work'
const VIEWS = ['back', 'sideLeft', 'sideRight'] as const

describe('turnaround safe-mode red-team', () => {
  it('keeps safeMode:false byte-identical to omitted across varied inputs', () => {
    const cases: CharacterPromptInput[] = [
      {
        name: '빈 캐릭터',
        appearance: '',
        costumes: [],
      },
      {
        name: '소녀',
        appearance: '17세처럼 보인다는 원문, 피부 질감, 공피 장식, childish grin, kidney-shaped charm',
        age: '17',
        role: 'lead girl',
        costumes: ['blocked-pattern coat', 'skin-tone boots'],
        artStyle: 'watercolor_skin_detail',
        shapeLanguage: 'round',
        palette: ['피부색', '#B22222'],
      },
      {
        name: 'Unicode 🧬 캐릭터',
        appearance: '긴 머리와 유니코드 문양 🌕🌘, blood와 child 원문도 off에서는 유지',
        role: 'side character',
        costumes: undefined,
        artStyle: '라인아트_少女',
        palette: ['🔵', '살구색'],
        delta: 'keep original silhouette, no crop',
      },
    ]

    for (const input of cases) {
      expect(buildCharacterMainPrompt({ ...input, safeMode: false })).toBe(
        buildCharacterMainPrompt(input),
      )

      for (const view of VIEWS) {
        expect(buildCharacterViewPrompt({ ...input, safeMode: false }, view)).toBe(
          buildCharacterViewPrompt(input, view),
        )
      }
    }
  })

  it('preserves gender nouns, skin words, art style, and English partial matches in safeMode', () => {
    const out = buildCharacterMainPrompt({
      name: '소녀',
      appearance:
        '소녀 girl with porcelain 피부 and skin glow, childish grin, kidney-shaped charm, blocked cloak, 공피 실험 문양',
      costumes: ['girl silhouette coat with skin-tone lining and 공피 장식'],
      artStyle: 'anime_skin_art_style',
      shapeLanguage: 'soft_round',
      palette: ['피부색', '#FFF0F0'],
      safeMode: true,
    })

    expect(out).toContain(SAFE_TOKENS)
    expect(out).toContain('소녀')
    expect(out).toContain('girl')
    expect(out).toContain('피부')
    expect(out).toContain('skin glow')
    expect(out).toContain('skin-tone')
    expect(out).toContain('childish')
    expect(out).toContain('kidney-shaped')
    expect(out).toContain('blocked')
    expect(out).toContain('공피')
    expect(out).toContain('art style: anime_skin_art_style')
    expect(out).toContain('shape language: soft_round')
    expect(out).toContain('palette: 피부색, #FFF0F0')
  })

  it('removes supported explicit minor and graphic tokens from appearance and costumes', () => {
    const out = buildCharacterMainPrompt({
      name: '테스트 캐릭터',
      appearance:
        '10대 후반 십대 유아 미성년자 초등학생 child children kid kids toddler toddlers infant infants minor minors underage ' +
        '유혈 혈흔 선혈 피범벅 피투성이 낭자 상처 훼손 시체 시신 사체 고문 학살 절단 blood bloody bloodied gore gory wound wounds wounded mutilated corpse corpses dismembered gruesome viscera ' +
        '소녀 피부 skin',
      age: '11',
      role: 'protagonist',
      costumes: ['kid cape with bloodied hem', 'children robe with wounds and gore'],
      safeMode: true,
    })

    expect(out).toContain(SAFE_TOKENS)
    expect(out).not.toContain('age 11')
    expect(out).not.toMatch(
      /10대|십\s*대|유아|미성년자?|초등학생|\bchild(?:ren)?\b|\bkids?\b|\btoddlers?\b|\binfants?\b|\bminors?\b|\bunderage\b|유혈|혈흔|선혈|피범벅|피투성이|낭자|상처|훼손|시체|시신|사체|고문|학살|절단|\bblood(?:y|stained|ied)?\b|\bgore\b|\bgory\b|\bwounds?\b|\bwounded\b|\bmutilat\w*|\bcorpses?\b|\bdismember\w*|\bgruesome\b|\bviscera\w*/i,
    )
    expect(out).toContain('소녀')
    expect(out).toContain('피부')
    expect(out).toContain('skin')
  })

  it('applies safeMode scrubbing to every directional view while preserving reference invariants', () => {
    const input: CharacterPromptInput = {
      name: 'View 캐릭터',
      appearance: '15-year-old child with blood and gore, girl with skin texture',
      costumes: ['toddler cloak', 'gory mask'],
      safeMode: true,
    }

    for (const view of VIEWS) {
      const out = buildCharacterViewPrompt(input, view)
      expect(out).toContain(SAFE_TOKENS)
      expect(out).toContain('The same character as the reference image')
      expect(out).toContain('identical character, identical outfit')
      expect(out).toContain('girl')
      expect(out).toContain('skin texture')
      expect(out).not.toMatch(/\b15[-\s]?year[-\s]?old\b|\bchild\b|\btoddler\b|\bblood\b|\bgore\b|\bgory\b/i)
    }
  })

  it('scrubs Korean numeric ages and standalone 어린 without over-scrubbing 어린이날', () => {
    const out = buildCharacterMainPrompt({
      name: '경계 캐릭터',
      appearance: '12살 8세 어린 소녀, 어린이날 꽃장식과 피부',
      costumes: ['7살 리본', '어린 망토', '어린이날 배지'],
      safeMode: true,
    })

    expect(out).not.toContain('12살')
    expect(out).not.toContain('8세')
    expect(out).not.toContain('7살')
    expect(out).not.toMatch(/(?:^|[\s,.])어린(?:[\s,.]|$)/u)
    expect(out).toContain('어린이날')
    expect(out).toContain('소녀')
    expect(out).toContain('피부')
  })

  it('handles empty, unicode, and long strings stably under safeMode', () => {
    const longAppearance = `${'피부 '.repeat(80)}${'blood child 유혈 10대 '.repeat(80)}${'🌕'.repeat(80)}`
    const longCostume = `${'피부'.repeat(80)} ${'gore '.repeat(80)}`

    const out = buildCharacterMainPrompt({
      name: '긴문자열🌕',
      appearance: longAppearance,
      costumes: ['', longCostume],
      artStyle: '유니코드_스타일_피부',
      palette: ['살구색', '🔵'],
      safeMode: true,
    })

    expect(out.length).toBeLessThanOrEqual(900)
    expect(out).toContain('Character reference portrait of 긴문자열🌕')
    expect(out).toContain('피부')
    expect(out).not.toMatch(/\bblood\b|\bchild\b|유혈|10대|\bgore\b/i)

    const empty = buildCharacterMainPrompt({
      name: '빈값',
      appearance: '',
      costumes: [],
      safeMode: true,
    })

    expect(empty).toContain(SAFE_TOKENS)
    expect(empty).not.toMatch(/\.\s\./)
  })
})
