# D 상태층 조사 노트 (2026-09-07)

조각: `fragments/D.jsonc` — 최상위 `상태` = 포즈(D1) · 표정(D2) · 동작(D3) · 물리·생리 상태(D4). 리프 54 · 선택형 39 · lint 문제 0(아래 §lint).

## §출처

확인 방법: WebFetch로 페이지 본문을 읽고 태그명·정의를 그대로 옮겼다. `미검증`으로 표시한 것만 지식으로 채웠다(§미검증).

| 어휘 | URL | 규모·쓴 부분 |
|---|---|---|
| Danbooru tag_group:posture | https://danbooru.donmai.us/wiki_pages/tag_group:posture | 20여 절 약 200태그. Basic positions(30) · Movement of the body(14) · Other postures(26) · Posture of the head(3) · Torso inclination(8) · Arms 4절(≈25) · Hips(2) · Legs 3절(≈25) · Foot position(6) · Poses(19) · Signature poses(11, 작품 전용이라 제외) |
| Danbooru tag_group:gestures | https://danbooru.donmai.us/wiki_pages/tag_group:gestures | 두 손(47) · 한 손을 편 손가락 수별 7절(≈80) · 기타(13). 성적 제스처 제외 |
| Danbooru tag_group:hands | https://danbooru.donmai.us/wiki_pages/tag_group:hands | 'Hands on self' 3절(≈40: hand_on_own_hip·chest·face·chin·cheek·head·hand_in_pocket 등) |
| Danbooru tag_group:face_tags | https://danbooru.donmai.us/wiki_pages/tag_group:face_tags | Emotions(75) · Smile(13) · Smug(4) · Surprised/Scared/Sad(11) · Emotes(≈50) · Drawing styles(≈30) · Meme faces(작품 전용, 제외) · Sexual(제외) |
| Danbooru tag_group:eyes_tags | https://danbooru.donmai.us/wiki_pages/tag_group:eyes_tags | Pupils – Form(≈35) · Stylistic eyes(20) · Emotions and expressions(20) · One or two eyes closed(10) · Gazes(24) · Misc/Actions(≈30) |
| Danbooru tag_group:symbols | https://danbooru.donmai.us/wiki_pages/tag_group:symbols | 'Symbols of Emotions'(21: anger_vein·spoken_anger_vein·heart·spoken_heart·sweatdrop·comedic_sweatdrop·flying_sweatdrops·notice_lines·shout_lines·^^^·+++·puff_of_air·squiggle·squeans·smiley_face 등) · 'Text' 절(! · ? · !? · … · spoken_ 계열) |
| Danbooru tag_group:image_composition | https://danbooru.donmai.us/wiki_pages/tag_group:image_composition | View Angle(10: straight-on·from_side·from_behind·from_above·from_below·dutch_angle…) · Techniques(22: motion_lines·speed_lines·motion_blur·emphasis_lines·foreshortening…) · Composition(symmetry) |
| Danbooru tag_group:verbs_and_gerunds | https://danbooru.donmai.us/wiki_pages/tag_group:verbs_and_gerunds | Verbs(≈400) · Gerunds(≈90). heavy_breathing·yawning·coughing·sleeping·fainting·dreaming·fading·dissolving·melting·dripping·trembling 확인 |
| Danbooru 개별 위키 motion_lines | https://danbooru.donmai.us/wiki_pages/motion_lines | 정의 + see also 7(speed_lines·emphasis_lines·motion_blur·trembling·twitching·attack_trail·afterimage), 'emphasis_lines는 움직임이 아님' 명시 |
| Danbooru floating_hair · wind | https://danbooru.donmai.us/wiki_pages/floating_hair · https://danbooru.donmai.us/wiki_pages/wind | floating_clothes·hair_floating_upwards·hair_lift·wind / wind_lift |
| Danbooru wet · sweat · dirty | https://danbooru.donmai.us/wiki_pages/wet · …/sweat · …/dirty | 정의 + 함의·별칭(wet_clothes·wet_hair·soaked / nervous_sweating·very_sweaty·sweaty_clothes·wiping_sweat / dirty_face·dirty_clothes·dirty_feet). sweat 페이지가 '운동성 발한(두 방울 이상)'과 comedic_sweatdrop을 구분 |
| Danbooru injury · glowing · transparent · transformation | https://danbooru.donmai.us/wiki_pages/injury · …/glowing · …/transparent · …/transformation | injury 'Visible signs'(≈20) · glowing 함의 12 + see also 12 · transparent 정의와 see-through_body·fading·translucent·invisible 구분 · transformation 정의(진행 중만 태그) + 유형 11종 |
| Danbooru tears · blush · zzz | https://danbooru.donmai.us/wiki_pages/tears · …/blush · …/zzz | tears 유형 15 + see also 10 · blush 얼굴 7·몸 8 · zzz 정의·spoken_zzz |
| Danbooru tag_groups 색인 | https://danbooru.donmai.us/wiki_pages/tag_groups | posture·gestures·hands·face_tags·eyes_tags·symbols·image_composition·verbs_and_gerunds·lighting·body_parts가 공식 그룹임을 확인 |
| Danbooru tag_group:lighting · tag_group:body_parts | https://danbooru.donmai.us/wiki_pages/tag_group:lighting · …/tag_group:body_parts | 읽었으나 D에 쓸 어휘 없음(lighting은 광원·시간대 위주, body_parts는 부위 이름 위주 — 상태 태그는 dirty_feet 하나) |
| OpenPose 출력 문서 | https://github.com/CMU-Perceptual-Computing-Lab/openpose/blob/master/doc/02_output.md | BODY_25 25점 목록, JSON `pose_keypoints_2d` = (x, y, c) 삼중항, 좌표 정규화 옵션. COCO 18은 그림만 있어 아래 소스로 보완 |
| OpenPose poseParameters.cpp | https://raw.githubusercontent.com/CMU-Perceptual-Computing-Lab/openpose/master/src/openpose/pose/poseParameters.cpp | `POSE_COCO_BODY_PARTS` 18점(0 Nose·1 Neck·2 RShoulder·3 RElbow·4 RWrist·5 LShoulder·6 LElbow·7 LWrist·8 RHip·9 RKnee·10 RAnkle·11 LHip·12 LKnee·13 LAnkle·14 REye·15 LEye·16 REar·17 LEar·18 Background) · `POSE_BODY_25_BODY_PARTS` 25점(8 MidHip, 19~24 발 6점) |
| COCO 17 키포인트 | https://raw.githubusercontent.com/open-mmlab/mmpose/main/configs/_base_/datasets/coco.py · https://github.com/facebookresearch/Detectron/issues/640 | keypoint_info 0 nose·1 left_eye·2 right_eye·3 left_ear·4 right_ear·5 left_shoulder·6 right_shoulder·7 left_elbow·8 right_elbow·9 left_wrist·10 right_wrist·11 left_hip·12 right_hip·13 left_knee·14 right_knee·15 left_ankle·16 right_ankle + skeleton 19링크. Detectron 이슈는 1-indexed skeleton 목록 |
| FACS | https://en.wikipedia.org/wiki/Facial_Action_Coding_System | AU 0~28 주요 AU · 29~46 gross behavior(41 lid droop·42 slit·43 eyes closed·44 squint·45 blink·46 wink 포함) · 51~58 머리 · 61~66 눈 · 69·70~74 · 강도 A~E · EMFACS 감정 7종 조합 |
| 애니메이션 12원칙 | https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation | anticipation · follow through and overlapping action (동작 단계 후보의 근거) |
| line of action 'CSI' | https://poselibrary.com/csi-method-c-curves-s-curves-straight-lines · https://www.thedrawingsource.com/line-of-action.html | C curve(압축·기울기·체중) · S curve(비틀림·콘트라포스토) · straight line(구조·뻗음) 3분류(WebSearch 요약으로 확인, 본문 직접 인용은 아님) |

