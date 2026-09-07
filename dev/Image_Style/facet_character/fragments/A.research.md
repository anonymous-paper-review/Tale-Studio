# A 정체성 — 조사 노트 (2026-09-07)

담당 범위: 최상위 key `정체성` (존재 유형 · 인간형 정도 · 외견 성별 표현 · 외견 연령대 · 원형·역할 번들 · 고유 식별 · 종족 파츠 유무·목록 · 기타) + 템플릿 전체의 메타 태그 체계 초안(§메타 태그 체계).
산출물: `fragments/A.jsonc` — 리프 14 · 선택형 8 · lint 문제 0 (`facet_template.py lint` 2026-09-07 실행).

## §출처 (확인한 어휘)

웹 확인은 WebSearch + WebFetch(danbooru.donmai.us 직접 페치는 간헐적 ECONNRESET, safebooru.donmai.us 미러로 같은 위키를 페치). 페치 결과는 요약 모델을 거친 것이라 태그 개수는 "약"으로 적는다.

| 어휘 | URL | 규모·내용 | 쓰인 리프 |
|---|---|---|---|
| Danbooru tag_groups 마스터 목록 | https://danbooru.donmai.us/wiki_pages/tag_groups | Body 절 18 그룹(hair·hair_color·hair_styles·eyes_tags·face_tags·ears_tags·wings·skin_color·body_parts·hands·feet·posture…), Creatures 절(birds·cats·dogs·legendary_creatures), Real World 절 jobs, More 절 gender_nonconformity | 그룹 존재 확인 |
| tag_group:jobs | https://danbooru.donmai.us/wiki_pages/tag_group:jobs | 7절 약 110 태그 — Civilian 약 56 / Historical & Fantasy 16(alchemist·bard·blacksmith·druid·cowboy·cowgirl·knight·knights_templar·ninja·paladin·samurai·sheriff·warrior·gladiator·wizard·witch) / Law Enforcement 6 / Military 10 / Outlaws 11 / Religious 7(cleric·miko·monk·nun·traditional_nun·pope·priest) / Sexual 4(제외) | 역할 범주 · 원형 이름 |
| tag_group:attire 'Uniforms and Costumes' 절 | https://danbooru.donmai.us/wiki_pages/tag_group:attire | 약 70 태그 — school_uniform·serafuku·gakuran·gym_uniform·maid·waitress·military_uniform·mecha_pilot_suit·plugsuit·armor·armored_dress·miko·nun·priest·cassock·superhero_costume·cheerleader·animal_costume(14종)·kigurumi·santa_costume 등 | 역할 범주 · 종족 파츠 유무(착용물 경계) |
| tag_group:character_count | https://danbooru.donmai.us/wiki_pages/tag_group:character_count | 'character' = 초점을 받는 지각 있는 인간·인간형 개체. girl/boy/other는 외견 기준(SFW), 구별 특징 없으면 other. 무명 동물·크리처(슬라임 등)는 세지 않음 | 외견 성별 표현 · 존재 유형 |
| 1other / androgynous / ambiguous_gender | https://danbooru.donmai.us/wiki_pages/1other · /androgynous · /ambiguous_gender | androgynous = 특징이 보이지만 의도적으로 양성 혼합, ambiguous_gender = 각도·의상·거리·조명으로 특징이 가려짐(전신 갑옷 예시) | 외견 성별 표현 |
| tag_group:gender_nonconformity | https://danbooru.donmai.us/wiki_pages/tag_group:gender_nonconformity | 6절 약 30 태그(crossdressing 계열·androgynous·bishounen·tomboy·girly_boy…) — 복장·행동 단서를 성별 카운트와 분리 | 외견 성별 표현(함정) |
| 연령 태그 계열 | https://danbooru.donmai.us/wiki_pages/howto:character · /child · /aged_up · /aged_down · 포럼 https://danbooru.donmai.us/forum_topics/31726 | aged_down·baby·toddler·child·aged_up·old_woman·old_man 나열. child = 영아기~사춘기. 포럼: mature_female/male = 30대 후반 이후, old = 60세 전후(주름), teenage 태그 폐기, 무태그 기본 = 10대~20대 중반. 전부 외견 기준 | 외견 연령대 |
| monster_girl / monster_boy / furry / animal_ears / fake_animal_ears | https://danbooru.donmai.us/wiki_pages/monster_girl · /furry · /animal_ears · /fake_animal_ears | monster_girl = 인간 얼굴·몸통 + 비인간 팔다리, 소형 파츠(귀·꼬리·뿔·날개)는 제외. furry = 실질적 동물 특징 + 비인간 얼굴, 귀·꼬리만 있으면 아님. animal_ears = 케모노미미(실제·가짜 포함) | 존재 유형 · 인간형 정도 · 종족 파츠 |
| android / humanoid_robot / non-humanoid_robot | https://danbooru.donmai.us/wiki_pages/android · /humanoid_robot · /non-humanoid_robot | android = 인간과 거의 구별 불가(완전한 인간 얼굴, 피부 재질, robot_ears·robot_joints·skin seams 같은 소형 표지). humanoid_robot = 2족·팔다리 있으나 인간 얼굴 아님. non-humanoid_robot = 2족 아님(로봇 동물·포드·워커). cyborg = 기계 부위로 증강된 사람 | 존재 유형 · 인간형 정도 |
| personification / humanization / mascot / chibikemo / creature / no_humans | https://danbooru.donmai.us/wiki_pages/personification · /humanization · /mascot · /chibikemo · /no_humans | personification = 사물·동물·탈것 등 비인간 개체를 인간(형)으로 묘사. mascot = 모호 태그, 대체 creature(작고 설명 어려운 생물)·chibikemo(chibi+kemono, 2족이지만 주로 동물 형태·큰 눈) | 존재 유형 |
| tag_group:legendary_creatures | https://danbooru.donmai.us/wiki_pages/tag_group:legendary_creatures | Type 절 약 150(angel·demon·dragon·elf·dwarf·fairy·ghost·spirit·elemental·slime·undead·vampire·zombie·werewolf·golem·mermaid·lamia·harpy·centaur·oni·kitsune·tanuki·youkai…) + Culture-specific 80+ + Misc 15(monster·monster_girl·monster_boy·extra_arms…) | 종족 추정 명칭 · 존재 유형 |
| tag_group:body_parts | https://danbooru.donmai.us/wiki_pages/tag_group:body_parts | Head / Torso / Appendages / See also. Appendages: digitigrade·reverse-jointed_legs·tail·tentacles·wings·ninja_toes. Head 절이 tag_group:ears_tags·head_wings 참조 | 종족 파츠 목록 |
| tag_group:ears_tags | https://danbooru.donmai.us/wiki_pages/tag_group:ears_tags | Animal ears 26(cat·dog·fox·rabbit·bat·bear·cow·deer·goat·horse·lion·monkey·mouse·panda·pig·raccoon·sheep·squirrel·tiger·wolf…·kemonomimi_mode) / Fake animal ears 5 / floppy_ears·hair_ears / pointy_ears·long_pointy_ears·robot_ears / extra_ears | 종족 파츠 목록 · 종족 추정 명칭 |
| tag_group:wings | https://danbooru.donmai.us/wiki_pages/tag_group:wings | 13절 약 90 태그 — Types 9(feathered·angel·bird·demon·dragon·fairy·bat·drawn·skeletal) / Insect 5 / Elemental 6 / Artificial 3(fake_wings·mechanical_wings·wing_tattoo) / Location(body) 10(head_wings·wing_ears·winged_arms·harpy…) / Location(clothing) 6(winged_hairband…) | 종족 파츠 목록·유무 |
| horns / tail / extra_arms / mechanical_* / halo / fangs | https://danbooru.donmai.us/wiki_pages/horns · /tail · /multiple_arms · /mechanical · /halo · /fangs | horns = 머리의 단단한 돌기. tail = 허리 아래 긴 부속지. extra_arms = 팔 3개 이상. mechanical_arms = 완전 로봇이 아닌 인간형에 기계 부위(single_mechanical_arm·mechanical_legs·mechanical_horns·mechanical_tail·mechanical_ears·robot_joints). halo = 머리 위·뒤 빛 고리(broken·mechanical·traditional·crescent·star·rectangular…). fangs = 두드러진 송곳니 복수(fang·skin_fang·sharp_teeth·tusks) | 종족 파츠 목록 |
| tag_group:artistic_license | https://danbooru.donmai.us/wiki_pages/tag_group:artistic_license | 10절 — alternate_species·alternate_costume·alternate_headwear·alternate_weapon·alternate_body_size·alternate_wings·alternate_skin_color·alternate_hair_color·alternate_hairstyle·alternate_hair_length_(shorter/longer)·alternate_eye_color·alternate_color / aged_up·aged_down·age_progression / genderswap / fatter·more_muscular·taller·shorter·thinner_than_canon / humanization·mechanization·personification·costume_switch·hair_color_switch·eye_color_switch·palette_swap·fusion. 'Changes of hair'·'Changes of eyes'가 독립 절 | §메타 태그 체계(변동성 등급 근거) |
| howto:character / original | https://danbooru.donmai.us/wiki_pages/howto:character · /original | character 태그 = 원작에서 말하거나 스스로 행동하는 지각 개체(마법 무기·AI 동반자 포함), 오리지널 캐릭터는 작가명 한정자 필요. cosplay 시 입은 캐릭터와 입힌 캐릭터를 모두 태그(의상 교체가 정체성을 안 바꿈). original = 어떤 저작권에도 속하지 않는 그림·캐릭터, 대개 이름 없이 한 장에만 등장 | 출처 구분 |
| magical_girl / princess / crown | https://danbooru.donmai.us/wiki_pages/magical_girl · /princess · /crown | magical_girl = 마법 능력·변신의 소녀 장르 원형. princess = 왕의 딸, 대개 가운·보석·티아라. crown = 왕족 머리장식 | 역할 범주 · 원형 이름 |
| TRPG 기본 12 클래스 (D&D 5e 기본 규칙) | https://www.dndbeyond.com/classes | Barbarian·Bard·Cleric·Druid·Fighter·Monk·Paladin·Ranger·Rogue·Sorcerer·Warlock·Wizard (+ Artificer 확장). jsonc에는 브랜드명 금지 규칙 때문에 'TRPG 기본 12 클래스'로만 적음 | 역할 범주 · 원형 이름 |
| Anime Characters Database 검색 facet | https://www.animecharactersdatabase.com/ux_search.php | URL 파라미터 gender·eye_color·hair_color·hair_length·age·mimikko(동물귀)·otherchar — 캐릭터 검색 DB의 식별 축 | §기여도 근거 |
| Cartoon face recognition (arXiv 1804.01753) | https://arxiv.org/pdf/1804.01753 | 검색 요약: 캐릭터 구분 특징으로 피부색·머리색·머리 양 사용 | §기여도 근거 |
| tag_group:theme | https://danbooru.donmai.us/wiki_pages/tag_group:theme | 세계관·장르 태그가 아니라 서사 테마 16개 → 세계관 계열 후보의 출처로 못 씀(그래서 자유 서술) | 세계관 계열(열어 둔 근거) |

