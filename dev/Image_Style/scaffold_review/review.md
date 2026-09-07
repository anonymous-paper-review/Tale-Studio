# Scaffold v2 리뷰 → v3 제안
## A. 누락/암묵 축 후보

### A-0. 채택 기준
| 기준 | 판정 규칙 |
|---|---|
| 증거 | 첨부 이미지에서 보이거나 `inputs/style-card-*.md`, `comparison.md`, `analysis-refer5-*.md`에 기록된 실측이어야 한다. |
| 실행성 | 앵커 보드, 인물 방언, 2-ref 절, QA, Style Vector, 유저 파라미터 중 하나 이상을 실제로 바꿔야 한다. |
| 독립성 | 기존 v2 facet 한 줄에 묻혀 생성기가 놓친 구체 규칙이면 독립 축 후보로 본다. |
| 탈락 | 기록만 되고 프롬프트·QA·파라미터로 이어지지 않는 취향/분위기 명명은 탈락한다. |

### A-1. 후보 요약
| ID | 후보 축 | 판정 | 이유 |
|---|---|---|---|
| N1 | 캡처/표현 계층 | 채택 | 작품 자체와 작품 사진, 물리 오브젝트 사진을 구분해야 refer3·refer5를 다르게 처리한다. |
| N2 | 배경/지면 정규화 | 채택 | 순백·틴트·제품컷 배경·무대 배경막이 보드 룩을 직접 바꾼다. |
| N3 | 그림자 시스템 | 채택 | refer1의 캐스트 섀도 0, refer3의 접지 그림자, refer5의 블루 타원, refer6의 면 그림자는 서로 다른 생성 규칙이다. |
| N4 | 채움 토폴로지 | 채택 | refer5 선 중심 선택 채움과 refer6 무선 면분할은 같은 아이소 계열에서도 완전히 다른 결과를 낸다. |
| N5 | 장식 모티프 시스템 | 채택 | refer1 스파클, refer2 보케, refer5 방울·물결, refer6 점선 산포가 전이되고 과용/정렬 실패를 만든다. |
| N6 | 스케일 의존 LOD | 채택 | refer5 인물 외삽, refer6 무얼굴 확대, refer2 얼굴/헤어 고밀도가 인물·소품 결과를 바꾼다. |
| N7 | 확장 재질 사전 | 채택 | 피부·헤어·액체·발광체·건축 표면이 6종 사전 밖에서 반복적으로 필요했다. |
| N8 | 부정 절 | 채택 | 현재 슬롯은 없지만 비교 실험의 실패 양상(종이결·워시·그라디언트)을 막는 데 직접 필요하다. |
| N9 | facet별 신뢰도/출처 | 채택 | 실측/추정/외삽을 구분하지 않으면 refer5 인물 방언과 refer6 곡면 규칙이 같은 확실도로 취급된다. |
| N10 | 다중 입력 커버리지 | 채택 | README §9의 미검증 항목이며, 여러 입력에서 Core/Variation 분류를 자동화할 실행 축이다. |
| N11 | 룩 옵션 후보 | 조건부 채택 | refer1 A' 보드가 룩 변조기로 작동했으나 축이라기보다 프로덕션 파라미터 묶음이다. |

