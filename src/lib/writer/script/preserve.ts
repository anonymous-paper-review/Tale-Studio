// 대본 보존(#script-preserve 2026-09-17) — 파싱한 대본(ScriptDocument)을 파이프라인 자료형(cast · scenes · dialogue track)으로
//   그대로 옮긴다. 원칙: 사람이 쓴 것(씬 순서·장소·시간·인물·대사·지문)은 원천이라 바꾸지 않고, 대본에 없어 새로 채운 칸
//   (씬 목적·감정 곡선·정보 비대칭·요약·길이)은 provenance.generated_fields 에 "추가됨"으로 남긴다(architecture.md 원천·파생 정합성).
//   LLM 은 여기 없다 — 주석기(annotator)는 주입받는다(annotateScriptScenes). 약속: tests/writer/script-preserve.test.ts
import { parseScript, type ScriptDocument, type ScriptElement, type ScriptScene } from './parse';
import type {
  CastContract,
  CastContractCharacter,
  DecoupagePlan,
  DialogueTrack,
  NarrativeStructure,
  PipelineInput,
  Scenes,
  SceneShotDialogue,
  ShotDialogueLine,
  StoryScene,
  VoiceProfile,
} from '@/lib/writer/types/pipeline';

/** 대본에 없어 코드/주석기가 채우는 칸 — provenance.generated_fields 에 항상 실린다. */
export const SCRIPT_GENERATED_FIELDS = ['purpose', 'emotion_beat', 'info_asymmetry', 'dialogue_summary', 'estimated_seconds'] as const;

const SECONDS_PER_DIALOGUE = 3;
const SECONDS_PER_ACTION = 4;
const MIN_SCENE_SECONDS = 8;

function roleFromDescription(desc: string | undefined): CastContractCharacter['role'] {
  const d = (desc ?? '').toLowerCase();
  if (/\b(lead role|leading role|protagonist|main character|hero(ine)?)\b|주인공|주연|주요 인물/.test(d)) return 'protagonist';
  if (/\b(antagonist|villain)\b|악역|적대자|악당/.test(d)) return 'antagonist';
  return 'supporting';
}

/** 인물 설정 + 큐에서 나온 인물 → producer 캐스트 계약. 새 인물을 만들지 않는다. */
export function castFromScript(doc: ScriptDocument): CastContract {
  return {
    characters: doc.characters.map((c) => ({
      character_id: c.id,
      name: c.name,
      entity_type: 'person',
      role: roleFromDescription(c.description),
      appearance: c.description ?? '',
    })),
  };
}

/** 대사 원소 → 비트 문장("이름: (지시) 대사") — 데쿠파주가 비트 인덱스로 샷을 나눌 때 화자가 보이게. */
function dialogueBeat(el: Extract<ScriptElement, { type: 'dialogue' }>): string {
  const par = el.parenthetical ? `(${el.parenthetical}) ` : '';
  return `${el.character}: ${par}${el.text.replace(/\s*\n\s*/g, ' ')}`;
}

function isBeatElement(el: ScriptElement): el is Extract<ScriptElement, { type: 'action' | 'dialogue' }> {
  return el.type === 'action' || el.type === 'dialogue';
}

function deliveryOf(el: Extract<ScriptElement, { type: 'dialogue' }>): string {
  return [el.extension, el.parenthetical].filter(Boolean).join(' / ');
}

function narrativeTimeOf(sc: ScriptScene): StoryScene['narrative_time'] {
  const h = `${sc.heading} ${sc.time_of_day ?? ''}`;
  if (/flashback|회상|과거/i.test(h)) return 'past';
  if (/flash[- ]?forward|미래/i.test(h)) return 'future';
  return 'present';
}

function estimateSeconds(sc: ScriptScene): number {
  const d = sc.elements.filter((e) => e.type === 'dialogue').length;
  const a = sc.elements.filter((e) => e.type === 'action').length;
  return Math.max(MIN_SCENE_SECONDS, d * SECONDS_PER_DIALOGUE + a * SECONDS_PER_ACTION);
}

/** 막 비율대로 씬을 막에 나눠 넣는다(누적 비율 경계). 구조가 없으면 전부 첫 막. */
function actRefs(count: number, structure?: NarrativeStructure | null): string[] {
  const acts = structure?.acts?.length ? structure.acts : [{ act_id: 'act_1', proportion: 1 }];
  const total = acts.reduce((a, x) => a + (x.proportion > 0 ? x.proportion : 0), 0) || 1;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const pos = (i + 0.5) / count; // 씬 중앙의 상대 위치
    let acc = 0;
    let ref = acts[acts.length - 1].act_id;
    for (const act of acts) {
      acc += (act.proportion > 0 ? act.proportion : 0) / total;
      if (pos <= acc) { ref = act.act_id; break; }
    }
    out.push(ref);
  }
  return out;
}

export interface ScenesFromScriptOptions {
  structure?: NarrativeStructure | null;
}