## §경계 (스타일 템플릿 `인물`·`재질`과 겹치는 항목)

| 항목 | 캐릭터 템플릿(A) | 스타일 템플릿 | 판정 |
|---|---|---|---|
| 존재 유형·성별·연령대·출처 | 캐릭터 고유 | 없음(`인물.표본 수`는 원작 안 인물 수일 뿐) | 캐릭터에만 |
| 인간형 정도 ↔ `인물.무얼굴 여부`·`인물.손`(미튼) | 존재가 무얼굴·무손인가(엔티티 기준) | 스타일이 얼굴·손가락을 생략하는가(묘사 기준) | 양쪽, 뜻이 다름 — 캐릭터 '완전 인간형' + 스타일 '무얼굴 예'가 공존 가능 |
| 원형 번들 → C 의상 세트 ↔ `인물.의상.재질/주름/실루엣` | 의상 종류·색(번들 함축) | 표현 방식 — 스타일 재질 사전이 콘텐츠 재질을 덮어씀(refer3 레인코트 → 니트) | 양쪽: 종류·색은 캐릭터, 표현은 스타일 우선. A는 번들 이름만 |
| 원형 번들 → B1 등신 기대치 ↔ `인물.비례.등신`·`인물.체형` | 연령대·원형이 등신 기대치를 함축 | 스타일 기본 등신·사지 조형 | 양쪽: A는 연령대·번들만, 등신 값은 B1이 스타일 기본값을 오버라이드 |
| 종족 파츠 ↔ `재질.피부.톤` | 파츠 유무·목록(A), 종류·색은 B4 | 스타일 템플릿 주석이 '종족·캐릭터 고유색은 Content-bound로 보낸다'고 명시 | 캐릭터에만 — 스타일에 두면 콘텐츠 누출 |
| 종족 파츠의 피부 표면 재질(비늘·털·금속) | A 목록에서 제외 → B2 피부 재질 | `재질.피부.재료감`(비닐/종이/페인트) | 양쪽, 뜻이 다름 — 캐릭터 = 무엇으로 되어 있나, 스타일 = 어떻게 칠하나 |
| 시그니처 요소가 지칭하는 눈 하이라이트 ↔ `인물.눈.공막·글린트` | 캐릭터 값(개수·위치) | 스타일 관습 | 양쪽: 캐릭터 값은 '스타일 기본값 따름' 가능 (B2 담당) |
| 성격 원형(츤데레 등) ↔ `인물.표정 기본값` | A에서 제외(비시각) | 스타일 방언(무표정/미소/냉소) | 캐릭터 쪽은 D2 표정(순간)만 — A에 두지 않음 |
| 시그니처 요소·번들 함축의 경로명 | `신체.머리카락`·`신체.얼굴.눈`·`외장.의상`·`외장.액세서리`·`외장.장비` 등으로 예시 | — | 합본 시 B·C 담당의 실제 key로 치환 필요 |

