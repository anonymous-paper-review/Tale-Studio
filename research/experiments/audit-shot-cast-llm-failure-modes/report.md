# audit-shot-cast-llm-failure-modes

- 조사일: 2026-08-18
- 범위: `shots.characters`와 그 원천인 `characters`/씬/대사 인물 참조를 만드는·검증하는·저장하는·복구하는 코드. Writer V1/V2, 기존 수동 편집, `repair-json` 경로를 함께 추적했다.
- 변경 금지: 운영 DB와 제품 코드는 수정하지 않았다. 테스트·린트·포맷터도 실행하지 않았다.
- 판정 기준: `characters.character_id`(DB) 또는 V1 파이프라인의 `Characters.characters[].id`에 없는 값은 “명단 밖”이다. 이름을 ID 자리에 넣거나 `character_id`/`id` 필드를 잘못 섞는 것은 “필드 혼용”이다.

## 결론 요약

현재는 **부분적인 fail-safe만 있다.** V1의 C2 단계는 샷 에셋 참조에서 명단 밖 ID를 제거하지만, 그것도 샷을 실패시키지 않고 빈 `characters`로 계속 진행한다. 씬의 `characters_present`, 대사 화자, 수동 편집, V2 적용은 별도의 명단 검증 없이 저장될 수 있다. 따라서 “최근 데이터가 정상”이라는 관측만으로 안전하다고 결론 내릴 수 없다.

가장 큰 저장 위험은 다음 네 가지다.

1. **V1 샷은 C2에서만 정규화되고 persist 단계에서는 재검증하지 않는다.** 재개 상태·수동 삽입·다른 경로가 `persistShotsToDb`에 직접 들어오면 보호막이 없다.
2. **명단 밖 캐릭터를 모두 drop해도 샷을 살려 둔다.** `allCharactersDropped`는 WARNING 리포트일 뿐이고, 실제 `shots.characters=[]`로 저장된다. “필드 소실”이 성공처럼 보이는 경로다.
3. **V2는 문자열 모양만 검사한다.** `visual.character_refs`와 `dialogue.character_id`가 실제 캐릭터 ID인지 확인하지 않고 그대로 `shots.characters`와 `dialogue_lines`에 쓴다. 실패한 2차 검토 결과도 사람 승인만 하면 Apply할 수 있다.
4. **수동/레거시 경로는 DB 오류와 명단 검증을 약하게 처리한다.** Writer store의 `updateShot`은 update 오류를 읽지 않고, 레거시 씬 재생성은 이름을 ID 입력으로 바꿔 전달하며, Artist 샷 보드는 임의 문자열 배열을 그대로 update한다.

## 인물 연결을 쓰는 자리 전수 목록

