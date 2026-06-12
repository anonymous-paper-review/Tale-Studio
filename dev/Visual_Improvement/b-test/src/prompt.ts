// B안 생성 프롬프트 — scene 단위 1콜로 해당 씬의 모든 샷에 motion_units를 저작.
import type { DbScene, DbShot } from './types.ts';

export function unitBudget(durationSeconds: number): number {
  return Math.max(1, Math.round(durationSeconds / 2.5));
}

export function buildScenePrompt(scene: DbScene, shots: DbShot[], storyText: string | null): string {
  const shotLines = shots
    .map((s) => {
      const dur = s.duration_seconds ?? 5;
      return `- shot_id="${s.shot_id}" | type=${s.shot_type} | duration=${dur}s | max_units=${unitBudget(dur)} | characters=[${(s.characters ?? []).join(', ')}]\n  action: ${s.action_description ?? '(없음)'}`;
    })
    .join('\n');

  return `당신은 영상 촬영 설계자다. 아래 씬의 각 샷에 대해, 인물/환경의 행동을 "행동소 그룹"(같은 의도에 속하는 최소 행동 단위 묶음)으로 분절하고, 각 그룹에 카메라 상태를 정확히 1개씩 종속시켜라.

[스토리 전체]
${storyText ?? '(없음)'}

[씬]
scene_id: ${scene.scene_id}
summary: ${scene.narrative_summary ?? ''}
mood: ${scene.mood ?? ''}
원문: ${scene.original_text_quote ?? ''}

[샷 목록]
${shotLines}

[규칙 — 전부 준수]
1. 그룹 수: 샷별 max_units 이하. 행동이 단순하면 그룹 1개가 정답이다. 쪼개기 위해 쪼개지 마라.
2. duration_share: 샷 내 그룹들의 합이 1.0이 되게 하라.
3. camera_state.coupling:
   - "track_subject" = 카메라가 행동 벡터를 추종 (coupled_to에 추종 대상 필수)
   - "hold" = 정지/고정
   - "reveal" = 정보 공개를 위한 독립 무브 (intent에 무엇을 드러내는지 명시)
   - "counter" = 행동 벡터와 직교/역행 — 반드시 intent_tag(disorientation|dread|reveal|pov_unstable) 필요. 태그 없는 counter는 금지.
4. 카메라 크기 허용표 (그룹 내 최대 actor magnitude 기준):
   - micro/small → minimal
   - medium → minimal 또는 moderate
   - large → moderate (단 coupling="track_subject"일 때만 large 허용)
   - actors가 빈 배열(환경 샷)이면 minimal~moderate, reveal 의도가 명시된 경우만 large.
5. 행동소가 다음 샷으로 이어지면(같은 동작을 다른 앵글로 계속) 두 샷에서 같은 group_id를 쓰고, 앞 샷의 transition_out을 "match_cut"으로 표기하라. 그 외 transition_out은 "cut".
6. actors[].verb는 동사 1개(영어). 대사/감정 변화도 행동소다 (예: verb="speaks", "realizes").
7. motion_prompt: 그 샷의 모션을 영어 50~80자, 동사 1~2개로 압축 (I2V 입력용).
8. phase는 타격/폭발 등 위상이 뚜렷한 행동에만 (wind_up|contact|follow_through).

[출력 — 아래 형태의 JSON 객체 하나만, 설명 금지]
{
  "scene_id": "${scene.scene_id}",
  "shots": [
    {
      "shot_id": "...",
      "units": [
        {
          "group_id": "g1_짧은영어라벨",
          "intent": "이 그룹의 연출 의도 1줄 (한국어)",
          "actors": [{ "character_id": "...", "verb": "...", "magnitude": "micro|small|medium|large" }],
          "phase": "wind_up|contact|follow_through (해당 시에만)",
          "duration_share": 0.6,
          "camera_state": {
            "type": "static|pan|tilt|dolly_in|dolly_out|tracking|crane|handheld_drift|rack_focus",
            "direction": "선택",
            "speed": "slow|medium|fast",
            "magnitude": "minimal|moderate|large",
            "coupling": "track_subject|hold|reveal|counter",
            "coupled_to": "track_subject일 때 필수",
            "intent_tag": "counter일 때 필수"
          }
        }
      ],
      "transition_out": "cut|match_cut|fade|dissolve",
      "motion_prompt": "영어 50~80자"
    }
  ]
}`;
}
