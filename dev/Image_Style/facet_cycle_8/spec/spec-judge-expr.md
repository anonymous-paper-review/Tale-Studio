# 작업: 사이클 8 표정 우선 검증 — 세 레퍼런스

첨부 이미지 9장, 레퍼런스 순서 refer4 → refer1 → refer2로 각각 (원작, D1 액션, D3 액션). D1 액션 = 눈 절 v2(표정 우선 문장 포함) + `[원작, 얼굴~어깨 크롭]`, 장면 표정 지시 없음. D3 액션 = D1과 같은 텍스트에 장면 표정 한 문장("a fierce shout, brows pulled down, eyes narrowed in effort, mouth wide open")을 추가. 이 폴더의 `gen/<ref>_d1_action.txt`·`gen/<ref>_d3_action.txt`를 읽고 `residuals-expr.md`를 쓴다. 고유명사 금지. 다른 파일 수정 금지, 외부 검색 금지. 최종 메시지에 `residuals-expr.md` 전문.

질문: 눈 절 끝의 표정 우선 문장("the expression sets the lid opening and corner angle and takes priority … while the iris rendering, catchlight count and outline colour stay as described")이 작동하는가 — D3에서 **표정이 눈 개폐·눈꼬리를 바꾸고**, 동시에 **홍채 단계·광점 개수·윤곽선 색은 눈 절대로 남는가**. 원작 값은 판정자가 원작을 확대해 직접 잰다.

## residuals-expr.md 형식 (표 헤더 글자 그대로)

# 사이클 8 표정 우선 판정

## 1. 레퍼런스별 대조
레퍼런스마다 표 하나: `| 항목 | 원작(판정자) | <ref> D1 액션 | <ref> D3 액션 |` 행 = 표정 표현 정도(0~5, D3는 지시한 고함 표정이 드러난 정도) · 기본 개폐 대비 눈 좁아짐(○/×) · 눈꼬리 각도 변화(○/×) · 홍채 단계 수 · 광점 개수 · 윤곽선 색 · 표정에 밀려 사라진 눈 절 항목(있으면 이름). 표 아래 한 줄: `표정 우선 <ref>: 표정 n/5 · 눈 절 유지 m/3` (m = 홍채 단계·광점 개수·윤곽선 색 중 원작대로 남은 수).

## 2. 총평
표정 우선 문장이 작동했는가(세 레퍼런스 중 몇에서 표정과 눈 절이 공존했는가) 2문장, 표정이 눈 절을 덮어쓴 항목이 있으면 어느 것인지 1문장, 문장을 고칠 필요가 있으면 어떻게 1문장.
