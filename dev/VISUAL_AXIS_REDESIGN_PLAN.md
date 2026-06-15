# Visual 축 연결 구조 재설계 — 계획안

**일자:** 2026-06-13 (초안, 확정 전)
**배경:** `dev/VISUAL_AXIS_AUDIT_2026-06-13.md` 후속. 선형 의도로 만든 V축이 `v2+v3` 수렴으로 dual-axis 망처럼 꼬임 → **단일 방향 선형 + coarse-to-fine + 같은-계층(s_n↔v_n) 참조**로 연결 구조를 재정렬.
**상태(2026-06-13 진행):**
- ✅ **오디오/voice 제거 완료 (green: tsc0·eslint0)** — `voice`(writer+producer 전부), `SceneCinematography.sound_motif_hints`/`silence_intentional`. 에디터 오디오 트랙 `kind:'voice'|'audio'`는 보존. `characters.voice` DB 컬럼은 미사용 잔존(드롭 안 함). 사운드 사료 → `SOUND_DESIGN_LEGACY.md`.
- ✅ **background shape 확정** — producer가 `BackgroundContract`(아래 §5)를 seed로 전달(유저 입력). 코드는 이 모양으로 진행.
- ⏳ **V 구조 캐스케이드 = 다음 단계** — 타입 재편(v0 병합/v1 신규/v2 분화) + 신규 v1/v2 LLM 프롬프트 + steps/index 연결 재작성 + 하류(persist/artist) 정합. **~15파일 atomic(중간 tsc-red, 완료 시 green)** 이라 단일 집중 푸시로 수행.

---

## 1. 확정 원칙

- **연결 규칙 (2026-06-13 개정 — 거미줄 허용):** 각 단계는 **[bridge 거친 seed v_n] + [자기 s_n] + [직전 v_{n-1}]** 을 읽는다. bridge(midPreview)가 층마다 자기 seed(`v_recommendations.v_n`)를 *직접* 줘서(fan-out) 릴레이 손실을 피한다(telephone-game 회피). bridge는 skip-default라 평소엔 잠자고 on일 때만 fan-out 활성(on/off 성능 비교 대상). 역류는 여전히 금지(단방향).
- **같은-계층 정렬.** s_n ↔ v_n 번호가 의미상 1:1이 되도록 V를 재정렬(노드 재구성 허용).
- **영상 ≤ 10분 전제.** 월드/세팅은 "스토리에 필요한 배경만"(최소). 긴 영상용 일반화는 후속.
- **이산 산출물.** 누적 단일 객체가 아니라 단계별 별도 타입 + 직전 참조(타입/persist 변경 최소화).

## 2. 재정렬 사다리 (최종)

```
스토리(coarse→fine)            비주얼(재정렬)                         직접 참조
──────────────────────────────────────────────────────────────────────────
[브리지: cliche 검수 + coarse 비주얼 seed → v0 시드 / 기본 SKIP]
s0 genre                   ↔  v0  비주얼 아이덴티티                    s0 (+브리지)
                                 = 포맷(매체/해상도/fps/비율/렌더)
                                 + 스타일(art_style/shape/line/proportion/texture)
s1 structure               ↔  v1  막별 비주얼 아크 (신규)              s1 + v0
                                 = 막/전환점/테마 따라 조명·에너지·톤(·팔레트) 진화
s2 characters + 월드/세팅   ↔  v2  인물 비주얼 + 월드 비주얼            s2 + v1
                                 = 인물(외형/의상/인물팔레트) + 월드(로케이션/글로벌팔레트/색의미/vfx)
s3 scenes                  ↔  v3  씬 시네마토그래피                    s3 + v2
                                 = 커버리지/렌즈/조명아크/리듬/pov + 씬 로케이션 실현
   (s4 없음)                   v4  샷 디자인 (연출 중심·스토리 최소)      decoupage(s3 비트) + v3
```

번호 정렬: **v0↔s0, v1↔s1, v2↔s2, v3↔s3** 모두 1:1. v4는 s4가 없는 의도된 예외(샷은 스토리 세분이 아니라 V 전용 연출 세분 — 정보 과잉 방지).

## 3. 스테이지별 명세

