# V축 (Visual) Recap — 현황 / 갭 / 미결정

> 작성일: 2026-04-20
> 목적: V축 고도화 작업 진입 전, 현재 상태와 누락 영역을 한눈에
> 연관: `dual_axis_model.md`, `linear_pipeline.md`, `user_input_scenarios.md`, `pipeline_content_gaps.md`, `research_vlm_limitations.md`, `research_closed_world_style.md`

---

## 0. 한 줄 요약

V축은 **"프롬프트 잘 쓰는 단계"까지만 완성**. 분류체계화 / Knowledge DB / Identity Lock / Coverage / Sound / 실생성기 연동 — 전부 미착수. 문서는 다 정리돼 있지만 결정이 안 됐고, 결정이 안 되면 코드도 못 짠다.

---

## 1. 현재 구현된 것 (svc + dual-axis)

### L0 — 불변 (5 필드)
```ts
{ medium, resolution {w,h}, fps, aspect_ratio, rendering_method }
```
**평가**: 단순. 자유 텍스트. enum 강제 없음.

### L1 — 시각 스타일 (5 필드)
```ts
{ art_style, shape_language, line_quality, character_proportion, texture_philosophy }
```
**평가**: 자유 텍스트. **분류 체계(taxonomy) 없음**.

### L2 — 디자인 (5 영역)
```ts
{
  global_palette { primary, secondary, accent, forbidden[] },
  color_meaning Record<color, meaning>,
  locations [{ id, style_description, lighting_sources[], props[] }],
  costumes Record<character_id, items[]>,
  vfx_approach
}
```
**평가**: 구조 있음. 다만 **location 과생성 실제 사례** (37 정의 → 28 사용, 27% 낭비).

### L3 — 샷 (단일 평면 구조)
```ts
{
  shot_id, scene_id, duration_seconds (=5),
  shot_type (enum 12종),
  camera_angle, camera_movement (enum 8종),
  lighting { key_fill_ratio, color_temp_kelvin, quality },
  color_grading_intent, composition_notes, performance_notes,
  primary_action, secondary_action?, environmental_action?
}
```
**평가**: 한 샷이 평면. 시각 디테일 응축돼 있지만 **영화 문법 레이어 없음**.

---

## 2. 이미 문서화된 V축 갭 (작업은 미착수)

### 2.1 결과물에서 약한 것 (`pipeline_content_gaps.md`)

| 요소 | 상태 |
|------|-----|
| 미장센 층위 (전경/중경/후경) | ❌ 단일 composition_prompt |
| Blocking / 공간 동선 | ❌ 좌표/거리 미설계 |
| POV 전환 | ❌ S1에 1개 POV뿐 |
| 시각 모티프 추적 | 🟡 결과엔 등장하나 스키마 필드 없음 |
| Signature Frame | ❌ 모든 샷 평등 |
| Transitions 종류 | ❌ `is_scene_transition: bool`뿐 |
| 청각 모티프 (sound) | ❌ 파이프라인 외 |

### 2.2 Closed-World 미적용 (`research_closed_world_style.md`)

| 업계 표준 | Tale 적용도 |
|---------|---------|
| style/subject/structure 3축 분리 | ❌ |
| Knowledge DB 폐쇄 토큰 | ❌ |
| IP-Adapter (캐릭터 ID lock) | ❌ |
| ControlNet 카테고리 분리 | ❌ |
| Kling @Element / Sora @mention | ❌ |
| LoRA 슬롯 | ❌ |

### 2.3 VLM 한계 대응 (`research_vlm_limitations.md`)

- 렌즈/조명비/카메라 무브 자동 추출 = **랜덤 수준 정확도** (33-49%)
- 현재 코드: 사용자 입력 메커니즘 없음 (전부 LLM 텍스트 생성에 의존)
- 권장: UI 입력 슬롯 + Knowledge DB 검색

### 2.4 멀티모달 입력 (`user_input_scenarios.md`)

| 자료 유형 | 매핑 대상 | 구현 |
|----------|---------|-----|
| 무드보드 | L0+L1 | ❌ |
| 캐릭터 사진 | S2+L2 | ❌ |
| 로케이션 사진 | L2 | ❌ |
| 스토리보드 | L3 | ❌ |
| 레퍼런스 영상 | L0~L3 | ❌ |

---

## 3. 제안되었으나 미합의 — V축 신규 단계 (`pipeline_content_gaps.md` §4)