| 구분 | 쓰기 지점 | 실제 기록 필드 | 보호 수준 / 실패 동작 |
|---|---|---|---|
| Producer canonical ID 생성 | `src/lib/cast-slug.ts:6-34`, `src/stores/producer-store.ts:828-836` | 이후 모든 `character_id`의 원천 | 이름→slug 및 배열 내 중복만 처리. 이미 전달된 `characterId`는 그대로 유지하고 DB 기존 roster와의 충돌/형식 검증은 하지 않음. |
| Producer→V1 handoff | `src/app/api/writer/start/route.ts:127-144` | `characters` insert/upsert | 런타임 구조/ID 검증 없음. DB 오류는 throw되어 시작 요청 실패. |
| V1 S3 Tier 1 | `src/lib/writer/pipeline/util/persist_manifest.ts:272-300` | `scenes.characters_present` | S3 스키마는 `scene_id/location/scene_actions`만 필수. 명단 밖 `characters_in_scene`를 제거하지 않고 씬 행에 저장. |
| V1 캐릭터 Tier 1 | `src/lib/writer/pipeline/util/persist_manifest.ts:303-403` | `characters` insert/update | `characters.characters`의 `id`를 신뢰. 새 writer 캐릭터를 그대로 insert. DB 오류는 helper가 throw. 호출부에 따라 best-effort 흡수. |
| V1 L4 parse | `src/lib/writer/pipeline/stages/v4_shots.ts:225-293` | 메모리 `ShotDesign` | `intent` 키만 있으면 샷으로 인정. 캐릭터 필드/ID/전집합 검증 없음. 빈 배열만 거부. |
| V1 C2 asset guard | `src/lib/writer/pipeline/stages/c_application_2.ts:220-236`, `src/lib/writer/pipeline/util/asset_refs.ts:68-130` | 메모리 `shotSequence.assets.characters` | registry 정확 매칭/`_vN` 제거 후 불명 ID drop. 전부 drop해도 WARNING만 만들고 샷을 계속 살림. |
| V1 Tier 2 shots persist | `src/lib/writer/pipeline/util/persist_manifest.ts:631-639,697-753` | `shots.characters`, `shots.dialogue_lines` | `assets.characters[].id`를 배열로 옮겨 저장. 이 단계 자체는 roster 조회/교차 검증 없음. DB 오류는 throw하지만 상위가 흡수할 수 있음. |
| V1 resume | `src/lib/writer/pipeline/steps.ts:218-251` | 기존 `state.shotSequence` 재사용 | `shotSequence`와 `shotCheck`가 이미 있으면 C2 재실행/재정규화 없이 그대로 다음 단계로 이동. |
| V1 대사 스테이지 | `src/lib/writer/pipeline/stages/dialogue.ts:228-261` | 메모리 대사 화자 | 샷 ID와 `line` 타입만 일부 필터. `character_id`가 roster/씬 등장인물인지 확인하지 않음. 누락 샷은 침묵으로 채움. |
| V1 대사 재생성 API | `src/app/api/writer/dialogue/route.ts:77-103` | `shots.dialogue_lines[].characterId` | 위 대사를 그대로 update. update 오류는 카운트만 줄이고 전체 응답은 `ok:true`로 반환. |
| V2 semantic schema | `src/lib/writer/v2/semantic-unit.ts:6-58` | V2 package | `character_id`/`character_refs`가 비어 있지 않은 문자열인지까지만 확인. roster membership 없음. |
| V2 Apply 변환 | `src/lib/writer/v2/persist.ts:86-138` | `shots.characters`, `dialogue_lines` | `visual.character_refs + story.dialogue.character_id`를 `unique()`만 한 뒤 그대로 기록. |
| V2 Apply DB | `src/lib/writer/v2/persist.ts:289-314` | canonical `scenes`/`shots` 전체 | project의 모든 shots/scenes를 삭제 후 삽입. 명단 밖 ID도 DB 오류 없이 들어갈 수 있음. |
| V2 Review→Apply | `src/app/api/writer/v2/review/route.ts:48-67`, `src/app/api/writer/v2/apply/route.ts:33-47` | 승인된 V2 package | `current.draft.units`만 있으면 check 실패 attempt도 사람 `accept` 가능. Apply는 status/승인만 확인하며 roster 재검증 없음. |
| Writer 채팅 | `src/lib/writer-chat-updates.ts:50-61,114-135,145-180`, `src/app/api/writer/chat/route.ts:180-218` | 수동 `shots.characters`, 씬/대사 | projectId가 있으면 DB roster whitelist로 unknown drop하고 안내. projectId가 없으면 무필터. roster 조회 오류도 빈 Set으로 처리되어 전부 drop될 수 있음. store 직접 호출은 whitelist를 거치지 않음. |
| Writer store 수동 CRUD | `src/stores/writer-store.ts:97-105,228-267,304-355` | `shots.characters` | 타입이 배열/문자열인지 정도만. updateShot은 DB update 오류를 읽지 않음. addShot은 입력 배열을 그대로 insert(실패 시에만 전체 rollback). |
| 레거시 씬 재생성 | `src/stores/writer-store.ts:717-733,744-771`, `src/app/api/director/generate-shots/route.ts:73-128` | 수동 `shots.characters` | store가 ID를 표시명으로 바꿔 LLM에 보냄. API는 RawShot shape/roster 검증 없이 `raw.characters`를 반환. insert 오류도 확인하지 않음. |
| Artist 샷 보드 | `src/stores/artist-board-store.ts:75-91,142-152` | `shots.characters` | UI에서 온 `string[]`를 그대로 DB update. roster/scene 포함 여부 검증 없음. DB 오류만 낙관 상태 rollback. |
| Artist 캐릭터 카드 | `src/app/api/artist/character/route.ts:20-72,89-137`, `src/app/api/artist/appearance/route.ts:21-52` | `characters` 행 | 필수 문자열/role enum과 appearance 길이 등만 확인. ID가 실제 기존/프로젝트 roster인지 확인하지 않음(POST는 project ownership 확인도 없음). |

## 경로별 상세 감사

### 0) Producer가 canonical ID를 만드는 지점

Writer가 참조하는 ID는 Producer에서 먼저 만든다. 이름을 slug로 바꾸는 경우에는 ASCII 영숫자와 `_`/`-`만 남기고, 같은 캐스트 배열 안에서만 `_2`, `_3`를 붙인다.

> `src/lib/cast-slug.ts:6-13,24-34`
>
> `replace(/[^a-z0-9\s_-]/g, '')`
> `const base = m.characterId?.trim() || slugifyName(m.name)`
> `while (used.has(slug)) slug = \`${base}_${n++}\``

이미 `characterId`가 있으면 slugify하지 않고 그대로 유지한다. DB에 이미 같은 ID가 있는지, ID가 canonical 정책에 맞는지, 현재 프로젝트의 다른 원천과 충돌하는지는 이 함수에서 확인하지 않는다. 따라서 이후 LLM 오류가 아니라도 “ID를 만드는 경계” 자체가 roster 계약의 단일 검증 지점은 아니다.

