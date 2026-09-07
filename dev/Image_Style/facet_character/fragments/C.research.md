# C 외장 — 조사 노트 (2026-09-07)

담당 계층: `외장`(C1 의상 · C2 액세서리 · C3 소지품·장비 · C4 착탈 표식). 조각: `fragments/C.jsonc`.
lint 결과: `C.jsonc: 리프 52 · 선택형 29 · 문제 0` (`facet_template.py lint`).

구조 요약: `의상`(세트 번들 3 + 아이템 공통 속성 12 + 레이어 8 + 복장 전체 4 + 기타 1 = 28) · `액세서리`(공통 속성 4 + 위치 4 + 시그니처 1 + 기타 1 = 10) · `소지품·장비` 7 · `착탈 표식` 7. 반복 구조는 "아이템 공통 속성" 가지에 한 번 정의하고, 레이어·위치 리프는 그 순서의 `필드: 값` 레코드 한 줄로 채웠다(같은 레이어에 여러 아이템이면 ` ; ` 구분).

## §출처

| 어휘 | URL | 확인한 범위·규모 | 사용처 |
|---|---|---|---|
| Danbooru tag group:attire | https://danbooru.donmai.us/wiki_pages/tag_group:attire | 절 11개 — Headwear, Shirts and Topwear(약 60 태그), Pants and Bottomwear(약 35), Legs and Feet, Shoes and Footwear(약 50), Uniforms and Costumes(약 45), Swimsuits and Bodysuits, Traditional Clothing, Jewelry and Accessories(Head and Face / Neck and Shoulders / Limbs / Torso and Misc), Styles and Patterns(pattern 10 + print 30여), Other(trim·state 20여) | 세트 번들 상위군 · 상의·하의·아우터·신발 상위군 · 무늬 · 디테일 참고 후보 |
| Danbooru tag group:headwear | https://danbooru.donmai.us/wiki_pages/tag_group:headwear | Types 3(crown·hat·helmet), Hats(visor 12·brim 40·earflap 3·brimless 35·misc), Helmets 26, Crowns 7, Other 22, Accessories 9, 'Not headwear' 7(hair bow·ribbon·hairband·headband·headdress·veil) | 액세서리.머리 상위군 10 |
| Danbooru tag group:eyewear | https://danbooru.donmai.us/wiki_pages/tag_group:eyewear | Main 4, frame 색 13, lens 틴트 13, Types 14(rimless·round·rectangular·cat eye 등), glasses 세부 18 | 액세서리.얼굴 상위군 8 · 안경 레코드 필드 |
| Danbooru tag group:legwear | https://danbooru.donmai.us/wiki_pages/tag_group:legwear | Legwear by Height 8(socks·kneehighs·over-kneehighs·thighhighs·hiphighs·pantyhose·leggings·detached leggings) + pattern·style·misc | 양말·레그웨어 선택형 9 |
| Danbooru tag group:accessories | https://danbooru.donmai.us/wiki_pages/tag_group:accessories | By Body Part 5군(head·neck·arms·legs·torso), Jewelry, Bags(약 35), Decorations(약 40), Misc | 액세서리 위치 4군 설계 · 목·귀·손 · 몸 상위군 |
| Danbooru tag group:neck and neckwear | https://danbooru.donmai.us/wiki_pages/tag_group:neck_and_neckwear | Detached neckwear(chokers·ties·scarves·necklaces), Collar designs(neck lines 7 · high 5 · folded and low 7), On shoulders, 종류별 색·무늬 | 네크라인·칼라 선택형 9 · 목·귀·손 상위군 |
| Danbooru tag group:sleeves | https://danbooru.donmai.us/wiki_pages/tag_group:sleeves | Length 7, Style 6(detached·rolled up·pushed up 등), Type 16여, Trim 5 | 소매 길이 선택형 6 · 착용 상태(롤업) |
| Danbooru tag group:makeup · makeup · nail polish 위키 | https://danbooru.donmai.us/wiki_pages/tag_group:makeup · /wiki_pages/makeup · /wiki_pages/nail_polish | 화장 종류 12, lipstick·eyeshadow 색 12씩, 관련(facepaint·face jewel·sticker on face·hikimayu), nail polish 색 13 + nail art + long/very long fingernails | 착탈 표식 립·아이 메이크업·블러셔·페이스페인트·네일 |
| Danbooru bandages 위키 | https://danbooru.donmai.us/wiki_pages/bandages | 부위 태그 18(bandaged head…foot·tail), bandaid·gauze·sarashi·leg wrap | 붕대·반창고 선택형 9 |
| Danbooru holding 위키 · tag group:holding tags | https://danbooru.donmai.us/wiki_pages/holding · /wiki_pages/tag_group:holding_tags | 정의(손으로 든 것만), manner 태그(dual wielding·two-handed·holding behind back·between fingers·with feet·with tail·prehensile hair), 물건 범주 25절, holding_X 500여 | 소지품 종류 11 · 어느 손·부위 9 · 잡는 방식 9 |
| Danbooru sword 위키 · list of weapons | https://danbooru.donmai.us/wiki_pages/sword · /wiki_pages/list_of_weapons | 검 종류 35여, 파지·휴대 태그 18(hand on hilt·sheathed·unsheathing·sword on back·over shoulder·planted sword·pointing·half-swording…), 무기 상위 절 11 | 소지품 종류·잡는 방식·방향 참고 후보 |
| Danbooru armor 위키 · list of armor | https://danbooru.donmai.us/wiki_pages/armor · /wiki_pages/list_of_armor | 부위 절 Head/Neck/Shoulders/Arms/Torso/Groin/Legs/Shield + Sets(full armor·plate·bikini armor·power armor 등) + Misc(broken armor·leather armor) | 세트 번들 명칭·구성(부위 파츠) · 상의·하의·신발의 갑옷 후보 · 손상(파손) |
| Danbooru gloves 위키 | https://danbooru.donmai.us/wiki_pages/gloves | By Type 8(elbow·fingerless·half·single·paw 등), Material 6, Style, Related distinct(gauntlets·mittens) | 장갑 선택형 8 |
| Danbooru dress 위키 | https://danbooru.donmai.us/wiki_pages/dress | 길이 4(microdress·short·medium·long), 종류 14여, 네크라인·소매, 상태(dress lift·torn·open·wet) — `tag group:dress`는 삭제되어 이 페이지로 대체 | 원피스 선택형 7 · 기장 |
| Danbooru open_clothes · torn_clothes · bare_shoulders 위키, wet/dirty/untucked/jacket_on_shoulders 검색 | https://danbooru.donmai.us/wiki_pages/open_clothes · /torn_clothes · /bare_shoulders | open 계열 9, torn 계열 20여 + burnt clothes, bare arms·legs·back·off shoulder·shoulder cutout; wet_clothes·dirty_clothes·untucked_shirt·jacket_on_shoulders 정의문 | 착용 상태 7 · 손상·오염 8 · 노출 범위 11 |
| Danbooru tag groups 색인 · tag group:fashion style | https://danbooru.donmai.us/wiki_pages/tag_groups · /tag_group:fashion_style | 의상 관련 그룹 목록(accessories·attire·headwear·legwear·eyewear·makeup·holding tags·list of armor/weapons). fashion style은 J-fashion·Western·Historical 등 서브컬처 분류 | 조사 범위 확정. fashion style은 실루엣 규정력이 약해 번들 후보에 넣지 않음(참고만) |
| DeepFashion Category and Attribute Prediction | https://mmlab.ie.cuhk.edu.hk/projects/DeepFashion/AttributePrediction.html · https://github.com/open-mmlab/mmfashion/blob/master/docs/dataset/ATTR_DATASET.md | 289,222장 · 50 카테고리 · 1,000 어트리뷰트, attribute_type 1~5 = texture / fabric / shape / part / style | 재질 선택형(fabric 군) · 종류 참고 규모 |
| DeepFashion2 | https://github.com/switchablenorms/DeepFashion2 | 491,895장 · 13 카테고리(short/long sleeve top, short/long sleeve outwear, vest, sling, shorts, trousers, skirt, short/long sleeve dress, vest dress, sling dress) · 아이템별 scale/occlusion/zoom-in/viewpoint/style + 랜드마크 294 | 상의·하의·원피스·아우터 상위군 · 레이어 분할 근거 |
| Fashionpedia (ECCV 2020, arXiv 2004.12276) | https://github.com/cvdfoundation/fashionpedia · https://arxiv.org/pdf/2004.12276 (pdftotext로 본문 확인) | 27 주 의류 + 19 파츠 + 294 어트리뷰트. 어트리뷰트 상위군(Table 5): Length 15 · Nickname 153 · Opening Type 10 · Silhouettes 25 · Textile finishing/manufacturing 21 · Textile Pattern 24 · Non-textile material 14 · Neckline 25 · Waistline 7. 값 목록 일부 확인(neckline 25종, length 15종, fit: tight/slim/skinny/regular/loose, a-line·pencil·fit and flare·bodycon·balloon·peplum·tent, non-textile: leather·faux-leather·fur·shearling·feather·metal·plastic·rubber·wood·gem·no non-textile) | 핏 5 · 기장 7 · 소매 길이 6 · 네크라인·칼라 9 · 무늬 9 · 재질 11 · 전체 실루엣 6 · 디테일 참고 후보 |
| LIP (Look Into Person, arXiv 1703.05446) | https://arxiv.org/pdf/1703.05446 (pdftotext로 본문 확인; sysu-hcp.net 페이지는 404) | 50,462장 · 19 파트 라벨 + 배경: hat, hair, sunglasses, upper-clothes, dress, coat, socks, pants, gloves, scarf, skirt, jumpsuits, face, left/right arm, left/right leg, left/right shoe | 의상 레이어 분할(이너·상의·하의·원피스·아우터·신발·양말·장갑)과 LIP 라벨 대응 · 노출 범위 부위 |

