// Découpage: 감독의 beat→shot 분해 (Director's authored shot breakdown)
//   linear_pipeline.md Turn 7 설계 구현. S3 비트(scene_actions)와 샷을 분리.
//   감독(LLM)이 4연산(derived/added/merged/split)으로 샷을 *저작*한다.
//   - 샷 개수는 연출적 결정 (shot_count_target은 힌트일 뿐)
//   - ADD: 스토리에 없는 establishing/reaction/insert/cutaway 추가 = 연출의 핵심
//   - 리듬 저작 (establish→develop→punctuate→breath) = "뇌 아픈 영상" 해독제
//   - 시간 제약은 persist 직전 결정론 재배분(duration_reallocation, 2~10초 밴드)이 수렴시킨다.
//
// 출력 DecoupagePlan은 V4 입력으로 사용됨 (V4가 각 샷에 3분할 spec을 붙임).
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import { DURATION_RUBRIC, SHOT_SECONDS_RANGE, SHOT_SECONDS_HARD_MAX } from '@/lib/writer/pipeline/physics';
import { COVERAGE_GRAMMAR, VISUAL_BEAT_DOCTRINE } from '@/lib/writer/pipeline/visual-doctrine';
import { REPRESENTATIVE_DEPTHS, REPRESENTATIVE_SHOT_CAP } from '@/lib/writer/pipeline/budget';
import { outputLanguageClause } from '@/lib/writer/pipeline/util/output-language';
import type {
  DecoupagePlan,
  DecoupageShot,
  WorldVisual,
  SceneCinematography,
  Genre,
  Characters,
  Scenes,
  StoryScene,
  SceneDecoupage,
} from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';
import type { AppLocale } from '@/lib/locale';

// == 카메라 규율 == 계약 (#camera-contract-relax 2026-08-11).
//
// **기본값이 relaxed-v3 로 승격됐다 (2026-08-11, 오너 결정).** 종전 기본(아래 LEGACY)은
//   `WRITER_CAMERA_CONTRACT=legacy` 로만 나온다. env 는 호출 시점에 읽는다(모듈 로드 시점 캡처
//   금지) — 팔 전환이 모듈 캐시에 갇히지 않게.
//
// 승격 근거 (실측, [[2026-08-10-prompt-contract-audit]]):
//   ① LEGACY 문구의 사유였던 "둥둥 떠다님"이 blind 9클립 재검증에서 **0/9 로 반증**됐다.
//      게다가 그 원관측(2026-06-04)은 motion-contract 배선(8/7) **이전** — 무빙 의도가 영상
//      모델에 전달되지도 않던 시절의 관측이라 사유 자체가 무효.
//   ② 역전 실측: LOCKED static 계약이 3/3 위반됐다(모델이 콘텐츠 동기화 무빙을 스스로 추가).
//      통제가 안 되는 쪽은 "무빙 개방"이 아니라 "고정 준수"다.
//   ③ 억압의 비대칭: 203샷에서 카메라 magnitude 'large' 2건(1%) vs **같은 프롬프트**의 캐릭터
//      'large' 13건 — 모델 능력이 아니라 카메라 어휘만 눌려 있었다.
//   ④ A/B 실측(camera-contract-relax-v3, 3회 비중첩): 모션 요구 비트 적중 28.4%→53.1%(+24.7%p),
//      **정적 비트 오발은 오히려 6.03%→4.63%(−1.4%p)**. "풀면 아무 데서나 움직인다"는 저점 보장
//      논리가 여기서 깨진다. 부작용 없음(샷 수 145→146.3, 길이 7.62→7.49s). 하류 v4 전달 100%.
//      사전 등록 기각①(무빙 총량 ≥1.5배)만 ×1.47 로 0.03 차 미발동 — 완화는 *양*이 아니라
//      *정확도*를 올렸고, 채택 근거는 후자다.
//
// ⚠️ 재현 주의: camera-contract-relax(-v2/-v3) 실험은 **대조군을 "env 미설정"으로 정의**했다.
//   기본값이 바뀌었으므로 그 실험을 재현하려면 대조군에 `WRITER_CAMERA_CONTRACT=legacy` 를
//   명시해야 한다. 미설정으로 돌리면 대조군이 아니라 완화군이 나온다.
const CAMERA_CONTRACT_LEGACY = `== 카메라 규율 ==
- camera_intent는 'static'이 기본. 'motivated_move'는 *감정적 동기*가 명확할 때만 쓰고 camera_move_motivation에 그 동기를 적는다.
- 이유 없는 카메라 무빙은 금지 (생성 영상이 "둥둥 떠다니며 집중 안 되는" 가장 큰 원인).`;

