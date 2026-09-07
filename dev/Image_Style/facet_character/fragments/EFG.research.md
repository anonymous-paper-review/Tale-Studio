# E·F·G 조사 노트 — 국소 렌더링 · 배치 · 관계 (2026-09-07)

조각: `fragments/EFG.jsonc` — 리프 35(E 12 · F 11 · G 12), 선택형 15(E 3 · F 6 · G 6), lint 문제 0.

## §출처

확인한 외부 어휘와 규모. Danbooru 건수는 2026-09-07 `tags.json` API 조회 시점의 post_count다(계속 증가하는 값이므로 근거 문장에 날짜를 붙였다). 성적 태그는 전부 제외했다.

| 어휘 | 출처 | 규모 · 쓰인 곳 |
|---|---|---|
| LIP(Look Into Person) 라벨 | https://arxiv.org/abs/1703.05446 · https://signalprocessingsociety.org/publications-resources/data-challenges/look-person-lip-challenge | 5만 장 이상, 19 semantic part labels(hat · hair · sunglasses · face · upper-clothes · dress · coat · jumpsuits · scarf · gloves · left/right-arm · pants · skirt · socks · left/right-leg · left/right-shoe) + background = 20. F.가려짐.부위 · G.접촉 부위의 부위 어휘(8군으로 압축) |
| COCO 17 키포인트 + 가시성 플래그 | https://github.com/jin-s13/COCO-WholeBody/blob/master/data_format.md · https://docs.ultralytics.com/datasets/pose/coco | nose · left/right_eye · left/right_ear · left/right_shoulder · left/right_elbow · left/right_wrist · left/right_hip · left/right_knee · left/right_ankle, v=0 미라벨 / v=1 라벨 있음·보이지 않음 / v=2 보임. F.가려짐.부위 세부 · F.프레이밍 절단 관절 판정 · G.접촉 부위 |
| 영화 샷 사이즈 | https://www.studiobinder.com/blog/types-of-camera-shots-sizes-in-film/ | 9종: extreme wide · wide/long · full shot(머리~발) · medium wide/medium long(무릎 위) · cowboy shot(허벅지 중간) · medium shot(허리) · medium close-up(가슴) · close-up(얼굴) · extreme close-up(부위). F.프레이밍 |
| 삼분할 3×3 그리드 | https://en.wikipedia.org/wiki/Rule_of_thirds | 두 수평선·두 수직선으로 9칸, 교점 4개(power point). F.위치 |
| 구도의 3층(전경·중경·배경) | https://www.adobe.com/creativecloud/photography/hub/guides/foreground-middleground-background.html · https://www.slrlounge.com/foreground-middle-ground-and-background-in-photography/ | foreground / middle ground / background. F.깊이층 |
| Danbooru tag group: image composition | https://danbooru.donmai.us/wiki_pages/tag_group%3Aimage_composition | framing(portrait · upper_body · cowboy_shot · full_body · wide_shot · very_wide_shot · lower_body · close-up · feet/head/eyes_out_of_frame) · viewing angle(from_above · from_below · from_side · from_behind · dutch_angle) · depth(depth_of_field · bokeh) · cropping(cropped_legs · cropped_torso · cropped_arms · cropped_shoulders · cropped_head) · character position(lineup · column_lineup · group_profile). F.프레이밍 · F.가려짐 |
| Danbooru tag group: posture | https://danbooru.donmai.us/wiki_pages/tag_group%3Aposture | 2인 이상 절: hug 계열(hug · hug_from_behind · waist_hug · arm_hug · group_hug), holding_hands · interlocked_fingers, carrying 계열(princess_carry · piggyback · shoulder_carry · child_carry · sitting_on_shoulder …), 몸-몸(back-to-back · face-to-face · cheek-to-cheek · forehead-to-forehead · heads_together · shoulder-to-shoulder · head_on_chest), sitting_on_person · sitting_on_lap. G.접촉 유형 · G.상대 위치 |
| Danbooru tag group: gestures | https://danbooru.donmai.us/wiki_pages/tag_group%3Agestures | 두 손 이상 절: high_five · fist_bump · pinky_swear · heart_hands_duo · palm-fist_tap 등. G.접촉 유형(손-손) |
| Danbooru tag group: eyes tags | https://danbooru.donmai.us/wiki_pages/tag_group%3Aeyes_tags | Gazes 절 23태그(looking_at_viewer · looking_at_another · eye_contact · looking_at_object · looking_afar · looking_back · looking_down · looking_up · looking_to_the_side …) + 눈 가림 절(hair_over_one_eye · hair_over_eyes · blindfold · eyepatch · hat_over_eyes · eyes_visible_through_hair). G.시선 대상 · F.가려짐 |
| Danbooru tags.json 건수 조회 | `https://danbooru.donmai.us/tags.json?search[name_matches]=…` / `search[name_comma]=…` | looking_* 40건, hand_on_another's_* 31건, holding_another's_* 18건, arm_around_* 5건, *-to-* 20건, *carry* 15건, leaning_on_* 10건, *out_of_frame 12건, cropped_* 15건, covered_* 15건, hair_over_* 10건, *behind* 20건, glowing* 15건, *particles* 5건, blurry* 6건, *_shot 15건, *_body 10건, *_focus 10건, *outline* 15건, *_difference 8건, 그리고 이름 지정 90건(hug · kiss · headpat · handshake · height_difference · size_difference · aura · dark_aura · sparkle · light_rays · fire · ice · electricity · energy · magic_circle · backlighting · depth_of_field · solo · solo_focus · 1girl · 2girls · multiple_girls · multiple_boys …). 각 선택형의 '분석 근거'에 건수를 그대로 적었다 |
| 사내 실측(스타일 템플릿 주석 인용) | `.claude/skills/artist-style-anchor/scaffolds/facet-template-v1.jsonc` | refer1 대형 별이 인물 다리·머리 앞에 겹침(`장식.레이어`) · refer1 4인 전신 가로 행렬(`공간.구도.프레임 사용`) · refer3 2인 공유 조형만 방언(`인물.표본 수`) · refer6 운전석 안 작은 실루엣(`인물.표본 수`·`디테일.스케일 LOD`) · 내부선 양 4후보(refer1·2·5·6) · 캐스트 섀도 유형 4후보(refer1·3·5·6). E 선택형 2개와 F.가려짐.가리는 것의 근거 |

