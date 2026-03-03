Page 1: Ground (영감 및 기획)
UX 전략: '백지 공포' 해소를 위해 TapNow의 'Community Recipe'를 하단에 배치합니다.

[Top Section]: 대형 프롬프트 입력창 (빨간 글씨 가이드 포함).

[Bottom Section - New!]: "Inspiration Recipes" 가로 스크롤 영역.

다른 사용자가 제작한 고퀄리티 영상의 '장르', '스타일 칩', '사용된 에이전트 지시어'가 카드 형태로 노출됩니다.

[Apply Recipe] 버튼 클릭 시, 해당 설정이 내 프롬프트창에 즉시 로드됩니다.

[Sidebar]: Samantha(개인 AI 비서) 아이콘이 하단에 고정되어 실시간 도움을 제공합니다.

Page 2: Story Writer (대본 협업)
UX 전략: 대화 내용이 즉시 구조화된 데이터로 변환되는 'Zero Friction' 인터페이스.

[Left: Agent Chat]: AI 작가와 대화하며 씬을 구성합니다.

[Right: Live Scenario Board]: TapNow의 노드형 구조를 응용하여, 각 씬이 카드 형태로 연결된 'Visual Flow' 캔버스를 제공합니다.

씬 카드를 클릭하면 상세 대사가 열리고, 드래그하여 씬의 순서를 즉시 바꿀 수 있습니다.

제작 길이, 화면 비율 등 프로듀서 정보가 상단 상태바(Status Bar)에 고정됩니다.

Page 3: Storyboard (시각화 캔버스)
UX 전략: 리스트 형태를 넘어 '무한 캔버스' 위에서 에셋을 관리합니다.

[Main Workspace]: 넓은 캔버스 위에 Char, Stage, Shot 에셋들이 자유롭게 배치됩니다.

[Feature: Asset Locking]: 특정 캐릭터 시트를 클릭하고 'Lock' 아이콘을 누르면, 모든 스토리보드 이미지 생성 시 해당 캐릭터의 일관성이 유지됨을 시각적으로 표시합니다.

[Agent Pop-up]: 캐릭터 아티스트가 생성한 3가지 시안 중 사용자가 선택하면 캔버스 중앙으로 에셋이 부드럽게 이동합니다.

Page 4: Cinema Directing (공간 연출)
UX 전략: TapNow의 '3D Spatial Manipulation'을 반영한 정교한 컨트롤러.

[Center: 3D Preview]: 샷의 공간감을 보여주는 메인 뷰어.

[Right: Precision Inspector]:

Kling 6-Axis 컨트롤러: 6가지 축 슬라이더가 다크 모드 UI에 네온 컬러로 강조되어 정교한 느낌을 줍니다.

Motion Intensity: 카메라 움직임의 강도를 조절하는 원형 다이얼(Dial) UI 추가.

[Bottom: Timeline Editor]: 각 샷의 연결 부위(End Frame)와 생성된 배경음악 파형이 시각화됩니다.
I have implemented the "Tale Studio" web application with all 4 requested pages, adhering to the detailed UX/UI specifications and the "Dark Mode" theme.

Implementation Details:

Routing & Layout: Set up react-router with a persistent Sidebar containing the global navigation and the "Samantha" AI assistant icon fixed at the bottom.
Page 1: Ground: Features a large creative prompt input and a horizontally scrolling "Inspiration Recipes" section for resolving "Blank Page Syndrome."
Page 2: Story Writer: Implemented a split-screen layout with an Agent Chat on the left and a "Live Scenario Board" on the right using reactflow to visualize scene connections as a node-based graph.
Page 3: Storyboard: Created a simulated infinite canvas where users can manage Character, Stage, and Shot assets. Includes the "Asset Locking" feature and a "Character Artist" pop-up.
Page 4: Cinema Directing: Built a sophisticated interface with a central 3D preview, a right-side "Precision Inspector" featuring "Kling 6-Axis" controls and a "Motion Intensity" dial, and a bottom Timeline Editor.
Next Steps:

Connect the reactflow nodes to real state management to allow users to add or edit scenes dynamically.
Implement the actual 3D rendering context (e.g., using Three.js) for the Cinema Directing preview to respond to the 6-axis controls.
Add drag-and-drop functionality to the Storyboard to allow actual asset placement from the library to the canvas.
I have corrected the CSS import path in App.tsx from ./styles/custom.css to ../styles/custom.css. This should resolve the build error.

첨부 파일의 내용으로 수정해줘
The application has been updated to reflect the 'Tale Studio' design system and UX specifications found in the brief.

Implemented Features:

Global Layout: Added a persistent sidebar with 5 expert agent icons (Producer, Writer, Concept Artist, Director, Editor) and a floating 'Samantha' AI assistant in the bottom-right.
Ground (Producer Stage): Refactored into a "Meeting Room" layout with a large chat interface on the left for the Producer Agent and a Project Info Dashboard on the right.
Story Writer (Writer Stage): Implemented a split view with a ReactFlow node map on top for scene management and a Scene Metadata editor at the bottom.
Storyboard (Concept Artist Stage): Created a "Visual Studio" 2-column grid layout for managing Character and Background assets, including an "Asset Generator" UI.
Cinema Directing (Director Stage): Built a Storyboard Grid view with a "Precision Inspector" sidebar featuring 6-axis camera controls, lighting, and shot descriptions.
Next Steps:

