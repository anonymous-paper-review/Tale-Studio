# RESULT — viz↔previz 갭: 시네 라인 주입 (측정 기준 검증 단계)

날짜 2026-08-07. 단계: **A/B 前 측정 기준 검증**(가설 자체 검정 아님).
좌표: 심판 gemini-3-flash-preview, temperature 0, JSON 강제. 데이터 011fd4bd-9b0a…(30샷,
전부 static_spec + real 완료), 표본 8샷(씬 가로질러 균등). baseline = 시네 라인 주입 前 생성된 real.

## 0. 싸게 죽이는 감사 (전제 1) — 통과

static_spec 보유 433샷 전역에서 시네 facet 9종 **100% 채움**, degenerate 아님:
렌즈 4종(24/35/50/85)·앵글 4·DoF 3·framing_rule 10·조명방향 50·색온도 51·팔레트 110·
focal_point 393(샷별 자유서술). → 갭은 "데이터 미탑재"가 아니라 순수 운반 문제. 접근 성립.
※ 쌍 최다 프로젝트(2beb605c 84쌍 등)는 static_spec=0 구버전 → 시네 비교 불가. 011fd4bd/c86410d7 만 유효.

## 1. rubric 변별력 (음성대조: real 이미지 × 다른 샷 spec)

"값 다른 쌍만" = 셔플된 짝의 facet 의도가 self 와 실제 다른 경우로 한정(짝이 우연히 같아 생기는
가짜 Δ=0 제거). matched = 자기 spec 실현율(≈baseline 보존율, 노이즈 있는 절대 판정).

| facet | matched(보존율) | mismatched(값다른쌍) | 변별 Δ | 판정 |
|---|---|---|---|---|
| focal_point | 50% | 0% | **+50%** | ✅ 신뢰 |
| camera_angle | 75% | 38% | **+38%** | ✅ 신뢰 |
| light_quality(hard/soft) | 63% | 33% | **+29%** | ✅ 신뢰 |
| depth_of_field | 63% | 38% | **+25%** | ✅ 신뢰 |
| light_direction | 63% | 63% | +0% | ❌ 못 읽음(8쌍 전부 값 다름 — 짝 탓 아님) |
| color_temp | 13% | 17% | −4% | ❌ 못 읽음(matched 자체 13%) |
| composition | 50% | 50% | +0% | ⚠️ 판정 불가(값 다른 쌍 2개뿐 — 음성대조 굶음) |

## 2. 판정

- **측정 기준 부분 합격**: 4/7 facet(초점·앵글·조명질·DoF)은 rubric 이 신뢰성 있게 읽는다 →
  이 4개로는 A/B(주입 arm vs baseline)를 지금 돌려도 결과를 믿을 수 있다.
- **3/7 facet 측정 재설계 필요**:
  - `light_direction`·`color_temp`: 절대 판정("이 프레임의 키 방향이 top_left 인가")을 VLM 이
    단일 스틸에서 신뢰성 있게 못 한다. 특히 color_temp 는 스타일 앵커의 전역 그레이드가 샷별
    의도를 덮어써 matched 13% — baseline 이 실제로 색온도를 안 지킬 가능성 + 심판 약점이 교락.
  - `composition`: "N분할 규칙" 자유서술이라 값 분산이 작아(대부분 thirds/center) 음성대조가 굶음.

## 3. 측정 재설계 처방 (다음 A/B 前)

발견의 핵심: **절대 판정보다 짝지음(previz↔real) 비교가 더 신뢰성 있는 오라클**이다.
- light_direction: "이 real 의 그림자 방향이 previz 시트의 의도와 일치하는가"를 **시트+real 나란히**
  비교(상대 판정). 절대 방향 추정보다 쉽다.
- color_temp: VLM 대신 **픽셀 통계 결정론 측정** — 이미지 평균 색상의 warm/cool 지표를 계산해
  의도 버킷과 대조(스타일 그레이드 교락은 baseline·treatment 양쪽에 동일하게 걸리므로 Δ 는 유효).
- composition: 자유서술 rule 대신 주피사체 화면분면(좌/중/우 × 상/중/하) 이산 좌표로 판정.

## 4. 제품 함의 (사용자 목표 대비)