## §선택형 판정

닫은 축 8개 (모두 `분석 근거:` 명기):

| 리프 | 후보 수 | 닫은 이유 |
|---|---|---|
| 존재 유형 | 8 | Danbooru monster_girl·furry·android·humanoid_robot·non-humanoid_robot·personification·mascot(→creature·chibikemo)·no_humans 정의가 서로 배타적 경계를 문장으로 제공. 오너 6종을 그 경계로 재분할 |
| 인간형 정도 | 5 | android ↔ humanoid_robot ↔ non-humanoid_robot 3단(얼굴·2족 기준) + monster_girl ↔ furry(얼굴·몸통 vs 사지) + animal_ears(소형 파츠)로 순서형 5단이 닫힘 |
| 외견 성별 표현 | 5 | character_count의 girl/boy/other + androgynous ↔ ambiguous_gender(보이지만 혼합 vs 가려짐) 구분이 명문 |
| 외견 연령대 | 6 | baby·toddler / child / 무태그(10대~20대 중반) / mature / old의 외견 경계 + 오너 6단. 단 청소년/청년 분할은 Danbooru가 폐기한 경계라 [추정] 의무 |
| 역할 범주 | 9 | jobs 7절 + attire 유니폼 절 + magical_girl·princess + TRPG 12 클래스의 무력/주문 분할을 시각 실루엣 기준으로 재배치. 압축 자체는 우리 정리이므로 '판정 불가' 탈출구 포함 |
| 출처 구분 | 3 | character 태그 ↔ original 태그 2분법 + 판독 불가 |
| 종족 파츠 유무 | 2 | animal_ears ↔ fake_animal_ears, wings 'Artificial' 절, animal_costume·kigurumi로 '난 것/입은 것' 경계 명문 |
| 종족 파츠 목록 (다중) | 11 | body_parts Appendages + ears_tags + wings 그룹 + horns·halo·fangs·extra_arms·mechanical_* 태그를 부위 범주로 압축. 종류·수·색은 B4 |