## §경계 — 스타일 템플릿 `인물`과 겹치는 항목

| 겹치는 속성 | 스타일 템플릿 경로 | D 조각 경로 | 어디에 둘 것 |
|---|---|---|---|
| 포즈의 경직/다이내믹 관습 | `인물.포즈 문법` | `상태.포즈.동세 라인` · `기본 자세` · `키포인트 세미 정량` | 양쪽. 스타일 = 이 화풍이 인물을 세우는 편향(경직·3중 기울기), D = 이 그림의 실제 라인·각도. D가 비어 있으면 스타일 문법으로 외삽하고, D가 있으면 D가 오버라이드 |
| 표정 온도 기본값 | `인물.표정 기본값` | `상태.표정.감정 카테고리` · `강도` · `부위별.입 형태` | 양쪽. 스타일 = 지시 없을 때의 기본 표정(생성기 기본값 '열린 미소' 억제용), D = 이 그림의 표정. D 값에 `스타일 기본값 따름` 허용 |
| 눈매(눈꼬리·반개·태도) | `인물.눈.눈매` | `상태.표정.부위별.눈 뜬 정도` · `눈 형태` | 스타일(관습) + B2(캐릭터 고유 눈 형태) 위에 D는 '기본 대비 변화'만. 스타일 기본이 반개면 D '보통' = 반개 |
| 눈 처리(점/실선/큰 애니 눈/무얼굴) | `인물.눈.처리` · `인물.무얼굴 여부` | `상태.표정` 전체 | 스타일. 무얼굴 = 예이면 D 표정 리프는 전부 `[해당 없음]`이고 표정은 포즈로 흡수(스타일 템플릿 주석 그대로) |
| 공막·글린트 수·속눈썹·눈꺼풀 선 | `인물.눈.공막·글린트` · `속눈썹` · `눈꺼풀 선` | (D 없음 — B2) | 스타일 + B2. D는 글린트가 사라지는 순간(empty_eyes)만 `눈 형태`/`동공 변화 없음`으로 표시 |
| 동공 형태 | (스타일 없음) | `상태.표정.부위별.동공 변화` | B2가 기본 형태(세로 동공 등), D는 수축·확장·기호형 변화만 |
| 입 처리(선 하나/입술) | `인물.입` | `상태.표정.부위별.입 개폐` · `입 형태` | 스타일 = 입을 무엇으로 그리는가, D = 입꼬리·개폐 상태. 입 안을 단색 면으로 채우는지는 스타일 |
| 손 조형(미튼/분리 손가락/생략) | `인물.손` | `상태.포즈.팔.*.손 제스처` | 스타일 = 손의 조형, D = 제스처. 미튼형이면 손가락 수 기반 제스처는 `[외삽]` |
| 볼 홍조·혈색 | `재질.피부.혈색` | `상태.표정.부위별.볼` | 양쪽. 스타일 = 혈색 표현 방식(사선/타원/스티커), D = 이 순간의 유무·강도·hex |
| 만화 기호의 형태 사전 | `장식.어휘.형태 사전` | `상태.표정.만화 기호` · `기호 위치·크기` | 양쪽. 스타일 = 기호의 형상·크기 범위·채움, D = 어떤 기호가 지금 어디에 |
| 스피드라인·모션 블러 | `그림체.선`(굵기·색·연속성) | `상태.동작.모션 표현.모션 라인·잔상` | 양쪽. D = 유무·종류·위치, 스타일 = 선의 렌더링 |
| 헤어 휘날림 | `재질.헤어.구축·외곽` · `인물.헤어 구축` | `상태.동작.모션 표현.휘날림` | D = 방향·정도, 스타일 = 가닥·덩어리 조형 |
| 발광·글로우 | `조명.블룸·할레이션` · `조명.발광체` · `재질.발광체` | `상태.물리·생리 상태.발광` | 세 곳. D = 어느 부위가 무슨 색으로 빛나는가(사실), 스타일 = 글로우·블룸 렌더링, E 국소 렌더링.이펙트 = 캐릭터 주변 오라·파티클 |
| 젖음·투명의 렌더링 | `재질.유기물.촉촉함` · `재질.유리.투명도` | `상태.물리·생리 상태.젖음` · `투명` | D = 상태의 유무·범위, 스타일 = 물기·투명의 표현 방식 |
| 카메라 앙각·프레이밍 | (스타일 `공간.투영.시점 높이`) | `상태.포즈.몸통.방향` · `머리.고개 각도` | 스타일·F 배치. D는 몸통·머리의 실제 회전만 — 앙각으로 생긴 겉보기 각도는 D에 넣지 않음(주석에 함정으로 명시) |