### 1) V1 씬과 캐스트: 명단 밖 인물이 씬에 남는다

S3 입력 검증은 씬 최소 모양만 확인한다.

> `src/lib/writer/pipeline/schemas.ts:50-61`
>
> `export const StorySceneLooseSchema = z.looseObject({`
> `  scene_id: z.string(),`
> `  location: z.string(),`
> `  scene_actions: z.array(z.string()).min(1),`
> `});`
>
> `export const ScenesSchema = z.looseObject({`
> `  scenes: z.array(StorySceneLooseSchema).min(1),`
> `});`

`characters_in_scene`의 존재·배열 원소·roster membership을 검사하지 않는다. `mergeOpenCast`는 모델이 별도로 낸 `new_characters`만 기존 캐스트에 추가할 뿐, 씬 안에만 갑자기 등장한 명단 밖 ID를 보완하지 않는다.

> `src/lib/writer/pipeline/stages/s3_scenes.ts:14-20`
>
> `const existing = new Set(prev.characters.map((c) => c.id));`
> `for (const n of scenes.new_characters) {`
> `  if (!n.id || existing.has(n.id)) continue;`

그 뒤 Tier 1 persist는 씬의 배열을 바로 DB에 넣는다.

> `src/lib/writer/pipeline/util/persist_manifest.ts:272-300`
>
> `characters_present: r.chars,`
> `...`
> `assertDbOk('scenes insert', sceneInsertErr)`

따라서 LLM이 `characters_in_scene: ["girl", "char_01"]`를 내고 실제 roster가 `char_01`뿐이면 `girl`은 씬 DB에 저장된다. 이후 프롬프트의 `characters.characters.filter(...)`는 `girl`을 찾지 못해 설명을 잃고, 저장된 씬과 이미지 참조가 서로 다른 집합이 된다. 이는 정상 데이터 샘플만 봐서는 드러나지 않는 명단/필드 혼용 실패다.

### 2) V1 L4 파싱: 모양만 통과, 캐릭터 필드 검증은 C2 뒤로 미뤄짐

L4 parser의 “샷 같다” 판정은 `intent` 키 하나뿐이다.

> `src/lib/writer/pipeline/stages/v4_shots.ts:225-232`
>
> `function isShotLike(v: unknown): v is ShotDesign {`
> `  return !!v && typeof v === 'object' && 'intent' in (v as object);`
> `}`
>
> `if (values.length > 0 && values.every(isShotLike)) return values as ShotDesign[];`

따라서 `static_spec.character_blocking`이 없거나 `character_id`가 이름/오타여도 L4 parse 자체는 성공한다. V4의 샷 수 guard는 **개수**만 확인한다.

> `src/lib/writer/pipeline/stages/v4_shots.ts:324-337`
>
> `if (Math.abs(got - expected) <= opts.tolerance) return { kind: 'ok' };`
> `...`
> `if (got < expected * CATASTROPHIC_LOSS_RATIO) return { kind: 'fatal', ... }`
> `return { kind: 'accept', reason };`

즉 샷 수가 기대보다 조금 많거나 적으면 최종 시도에 `accept`하고, 캐릭터 연결은 별도 문제로 남는다. 이 guard는 명단 밖 캐릭터를 차단하는 장치가 아니다.

### 3) V1 C2 asset 정규화: pipeline 내부의 연결 방어지만 “안전한 실패”가 아님

C2는 canonical character ID 집합을 만들고 unknown을 drop한다.

> `src/lib/writer/pipeline/stages/c_application_2.ts:220-226`
>
> `const assetRegistry = buildAssetRegistry(characters, worldVisual);`
> `const assetNorm = normalizeShotSequenceAssetRefs(finalShots, assetRegistry, sceneLocationById);`
> `finalShots = assetNorm.shots;`

> `src/lib/writer/pipeline/util/asset_refs.ts:76-107`
>
> `const res = resolveAssetRef(c.id, reg);`
> `if (res && res.kind === 'character') { ... }`
> `issues.push({ shot_id: shot.shot_id, field: 'characters', dropped: c.id });`
> `return null;`

그러나 전부 탈락한 경우에도 반환 타입은 정상 shot이고, 경고 이슈만 추가한다.

> `src/lib/writer/pipeline/util/asset_refs.ts:157-175`
>
> `allCharactersDropped: origCharCount > 0 && characters.length === 0`
> `...`
> `severity: 'WARNING'`
> `message: '캐릭터 reference가 전부 미해결 → 이 샷은 캐릭터 에셋 없이 생성됨 ...'`

그 후 `persistShotsToDb`는 `assets.characters`에서 남은 값만 옮겨 `characters: r.chars`로 저장한다.