열어 둔 축 6개:

| 리프 | 이유 |
|---|---|
| 원형 이름 | jobs 약 110 + 클래스 12 + 장르 원형 — 후보가 수백이고 새 원형이 계속 생김. 상위 범주(역할 범주)만 닫고 이름은 참고 후보 |
| 번들 함축 | 관계 서술(계층.리프=값) — 값 형식은 고정하되 내용은 캐릭터마다 다름 |
| 세계관 계열 | fantasy·science_fiction·steampunk·cyberpunk 태그 존재만 확인. tag_group:theme는 장르 그룹이 아니었고 나머지 구분(무협·포스트 아포칼립스·서부극)은 우리 정리라 참고 후보로만 |
| 시그니처 요소 | 캐릭터별 우선순위 목록 — 정의상 자유 |
| 종족 추정 명칭 | legendary_creatures 약 250 + 동물 종 26 — 파츠에서 역추론하는 번들 이름이라 참고 후보로만 |
| 기타 | 규약상 자유 텍스트 |

## §오너 노트 수정 제안 (골격에서 고친 곳·추가한 곳)

1. **존재 유형 6종 → 8종.** '수인·동물'을 수인(인간 골격 + 동물 얼굴, furry)과 동물·생물(비인간형 그대로)로 분리, '몬스터·정령'을 반인반수·혼합형(monster_girl: 얼굴·몸통 인간 + 비인간 사지)과 정령·비실체(ghost·slime·elemental)로 분리. 근거: Danbooru가 이 넷을 서로 다른 정의로 태그한다. 엘프·천사·악마·흡혈귀는 별도 유형이 아니라 '인간형 + 종족 파츠 + 종족 추정 명칭'으로 표현(monster_girl 정의가 소형 파츠를 명시적으로 제외).
2. **인간형 정도 3단 → 5단.** '부분 인간형'이 '인간+소형 파츠'와 '얼굴·몸통만 인간(라미아·인어)'와 '골격만 인간(수인·인간형 로봇)'을 뭉개므로 Danbooru 경계(android/humanoid_robot/non-humanoid_robot, monster_girl/furry)로 나눔. 존재 유형과의 짝 규칙을 주석에 명시.
3. **외견 성별 표현: 여/남 2값 → 5후보.** 중성형(androgynous: 보이지만 혼합)·판정 불가(ambiguous_gender: 가려짐)·해당 없음(기계·크리처)을 추가. 복장·신체 충돌은 신체 우선 + 기타 기록.
4. **외견 연령대 6단 유지, 두 가지 보강.** '유아'에 영아 포함을 명시. 청소년/청년은 Danbooru가 teenage를 폐기한 경계이므로 [추정] 의무 + 근거를 기타에.
5. **원형·역할을 4리프로 구조화.** 역할 범주(enum 9) + 원형 이름(번들, 참고 후보) + 번들 함축('계층.리프=값' 나열, 개별 리프 우선 규칙) + 세계관 계열(번들 한정자 — 같은 '기사'도 중세/和風/SF에서 갑옷이 갈림). 성격 원형(츤데레 등)은 비시각이라 제외.
6. **고유 식별: '기존 캐릭터명 / 오리지널' → '출처 구분'(플래그) + '시그니처 요소'(신설).** 이름은 어디에도 쓰지 않고, 대신 알아보게 하는 요소 3~5개를 다른 계층 경로로 지칭. 시그니처 요소는 메타 태그 기여도의 캐릭터별 오버라이드 역할(§메타 태그 체계).
7. **종족 파츠: 유무 + 목록(다중 11) + 종족 추정 명칭(번들, 신설).** 착용물(fake_animal_ears·animal_costume·kigurumi·winged_hairband)은 C로, 일시적 파츠(kemonomimi_mode·변신)는 D4로 보내는 경계를 주석에 명시. 비늘·털 같은 표면 재질은 파츠가 아니라 B2 피부 재질로.
8. **메타 태그 정의 보강(§메타 태그 체계).** 기여도 '상'에 "없으면 생성기가 기본값으로 되돌려 실루엣이 깨지는 골격 facet(존재·성별·연령·등신)"을 포함시켰고, 삭감 순서에 "번들이 있으면 하위 개별 리프부터 버리고 번들 이름만 남긴다" 규칙을 추가했다. 변동성 등급 판정에 Danbooru alternate_* 태그 존재 여부를 기준으로 제안.