Connect the "Generate" buttons in the Storyboard to an actual image generation API (e.g., OpenAI DALL-E or Stable Diffusion).
Implement state management (e.g., Context API or Redux) to share project data (like the script or characters) across the different stages.
Add the "Editor Stage" page to complete the full 5-stage workflow mentioned in the brief.
Global Design System & Sidebar Theme: Netflix-style Dark Mode (Deep Black #121212, Accent Color #E50914 or #7A285E)   Persistent Sidebar: 전문가 에이전트 5인(Producer > Writer > Concept Artist > Director > Editor) 순서로 수직 배치   Floating Agent: 우측 하단에 Samantha 아이콘 고정 (전역 가이드 및 진행 상황 요약)  🎨 Stage별 피그마 작업 지시서 1. Producer Stage: The Meeting Room (Level 0) UI 구조: 좌측 대형 채팅창 + 우측 간결한 대시보드  핵심 Task:  Meeting Chat: 사용자가 대략적인 스토리와 컨셉을 입력하면 에이전트가 질문을 던져 정보를 수집하는 인터페이스 설계   Project Info Dashboard: 수집된 '플레이 타임(약 30분)', '에피소드 컨셉', '대본 요약'이 실시간으로 업데이트되는 위젯 제작   UX 포인트: 비전문가도 "미팅하듯이" 정보를 채울 수 있도록 입력 필드를 최소화하고 대화 중심으로 설계  2. Writer Stage: The Script Room (Level 1) UI 구조: 상단 노드 맵 + 하단 씬 카드 상세 편집창  핵심 Task:   Scene Splitter: 기승전결(4개 씬)로 분화된 씬들을 reactflow 스타일의 노드로 시각화   Scene Metadata: 각 노드 클릭 시 해당 씬의 장소, 시간대, 핵심 갈등 정보를 입력/수정할 수 있는 팝업 UI 설계  UX 포인트: Producer 단계의 정보가 각 노드에 자동으로 뿌려지는(Auto-population) 애니메이션 효과 반영  3. Concept Artist Stage: The Visual Studio UI 구조: 2컬럼 그리드 (Left: Character / Right: Background)  핵심 Task:   Asset Generator: 이미지 업로드 버튼과 AI 생성(API) 버튼의 이원화 구조 설계  +1  Photo Boost UI: "전문적인 사진 느낌"을 주는 필터 프리셋(Cinematic, High-res) 선택 칩 추가  UX 포인트: 생성된 이미지가 '월드 모델' 느낌을 주도록 큼직한 갤러리 뷰로 배치하고, 마우스 오버 시 에셋 고정(Lock) 아이콘 노출  4. Director Stage: The Set (Cinematographic Board) UI 구조: 씬별 스토리보드 그리드 + 우측 정밀 인스펙터(Inspector)  핵심 Task:  Detailed Spec Panel: 스토리보드 클릭 시 열리는 사이드바 설계. 다음 기능 포함:   프레임 방식: Start only, Start-to-End, Next Start 선택 스위치   Camera Gear: 렌즈 세팅, 장비 종류 드롭다운   Angle Control: 6축(Kling 6-axis) 슬라이더 및 멀티앵글 설정 UI   Lighting: 조명 색온도 및 위치 제어 다이얼   Shot Description: 각 샷 하단에 클릭 즉시 수정 가능한 대사창 및 설명창 배치   5. Editor Stage: The Post-Production Suite UI 구조: 중앙 비디오 프리뷰 + 하단 타임라인 + 우측 편집 도구  핵심 Task:  AI Guide Tools: 시간적 가이드를 주는 In-Pointing 바와 특정 영역을 교체하는 In-Painting 브러시 툴 아이콘 설계   Music Timeline: 생성된 음악 파형(Waveform) 노출 및 영상 싱크 조절 핸들 제작  +1  UX 포인트: 최종 결과물을 "빠르고 쉽게" 확인할 수 있도록 'Draft 렌더링' 버튼 강조  💡 피그마 디자이너에게 전달할 한마디 "이 앱은 전문가용 툴의 기능을 가지되, UI는 넷플릭스처럼 세련되고 사용은 대화형으로 쉬워야 합니다. 특히 Director 단계의 스펙 조절창은 복잡한 수치들을 얼마나 직관적인 슬라이더와 다이얼로 표현하느냐가 핵심입니다."
The app structure has been fully restored and updated to match the design brief.

Implemented Components:

Global Layout (/src/app/components/Layout.tsx):

Sidebar: Includes the 5 requested expert agents (Producer, Writer, Concept Artist, Director, Editor).
Theme: Uses the specified Netflix-style Dark Mode (#121212 background) with a vibrant accent color.
Samantha Agent: A floating AI assistant icon is fixed to the bottom-right corner.
Pages:

Producer Stage (/src/app/pages/Ground.tsx): Implements "The Meeting Room" with a chat interface on the left and a project dashboard on the right.
Writer Stage (/src/app/pages/StoryWriter.tsx): Features a ReactFlow node map for scene splitting and a detailed metadata editor below.
Concept Artist Stage (/src/app/pages/Storyboard.tsx): A dual-column layout for character and background asset generation.
Director Stage (/src/app/pages/CinemaDirecting.tsx): Includes the storyboard grid and the "Precision Inspector" with 6-axis camera controls.
Editor Stage (/src/app/pages/Editor.tsx): Added the post-production suite with video preview, timeline, and AI tools (In-Painting, Cut Tool).
Routing (/src/app/routes.ts): All pages are wired up correctly.

Styles (/src/styles/custom.css): Global variables and scrollbar styles have been applied.

Next Steps:

You can navigate between stages using the sidebar icons.
The UI is currently using mock data; integration with real backend services (Supabase) or AI APIs would be the next logical step.
I have fixed the Tailwind CSS errors by:

Replacing the legacy @tailwind directives with the modern @import "tailwindcss"; syntax which is required for Tailwind v4.
Removing the problematic @apply border-border; line that was causing the crash.
Defining the theme variables properly using the @theme block, which maps the CSS variables (like --border) to Tailwind utility classes (like border-border).
Using standard CSS properties in the @layer base block to set the default border styles, ensuring stability.
The application should now build without errors.

첨부 내용 확인해서 반영해줘
The application has been fully updated to reflect the "Cinema Agent UX" specifications.

Key Changes Implemented:

Producer Stage (Ground.tsx):

Implemented "The Meeting Room" concept.
The Agent now initiates the conversation ("What is your desired playtime...").
Added a real-time "Sync Dashboard" that updates project info (Playtime, Genre, Concept).
Added the "Hand over to Writer" button for stage transition.
Writer Stage (StoryWriter.tsx):

Removed the previous ReactFlow node map.
Added a "Script Overview" dashboard displaying 4 scene cards (Introduction, Development, Turn, Conclusion).
Created a detailed scene editor for Location, Time, and Conflict.
Added a "Ask Concept Artist" handoff button.
Concept Artist Stage (Storyboard.tsx):

Added "Consistency Sheet" generation logic (Front/Side/Back views).
Added "World Model" background generation with "Cinematic Boost" styling.
Added an "Approve & Direct" handoff button.
Director Stage (CinemaDirecting.tsx):

Re-introduced the Node System here (Shot Flow) as requested.
Implemented the "Cinematographic Inspector" UI based on the reference image:
Lens Combo: Carousel for selecting lenses (Panavision, Canon, etc.).
Angle Control: Interactive 3D Cube with Rotation/Tilt/Scale sliders.
Lighting: Sphere visual for Global Lighting control (Key Light position, brightness, color temp).
Editor Stage (Editor.tsx):

Added "Temporal Guide (In-Pointing)" and "Replacement (In-Painting)" tools to the toolbar.
Visualized these features on the timeline and preview monitor.
The flow is now: Producer (Chat) -> Writer (Script Dashboard) -> Concept Artist (Visual Assets) -> Director (Shot Nodes & Inspector) -> Editor (Final Polish).

Now I'll build the complete redesigned Director stage:

Let me check if there's a package.json to verify packages used:

Good, everything looks fine. Let me do a quick check on the App.tsx to confirm the routing setup:

The component is well-formed. The implementation is complete. Here's what was built for the Director Stage:

Stage 5: Director — Shot Node Dashboard has been completely redesigned with:

Scene Navigator (Left panel): 4 acts from the Writer stage displayed as clickable scene cards with color-coded act indicators and inline shot progress dots for quick navigation
Shot Node Grid-Mindmap (Center canvas): 6 shots per scene arranged horizontally on a dot-grid canvas — each shot column has character sub-nodes (Front/Side/Back from Concept Artist assets) connected above via animated gradient lines, the main shot card with thumbnail/type badge/dialogue in the middle, and a background sub-node below, all linked with directional flow arrows
Cinematographic Inspector (Right panel): Lens Combo carousel (Panavision/Canon/Cooke/Zeiss/Leica), draggable CSS 3D cube for angle control with Rotation/Tilt/Scale sliders, a clickable perspective lighting sphere with L/T/R/F key light positions + color temperature & brightness sliders
Director Kim Chat (bottom of panel): Auto-plays a scripted conversation — when Director Kim says "샷 2의 카메라를 조금 더 위로 올리는 게 좋겠어요", the Tilt slider and 3D cube animate in real-time to +35°, and color temperature animates to 4500K on the next message, with a pulsing "Syncing" badge during transitions
Next steps to consider:

Add a timeline scrubber below the canvas to see all shots across all 4 scenes at once
Implement an SVG-based bezier curve overlay instead of DOM connector lines for the mindmap connections
Add a storyboard preview mode where clicking a shot expands it to full-screen with a playback simulation