## §경계

### 스타일 템플릿(`facet-template-v1.jsonc`)과 겹치는 항목

| 항목 | 스타일 템플릿 경로 · 의미 | 캐릭터 템플릿 C 경로 · 의미 | 판정 |
|---|---|---|---|
| 의상 재질 | `인물.의상.재질`(플랫 패널 등 — 재질 표현 방식), `재질.천`(주름 크기·섬유·무게감·그림자 경계), `재질.금속`(반사 방식·하이라이트 선 개수·주변색 반사) | `의상.아이템 공통 속성.재질`(11군 이름), `액세서리.아이템 공통 속성.재질` | 양쪽 — 캐릭터는 재질의 **이름**, 스타일은 그 재질을 **그리는 법**. 캐릭터 값이 스타일 렌더 규칙을 오버라이드하지 않는다. 함정: 스타일 재질 사전이 콘텐츠 재질을 덮어씀(refer3 레인코트→니트 코트) → 캐릭터 프롬프트에는 재질 이름만 |
| 주름 | `인물.의상.주름`(주름·봉제선 표현), `재질.천.주름 크기` | `의상.…디테일`의 플리츠·개더(디자인상 주름)만 | 분리 — 디자인 주름은 캐릭터, 천이 접혀 생기는 렌더 주름은 스타일 |
| 실루엣 | `인물.의상.실루엣`(블록 / 사다리꼴 / 흐르는 — 스타일의 단순화 문법) | `의상.…핏`(아이템 여유), `의상.전체 실루엣`(H/V/A/X/O/블록 — 이 복장의 외곽) | 양쪽 — 캐릭터 형태 위에 스타일 단순화가 얹힘. 캐릭터 값은 형태, 스타일 값은 그 형태를 얼마나 뭉개는가 |
| 색 | `팔레트`·`채움`(스타일 팔레트 역할·양자화), `재질.피부.톤`의 Content-bound 원칙 | `…주색`·`보조색`·`의상.색 구성`(hex + 면적 %) | 캐릭터 값 우선(콘텐츠), 스타일 팔레트가 양자화·재배치 — 근사 hex·비율만 보장 |
| 손 | `인물.손`(미튼형 / 분리 손가락 / 몰드 / 생략), `인물.체형.손발 크기` | `의상.장갑`(종류·길이·한쪽만) | 분리 — 손 조형·크기는 스타일(+B4 손가락 수), 장갑 종류는 캐릭터. 충돌 사례: 미튼형 손 스타일 + 핑거리스 장갑 |
| 발·신발 크기 | `인물.체형.손발 크기`(발 = 다리 길이의 1/8 등) | `의상.신발`(종류·색·목 높이·굽) | 분리 — 크기는 스타일, 형태·색은 캐릭터 |
| 옷 위 무늬 vs 화면 장식 | `장식.어휘`(화면에 흩뿌리는 반복 부호·형태 사전) | `의상.…무늬`(옷 위 프린트·패턴) | 캐릭터 — 옷 위 프린트는 콘텐츠. 스타일 `장식`은 옷과 무관한 화면 부호 |
| 피부색·혈색 vs 화장 | `재질.피부.톤`·`재질.피부.혈색`(스타일 기본 살색·블러시) | `착탈 표식.블러셔`·`립`·`페이스페인트` | 분리 — 스타일 혈색은 모든 인물 공통 기본값, 화장은 이 캐릭터가 칠한 것. 표정 홍조는 D2 |
| 속눈썹 | `인물.눈.속눈썹`(개수·형태 방언) | `착탈 표식.아이 메이크업`(마스카라·강조) | 분리 — 속눈썹 형태는 스타일(+B2 캐릭터 고유), 화장은 C |
| 소품 크기 과장 | `인물.비례.부위별 과장`(큰 신발·큰 손 등) | `소지품·장비.크기`(신장 대비 %) | 분리 — 캐릭터는 실측 비율, 스타일이 과장 |
| 디테일 밀도 | E 계층 `국소 렌더링`(의상 디테일 밀도 오버라이드), 스타일 `디테일` 가지 | `의상.…디테일`(무엇이 달려 있는가) | 분리 — C는 what, E·스타일은 how much |

