// R 규칙 validator — B안에서 R1(그룹 내 카메라 상태 변화 금지)은 타입 구조상 위반 불가능하므로
// 검사 대상이 아니다 (그게 B안의 요점). 여기서는 나머지: 스키마, V2, V3, VB, VS, V4.
import type {
  ActorMagnitude, DbShot, MotionUnit, SceneMotionPlan, ShotMotionPlan, ShotScore, Violation,
} from './types.ts';
import { unitBudget } from './prompt.ts';

const ACTOR_MAGS: ActorMagnitude[] = ['micro', 'small', 'medium', 'large'];
const CAM_TYPES = ['static', 'pan', 'tilt', 'dolly_in', 'dolly_out', 'tracking', 'crane', 'handheld_drift', 'rack_focus'];
const CAM_MAGS = ['minimal', 'moderate', 'large'];
const SPEEDS = ['slow', 'medium', 'fast'];
const COUPLINGS = ['track_subject', 'hold', 'reveal', 'counter'];
const INTENT_TAGS = ['disorientation', 'dread', 'reveal', 'pov_unstable'];
const PHASES = ['wind_up', 'contact', 'follow_through'];
const TRANSITIONS = ['cut', 'match_cut', 'fade', 'dissolve'];

function magRank(m: ActorMagnitude): number {
  return ACTOR_MAGS.indexOf(m);
}

/** LLM 출력(unknown)을 SceneMotionPlan으로 정규화하면서 구조 위반을 수집. 진행 불가면 throw. */
export function normalizePlan(raw: unknown, expectedSceneId: string): { plan: SceneMotionPlan; violations: Violation[] } {
  const v: Violation[] = [];
  const root = raw as Record<string, unknown>;
  if (!root || typeof root !== 'object' || !Array.isArray(root.shots)) {
    throw new Error('루트가 {scene_id, shots[]} 형태가 아님');
  }
  const sceneId = typeof root.scene_id === 'string' ? root.scene_id : expectedSceneId;
  if (sceneId !== expectedSceneId) {
    v.push({ rule: 'SCHEMA', shot_id: '(scene)', severity: 'warn', detail: `scene_id 불일치: ${sceneId} ≠ ${expectedSceneId}` });
  }

  const shots: ShotMotionPlan[] = [];
  for (const s of root.shots as Array<Record<string, unknown>>) {
    const shotId = typeof s.shot_id === 'string' ? s.shot_id : '(missing)';
    const units: MotionUnit[] = [];
    const rawUnits = Array.isArray(s.units) ? (s.units as Array<Record<string, unknown>>) : [];
    if (!Array.isArray(s.units) || rawUnits.length === 0) {
      v.push({ rule: 'SCHEMA', shot_id: shotId, severity: 'fail', detail: 'units 배열 없음/빈 배열' });
    }
    for (const u of rawUnits) {
      const gid = typeof u.group_id === 'string' ? u.group_id : '(missing)';
      const cam = (u.camera_state ?? {}) as Record<string, unknown>;
      const check = (cond: boolean, detail: string) => {
        if (!cond) v.push({ rule: 'SCHEMA', shot_id: shotId, group_id: gid, severity: 'fail', detail });
      };
      check(typeof u.group_id === 'string' && u.group_id.length > 0, 'group_id 누락');
      check(typeof u.intent === 'string' && u.intent.length > 0, 'intent 누락');
      check(typeof u.duration_share === 'number' && u.duration_share > 0 && u.duration_share <= 1, `duration_share 비정상: ${String(u.duration_share)}`);
      check(CAM_TYPES.includes(String(cam.type)), `camera_state.type 비정상: ${String(cam.type)}`);
      check(SPEEDS.includes(String(cam.speed)), `camera_state.speed 비정상: ${String(cam.speed)}`);
      check(CAM_MAGS.includes(String(cam.magnitude)), `camera_state.magnitude 비정상: ${String(cam.magnitude)}`);
      check(COUPLINGS.includes(String(cam.coupling)), `camera_state.coupling 비정상: ${String(cam.coupling)}`);
      if (cam.coupling === 'track_subject') {
        check(typeof cam.coupled_to === 'string' && (cam.coupled_to as string).length > 0, 'track_subject인데 coupled_to 누락');
      }
      if (cam.intent_tag !== undefined) {
        check(INTENT_TAGS.includes(String(cam.intent_tag)), `intent_tag 비정상: ${String(cam.intent_tag)}`);
      }
      if (u.phase !== undefined) {
        check(PHASES.includes(String(u.phase)), `phase 비정상: ${String(u.phase)}`);
      }
      const actors = Array.isArray(u.actors) ? (u.actors as Array<Record<string, unknown>>) : [];
      for (const a of actors) {
        check(typeof a.character_id === 'string', 'actor.character_id 누락');
        check(typeof a.verb === 'string' && (a.verb as string).length > 0, 'actor.verb 누락');
        check(ACTOR_MAGS.includes(String(a.magnitude) as ActorMagnitude), `actor.magnitude 비정상: ${String(a.magnitude)}`);
      }
      units.push(u as unknown as MotionUnit);
    }
    if (s.transition_out !== undefined && !TRANSITIONS.includes(String(s.transition_out))) {
      v.push({ rule: 'SCHEMA', shot_id: shotId, severity: 'warn', detail: `transition_out 비정상: ${String(s.transition_out)}` });
    }
    if (typeof s.motion_prompt !== 'string' || s.motion_prompt.length === 0) {
      v.push({ rule: 'SCHEMA', shot_id: shotId, severity: 'warn', detail: 'motion_prompt 누락' });
    }
    shots.push({
      shot_id: shotId,
      units,
      transition_out: TRANSITIONS.includes(String(s.transition_out)) ? (s.transition_out as ShotMotionPlan['transition_out']) : undefined,
      motion_prompt: typeof s.motion_prompt === 'string' ? s.motion_prompt : '',
    });
  }
  return { plan: { scene_id: expectedSceneId, shots }, violations: v };
}