const CAMERA_CONTRACT_RELAXED = `== 카메라 규율 ==
- camera_intent는 기본값 없이 **이 샷의 내용이 요구하는가**로 정한다.
  · 피사체가 공간을 가로지르거나(질주·추격·퇴장·진입), 카메라가 무언가를 드러내야 하거나(발견·리빌),
    긴장이 물리적으로 조여야 할 때(push-in) → 'motivated_move'. 그 동기를 camera_move_motivation에 적는다.
  · 사건이 프레임 안에서 완결되는 샷(관조·대치·인서트·리액션) → 'static'.
- 금지되는 것은 무빙 자체가 아니라 **동기 없는 무빙**이다 — 내용과 무관하게 떠다니는 카메라를 쓰지 마라.
- 동기가 있으면 크기도 그 동기에 맞춰라: 질주를 최소 움직임으로 축소하지 마라.`;

const CAMERA_CONTRACT_RELAXED_V2 = `== 카메라 규율 ==
- camera_intent는 카메라가 실제로 움직여야 하는지로 정한다. 피사체가 움직이는 것과 카메라가 움직이는 것은 다르다.
  · 피사체가 고정 프레임을 가로질러 들어오거나 나가서 카메라가 따라가야 하거나,
    현재 프레임 밖의 공간을 보여주기 위해 구도를 다시 잡아야 하거나,
    물리적 규모·힘이 현재 프레임을 넘어올 때만 → 'motivated_move'.
    그 동기를 camera_move_motivation에 **카메라가 왜 움직여야 하는지**로 적는다.
  · 사건이 고정된 프레임 안에서 완결되면 → 'static'.
- 손발·시선·고개·표정·소품 조작·한두 걸음·대사·감정적 긴장·급한 행동만으로는 카메라를 움직이지 마라.
- 감정이 강하거나 인물이 서두른다는 이유만으로 push-in하지 마라.
- motion 비트와 static 비트를 하나의 샷에 합칠 때 static 비트는 카메라 이동의 근거가 아니다. 가능하면 split하라.
- 동기가 있으면 크기도 그 동기에 맞춰라: 질주를 최소 움직임으로 축소하지 마라.`;
const CAMERA_CONTRACT_RELAXED_V3 = `== 카메라 규율 ==
- 먼저 이 사건을 하나의 고정 프레임 안에서 완결할 수 있는지 판단한다. 피사체가 움직이는 것과 카메라가 움직이는 것은 다르다.
  · 손발·시선·고개·표정·소품 조작·대사·감정적 긴장·급한 행동·한두 걸음처럼
    중요한 사건이 같은 프레임 안에서 끝나면 → 'static'.
  · 피사체나 사건이 공간을 가로질러 진행되어 카메라가 따라가야 하거나,
    프레임 밖의 공간을 드러내거나, 움직임의 범위·규모·힘을 보여주려면 → 'motivated_move'.
    질주·추격·진입·퇴장·낙하·비산·군중·차량·파도·공간 리빌·긴장감 있는 돌리 인을 포함한다.
    그 동기를 camera_move_motivation에 **카메라가 왜 움직여야 하는지**로 적는다.
- 단 한 걸음·몸 돌림·손 뻗기·급한 행동은 전체 사건이 고정 프레임 안에 있으면 static이다.
- **예외(리빌)**: 시선·고개 돌림의 대상이 프레임 밖(다른 인물·공간)이면 그것은 리빌이다 —
  **기본은** 시선을 따라가는 팬·틸트·줌아웃(motivated_move, 동기="X의 시선을 따라 Y를 드러낸다").
  대상이 다른 공간일 때만 static 으로 두고 다음 샷을 reveal/pov 로 added 하라(#coverage-first).
  (실측: '눈을 뜨며 주위를 살핀다' → static → 두 수장 마스터 샷 점프 = 관객이 시선의 연결을 잃는다.)
- 감정이 강하거나 인물이 서두른다는 이유만으로 push-in하지 마라.
- motion 비트와 static 비트를 한 샷에 합칠 때 static 비트는 이동의 추가 근거가 아니다.
  두 비트의 카메라 처리가 다르면 가능하면 split하라.
- 동기가 있으면 크기도 그 동기에 맞춰라: 질주를 최소 움직임으로 축소하지 마라.`;