## §경계 — 스타일 템플릿 `인물`·`공간.구도`·`그림체`·`재질`과 겹치는 항목

원칙: **스타일 템플릿 = 이 스타일의 모든 캐릭터에 공통인 문법(원칙)**, **캐릭터 템플릿 E = 그 문법을 이 캐릭터에서만 덮어쓴 값**, **F·G = 이 그림의 실제 위치·크기·관계**. 스타일 `공간.구도`는 "원작의 배치를 복제하지 않기 위해 원칙만" 적는 가지이므로(가이드 §1) 개별 캐릭터의 실제값은 F·G에만 둔다. 형제 계층(B1·C3·D1·D3)과의 경계도 함께 적었다 — 합칠 때 같은 관찰이 두 계층에 들어가지 않도록.

| 캐릭터 리프 (E·F·G) | 스타일 템플릿 key / 형제 계층 | 배치 | 이유 |
|---|---|---|---|
| E.윤곽선.외곽 굵기 | `그림체.선.외곽선.굵기` · `그림체.선.적용 범위.신체·의상` | 양쪽 — 캐릭터 값이 스타일 기본값을 오버라이드 | 스타일은 주체 기준 한 값. 주역 강조·원근으로 한 캐릭터만 굵을 때만 캐릭터 값 |
| E.윤곽선.내부 굵기 | `그림체.선.내부선.굵기` · `그림체.선.외곽선.위계비` | 양쪽 | 같음. 내부선의 양은 E.셰이딩.옷 주름·E.디테일 밀도 |
| E.윤곽선.선 색 | `그림체.선.외곽선.색` · `그림체.선.적용 범위.색 종속`·`.머리카락` | 양쪽 | 스타일이 부위 종속 색선 규칙을 가지면 캐릭터는 그 규칙에 자기 머리색을 대입한 결과만 적는다. 흰 외곽(white_outline)은 캐릭터 오버라이드 |
| E.셰이딩.피부 톤 단계 수 | `재질.피부.셀 단계` · `그림체.명암.폼 섀도.유무·경도` / B2 피부(hex·톤 표현) | 양쪽 | 단계 수는 스타일 관습이 기본. B2는 피부색과 재질, E는 단계 수만 |
| E.셰이딩.옷 주름 표현 정도 | `인물.의상.주름` · `재질.천.주름 크기` · `그림체.선.내부선.양` / C1 의상 상태(구겨짐) | 양쪽 | 스타일의 4후보 척도를 그대로 재사용. C1의 '구겨짐'은 의상의 상태(내용), E는 표현량(렌더링) |
| E.셰이딩.드리운 그림자 여부 | `그림체.명암.캐스트 섀도.유형·형상·길이·색·방향·블러` | 양쪽 | 스타일 4후보 재사용. 캐릭터는 부유·상대 위 그림자 같은 예외만 |
| E.디테일 밀도.눈·얼굴:의상 | `디테일.분포.초점:주변` · `인물.눈.디테일` · `디테일.스케일 LOD.원경 인물` / B2 눈 묘사 수준 | 양쪽 | B2 '눈 묘사 수준(점눈/단순/상세)'은 이 캐릭터 눈의 설계, E는 이 그림에서 얼굴 대 의상에 실린 밀도 비 |
| E.이펙트.종류·위치·색 | `그림체.조명.블룸·할레이션`·`림라이트`·`발광체` · `재질.발광체` · `장식.레이어`·`장식.어휘` / D3 모션 표현 · D4 발광 | 양쪽 | 스타일은 발광·번짐의 문법, 캐릭터는 이 캐릭터에 붙은 이펙트 유무. 배경 전체의 보케·입자는 `장식.어휘`. 스피드라인·잔상은 D3, 캐릭터 몸 자체의 발광(피부·문양)은 D4 — E는 몸 밖으로 나오는 이펙트 |
| E.재질 오버라이드 | `재질.*` 사전 · `생성 규칙.오버라이드.재질` / C1 재질(면·가죽·금속) | 양쪽 | 실측 기본값은 '스타일 재질 사전이 이김'(refer3). C1은 재질 이름, E는 사전과 다르게 그려진 예외만 |
| F.위치 · 앵커 · 크기 · 폭·여백 | `공간.구도.개체 스케일`(주체 = 화면 높이 N%) · `프레임 사용` · `밀도 중심` · `여백 방향` / B1 등신·상대 키 | 캐릭터(실제값) — 스타일은 원칙 | 캐릭터 값이 있으면 캐릭터 우선, 없으면 스타일 원칙으로 생성. B1은 설정값(등신), F.크기는 화면 실측 |
| F.프레이밍 | `공간.구도.개체 스케일`(클로즈업 여부) · `디테일.스케일 LOD.클로즈업` | 캐릭터 | 스타일은 "전경 클로즈업 없음" 같은 경향만 |
| F.깊이층 · 초점 | `공간.투영.깊이`·`심도` · `장식.레이어` | 양쪽 | 스타일은 전역 심도 유무, 캐릭터는 이 캐릭터가 초점면인지 |
| F.z-order | `공간.구도.겹침` · `개체 분리` | 캐릭터(실제 순서) — 스타일은 겹침 허용 원칙 | |
| F.가려짐.가리는 것·부위 | `공간.구도.가장자리 절단` · `장식.레이어`(부호가 주체 앞 통과) / D1 팔(자기 신체 가림) · C3 소지품 | 양쪽 | 스타일은 절단·통과의 문법, 캐릭터는 어느 부위가 얼마나. 프레임 절단은 F.프레이밍이 먼저 흡수하고 비표준 절단만 가려짐에 |
| (시점 높이 from_above / from_below) | `공간.투영.시점 높이` / D1 몸통 방향 | **캐릭터 리프로 두지 않음** | 카메라 높이는 전역값이고 몸통이 뷰어 대비 어디를 향하는지는 D1. 캐릭터별 앙·부감 차이는 F.기타 |
| G.구성 | `인물.표본 수` | 분리 | 스타일의 표본 수는 스타일 분석 입력(공유 특징 추출용), G.구성은 장면의 인물 수와 이 캐릭터의 지위 |
| G.대상 | C3 소지품·장비 | 분리 | 손에 든 것은 C3, 놓인 큰 사물·동물·인물만 관계 대상 |
| G.상대 위치 · 간격 · 몸 방향 관계 | `공간.구도.겹침`·`개체 분리`·`크기 위계` / D1 몸통 방향 | 캐릭터 — 스타일은 원칙 | 몸 방향 관계는 두 D1 값의 상대 각도. D1은 각자 뷰어 기준, G는 둘 사이 |
| G.접촉 유형 · 부위 | `인물.포즈 문법` / D1 팔·손 제스처 · D3 동작 | 캐릭터 | 스타일 포즈 문법은 경직/다이내믹 경향. D1은 이 캐릭터의 팔 위치, G는 그 손이 상대 몸 어디에 있는가 |
| G.시선 대상 ×2 | `인물.눈.눈매`(태도) / D1 시선(방향) · D2 눈 | 캐릭터 | D1 시선은 방향(좌·우·상·하·뷰어·감음), G는 대상(누구·무엇). 상호 응시는 두 리프에서 유도 |
| G.상대 크기 | `인물.비례.등신` / B1 상대 키 | 캐릭터 — B1이 설정 정본, G가 이 그림의 실측 | 원근 포함 실측 / 설정 키 비 [추정] / 머리 높이차를 분리 |
| G.동사·방향 | D3 동작(동사 + 대상) | 캐릭터 | D3는 이 캐릭터의 동사(대상이 사물일 수도), G는 상대를 향한 동사만 — 같은 동사가 둘에 들어갈 수 있으므로 합칠 때 D3에 '대상이 인물이면 G에 방향과 함께'라는 상호 참조 필요 |

