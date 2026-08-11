# tale-studio — 문서 지도

> 이 파일은 인덱스다. 내용을 여기 쓰지 말고 링크 대상 문서를 개정하라.
> 규칙은 `.claude/rules/`(자동 로드), 디자인 가이드는 UI 작업 시 훅이 주입한다.

## 진실원

- 코드(`src/`)와 live Supabase DB가 진실원이다. 코드로 유도 가능한 내용은 문서로 만들지 않는다.
- `specs/design.md` — 유일한 정본 문서 (디자인 판별 규칙. 토큰 값 자체는 `src/app/globals.css`가 진실)
- 2026-08-05 대청소: 코드 유도 가능/레거시 문서 전량 삭제 (docs, specs 일부, research 레거시, databases).
  복구는 git 히스토리 또는 `~/tale-studio-backup-2026-08-05.tar.gz`

## 기록 (날짜 박힌 세션 증류 — 과거 사실)

- `.claude/vault/` — 세션별 실측·삽질·결정 기록 (포맷: `_TEMPLATE.md`). 같은 주제를 다시 팔 때 먼저 검색
- `.claude/vault/_DEFERRED.md` — **미뤄둔 작업 상시 원장** (날짜 파일 아님). "결정은 났는데 지금 안 하는 것"이 여기 모인다 — 새 작업을 고르기 전에 먼저 열어볼 것
- `.claude/vault/_archive/` — 완료·폐기·무효화된 것 (원장과 인덱스는 열린 것만 보여야 한다)
- `.claude/vault/2026-08-05-truth-source-cleanup.md` — "문서가 왜 다 없지?"·실험 규칙/대청소의 근거가 궁금하면 먼저
- `.claude/vault/2026-08-06-previz-verifier.md` — previz 검증기/품질 채점을 다시 팔 때 먼저 (변별력 실측·판정 3원칙·보류 축의 이유)
- `.claude/vault/2026-08-10-dramaturgy-world-derivation.md` — 드라마투르그/유도 주무대/세계 개발을 다시 팔 때 먼저 (기원 통찰 원문·채택 실측·본질 미결 논제)
- `.claude/vault/2026-08-10-llm-quota-capacity.md` — "몇 명까지 버티나"·429·모델 교체를 다시 팔 때 먼저 (한도 실측·1런 부하 프로파일·병목 축별 범인·V축 산출물 수명)
- `.claude/vault/2026-08-10-prompt-contract-audit.md` — 프롬프트 억압/캡 완화/카메라 무빙을 다시 팔 때 먼저 (계약 43건 색인·둥둥 반증 실측·6겹 압력·재검증 미결)
- `.claude/vault/2026-08-10-background-view-3d.md` — 배경 레퍼런스/뷰 시트/3D 도입 판정을 다시 팔 때 먼저 (뷰 클러스터 실측·previz 배경 무방어 증거·승격 게이트와 미결 bar)
- `.claude/vault/2026-08-10-flash-ab-fanout-review.md` — 모델 교체/검수 가치/로그 열람 오탐을 다시 팔 때 먼저 (lite 기각의 진짜 사유=repairJson 무신호 손실·shotCheck 검수 분포 실측·증류 분류기 우회)
- `.claude/vault/2026-08-10-writer-integrity-performance.md` — 2레인/대사 조인/검수 실험을 다시 팔 때 먼저 (오염 감사 18/22·fan-out과 다이어트 기각 교훈·재persist 보류·커밋 색인)
- `.claude/vault/2026-08-10-previz-motion-channel.md` — **다음 세션 재개 지점** — previz/모션 채널/생성기 실측을 이어갈 때 먼저 (축 A 실측·계기 결함 진단·모션 채널 3중 약점·내일 아젠다 3질문·아티팩트 링크)
- `.claude/vault/2026-08-11-writer-entity-map-audit.md` — writer 엔티티가 어디까지 가는지·왜 끊겼는지를 다시 팔 때 먼저 (엔티티 60개 전수·끊긴 배선 14건·경로 쌍 3결정 미결·step 라우트 무인증 실측)
- `.claude/vault/2026-08-11-blockout-previz-video-reference.md` — 프리비즈 영상 레퍼런스/3D 블록아웃/각색 연출 리서치를 다시 팔 때 먼저 (모션 전달 제3후보·Seedance video_urls 기배선 실측·3암 실험 스케치·리포트 아티팩트)

## 실험

- 실험 시작 전 가설 폼: `research/experiments/_HYPOTHESIS.md` (5줄 — 가설/전제/예측/측정/기각 조건)
- 실험 코드 규칙: `.claude/rules/experiments.md` — 복붙 금지·입력 고정·좌표 기록
- 밤 실험 원장: `research/backlog/` — 미결을 밤 실행 티켓(_TEMPLATE.md)·아침 결정 카드(_MORNING.md)로 변환, 러너 규칙은 _NIGHT.md. /warp 라우팅 6이 채움

## 세션 리추얼

- 세션 종료 시 `/warp` — 코드로 귀결 안 된 것(결정·삽질·미결·미뤄둔 작업)을 vault로 증류 (구 `/wrap`, 2026-08-11 개명)
- 결정은 vault 파일의 `## 결정` 섹션에. 반복 참조되는 결정만 정본(rules/specs)으로 승격
- **미결과 미뤄둔 작업은 다른 저장소** — 결론 없음은 vault `## 3. 미결`, 결정됐지만 지금 안 함은 `_DEFERRED.md`
- 세션 중 닫힌 것은 그 자리에서 아카이브 — 완료된 미뤄둔 작업은 `_archive/_DEFERRED-done.md`로 이동