export function buildSystemInstruction(outputLocale?: AppLocale): string {
  const contract = process.env.WRITER_CAMERA_CONTRACT;
  // 기본 = relaxed-v3(채택본). 'legacy' 만 옛 문구로 되돌린다 — 되돌림 스위치는 남겨둔다
  //   (연출 방침 변경이라 관측이 나쁘면 즉시 원복할 수 있어야 한다).
  //   'relaxed'/'relaxed-v2' 는 과거 실험 팔 재현용으로 유지.
  const cameraContract =
    contract === 'legacy'
      ? CAMERA_CONTRACT_LEGACY
      : contract === 'relaxed-v2'
        ? CAMERA_CONTRACT_RELAXED_V2
        : contract === 'relaxed'
          ? CAMERA_CONTRACT_RELAXED
          : CAMERA_CONTRACT_RELAXED_V3;
  return `당신은 영화 감독이다. 한 씬의 내러티브 비트(scene_actions)를 받아 *데쿠파주(découpage)* — 샷 분해 — 를 저작한다.

== 핵심 원칙 ==
1. 비트 ≠ 샷. 비트는 "무슨 일이 일어나는가"(내러티브), 샷은 "어떻게 찍는가"(카메라). 한 비트를 여러 샷으로, 여러 비트를 한 샷으로 자유롭게 매핑한다.
2. 샷 개수는 네가 *연출적으로* 결정한다. shot_count_target은 참고용 힌트일 뿐 제약이 아니다. 필요하면 비트 수보다 많아도 된다.
3. 모든 비트를 커버하라. 의도적으로 생략(REMOVE)할 때만 uncovered_beats에 인덱스를 명시한다.

== 4가지 연산 (적극 사용) ==
- derived: 비트 1:1 매핑. source_beats=[해당 인덱스].
- added: 스토리에 *없는* 샷 추가. **이것이 연출의 본질이다.** source_beats=[]. added_rationale 필수.
  · establishing — 공간/스케일을 먼저 보여줘 관객을 오리엔트 (씬 첫머리 EWS/WS)
  · reaction — 대사/사건에 대한 인물의 반응 (CU). 시선 흐름을 잡고 감정을 전달
  · insert — 서사적으로 중요한 소품 디테일 (ECU). 예: 뽑히는 검, 빛나는 심장
  · cutaway — 긴장을 위한 시선 분산
- merged: 여러 비트를 한 롱테이크로. source_beats=[i,j,...]. 긴장/몰입/실시간감이 필요할 때.
- split: 한 비트를 여러 샷으로. 여러 출력 샷이 같은 source_beats=[i]를 공유. 커버리지/리듬/강조에.

${COVERAGE_GRAMMAR}

== 리듬 저작 (가장 중요 — "뇌가 아픈" 영상의 해독제) ==
- 모든 샷이 같은 길이·에너지면 안 된다. rhythm_role을 다양하게: establish(느림) → develop(중간) → punctuate(짧고 강함) → breath(정적 쉼).
- 감정 곡선에 컷 템포를 맞춘다: 긴장 고조 = accelerate(점점 짧은 컷), 여운/몰입 = sustain(긴 테이크).
- 정적 비트(breath 또는 static)를 반드시 1개 이상 배치한다 — 관객의 눈이 쉴 곳.

== 쇼트 사이즈 문법 ==
- establishing(EWS/WS) → 전개(MS/MFS) → 강조(CU/ECU)의 흐름. 같은 사이즈를 연속 배치하지 마라(시각 단조 = 집중 저하).

${cameraContract}

== 시간 제약 (validator) ==
- 각 샷 intended_duration_seconds는 ${SHOT_SECONDS_RANGE} (짧고 스냅있게). 1개 주요 액션이 들어맞는 길이. 긴 침묵 등 예외만 최대 ${SHOT_SECONDS_HARD_MAX}.
- ${DURATION_RUBRIC}
- 한 샷에 액션을 몰아넣지 마라. 액션이 크거나 여러 개면 split으로 나눠라.

${VISUAL_BEAT_DOCTRINE}

== 사건 접지 (#story-1 2026-08-31 오너 확정) ==
주요 사건(첫 만남·충돌·발견·죽음 같은 전환점)을 아무 맥락 없이 터뜨리지 마라 — 그 직전에
평상 상태를 보여주는 설정 비트(인파의 흐름, 공간의 표정, 인물의 일상 동작) 샷 1개를 선행시켜
사건이 "어디서 무엇을 깨고 일어나는지" 접지하라. 씬 첫 비트가 곧 사건이면 operation='added' 로
설정 샷을 삽입하고 added_rationale 에 사유를 적어라.
(실측 결함: 인파 소개 없이 두 주인공이 부딪히는 샷부터 시작해 만남이 뜬금없이 읽혔다.)${outputLanguageClause(outputLocale)}`;
}

