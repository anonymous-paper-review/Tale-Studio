# Tale Studio — Service Blueprint

**서비스:** AI 영상 제작 파이프라인 (텍스트 → AI 비디오)
**고객 세그먼트:** B2B 영상 제작자 (마케팅 팀, 콘텐츠 크리에이터, 광고 에이전시)
**작성일:** 2026-04-06

---

## Blueprint 다이어그램

### 전체 서비스 흐름

```mermaid
graph LR
    subgraph PE["Physical Evidence"]
        PE1["로그인 페이지\nGoogle 버튼"]
        PE2["Meeting Room\nAI 채팅 + 대시보드"]
        PE3["Script Room\n씬 카드 + 샷 그리드"]
        PE4["Visual Studio\n캐릭터 시트 + 배경"]
        PE5["The Set\n3D 큐브 + 인스펙터"]
        PE6["Post-Production\n비디오 프리뷰어"]
        PE7["완성 영상\nMP4"]
    end

    subgraph CA["Customer Actions"]
        CA1["Google 로그인\n프로젝트 선택/생성"]
        CA2["스토리 입력\n장르/톤 설정\n핸드오프"]
        CA3["씬/샷 리뷰\nAI Writer 대화\n샷 수정"]
        CA4["캐릭터 시트 생성\n배경 생성\nProvider 전환"]
        CA5["카메라/조명 조정\nT2V/I2V 토글\nGenerate Video"]
        CA6["클립 재배치\n트리밍\nDraft Render"]
        CA7["최종 확인\n다운로드"]
    end

    CA1 --> CA2 --> CA3 --> CA4 --> CA5 --> CA6 --> CA7

    style PE fill:#E3F2FD,stroke:#1565C0
    style CA fill:#FFF9C4,stroke:#F9A825
```

### 5-Layer Blueprint (Mermaid Block Diagram)

```mermaid
block-beta
    columns 7

    block:evidence:7
        columns 7
        ev_title["PHYSICAL EVIDENCE"]:7
        ev1["홈페이지\n프로젝트 목록\nGoogle 로그인"]
        ev2["Producer\nMeeting Room\nAI 채팅 UI\n대시보드"]
        ev3["Writer\nScript Room\n씬 카드\n샷 그리드/에디터"]
        ev4["Concept Artist\n캐릭터 3-view\n배경 이미지\n부스트 프리셋"]
        ev5["Director\n3D 큐브\n샷 그리드\n인스펙터 패널"]
        ev6["Editor\n비디오 프리뷰어\n타임라인\n에디트 툴바"]
        ev7["산출물\n완성 영상\nMP4"]
    end

    space:7

    block:customer:7
        columns 7
        ca_title["CUSTOMER ACTIONS"]:7
        ca1["1. 로그인\n2. 프로젝트\n   선택/생성"]
        ca2["3. 스토리 입력\n4. 장르/톤\n   설정 후\n   핸드오프"]
        ca3["5. 씬/샷\n   리뷰 & 수정\n6. AI Writer\n   대화"]
        ca4["7. 캐릭터 시트\n   생성 요청\n8. 배경 이미지\n   생성 요청"]
        ca5["9. 카메라/조명\n10. T2V/I2V\n11. Generate\n    Video"]
        ca6["12. 클립 순서\n    재배치\n13. 클립 트리밍"]
        ca7["14. 최종\n    영상 확인"]
    end

    loi["─── LINE OF INTERACTION ───"]:7

    block:onstage:7
        columns 7
        on_title["ONSTAGE (Frontend UI)"]:7
        on1["Supabase Auth\nOAuth 리다이렉트\n프로젝트 카드"]
        on2["Producer AI\n채팅 응답\n설정 패널\nHandoff 버튼"]
        on3["Scene Cards\nShot Grid\nShot Editor\nWriter Chat"]
        on4["3-view 그리드\nWide/Est. 표시\nProvider 토글\nLock/Unlock"]
        on5["3D 큐브 회전\n6축 슬라이더\nKey Light\nGen/Regen"]
        on6["Video Player\nPlay/Pause\n재생바\nDrag & Drop"]
        on7["Draft Render\n다운로드"]
    end

    lov["─── LINE OF VISIBILITY ───"]:7

    block:backstage:7
        columns 7
        bs_title["BACKSTAGE (API Routes)"]:7
        bs1["/api/project/\ninit, new, list"]
        bs2["/api/producer/\nchat\n/api/project/\nsave"]
        bs3["/api/write/\ngenerate-scenes\nchat"]
        bs4["/api/generate/\nimage, health\n/api/assets/\nupload-image"]
        bs5["/api/director/\ngenerate-video\nvideo/taskId\n/api/assets/\nupload-video"]
        bs6["/api/editor/\nreorder\ntrim"]
        bs7["/api/editor/\nrender-draft"]
    end

    loii["─── LINE OF INTERNAL INTERACTION ───"]:7

    block:support:7
        columns 7
        sp_title["SUPPORT PROCESSES"]:7
        sp1["Supabase Auth\nSupabase DB\nStorage"]
        sp2["Gemini LLM\nSupabase DB"]
        sp3["Gemini LLM\nL1 → L2\nSupabase DB"]
        sp4["Gemini Imagen\nh100 FLUX\nSupabase Storage"]
        sp5["FAL.ai Kling\npro6000 Hunyuan\nSupabase Storage"]
        sp6["Supabase DB\nSupabase Storage"]
        sp7["Post-MVP\nFFmpeg"]
    end

    style evidence fill:#E3F2FD,stroke:#1565C0
    style customer fill:#FFF9C4,stroke:#F9A825
    style onstage fill:#E8F5E9,stroke:#2E7D32
    style backstage fill:#FCE4EC,stroke:#C62828
    style support fill:#F3E5F5,stroke:#6A1B9A
    style loi fill:none,stroke:none,color:#000
    style lov fill:none,stroke:none,color:#000
    style loii fill:none,stroke:none,color:#000
```