> `src/lib/writer/pipeline/util/persist_manifest.ts:637-639`
>
> `const chars = (it.assets?.characters ?? [])`
> `  .map((c) => c.id)`
> `  .filter((id): id is string => typeof id === 'string')`

결과적으로 명단 밖 ID를 저장하는 대신 `[]`를 저장할 수 있다. 화면/프롬프트에서는 “인물이 없는 샷”으로 보이므로, 원래 LLM이 낸 인물 연결 실패와 의도한 빈 풍경을 구분하기 어렵다. 이는 현재 요구의 **필드 소실 저장** 사례다. 대책 후보는 “모든 캐릭터가 drop된 샷은 CRITICAL/fatal로 persist 차단”이지, 단순 빈 배열 fallback 확대가 아니다.

또한 C2 방어는 resume 시 항상 다시 실행되지 않는다.

> `src/lib/writer/pipeline/steps.ts:218-251`
>
> `let shotSequence = s.shotSequence;`
> `if (shotSequence === undefined || s.shotCheck === undefined) {`
> `  ... runShotCheck(...)`
> `  shotSequence = result.shotSequence;`
> `}`

`state.shotSequence`와 `state.shotCheck`가 이미 있으면 cached sequence를 그대로 사용한다. 수동/오래된/부분 복구 state에 unknown ref가 들어가면 `persistShotsToDb`에는 roster 재검증이 없다.

### 4) V1 persist 실패 동작: DB 오류는 표면화되지만 전체 런 완료를 막지 못한다

로컬 파이프라인은 Tier 1과 Tier 2 persist를 fire-and-forget로 호출한다.

> `src/lib/writer/pipeline/index.ts:263-267` (Tier 1 호출부)
>
> `persistAssetsToDb(...).then(() => logger.markStage('persistAssets', 'completed')).catch((e) => {`
> `  console.warn('[writer] Tier1 assets persist failed (pipeline continues):', e);`
> `});`

> `src/lib/writer/pipeline/index.ts:431-438` (Tier 2 호출부)
>
> `persistShotsToDb(projectId, shotSequence, dialogueTrack)`
> `.then(() => logger.markStage('persistShots', 'completed'))`
> `.catch((e) => { console.warn('[writer] Tier2 shots persist failed (pipeline continues):', e); });`

실제 서버리스 step은 Tier 2에 한해 3회 재시도하지만, 세 번째 실패에서는 `_shotsPersisted: true`를 써서 다음 단계로 진행한다.

> `src/lib/writer/pipeline/steps.ts:553-575`
>
> `if (tries >= 3) {`
> `  // 포기 — 파이프라인은 완료시키되 ... 미기록을 로그로 남긴다.`
> `  return { _shotsPersisted: true, _persistTries: tries };`

따라서 “쓰기 실패 시 데이터가 잘못 저장되는가”와 별개로, “쓰기 실패를 완료로 오인하는가”에는 예가 있다. 상태의 `shotSequence`가 남아 수동 복구 가능하다는 주석은 있지만, 자동 완료 신호와 DB 행의 존재가 분리된다.

### 5) 대사 화자: 명단 밖/씬 밖 화자가 `dialogue_lines`에 저장됨

대사 정규화는 `line` 문자열만 필터하고 `character_id`를 roster와 대조하지 않는다.

> `src/lib/writer/pipeline/stages/dialogue.ts:240-253`
>
> `dialogue: Array.isArray(found.dialogue)`
> `  ? found.dialogue.filter((d) => d && typeof d.line === 'string' && d.line.trim().length > 0)`
> `  : []`

프롬프트에는 “씬 등장인물이어야 한다”는 지시가 있지만 코드의 최종 방어가 아니다. 대사 재생성 API는 이 값을 `characterId`로 그대로 update한다.

> `src/app/api/writer/dialogue/route.ts:77-101`
>
> `characterId: l.character_id,`
> `...`
> `const { error } = await supabaseAdmin.from('shots').update({ dialogue_lines: lines })...`
> `if (!error) updatedShots += 1`

여기서 update 오류는 응답 실패가 아니라 `updatedShots`만 줄이는 best-effort다. 대사 한 줄이 명단 밖이거나 DB update가 일부 실패해도 API는 `ok: true`를 반환한다.

### 6) V2: schema/check/review/apply 사이에 roster fail-safe가 없음

V2 schema는 다음처럼 `character_id`와 `character_refs`를 문자열로만 요구한다.

> `src/lib/writer/v2/semantic-unit.ts:6-11,23-41`
>
> `character_id: z.string().min(1)`
> `character_refs: z.array(z.string()).default([])`
> `unresolved_refs: z.array(z.string()).default([])`

`checkWriterV2Draft`도 화자 누락/빈 참조 marker만 보고 실제 ID membership은 확인하지 않는다.

> `src/lib/writer/v2/semantic-unit.ts:149-169`
>
> `!hasText(line.character_id)`
> `...`
> `unit.visual.character_refs.length > 0 || unresolved marker`