캐릭터 템플릿 안의 층간 경계(참고, 오너 노트 수정 제안에도 반영): 시선 방향(D) vs 주의 대상(G) · 사물 쥠 사실(D) vs 무엇을 어떻게(C3) · 신선한 상처(D) vs 흉터(B) vs 붕대(C4) · 발광 부위(D) vs 이펙트(E) · 관절 가려짐(D 키포인트 v=1) vs 가려짐 원인(F).

## §선택형 판정

닫은 축 39개(후보 3~12개). 근거는 각 리프 주석의 `분석 근거:`에 있고 요지는 다음과 같다.

- **포즈(15)**: 기본 자세(11, posture Basic/Movement/Other 절) · 몸통 방향(5, View Angle + 오너 4종에 ¾ 후면 보강) · 몸통 기울기(6, Torso inclination 8태그 압축) · 머리 방향(5, 몸통과 같은 어휘 + FACS 51·52) · 시선(10, eyes_tags Gazes/Misc + FACS 61~64) · 팔 위치 ×2(12, posture Arms + hands 'Hands on self') · 손 제스처 ×2(12, gestures를 '편 손가락 수' 축으로 압축) · 다리 자세(8, Leg/Knee location) · 발(6, Foot position 그대로) · 동세 라인(3, CSI) · 무게 중심(6, contrapposto·balancing·arm_support + 논리적 전수) · 대칭(3, symmetry·symmetrical_hand_pose) · 기준계(3, COCO 17 / OpenPose 18 / BODY_25).
- **표정(12)**: 감정 카테고리(8, EMFACS 7 + AU 0) · 강도(5, FACS A~E) · 눈 뜬 정도(6, eyes_tags + AU5·41~46) · 눈 형태(7, eyes_tags 기호 눈 + AU6·7·43) · 동공 변화(5, Pupils Form 35종을 4형으로) · 눈썹(6, face_tags + AU1·2·4) · 입 개폐(4, AU25·26·27) · 입 형태(11, Smile/Emotes/Drawing styles + AU12·15·18·19·20·22·32) · 볼(7, blush 위키 + puffy_cheeks) · 눈물(6, tears 위키) · 땀(6, sweat 위키의 발한/기호 구분) · 만화 기호(12 다중, symbols 'Symbols of Emotions' + face_tags 창백·음영).
- **동작(3)**: 동작 단계(5, 12원칙 anticipation·follow-through + 오너 3단계) · 모션 라인·잔상(8 다중, motion_lines 위키 see also) · 휘날림(5, floating_hair·wind 위키).
- **물리·생리(9)**: 젖음(4) · 더러움(5) · 상처(5) · 발광(9 다중) · 투명(5) · 변신(4) · 호흡(5) · 땀(4) · 수면·의식(4) — 각각 해당 Danbooru 위키의 정의·함의 태그로 닫음.