## §기여도 근거 (리프별 한 줄)

| 리프 | 등급 | 근거 |
|---|---|---|
| 존재 유형 | 상 | 바뀌면 다른 캐릭터(alternate_species·humanization·mechanization이 '캐논 이탈' 태그로 존재). 골격 facet |
| 인간형 정도 | 중 | 존재 유형 + 파츠 목록이 정보를 거의 다 나름. 짝 검증용 |
| 외견 성별 표현 | 상 | 실루엣·얼굴 틀의 전제(genderswap이 별도 이탈 태그). 없으면 생성기 기본값으로 회귀 |
| 외견 연령대 | 상 | 등신·얼굴 비율의 전제(aged_up/down이 이탈 태그). 캐릭터 검색 DB의 age facet |
| 역할 범주 | 중 | 원형 이름의 상위 범주 — 이름이 있으면 중복, 없을 때의 대체 |
| 원형 이름 | 상 | 한 단어가 의상 실루엣(오너 3위) + 장비를 결정하는 압축 단위 |
| 번들 함축 | 하 | 관계 문서 — 인식 기여는 하위 리프·이름이 나름 |
| 세계관 계열 | 중 | 번들의 재질·형식 한정자. 이름만으로도 대개 추론 가능 |
| 출처 구분 | 하 | 프롬프트에 안 들어가는 규칙 플래그 |
| 시그니처 요소 | 상 | 캐릭터별 우선순위 그 자체 — 삭감 시 마지막까지 유지되는 목록 |
| 종족 파츠 유무 | 중 | 게이트 — 목록이 정보를 나름 |
| 종족 파츠 목록 | 상 | 귀·뿔·날개·꼬리는 실루엣 변경 요소. 캐릭터 검색 DB가 mimikko를 gender·eye_color·hair_color·hair_length·age와 같은 급의 facet으로 둠 |
| 종족 추정 명칭 | 중 | 파츠 번들 이름 — 파츠 목록이 있으면 중복 |
| 기타 | 하 | 자유 관찰·충돌 기록 |