/** 대본 씬 → StoryScene[]. 순서·장소·시간·인물·비트(지문+대사)는 대본 그대로, 나머지 칸은 자리표시 + "추가됨" 표시. */
export function scenesFromScript(doc: ScriptDocument, opts: ScenesFromScriptOptions = {}): Scenes {
  const refs = actRefs(doc.scenes.length, opts.structure);
  const scenes: StoryScene[] = doc.scenes.map((sc, i) => {
    const beats = sc.elements.filter(isBeatElement).map((el) => (el.type === 'dialogue' ? dialogueBeat(el) : el.text));
    const directions = sc.elements.filter((e) => !isBeatElement(e)).map((e) => e.text);
    const dialogues = sc.elements.filter((e): e is Extract<ScriptElement, { type: 'dialogue' }> => e.type === 'dialogue');
    const location = sc.location || doc.front_matter.default_location || sc.heading;
    const time_of_day = sc.time_of_day ?? doc.front_matter.default_time ?? '';
    return {
      scene_id: sc.scene_id,
      act_ref: refs[i],
      location,
      time_of_day,
      narrative_time: narrativeTimeOf(sc),
      characters_in_scene: [...sc.characters],
      purpose: 'unknown',
      emotion_beat: { start: '', end: '' },
      dialogue_summary: '',
      key_dialogue: dialogues.slice(0, 3).map((d) => ({ character_id: d.character_id, line: d.text, delivery: deliveryOf(d) })),
      info_asymmetry: 'audience=character',
      estimated_seconds: estimateSeconds(sc),
      scene_actions: beats,
      provenance: { source: 'script', generated_fields: [...SCRIPT_GENERATED_FIELDS] },
      ...(directions.length ? { source_directions: directions } : {}),
    };
  });
  return {
    scenes,
    total_estimated_seconds: scenes.reduce((a, s) => a + s.estimated_seconds, 0),
    coverage_mode: 'honest',
  };
}

/** 대사 원소의 비트 인덱스(scene_actions 기준)와 원소를 짝지어 돌려준다. */
function dialogueBeats(sc: ScriptScene): Array<{ beat: number; el: Extract<ScriptElement, { type: 'dialogue' }> }> {
  const out: Array<{ beat: number; el: Extract<ScriptElement, { type: 'dialogue' }> }> = [];
  let beat = -1;
  for (const el of sc.elements) {
    if (!isBeatElement(el)) continue;
    beat++;
    if (el.type === 'dialogue') out.push({ beat, el });
  }
  return out;
}

/** 대본 대사 → 샷 대사 트랙. 비트를 덮는 샷에 싣고, 없으면 가장 가까운 앞 샷(그것도 없으면 씬 첫 샷). 대사는 한 글자도 바꾸지 않는다. */
export function dialogueTrackFromScript(doc: ScriptDocument, scenes: Scenes, decoupage: DecoupagePlan): DialogueTrack {
  const profiles: VoiceProfile[] = doc.characters.map((c) => {
    const examples = doc.scenes.flatMap((s) => s.elements).filter((e): e is Extract<ScriptElement, { type: 'dialogue' }> => e.type === 'dialogue' && e.character_id === c.id).slice(0, 2).map((e) => e.text);
    return {
      character_id: c.id,
      name: c.name,
      speech_style: '대본 원문 그대로(각색 없음)',
      formality: '',
      sentence_length: '',
      verbal_tics: [],
      emotional_expression: '',
      taboo: '대본에 없는 말을 지어내지 않는다',
      example_lines: examples,
    };
  });

  const out: SceneShotDialogue[] = [];
  for (const sc of doc.scenes) {
    const dec = decoupage.scenes.find((d) => d.scene_id === sc.scene_id);
    const shots = dec?.shots ?? [];
    const lines = new Map<string, ShotDialogueLine[]>(shots.map((s) => [s.shot_id, []]));
    const pick = (beat: number): string | null => {
      if (!shots.length) return null;
      const covering = shots.find((s) => s.source_beats.includes(beat));
      if (covering) return covering.shot_id;
      let best: { id: string; max: number } | null = null;
      for (const s of shots) {
        const mx = s.source_beats.length ? Math.max(...s.source_beats) : -1;
        if (mx < beat && (!best || mx > best.max)) best = { id: s.shot_id, max: mx };
      }
      return best?.id ?? shots[0].shot_id;
    };
    const orphan: ShotDialogueLine[] = [];
    for (const { beat, el } of dialogueBeats(sc)) {
      const line: ShotDialogueLine = { character_id: el.character_id, line: el.text, delivery: deliveryOf(el) };
      const id = pick(beat);
      if (id) lines.get(id)!.push(line);
      else orphan.push(line);
    }
    const shotDialogue = shots.map((s) => ({ shot_id: s.shot_id, dialogue: lines.get(s.shot_id) ?? [], narration: null as string | null }));
    if (orphan.length) shotDialogue.push({ shot_id: `${sc.scene_id}_unassigned`, dialogue: orphan, narration: null }); // 샷이 하나도 없는 씬 — 대사를 버리지 않는다
    out.push({ scene_id: sc.scene_id, shots: shotDialogue });
  }
  void scenes; // 씬 순서는 doc 과 같다(scenesFromScript 가 만든 것) — 시그니처는 상류 확정 결과를 받는 꼴로 둔다.
  return { profiles, scenes: out };
}