### A-2. 후보별 근거와 실행성
| ID | 근거 | v2가 못 잡는 이유 | 생성 결과 변화 | 출력 슬롯 | 측정 접지 |
|---|---|---|---|---|---|
| N1 | refer3 카드는 "실제 촬영된 스톱모션 퍼펫/미니어처 공예 사진"이고, refer5·6 카드는 "화면 촬영본"이라 회색 캐스트 제거를 기록한다. | v2 2-0은 입력 아티팩트 제거만 말하고, 레퍼런스가 "그림의 사진"인지 "물리 오브젝트의 사진"인지 별도 계층으로 분리하지 않는다. | refer3은 사진 매체·물리 재질·접지 그림자를 유지해야 하고, refer5는 촬영 캐스트를 제거한 클린 라인아트로 가야 한다. | `{RENDERING_RULES}`, QA, 신뢰도, 부정 절 | EXIF/파일 메타, 배경 균일도, 사진 노이즈, 피사계 심도, 물리 접촉 그림자, 원근 촬영 흔적 |
| N2 | comparison.md는 Codex-v2가 "쿨그레이 틴트 바탕"으로 절충한 것이 잔여 격차라고 기록하고, refer5 카드 QA는 "순백 배경 — 촬영 캐스트 제거 성공"을 통과 조건으로 둔다. | v2는 "아티팩트는 제거"까지만 있고 무엇으로 복원할지, 순백/오프화이트/틴트/투명/스튜디오 바닥 중 선택 규칙이 없다. | 배경이 회색 종이로 남으면 orig처럼 잉크-워시 룩으로 표류하고, 순백이면 refer5의 클린 보드가 된다. | `{RENDERING_RULES}`, QA, 프로덕션 파라미터 | 가장 밝은 영역 HSV, 배경 면적, 가장자리 그림자 유무, 카드의 Content-bound 배경 기록 |
| N3 | refer1 QA는 "캐스트 섀도 0", refer3 QA는 "옅은 접지 그림자", refer5 프로브는 "접지 그림자가 블루 타원", refer6은 "면별 명도 3단"과 야간 라이트 풀을 기록한다. | v2의 명암·조명·가장자리 안에 흩어져 있어 cast shadow 유무, 모양, 색, 접지 기능이 독립 검수 항목이 아니다. | 같은 물체도 그림자 0이면 플랫 포스터, 소프트 접지면 제품컷 사진, 블루 타원이면 아이소 라인아트, 면 그림자면 무선 플랫이 된다. | `{RENDERING_RULES}`, QA, Style Vector, 프로덕션 파라미터 | 그림자 마스크 방향/면적/블러 반경, 색상, 물체 접촉부 대비, 명암 단계 수 |
| N4 | refer5는 "화이트+선택 블루 채움", refer6은 "선 없음 — 경계는 면과 면의 명도 차", refer1은 "완전 플랫 채움", refer2는 "셀 그림자와 에어브러시 혼용"이다. | v2는 선·명암·가장자리를 따로 묻지만, 선과 면이 어떤 우선순위로 경계를 만드는지 묻지 않는다. | 채움 규칙이 바뀌면 refer5가 refer6처럼 되거나, refer1이 페인터리로 표류한다. | `{RENDERING_RULES}`, 재질 사전, QA, Style Vector | 선 픽셀 비율, 닫힌 면 채움률, 그라디언트 비율, 채움색 개수, line/fill overlap |
| N5 | refer1 발견은 다크기 4각 스파클 일부 전경 통과를 구조로 복권했고, E′는 장식 불균일 산포를 개선했다. refer2는 골드 보케, refer5는 방울·물결, refer6은 점선 궤적이 전이됐다. | v2의 "장식 모티프"는 캡슐 포함 가능하지만 vocabulary, 산포 리듬, 전경 통과, 금지 모티프를 나누지 않는다. | 균등 배치하면 생성기 기본값으로 돌아가고, 전경 통과를 빼면 refer1 무대 문법이 약해진다. 과용하면 motif leakage처럼 보인다. | `{RENDERING_RULES}`, 장면 2-ref 절, 부정 절, QA | 모티프 종류 카운트, 화면 점유율, 최근접 거리 분산, 전경 객체와 교차 여부 |
| N6 | refer1 T1은 인물 방언 손실, A+B는 초장신 비율·소두·스파이크 헤어가 회복됐다. refer6은 "confident expression"을 얼굴이 아니라 포즈로 흡수했다. | v2 디테일 밀도는 어디를 생략하는지 묻지만, 크기별 생략 규칙과 클로즈업/원경 전환 규칙이 없다. | 작은 인물의 점눈, 클로즈업의 무얼굴 유지, 헤어 가닥 밀도, 손 생략 여부가 달라진다. | `Figure rules:`, `{RENDERING_RULES}`, QA, Style Vector | 얼굴 영역 대비 특징점 수, 인물 높이 대비 눈/입 픽셀 수, 내부선 밀도, 객체 크기별 디테일 slope |
| N7 | refer3은 비닐 스킨·얀 헤어·니트·데님·러버가 Core이고, refer2는 피부 림라이트·글로시 눈·보케, refer5는 액체를 블루 채움으로 번역한다. | v2 재질 사전 6종은 중립 정물용 최소 세트라 인물·효과·건축 재질을 카드 밖으로 밀어낸다. | raincoat가 니트 코트로 번역되는 것처럼 콘텐츠 재질 지시를 스타일 재질 사전이 덮어쓴다. | 재질 사전, `Figure rules:`, `{RENDERING_RULES}`, 오버라이드 선언 | 재질 라벨별 텍스처/하이라이트/색상 규칙, 카드 내 표본 유무, 프로브 재질 변환 결과 |
| N8 | orig refer5는 회색 종이 바탕, 해칭, tone shading이 생성까지 전파됐고 v2는 "no gray photographic cast/moiré"로 방어했다. README는 IP 고유명사 금지도 반복한다. | v2 출력 계약에는 부정 절 슬롯이 없고, 금지해야 할 비스타일 요소가 NOTES나 Content-bound에 흩어진다. | "no paper texture", "no gradients", "no named characters/logos"가 없으면 생성기 기본값이나 원작 콘텐츠가 섞인다. | 신규 부정 절, QA 게이트 | QA 체크리스트의 금지 항목 검출, Content-bound 목록, 실패 이미지의 반복 오차 |
| N9 | refer5 인물 방언은 "원작 인물 표본 0이므로 외삽", refer6 인물은 "실측 n=1", comparison은 보정 hex와 실측 hex를 나눴다. | v2는 ⑰ 외삽 표기를 요구하지만 facet마다 confidence를 붙이지 않는다. | 낮은 신뢰도 축은 캡슐 강도를 낮추거나 QA를 "경고"로 처리하고, 추가 입력 요청/UI 확인 대상으로 보낼 수 있다. | Style Card 메타, QA, 프로덕션 UI | 표본 수, 입력 간 반복률, 계산값/vision/외삽 태그, 자동 신뢰도 점수 |
| N10 | README §9는 다중 입력 미검증과 Core/Variation 분류를 잔여 항목으로 둔다. refer3은 2인이 공유하는 조형만 채택해 작은 다중 표본처럼 작동했다. | v2는 단일 입력 기준 질문은 있으나 여러 이미지에서 facet 커버리지와 충돌을 집계하는 표가 없다. | 3장 이상 입력에서 한 장의 배경/의상/팔레트를 Core로 오판하는 것을 줄이고, Variation은 룩 옵션으로 분리한다. | Style Card 메타, Core/Supporting/Content-bound, 프로덕션 파라미터 | 이미지별 facet presence matrix, 반복률, outlier 감지, 누락 영역 coverage |
| N11 | refer1 A' 마네킹 보드는 장면·사물 전체의 각진 기하와 좁은 팔레트까지 바꾸는 룩 변조기로 작동했다. | v2는 보드 선별이 "품질"인지 "룩 결정"인지 구분하지 않는다. | 표준/각진/절제 보드 등 유저 노출 옵션이 되며, 같은 스타일의 강도와 형태를 바꾼다. | 프로덕션 파라미터 후보, QA, 보드 저장 | 보드별 Style Vector 차이, 프로브 선호 비교, 룩 옵션별 통과율 |