Apply 변환은 roster 조회 없이 문자열을 합쳐 저장한다.

> `src/lib/writer/v2/persist.ts:86-105`
>
> `const characters = unique([`
> `  ...unit.visual.character_refs,`
> `  ...unit.story.dialogue.map((line) => line.character_id),`
> `])`
> `...`
> `characters,`
> `dialogue_lines: dialogue,`

`unresolved_refs`는 “발명하지 말라”는 표현일 뿐, `character_refs`에 이름/오타가 들어오는 것을 막지 않는다. 예를 들어 실제 roster가 `char_mina`인데 V2가 `Mina`를 `character_refs`로 내면 `shots.characters=['Mina']`로 저장된다.

더 나쁜 경계는 실패한 2차 시도다. V2는 2차 check가 실패해도 `status:'review'` package를 반환한다.

> `src/lib/writer/v2/semantic-unit.ts:375-415`
>
> `status: 'review',`
> `current_attempt: current.attempt,`
> `units: currentUnits,`
> `user_review: { required: true, status: 'pending', ... }`

Review endpoint는 `current.draft.units`만 확인하고 `current.check.passed`를 요구하지 않는다.

> `src/app/api/writer/v2/review/route.ts:48-67`
>
> `if (!current?.draft?.units?.length) ...`
> `status: body.action === 'accept' ? 'ready' : 'review'`

Apply route는 승인 여부만 확인하고 package 내용을 다시 검증하지 않는다.

> `src/app/api/writer/v2/apply/route.ts:33-47`
>
> `if (pkg.status === 'review' || (pkg.user_review.required && pkg.user_review.status !== 'accepted')) ...`
> `const applied = await applyWriterV2Package(projectId, pkg, ...)`

즉 사람 검토가 이론상 fail-safe 역할을 하지만, “check 실패 → 사람이 accept → 명단 밖 ID 저장”이 가능하다. 또한 Apply는 project 전체 `shots`와 `scenes`를 삭제 후 삽입한다.

> `src/lib/writer/v2/persist.ts:294-314`
>
> `.from('shots').delete().eq('project_id', projectId)`
> `...`
> `.from('shots').insert(shots.map((row) => ({ project_id: projectId, ...row })))`

이는 V2 Apply에서 수동 행 보존과 roster 검증이 모두 없는 별도 위험이다.

### 7) Writer 채팅: whitelist는 유효하지만 적용 위치가 한정됨

projectId가 전달된 Writer chat은 DB roster를 읽고 `characters`, `charactersPresent`, 대사 화자를 필터한다.

> `src/app/api/writer/chat/route.ts:180-191`
>
> `const { data: roster } = await supabaseAdmin.from('characters')...`
> `allowedCharacterIds = new Set((roster ?? []).map(...))`

> `src/lib/writer-chat-updates.ts:50-61`
>
> `if (!allowed) return ids`
> `const kept = ids.filter((id) => allowed.has(id))`
> `return kept.length > 0 ? kept : undefined`

탈락 ID는 사용자 응답에 표시한다.

> `src/app/api/writer/chat/route.ts:210-218`
>
> `const dropped = [...new Set(droppedCharacterIds)]`
> `... 등장인물 목록에 없는 인물 ... 은(는) 반영하지 않았어요 ...`

하지만 세 가지 구멍이 있다.

- projectId 미전달이면 `allowedCharacterIds`가 `undefined`라 무필터다(`writer/chat/route.ts:178-192`, 주석 원문: “projectId 미전달(구 클라)이면 무필터”).
- roster SELECT 오류를 분리 처리하지 않아 `(roster ?? [])`가 빈 Set이 된다. 이 경우 정상 ID도 전부 field drop될 수 있고, 조회 실패가 사용자에게 명확한 오류로 전달되지 않는다.
- `validateWriterUpdates`는 API 호출부의 보호이지 `writer-store` 자체의 불변식이 아니다. store의 `pickShotFields`는 배열을 그대로 받는다(`writer-store.ts:97-105`). 다른 호출자/직접 UI 경로는 whitelist를 우회한다.

### 8) 수동 Writer CRUD와 레거시 씬 재생성

수동 샷 수정은 `characters` 배열을 그대로 state와 DB에 쓴다.

> `src/stores/writer-store.ts:228-267`
>
> `s.shotId === id ? { ...s, ...changes } : s`
> `...`
> `characters: shot.characters,`
> `...`
> `.eq('shot_id', id)`

`updateShot`는 Supabase 결과의 `error`를 구조분해하지 않고 rollback도 하지 않는다. 네트워크/DB 실패 시 화면 state와 DB가 달라지며, 사용자는 변경이 저장됐다고 볼 수 있다.

새 샷은 입력 배열을 그대로 사용한다.

