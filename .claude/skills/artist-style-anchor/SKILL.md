---
description: 임의 작가 그림체를 스타일 앵커로 온보딩 — 레퍼런스 이미지(1~N장)를 계산 통계+facet 분석해 Style Card를 만들고, 중립 정물 앵커 보드를 I2I 생성·QA한 뒤 전이 프로브 4장으로 검증. 사용자가 "작가 스타일 앵커", "그림체 분석/앵커화", "/artist-style-anchor" + 이미지 경로 제시 시 사용.
when_to_use: 프리셋 7매체 밖의 유저 제공 그림체를 앵커화·검증할 때 (dev 검증 루프 — 프로덕션 배선(업로드 API·style_anchors 시드)은 별개 spec 작업). 전제 - higgsfield CLI 로그인 + workspace 선택. 장당 7크레딧.
allowed-tools: Bash, Read, Write, Edit
---

# artist-style-anchor — 작가 그림체 앵커화 파이프라인 (B안)

레퍼런스 그림체 → 중립 앵커 보드 → 전이 검증까지. 이론 문서 2종(neutral_style_analysis_workflow·style-anchor-injection)과 refer1 견본 카드는 2026-08-05 대청소로 삭제됨 — 문서 2종은 `~/tale-studio-backup-2026-08-05.tar.gz`에만 있고, refer1 카드는 백업에도 없음. 운영에 필요한 루브릭·실측 규칙은 이 파일에 자기완결로 담겨 있다.

**산출 디렉토리**: `dev/Image_Style/<run_name>/` (없으면 생성, gitignore — 로컬 전용) — `style-card-<run_name>.md` + `anchor_board.png` + `test_*.png`.

## 단계 0 — 입력 수집

- 1~N장 (3장+ 권장, 6~12장 이상적 — 1장이면 콘텐츠/스타일 분리 신뢰도가 낮다고 카드에 명시).
- 여러 장이면 스타일 일관성 기준으로 Core(특징이 서로 일관된 대표 다수파) / Variation(부분 변형) / Outlier(이질적) 분류. Core만 생성 레퍼런스로 사용(최대 4장 — Q4 실측 5-ref까지 희석 없음).

## 단계 1 — 계산 통계 (결정론)

```bash
python3 .claude/skills/artist-style-anchor/bin/style_stats.py <img1> [img2 ...]
```

팔레트 hex 8색+점유율 · 채도/명도 통계 · 강엣지 비율 · 플랫 블록 비율. **이 수치를 2단계 분석의 접지로 사용** (팔레트는 단어 대신 hex로 프롬프트에 직접 넣는다).

## 단계 2 — facet 분석 → Style Card (LLM = Claude 수행)

레퍼런스 이미지를 Read로 보고 아래 1번의 14-facet 루브릭으로 분석. 출력 계약:

1. **facet별 통제 서술** (매체/형태/선/명암/팔레트hex/조명/가장자리/재질규칙/질감/디테일밀도/카메라/구도/모티프/불완전성)
2. **캡슐 2~3문장** — 앵커 보드 프롬프트용 rendering rules (재질 번역 규칙 포함: 금속/유리/천이 이 스타일에서 어떻게 그려지는가)
3. **인물 방언 절** (있으면) — 비율·이목구비·헤어 규칙. 앵커 보드가 못 나르는 부분이므로 캐릭터 프롬프트 텍스트 보강용으로 별도 기록
4. Core / Supporting / Content-bound 특징 3등급 분류 (Content-bound는 중립화에서 제거)

**금지**: 작가·프랜차이즈·작품 고유명사 — 부정문에 넣어도 생성기가 nsfw 거부 (2026-07-21 실측). 중립 서술어와 hex만.

**기본 포함 절 (E′ 실측 교훈, 2026-07-22)**: 모델은 지시가 없으면 **대칭 구조물·균일 선굵기·균등 장식 배치의 기본값으로 회귀**한다. 스타일이 비대칭/선 위계를 갖는다면 반드시 명시: ① "furniture, buildings, props and garments are never perfectly symmetric — nothing lines up in a perfect grid" ② 선화 3단계("outer silhouettes > object interior > background interior thinnest") ③ 장식 "uneven irregular rhythm, never evenly spaced". (refer1 E′ A/B: 4축 전부 개선·회귀 없음 → 채택)

## 단계 3 — 중립 앵커 보드 생성

`templates/anchor_board.txt`의 `{RENDERING_RULES}`에 캡슐(+hex 팔레트, 재질 규칙, 장식 모티프)을 채워 프롬프트 작성 후, higgsfield CLI로 I2I 생성 (구 `bin/hf_image.sh` 래퍼는 소실 — CLI 직결):

```bash
# 모델 선택: higgsfield model list --image → 파라미터 확인: higgsfield model get <job_type>
higgsfield generate create <이미지_모델> \
  --prompt "$(cat <run_dir>/prompt.txt)" \
  --image-references <core_ref1> [--image-references <core_ref2> ...] \
  --wait
# 로컬 경로 ref는 자동 업로드. --wait 출력의 결과 URL을 <run_dir>/anchor_board.png 로 저장(curl -o)
```

## 단계 4 — 앵커 보드 QA (vision, Claude)

Read로 보드를 열어 facet 대조: ①핵심 facet 재현(선/명암/팔레트/가장자리/재질규칙) ②정물 7요소 완비 ③원작 캐릭터·모티프·텍스트 누수 없음 ④콘텐츠 중립성. 실패 축을 명시해 rendering rules를 강화하고 **≤2회 재시도**. 통과 보드만 앵커로 사용.