### A-3. 탈락 또는 하향 후보
| 후보 | 처리 | 이유 |
|---|---|---|
| 추상 분위기 명명 | v2 유지, 앵커 제외 | v2 원칙처럼 시각 원인과 함께 기록만 하고 modifier로 후행 주입한다. |
| 특정 콘텐츠 모티프 복제 | 탈락 | refer1 ABCD 폐기처럼 중립 앵커 목표와 충돌한다. 구조화된 장식 시스템만 채택한다. |
| 원작 구도 정합률 | QA 누수 게이트로만 사용 | 구도 원칙은 필요하지만 특정 배치 정합은 모작 방향이다. |
| 촬영 노이즈 재현 | 캡처 계층에서 조건부 | refer3처럼 물리 사진 매체의 카메라 질감은 가능하나, refer5·6의 화면 촬영 노이즈는 제거한다. |

## B. 계층 트리

### B-0. 티어 정의
| 티어 | 역할 | 산출 연결 |
|---|---|---|
| T0 입력 거버넌스 | 무엇을 스타일 증거로 인정할지 결정한다. | 신뢰도, Core/Content-bound, QA 전제 |
| T1 Core 렌더 문법 | 없으면 같은 그림체로 보이지 않는 시각 엔진을 정의한다. | `{RENDERING_RULES}`, 보드 QA |
| T2 도메인 방언 | 인물·재질·장면처럼 보드만으로 부족한 전이 규칙을 보강한다. | `Figure rules:`, 재질 사전, 2-ref 절 |
| T3 실행 제어 | 생성기 기본값, 유저 지시, 표본 부재를 제어한다. | 부정 절, Style Vector, 프로덕션 파라미터 |