열어 둔 축과 이유:

- `세부 자세`: posture의 세부 태그가 수십 종(seiza·wariza·fighting_stance…)이라 상위 11종만 닫고 세부는 자유 + 참고 후보.
- `몸통.비틀림` · `머리.고개 각도` · 키포인트 4리프: 연속값(°·좌표)이라 선택형이 아님.
- `복합·이차 감정`: face_tags Emotions 75종은 사회적 감정이 섞여 있어 기본 범주(8)만 닫고 복합은 자유 + 참고 후보(BRIEF 지시).
- `기호 위치·크기` · `AU 조합`: 형식 정의 리프(자유 형식 값).
- `동사+대상`: verbs 400여 종 — 자유 + 참고 후보 28.
- `기타` ×4: 규약상 자유 텍스트.

압축 원칙: 어휘를 통째로 옮기지 않고 판정 가능한 축(지탱 부위·회전각·편 손가락 수·홍채 노출 비율 등)으로 재구성했고, 각 후보의 판정 기준(수치)을 주석에 적었다.

## §오너 노트 수정 제안

1. **D1 머리 방향**: '몸통 대비'만 적으면 키포인트·View Angle(뷰어 기준 어휘)과 변환이 필요해 절대 방향(뷰어 기준)을 고르고 몸통 대비 차(°)를 병기하는 식으로 바꿨다.
2. **D1 몸통 방향**: 정면/¾/측면/후면 4종에 `¾ 후면`을 추가(5종). 뒤돌아봄(looking_back) 포즈가 이 칸 없이는 안 적힌다.
3. **D1 시선**: 좌·우·상·하·뷰어·감음에 `옆으로 흘김`(sideways_glance: 머리와 눈 방향이 다른 경우) · `다른 인물` · `사물·자기 손` · `먼 곳·허공`을 추가. '누구를 보는지'는 G 관계.주의와 겹치므로 D는 방향 범주만, G는 대상.
4. **D1 다리**: `발` 리프 추가(Danbooru Foot position 6종 — 발끝 서기·안짱 등은 다리 리프로 안 잡힌다).
5. **D1 동세 라인**: S/C/직선을 CSI 어휘로 닫되, 값에 굽은 방향·기울기를 붙이게 했다(이름만으로는 좌우가 안 정해진다).
6. **D1 무게 중심**: `지지물`(팔·엉덩이로 기댐)과 `공중`을 추가 — 앉기·기댐·점프에서 발 기준 후보가 안 맞는다.
7. **D1 키포인트 세미 정량**: 값 형식을 정의했다 — 기준계 선언(OpenPose BODY_25 기본, COCO 17·OpenPose 18 대안) · 정규화 좌표 (x, y, v) 삼중항(COCO 형식) · 관절 3점 내각 '≈ N°' · 어깨선·골반선 기울기 부호 규약. 픽셀 좌표는 금지(해상도 종속). BODY_25의 Neck·MidHip이 COCO 17에 없다는 점을 주석에.
8. **D2 감정**: 기본 범주를 EMFACS 7종 + 중립으로 닫고, 강도는 FACS A~E 5단(오너의 '미세~과장'을 5단으로). `AU 조합` 참조 리프를 추가하고 좌우 단측은 L/R 접두로 표기(smirk = R12A).
9. **D2 이마 핏줄 = 분노 마크**: Danbooru에서 같은 태그(anger_vein)라 하나로 합쳤다. '얼굴 위 음영선'은 shaded_face(눈 위 가로 음영)와 gloom(세로 줄무늬)로 구체화.
10. **D2 땀의 분리**: 얼굴의 곤란 땀방울 기호(D2 `부위별.땀`)와 몸의 실제 발한(D4 `땀`)을 나눴다 — Danbooru sweat 위키가 '운동성 발한(두 방울 이상)'과 comedic_sweatdrop을 구분하는 것을 근거로.
11. **D2 추가 리프**: `동공 변화`(수축·확장·기호형 — 애니의 점 동공·하트 동공은 순간 상태) · `기호 위치·크기`(기호 이름만으로는 생성기가 위치·크기를 정한다).
12. **D3 동작 단계**: 준비/절정/후속에 `정지`·`진행 중`을 더해 5단. 정지 그림 대부분이 '동작 없음'인데 그 칸이 없었다.
13. **D3 잔상과 스피드라인**: 하나의 다중 선택형(`모션 라인·잔상` 8후보)으로 합쳤다. emphasis_lines(강조선)는 Danbooru가 '움직임 아님'이라고 명시하므로 후보에 넣되 주의 표기.
14. **D3 휘날림**: 바람 방향·세기를 값에 필수로 적게 했다(머리카락·옷이 다른 방향으로 날리는 생성 오류 방지).
15. **D4 상처의 범위**: 흉터(scar)는 B, 붕대·반창고는 C4, D4는 신선한 부상만(멍·긁힘·출혈·깊은 상처). 코피가 감정 기호로 쓰이면 D2.
16. **D4 부분 변신**: Danbooru transformation은 '진행 중'만 태그하므로 단계 선택형(없음/진행 중/부분 상태/완료 형태)으로 확장. 완료 형태는 별도 A·B 카드 참조로.
17. **D4 발광 vs E 이펙트**: D4 = 어느 부위가 무슨 색으로 빛나는가(사실), E = 오라·파티클·글로우 렌더링. 두 층에 같은 문장을 쓰지 않도록 경계를 주석에.
18. **D4 호흡·수면**: 헐떡임을 `호흡`(가쁜 숨·한숨·하품·기침)으로, 수면을 `수면·의식`(졸림·수면·기절)으로 넓혔다.
19. **좌/우 규약(전 계층 공통 제안)**: 신체 부위의 좌/우는 캐릭터 기준(OpenPose L/R과 일치), 방향·시선·바람의 좌/우는 화면 기준. D.jsonc 머리말에 적었고, A 담당의 메타 태그 체계 초안에 함께 실리길 제안.
20. **규약 리프의 취급**: `키포인트 세미 정량.기준계`는 캐릭터 속성이 아니라 좌표계 선언이라 병합 시 프롬프트에 싣지 않는 리프로 표시하는 규칙이 필요하다(메타 태그 `[변동성:가변][기여도:하]`로 두고 주석에 '규약 리프' 명시).

