# 프롬프트 계약 감사 — 카메라 무빙 억압 원인 → 둥둥 재검증 → 전 계약 카탈로그 — 세션 기록

> 세션 2026-08-10. 다음 세션에서 "프롬프트 억압/캡 완화/카메라 무빙"을 이어갈 때 먼저 읽는다.
> 원칙: 실측만 기록. 코드로 귀결된 것은 여기 없음 — 둥둥 실험 코드·결과는 `research/experiments/ti2v-camera-cap-recheck/`가 기록.

## 0. 한 줄 요약

"동적 카메라 무빙이 왜 적나"(G3)를 층별 추적 → **혼합 평결**(정적 샷 개수는 입력 탓, 무빙의 천장은 설계 계약 탓) → 캡의 원사유 "둥둥"을 blind 9클립으로 재검증 → **가설 생존(둥둥 0/9) + 역전 발견(LOCKED static 계약 3/3 위반 — 모델이 동기화 무빙을 스스로 추가)** → 같은 유형의 계약을 전 프로젝트 수색해 **43건 카탈로그** 완성. 캡 완화는 오너 결정 대기.

## 1. 실측 발견 — 안 통한 시도 포함

- **G3 실측 (완료 3프로젝트 203샷)**: 뷰 경계 횡단 무빙(pan/track/dolly/crane × moderate+) = Sample1 3~5/113(3~4%), w260810 1/20, Upload_test 1/70. 분포: static/none×117, handheld_drift/minimal×46이 지배.
- **층별 낙하 추적 (운동이 죽는 층)**: 스토리 운동 비트는 w260810 5/20(25%)뿐 — "추격물"조차 탐사→발견→발각→도주 구조 (정적 샷 개수는 입력에 정직). 죽는 곳: ① v3가 질주 클라이맥스를 breathing으로 하향 ② kinetic 선언 씬에서도 decoupage static 우세(법정 클라이맥스 8/9) — 단 **운동을 직접 수요하는 비트는 5:5 전원 생존** (죽는 건 암시적 수요 — revelation push-in, 액션 주변 커버리지) ③ v4 강등 래칫: motivated_move 23개 중 22%가 drift로 강등, 역방향 승격 1/180 ④ magnitude 붕괴: 카메라 'large' 2/203(1%) vs 같은 프롬프트 캐릭터 'large' 13회 — 모델 능력이 아니라 카메라 쪽 어휘만 억압.
- **handheld_drift 통계 착시**: 전체 23.6%가 drift인데 motion-contract가 `isStatic: true`로 컴파일("never travels, never pans") — 무빙 분포 셀 때 drift를 무빙으로 세면 과대평가. w260810 최종 화면 기준 정지 계약 16/20(80%).
- **둥둥 재검증 (ti2v-camera-cap-recheck, happy-horse 720p, 9클립 ≈$7)**: Sample2 실사 스트립 3샷(질주/발견 인서트/설정 와이드) × 3티어(T0 LOCKED / T1 moderate / T2 large), 제품 buildVideoPrompt 경유, 카메라 절만 변형. 라틴 스퀘어 블라인드 판독 3인 → **둥둥 0/9. T1·T2 이행 6/6(화면 기준 방향까지 발주 일치 — motion-contract 중의성 제거 문구 작동 실증). T0 LOCKED 위반 3/3** — 전부 콘텐츠 동기화 무빙(러너 커버리지/push-in/전진 크립), 부유 아님. 판독 원문:
  > T1 tracking 발주 → "fast lateral tracking to screen right, matched to the runner's pace … decelerates and comes to a complete stop" (둥둥 no)
  > T0 LOCKED 발주 → "Not static — travels and re-aims, always tracking the subject" (둥둥 no)
- **해석**: 현행 static-기본 계약은 둥둥 방지 장치가 아니라 **모델의 기본 성향(동기화 무빙)과 싸우는 계약**이고 운동 함의 콘텐츠에서 3/3 패배. 통제력 문제는 무빙 개방이 아니라 static 준수 쪽 (previz-verifier "모션 확대" 실측과 정합). 한계: 1fps 판독(초미만 워블 불가시), n=3샷×1모델, framing_stability 4지선다는 설계 결함(연속 이동과 표류를 한 라벨로 뭉갬 — 차기엔 분리).
- **캡의 사유 상태**: decoupage.ts:52-53 "둥둥" 주장은 2026-06-04 작성(커밋 894332f), 근거 문서(lab/previz-quality)는 8/5 대청소로 소실, **motion-contract(8/7) 배선 전 — 무빙 의도가 모델에 전달되지도 않던 시절의 관측**이었음이 확정.
- **안 통한 것**: 스테일 메모리 — 2레인 생성 디스패처(`research/experiments/utils/tools/gen/`)는 8/5 대청소(622e44e)로 삭제됐는데 메모리가 살아있어 셋업 시간 소모 → 메모리 정정 완료. 실험 생성은 제품 lib 직접 import 패턴(probe.mts가 사례).