// 씬 동시성 기본값(#concurrency-gap 2026-08-10). 종전엔 호출부가 `Number(env ?? '1') || 1` 로
//   넘겨 **프로덕션(env 미설정)에서 decoupage 가 동시성 1 = 순차**로 돌고 있었다(실측 ~262s).
//   v4_shots 와 같은 형태로 통일한다: 내부 기본 4 + 호출부는 미지정(undefined) → env 가 오버라이드.
const MAX_SCENE_CONCURRENCY = 12;
const DEFAULT_SCENE_CONCURRENCY = (() => {
  const raw = Number(process.env.WRITER_SCENE_CONCURRENCY);
  return Number.isFinite(raw) && raw >= 1 ? Math.min(Math.floor(raw), MAX_SCENE_CONCURRENCY) : 4;
})();

interface SceneDecoupageResponse {
  shot_count?: number;
  rhythm_profile?: string;
  uncovered_beats?: number[];
  shots: Omit<DecoupageShot, 'scene_id'>[];
}

function buildUserPrompt(
  scene: StoryScene,
  plan: SceneCinematography | null,
  genre: Genre,
  characters: Characters,
  worldVisual: WorldVisual,
  shotBudgetHint: number | null,
): string {
  const beatList = scene.scene_actions
    .map((a, i) => `  [${i}] ${a}`)
    .join('\n');

  // #p2-pacing 2026-08-04: "참고용 힌트 (제약 아님)" → 협상 규칙 승격. 힌트 시절 실측:
  //   타깃 5샷×6s 설계가 8샷 평균 3.2s 로 압착돼 인지 과부하 컷이 됐다 (lab/previz-quality §7).
  const planHint = plan
    ? `[sceneCinematography 비주얼 플랜 — 협상 규칙 (단순 힌트 아님)]
coverage_pattern=${plan.coverage_pattern}, shot_count_target=${plan.shot_count_target}, rhythm_profile=${plan.rhythm_profile}, cut_pace=${plan.cut_pace}, avg_shot_seconds=${plan.avg_shot_seconds}, lens=${plan.lens_vocabulary.join('/')}mm, energy=${plan.camera_energy}
- shot_count_target ±1 은 **비트 샷**(derived/merged/split)의 상한이다. **커버리지 샷**(added:
  reaction/reveal/pov/insert/cutaway, 각 2~3s)은 이 상한 밖이며 위 커버리지 문법이 요구하면 반드시
  추가한다 — 커버리지를 넣으려고 비트 샷을 병합하지 마라(#coverage-first 2026-09-02).
- avg_shot_seconds 는 시청자의 인지 예산이다. intended_duration_seconds 합이 estimated_seconds 를
  넘는 것은 허용된다(하류가 씬 길이를 증액한다) — 샷 수를 늘리려고 **비트 샷**을 짧게 압착하지 마라.
  (커버리지 샷은 단일 목적이라 짧아도 인지 부하가 아니다.)`
    : `[sceneCinematography 미제공 — Compact Mode. 데쿠파주를 자체 판단으로 저작]`;

  // 사이즈 사다리 규칙 — cine 플랜 유무와 무관한 일반 연출 문법 (급전환 45% 실측의 상류 방어).
  const ladderRule = `[샷 사이즈 연속성]
인접 샷의 shot_size 사다리(ECU-CU-MCU-MS-MFS-WS-EWS)에서 3단계 이상 점프는 인서트(ECU 소품 강조)나
POV 같은 명시적 동기 없이 금지 — 사이즈는 점진적으로 이동시켜 시청자의 공간 감각을 보존하라.`;

  // 대표 스토리보드 모드 (E3b 정책 — budget.ts): 장편은 전역 상한을 씬으로 배분한 예산 안에서 저작.
  const budgetHint = shotBudgetHint !== null
    ? `

[샷 예산 — 대표 스토리보드 모드 (장편 정책)]
이 프로젝트는 대표 샷 스토리보드로 제작된다 (전역 정책 상한 ~${REPRESENTATIVE_SHOT_CAP}샷). 이 씬은 **최대 ~${shotBudgetHint}샷**.
모든 비트 커버 원칙과 커버리지 문법(반응·리빌)은 대표 모드에서도 의무다 — 대표 모드의 절약은 **비트 샷**(비트를 대표 액션으로 압축)에서 하고, 커버리지 샷을 빼서 절약하지 마라(#coverage-first).`
    : '';

  return `[씬 정보]
scene_id=${scene.scene_id}, purpose=${scene.purpose}, location=${scene.location}, time=${scene.time_of_day}
감정 곡선: ${scene.emotion_beat.start} → ${scene.emotion_beat.end}
estimated_seconds=${scene.estimated_seconds}
info_asymmetry=${scene.info_asymmetry}
dialogue=${scene.dialogue_summary}
${scene.key_dialogue && scene.key_dialogue.length > 0 ? `key_dialogue=${JSON.stringify(scene.key_dialogue)}` : ''}

[내러티브 비트 (scene_actions) — 인덱스 주목]
${beatList}

${planHint}

${ladderRule}${budgetHint}

[genre 장르/톤]
genre=${genre.genre}, tone=${genre.tone.join('/')}, targetEmotion=${genre.targetEmotion.join('/')}

[등장 캐릭터]
${JSON.stringify(
  characters.characters
    .filter((c) => scene.characters_in_scene.includes(c.id))
    .map((c) => ({ id: c.id, role: c.role, personality: c.personality }))
)}

[로케이션 디자인]
${JSON.stringify(worldVisual.locations.filter((loc) => loc.id === scene.location || scene.location.includes(loc.id)))}

[출력 형식 - JSON]
{
  "shot_count": <샷 수>,
  "rhythm_profile": "이 씬의 정적/동적 에너지 곡선 1줄",
  "uncovered_beats": [],
  "shots": [
    {
      "shot_id": "shot_${scene.scene_id}_001",
      "operation": "derived" | "added" | "merged" | "split",
      "shot_function": "establishing" | "master" | "action" | "reaction" | "insert" | "cutaway" | "detail" | "pov" | "reveal" | "transition",
      "source_beats": [0],
      "added_rationale": "operation=added일 때만",
      "beat_summary": "이 샷이 담는 내용 (영어) — 아래 시각적 서술 원칙대로 가시적 행동·시선의 대상·몸의 전이를 명시",
      "beat_summary_native": "beat_summary와 같은 내용을 씬 텍스트(scene_actions)와 같은 언어로 — 연출 용어 없이 이야기 문장으로",
      "shot_size": "EWS" | "WS" | "FS" | "MFS" | "MS" | "MCU" | "CU" | "ECU" | "OTS" | "2S" | "POV",
      "intended_duration_seconds": 4,
      "rhythm_role": "establish" | "develop" | "punctuate" | "sustain" | "accelerate" | "breath",
      "camera_intent": "static" | "motivated_move",
      "camera_move_motivation": "motivated_move일 때만",
      "dramatic_purpose": "왜 이 샷인가"
    }
  ]
}`;
}