## §기여도 근거

- D 층은 정의상 '같은 캐릭터' 판정에 거의 기여하지 않으므로 기본값 `하`(BRIEF §2: 머리 > 눈 > 실루엣 > 액세서리 > 피부 > 나머지).
- `중`으로 올린 리프 7개 — 캐릭터의 시그니처로 굳어질 수 있는 항목: `팔.좌/우.손 제스처`, `표정.감정 카테고리`, `표정.부위별.눈 형태`, `표정.부위별.입 형태`, `물리·생리.발광`, `물리·생리.변신`. 근거: Danbooru tag_group:posture에 'Poses – Signature poses' 절(특정 캐릭터의 포즈가 태그로 굳은 사례 11개)과 gestures에 캐릭터 유래 제스처 태그가 존재한다 = 포즈·제스처가 식별 요소가 되는 경우가 어휘에 반영돼 있다. 표정도 face_tags에 캐릭터 유래 표정 절('Meme faces')이 있다. 발광 눈·부분 변신은 A/B 경계에 걸치는 상태라 재현 시 유지되는 경우가 많다.
- 프롬프트 예산이 빠듯할 때 버리는 순서: 키포인트 좌표 → 기호 위치·크기 → 물리·생리의 '없음' 리프 → 대칭·발 → 나머지. '없음'인 리프는 부정 절 재료로만 쓰고 본문에는 싣지 않는다.