### B-1. 결정 순서
| 순서 | 먼저 확정할 것 | 뒤에서 의존하는 것 |
|---:|---|---|
| 1 | 캡처/표현 계층과 입력 아티팩트 | 팔레트 보정, 배경 정규화, 질감 채택 여부 |
| 2 | 콘텐츠/스타일/Content-bound 분리 | Core 목록, 부정 절, 누수 QA |
| 3 | 표본 커버리지와 신뢰도 | 외삽 강도, UI 확인 대상, 다중 입력 병합 |
| 4 | 투영·형태·경계·채움 | 보드 캡슐의 핵심 2~4문장 |
| 5 | 명암·그림자·조명·팔레트 | 재질 번역, 배경/지면, 룩 옵션 |
| 6 | 재질·인물·LOD·장식 | 방언 절, 장면 2-ref 절, 프로브 QA |
| 7 | 오버라이드·부정·파라미터 | 유저 색/재질 지시 충돌 처리, 생산 UI 노출 |

### B-2. v3 리프 축 24개
| # | 축 정의(1문장) | 티어/역할 | Core/Modifier | 출력 슬롯 | 측정 접지 |
|---:|---|---|---|---|---|
| 1 | 캡처/표현 계층은 입력이 원본 이미지, 화면 촬영본, 인쇄물 촬영, 물리 오브젝트 사진 중 무엇인지 정한다. | T0 증거 필터 | Core-정의 | 메타, `{RENDERING_RULES}`, QA | 가능 |
| 2 | 콘텐츠·스타일·입력 아티팩트 분리는 반복 가능한 조형만 스타일로 남기고 장면 소재와 촬영 오염을 제거한다. | T0 증거 필터 | Core-정의 | Core/Supporting/Content-bound, 부정 절 | 부분 가능 |
| 3 | facet 신뢰도는 각 판단을 실측, vision 추정, 보정 추정, 외삽으로 태깅한다. | T0 신뢰도 | Modifier | Style Card 메타, QA | 가능 |
| 4 | 다중 입력 커버리지는 이미지별 facet 반복률과 누락 영역을 집계해 Core와 Variation을 나눈다. | T0 병합 | Core-정의 | 메타, 프로덕션 파라미터 | 가능 |
| 5 | 매체·렌더링 엔진은 벡터, 페인터리, 사진, 공예, 3D 등 표면이 만들어지는 방식을 재료 효과까지 정의한다. | T1 렌더 기반 | Core-정의 | `{RENDERING_RULES}` | 부분 가능 |
| 6 | 투영·카메라·스테이징은 선원근, 아이소메트릭, 정면 평면, 사진 렌즈, 디오라마 시점을 확정한다. | T1 공간 기반 | Core-정의 | `{RENDERING_RULES}`, 2-ref 절 | 부분 가능 |
| 7 | 형태 언어는 곡선/직선, 실루엣 단순도, 비율 과장, 돌기량을 인물·사물·배경 공통 문법으로 잡는다. | T1 조형 | Core-정의 | `{RENDERING_RULES}`, `Figure rules:` | 부분 가능 |
| 8 | 경계 시스템은 선 유무, 선색, 두께 위계, 테이퍼, edge hard/soft/lost 처리를 하나로 정의한다. | T1 경계 | Core-정의 | `{RENDERING_RULES}`, QA | 가능 |
| 9 | 채움 토폴로지는 경계를 선으로 만드는지, 면 명도 차로 만드는지, 선택 채움인지, 그라디언트 혼합인지 정한다. | T1 면 구조 | Core-정의 | `{RENDERING_RULES}`, QA | 가능 |
| 10 | 명암·그림자 시스템은 value 단계, form/cast shadow 유무, 모양, 방향, 색, 블러 반경을 정의한다. | T1 값 구조 | Core-정의 | `{RENDERING_RULES}`, QA, Vector | 가능 |
| 11 | 팔레트·색 분배는 hex 목록보다 면적 비율, 액센트 허용 위치, 모노크롬 엄격도를 우선 기록한다. | T1 색 구조 | Core 또는 Modifier | `{RENDERING_RULES}`, 파라미터 | 가능 |
| 12 | 조명·발광 효과는 광원 방향, 키/필, 림라이트, 블룸, 보케, 라이트 풀 같은 빛의 연출 방식을 정의한다. | T1 광학 | Core 또는 Supporting | `{RENDERING_RULES}` | 부분 가능 |
| 13 | 배경·지면 정규화는 배경을 순백, 오프화이트, 틴트, 투명, 사진 스튜디오 바닥, 무대막 중 하나로 복원한다. | T1 보드 안정화 | Core 또는 Modifier | `{RENDERING_RULES}`, QA | 가능 |
| 14 | 재질 번역 사전은 표준 6종과 확장 재질을 스타일의 고유 물질 어휘로 바꾸는 규칙이다. | T2 재질 | Core-정의 | 재질 사전, `{RENDERING_RULES}` | 부분 가능 |
| 15 | 확장 재질 항목은 피부, 헤어, 액체, 발광체, 건축 표면, 고무/비닐/천 섬유처럼 표준 보드 밖의 반복 재질을 기록한다. | T2 재질 보강 | Modifier | 재질 사전, `Figure rules:` | 부분 가능 |
| 16 | 인물 방언은 비율, 얼굴, 눈·코·입, 헤어 덩어리, 손, 의상 구조가 인물 경로에서 어떻게 그려지는지 정의한다. | T2 인물 | Core 또는 외삽 | `Figure rules:`, QA | 부분 가능 |
| 17 | 스케일 의존 LOD는 원경·소품·클로즈업에서 어떤 디테일을 유지하거나 생략하는지 정한다. | T2 전이 안정화 | Modifier | `Figure rules:`, `{RENDERING_RULES}`, QA | 가능 |
| 18 | 디테일 밀도는 초점부와 주변부, 실루엣과 내부선, 장식과 재질 묘사의 상대 밀도를 정한다. | T2 밀도 | Supporting | `{RENDERING_RULES}`, Vector | 가능 |
| 19 | 질감·마감은 붓터치, 종이결, 노이즈, 직물 섬유, 디지털 폴리시가 어디에 나타나는지 정한다. | T2 표면 | Core 또는 Supporting | `{RENDERING_RULES}`, 부정 절 | 가능 |
| 20 | 의도적 불완전성·정밀도는 손맛, 비대칭, 불균등 간격, 기하 정연함 중 무엇이 시그니처인지 정한다. | T2 정밀도 | Core 또는 Modifier | `{RENDERING_RULES}`, QA | 부분 가능 |
| 21 | 장식 모티프 시스템은 반복 부호의 어휘, 크기, 점유율, 산포 리듬, 전경 통과 여부를 정의한다. | T2 장면 방언 | Supporting 또는 Core | `{RENDERING_RULES}`, 2-ref 절, QA | 가능 |
| 22 | 구도·여백 원칙은 원작 배치를 복제하지 않고 균형, 겹침, 밀도 중심, 여백 사용만 전이한다. | T2 구성 | Supporting | 2-ref 절, QA | 부분 가능 |
| 23 | 오버라이드 우선순위는 스타일 문법이 콘텐츠 지시를 덮는 축과 유저 지시가 이기는 축을 선언한다. | T3 충돌 제어 | Modifier | 오버라이드 선언, 파라미터 | 부분 가능 |
| 24 | 외삽·부정·파라미터 묶음은 표본 부재 영역의 생성 규칙, "이 스타일이 아닌 것", 유저 노출 옵션을 함께 관리한다. | T3 실행 제어 | Modifier | 외삽, 부정 절, Vector, UI | 부분 가능 |