### 형제 계층(A·B·D·E)과의 경계

| 항목 | 다른 계층 | C에서 다루는 것 |
|---|---|---|
| 원형·역할 번들(기사·학생) | A `정체성.원형·역할` | C `의상.세트 번들`은 실제로 입은 세트(판금 갑옷). A의 원형이 기본 복장을 암시해도 C가 구체 값을 가진다 |
| 머리끈·리본 vs 묶음 형태 | B3 `신체.머리카락`(포니테일·트윈테일 형태) | 묶는 도구·장식만 `액세서리.머리` |
| 손가락 수·손 표현 | B4 `신체.파츠·표식.손` | 장갑만 |
| 문신·흉터·주근깨·수염 | B2 얼굴 표식 / B4 신체 문양(영구) | 착탈 가능한 페이스페인트·스티커·주얼·붕대만 |
| 볼 홍조·땀·눈물 | D2 `상태.표정` | 화장 블러셔만 |
| 몸의 젖음·더러움·상처 | D4 `상태.물리·생리 상태` | 옷·장비 단위의 손상·오염만(`착용 상태`·`손상·오염`은 가변 태그) |
| 손 제스처·팔 위치 | D1 `상태.포즈` | 물건과 손의 관계(어느 손·잡는 방식·방향)만 |
| 뿔·꼬리·날개(진짜) | B4 비인간 파츠 | 가짜 날개·꼬리 장식만 `액세서리.몸` |
| 가려짐(무엇에 의해 어느 부위) | F `배치.가려짐` | 옷끼리의 겹침 순서만 `레이어 겹침 순서` |