> `src/stores/writer-store.ts:304-316`
>
> `characters: f?.characters ?? scene?.charactersPresent ?? [],`

레거시 씬 재생성은 이름/ID를 섞는다.

> `src/stores/writer-store.ts:717-733`
>
> `const characterMap = Object.fromEntries(manifest.characters.map((c) => [c.characterId, c.name]))`
> `characters: scene.charactersPresent.map((id) => characterMap[id] ?? id),`

API 프롬프트는 `character_id`를 요구하지만 API는 `RawShot.characters`를 단순 `string[]`로 받고 그대로 반환한다.

> `src/app/api/director/generate-shots/route.ts:73-92,96-109`
>
> `characters: string[]`
> `const rawShots = await llmJSON<RawShot[]>(...)`
> `characters: raw.characters ?? [],`

재생성 후 insert도 결과 오류를 확인하지 않는다.

> `src/stores/writer-store.ts:744-771`
>
> `await supabase.from('shots').delete()...`
> `await supabase.from('shots').insert(newShots.map(...))`

따라서 레거시 경로에서 LLM이 이름을 되돌려 주거나 새 이름을 발명해도 `shots.characters`에 저장될 수 있다. JSON shape 오류는 500으로 끝나지만 참조 의미 오류는 성공 응답/DB 저장으로 통과한다.

### 9) Artist 샷 보드 수동 연결

Artist 보드의 `setShotCharacters`는 UI에서 받은 배열을 서버 roster와 비교하지 않는다.

> `src/stores/artist-board-store.ts:75-91`
>
> `const column = field === 'characters' ? 'characters' : 'location_ids'`
> `...from('shots').update({ [column]: value })...`
> `if (error) { set({ shots: prev, error: ... }); return false }`

DB 오류는 rollback하지만, DB가 문자열 배열을 받아들이기만 하면 명단 밖 ID도 “성공”이다. UI가 보드 목록에서 선택한 값만 준다는 전제가 코드계약으로 잠겨 있지 않다.

### 10) characters 테이블 쓰기와 원천 데이터의 경계

Producer handoff는 request body를 TypeScript cast만 하고 cast/character ID 스키마를 런타임 검증하지 않는다.

> `src/app/api/writer/start/route.ts:189-211`
>
> `const body = (await req.json()) as { ... cast?: CastContract ... }`
> `writerEngine = isWriterEngine(...) ? ... : 'v1'`

> `src/app/api/writer/start/route.ts:127-144`
>
> `character_id: c.character_id,`
> `...`
> `.upsert(rows, { onConflict: 'project_id,character_id' })`

V1 writer 신규 캐릭터도 state의 `id`를 그대로 insert한다(`persist_manifest.ts:352-378`). V2 Apply의 producer source insert도 `input.cast`를 그대로 insert한다(`v2/persist.ts:194-253`). 이 경로들은 “캐스트가 이미 producer에서 확정됐다”는 제품 전제를 사용하지만, 입력이 LLM/클라이언트 경계를 다시 통과하는 경우에는 별도 검증이 없다.

Artist 캐릭터 카드 POST/PATCH도 `characterId` 존재 여부/문자열만 확인하고 실제 row/프로젝트 roster 존재를 확인하지 않는다.

> `src/app/api/artist/character/route.ts:28-47,51-65`
>
> `projectId?: string`, `characterId?: string`
> `if (!projectId || !characterId || !name?.trim()) ...`
> `... character_id: characterId ...`

이 쓰기는 `shots.characters` 자체는 아니지만, 이후 roster의 canonical 집합을 바꾸는 원천이다. 명단 생성과 샷 연결의 ID 정책이 한 곳에 모여 있지 않다는 증거다.

## repair-json 및 파싱 실패 동작

### 공용 strict repair

`repairJsonStrict`는 `clean/punch`는 반환하고 `close/trim`은 `LossyRepairError`로 올린다.

> `src/lib/writer/llm/json_repair.ts:4-7,36-41`
>
> `close: 잘린 항목을 닫아서 살림`
> `trim: 마지막 유효 지점까지 절단`
> `if (strategy === 'close' || strategy === 'trim') { throw new LossyRepairError(...) }`

손실 복구 자체는 여전히 닫거나 잘라서 아이템을 잃을 수 있다.

> `src/lib/writer/llm/json_repair.ts:65-77`
>
> `전략 2·3 은 손실 복구다 ... 뒤쪽 내용이 사라진 채 정상으로 통과한다.`
> `warnLossyRepair(...)`

### provider별 배선 차이

Dispatch는 두 번째 손실 복구도 실패하면 살아남은 값을 반환한다.

> `src/lib/writer/llm/dispatch.ts:88-106`
>
> `재호출도 잘리면 살아남은 값(err.value)으로 진행`
> `return retryErr.value as T`

