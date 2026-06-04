# 용어 충돌 / 혼동 주의 목록 (Conflicts)

← 돌아가기: [[README]]

> 이 문서는 **현재 코드에 존재하는 네이밍 불일치를 사실 그대로 기록**합니다(문서화 전용).
> 코드를 바꾸지 않습니다. 리팩토링이 필요하면 별도 작업으로 분리하세요.
> 각 항목의 "통일 후보"는 참고용 제안일 뿐, 아직 적용되지 않았습니다.

분류: 🔴 같은 이름 다른 뜻/타입 · 🟡 같은 개념 다른 이름 · 🟢 레이어 간 매핑 주의

---

## 🔴 1. `referenceImages` — 같은 이름, 다른 타입
| 위치 | 타입 |
|---|---|
| `Character` (`scene.ts`) | `string[]` |
| `ShotNodeData` (`director-canvas.ts`) | `DirectorReferenceImage[]` (`{id,url,uploadedAt}`) |

동일 이름이 한쪽은 URL 문자열 배열, 한쪽은 객체 배열. 자동완성·복붙 시 혼동 위험.
관련: [[reference]] · 통일 후보: 객체 배열로 통일하거나 이름 분리.

## 🔴 2. `referenceImageUrl`(단수) vs `referenceImages`(복수)
| 위치 | 식별자 | 형태 |
|---|---|---|
| `Shot` (`shot.ts`) | `referenceImageUrl` | 단수, 이미지 1장 |
| `ShotNodeData` | `referenceImages` | 복수 |

같은 "샷의 참고 이미지"인데 단/복수 + 이름이 다름. 관련: [[shot]] [[reference]].

## 🔴 3. 캐릭터 뷰 — TS 5개 vs DB 3개
| 레이어 | 뷰 |
|---|---|
| `CharacterView` (`asset.ts`) | front, side, back, **threeQuarterLeft, threeQuarterRight** |
| `characters` 테이블 (DB) | view_front, view_side, view_back |

`threeQuarterLeft/Right`는 DB에 컬럼이 없어 **영속화되지 않음**. 새로고침 시 유실 가능.
관련: [[asset]].

## 🟡 4. 캐릭터 = Character = CharacterAsset = `'actor'`
| 단계 | 이름 |
|---|---|
| Writer (`scene.ts`) | `Character` |
| Artist 에셋 (`asset.ts`) | `CharacterAsset` |
| Artist 캔버스 노드 kind | `'actor'` |

캔버스에서만 "actor"로 바뀜. "actor"와 "character"를 같은 것으로 인지해야 함. 관련: [[asset]].

## 🟡 5. 장소 = Location = WorldAsset = `'world'`
| 단계 | 이름 |
|---|---|
| Writer (`scene.ts`) | `Location` (`locationId`) |
| Artist 에셋 (`asset.ts`) | `WorldAsset` (`locationId` 유지) |
| Artist 캔버스 노드 kind | `'world'` |
| DB | `locations` 테이블 |

"Location"이 에셋/캔버스에선 "World/world"로 명칭이 완전히 바뀜(식별자는 `locationId` 유지).
가장 헷갈리는 매핑 중 하나. 관련: [[asset]].

## 🟡 6. "씬이미지" / "샷이미지" — 용어 정리됨 (일부 해소)
- **샷이미지 = `storyboardImage` (정식 타입 `StoryboardImage`)** ✅ 해소됨 (결정 #36/#37, 마이그레이션 006).
  시스템 I2I 생성, 샷당 1장. 사용자 업로드 `referenceImages`와 의미상 분리됨.
- **씬이미지** ≈ `WorldAsset.wideShot` / `establishingShot` — 여전히 코드 식별자 없는 개념어.

⚠️ 잔여 혼동: `storyboardImage`(시스템 생성) vs `referenceImages`(사용자 업로드)를 "샷에 붙은 이미지"로
뭉뚱그리지 말 것. 관련: [[shot]] [[image]] [[reference]].

## 🟡 7. 영상 최종/오래됨 플래그 — TS vs DB
| | TS (`VideoNodeData`) | DB (`video_clips`) |
|---|---|---|
| 최종 | `final` | `is_final` |
| 오래됨 | `stale` | (컬럼 없음) |

`stale`은 캔버스 런타임 상태로만 존재. 관련: [[video]].

## 🟢 8. `scene_id` / `shot_id`는 논리적 FK (물리 FK 아님)
`shots`, `video_clips`는 DB상 `project_id`로만 외래키가 걸려 있고, `scene_id`/`shot_id`는
TEXT 컬럼으로 **앱 레벨에서만** 연결됨. DB 무결성 제약이 없으니 고아 레코드 주의. 관련: [[relationships]].

## 🟢 9. Writer 객체 ↔ 캔버스 노드는 별개 (nullable 링크)
`Scene`↔`SceneNodeData`(`writerSceneId`), `Shot`↔`ShotNodeData`(`writerShotId`)는
서로 다른 객체이며 링크가 `null`로 끊길 수 있음. 동일시 금지. 관련: [[scene]] [[shot]].

## 🟢 10. `CameraPreset` — 객체(TS) vs 평탄화 컬럼(DB)
TS `CameraPreset { brand, focalLength, aperture, whiteBalance }`가
DB `shots`에선 `camera_brand`, `focal_length`, `aperture`, `white_balance` 컬럼으로 분해됨. 관련: [[shot]].

---

## 요약 우선순위 (혼동 빈도 기준)
1. 레퍼런스 이미지 3종 분산 (#1, #2) — 가장 자주 헷갈림
2. 캐릭터/장소의 3중 명칭 (#4, #5)
3. 캐릭터 뷰 TS/DB 개수 불일치 (#3) — 데이터 유실 가능성