## §선택형 판정

### 닫은 축 (29)

| 리프 | 후보 수 | 근거 어휘 | 닫은 이유 |
|---|---|---|---|
| 의상.세트 번들.상위군 | 12 (n개) | attire Uniforms and Costumes·Swimsuits·Traditional + list of armor Sets | 세트 태그가 Danbooru에서 수십 개지만 실루엣·레이어 기본값을 공유하는 상위군은 12개로 닫힘. 세부 명칭은 `명칭·구성` 자유 서술 |
| 무늬 | 9 (n개) | attire Styles and Patterns 10 + print 30여, Fashionpedia textile pattern 24 | 두 어휘의 합집합이 9군으로 빠짐없이 매핑됨 |
| 재질(의상·액세서리) | 11 (1개) | DeepFashion fabric 군, Fashionpedia non-textile 14, Danbooru material 태그 | 천 6군 + 비직물 5군. 세부(울/펠트)는 괄호 |
| 핏 | 5 | Fashionpedia silhouette fit·형태 값 | tight~loose 5단 + 퍼짐 |
| 기장 | 7 | Fashionpedia length 15, Danbooru skirt·dress 길이 태그 | 몸의 높이 기준 7단으로 일관 |
| 소매 길이 | 6 | tag group:sleeves Length, Fashionpedia sleeve length | 양쪽 어휘가 동일 6단 |
| 네크라인·칼라 | 9 | Fashionpedia neckline 25, neck and neckwear collar 절 | 25종을 형태 유사군 8 + 해당 없음 |
| 착용 상태 | 7 | open_clothes·untucked_shirt·jacket_on_shoulders·clothes_around_waist·sleeves_rolled_up·off_shoulder | 상태 태그가 '열림/걸침/걷어올림/빠짐/흘러내림/벗는 중'으로 닫힘 |
| 손상·오염 | 8 (n개) | torn_clothes(torn·burnt·damaged), wet_clothes, dirty_clothes, broken_armor + 오너 구겨짐 | 오너 후보 3 + Danbooru 4 + 파손 |
| 이너·상의·하의·원피스·아우터·신발·양말·장갑(8 레이어) | 7·9·8·7·8·9·9·8 | attire 각 절, DeepFashion2 13, LIP 라벨, list of armor 부위, gloves·legwear·dress 위키 | 레이어별 종류 **상위군**만 닫고 세부 명칭은 레코드 `종류` 자유 서술(수백 개 어휘를 통째로 옮기지 않음) |
| 노출 범위 | 11 (n개) | bare_shoulders See also + midriff·navel·collarbone·thighs·barefoot, LIP 부위 | 부위 열거는 신체 분할과 같으므로 닫힘. 성적 태그 제외 |
| 전체 실루엣 | 6 | Fashionpedia silhouette 25 → 알파벳 실루엣 관습 | 25종이 H/V/A/X/O/블록 6군으로 매핑. 관습 자체는 미검증(§미검증) |
| 액세서리.머리·얼굴·목·귀·손·몸 | 10·8·10·10 (n개) | headwear·eyewear·neck and neckwear·accessories 각 절 | 위치별 상위군. 세부는 레코드 `종류` |
| 소지품.종류 | 11 (n개) | list of weapons 상위 절 + holding tags 25절 | 무기 5군 + 비무기 5군 + 없음 |
| 소지품.어느 손·부위 | 9 (n개) | holding manner 태그 + sword 휴대 태그 + bags | 손 3 + 몸 장착 5 + 비손 파츠 |
| 소지품.잡는 방식 | 9 | holding manner + sword 파지 태그 | 파지 문법이 9로 닫힘. '역수 쥠'만 태그 미확인(§미검증) |
| 아이 메이크업 | 6 (n개) | tag group:makeup Types | 눈 화장 종류 8태그 → 6군 |
| 붕대·반창고 | 9 (n개) | bandages 부위 태그 18 + bandaid | 부위군 9 |