### 고객 여정 흐름 (Customer Journey Flow)

```mermaid
flowchart TD
    Start([고객 진입]) --> Login[Google 로그인]
    Login --> Home{프로젝트 선택}
    Home -->|신규| NewProj[New Project 생성]
    Home -->|기존| OpenProj[기존 프로젝트 열기]

    NewProj --> Producer
    OpenProj --> Producer

    subgraph Producer["Phase 1: Producer"]
        P1[스토리 텍스트 입력/업로드]
        P2[AI와 스토리 논의]
        P3[장르/톤/Playtime 설정]
        P1 --> P2 --> P3
    end

    Producer -->|Handoff| Writer

    subgraph Writer["Phase 2: Writer"]
        W1[씬 자동 생성 - 기승전결]
        W2[샷 리뷰 & 수정]
        W3[AI Writer와 대화로 수정]
        W1 --> W2 --> W3
    end

    Writer -->|Handoff| Artist

    subgraph Artist["Phase 3: Concept Artist"]
        A1[캐릭터 시트 생성]
        A2[배경 이미지 생성]
        A3[Provider 선택: Gemini / Self-hosted]
        A1 --> A2
        A3 -.-> A1
        A3 -.-> A2
    end

    Artist -->|Handoff| Director

    subgraph Director["Phase 4: Director"]
        D1[카메라 6축 조정]
        D2[조명 설정]
        D3[T2V / I2V 선택]
        D4[이미지 생성: All Images]
        D5[영상 생성: All Videos]
        D1 --> D2 --> D3 --> D4 --> D5
    end

    Director -->|Handoff| Editor

    subgraph Editor["Phase 5: Editor"]
        E1[클립 순서 재배치]
        E2[클립 트리밍]
        E3[Draft Render]
        E1 --> E2 --> E3
    end

    Editor --> Output([완성 영상 MP4])

    style Producer fill:#FFF9C4,stroke:#F9A825
    style Writer fill:#E3F2FD,stroke:#1565C0
    style Artist fill:#E8F5E9,stroke:#2E7D32
    style Director fill:#FCE4EC,stroke:#C62828
    style Editor fill:#F3E5F5,stroke:#6A1B9A
```