### B-3. 기존 17축 매핑
| v2 축 | v3 위치 | 처리 |
|---|---|---|
| 2-0 콘텐츠/스타일 분리 | #1 #2 #3 #4 | 캡처 계층·신뢰도·다중 입력을 분리해 강화한다. |
| ① 매체·렌더링 | #5 | 유지하되 캡처 계층 확정 뒤 판정한다. |
| ② 형태 언어 | #7 | 유지하고 인물·사물 공통 문법으로 둔다. |
| ③ 선 | #8 | 가장자리와 병합해 경계 시스템으로 둔다. |
| ④ 명암 구조 | #10 | 그림자 시스템을 포함해 확장한다. |
| ⑤ 색상 팔레트 | #11 | 색 분배 규칙과 병합한다. |
| ⑥ 조명 | #12 #10 | 광원/발광은 #12, 그림자 실행 규칙은 #10으로 나눈다. |
| ⑦ 가장자리 | #8 #9 | 선과 면 경계의 하위 규칙으로 병합한다. |
| ⑧ 재질 렌더링 | #14 #15 | 표준 6종 + 확장 재질 사전으로 확장한다. |
| ⑨ 질감·붓 터치 | #19 | 유지하되 입력 노이즈 금지와 연결한다. |
| ⑩ 디테일 밀도 | #17 #18 | 스케일 LOD와 일반 밀도로 분리한다. |
| ⑪ 원근·카메라·투영 | #6 | 유지한다. |
| ⑫ 구도 | #22 | 원작 구도 복제가 아니라 원칙만 남긴다. |
| ⑬ 분위기·감정 | #24의 modifier 후보 | 앵커 제외 원칙 유지, 필요 시 후행 톤 파라미터로만 둔다. |
| ⑭ 의도적 불완전성 | #20 | 촬영·압축 흔적 제외를 명시한다. |
| ⑮ 오버라이드 우선순위 | #23 | 유지하고 색/재질/조형/방언별 우선순위 표로 세분한다. |
| ⑯ 색 분배 규칙 | #11 | 팔레트와 병합한다. |
| ⑰ 표본 부재·외삽 | #3 #24 | 신뢰도 태그와 실행 규칙으로 분리한다. |