공통 근거: 오너 우선순위(머리 > 눈 > 실루엣 > 액세서리 > 피부색 > 나머지) · 캐릭터 검색 DB의 식별 facet 집합(gender·eye_color·hair_color·hair_length·age·mimikko) · Danbooru artistic_license에서 hair와 eyes가 독립 절('Changes of hair'·'Changes of eyes')일 만큼 변경이 눈에 띄는 속성 · 만화 얼굴 인식 연구가 피부색·머리색·머리 양을 특징으로 사용(요약만 확인).

## §미검증

- `scales`(비늘) 태그·`monster` 태그의 정의 전문 — 검색 결과에 이름만. 목록에서 비늘을 뺀 결정은 B2 재질과의 역할 분담 때문이지 태그 부재 때문이 아님.
- `creature`·`chibikemo`·`kemonomimi_mode` — 검색 요약과 태그 존재만 확인, 위키 원문 미열람.
- `mecha_musume`(기계 부위 의인화 소녀) — 기억상 존재하나 확인 안 함. 의인화 판정의 참고 태그가 될 수 있음.
- 세계관 태그 중 `dieselpunk`·`post-apocalypse`·`historical`·`wuxia` 계열 — 확인 안 함(fantasy·science_fiction·steampunk·cyberpunk만 확인).
- tag_group:body_parts 전체 — 비인간 파츠 절만 확인. Head·Torso 절 내용은 미열람.
- tag_group:jobs·attire의 태그 개수 — 요약 모델 경유라 ±수 개 오차 가능.
- arXiv 1804.01753 본문 — 검색 요약만. "hair/eyes 태그가 캐릭터 식별 태그의 대부분"이라는 BRIEF 예시 문구는 수치로 확인하지 못함.
- Anime Characters Database facet — 검색 결과의 URL 파라미터로만 확인, 페이지 미열람.

