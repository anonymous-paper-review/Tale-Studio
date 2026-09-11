당신은 스타일 판정자다. 아래 파일을 Read 도구로 직접 보고(이미지는 Read가 렌더링해 준다) `<JUDGE_DIR>/residuals-expr-claude.md`를 작성한다. 다른 파일은 만들거나 고치지 않는다. 한국어로 쓴다. 작가·작품·프랜차이즈·브랜드·캐릭터 고유명사는 절대 쓰지 않는다. `.claude/vault/`는 읽지 않는다. 이미지는 한 장씩 통째로 Read 하고 크롭은 한 번에 2장 이하로(스크래치패드에만).

# 사이클 8 표정 우선 검증 (Claude) — 세 레퍼런스

파일 (레퍼런스 순서 refer4 → refer1 → refer2):
- refer4: 원작 `/home/user/Downloads/Tale-Studio/dev/Image_Style/refer4.jpg` · D1 액션 `/home/user/Downloads/Tale-Studio/dev/Image_Style/facet_cycle_8/refer4/gen/d1_action.png` · D3 액션 `/home/user/Downloads/Tale-Studio/dev/Image_Style/facet_cycle_8/refer4/gen/d3_action.png` · 프롬프트 `/home/user/Downloads/Tale-Studio/dev/Image_Style/facet_cycle_8/refer4/gen/d1_action.txt`, `d3_action.txt`
- refer1: 원작 `/home/user/Downloads/Tale-Studio/dev/Image_Style/refer1.jpg` · D1 액션 `/home/user/Downloads/Tale-Studio/dev/Image_Style/facet_cycle_8/refer1/gen/d1_action.png` · D3 액션 `/home/user/Downloads/Tale-Studio/dev/Image_Style/facet_cycle_8/refer1/gen/d3_action.png` · 프롬프트 `/home/user/Downloads/Tale-Studio/dev/Image_Style/facet_cycle_8/refer1/gen/d1_action.txt`, `d3_action.txt`
- refer2: 원작 `/home/user/Downloads/Tale-Studio/dev/Image_Style/refer2.png` · D1 액션 `/home/user/Downloads/Tale-Studio/dev/Image_Style/facet_cycle_8/refer2/gen/d1_action.png` · D3 액션 `/home/user/Downloads/Tale-Studio/dev/Image_Style/facet_cycle_8/refer2/gen/d3_action.png` · 프롬프트 `/home/user/Downloads/Tale-Studio/dev/Image_Style/facet_cycle_8/refer2/gen/d1_action.txt`, `d3_action.txt`

산출물은 `<JUDGE_DIR>/residuals-expr-claude.md` 하나. 파일을 쓴 뒤 최종 보고에는 `표정 우선 <ref>:` 세 줄과 총평만 붙여라.

질문: 눈 절 끝의 표정 우선 문장("the expression sets the lid opening and corner angle and takes priority … while the iris rendering, catchlight count and outline colour stay as described")이 작동하는가 — D3에서 **표정이 눈 개폐·눈꼬리를 바꾸고**, 동시에 **홍채 단계·광점 개수·윤곽선 색은 눈 절대로 남는가**. 원작 값은 판정자가 원작을 확대해 직접 잰다.

## residuals-expr-claude.md 형식 (표 헤더 글자 그대로)

# 사이클 8 표정 우선 판정

## 1. 레퍼런스별 대조
레퍼런스마다 표 하나: `| 항목 | 원작(판정자) | <ref> D1 액션 | <ref> D3 액션 |` 행 = 표정 표현 정도(0~5, D3는 지시한 고함 표정이 드러난 정도) · 기본 개폐 대비 눈 좁아짐(○/×) · 눈꼬리 각도 변화(○/×) · 홍채 단계 수 · 광점 개수 · 윤곽선 색 · 표정에 밀려 사라진 눈 절 항목(있으면 이름). 표 아래 한 줄: `표정 우선 <ref>: 표정 n/5 · 눈 절 유지 m/3` (m = 홍채 단계·광점 개수·윤곽선 색 중 원작대로 남은 수).

## 2. 총평
표정 우선 문장이 작동했는가(세 레퍼런스 중 몇에서 표정과 눈 절이 공존했는가) 2문장, 표정이 눈 절을 덮어쓴 항목이 있으면 어느 것인지 1문장, 문장을 고칠 필요가 있으면 어떻게 1문장.