## §선택형 판정

닫은 축 15개와 근거, 열어 둔 축과 이유.

**닫은 축 (E 3)**
- `옷 주름 표현 정도` [5]: 스타일 템플릿 `그림체.선.내부선.양`의 4후보(refer1·2·5·6 실측)에 캐릭터 층의 기본값 '스타일 기본값 따름'을 더함. Danbooru에는 셰이딩 축 어휘가 없어(cel_shading · soft_shading · screentone 전부 0건) 사내 실측 후보를 재사용했다.
- `드리운 그림자 여부` [5]: 스타일 `그림체.명암.캐스트 섀도.유형` 4후보(refer1·3·5·6) + 기본값 따름.
- `이펙트.종류` [8, 다중]: Danbooru glowing · aura/dark_aura · light_particles/sparkle · light_rays/lens_flare · fire/ice/electricity/energy · magic_circle · backlighting 건수로 7군 + 없음. 오너 골격의 글로우·오라·파티클 3종을 포함하고 원소·마법진·광선·림라이트를 추가했다.

**닫은 축 (F 6)**
- `위치` [9]: 삼분할 3×3 그리드 — 기하 정의로 닫힘(실측이 아니라 정의라는 점은 §미검증에 적음).
- `프레이밍` [9]: 영화 샷 사이즈 9종을 신체 절단선으로 번역 + Danbooru framing 태그 건수. 오너 골격 5종(전신/무릎/허리/바스트/얼굴)에 원경·허벅지 위(cowboy_shot 850,084 — Danbooru에서 가장 흔한 절단)·부분·하반신을 추가.
- `깊이층` [3]: 구도 3층 어휘 + Danbooru blurry_foreground/background.
- `초점` [3]: Danbooru depth_of_field · blurry · blurry_foreground · blurry_background.
- `가려짐.가리는 것` [6, 다중]: 가리는 주체를 프레임 / 자기 / 다른 인물 / 환경 사물 / 이펙트·장식 / 없음으로 분할 — Danbooru out_of_frame·hair_over·covered·behind_another 계열 + refer1(장식 통과)·refer6(운전석) 사내 실측.
- `가려짐.부위` [8, 다중]: LIP 20 라벨을 부위 8군으로 압축. LIP는 의복 종류(upper-clothes / dress / coat / jumpsuits)로 갈라져 있어 가려짐 어휘로는 과분할이라 신체 부위로 묶고, 세부는 COCO 키포인트 이름으로 열어 뒀다.