## C. 병합·삭제·조건화

### C-1. 병합
| 대상 | 처리안 | 이유 |
|---|---|---|
| 선 + 가장자리 | `경계 시스템`으로 병합 | refer5의 라인아트와 refer6의 무선 면분할은 선 유무만이 아니라 경계 생성 방식의 차이다. |
| 명암 + 조명 일부 | `명암·그림자 시스템`과 `조명·발광 효과`로 재분리 | 그림자는 물체 접지와 value 구조를 바꾸고, 발광/림라이트는 효과 계층이라 실행 슬롯이 다르다. |
| 색상 팔레트 + 색 분배 규칙 | `팔레트·색 분배`로 병합 | hex만으로는 refer6 앰버 액센트의 위치 제한이나 refer5 모노크롬 엄격도를 못 잡는다. |
| 재질 + 질감 일부 | 재질은 번역 사전, 질감은 표면 마감으로 분리 | refer3의 니트/데님은 재질 사전이고, refer5의 촬영 노이즈는 질감이 아니라 아티팩트다. |
| 디테일 밀도 + LOD | 일반 밀도와 스케일별 생략 규칙으로 분리 | refer6 무얼굴은 단순 저밀도가 아니라 얼굴 지시의 대체 규칙이다. |
| 분위기 + 룩 옵션 | 분위기는 후행 modifier, 룩 옵션은 보드/팔레트 파라미터 | 앵커 캡슐에 감정어를 구우면 중립 보드가 특정 장면 톤으로 고정된다. |

### C-2. 삭제 또는 하향
| 항목 | 처리안 | 이유 |
|---|---|---|
| 원작 특정 배경 구성 | Content-bound로 삭제 | refer1 ABCD 폐기의 핵심 원인이다. |
| 특정 의상·소품·로고·캐릭터 얼굴 | Content-bound와 부정 절에만 남김 | 정체성 누수 게이트 대상이지 스타일 Core가 아니다. |
| 촬영 회색 캐스트·모아레·글레어 | 입력 아티팩트로 삭제 | refer5 orig 실패처럼 보드와 프로브 전체를 오염시킨다. |
| "예쁘다/강렬하다/귀엽다" 같은 분위기 단어 | 삭제 또는 시각 원인으로 환원 | 생성 변수로 충분히 접지되지 않는다. |
| E′ 전체 기본 삽입 | 삭제하고 게이트 통과 시만 삽입 | refer6처럼 기하 정연함이 시그니처인 스타일에는 비대칭 절이 해롭다. |