사용자가 previz 에서 확인되길 원한 채널 중 **"빛의 방향(그림자)"과 "색"이 정확히 지금 측정기가
못 읽는 2개**. 주입이 효과 없다는 뜻이 아니라, 효과를 **측정할 도구가 아직 없다**는 뜻 —
그래서 A/B 前 이 검증이 필수였다. 초점·앵글·DoF·조명질은 바로 A/B 가능.

## 5. 산출물 (배선, 제품엔 아직 OFF)

- `renderRepaintCineLine(spec)` — 러프가 못 옮기는 채널만 렌더(블로킹·소품·프레이밍레이어 제외).
- `buildRealGridPrompt(_, {cineLines?})` / `buildRealStripPrompt(_, {cineLine?})` — 옵션 파라미터.
  미전달(기본) = 현행 프롬프트 바이트 동일 → **라이브 라우트 무변경**. A/B 하네스에서만 주입.
- 단위테스트: tests/facet-render.test.ts(renderRepaintCineLine), tests/storyboard-real-cineline.test.ts.
- raw 판정 로그: lab/viz-gap/baseline-011fd4bd/results.json (gitignored).

## 6. A/B 파일럿 (2026-08-07, 사용자 승인 후 실행)

오라클 재설계(측정 §3 반영): 절대 판정 → **2AFC**(같은 샷의 baseline vs treatment 를 나란히 주고
"어느 쪽이 이 의도를 더 실현?" A/B/tie, 위치는 샷별 결정론 무작위로 편향 상쇄) + **색온도는
결정론 픽셀통계**(mean R−B, 의도 버킷 방향 근접도). 2AFC 는 절대 탐지보다 신뢰성이 높아, 측정
검증에서 실패했던 light_dir 도 읽어낸다.

생성: 011fd4bd, openai/gpt-image-2/edit, 러프 스트립 리페인트. 두 arm 은 프롬프트의 cine 라인
유무만 다르고 레퍼런스·모델·크기 동일. **fal 이 ~3.5분/샷이라 15분 하네스 타임아웃에 걸려 6샷 중
4샷만 완료(N=4)** — 이미지는 샷마다 디스크 저장돼 회수, manifest 재구성 후 채점.

| facet | treat승 | base승 | tie | 판정 |
|---|---|---|---|---|
| depth_of_field | 3 | 0 | 1 | ✅ 주입 우세 |
| light_direction | 3 | 0 | 1 | ✅ 주입 우세 (측정 검증서 절대판정 실패했던 채널 — 2AFC 가 읽음) |
| light_quality | 3 | 1 | 0 | ✅ 주입 우세 |
| color_temp (픽셀) | 3 | 1 | 0 | ✅ 주입 우세 (결정론 — 가장 견고) |
| camera_angle | 1 | 0 | 3 | △ 대부분 tie (시트가 이미 운반) |
| focal_point | 1 | 1 | 2 | = 평평 |
| **composition (반증축)** | 1 | **0** | 3 | ✅ baseline 승 0 — 시네 라인이 시트 구도·포즈 안 망침 |

**판정: 가설 방향적 지지.** 새던 채널(DoF·조명방향·조명질·색온도) 전부 주입 arm 우세이고,
반증축(구도·포즈)에서 baseline 승 0 → 시트 보존 유지. 육안 확증: sh_02_11 treatment 는
baseline 대비 뚜렷한 teal 그레이드 + 배경 소프트닝(얕은 DoF).

**한계(과대해석 금지):** ① N=4 (타임아웃) — 방향성 신호지 통계적 결론 아님. ② us_cartoon
스타일 프로젝트 — 실사 스타일은 다를 수 있음. ③ 2AFC 가 run 간 일부 불안정(composition 이
tie↔treatment 진동). ④ focal·angle 은 효과 평평.

## 7. 다음 단계

- **제품 배선 ON 은 보류 권고** — 파일럿이 방향은 긍정이나 N=4 로 underpowered.
  확정하려면 (a) 생성을 2~3샷 배치로 쪼개 타임아웃 회피, N=12~16 으로 재실행,
  (b) 실사 스타일 프로젝트 1개 교차검증. 그 후 배선 ON + 러프 카드 시네 뱃지 노출 검토.
- 산출물(배선)은 §5 그대로 OFF 유지 — 라이브 무변경. A/B 하네스만 lab/(gitignored).
- 재설계된 2AFC+픽셀 오라클은 확정 배치에 재사용.