**닫은 축 (G 6)**
- `구성` [3]: Danbooru solo / solo_focus / multiple_* 세 갈래.
- `상대 위치` [6, 다중]: 좌우·앞뒤·상하 세 축의 기하 분할 + Danbooru side-by-side · behind_another · front-to-back · sitting_on_shoulder/lap.
- `몸 방향 관계` [5]: face-to-face · back-to-back · side-by-side · front-to-back + 나머지 각도를 '직각·비스듬'으로 닫음.
- `접촉 유형` [12, 다중]: tag group posture·gestures의 2인 이상 태그 약 60개를 12군으로 압축(건수는 리프 주석에). 상한 12에 맞추느라 '몸-몸 밀착'(back-to-back · shoulder-to-shoulder · belly-to-belly)을 한 군으로 묶었다.
- `이 캐릭터의 시선 대상` [8] · `상대의 시선 대상` [8]: Danbooru looking_at_* 대상 유형(viewer · another · object · animal · self/mirror · afar/ahead/away) + 눈 감음·가려짐.

**열어 둔 축 (자유 서술 + 참고 후보)**
- `선 색`: 값이 hex라 선택형이 아님. 규칙 유형(암선/색선/흰 외곽/무선)은 스타일 템플릿도 참고 후보로만 두고 있어 같은 수준으로 맞췄다.
- `외곽 굵기` · `내부 굵기` · `피부 톤 단계 수` · `눈·얼굴:의상` · `z-order` · `크기` · `앵커` · `폭·여백` · `상대 크기` · `간격`: 수치(배수·px·%·정수·0~5 척도)라 선택형이 아님. `간격`만 참고 후보(겹침/접촉/근접/중거리/원거리)를 붙였다.
- `이펙트.위치·범위` · `색·강도` · `재질 오버라이드` · `대상` · `접촉 부위`: 조합 폭이 커서 자유 서술. 부위는 LIP 8군 + COCO 이름을 어휘로 쓰도록 주석에 명시.
- `동사·방향`: 동사 어휘는 열린 집합(Danbooru에 protecting · feeding · dancing · fighting · pushing · pulling · headpat · kiss · handshake … 수백 개). 참고 후보 12개만 붙였다.
- `기타` ×3: 규약대로 자유 텍스트.