export type SceneAnnotation = Partial<Pick<StoryScene, 'purpose' | 'emotion_beat' | 'info_asymmetry' | 'dialogue_summary'>>;
export type SceneAnnotator = (scene: StoryScene, ctx: { index: number; total: number }) => Promise<SceneAnnotation>;

/** 주석기로 "추가됨" 칸만 채운다. 대본에서 온 칸은 건드리지 않고, 씬 하나가 실패해도 나머지는 채운다. */
export async function annotateScriptScenes(scenes: Scenes, annotate: SceneAnnotator): Promise<Scenes> {
  const total = scenes.scenes.length;
  const filled = await Promise.all(
    scenes.scenes.map(async (scene, index) => {
      try {
        const a = await annotate(scene, { index, total });
        const next: StoryScene = { ...scene };
        if (typeof a.purpose === 'string' && a.purpose.trim()) next.purpose = a.purpose.trim();
        if (a.emotion_beat && typeof a.emotion_beat.start === 'string' && typeof a.emotion_beat.end === 'string') next.emotion_beat = { start: a.emotion_beat.start, end: a.emotion_beat.end };
        if (typeof a.info_asymmetry === 'string' && a.info_asymmetry.trim()) next.info_asymmetry = a.info_asymmetry.trim();
        if (typeof a.dialogue_summary === 'string' && a.dialogue_summary.trim()) next.dialogue_summary = a.dialogue_summary.trim();
        return next;
      } catch {
        return scene; // 주석 실패 — 자리표시 값 유지(원문이 진실)
      }
    }),
  );
  return { ...scenes, scenes: filled };
}

// ── 캐스트 정합 + 입력에서 한 번에 얻기 ─────────────────────────────────────────

function normName(n: string): string {
  return n.replace(/\s+/g, ' ').trim().toUpperCase();
}
/** 같은 사람인가 — 같음 · 영어 첫/마지막 단어 · 한국어 성 뺀 이름(parse.ts sameName 과 같은 규칙). */
function sameCastName(a: string, b: string): boolean {
  const A = normName(a), B = normName(b);
  if (A === B) return true;
  const [short, long] = A.length <= B.length ? [A, B] : [B, A];
  if (/^[A-Z]/.test(short) && (long.split(' ')[0] === short || long.endsWith(' ' + short))) return true;
  if (/[가-힣]/.test(short) && short.length >= 2 && (long.endsWith(short) || long.startsWith(short + ' '))) return true;
  return false;
}

/**
 * producer 가 확정한 캐스트(슬러그가 DB 의 진실)가 있으면 대본의 인물 id 를 그 슬러그로 맞추고,
 * 캐스트에 없는 대본 인물은 뒤에 붙인다(append-only). 대사의 화자 id 도 함께 바뀐다 — 대사 텍스트는 불변.
 */
export function reconcileCastWithScript(doc: ScriptDocument, cast?: CastContract | null): { doc: ScriptDocument; cast: CastContract } {
  const base = cast?.characters?.length ? cast : castFromScript(doc);
  const idMap = new Map<string, string>();
  const appended: CastContractCharacter[] = [];
  for (const c of doc.characters) {
    const hit = base.characters.find((k) => sameCastName(k.name, c.name) || c.aliases.some((a) => sameCastName(k.name, a)));
    if (hit) idMap.set(c.id, hit.character_id);
    else if (!base.characters.some((k) => k.character_id === c.id)) {
      idMap.set(c.id, c.id);
      appended.push({ character_id: c.id, name: c.name, entity_type: 'person', role: roleFromDescription(c.description), appearance: c.description ?? '' });
    } else idMap.set(c.id, c.id);
  }
  const mapId = (id: string) => idMap.get(id) ?? id;
  const doc2: ScriptDocument = {
    ...doc,
    characters: doc.characters.map((c) => ({ ...c, id: mapId(c.id) })),
    scenes: doc.scenes.map((sc) => ({
      ...sc,
      characters: [...new Set(sc.characters.map(mapId))],
      elements: sc.elements.map((el) => (el.type === 'dialogue' ? { ...el, character_id: mapId(el.character_id) } : el)),
    })),
  };
  return { doc: doc2, cast: { ...base, characters: [...base.characters, ...appended] } };
}

/** 입력이 보존 모드이고 글이 대본이면 캐스트와 정합된 문서를 돌려준다. 아니면 null(종전 경로). */
export function preservedScript(input: Pick<PipelineInput, 'story' | 'preserveScript' | 'cast'>): { doc: ScriptDocument; cast: CastContract } | null {
  if (!input.preserveScript) return null;
  const doc = parseScript(input.story ?? '');
  if (!doc) return null;
  return reconcileCastWithScript(doc, input.cast ?? null);
}
