# Writer 실험 디렉토리 — 운영 규칙

> 프롬프트·파이프라인 변경을 실측으로 게이트하는 실험의 계획과 결과가 사는 곳.

**먼저 볼 것**: 전체 상태판은 [`INDEX.md`](INDEX.md), 폴더·명명 규칙은 [`CONVENTIONS.md`](CONVENTIONS.md). 이 문서는 하네스 실행 런북이다.

## 구조

전체 규칙은 [`CONVENTIONS.md`](CONVENTIONS.md). 요약하면 2계층(트랙/실험) 콜로케이션:

```
experiments/
  INDEX.md                     ← 상태판 (트랙별 실험 목록·옛 E번호 별칭·판정 결과)
  CONVENTIONS.md               ← 폴더·명명 규칙
  README.md                    ← 이 파일 (하네스 실행 런북)
  _templates/result.md         ← 결과 기록 템플릿
  _tools/                      ← 트랙 공용 스크립트
  campaign-2607/               ← 첫 캠페인의 계획서·회고·일괄 판정
  <트랙-슬러그>/                ← 예: foundation, validators, continuity-copy …
    <ISO날짜_실험-슬러그>/       ← 실험 폴더 (design.md·result.md·assets/·tools/)
```

## 규칙

1. **실측 없는 프롬프트 변경 금지** — 프롬프트/파이프라인을 바꾸는 커밋은 대응하는 `results/` 파일이 먼저 존재해야 한다. 예외는 W그룹(계획서 §2 — 죽은 문구 제거 등 저위험 청소)뿐이며, W그룹도 회귀 배터리(R1) 결과 파일로 갈음한다.
2. **결과 파일이 진실** — 계획서의 상태 표는 요약일 뿐. 수치·로그 경로·판정 근거는 결과 파일에.
3. **원시 로그는 `logs/writer-stage-exp/`** (하네스가 자동 저장, git 미추적) — 결과 파일에는 요약 수치와 로그 경로·실행 커밋 해시를 남긴다. 로그가 지워져도 결과 파일만으로 재현 가능해야 한다.
4. **상태 태그**: ⬜ 대기 / 🔵 진행 / ✅ 채택(변경 반영) / ❌ 기각(변경 안 함) / ⏸ 보류. 결과 파일 생성·판정 시 계획서 상태 표를 갱신한다.
5. **판정 기준은 실행 전에 확정** — 카드에 적힌 판정 기준을 실행 후에 고치지 않는다. 기준이 틀렸다고 판단되면 결과 파일에 "기준 수정 + 이유"를 남기고 재실행.

## 실행 도구

- **하네스**: `tests/pipeline/writer_stage_experiment.test.ts` — 실 stage 함수 직접 호출(시스템프롬프트 코드와 100% 동일). 프리셋/스테이지 추가는 파일 내 `PRESETS`/`STAGE_FNS`.
  ```bash
  RUN_WRITER_STAGE=1 WRITER_INPUT=<preset> WRITER_STAGES=<stages> \
    npx vitest run tests/pipeline/writer_stage_experiment.test.ts --disable-console-intercept
  ```
- **DB 감사**: supabase-js(service role)로 `writer_runs.state` pull — 패턴은 `scripts/verify-db.mjs`.
- **V축 스테이지 실험 선행 작업**: `sceneCinematography`·`decoupage`·`shotDesign`은 v0/v2 산출이 선행 필요 → `STAGE_FNS`에 체인을 잇거나 stub 제공 (길이실험 문서 §6).

## 관련 문서
- [`INDEX.md`](INDEX.md) — 트랙별 실험 상태판 (옛 E번호 별칭·판정 결과)
- [`campaign-2607/plan.md`](campaign-2607/plan.md) — 첫 캠페인 계획서
- [`../records/2026-07-21-writer-prompt-audit.md`](../records/2026-07-21-writer-prompt-audit.md) — 실험의 출처(감사 발견)
- [`../canon/writer-job-model.md`](../canon/writer-job-model.md) — 판정의 기준(P1~P7)