## §미검증

- COCO 가시성 플래그 v = 0(미표기) / 1(표기·가려짐) / 2(표기·보임): cocodataset.org 포맷 페이지가 SPA라 본문을 못 읽었고, msightflow 블로그는 403. 지식으로 채움(COCO 공식 규약이라 확신 높음).
- Danbooru `closed_mouth` · `teeth` · `upper_teeth_only` · `fang`: 존재는 알지만 이번에 읽은 face_tags 그룹 페이지 목록에 없었다(개별 태그 페이지 미확인). 후보 이름에는 안 썼고 주석의 '이 노출' 설명에만 일반어로.
- Danbooru `steaming_body` · `breath`(입김) · `partial_transformation`: 미확인이라 후보에서 제외. '부분 변신 상태'는 우리 정의임을 주석에 명시.
- Danbooru `spread_legs`는 성적 맥락 태그라 후보 이름에서 제외하고 '넓게 벌림'으로 대체(legs_apart는 확인).
- line of action CSI 3분류: WebSearch 결과 요약으로 확인했고 poselibrary·thedrawingsource 본문을 직접 인용하지는 않았다.
- 애니메이션 12원칙 페이지는 'line of action'을 언급하지 않는다(별개 출처 필요 — 위 항목).
- OpenPose 02_output.md의 COCO 18 매핑은 그림만 있어 poseParameters.cpp 소스로 확인했다(같은 저장소, 신뢰 가능).
- Danbooru 그룹 페이지는 WebFetch가 요약 모델을 거치므로 태그 누락 가능성이 있다. 후보에 쓴 태그명은 모두 결과 목록에 실제로 나온 것만 골랐다.

## §lint

```
python3 .claude/skills/artist-style-anchor/bin/facet_template.py lint dev/Image_Style/facet_character/fragments/D.jsonc
D.jsonc: 리프 54 · 선택형 39 · 문제 0
```