```
L2.5: Character Identity Lock Pass
  → 캐릭터 시트 생성 (얼굴/의상/포즈 레퍼런스)
  → IP-Adapter 시드 세팅

L3.5: Coverage Planner
  → shot_priority: hero | standard | filler
  → 알트 테이크 스케줄링
  → signature_moments 마킹

L4: Sound Spec
  → 샷별 audio placeholder
  → BGM cue, sound motif

L5: Post-Production Plan
  → 후공정 작업 리스트
  → VFX/ADR/Color pipeline 분기
```

### L3 추가 필드 후보
```ts
shot_priority, take_count, signature_flag, rhythm_tag,
blocking { start_pos, end_pos, distance_m },
subtext_beat, performance_note,
sound_cue { music, sfx, diegetic, score_timing },
transition_type (10종 enum),
viewer_focus, off_screen_elements
```

---

## 4. 실제로 진행한 V축 관련 작업 (현재까지)

| 작업 | 완료? |
|-----|------|
| dual-axis L0_L1/L2/L3 phase 구현 | ✅ |
| L3 씬 배치 처리 (timeout 회피) | ✅ |
| Resume에서 L3 부분 재개 | ✅ |
| `pipeline_diagrams.md` V축 도식 | ✅ |
| V축 결과물 정량/정성 진단 | ✅ |
| **L0~L2 taxonomy 정형화** | ❌ |
| **Knowledge DB 스키마** | ❌ |
| **새 V stage (L2.5/L3.5/L4/L5)** | ❌ |
| **L3 필드 확장** | ❌ |
| **멀티모달 입력** | ❌ |
| **Identity Lock** | ❌ |
| **3축 분리 (style/subject/structure)** | ❌ |
| **실제 영상 생성 API 연동** (Qwen3/Hunyuan) | ❌ |

---

## 5. 누락된 결정 사항

```
[ ] L0/L1 컴포넌트 taxonomy 어디부터 시작? (장르별? 통합?)
[ ] enum 값 공간을 누가 정의? (도메인 전문가? AI 도출?)
[ ] Knowledge DB 저장소: YAML? Supabase? 둘 다?
[ ] Identity Lock: IP-Adapter 직접 통합 vs API 추상화?
[ ] Coverage Planner의 hero/standard/filler 비율: 자동? 수동?
[ ] Sound Spec L4: 본 파이프라인 안? 별도 파이프라인?
[ ] L3 5초/샷 고정 유지 vs 가변(3~10초)?
[ ] 멀티모달 입력 받기 시작 시점 (Phase 어디부터)?
[ ] V 출력 → 실제 영상 생성기 어떤 모델로? (Hunyuan, Kling, Veo?)
```

---

## 6. 우선순위 추천

| 순위 | 작업 | 근거 |
|----|------|-----|
| 🔴 1 | **L1 taxonomy 정형화 (장르 1개 pilot)** | 모든 후속 작업의 선결 |
| 🔴 2 | **Knowledge DB 스키마 초안** | 차별화 포인트 실체화 |
| 🟡 3 | **L3 필드 확장 (blocking + sound_cue + transition_type)** | 가장 영향력 큰 컨텐츠 개선 |
| 🟡 4 | **Identity Lock L2.5 단계** | 영상 생성 단계 핵심 |
| 🟢 5 | **Coverage Planner L3.5** | 비용 차등화 가능 |
| 🟢 6 | **실제 영상 생성기 연동 1개** (가장 안정적인 모델 1개) | end-to-end 검증 |

---

## 부록: 관련 문서

- `dev/writer_advencement/dual_axis_model.md` — S/V/C 축 이론
- `dev/writer_advencement/linear_pipeline.md` — 선형 구조 실무 설계
- `dev/writer_advencement/L0_L1_deep_dive.md` — L0/L1 구성 요소 (텍스트 서술)
- `dev/writer_advencement/L1_L2_deep_dive.md` — L1→L2 전환
- `dev/writer_advencement/L2_L3_deep_dive.md` — L2→L3 전환
- `dev/writer_advencement/pipeline_content_gaps.md` — 본 문서의 갭 분석 모체
- `dev/writer_advencement/pipeline_diagrams.md` — V축 흐름 도식
- `dev/writer_advencement/research_vlm_limitations.md` — VLM 한계 실증
- `dev/writer_advencement/research_closed_world_style.md` — 업계 스타일 시스템 전수
- `dev/writer_advencement/user_input_scenarios.md` — 사용자 입력 5축
- `specs/api_features.md` — Knowledge DB / 6축 카메라 스펙
- `CLAUDE.md` — 3-Level Pipeline + L0 Concept Canvas 개요