이 fallback은 **조용한 부분 산출물 진행**이다. V4는 이후 샷 개수 guard가 있어 기대 개수 불일치를 일부 잡지만, 모든 배열/캐릭터 필드에 공통 guard가 있는 것은 아니다.

또한 `LossyRepairError`를 dispatch까지 보존하는 것은 Claude뿐이다.

> `src/lib/writer/llm/claude.ts:156-160`
>
> `if (repairErr instanceof LossyRepairError) throw repairErr`

Gemini/OpenAI/Local은 오류를 새 일반 Error로 감싼다.

> `src/lib/writer/llm/gemini.ts:152-156`
>
> `throw new Error(\`Gemini JSON parse failed: ${msg}\`)`

> `src/lib/writer/llm/openai.ts:119-124`
>
> `throw new Error(\`OpenAI JSON parse failed: ${msg}\`)`

> `src/lib/writer/llm/local.ts:97-102`
>
> `throw new Error(\`Local JSON parse failed: ${msg}\`)`

따라서 주 모델이 Gemini인 V1 S/V 단계에서는 dispatch의 “손실 복구 1회 재호출” 분기가 타입상 발화하지 않고 stage 오류로 표면화된다. 이것은 데이터가 부분 저장되는 것보다는 안전하지만, provider마다 실패 동작이 다르며 설계 주석과 실제 배선이 일치하지 않는다.

### 채팅 fenced JSON repair

채팅 repair는 손실 복구 후 `close` 전략의 마지막 update를 버리고 일부만 적용한다.

> `src/lib/agentic-reply-guard.ts:73-83`
>
> `if (strategy === 'close' && Array.isArray(repaired.updates))`
> `  repaired.updates = ...slice(0, -1)`
> `return finish(repaired, true)`

그 뒤 whitelist 검증과 “일부 적용” 안내가 있다.

> `src/lib/agentic-reply-guard.ts:119-134`
>
> `const updates = validate(raw)`
> `... 응답이 중간에 잘려서 ${updates.length}건만 적용했어요 ...`

이 채팅 경로는 writer chat의 projectId roster whitelist와 결합될 때는 비교적 fail-safe다. 하지만 `repairJson` 호출 자체는 형태 복구만 담당한다. roster/씬 일관성은 호출부가 반드시 별도로 검사해야 하며, V1 pipeline/V2 Apply에는 이 채팅 whitelist가 재사용되지 않는다.

### 레거시 `llmJSON` 경로

`/api/director/generate-shots`가 사용하는 `src/lib/llm.ts`는 구 `src/lib/claude.ts`의 `claudeJSON`을 그대로 re-export한다. 이 경로는 fenced marker만 제거하고 `JSON.parse`한다.

