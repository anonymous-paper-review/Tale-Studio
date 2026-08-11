# t0-d2-cut-rhythm-band — D2 허용 구간의 경계 압박 실측

- **날짜**: 2026-08-11 (밤 러너)
- **판정**: **가설 기각** — 기각 조건 발동 (경계 과점유 <1.5×: live_action 0.68×/0.55×, 두 해석 모두)
- **출처 티켓**: `research/backlog/t0-d2-cut-rhythm-band.md` ← prompt-contract-audit §3 재검증④ (카탈로그 D2🕳)

## 가설과 결과

가설: D2 매체→avg_shot_seconds 허용 구간("구간 밖의 값을 쓰지 마라", v3_scene_plan.ts:102-111)이
실분포를 구간 경계로 압박한다. 기각 조건: 경계 ±10% 존의 점유가 균등 대비 <1.5×.

계약 원문 구간: 고밀도(live_action 등) **6~9s** / 중밀도(2d_anime 등) **5~7s** / 저밀도(2d_cartoon 등) **3.5~5s**.

**실측 — 씬별 평균 샷 길이(실제 shot duration_seconds에서 계산):**

### live_action (로컬 3런, 50씬 — 구간 6~9s)

히스토그램(0.5s 빈): 5.0×2 · 5.5×1 · 6.0×5 · 6.5×6 · **7.0×12 · 7.5×8 · 8.0×11** · 8.5×1 · 9.0×4

- 경계 존 점유: 해석(a) 경계±(구간폭 10%) = 16% 관측 vs 균등 23.5% → **0.68×** / 해석(b) 경계값±10% = 30% vs 54.8% → **0.55×**
  (두 해석 모두 실행 전 등록 — 어느 쪽으로도 1.5×에 근접조차 안 함, 오히려 경계 과소)
- 구간 내 94%(47/50), 구간 밑 3씬(5.0~5.5s), 구간 위 0. **최빈은 구간 중앙(7~8s)** — 경계 절단이 아니라 중앙 자연 분포.

### 2d_cartoon (Upload_test, 4씬 — 구간 3.5~5s)

4씬 전부 4.5s 빈(구간 중앙). 경계 몰림 없음.

### NA (구간 배정 불가 — 판정 제외)

Sample1(cinematic_realism, 14씬)·writer_test_260810(gritty_industrial_noir, 4씬) — 계약 문구에
미열거된 art_style이라 어느 구간이 적용됐는지는 추측이 됨 → 판정 3원칙(불확실은 NA)으로 제외.
관측치는 results.json per_scene에 보존.

## 해석 메모 (판정 밖)

D2는 "분포를 절단하는 압박"이 아니라 **넉넉한 울타리**로 작동 중 — 모델은 구간 중앙을 선호하고
경계에 눌리지 않는다. 순환 참조 주의(티켓 전제): 이 실측은 "옳은 리듬"의 증거가 아니라
"구간이 분포를 절단하지 않는다"만 말한다.

## 좌표

- 로컬: `logs/{064631aa,5260d92d,e4da245a}/11_v4_shotDesign.json` → `shots[].intent.{scene_id,duration_seconds}` + `08_v0_visualIdentity.json` → `.style.art_style`
- DB: shots.{scene_id,duration_seconds} (live read-only) — Sample1 `9d6efa6d…`·writer_test_260810 `e1a9fd08…`·Upload_test `04926a0a…`
- 수집·집계: `collect.mjs` (코드 집계만) → `results.json`
- 대상 계약: `src/lib/writer/pipeline/stages/v3_scene_plan.ts:102-111`

## Q2 함의

D2도 C2(mounting)와 같은 방향 — "계약이 분포를 누른다"의 실증이 이 축에선 없다.
재검증 대상 중 남는 실증은 C3 transition(유보-상방 93.3%)뿐.
