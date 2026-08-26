# 2026-08-26 이슈 그룹화 인덱스

오너 리뷰 세션(2026-08-26)에서 나온 45개 이슈를 "고치는 방법이 같은 것끼리" 9개 그룹으로 묶었다.
각 그룹 문서에 이슈 목록·추정 원인·논의 필요 항목·완료 조건을 기록한다.

## 그룹 목록 (추천 진행 순서)

| 순서 | 문서 | 그룹 | 성격 | 항목 수 |
|---|---|---|---|---|
| 1 | [group-a-state-loss.md](group-a-state-loss.md) | A. 작업 날아감 | 버그 (신뢰 파괴) | 3 |
| 2 | [group-b-chat-execution.md](group-b-chat-execution.md) | B. 챗 명령→실행 끊김 | 버그 (신뢰 파괴) | 5 |
| 3 | [group-c-generation-bugs.md](group-c-generation-bugs.md) | C. 생성 파이프라인 버그 | 버그 | 8 |
| 4 | [group-e-ui-breakage.md](group-e-ui-breakage.md) | E. UI 잘림/노출 버그 | 버그 (저비용) | 5 |
| 5 | [group-d-chat-guidance.md](group-d-chat-guidance.md) | D. 챗 가이드/수다 | 에이전트 행동 설계 | 10 |
| 6 | [group-f-ui-ux.md](group-f-ui-ux.md) | F. UI/UX 개선 | 개선 | 12 |
| 7 | [group-g-generation-quality.md](group-g-generation-quality.md) | G. 생성 품질/프롬프트 | 로직 개선 | 7 |
| 8 | [group-h-new-features.md](group-h-new-features.md) | H. 신규 기능 | 기능 | 6 |
| 9 | [group-i-ops.md](group-i-ops.md) | I. 운영 | 오너 액션 | 1 |

## 진행 상태

- [~] A — **A3 닫힘** (트림·컷 영속화 수리, 실브라우저 재검증). **A2 측정 배선 완료** — 거부 기록·실패 사유·화면 반영 좌표 + 토스트, 데이터 수집 중. **한도 정책 확정** — 영상 3 / 이미지 6 분리 풀 + admin 면제. A1 재현 대기. (group-a 문서의 결정 brief 참조)
- [ ] B
- [ ] C
- [ ] D
- [ ] E
- [ ] F
- [ ] G
- [ ] H
- [ ] I

## 그룹화 원칙

- 증상이 아니라 **공통 원인/공통 해결 경로** 기준으로 묶는다.
- 하나의 그룹 = 한 번의 논의 → 한 묶음의 태스크로 떨어지는 단위.
- 여러 화면에서 반복되는 증상(상태 유실, @멘션 잘림, 내부 ID 노출)은 화면별로 쪼개지 않고 하나로 묶는다 — 원인이 하나일 가능성이 높다.
