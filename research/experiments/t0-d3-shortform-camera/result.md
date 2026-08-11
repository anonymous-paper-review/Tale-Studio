# t0-d3-shortform-camera — D3 숏폼 카메라 게이팅 실측

- **날짜**: 2026-08-11 (밤 러너)
- **판정**: **측정 불가 — 모집단 부재** (사전 등록 경로: "숏폼 완료 프로젝트 0개면 그것도 답")
- **출처 티켓**: `research/backlog/t0-d3-shortform-camera.md` ← prompt-contract-audit §3 재검증③ (카탈로그 D3❌)

## 무엇을 확인했나

가설("D3 Compact 숏폼 게이팅이 숏폼 카메라 분포를 장편보다 정적으로 누른다")을 재려면
Compact Mode로 완주한 프로젝트가 필요하다. **live DB의 writer_runs 전수(shotDesign 보유 26런)를
스캔한 결과 `state.compact === true`인 런이 0개다** — 전부 일반 모드(장편)였다.

Compact 판별자는 추측이 아니라 코드로 확정했다:
- `steps.ts:162` `const compact = s.compact === true;` → `:174` compact면 v4에 scene plans를 null로 전달
- `steps.ts:420` `const compact = isCompactDepth(genre.depth_level);` — 매체 깊이에서 유도
- `steps.ts:413-415` 주석 원문: "compact 모드는 sceneCinematography=[]라 배열 존재만으로는 구분 불가 → compact 플래그로 '실행됨'을 판정"

즉 D3 게이팅 계약(v4_shots.ts:304-312 — "[Compact Mode] camera_motion.type: 짧은 영상은 단순/안정 우선
(static or handheld_drift 위주)")은 **한 번도 실행된 적 없는 잠재 계약**이다.

## 판정의 의미 (Q2 함의)

- D3❌ 재검증은 데이터로 닫을 수 없다 — 숏폼 런이 생기기 전까지 D3는 분포에 영향 0 (실행 이력 자체가 없음).
- Q2(캡 완화)의 동반 수정 후보에서 D3는 **현재 무해가 실측됨** — 완화 우선순위에서 제외 가능.
  단 숏폼 기능을 쓰기 시작하면 그때 이 티켓을 재활성화해야 한다(장편 기준선 G3는 이미 보유).

## 좌표

- 스캔: live DB writer_runs 전수 (read-only), `state.compact` 플래그 기준 — 26런 전부 false. `results.json`에 수치.
- 게이팅 계약: `src/lib/writer/pipeline/stages/v4_shots.ts:304-312` / 플래그 유도: `src/lib/writer/pipeline/steps.ts:115,162,174,413-420`
- 장편 기준선(미사용): G3 실측 — Sample1 3~4%, w260810 5%, Upload_test 1.4%
