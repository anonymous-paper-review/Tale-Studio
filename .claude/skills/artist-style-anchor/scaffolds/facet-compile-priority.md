<!-- 확정 레시피 R1의 "방향어 + 우선순위 줄" 조립 스펙 (2026-10-02 오너 확정, 가이드 §6 36). facet 사이클 9의 R1c 조건에서 쓴 스펙에
     2026-10-09 오너 결정(사이클 11 A2, 프리셋 v4)으로 **방향어 상한**("slightly" + 끝 문장)을 넣었고, 등신 주석 조건을 가이드 §6 36 ③의 뜻대로 고쳤다
     (모발을 제외하고 두개골 정수리를 추정한 값에는 붙이지 않는다 — 이전 문구는 프리셋 12종 중 10종에 주석을 잘못 붙였다).
     컴파일이 끝난 폴더(filled.json + prompts.md)에서 priority.md를 만든다. 손 항목 보강은 들어 있지 않다(다음 사이클 검증 후보). -->

# 작업: 우선순위 줄과 방향어 보강 (가이드 §6 36 — 방향어 상한 포함)

이 폴더의 `filled.json`과 `prompts.md`만 보고 `priority.md`를 쓴다. 원본 이미지는 없다. 템플릿에 없는 속성을 지어내지 마라. 작가·작품·브랜드 고유명사 금지. 다른 파일을 만들거나 고치지 마라. 외부 검색 금지. 최종 메시지에 `priority.md` 전문.

배경: 같은 참조 이미지에서 손으로 쓴 스타일 프롬프트는 "oversized", "compressed", "very thick" 같은 방향어와 끝에 붙인 우선순위 줄로 과장을 전달했고, 우리 컴파일은 수치("0.72 head high", "0.88% of width")만 실어 생성기가 과장을 약하게 그렸다. 수치는 그대로 두고 방향어와 우선순위 줄만 보탠다. 다만 상한 없는 방향어는 원작보다 과장을 불렀으므로(신발 1.3머리 → 1.6머리) 문턱을 겨우 넘는 값에는 "slightly"를 붙이고 끝에 상한 문장을 둔다.

## priority.md 형식 (헤더는 글자 그대로, 헤더 바로 아래에 문단 하나)

## PRIORITY
영문 한 줄, 35단어 이내. "Priority order:"로 시작해 `분류.Core`에 적힌 순서대로 상위 4~5개 특징을 " → "로 잇는다. 수치는 쓰지 않고 방향어로 쓴다(very thick, compressed, stretched, oversized, angular, flat, hard-edged). `분류.Core`에 없는 특징은 넣지 않는다. 방향어 상한(아래)은 이 줄에도 적용한다("slightly compressed torso").

## FIGURE
`prompts.md`의 FIGURE 문단을 그대로 옮기되 아래 규칙으로만 고친다. 그 밖의 문장과 수치는 한 글자도 바꾸지 않는다.
- 비례 수치마다 사실 비례 대비 방향어를 그 수치 바로 앞에 붙인다: 몸통 길이가 신장의 30% 미만이면 "a compressed torso"; 종아리(무릎~발바닥) : 허벅지가 1.4 : 1 이상이면 "stretched lower legs"; 다리 비율이 55% 이상이면 "long legs"; 신발 높이가 머리 높이의 0.6배 이상이거나 길이가 0.9배 이상이면 "oversized"; 손이 얼굴 높이의 0.8배 이상이면 "oversized hands"; 어깨 폭이 머리 폭의 1.5배 이하이면 "narrow shoulders". 문턱에 못 미치는 수치에는 방향어를 붙이지 않는다.
- **방향어 상한**: 방향어는 수치가 문턱을 넘은 정도에 따라 둘 중 하나로 쓴다 — 문턱을 20% 미만으로 넘으면 "slightly"를 앞에 붙인다("a slightly compressed torso", "slightly stretched lower legs", "slightly oversized"); 20% 이상 넘으면 방향어만. 그리고 FIGURE 문단 끝에 이 문장을 그대로 한 번 붙인다: "Keep every proportion close to the stated values; do not exaggerate beyond them."
- **등신 주석**: `filled.json`의 `인물.비례.등신` 값이 머리카락이나 모자의 꼭대기를 머리 높이에 **포함해** 쟀다고 적혀 있거나 등신이 6 미만이면, 등신 구절 뒤에 "measured to the top of the hair or hat, so keep the skull itself small"을 붙인다. 모발에 가린 두개골 정수리를 추정해 모발을 제외하고 쟀다고 적혀 있으면 붙이지 않는다(그 값은 이미 두개골 기준이다).