| 단계 | 책임 | 입력 | 출력(신규/재편 타입) |
|---|---|---|---|
| **브리지** (skip) | cliche 검수 + 가장 거친 비주얼 방향 제안 → v0 시드. **기본 skip** → v0가 s0에서 자체 결정 | s0(+S 확정본) | (skip 시 빈 seed) |
| **v0** ↔ s0 | 비주얼 아이덴티티: 포맷 + 글로벌 스타일 | s0(genre) + 브리지 | `VisualIdentity` = {format 블록, style 블록} (구 `RenderFormat`+`ArtDirection` 병합) |
| **v1** ↔ s1 | 막별 비주얼 아크: 구조를 따라 비주얼이 어떻게 진화하는가 | s1(narrativeStructure) + v0 | `ActVisualArc` (**신규**) |
| **v2** ↔ s2 | 인물 비주얼 + 월드 비주얼 | s2(characters+월드) + v1 | `CharacterVisual` + `WorldVisual` (구 `ProductionDesign` 재편) |
| **v3** ↔ s3 | 씬 시네마토그래피 (+씬 로케이션 실현) | s3(scenes) + v2 | `SceneCinematography` (대체로 유지, 입력만 정리) |
| **decoupage → v4** | 비트→샷 분해 후 샷 연출 설계(스토리 최소) | decoupage(s3 비트) + v3 | `DecoupagePlan` → `ShotDesign` (유지) |

> v0 병합 주의(audit 지적 반영): 포맷(기술)과 스타일(미학)은 한 단계라도 **별도 sub-블록**으로 둬서 `rendering_method` vs `texture_philosophy` 모순을 막는다.

## 4. 스토리축 변경 (producer — coworker 편집 중, **pull 후**)

- **s2 = characters + 월드/세팅.** 월드는 **producer seed(유저 입력)** — 원천(보존·additive), writer 생성 아님. 핸드오프 계약(`CastContract`)에 월드 필드 추가.
- **월드 범위:** 스토리에 필요한 배경만(로케이션 + 최소 세계관). ≤10분 전제.
- **s3 씬 ↔ s2.월드:** 씬은 s2.월드의 로케이션을 **골라 씀(top-down)**. (현재의 "씬 location 문자열 → 로케이션 파생"을 뒤집음.)
- **characters.voice 제거** — 오디오/음악 미지원이라 LLM 혼란 요소 제거. `StoryCharacter.voice` + `CastContractCharacter.voice` + DB `characters.voice` 컬럼 + 관련 프롬프트/persist 동시.

## 5. 타입/코드 영향 (writer — pull 후)

- **병합:** `RenderFormat` + `ArtDirection` → `VisualIdentity` (v0). 파일 `v0_v1_visual.ts` → 단일 v0 산출.
- **신규:** `ActVisualArc` (v1) + 새 stage `v1_act_arc.ts`(가칭). 기존 `v1`(artDirection)은 v0로 흡수돼 사라짐.
- **재편:** `ProductionDesign` → `CharacterVisual`(↔s2.characters) + `WorldVisual`(↔s2.월드). `v2_design.ts` 2-산출로.
- **연결 재작성:** `steps.ts`/`index.ts`의 각 stage 인자를 **[s_n]+[v_{n-1}]로 제한** + 각 stage 프롬프트 컨텍스트 조립을 그 2개만으로. (현재의 whole-object·다출처 주입 제거.)
- **브리지:** `mid_preview.ts` → v0 시드 역할로 축소, skip 유지.
- **하류 영향(별도 정리 필요):** v0~v2 타입 변경 → `persist_design_tokens`(design_tokens.l0/l1 구조), 하류 v3/decoupage/v4 프롬프트, `rough-storyboard`, director 매핑(`shot-config-from-design`), artist `generate-sheet`(design_tokens.l1 읽음)까지 파급. 마이그레이션 점검 필요.
- **번호 정합:** 최근 `l→v` 리네임과 일관. v_recommendations 키(midPreview)는 브리지로 가며 정리.

## 6. 열린 항목 (확인 후 확정)

1. **art_style 전역 고정?** 기존 artDirection 5필드 전부 v0(전역). 막별 화풍 변경 연출을 원하면 `art_style`만 v1 아크로 — ≤10분이면 전역 고정 추천. (기본: 전역 고정.)
2. **voice 제거 타이밍:** producer(cast contract)+writer+DB 동시라 coworker producer 편집과 겹침 → **pull 후 일괄** 권장. (writer측만 먼저 지울지?)
3. **오디오 요소 일괄 정리?** voice와 같은 이유로 `SceneCinematography.sound_motif_hints`/`silence_intentional`(audit상 현재 소비처 없음=dead)도 제거할지. (일관성 차원 제안.)
4. **팔레트 위치:** 글로벌 팔레트 세트를 v0(또는 v1)에 두고 v1 아크=진화, v3=씬 강조로 coarse-to-fine. v2.월드엔 로케이션/vfx 중심. (facet 단계에서 확정.)

## 7. 시퀀싱

1. **(대기)** coworker producer 변경(s2.월드 seed) → 사용자 pull 신호.
2. pull 후: 스토리축(§4) → 타입 재편(§5) → 연결 재작성 → 하류 정합 → tsc/eslint/검증.
3. 안전하게 *지금* 가능한 prep(있다면): 신규 타입 스텁/순수 함수 등 — 사용자 승인 시.