### 열어 둔 축 (참고 후보만)

| 리프 | 이유 |
|---|---|
| 세트 번들.명칭·구성 / 적용 범위·오버라이드 | 번들 세부명은 작품·문화권마다 열려 있고, 오버라이드 목록은 조합이라 열거 불가 |
| 아이템 공통 속성.종류 / 소지품.명칭·형태 / 액세서리.종류 | 수백 개 어휘(attire 200여 태그, DeepFashion 50, holding_X 500여) — 상위군은 레이어·위치 리프에서 닫고 세부는 자유 서술 + Danbooru 영문 태그 병기 |
| 주색·보조색·색 구성·색 | hex 수치 |
| 디테일 | 부속 조합·개수·위치가 열려 있음. Fashionpedia 파츠 19 + textile finishing 21 + attire Other를 참고 후보로 |
| 레이어 겹침 순서 | 부위별 관계 서술 |
| 소지품.방향·자세 / 크기 / 액세서리.크기 | 각도·비율 수치 |
| 립 / 블러셔 / 페이스페인트 / 네일 | 색 hex + 위치가 핵심이라 자유 서술. 색 이름 후보만 참고(makeup·nail polish 색 12~13) |
| 시그니처 | 캐릭터마다 다른 우선순위 목록 |
| 기타 ×4 | 탈출구 |

