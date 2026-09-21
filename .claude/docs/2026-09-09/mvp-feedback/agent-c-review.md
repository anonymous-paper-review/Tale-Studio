# C 담당자의 통합 검토

읽기 전용 검토 범위: D 진행·상태 공유·숫자·사이드바와 A 채팅 승인·보류·실행 회복. 스타일 취향은 제외했습니다.

| 중요도 | 실제 사용자 영향 | 근거와 재현 | 전달/처리 |
|---|---|---|---|
| 높음 | 중앙 진행 막대가 채워지지 않음 | `writer-generation-view.tsx`의 CSS width가 퍼센트 대신 `progress.countLabel`(예: ‘단계 1/4’)을 받았습니다. | 주 담당자에게 전달, `${pct}%`로 수정 확인. 러프 진행 막대도 함께 수정했다고 응답받음. |
| 높음 | Writer 재시작 직후 한 번의 네트워크 오류로 진행 갱신이 멈춤 | `use-writer-status.ts`의 tick finally가 캐시의 `pipeline_failed`를 이번 요청의 결과처럼 사용합니다. failed 상태 → 서버 resume → restart → 첫 status 요청 500/네트워크 실패이면 후속 타이머를 예약하지 않습니다. | 주 담당자에게 전달. 검토 당시 수정 대기. |
| 중간 | 저장을 끝낸 Artist 설명이 계속 ‘진행 중’으로 보고됨 | `approvePendingProposal` 루프가 `!receipt && item.stage === 'artist'`이면 항상 In progress를 말합니다. 원천 설명 저장은 이때 끝났습니다. | A 담당자가 실제 경로 회귀 실패 후 수정했다고 보고했습니다. |
| 중간 | 기존 작업 확인이 완료돼도 ‘진행 중’으로 보고될 수 있음 | `pollGenerationJob`의 중복 폴링 경로는 기존 Promise만 돌려주므로 새 observer를 부르지 않습니다. 보류 복구가 해당 경로를 타면 완료 후에도 `itemReceipt=null`이고 같은 In progress 분기로 갑니다. | A 담당자가 실제 경로 회귀 실패 후 수정했다고 보고했습니다. 반환 URL로 완료 영수증을 만들고 기존 작업 실패는 생성 실패로 구별합니다. |
| 낮음 / 실행 옵션 제한 | 병합 실행에서 단계 수가 한 개 적게 보임 | `progress-view`는 초안을 무조건 4단위로 가정합니다. `WRITER_MERGE_S1S3=1`이면 narrativeStructure가 scenes까지 만들고 scenes는 has=true로 생략됩니다. `completed_units`는 실제 실행 스텝만 증가하므로 확정 대기 3/4·후반 1단위 부족이 가능합니다. | 주 담당자에게 전달. 기본 옵션은 off이며 전 경로 보증의 제한으로 남김. |

이 검토에서 다른 담당자의 구현을 직접 수정하지 않았습니다. C 영역에서 통합 정적검사가 지적한 2건은 별도로 바로잡았습니다: preview의 한글 탐지 정규식에 정당한 설명 주석을 추가했고, preview 언어 구독은 동일 순수 함수와 store 원시값을 사용하게 바꿨습니다. 훅 참조 검사와 C 경계·렌더 23개 테스트가 통과했습니다. 통합 i18n 스캔에 남은 항목은 당시 playground와 A의 사용자 입력 정규식이었습니다.