### C-3. 조건화 게이트
| 조건부 절 | 게이트 | 적용 | 미적용 |
|---|---|---|---|
| E′ 비대칭 절 | 불규칙성 ≥ 3 또는 카드에 비대칭/불균등이 Core/Supporting으로 명시 | refer1, refer3 일부 | refer5·6처럼 클린/균일성이 명시된 경우 |
| E′ 선 3단계 | 경계 시스템에서 선 있음 + 선 변화 ≥ 2.5 + 외곽/내부 위계 관찰 | refer1, Codex-v2 refer5 분석처럼 위계가 관찰될 때 | refer6 무선, refer5 카드처럼 균일 선이 시그니처일 때 |
| 장식 불균일 산포 | 장식 모티프가 Supporting 이상이고 최근접 거리 분산이 크거나 카드에 uneven rhythm 기록 | refer1, refer2, refer5, refer6 | 장식이 없거나 제품컷식 깨끗한 배경 |
| strict monochrome | 팔레트 색 다양성 ≤ 1.5 + 색 분배에서 액센트 위치 제한 + 유저가 순수성 선택 | refer5 보드 모드 | 콘텐츠 색 유지가 중요한 프로브 |
| 배경 순백 복원 | 입력이 화면/제품 촬영이고 밝은 배경이 Content-bound 또는 아티팩트로 판정 | refer5, refer6의 클린 보드 | refer3처럼 실제 제품 사진 매체의 스튜디오 바닥/접지감이 Core일 때 |
| 물리 사진 질감 유지 | 캡처 계층이 물리 오브젝트 사진이고 재질 사전이 실제 재료를 Core로 판정 | refer3 | refer5·6 화면 촬영본 |
| 인물 방언 주입 | 인물 표본 있음 또는 외삽 규칙이 명시되고 인물 포함 샷 | refer1·2·3, refer5·6 인물 프로브 | 무인물 장면 프로브 |
| 인물 2-ref 절 대체 | 원작에 인물 표본 0 | refer5 | 인물 표본이 있는 refer1·2·3 |
| 낮은 신뢰도 UI 확인 | facet 신뢰도 외삽 또는 실측 n=1이고 Core 후보 | refer5 인물, refer6 인물/곡면 | 다중 입력에서 반복 확인된 Core |

### C-4. QA 게이트 개편
| 게이트 | 추가 체크 |
|---|---|
| 보드 facet ①~④ | 배경 정규화, 그림자 시스템, 채움 토폴로지, 장식 점유율을 추가한다. |
| 정체성·모티프 누수 | Content-bound뿐 아니라 부정 절 항목도 검출한다. |
| 캡처 오염 | 화면 촬영본이면 회색 캐스트·모아레·글레어·압축 노이즈가 생성물에 남았는지 본다. |
| 방언 전이 | 인물 표본/외삽 신뢰도 태그를 보고 실패가 확정 오류인지 반복 검증 대상인지 나눈다. |
| 파라미터 충돌 | 유저 팔레트/재질 지시가 스타일 Core를 덮는지, 허용된 override인지 기록한다. |

## D. 캡슐 문구 예시

| 후보 | 영문 캡슐 문구 예시 |
|---|---|
| N1 캡처/표현 계층 | Render this as the intended artwork/material style, not as a photographed screen or scan; keep physical camera cues only when the reference is a real miniature object photograph. |
| N2 배경/지면 정규화 | Normalize the ground to a clean intentional field: pure white or off-white for flat graphic work, and only retain a tinted studio floor when physical object photography is part of the style. |
| N3 그림자 시스템 | Use the style-specific shadow grammar: either no cast shadows, a soft contact shadow, a flat colored offset ellipse, or hard planar face shadows, never a generic realistic drop shadow. |
| N4 채움 토폴로지 | Build boundaries from the correct source: closed line art with sparse spot fills, no-outline planar value blocks, flat cel fills, or blended painterly gradients according to the reference. |
| N5 장식 모티프 시스템 | Add only the observed decorative vocabulary in a sparse uneven rhythm, with controlled size variation and occasional foreground crossing when that behavior is visible in the style. |
| N6 스케일 의존 LOD | Reduce detail by scale: tiny figures use dot or omitted facial features, mid-size props keep only structural marks, and close focal faces receive only the level of detail supported by the style. |
| N7 확장 재질 사전 | Translate skin, hair, liquid, glow, rubber, vinyl, fabric, and architectural surfaces through the style's material vocabulary instead of using default realistic materials. |
| N8 부정 절 | Avoid photographic screen cast, moire, paper grain, generic gradients, realistic textures, logos, text, named characters, and any copied scene-specific motif from the reference. |
| N9 facet별 신뢰도 | Treat measured traits as strong constraints, inferred traits as moderate constraints, and extrapolated traits as tentative generation rules that should not override stronger content requirements unless explicitly marked core. |
| N10 다중 입력 커버리지 | Preserve only traits repeated across the supplied references as core; treat one-off palette, costume, pose, setting, and prop choices as variations or content-bound details. |
| N11 룩 옵션 후보 | Offer alternate anchor-board looks only when they preserve the same core grammar while intentionally shifting palette narrowness, angularity, detail density, or figure emphasis. |

## E. 자기 검토