/** 샷 단위 규칙 검사 (V2/V3/VB/VS). */
export function validateShot(shot: ShotMotionPlan, dbShot: DbShot | undefined): Violation[] {
  const v: Violation[] = [];
  const dur = dbShot?.duration_seconds ?? 5;

  // VB: 시간 예산 — 그룹 수 상한 (시간 산수는 LLM이 아니라 validator가 계산한다는 원칙)
  const budget = unitBudget(dur);
  if (shot.units.length > budget) {
    v.push({ rule: 'VB_UNIT_BUDGET', shot_id: shot.shot_id, severity: 'warn', detail: `units ${shot.units.length} > 예산 ${budget} (${dur}s)` });
  }

  // VS: duration_share 합
  const sum = shot.units.reduce((acc, u) => acc + (typeof u.duration_share === 'number' ? u.duration_share : 0), 0);
  if (Math.abs(sum - 1) > 0.05) {
    v.push({ rule: 'VS_SHARE_SUM', shot_id: shot.shot_id, severity: 'warn', detail: `share 합 ${sum.toFixed(2)} ≠ 1.0` });
  }

  for (const u of shot.units) {
    const cam = u.camera_state ?? ({} as MotionUnit['camera_state']);
    // V2: 무태그 counter = 거짓 신호 (유일한 fail 규칙)
    if (cam.coupling === 'counter' && !cam.intent_tag) {
      v.push({ rule: 'V2_UNTAGGED_COUNTER', shot_id: shot.shot_id, group_id: u.group_id, severity: 'fail', detail: 'counter 결합인데 intent_tag 없음' });
    }
    // V3: 카메라 크기 허용표
    const actors = Array.isArray(u.actors) ? u.actors : [];
    let allowed: string[];
    if (actors.length === 0) {
      allowed = cam.coupling === 'reveal' ? ['minimal', 'moderate', 'large'] : ['minimal', 'moderate'];
    } else {
      const maxMag = actors.reduce<ActorMagnitude>((m, a) => (magRank(a.magnitude) > magRank(m) ? a.magnitude : m), 'micro');
      if (maxMag === 'micro' || maxMag === 'small') allowed = ['minimal'];
      else if (maxMag === 'medium') allowed = ['minimal', 'moderate'];
      else allowed = cam.coupling === 'track_subject' ? ['moderate', 'large'] : ['moderate'];
    }
    if (CAM_MAGS.includes(String(cam.magnitude)) && !allowed.includes(String(cam.magnitude))) {
      v.push({
        rule: 'V3_MAGNITUDE_EXCESS', shot_id: shot.shot_id, group_id: u.group_id, severity: 'warn',
        detail: `camera ${String(cam.magnitude)} ∉ 허용 [${allowed.join(',')}] (actors max=${actors.length ? actors.map((a) => a.magnitude).join('/') : '없음(환경)'}, coupling=${String(cam.coupling)})`,
      });
    }
  }
  return v;
}

/** 씬 단위 인접 샷 검사 (V4) + 샷 커버리지. */
export function validateScene(plan: SceneMotionPlan, dbShots: DbShot[]): Violation[] {
  const v: Violation[] = [];
  const planIds = new Set(plan.shots.map((s) => s.shot_id));
  for (const db of dbShots) {
    if (!planIds.has(db.shot_id)) {
      v.push({ rule: 'SCHEMA', shot_id: db.shot_id, severity: 'fail', detail: '계획에서 샷 누락' });
    }
  }
  // V4: 그룹이 샷 경계를 관통하는데 match_cut 미표시 → "단위 버림" 경고
  const order = new Map(dbShots.map((s, i) => [s.shot_id, i]));
  const sorted = [...plan.shots].sort((a, b) => (order.get(a.shot_id) ?? 99) - (order.get(b.shot_id) ?? 99));
  for (let i = 0; i + 1 < sorted.length; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    const lastGid = cur.units.at(-1)?.group_id;
    const firstGid = next.units[0]?.group_id;
    if (lastGid && firstGid && lastGid === firstGid && cur.transition_out !== 'match_cut') {
      v.push({
        rule: 'V4_UNIT_ABANDON', shot_id: cur.shot_id, group_id: lastGid, severity: 'warn',
        detail: `그룹 ${lastGid}이 ${next.shot_id}로 이어지는데 transition_out=${cur.transition_out ?? '(없음)'} (match_cut 필요)`,
      });
    }
  }
  return v;
}

export function scoreShot(shot: ShotMotionPlan, violations: Violation[]): ShotScore {
  const own = violations.filter((x) => x.shot_id === shot.shot_id);
  const v2 = own.filter((x) => x.rule === 'V2_UNTAGGED_COUNTER').length;
  const v3 = own.filter((x) => x.rule === 'V3_MAGNITUDE_EXCESS').length;
  return { shot_id: shot.shot_id, unitCount: shot.units.length, violations: own, alignmentScore: 2 * v2 + v3 };
}