## §메타 태그 체계 (템플릿 전체 초안)

형식(BRIEF §2 고정): 모든 리프 주석 맨 앞에 `[변동성:불변|준불변|가변][기여도:상|중|하]`. 아래는 두 태그의 정의·등급 기준·사용법·삭감 순서다.

### 1. 변동성 — "같은 캐릭터를 다른 장면에 그릴 때 이 값이 바뀌는가"

| 등급 | 정의 | 판정 질문 | 외부 근거 | 해당 계층 |
|---|---|---|---|---|
| 불변 | 바뀌면 '다른 캐릭터'로 읽히거나, 바뀐 것 자체가 예외로 표기되는 값 | 값이 바뀐 그림을 보고 사람이 "다른 캐릭터"라고 하는가 | Danbooru artistic_license에 `alternate_species`·`alternate_hair_color`·`alternate_eye_color`·`alternate_skin_color`·`alternate_hair_length`·`genderswap`·`aged_up/down`·`humanization`·`mechanization` 태그가 있음 = 커뮤니티가 그 속성의 변화를 '캐논 이탈'로 표기 | A 전부 · B 대부분(등신·얼굴 구조·눈 색·형태·머리 색·길이·종족 파츠·피부색) |
| 준불변 | 캐릭터에 귀속되지만 에피소드·장면 단위로 교체될 수 있고, 교체돼도 같은 캐릭터로 읽히는 값 | "같은 캐릭터인데 옷/머리가 다르다"라고 하는가 | `alternate_costume`·`alternate_hairstyle`·`alternate_headwear`·`alternate_weapon`·`costume_switch`, cosplay 규칙(입은 캐릭터 정체성 유지) | C 전부(의상·액세서리·장비·착탈 표식) · B3 중 묶음 방식(포니테일↔내림) · 체형 세부(fatter/more_muscular_than_canon 급) |
| 가변 | 장면마다 당연히 바뀌며 바뀌어도 표기 대상이 아닌 값 | 아무 말 없이 같은 캐릭터라고 하는가 | 포즈·표정·배치에는 alternate_* 태그가 없음 | D(포즈·표정·동작·상태) · E(렌더링 오버라이드) · F(배치) · G(관계) |

- **판정 기준의 원리**: Danbooru의 alternate_* 태그가 존재하는 속성 = 불변 또는 준불변. 그중 '종·색·길이·성별·나이'처럼 바뀌면 캐릭터가 달라지는 것은 불변, '옷·머리 묶음·모자·무기'처럼 바뀌어도 캐릭터가 유지되는 것은 준불변. alternate_* 태그가 없는 속성은 가변.
- **사용법**: 캐릭터 정의 = 불변 + 준불변(캐릭터 카드). 장면 재현 = 불변·준불변은 카드에서 복사, 가변은 장면 지시로 새로 채움. 의상 교체 장면 = 불변 복사 + 준불변 중 C만 교체.
- **경계 사례**: B3 머리 길이는 불변(alternate_hair_length가 이탈 태그)이지만 묶음 방식은 준불변. 종족 파츠는 불변이지만 kemonomimi_mode·변신은 가변(D4). 원형 이름은 불변(사복을 입어도 '기사'), 원형이 함축하는 의상 세트는 준불변(C).

### 2. 기여도 — "이 리프가 빠지거나 틀렸을 때 '같은 캐릭터'로 인식될 확률이 얼마나 떨어지는가"