## §오너 노트 수정 제안

골격(OWNER_NOTES §E·F·G)에서 고친 곳과 추가한 곳.

**E 국소 렌더링**
1. 모든 리프의 기본값을 `스타일 기본값 따름`으로 두고, 주석 첫머리에 덮어쓰는 스타일 key 경로를 적는 구조로 통일했다. 선택형에도 이 값을 첫 후보로 넣었다(오버라이드 없음이 정상 상태).
2. 이펙트를 글로우·오라·파티클 3리프에서 `종류(8후보 다중) + 위치·범위 + 색·강도`로 바꿨다. 원소(불·얼음·번개)·마법진·광선·림라이트가 골격에 없었고, 종류마다 리프를 두면 색·범위가 종류 수만큼 중복된다.
3. `재질 오버라이드` 리프를 추가했다 — 스타일 `생성 규칙.오버라이드.재질`이 "스타일 재질 사전 우선"을 기본값으로 실측했으므로 그 예외를 캐릭터 쪽에서 기록할 자리가 필요하다.
4. "눈·얼굴 디테일 밀도 vs 의상 디테일 밀도"를 한 리프 `눈·얼굴:의상`(0~5 두 값)으로 — 스타일 `디테일.분포.초점:주변`의 콜론 형식과 통일.
5. 경계 결정: 스피드라인·잔상은 E 이펙트가 아니라 D3 모션 표현. 캐릭터 몸 자체의 발광은 D4, 몸 밖으로 나오는 이펙트만 E.

