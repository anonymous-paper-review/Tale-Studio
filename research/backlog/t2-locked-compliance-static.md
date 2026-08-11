```yaml
id: t2-locked-compliance-static
source: .claude/vault/2026-08-10-prompt-contract-audit.md §3 (역전 발견의 처방 — 닫히는 조건: 정적 콘텐츠 LOCKED 준수율 실측)
tier: T2
budget: { usd: 7, runs: 1, wall_min: 120 }  # 9클립 — 1호(ti2v-camera-cap-recheck) 실측 단가
blockers: [ "owner-approval:$7 (_MORNING.md Q3)" ]
status: blocked
priority: high
```

- **가설**: LOCKED(static) 계약 위반은 콘텐츠 운동성의 함수다 — 운동 함의 샷에선 3/3 위반이었지만, 정적 콘텐츠 샷에선 준수된다.
- **전제**: 1호 실측 — T0 LOCKED 위반 3/3은 전부 콘텐츠 동기화 무빙(러너 커버리지/push-in/전진 크립), 둥둥 0/9. "정적 콘텐츠에서의 준수율은 이번 실험 밖"이 미결의 닫히는 조건.
- **예측**: 참이면 정적 콘텐츠 샷 LOCKED 준수 ≥2/3 — 처방은 "운동 함의 샷 한정 대응"(adherence 트랙 등록 쪽). 거짓이면 위반 지속 — "위반은 콘텐츠 무관, static 계약문 자체가 약함" → 계약문 강화 쪽.
- **측정**: 정적 콘텐츠 샷 3개 × 3반복 = 9클립, happy-horse 720p, 제품 buildVideoPrompt 경유(1호 probe.mts 패턴 — 제품 직접 import), LOCKED(T0) 카메라 절 고정. 판독: 라틴 스퀘어 블라인드(1호 프로토콜 재사용), framing_stability 라벨은 연속 이동/표류 **분리**(1호 설계 결함 반영 — 4지선다 뭉갬 금지).
- **기각 조건**: 정적 콘텐츠에서도 위반 >1/3 → 가설 기각(계약문 강화 안건이 승기). 판정 결과는 어느 쪽이든 Q2(캡 완화)·Q3 카드에 처방 증거로 첨부.

## 좌표 (동결)

- 샷 선정: 러프 DIRECTION 패널 실판독 기준 "STATIC HOLD" 라벨 샷(액션 텍스트 아님 — sh_07_57 기각 선례). 선정 풀: `research/experiments/previz-channel-ablation/run/label_scan.json` (83샷 전수 실판독). 후보 예: sh_02_10(1호 A1의 정지 샷) 외 STATIC HOLD 2개.
- 생성 선례: `research/experiments/ti2v-camera-cap-recheck/probe.mts` (fal 단일 레인, 제품 lib 직접 import). 판독 프로토콜: 같은 실험 result.md의 라틴 스퀘어 3인 블라인드.

## 산출 계약

- `research/experiments/t2-locked-compliance-static/{result.md, results.json, provenance.json}` + 클립 원본은 로컬 assets/(gitignore 선례).
- status 갱신 + reports 1줄(지출 명기) + Q2·Q3 카드에 처방 증거 링크.