### 기술 스택 레이어 (Support Process Map)

```mermaid
flowchart TB
    subgraph CustomerLayer["Customer Layer"]
        Browser[브라우저]
    end

    subgraph OnstageLayer["Onstage Layer"]
        NextJS["Next.js 16 App Router\n+ Tailwind v4 + shadcn/ui"]
        Zustand["Zustand State Management\n(project, producer, writer,\nartist, director, editor)"]
    end

    subgraph BackstageLayer["Backstage Layer"]
        API["Next.js API Routes\n(/api/*)"]
    end

    subgraph SupportLayer["Support Processes"]
        Supabase["Supabase\nAuth + DB + Storage"]
        Gemini["Gemini\nLLM + Imagen"]
        FAL["FAL.ai\nKling v2.1 T2V\nKling v2.6 I2V"]
        H100["h100-image-gen\nFLUX (Tailscale)"]
        Pro6000["pro6000-video-gen\nHunyuan T2V/I2V\n(Tailscale)"]
    end

    Browser --> NextJS
    NextJS --> Zustand
    NextJS --> API
    API --> Supabase
    API --> Gemini
    API --> FAL
    API --> H100
    API --> Pro6000

    style CustomerLayer fill:#FFF9C4,stroke:#F9A825
    style OnstageLayer fill:#E8F5E9,stroke:#2E7D32
    style BackstageLayer fill:#FCE4EC,stroke:#C62828
    style SupportLayer fill:#F3E5F5,stroke:#6A1B9A
```

### Failure Points & Moments of Truth

```mermaid
flowchart LR
    subgraph MOT["Moments of Truth"]
        M1["1. 첫 로그인\n→ 프로젝트 생성"]
        M2["2. 스토리 입력\n→ 씬 자동 생성"]
        M3["3. 캐릭터/배경\n   이미지 생성"]
        M4["4. 영상 생성\n   Generate Video"]
        M5["5. 최종 영상\n   내보내기"]
    end

    subgraph FP["Failure Points"]
        F1["OAuth 리다이렉트\nURL 미설정"]
        F2["자동 생성\n무한 루프 위험"]
        F3["Self-hosted\n타임아웃\nfetch failed"]
        F4["Vercel에서\nTailscale 접근 불가\n5분 타임아웃"]
        F5["Draft Render\n미구현\nCritical Gap"]
    end

    M1 -.->|실패 시| F1
    M2 -.->|실패 시| F2
    M3 -.->|실패 시| F3
    M4 -.->|실패 시| F4
    M5 -.->|실패 시| F5

    style MOT fill:#E8F5E9,stroke:#2E7D32
    style FP fill:#FFEBEE,stroke:#C62828
    style F5 fill:#FF8A80,stroke:#C62828,color:#000
```

---

## 단계별 상세 설명

### Phase 1: 진입 & 프로젝트 관리

| 구분 | 내용 |
|------|------|
| **Physical Evidence** | 로그인 페이지 (Google 버튼), 프로젝트 목록 페이지 (카드 그리드) |
| **Customer Action** | Google 로그인 → 프로젝트 선택 또는 "New Project" 생성 |
| **Onstage** | OAuth 리다이렉트, 프로젝트 카드 (제목, 현재 stage, 최종 수정일) 렌더링 |
| **Backstage** | `/api/project/init` — workspace 조회/생성, 최신 프로젝트 로드 |
| **Support** | Supabase Auth (세션 관리), Supabase DB (workspaces, projects 테이블) |
| **Fail Point** | OAuth 실패 시 에러 메시지 없음, Supabase 리다이렉트 URL 미설정 시 외부로 이동 |

### Phase 2: Producer (The Meeting Room)