**F 배치**
6. 좌표 규약을 명문화했다: x·y는 캔버스 좌상단 기준 %(y 하단 100%), '발이 하단 8% 지점' = y 92%. 화면 좌우(뷰어 기준)와 캐릭터 좌우(LIP·COCO 기준)를 리프별로 못 박았다 — 섞이면 3/4 정면에서 반대로 읽힌다.
7. `앵커`를 전신뿐 아니라 절단 프레이밍(절단선 y%)까지 포괄하도록 정의를 넓혔고, 아호게·모자를 머리 꼭대기와 분리해 적게 했다(키 % 기준이 5~10% 흔들리는 원인).
8. `폭·여백` 리프 추가 — 위치(중심)·크기(높이)만으로는 팔 벌림·망토·무기 폭과 룩룸(시선 쪽 여백)이 전달되지 않는다.
9. `초점` 리프 추가 — 피사계 심도 밖의 캐릭터(흐림)는 깊이층만으로 안 실린다.
10. 프레이밍 후보 5 → 9: 원경·허벅지 위(cowboy)·부분·하반신 추가. 무릎(medium long)과 허벅지 중간(cowboy)은 영화·Danbooru 모두 구분한다.
11. 가려짐을 `가리는 것`(6군 다중) + `부위`(LIP 압축 8군 + COCO 키포인트, 비율 %) 두 리프로 나눴다. LIP 20 라벨은 검토 결과 의복 종류 중심이라 부위 어휘로 그대로 쓰기엔 과분할이었다.
12. `가장자리 절단`은 별도 리프 없이 프레이밍 + 가려짐(프레임 가장자리)으로 흡수. 스타일 `공간.구도.가장자리 절단`은 문법으로 그대로 둔다.
13. 시점 높이(부감·앙각)는 캐릭터 리프로 두지 않았다(전역 `공간.투영.시점 높이` + D1 몸통 방향).

**G 관계**
14. `구성`(단독 / 다인 중 초점 / 다인 동등)과 `대상`(상대 식별) 리프를 추가했다 — 상대가 누구인지 없이는 나머지 관계 리프가 접지되지 않고, 단독이면 가지 전체를 [해당 없음]으로 닫는 스위치가 필요하다.
15. 골격의 "공간(옆/앞/뒤/위)"을 `상대 위치`(6방향 다중) + `간격`(키 대비 %) + `몸 방향 관계`(마주봄/등맞댐/나란히/앞뒤/직각) 셋으로 나눴다. 방향·거리·상대 각도는 독립 축이다.
16. 접촉을 `접촉 유형`(12군 다중) + `접촉 부위`('행위자 부위 ↔ 대상 부위', 방향 필수)로 나눴다.
17. 주의를 `이 캐릭터의 시선 대상` + `상대의 시선 대상` 두 리프로. 상호 응시(eye_contact)는 두 값에서 유도하므로 리프로 두지 않았다. D1 시선(방향)과의 경계: G는 대상.
18. `상대 크기`를 원근 포함 실측 / 설정 키 비 [추정] / 머리 꼭대기 높이차 세 값으로 — 뒤에 선 상대는 원근 축소가 키 차이로 오독된다.
19. `상호작용 동사`를 `동사·방향`('행위자 → 대상: 동사')으로 — D3 동작과 같은 동사가 들어갈 수 있으므로 합칠 때 D3에 '대상이 인물이면 G에도 방향과 함께' 상호 참조를 넣기를 제안한다.