## §오너 노트 수정 제안

1. **노출 범위를 아이템 속성에서 복장 전체 속성으로 이동** — 맨살은 모든 레이어를 겹친 결과라 아이템별로는 정의가 안 된다. `의상.노출 범위` 한 리프로 두었다.
2. **상태를 둘로 분리** — 오너의 '상태(찢김·구겨짐·젖음)'를 `착용 상태`(열림·걸침·걷어올림·빠짐·흘러내림, 가변)와 `손상·오염`(젖음·더러움·찢김·그을림·피·구겨짐·파손, 가변)으로 나눴다. Danbooru도 open 계열과 torn/wet/dirty 계열을 별도로 관리한다.
3. **네크라인·칼라 축 추가** — Fashionpedia neckline 25 + Danbooru collar 절이 닫힌 어휘를 주고, 세일러 칼라처럼 정체성 기여가 큰 부위라 공통 속성에 넣었다.
4. **소매 길이와 기장을 별도 리프로** — 오너의 '기장·소매 길이·노출 범위' 한 항목을 셋으로 쪼갰다(각각 다른 어휘·척도).
5. **양말 → 양말·레그웨어** — Danbooru legwear by height 8단(니삭스~팬티스타킹·레깅스)이 실루엣에 기여하므로 높이 선택형으로 확장.
6. **복장 전체 리프 3개 추가** — `레이어 겹침 순서`(넣어 입기·갑옷 위 서코트), `전체 실루엣`(H/V/A/X/O/블록), `색 구성`(면적 순 3~5색). 오너 기여도 순위의 '실루엣'과 원거리 식별 색 배분이 아이템 속성에 흩어져 있어 압축 리프가 필요했다.
7. **세트 번들을 가지로 확장** — `상위군`(12 선택형) + `명칭·구성`(부위 파츠) + `적용 범위·오버라이드`(어느 레이어를 번들이 채우고 어느 레이어가 이기는가)로 명문화. 규칙: 레이어 리프 값이 있으면 번들을 이기고, '번들 따름'이면 번들 기본값.
8. **액세서리에 `시그니처` 리프 추가** — 프롬프트 예산 삭감 시 보존 순위(오너 메타 태그 절의 '기여도 낮은 facet부터 버림'을 착장 안에서 실행하는 리프).
9. **액세서리 위치 4군 유지하되 '몸'에 다리 포함** — Danbooru accessories는 head·neck·arms·legs·torso 5군. 가터·사이하이 스트랩·앵클릿·니패드를 `몸`의 후보에 넣었다. 망토·케이프·숄은 오너대로 액세서리(몸)에 두고, 소매 있는 겉옷만 아우터로 규정했다.
10. **소지품에 `방향·자세` 추가, '어느 손'을 '어느 손·부위'로 확장** — 칼끝 아래/위·겨눔·꽂음 등 방향은 장면 재현 변수이고, 등·허리·어깨 장착(sword on back·sheathed·shoulder bag)은 손이 아닌 부위라 후보에 넣었다.
11. **착탈 표식에 `페이스페인트·스티커·주얼` 추가** — 오너 B2의 '문신·페이스페인트' 중 착탈 가능한 것만 C4로 옮기고 문신은 B2에 남겼다(B 담당과 조율 필요).
12. **장갑의 비대칭 표기** — 예시 캐릭터처럼 한쪽만 끼는 경우(single glove)를 선택형 후보와 ` ; ` 양손 분리 표기로 지원.

