# Sound / Audio — Legacy (파이프라인에서 제거됨)

**일자:** 2026-06-13
**결정:** writer 파이프라인에서 **오디오/사운드 관련 필드를 전부 제거**한다.
**사유:** 현재 영상 생성 스택(fal 이미지/영상)이 **오디오를 생성하지 않음** → 파이프라인이 사운드를 만들 수단이 없는데 LLM 스테이지가 사운드 필드를 요구하면 **하류에 닿지 않는 산출물 + LLM 혼란**만 유발한다(연결 구조 재설계의 "정보 과잉 제거" 원칙). 음악/오디오는 **명시적으로 후속(deferred)** 으로 미룬다.

## 제거된 항목 (코드)

| 위치 | 필드 | 비고 |
|---|---|---|
| `StoryCharacter` (s2 인물) | `voice` | 인물 음성 — 오디오 미지원이라 제거. CastContract·DB·프롬프트 동반 정리 |
| `SceneCinematography` (v3) | `sound_motif_hints`, `silence_intentional` | audit상 **이미 하류 소비처 0(dead)** 이던 씬 오디오 힌트 |

> 이전 audit(`VISUAL_AXIS_AUDIT_2026-06-13.md`)에서 v3의 `sound_motif_hints`/`silence_intentional`은 "생성되나 아무도 안 읽는 dead output"으로 분류됨 — 제거는 손실 없음. `voice`는 producer가 채우던 입력이나 소비 경로가 오디오 부재로 무의미.

## 보존된 설계 사료 (재도입 시 출발점)

상세 리서치는 **`dev/writer_advencement/sound_ideation.md`** (2026-04-19, 149줄)에 그대로 남겨둔다. 핵심 요지:

- **영화 사운드 4트랙**: Dialogue(DX) / Music(MX) / SFX·Foley / Ambience(RT). 레이어링 순서 = 정보량(=내러티브 우선순위) 순: Dialogue→SFX→Ambience→Music.
- **Short-form 고유 제약**: 무음 자동재생 기본값(피드 80% 무음 스크롤), 사운드 훅의 몰입 결정력, 루프 친화, 대사 집중 난이도(짧은 길이 → 음악/시각 주도 권장).
- **AI 오디오 지형(2026)**: TTS(ElevenLabs/Cartesia/CLOVA), 음악(Suno/Udio/ACE-Step), SFX(ElevenLabs SFX v2/Stable Audio), **V2A(무음 영상→오디오)** 가 우리 시나리오 직결 — **MMAudio**(Synchformer 프레임 싱크)가 가장 현실적 오픈 옵션, "초벌 Foley/앰비언스 생성기 + 수동 레이어" 패턴.
- **법률**: AI 100% 생성 음악은 미국 저작권 미인정(상업권은 주되 독점권 없음), 보이스 클로닝은 동의/추적/보상 필수.

## 재도입 시 권장 진입점 (when audio is supported)

1. **V2A 레이어 먼저** (영상 무음 → MMAudio로 Foley/앰비언스 초벌) — 생성 스택에 오디오가 없으니 후처리 레이어가 자연스러움.
2. 그 다음에야 파이프라인에 사운드 *설계* 필드 복원 — 위치 후보: v3(씬별 사운드 모티프/정적 무음)와 별도 "사운드 스펙" 스테이지(`pipeline_content_gaps.md`의 L4 Sound Spec 제안). 단 **생성 수단이 붙은 뒤** 복원(그 전엔 또 dead field).
3. 복원 시 4트랙 모델로 facet 설계, dual-axis의 V축 하위가 아니라 **별도 A(Audio)축**으로 둘지 검토(S/V/C + A).

> 요약: 사운드는 *틀렸다*가 아니라 *생성 수단이 없어 미룬다*. 수단(V2A 등)이 생기면 위 사료에서 재개.