**메타 태그**
20. 기여도 축은 '같은 캐릭터로 느끼는 데 기여'만 재므로 D~G는 거의 전부 하가 되고, "기여도 낮은 facet은 예산이 빠듯할 때 먼저 버린다" 규칙을 그대로 적용하면 장면 재현에 필수인 F·G가 먼저 잘린다. **'장면 재현 기여도'를 별도 축으로 두거나, 삭감 규칙을 '식별 목적 프롬프트'와 '장면 재현 프롬프트'로 나누는 것**을 검토해 달라(이번 조각에서는 골격대로 식별 기여도만 달았다).

## §기여도 근거

- **변동성**: E·F·G 35리프 전부 `가변` — 오너 노트 메타 태그 정의("가변(D, E, F, G)") 그대로. 같은 캐릭터를 다른 장면에 그릴 때 배치·관계·국소 렌더링은 전부 바뀐다.
- **기여도 하(34리프)**: Danbooru에서 캐릭터 식별은 hair · eyes 계열 태그가 맡고, 배치·관계 태그(solo · looking_at_viewer · full_body · cowboy_shot · hug …)는 캐릭터와 무관한 general 태그다 — 같은 캐릭터가 모든 배치·관계 값에서 등장하므로 식별에 기여하지 않는다. E의 렌더링 오버라이드도 스타일 관습의 국소 예외라 식별 단서가 아니다.
- **기여도 중(1리프: E.이펙트.종류)**: glowing_eyes 62,327 · glowing_weapon 7,328 · glowing_markings 966처럼 판타지 캐릭터의 시그니처로 반복되는 이펙트가 있어 '같은 캐릭터' 인상에 일부 기여한다. 지속적인 시그니처 이펙트(항상 붉은 오라)는 A 고유 식별 또는 B4 파츠·표식으로 승격해 불변으로 잡는 편이 맞고, E는 이 그림에서의 유무만 적는다.

## §미검증

- Danbooru `portrait` · `close-up` 정확 건수 — tag group:image composition 페이지 등재만 확인, 건수 조회 안 함.
- LIP '19 + background = 20': arXiv 1703.05446 초록은 "19 semantic part labels"까지만 명시. background 포함 20은 검색 요약(CDGNet 등 후속 논문 서술)에 근거.
- `*aura` 와일드카드 조회가 2회 연결 끊김(ECONNRESET) — `aura` 18,910 · `dark_aura` 3,414는 이름 지정 조회로 확인했으므로 후보 근거는 유효.
- `standing_behind` 태그는 존재하지 않음(조회 결과 없음) — 뒤 위치 어휘는 `behind_another` 6,318로 대체.
- `rim_lighting` · `cel_shading` · `soft_shading` · `screentone` · `shiny_hair` · `foreground`는 Danbooru 태그가 아님(0건) — 셰이딩 축은 외부 어휘 없이 스타일 템플릿 refer 실측 후보를 재사용했다.
- 사내 실측: 우리 refer1~6 중 2인 이상 상호작용(접촉·응시) 표본이 없다. refer1(4인 가로 행렬, 별이 인물 앞 통과) · refer3(2인 공유 조형) · refer6(운전석 실루엣) 관찰은 스타일 템플릿 주석에서 인용했고 이번에 이미지를 다시 열지 않았다. 따라서 **G의 선택형 6개는 전부 외부 어휘 근거이며 사내 실측 0** — 사이클에서 2인 표본이 생기면 후보를 재검토해야 한다.
- F.`위치`(3×3)와 `깊이층`(3층)은 실측이 아니라 기하·구도 정의로 닫은 후보다. 가이드 규칙 4("어떤 실측이 후보를 확정했는지")의 취지와 약간 다르므로 오너 판단이 필요하다.
- 예시 캐릭터의 F·G 수치(폭 30%, 상대 화면 높이 0.55, 간격 10%, 몸 방향 90° 등)는 BRIEF §3 서술에서 외삽한 값이며 실제 그림에서 잰 값이 아니다.