## §기여도 근거

- **상**: 세트 번들 상위군·명칭(복장 실루엣을 통째로 결정), 아이템 `종류`·`주색`(가장 넓은 색면), 상의·아우터·원피스(몸통 색면과 실루엣), 전체 실루엣·색 구성(오너 순위 3위 '실루엣'과 원거리 색 식별), 액세서리 머리·얼굴(머리·눈에 인접 — Danbooru 캐릭터 식별 태그가 hair/eyes 계열에 집중하고 머리 장식·안경·안대가 그 다음으로 캐릭터 위키에 상시 기재됨), 시그니처.
- **중**: 보조색·무늬·재질·핏·기장·소매·네크라인·디테일(실루엣 안의 2차 단서), 하의·신발·양말·장갑(하체 실루엣), 레이어 겹침·노출 범위(실루엣 변형), 목·귀·손·몸 액세서리(작지만 비대칭·색 대비 시 식별), 소지품 종류·명칭(시그니처 무기), 페이스페인트(얼굴 위 고정 문양).
- **하**: 착용 상태·손상·오염(순간값), 이너(대부분 가려짐), 액세서리 크기·재질(원거리에서 소실), 소지품 어느 손·잡는 방식·방향·크기(포즈 종속), 립·아이 메이크업·블러셔·네일·붕대(애니풍에서 대개 생략되거나 표정·스타일 값과 혼동됨), 기타.
- 오너 순위(머리 > 눈 > 실루엣 > 시그니처 액세서리 > 피부색 > 나머지)에서 C가 맡는 구간은 '실루엣'과 '시그니처 액세서리'이며, 그 둘을 압축 리프(전체 실루엣·색 구성·시그니처)로 뽑아 상으로 두고 나머지 아이템 속성은 중·하로 내렸다.

## §미검증

- DeepFashion 1,000 어트리뷰트의 **군별 개수**(기억상 texture 156 / fabric 218 / shape 180 / part 216 / style 230) — CVPR 2016 논문 PDF가 403으로 열리지 않아 군 이름(texture·fabric·shape·part·style)만 mmfashion 문서로 확인. 50 카테고리 명단도 미확인.
- 의상 디자인의 알파벳 실루엣 관습(H·A·X·O·V) — 일반 패션 디자인 용어로 알고 있으나 출처 페이지를 확인하지 않음. `전체 실루엣` 선택형은 Fashionpedia silhouette 25종을 근거로 삼고 알파벳은 이름표로만 썼다.
- Danbooru 태그 존재 미확인: `gambeson`(갬비슨), `reverse grip`(역수 쥠), 구겨짐에 해당하는 태그(`wrinkled clothes` 류), `layered clothing`·`pants tucked in`(주석에 참고 태그로만 언급). 확인된 것: single glove, gauntlets, broken armor, coat_on_shoulders, clothes_around_waist, sleeves_rolled_up/pushed_up, off_shoulder, bindi, face jewel, sticker on face, facepaint, toenail polish, planted sword, sheathed.
- Danbooru `tag group:objects`는 없음(404); 물건 범주는 `tag group:holding tags` 25절과 `list of weapons`로 대체. `tag group:dress`는 삭제됨(dress 위키로 대체). `tag group:weapons`도 없음(list of weapons가 정본).
- Fashionpedia 어트리뷰트 값 목록은 PDF 텍스트에서 부분 확인(neckline·length·fit·silhouette 형태·non-textile·textile pattern 일부·opening type 일부). 294개 전체 명단은 미확인.
- 예시 캐릭터의 `[추정]` 항목(언더셔츠·벨트·머리끈·부츠 커프·장갑 재질)은 공동 예시 문장에 없어 추정으로 채웠다 — 다른 계층 담당과 충돌하면 그쪽 값을 우선한다.