| 구분 | 내용 |
|------|------|
| **Physical Evidence** | 좌: AI 채팅 인터페이스, 우: 프로젝트 대시보드 (장르/톤/playtime 설정) |
| **Customer Action** | 스토리 텍스트 입력 또는 파일 업로드 → 장르/톤 설정 → "Ask Writer" 핸드오프 |
| **Onstage** | Producer AI 응답 표시, 스토리 분석 결과, 설정 폼, Handoff 버튼 활성화 |
| **Backstage** | `/api/producer/chat` — Gemini LLM 호출, `saveAndHandoff()` — DB 저장 + stage 업데이트 |
| **Support** | Gemini LLM (스토리 분석/확장), Supabase DB (story_text, settings 저장) |
| **Fail Point** | 핸드오프 DB 저장 실패 시 사용자 피드백 없음 (silent fail) |

### Phase 3: Writer (The Script Room)

| 구분 | 내용 |
|------|------|
| **Physical Evidence** | 씬 카드 (기승전결), 샷 그리드, 샷 디테일 에디터, AI Writer 채팅 |
| **Customer Action** | 자동 생성된 씬/샷 리뷰 → 샷 상세 수정 (설명, 캐릭터, 시간, T2V/I2V) → AI Writer와 대화로 수정 요청 |
| **Onstage** | Scene Cards 렌더링, Shot Grid, Shot Editor 폼, Writer Chat 응답 |
| **Backstage** | `/api/write/generate-scenes` — LLM으로 씬/샷 자동 생성, `/api/write/chat` — AI Writer 대화 |
| **Support** | Gemini LLM (3-Level Pipeline: L1 Scene Architect → L2 Shot Composer), Supabase DB |
| **Fail Point** | 자동 생성 루프 위험 (Critical #2), 좌측 영역 스크롤 불가 시 내용 잘림 |

### Phase 4: Concept Artist (Visual Studio)

| 구분 | 내용 |
|------|------|
| **Physical Evidence** | 좌: 캐릭터 3-view 시트 (정면/측면/후면), 우: 배경 이미지 (Wide/Establishing) |
| **Customer Action** | "Generate Sheet" → 캐릭터 이미지 생성, "Generate Background" → 배경 생성, Provider 전환 (Gemini/Self-hosted) |
| **Onstage** | 이미지 생성 스피너, 3-view 그리드, 부스트 프리셋 칩, Provider 토글 (상태 표시등), Lock/Unlock |
| **Backstage** | `/api/generate/image` — Gemini Imagen 또는 Self-hosted FLUX 호출, `/api/assets/upload-image` — Storage 업로드 + DB 저장 |
| **Support** | Gemini Imagen (클라우드), h100-image-gen (Tailscale Self-hosted FLUX), Supabase Storage (media 버킷) |
| **Fail Point** | Self-hosted 타임아웃 (fetch failed), blob URL 메모리 누수, 이미지 영속화 실패 시 탭 이동 후 소실 |

### Phase 5: Director (The Set)

| 구분 | 내용 |
|------|------|
| **Physical Evidence** | 좌: 씬 네비게이션 (기승전결), 중: 샷 그리드 (썸네일+상태), 우: Cinematographic Inspector (3D 큐브, 슬라이더, Generate Video) |
| **Customer Action** | 카메라 6축 조정 → 조명 설정 → T2V/I2V 토글 → Generate Video (개별) 또는 All Images / All Videos (일괄) |
| **Onstage** | 3D 큐브 회전, 6축 슬라이더, Key Light 원형 UI, 상태 인디케이터 (초록/노랑/빨강), Gen/Regen 버튼, Provider 토글 (Img/Vid) |
| **Backstage** | `/api/director/generate-video` — FAL.ai Kling 또는 Self-hosted Hunyuan 호출, `/api/director/generate-video/[taskId]` — 폴링, `/api/assets/upload-video` — Supabase Storage 업로드 |
| **Support** | FAL.ai (Kling v2.1 T2V, v2.6 I2V), pro6000-video-gen (Hunyuan T2V/I2V, Tailscale), Supabase Storage + DB |
| **Fail Point** | Vercel에서 Self-hosted 접근 불가 (Tailscale 사설망), fetch 타임아웃, 영상 생성 5분 초과 시 타임아웃 |

### Phase 6: Editor (Post-Production)

| 구분 | 내용 |
|------|------|
| **Physical Evidence** | 상: 비디오 프리뷰어 (커스텀 플레이어), 하: 씬 탭 + 샷 타임라인 + 에디트 툴바 |
| **Customer Action** | 클립 선택 → 재생/일시정지 → 타임라인 드래그앤드롭으로 순서 변경 → 트리밍 → Draft Render |
| **Onstage** | 커스텀 비디오 플레이어 (Play/Pause, 재생바, 시간 표시), 타임라인 카드, Draft Render 버튼 |
| **Backstage** | `/api/editor/reorder` — 클립 순서 DB 저장, `/api/editor/trim` — 트림 포인트 DB 저장, `/api/editor/render-draft` — 플레이리스트 메타데이터 반환 (MVP) |
| **Support** | Supabase DB (sort_order, trim_start, trim_end), (Post-MVP: FFmpeg 영상 합치기) |
| **Fail Point** | Draft Render 미구현 (플레이스홀더), 삭제 확인 없음, 드래그 인덱스 검증 없음 |

---

## Moments of Truth (핵심 접점)

| # | 접점 | 고객 기대 | 현재 상태 | 개선 필요 |
|---|------|----------|----------|----------|
| 1 | **첫 로그인 → 프로젝트 생성** | 즉시 시작 가능 | Google OAuth + 자동 프로젝트 생성 | OK |
| 2 | **스토리 입력 → 씬 자동 생성** | 30초 내 결과 확인 | Gemini LLM 호출, 보통 10-20초 | OK |
| 3 | **캐릭터 이미지 생성** | 일관된 캐릭터, 빠른 생성 | Gemini: ~10초, Self-hosted: ~50초 | Self-hosted 타임아웃 위험 |
| 4 | **배경 이미지 생성** | 한 번에 2장 빠르게 | 순차 생성 (각 ~50초) | 긴 대기 시간 |
| 5 | **영상 생성 (Generate Video)** | 프로그레스 바, 예상 시간 | 5초 폴링, 상태 인디케이터만 | 프로그레스 % 표시 부재 |
| 6 | **영상 재생** | 네이티브급 플레이어 | 커스텀 Play/Pause + 재생바 | OK |
| 7 | **최종 영상 내보내기** | 하나의 합쳐진 MP4 | 미구현 (플레이스홀더) | **Critical Gap** |

---

## Failure Points & 개선 방향

| 실패 지점 | 현재 | 개선 |
|-----------|------|------|
| Self-hosted 서버 오프라인 | 버튼 무반응 | 토스트 알림 "서버 오프라인" |
| 이미지 생성 타임아웃 | "fetch failed" 에러 | 순차 생성 (완료) + 재시도 버튼 |
| 영상 Supabase 저장 실패 | 새로고침 시 영상 소실 | 저장 실패 시 사용자 알림 + 재시도 |
| 탭 이동 시 데이터 소실 | blob URL만 저장 | 영구 URL 저장 후 state 갱신 (완료) |
| Draft Render 미구현 | 버튼만 존재 | FFmpeg 서버 연동 또는 클라이언트 합치기 |
| 뒤로가기 네비게이션 | 잠긴 스테이지 접근 가능 | beforeunload + 서버 검증 |

---

## 기술 스택 매핑

```
Customer Layer:  Next.js 16 (App Router) + Tailwind v4 + shadcn/ui + Zustand
                         ↓
Onstage Layer:   React Components (features/*, components/*)
                         ↓
Backstage Layer: Next.js API Routes (/api/*)
                         ↓
Support Layer:   ┌─ Supabase (Auth + DB + Storage)
                 ├─ Gemini LLM (스토리/씬/샷 생성)
                 ├─ Gemini Imagen (이미지 생성)
                 ├─ FAL.ai Kling (클라우드 영상 생성)
                 ├─ h100 FLUX (Self-hosted 이미지, Tailscale)
                 └─ pro6000 Hunyuan (Self-hosted 영상, Tailscale)
```
