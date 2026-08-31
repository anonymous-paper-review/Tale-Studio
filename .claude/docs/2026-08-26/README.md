# 2026-08-26 이슈 그룹화 인덱스

오너 리뷰 세션(2026-08-26)에서 나온 45개 이슈를 "고치는 방법이 같은 것끼리" 9개 그룹으로 묶었다.
각 그룹 문서에 이슈 목록·추정 원인·논의 필요 항목·완료 조건을 기록한다.

## 그룹 목록 (추천 진행 순서)

| 순서 | 문서 | 그룹 | 성격 | 항목 수 |
|---|---|---|---|---|
| 1 | [Notion 이관](https://app.notion.com/p/A-3cd3b513ca7e81aca144c7a5fc4641c2) | A. 작업 날아감 | 버그 (신뢰 파괴) | 3 |
| 2 | [Notion 이관](https://app.notion.com/p/B-3c93b513ca7e81de8023d2740477065f) | B. 챗 명령→실행 끓김 | 버그 (신뢰 파괴) | 5 |
| 3 | [Notion 이관](https://app.notion.com/p/C-3cd3b513ca7e81bc9b46c8fd4974fce6) | C. 생성 파이프라인 버그 | 버그 | 8 |
| 4 | [Notion 이관](https://app.notion.com/p/E-UI-3cd3b513ca7e81559e55e2e9049c7d34) | E. UI 잘림/노출 버그 | 버그 (저비용) | 5 |
| 5 | [Notion 이관](https://app.notion.com/p/D-3cd3b513ca7e81719fb8d537376dc82e) | D. 챗 가이드/수다 | 에이전트 행동 설계 | 10 |
| 6 | [Notion 이관](https://app.notion.com/p/F-UI-UX-3cd3b513ca7e8192b675ec84195ac817) | F. UI/UX 개선 | 개선 | 12 |
| 7 | [group-g-generation-quality.md](group-g-generation-quality.md) | G. 생성 품질/프롬프트 | 로직 개선 | 7 |
| 8 | [group-h-new-features.md](group-h-new-features.md) | H. 신규 기능 | 기능 | 6 |
| 9 | [group-i-ops.md](group-i-ops.md) | I. 운영 | 오너 액션 | 1 |

## 진행 상태

- [x] **A — 완료 (A1·A2·A3 전부 닫힘) · 문서 Notion 이관**. 셋 다 뿌리가 같았다: 화면을 떠난 사이 벌어진 일을 앱이 되찾지 못함.
  A3 트림·컷 영속화 / A2 Writer 진행바·Director 영상 stage-away 재현·수리·배포 검증 / A1 좀비 잡이 재생성을 영구 차단하던 사슬 절단.
  부수 확정: 동시 생성 한도 영상 3 · 이미지 6 분리 풀, 전역 34(fal 실측 천장 40), admin 면제.

- [x] **B — 닫힘 (2026-08-31) · 문서 Notion 이관**. 계측 27ebaf3 → 승인 카드 표준 0c45689 → 거짓 수락 제거·soft 경고 5f294cc → 마감 실측 05c20f8·4c8c1fb(발화 11개 11/11 정분류 · B2·B3·B5 실측 · 대사 필드 유실 수리). 리포트 HTML 원본도 [Notion](https://app.notion.com/p/B-HTML-3cd3b513ca7e8138a955ddf6e67025ec)에 있다
- [x] **C — 완료 (8건 전부 닫힘) · 문서 Notion 이관**. 오늘 연 것 4건(C3 전체 재생성 경로·C4 화면 튀·C5 진입 자동 생성·C7 특정), 이미 닫혀 있던 것 4건(C1 그룹 A / C6·C7·C8 다른 세션)
- [~] D — **D10~D13 닫힘(main 9e322ab), D1~D9 재개 가능 · 원장 Notion 이관** (D1 4단계는 B의 trace 인프라 구독으로 구현)
- [→] E — **이관됨** (다른 개발자) · 인계 문서는 Notion(위 표 링크)
- [→] F — **이관됨** (다른 개발자) · 인계 문서는 Notion(위 표 링크)
- [~] G — **G1 완료**. G3·G6 일부 완료, G2·G4·G5·G7은 코드 배선/비교 재료 준비 후 오너 판정 대기. [G4 설계·리포트·증거는 Notion 이관](https://app.notion.com/p/G4-2026-08-27-3cd3b513ca7e81c49231da41335fe9a2)
- [~] H — **H1·H2·H3 닫힘**(Director 배선·체인·전체 영상 생성 main 착륙), H4·H5·H6 열림
- [ ] I

## 그룹화 원칙

- 증상이 아니라 **공통 원인/공통 해결 경로** 기준으로 묶는다.
- 하나의 그룹 = 한 번의 논의 → 한 묶음의 태스크로 떨어지는 단위.
- 여러 화면에서 반복되는 증상(상태 유실, @멘션 잘림, 내부 ID 노출)은 화면별로 쪼개지 않고 하나로 묶는다 — 원인이 하나일 가능성이 높다.