### 계약 카탈로그 43건 (전수조사 — 전문·인용은 아티팩트, 여기는 색인)

리포트: https://claude.ai/code/artifact/e959e8e8-9135-41e7-8261-35e56b21f693
등급: ✅=사유+근거 실존, 🕳=사유 있으나 근거 소실(대부분 8/5 대청소 — git/백업 복구 가능), ❌=사유 없음

- **A 비대칭 마찰**: A1❌🕳 카메라 static 기본+motivated_move 정당화(decoupage.ts:52-53, "둥둥" — 본 세션에서 반증됨) · A2✅ 오픈 캐스트/로케 보수(s3:169,179 — s0.5가 상쇄 배선) · A3🕳 대사 침묵 기본+10초/라인 캡(dialogue.ts:105-118, lab/exp2 소실) · A4🕳 샷수 target±1(decoupage.ts:92-93) · A5🕳 레거시 카메라 6축 0 고정(generate-shots:95-117, "Plan 04" 소실)
- **B 금지/캡**: B1❌ 3중 동시 금지(v4:367 — 카메라 큰무브+캐릭터 큰액션+환경변화) · B2🕳 SHOT_PHYSICS 전역(physics.ts:6-20 — 2~8s·동사≤2·50~80자; **R1 회귀 배터리 소실로 사실상 동결**) · B3🕳 대표 캡 120+액션 3~6(budget.ts) · B4🕳 사이즈 사다리 3단 점프 금지(decoupage:99+c2:302 이중) · B5✅ 데쿠파주 동결(v4:327) · B6🕳 명대사 금지+메모리 slice 12/10(dialogue:122,163) · B7✅ 드라마투르그 발명 금지+상한12(s0:39-51,139) · B8✅ 모션 계약 절대문(motion-contract:56-130 — 정당하나 상류 편향을 무손실 운반) · B9✅ 프롬프트 절단 950/500(video-prompt:44 — 캡 값 근거는 없음) · B10✅ 채팅 updates 12 · B11❌ 레거시 exactly 6샷+5-10s(generate-shots:9,26 — physics와 모순, live 경로) · B12❌ 고정 negative_prompt · B13✅ 모더레이션 재작성 · B14✅ 애니 디폴트 차단
- **C 예시 편향**: C1❌ v4 camera magnitude "minimal"만·pan/tilt/crane/rack_focus 미명명(v4:470-480 — 하류 motion-contract 절은 구현돼 있으나 사어) · C2❌ v3 mounting "handheld" 단일·enum 5종 미열거(v3:149 — steadicam/mixed 사용 경로 부재, 틀렸을 때만 검증기가 어휘 개방) · C3❌ transition "cut"/"cut" 고정·6종 미명명(v4:485 — **둥둥과 동일 메커니즘 쌍둥이, DB 1쿼리 검증 가능**) · C4❌ v3 수치 단일값(3200K·4:1·[50]) · C5 duration 예시 6s(미미)
- **D 게이팅**: D1❌ mounting×energy 3조합만(v4:316-318 — 미정의 12/15 조합 어휘 개방 미명시, C2와 연쇄) · D2🕳 매체→avg_shot_seconds 허용 구간(v3:102-111 "구간 밖 금지" — #style-pacing 문서 부재) · D3❌ Compact 숏폼 "static or drift 위주"(v4:304-312) · D4 soft 프리셋(개방형)
- **E 압축**: E1🕳 한 액션=한 샷 · E2✅ 발화 물리(초당 4~6음절) · E3✅ 배경 200자 절단 · E4❌ 아티스트 900/1500자 · E5❌ 레거시 150자(physics와 모순) · E6 부분 v1 막당 1~2문장 · E7✅ 채팅 선택지 2~4
- **F 스타일 고정**: F1🕳 출력 영어 전역(E11 판정 원문 부재 — 역파생 체계로 정당성 높음) · F2✅ previz 흑백·마네킹 캐논(**사유 위생 최고** — 실측 인라인 다수) · F3✅ 색 단어 삭제 필터 · F4🕳 스타일 앵커 매체 고정(run id 실측은 live DB 검증 가능) · F5❌ 캐릭터 시트 접미사(cinematic↔studio lighting 상호 모순 공존) · F6❌ 레거시 "Cinematic." 접미사(v0 앵커와 충돌 가능) · F7✅ 기본 착장 앵커 · F8 역방향: 클리셰 면책(c1:43-70 — 관습 수렴 견제 채널의 명시적 무장해제, C1 검수 off라 잠재적)

**구조 관찰**: ① 카메라 축은 **6겹 독립 압력**(A1+C1+D1+D3+B8+A5)이 전부 static 방향 — 하나 풀어도 다섯 겹 잔존 ② **사유 위생 ∝ 파일 나이** — 7~8월 파일(러프보드·모션계약)은 실측 인라인, 레거시 레인은 전건 무사유 ③ 주석의 8자리 해시는 git 커밋이 아니라 writer run id.

## 2. 결정 — 코드로 귀결 안 된 것만

### D-2026-08-10-b: 캡 재검증의 판정 프레임 = "실패의 형태" (재사용 가능)
- 상황: "억압을 풀지 말지"류 판정 기준이 필요했음
- 결정: 승격/완화 신호는 실패**율**이 아니라 실패의 **형태** — 재시도로 수렴하지 않는(구조) 실패만 계약 개정의 근거. 판정축 자격 = "대안(3D/완화)이 구조적으로 고치는 것만" — 대안이 못 고치는 실패는 승격 근거 금지. 실험은 사전 등록(기각 조건 선확정) + 블라인드 판독(지각은 LLM, 채점은 코드) — previz-verifier 판정 3원칙 재사용 실증.
- 기각한 대안: 품질 점수 채점 — 이유: 변별력 무름이 기실측(2026-08-06).
- 감수하는 것: 1fps 판독의 초미만 워블 사각.

## 3. 미결

- 질문: **캡 완화 방식** — decoupage.ts:52-53(A1) 완화 시 C1(예시)·D1(게이팅)·B1(동시 금지)·D3(Compact)을 동반 수정할지. 캡만 풀면 예시 편향이 분포를 계속 누를 공산 — 닫히는 조건: 오너 결정 + 완화 배선 후 A/B run으로 무빙 분포 재측정.
- 질문: 완화 후 **G3 재측정** (뷰 경계 횡단 비율 — 3D 모션 논거의 최종 종결 조건). 현 1~5%는 계약 압축 후 수요였음.
- 질문: **역전 발견의 처방** — (2호 `static-compliance-ab`로 부분 닫힘, 2026-08-10 같은 날) 강화 문구(고정 마운트+프레이밍 불변식+피사체 이탈 허용) A/B 결과: 완전 준수 1/3로 사전 등록 채택 기준(≥2/3) 미달 → **기각, 배선 안 함**. 단 실측: 피사체 추종 0/3 소멸(진단 적중), CU 완전 준수 전환, 질주 샷에서 피사체 프레임아웃 화면 최초 확보. 남은 고장 재정의: **"빈 시간 채우기 전진"**(피사체 퇴장 후 꼬리 push / 무인물 샷 크립). 남은 미결: 문구 v2(빈 프레임 유지 지시) 3호 vs 프롬프트 밖 해법(꼬리 트림·모델 교체) — 오너 선택 + 정적 콘텐츠 샷 준수율은 여전히 미측정.
- 질문: 재검증 후보 실측 — ① C3 transition 분포(DB 1쿼리) ② C2 mounting 분포 ③ D3 숏폼 vs 장편 카메라 분포 대조 ④ D2 컷리듬 구간. 닫히는 조건: 각 1쿼리/1대조.
- 질문: **SHOT_PHYSICS R1 배터리 복구** — "값 변경 시 배터리 재실행이 계약"인데 배터리 소실. 닫히는 조건: git 622e44e 이전/백업에서 복원 또는 계약 문구 개정.
- 잔가지: dynamic_spec enum 무검증 통과(medium/small/shake/none — v4 산출층) — 검증기 추가 여부 / 다른 영상 모델(seedance/kling/veo) 일반화 프로브 / 판독 라벨 4지선다 재설계.

## 좌표

- 실험 1호: `research/experiments/ti2v-camera-cap-recheck/` (HYPOTHESIS.md·probe.mts·result.md·provenance.json·assets 9clips)
- 실험 2호: `research/experiments/static-compliance-ab/` (강화 문구 A/B — 기각·질적 개선 실측. 리포트: https://claude.ai/code/artifact/bc7c9609-3a22-4fc7-9c70-baabf8b3975c)
- 카탈로그 아티팩트: https://claude.ai/code/artifact/e959e8e8-9135-41e7-8261-35e56b21f693
- 둥둥 재검증 HTML 리포트(증거 프레임 포함): https://claude.ai/code/artifact/303af64d-0acc-42e6-881e-a61dd1dab814
- G3 실측 스크립트: 세션 스크래치패드 bg-audit.mjs·motion-trace.mjs (일회성 — 재현은 result.md 좌표로)
- 같은 날 병행 맥락(별건): 배경 뷰 시트 vs 3D 판정 기준 → [[2026-08-10-background-view-3d]]로 증류됨 (판정 프레임 D-2026-08-10-b를 그쪽 승격 게이트가 공유)