| 등급 | 정의 | 예 |
|---|---|---|
| 상 | 틀리면 다른 캐릭터로 보인다, 또는 없으면 생성기가 기본값으로 되돌려 실루엣·얼굴 틀이 깨진다(골격 facet) | 머리 색·형태, 눈 색·형태, 등신·체형·의상 실루엣(번들), 존재 유형·성별·연령대, 종족 파츠 목록, 시그니처 액세서리, 시그니처 요소 목록 |
| 중 | 틀리면 '어딘가 다르다'지만 같은 캐릭터로 읽힌다 | 피부색(애니풍에서 대부분 유사 → 변별력 낮음; 이색 피부는 상으로 승격), 세부 얼굴 비율, 의상 디테일·무늬·재질, 역할 범주·세계관·종족 명칭 같은 상위 범주(하위 값이 있으면 중복) |
| 하 | 인식에 거의 기여하지 않음 — 관계 문서·규칙 플래그·자유 관찰, 그리고 순간 상태 | 번들 함축, 출처 구분, 기타, D~G 대부분(장면 정보로는 중요하나 '같은 캐릭터' 판정과 무관) |

- **근거**: 오너 우선순위(머리 > 눈 > 실루엣 > 액세서리 > 피부색 > 나머지) · 캐릭터 검색 DB 식별 facet(gender·eye_color·hair_color·hair_length·age·mimikko) · artistic_license에서 hair·eyes가 독립 절 · 만화 얼굴 인식 연구의 특징(피부색·머리색·머리 양) · 스타일 템플릿 사이클 1 교훈(지시가 없으면 생성기가 평균값으로 회귀 — 골격 facet을 '상'에 넣은 이유).
- **승격·강등 규칙**: 태그는 템플릿의 기본 등급이다. 채운 값이 흔하면(검은 머리·갈색 눈·보통 살색) 실효 기여도가 한 단계 내려가고, 희귀하면(적색 피부·이색 눈·큰 뿔) 올라간다. 캐릭터별 조정은 값 태그를 늘리지 않고 `정체성.고유 식별.시그니처 요소`에 그 리프를 올리는 것으로 한다 — 시그니처 요소에 오른 리프는 템플릿 등급과 무관하게 '상'으로 취급.

### 3. 프롬프트 길이 예산이 빠듯할 때 버리는 순서

1. **가변층(D~G)은 캐릭터 카드 예산에 넣지 않는다.** 장면 지시 예산에서 따로 관리한다.
2. **카드 안에서는 등급 순으로 버린다: 하 → 중 → 상.** 같은 등급 안에서는 (a) 자유 서술이 긴 리프(재질·무늬·세부 비율) → (b) 선택형 값 순으로 버린다. 자유 서술은 토큰당 기여가 낮다.
3. **번들이 있으면 하위 개별 리프부터 버리고 번들 이름만 남긴다**(원형 이름 → C 의상 세트의 개별 항목, 종족 추정 명칭 → B4 파츠 상세). 번들은 압축이 목적이다. 단 개별 리프가 번들의 통념과 다른 값(기사가 사복)이면 그 리프는 번들보다 먼저 살린다.
4. **시그니처 요소 목록에 오른 리프는 등급과 무관하게 마지막까지 남긴다.**
5. **골격 facet(존재 유형·성별·연령대·등신)은 1~2 토큰이므로 절대 버리지 않는다.** 없으면 생성기가 기본값(성인 여성·7등신)으로 되돌린다.
6. **삭감은 삭제이지 요약이 아니다.** 남는 리프의 값은 원문 그대로 둔다 — 요약은 값을 평균화한다(스타일 템플릿 사이클 1에서 '큰 애니 눈'이 표준 애니 눈으로 평균화된 사례와 같은 경로).
7. **최소 카드(하한)**: 존재 유형 · 성별 · 연령대 · 등신 · 머리 색+형태 · 눈 색 · 원형 이름 · 종족 파츠 목록 · 시그니처 요소 상위 3. 이 아래로는 줄이지 않고 장면 쪽 예산을 줄인다.