### E-1. 근거 강도
| 제안 | 근거 강도 | 표시 |
|---|---|---|
| N1 캡처/표현 계층 | 강 | refer3과 refer5·6의 처리 차이가 직접 증거다. |
| N2 배경/지면 정규화 | 강 | comparison.md의 잔여 격차와 refer5 QA 통과 조건이 직접 증거다. |
| N3 그림자 시스템 | 중 | 5개 카드 전반에 사례가 있으나, 그림자만 단독 A/B한 실험은 없다. |
| N4 채움 토폴로지 | 강 | refer5와 refer6의 같은 계열 내 분리가 직접 증거다. |
| N5 장식 모티프 시스템 | 강 | refer1 E′ A/B와 여러 카드의 전이 기록이 있다. |
| N6 스케일 의존 LOD | 중 | 인물 방언과 무얼굴 전이는 강하지만 LOD 자체를 별도 조작한 A/B는 없다. |
| N7 확장 재질 사전 | 강 | refer3 raincoat→니트 코트와 보드 재질 QA가 직접 증거다. |
| N8 부정 절 | 중상 | orig 실패와 v2 방어 문구가 근거이나, 독립 부정 슬롯 A/B는 아직 없다. |
| N9 facet별 신뢰도 | 중 | refer5·6 외삽 표기와 README 잔여 항목이 근거이나 생성 품질 A/B는 없다. |
| N10 다중 입력 커버리지 | 약-중 | README 잔여 항목과 refer3 2인 공유 특징 사례뿐이며, 실제 3장+ 입력 실험은 없다. |
| N11 룩 옵션 후보 | 중 | refer1 A' 보드가 증거지만 프로덕션 옵션으로 반복 검증되지는 않았다. |

### E-2. 추측 의존 표시
| 항목 | 리스크 | 보완 실험 |
|---|---|---|
| 그림자 시스템 독립 축 | 그림자만 바꾼 결과 변화가 분리 측정되지 않았다. | refer1·3·5·6에서 shadow clause on/off 보드 A/B를 1회씩 돌린다. |
| 스케일 LOD | 카드 관찰은 있으나 크기별 자동 측정 기준이 아직 거칠다. | 같은 스타일로 원경 인물, 반신, 얼굴 클로즈업 3단 프로브를 만든다. |
| 부정 절 | 부정문이 얼마나 강해야 하는지 모델별로 다를 수 있다. | refer5 orig 실패 항목을 negative-only 패치로 재생성해 비교한다. |
| 다중 입력 커버리지 | 실제 다중 입력 자료가 없다. | 같은 스타일 3장, 혼합 스타일 3장, 콘텐츠만 다른 3장 세트를 따로 검증한다. |
| 룩 옵션 | 유저 선호와 QA 통과가 다를 수 있다. | 표준/각진/절제 보드 2~3종을 같은 프로브에 물려 선택률과 누수율을 비교한다. |

### E-3. v3 반영 우선순위
| 우선순위 | 반영 항목 | 이유 |
|---:|---|---|
| 1 | N1 캡처 계층, N2 배경 정규화, N8 부정 절 | comparison.md가 보여준 전체 파이프라인 실패를 직접 막는다. |
| 2 | N3 그림자 시스템, N4 채움 토폴로지, N5 장식 시스템 | 앵커 보드와 프로브의 시각 결과를 바로 바꾸는 Core 실행 축이다. |
| 3 | N7 확장 재질, N6 LOD | 인물·재질 전이 안정성에 중요하나 카드 구조가 커지므로 표 형태로 흡수한다. |
| 4 | N9 신뢰도, N10 다중 입력 | 자동화와 UI 확인에 중요하지만 스캐폴드 분석 메타에 가깝다. |
| 5 | N11 룩 옵션 | v3 스캐폴드 본문보다 프로덕션 기능 설계에서 다루는 편이 맞다. |

### E-4. 최종 권고
| 영역 | 권고 |
|---|---|
| 스캐폴드 본문 | 17축을 24개 리프 트리로 재편하되, 분석자에게는 T0→T1→T2→T3 순서로 답하게 한다. |
| 캡슐 | 2~4문장 제한을 유지하되, 경계/채움/그림자/배경/장식/부정 핵심을 압축해 넣는다. |
| 방언 절 | 인물 표본이 없으면 `[EXTRAPOLATED]`를 첫 토큰으로 붙이고 장면용 2-ref 절을 대체 적용한다. |
| 부정 절 | 신규 슬롯을 만든다. 고유명사 없이 입력 아티팩트, 제네릭 기본값, Content-bound motif를 금지한다. |
| QA | "완료" 판정이 아니라 오너 판정용 사실 수집으로 두고, 새 축별 체크 결과와 스크린샷/잡 ID를 같이 남긴다. |
