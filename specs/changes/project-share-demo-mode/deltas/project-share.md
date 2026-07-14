# Delta: project-share (신규 capability)

> 이 파일은 project-share-demo-mode change가 추가하는 ADDED Requirements를 명세합니다. 대응 source-of-truth spec이 없어 본 델타가 요구사항·수용 시나리오의 캐넌 역할을 한다(구현은 코드).

## ADDED Requirements

### Requirement: 프로젝트 공유 링크
소유자는 프로젝트별 읽기전용 공유 링크를 생성·복사·취소할 수 있어야 한다(SHALL). 토큰은 추측 불가해야 하며, 취소·만료되면 접근이 거부되어야 한다.

#### Scenario: 링크 생성·접근
- **WHEN** 소유자가 프로젝트에서 "공유"를 눌러 링크를 생성
- **THEN** `project_shares` 행(token, project_id, expires_at=null|미래, revoked_at=null)이 생성되고 링크 복사 UI가 뜬다
- **WHEN** 비로그인 사용자가 `/share/<token>` 진입
- **THEN** 로그인 리다이렉트 없이 해당 프로젝트가 데모 모드로 열린다

#### Scenario: 취소·만료
- **WHEN** 소유자가 링크를 취소(revoked_at)하거나 만료가 지남
- **THEN** `/share/<token>` 접근이 거부(404/410)되고 스냅샷도 반환되지 않는다

### Requirement: 데모 모드 백엔드 중립화
데모 세션에서는 어떤 LLM·이미지·영상 생성도, 어떤 DB 쓰기도 실행되지 않아야 한다(SHALL NOT). 읽기는 공유 시점 스냅샷에서만 제공된다.

#### Scenario: 쓰기·생성 차단(클라)
- **WHEN** 데모 세션이 생성/편집 액션을 트리거
- **THEN** 실제 `/api/*` 호출·supabase write가 발생하지 않고, 낙관적 UI·애니메이션만 진행되며 새로고침 시 리셋된다

#### Scenario: 쓰기·생성 차단(서버 방어)
- **WHEN** `demo_share` 쿠키를 가진 요청이 `/api/*` 생성·쓰기 라우트에 직접 도달
- **THEN** 서버가 403으로 거부한다(fal/Claude 예산 미소모)

#### Scenario: 데이터 격리(스냅샷)
- **WHEN** 소유자가 공유 후 프로젝트를 편집
- **THEN** 데모 뷰는 공유 시점 상태를 그대로 유지한다(라이브 반영 안 함)

### Requirement: 데모 인터랙션 "척"
데모는 hover·클릭·네비게이션·채팅 타이핑을 허용하되 실제 데이터 변경은 일으키지 않아야 한다.

#### Scenario: 채팅
- **WHEN** 데모 사용자가 채팅에 입력 후 전송
- **THEN** 서버 호출 없이 typing 애니 후 스테이지별 고정 메시지가 표시된다

#### Scenario: 재생성 버튼
- **WHEN** 데모 사용자가 재생성/생성 버튼을 누름
- **THEN** press/spinner 애니만 잠깐 재생되고, 기존 스냅샷 이미지/영상이 그대로 유지된다(새 결과물 생성·조작 없음)

#### Scenario: 편집 잠금
- **WHEN** 데모 사용자가 노드 드래그·필드 수정·카드 편집을 시도
- **THEN** 변경이 영속되지 않는다(잠금 또는 로컬 무효)

### Requirement: 데모 표식·범위
데모 화면은 미리보기임을 명시하고 한 프로젝트에 락되어야 한다.

#### Scenario: 배너·소유자 UI 숨김
- **WHEN** 데모 모드로 진입
- **THEN** 상단에 "미리보기 · 실제 생성 비활성" 배너가 보이고, 프로젝트 스위처·새 프로젝트·로그아웃·공유 버튼 등 소유자 전용 UI가 숨겨진다
- **AND** producer/writer/artist/director/editor 5스테이지 네비게이션은 가능하되 다른 프로젝트로는 이동 불가