> `src/lib/claude.ts:149-159`
>
> `const text = block.text`
> `  .replace(/^```json\s*/m, '')`
> `  .replace(/^```\s*/m, '')`
> `  .replace(/\s*```\s*$/m, '')`
> `  .trim()`
> `return JSON.parse(text) as T`

깨진 JSON은 route의 catch로 500이 되어 부분 배열을 저장하지는 않지만, JSON 모양이 맞고 `characters`에 이름/unknown ID가 들어오는 의미 오류는 막지 못한다. 즉 “파싱 실패에는 보수적”이지만 “참조 실패에는 fail-safe가 아니다.”

## 원인 분류

| 원인 | 재현 가능한 코드 상황 | 저장되는 결과 | 현재 신호 |
|---|---|---|---|
| 명단 밖 ID 발명 | V1 S3 `characters_in_scene`, V2 `character_refs`, V1 L4 blocking, dialogue speaker | 씬/대사/V2는 unknown 원문, V1 C2 assets는 drop 후 `[]` 가능 | 일부 WARNING/console뿐. V2는 없음. |
| 이름↔ID 필드 혼용 | `writer-store.regenerateScene`가 `characterMap[id]` 이름을 API 입력으로 전달 | 레거시 `shots.characters`에 이름 저장 가능 | 없음. API RawShot은 string[]만 요구. |
| `id`/`character_id` 구조 혼용 | L4 `character_blocking[].character_id`, C2 `assets.characters[].id` 중 하나 누락/오타 | C2에서 해당 캐릭터 drop, 이후 빈 배열 | all dropped WARNING뿐. |
| 배열/필드 소실 | `repairJson` trim/close, dispatch 2차 손실 fallback, dialogue 누락 샷 침묵 보정 | 일부 샷/대사/인물 연결이 사라져 정상 침묵/풍경과 구분 어려움 | raw 로그·console·일부 badge. 저장 차단 없음. |
| 실패한 repair 채택 | V2 attempt 2 check 실패 후 review accept | 불완전/unknown 참조 package가 Apply 가능 | 사람 승인만 필요, check.passed 재확인 없음. |
| 캐시/resume 우회 | state에 shotSequence+shotCheck 존재 | C2 asset guard 없이 persist 입력 | 별도 persist roster guard 없음. |
| 수동 경로 우회 | writer store 직접 update, Artist board update | unknown 배열 직접 저장 | DB 오류만 rollback/표시. 의미 검증 없음. |
| 저장 오류 흡수 | local `index.ts` fire-and-forget, step 3회 후 `_shotsPersisted` | DB에 shots 0행/부분 행인데 pipeline completed 가능 | console/error detail은 있으나 완료 상태와 분리. |
| roster 조회 실패 | Writer chat roster SELECT error가 빈 배열로 귀결 | 정상 ID까지 chat patch에서 drop | 명확한 5xx/재시도 없음. |

## 대책 후보 (원인별, 구현하지 않음)

1. **단일 canonical 참조 검증기**: `projectId`와 DB roster를 받아 `shots.characters`, 씬 `characters_present`, 대사 `characterId`, V2 `character_refs`를 같은 함수로 검증한다. 이름을 ID로 추측하는 fallback은 두지 않고, unknown은 오류/명시적 drop 결과로 반환한다.
2. **저장 직전 fail-closed**: `persistShotsToDb`와 V2 `applyWriterV2Package`에서 최종 `characters`/대사 화자를 다시 roster와 비교한다. unknown이 있거나 원래 인물 배열이 모두 사라진 샷은 `shots` insert를 하지 않고 해당 run을 실패/검토 상태로 남긴다.
3. **필드 소실 배지와 차단**: repair 결과의 원문 길이·전후 배열 개수·샷/씬 ID 집합을 비교한다. 기대 개수/ID 집합이 맞지 않으면 `accept`하지 말고 재시도 또는 명시적 수동 검토로 보낸다. “빈 배열/침묵”은 모델이 명시적으로 빈 배열을 낸 경우에만 정상으로 취급한다.
4. **V2 검토 게이트 강화**: Review accept는 `current.check.passed === true`를 요구하거나, accept 직전에 canonical roster 검증과 모든 필수 참조 검사를 다시 실행한다. check 실패 draft를 “사람이 승인했으니 적용 가능”으로 취급하지 않는다.
5. **resume 동일 검증**: cached `shotSequence`를 재사용하더라도 persist 직전 canonical 검증을 반드시 반복한다. 오래된 state/수동 state를 신뢰하지 않는다.
6. **legacy/manual API 계약 고정**: `/api/director/generate-shots` 입력은 표시명 대신 ID만 받도록 하고, 응답을 Zod로 검증하며 DB insert/update 결과를 확인한다. `writer-store.updateShot`, `regenerateScene`, Artist board에도 같은 roster 검증기를 연결한다.
7. **쓰기 실패와 완료 상태 결합**: Tier 1/2 persist 실패를 pipeline completed로 흡수하지 않거나, 최소한 `persist_status='failed'`를 완료 상태와 분리해 UI/운영자가 자동 복구 전에는 완료로 오인하지 못하게 한다.
8. **roster 조회 실패는 fail-closed**: chat whitelist용 roster SELECT가 실패하면 빈 Set으로 진행하지 말고 5xx/재시도한다. projectId 없는 구 클라이언트 무필터 경로는 제거한다.
9. **provider repair 계약 통일**: 모든 provider가 `LossyRepairError`를 보존하고 dispatch가 동일하게 재시도/거부하도록 한다. 2차도 손실이면 `err.value`를 자동 반환하지 말고 stage를 실패/검토로 남긴다.
10. **관측 자료 보강**: 저장 전에 `allowed_ids`, `input_ids`, `dropped_ids`, `field`, `source(stage/manual/v2)`, `repair_strategy`, `accepted/rejected`를 구조화 로그/상태에 남긴다. 정상 행 개수만 기록하는 현재 로그로는 unknown→drop→empty를 추적할 수 없다.

## 확인하지 않은 것 / 한계

- 이 감사는 운영 DB를 읽거나 쓰지 않았고 fixture·실제 LLM 호출도 실행하지 않았다. 따라서 “현재 운영 행에 unknown이 몇 건 있다”는 수치 결론을 내리지 않는다.
- 위 결론은 코드의 실패/복구 분기를 기준으로 한 정적 감사다. 특히 V1 C2가 실제로 모든 런에서 호출되는지, V2 package가 어떤 provider 출력으로 만들어지는지는 별도 실행 증거가 필요하다.
- `shots.characters`를 읽기만 하는 storyboard/video/export 경로는 쓰기 목록에서 제외했지만, 이들은 unknown/빈 배열을 그대로 소비하므로 후속 대책 적용 시 소비자 계약도 함께 점검해야 한다.

한 줄 요약: V1 C2 일부만 unknown 인물을 제거할 뿐이고 V2·대사·수동·resume·repair 경로는 명단 밖/필드 소실을 저장하거나 완료로 오인할 수 있어, 저장 직전 공통 검증과 fail-closed가 필요하다.