function coerceSceneShots(raw: unknown): SceneDecoupageResponse {
  // 모델 응답 shape 방어: { shots:[...] } | [...] | [{shots:[...]}]
  let obj: Record<string, unknown> | null = null;
  if (Array.isArray(raw)) {
    if (raw.length === 1 && raw[0] && typeof raw[0] === 'object' && 'shots' in (raw[0] as object)) {
      obj = raw[0] as Record<string, unknown>;
    } else if (raw.every((x) => x && typeof x === 'object' && 'operation' in (x as object))) {
      obj = { shots: raw };
    }
  } else if (raw && typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  }
  if (!obj || !Array.isArray(obj.shots)) {
    throw new Error(`Découpage unexpected shape: ${JSON.stringify(raw).slice(0, 200)}`);
  }
  return {
    shot_count: typeof obj.shot_count === 'number' ? obj.shot_count : undefined,
    rhythm_profile: typeof obj.rhythm_profile === 'string' ? obj.rhythm_profile : undefined,
    uncovered_beats: Array.isArray(obj.uncovered_beats) ? (obj.uncovered_beats as number[]) : [],
    shots: obj.shots as Omit<DecoupageShot, 'scene_id'>[],
  };
}

async function decoupageForScene(
  scene: StoryScene,
  plan: SceneCinematography | null,
  genre: Genre,
  characters: Characters,
  worldVisual: WorldVisual,
  shotBudgetHint: number | null,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
  outputLocale?: AppLocale,
): Promise<SceneDecoupage> {
  const userPrompt = buildUserPrompt(scene, plan, genre, characters, worldVisual, shotBudgetHint);

  const raw = await generateJson<unknown>(userPrompt, axisConfig, {
    systemInstruction: buildSystemInstruction(outputLocale),
    temperature: 0.7, // 연출 창의성 (V4보다 약간 높게)
  });

  await logger.saveLlmCall(`decoupage_${scene.scene_id}`, {
    prompt: userPrompt,
    response: JSON.stringify(raw, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  const parsed = coerceSceneShots(raw);

  // shot_id 표준화 + scene_id 주입
  const shots: DecoupageShot[] = parsed.shots.map((s, i) => {
    const sid = s.shot_id ?? `shot_${scene.scene_id}_${String(i + 1).padStart(3, '0')}`;
    return {
      ...s,
      shot_id: sid,
      scene_id: scene.scene_id,
      source_beats: Array.isArray(s.source_beats) ? s.source_beats : [],
    };
  });

  if (shots.length === 0) {
    throw new Error(`Découpage empty shots (scene=${scene.scene_id})`);
  }

  const beatCount = scene.scene_actions.length;
  return {
    scene_id: scene.scene_id,
    beat_count: beatCount,
    shot_count: shots.length,
    coverage_ratio: beatCount > 0 ? Number((shots.length / beatCount).toFixed(2)) : 0,
    rhythm_profile: parsed.rhythm_profile ?? '',
    uncovered_beats: parsed.uncovered_beats ?? [],
    shots,
  };
}

export interface DecoupageRunResult {
  /** false = 시간 예산으로 일부 씬만 처리 — 다음 step 인보케이션이 resume 으로 이어간다. */
  done: boolean;
  /** 완료 씬 누적 (원래 씬 순서). done=false 면 이대로 decoupagePartial 체크포인트가 된다. */
  scenes: SceneDecoupage[];
  /** done=true 일 때만 — 전역 재인덱싱까지 끝난 최종 플랜. */
  plan?: DecoupagePlan;
}

export async function runDecoupage(
  genre: Genre,
  characters: Characters,
  scenes: Scenes,
  worldVisual: WorldVisual,
  sceneCinematographyPlans: SceneCinematography[] | null,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
  opts?: {
    /** 이전 step 이 남긴 완료 씬 체크포인트 (#scene-checkpoint 2026-08-09, shotDesign 과 동일 계약). */
    resume?: SceneDecoupage[] | null;
    /** step 시간 예산 — 씬 하나를 끝낸 뒤 넘었으면 부분 반환. 미지정이면 전 씬 완주(로컬 러너). */
    softDeadlineMs?: number;
    /** 동시 처리 씬 수 (#scene-parallel 2026-08-09). 기본 1(순차). 씬들은 상호 독립이고
     *  전역 재인덱싱이 조립 단계라 순서 무관 — 단 한도(429)와 트레이드라 전역 방어 없이 크게 올리지 말 것. */
    concurrency?: number;
    /** #i18n-s5: 미지정(레거시)이면 systemInstruction 끝 절 미주입 — 종전 동작 그대로. */
    outputLocale?: AppLocale;
  },
): Promise<DecoupageRunResult> {
  const doneById = new Map((opts?.resume ?? []).map((sd) => [sd.scene_id, sd]));
  const softDeadlineMs = opts?.softDeadlineMs;
  const outputLocale = opts?.outputLocale;
  await logger.markStage('decoupage', 'started', {
    scene_count: scenes.scenes.length,
    resumed_scenes: doneById.size,
  });

  // 대표 스토리보드 모드 (E3b): 장편(D6~D7)은 전역 샷 상한을 씬 수로 배분해 씬당 예산 힌트로 준다.
  //   scenes.coverage_mode가 있으면 그것이 진실(코드 설정값), 없으면(구버전 산출) depth로 판정.
  const representative = scenes.coverage_mode
    ? scenes.coverage_mode === 'representative'
    : REPRESENTATIVE_DEPTHS.includes(genre.depth_level);
  const shotBudgetHint = representative
    ? Math.max(3, Math.round(REPRESENTATIVE_SHOT_CAP / Math.max(1, scenes.scenes.length)))
    : null;

  // 씬 처리 워커 풀 (#scene-checkpoint + #scene-parallel) — concurrency=1 이면 순차와 동일.
  //   예산 양보: 씬 수 × 씬당 수십 초가 한 인보케이션 예산을 구조적으로 초과해 재시도 3연속
  //   강제 종료로 run 이 죽던 사고(2026-08-06, 17씬)의 직접 처방. 새 씬 "착수 전"에 예산을
  //   검사하되 첫 착수는 무조건 허용한다 — 패스당 최소 1씬 진행 보장(v4_shots 관용구).
  //   씬 실패는 pass 를 죽이지 않는다: 성공분은 체크포인트로 보존되고 실패 씬은 다음 pass 가
  //   재시도한다. 진전이 0인 pass 에서만 throw — 무진전 반복은 attempt 상한(3)이 끊는다.
  const queue = scenes.scenes.filter((sc) => !doneById.has(sc.scene_id));
  const concurrency = Math.max(1, Math.floor(opts?.concurrency ?? DEFAULT_SCENE_CONCURRENCY));
  let launchedAny = false;
  let progressed = 0;
  // 씬 예상 시간 — 착수 게이트용. 관측되면 이 pass 의 최대 실측 ×1.25 로 갱신(보수적).
  //   v2x8 탐색 실측(2026-08-09): 사후 게이트만으론 동시성이 높을 때 큐가 데드라인 전에
  //   비어버려 게이트가 한 번도 안 걸리고 328s(>300s 하드킬)까지 밀렸다 — 착수 시점에
  //   "끝날 시간"을 예측해 막아야 in-flight 꼬리가 하드킬을 넘지 않는다.
  let estSceneMs = 45_000;
  const sceneErrors: unknown[] = [];
  const worker = async (): Promise<void> => {
    for (;;) {
      const overBudget =
        softDeadlineMs != null && Date.now() + (launchedAny ? estSceneMs : 0) > softDeadlineMs;
      if (overBudget && launchedAny) return;
      const scene = queue.shift();
      if (!scene) return;
      launchedAny = true;
      const plan = sceneCinematographyPlans?.find((p) => p.scene_id === scene.scene_id) ?? null;
      const sceneStartedMs = Date.now();
      try {
        const sceneDec = await decoupageForScene(scene, plan, genre, characters, worldVisual, shotBudgetHint, logger, axisConfig, outputLocale);
        doneById.set(scene.scene_id, sceneDec);
        progressed += 1;
        estSceneMs = Math.max(estSceneMs, Math.round((Date.now() - sceneStartedMs) * 1.25));
      } catch (e) {
        sceneErrors.push(e);
        console.error(
          `[decoupage] scene ${scene.scene_id} failed (checkpointing ${progressed} successes):`,
          e instanceof Error ? e.message : e,
        );
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (sceneErrors.length > 0 && progressed === 0) throw sceneErrors[0];

  const ordered = scenes.scenes
    .map((sc) => doneById.get(sc.scene_id))
    .filter((sd): sd is SceneDecoupage => sd !== undefined);
  if (ordered.length < scenes.scenes.length) {
    return { done: false, scenes: ordered };
  }

  // 전역 shot_id 재인덱싱 (씬 경계 넘어 순번) — 체크포인트에 저장된 씬-로컬 id 를 최종 조립에서
  //   통일한다. state 에 병합된 객체를 변형하지 않게 얕은 복제 후 재인덱싱.
  const sceneDecoupages = ordered.map((sd) => ({ ...sd }));
  let globalIdx = 0;
  for (const sd of sceneDecoupages) {
    sd.shots = sd.shots.map((shot) => {
      globalIdx += 1;
      return { ...shot, shot_id: `shot_${globalIdx}` };
    });
  }

  const allShots = sceneDecoupages.flatMap((s) => s.shots);
  const plan: DecoupagePlan = {
    scenes: sceneDecoupages,
    total_shots: allShots.length,
    total_added: allShots.filter((s) => s.operation === 'added').length,
    total_merged: allShots.filter((s) => s.operation === 'merged').length,
    total_split: allShots.filter((s) => s.operation === 'split').length,
    director_notes: sceneDecoupages.map((s) => `${s.scene_id}: ${s.beat_count}beats→${s.shot_count}shots (${s.rhythm_profile})`).join(' | '),
  };

  await logger.saveStage('10b_c_decoupage.json', plan);
  await logger.markStage('decoupage', 'completed', {
    total_shots: plan.total_shots,
    total_added: plan.total_added,
    total_merged: plan.total_merged,
    total_split: plan.total_split,
  });

  return { done: true, scenes: sceneDecoupages, plan };
}
