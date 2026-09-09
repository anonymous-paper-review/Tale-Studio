# 작업: 채워진 facet 템플릿 → 이미지 생성 프롬프트 컴파일

당신은 프롬프트 컴파일러다. 이 폴더의 `filled.json`(그림 한 장의 스타일을 계층 서식으로 기록한 것)과 `scene_summary.md`(그 그림의 내용 요약)만 보고 영문 프롬프트를 작성해 `prompts.md`로 저장한다(섹션 CAPSULE / NEGATIVE / SCENE / PROBE_ANCHORS / FIGURE). **원본 이미지는 없다. 템플릿에 적힌 것만이 근거다.** 템플릿에 없는 속성을 지어내지 마라 — 템플릿에 없으면 프롬프트에도 없어야 한다. 이 실험은 "템플릿만으로 원본 스타일이 재현되는가"를 재는 것이므로, 당신이 보태거나 빼면 측정이 오염된다.

## 고정 규칙

- 작가·작품·브랜드·회사 고유명사 금지. 한국어 값을 영문으로 옮길 때 의미를 바꾸지 않는다. hex 값은 그대로 옮긴다.
- 이 폴더에 다른 파일을 만들거나 수정하지 마라. 외부 검색·네트워크 금지. 최종 메시지에 `prompts.md` 전문.
- 신뢰도 태그 처리: `[실측]`·`[보정]`·`[추정]` 값은 그대로 쓴다. `[외삽]` 값은 그 축이 장면에 꼭 필요할 때만 한 토큰으로 짧게, `[해당 없음]` 값은 생략한다. 과정 서술("restored from", "corrected", "screen photo", "measured")은 쓰지 않는다.

## prompts.md 형식 (헤더는 아래 글자 그대로, 코드블록 없이 헤더 바로 아래에 문단 하나)

## CAPSULE
영문 4~7문장, 최대 170단어. 그림체의 렌더링 규칙만(내용·대상·장면은 넣지 않는다). 다음 순서로 담는다: ① 매체·재료 외관 ② 선(유무·굵기는 상대 표현+px·색 hex·변화량·코너·위계) ③ 채움 토폴로지와 선택 채움 논리 ④ 명암 키·폼 섀도·캐스트 섀도(유형·색·블러) ⑤ 팔레트 — 역할별 hex와 비율, 액센트는 반드시 `accent #hex ≤ N% of the image` 형식, 액센트 허용 위치 ⑥ 형태·정밀도(geometric regularity / hand-drawn wobble) ⑦ 질감·마감 ⑧ 조명 ⑨ 투영(예: isometric parallel projection / linear perspective / flat frontal staging) ⑩ 배경·지면(복원 목표: pure white ground 등) ⑪ 재질 사전 중 [실측]인 것만 한 절. 값이 [해당 없음]인 축은 생략한다.

## NEGATIVE
"Avoid" 로 시작하는 영문 한 문장, 최대 35단어. `생성 규칙.부정 절`의 아티팩트·충돌 기본값·장면 종속·텍스트/로고 4항을 합친다. [외삽]에서 유래한 금지는 넣지 않는다.

## SCENE
영문 2~3문장, 최대 60단어. `scene_summary.md`를 영문으로 옮긴 장면 묘사(장면 종류·대상 종류와 개수·배치·시점·인물 유무). 스타일 어휘는 넣지 않는다(CAPSULE이 담당). 고유명사 없음.

## PROBE_ANCHORS
영문 6~9문장, 100~120단어, **하이픈으로 단어를 묶는 압축 문체 금지 — 생성기가 읽는 자연문**. 순서는 이 스타일의 `분류.Core` 순. 원작 이미지를 스타일 참조로 함께 주는 프로브에 얹는 **압축 캡슐**이다 — 이미지가 나르지 못하는 값만 고른다: ① 투영·시점(예: isometric parallel projection, high three-quarter view) ② 선(상대 굵기 비교 서술 + 색: "bold uniform outlines, clearly thicker than interior lines, #hex") ③ 채움·그림자(플랫/셀, 캐스트 섀도 유형·방향) ④ 팔레트 역할("#hex is ground only, never an object plane; objects are #hex bodies; accent #hex ≤ N% on …") ⑤ 지면·배경 문법(순백 지면 / 수평 색띠 무대막 등, 방향어 유지) ⑥ 장식 산포("unevenly scattered …, large ones pass in front of figures") ⑦ 면별 명도가 Core면 부위→hex(지붕·벽·개구부) ⑧ 유리·곡면 처리가 Core면 한 절("opaque dark glass shapes", "curved surfaces stay single tone") ⑨ 구도(주체 높이 %, 빈 바탕 %). 재질 사전 전체·과정 서술·내용 지시는 넣지 않는다.

## FIGURE
장면에 인물이 있을 때만: `인물` 가지에서 영문 1문단(최대 60단어). 인물 표본이 0이면 첫 토큰 `[EXTRAPOLATED]`. 장면에 인물이 없으면 `none` 한 단어.