## 단계 5 — 전이 프로브 4장

`templates/probe.txt`의 `{CONTENT}`에 아래 표준 4종(오리지널 콘텐츠, 매 실행 동일 권장 — 런 간 비교 가능)을 채우고, **refs=[anchor_board.png]만** 물려 생성:

| 프로브 | 표준 콘텐츠 | 검증 축 |
|---|---|---|
| test_character | 오리지널 인물 전신 단독 (플랫 배경) | 인물 방언 — 최난도 |
| test_cafe | 카페 실내 (인물 없음) | 공간/배경 |
| test_scooter | 가로등 아래 스쿠터 (인물 없음) | 사물/재질/야간광 |
| test_action | 인물+탈것 야간 질주 | 액션/구도/무드 |

## 단계 6 — 검수·기록

5축 루브릭(스타일 충실도/콘텐츠 중립성/재질 분리/구조 안정성/독립성, 1~5점)으로 각 장 채점. `style-card-<run_name>.md`에 통계·Style Card·잡 ID·QA·점수·비용 기록.

## 인물 방언 보강 — 실측 확정 규칙 (refer1 3안 비교, 2026-07-21)

정물 보드 단독은 인물 방언(비율·이목구비·헤어 형태 언어)을 약하게만 나름 (T1 3/5). 3안 A/B 결과 (원본 refer1 카드 소실 — 아래 수치가 남은 전부):

- **A** 이중 레퍼런스 `[보드, 원작 Core 1장]` = 3.5~4/5 · **A+B** +방언 절 텍스트 = 4.5/5 · **A+B+C** +마네킹 보드 = 4.5~5/5. **결정적 기여는 B(텍스트)**.
- **C(A' 마네킹 보드)의 실체 = 룩 변조기** (장면 ABC 라운드 실측): A' 보드의 각진 기하·좁은 팔레트가 인물뿐 아니라 장면·사물 전체에 전파. 보드 선택 = 룩 결정 행위. 스타일당 보드 2종(표준=색 풍부/부드러움, A'=각지고 절제된 그래픽)을 **룩 옵션**으로 제시 가능. 마네킹의 장면 누수는 n=1 미발현("Do NOT reproduce its subject" 절 방어)이나 게이트 유지.
- **확정 레시피 매트릭스** (장면 라운드 포함 2026-07-21 확정):
  - 배경/사물/공간 = `[보드, 원작 Core 1장]` + **장면용 2-ref 절**("HOW it renders a scene — 색 에너지·패턴 언어·장식 밀도, 피사체/모티프 복사 금지"), 콘텐츠만 (= A). 방언 텍스트는 생략 — 인물 소환은 안 됨(refer1 실측 n=2, "No people" 락이 이김)이지만 스타일 효과도 없어 토큰 낭비(장식 미세 첨예화 부수효과만).
  - 캐릭터/인물 포함 샷 = `[보드, 원작 Core 1장]` + **인물용 2-ref 절**("HOW it draws figures — 비율·이목구비·헤어 형태 언어, 특정 캐릭터 복사 금지") + Style Card의 **인물 방언 절** (= A+B).
- **정체성 누수 게이트 필수**: 인물 산출물마다 원작 캐릭터 비유사 vision 판정. 스타일 공유 어휘(눈매·화장 표현)와 특정 캐릭터 복사를 구분. 장면 산출물은 고유 모티프/패턴 누수 확인.

## 모작 방향 가드 (2026-07-22, ABCD 폐기 교훈)

**목표는 "스타일을 담는 중립 이미지"이지 원작 재현이 아니다.** 방언 절·수정 사항은 **여러 작품에서 반복되는 불변량**에서만 도출한다. 단일 원작 1장에 정합시키는 미세 튜닝(비율 % 맞추기, 원작 배경 구성·장식 배치 재현, 특정 그림 채점 기준 역주입)은 중립 앵커가 아니라 few-shot 모작으로의 과적합 — **금지**. 판별 기준은 콘텐츠/스타일 분리와 Content-bound 제거: "이 요소가 다른 인물·공간·시간대에서도 반복되는가?"에 예라고 답할 수 없으면 레시피에 넣지 않는다. (사례: refer1 ABCD 라운드 — 원작 포스터의 배경 색면 구성·별 장식을 D 레이어로 주입 → 유저 판정 폐기.)

**단, 일반화를 거치면 복권 가능** (refer1 ABCDE 실증): 원작의 장식 시스템(색면 패널·패턴 바닥·스파클)을 **구조 문법으로만 추출하고 색·배치를 교체 팔레트로 실행**하면 콘텐츠 복제가 아니라 스타일 층이 됨 — "다른 팔레트·다른 대상에서도 반복 가능한가?"가 판별 질문.

## 기타 한계

- 전이 프로브에서 방언은 콘텐츠 무드 의존적 (액션 컷이 단독 입상보다 방언 회복 — refer1 T4>T1).
- 프로덕션 배선 시: 보드 = `style_anchors.image_url`(I2I), 원작/쇼케이스 = `preview_url`. **원작 이미지를 프로덕션 앵커 슬롯에 직결 금지** (콘텐츠/정체성 누수). 캐릭터 경로의 원작 보조 레퍼런스는 생성 시점 주입으로 별도 관리.
