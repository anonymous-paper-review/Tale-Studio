// UI 크롬 한국어 사전 (#i18n-s5) — 키는 코드에 쓰인 **영어 원문 그대로**.
//   영어가 base(코드에 직접), 한국어는 여기서 매핑 — 누락 키는 영어로 폴백되므로
//   번역 공백이 깨진 화면이 아니라 영어 화면이 된다. 파이프라인 산출물·유저 콘텐츠는
//   이 사전과 무관(프로젝트 locale 이 지배), 마케팅 페이지는 영어 고정이라 사전을 안 탄다.
export const KO: Record<string, string> = {
  // ── 대시보드 공통 ──
  Projects: '프로젝트',
  'Log out': '로그아웃',
  Language: '언어',

  // ── 프로젝트 대시보드 (/projects) ──
  'New project': '새 프로젝트',
  'No projects yet': '아직 프로젝트가 없어요',
  'Create your first project': '첫 프로젝트 만들기',
  'Name your project — you can rename it anytime.': '프로젝트 이름을 지어 주세요. 나중에 언제든 바꿀 수 있어요.',
  'e.g. One rainy night in the city': '예: 비 오는 도시의 하룻밤',
  Cancel: '취소',
  Create: '만들기',
  Delete: '삭제',
  Rename: '이름 변경',
  'Rename project': '프로젝트 이름 변경',
  'Delete project': '프로젝트 삭제',
  'Failed to delete': '삭제에 실패했어요',
  'This deletes "{title}" and everything in it — story, characters, scenes, shots, videos. This cannot be undone.':
    '"{title}" 프로젝트와 모든 산출물(스토리·캐릭터·씬·샷·영상)이 삭제됩니다. 되돌릴 수 없어요.',

  // ── 공유(데모) 진입 (/share) ──
  'This link has expired or is invalid.': '링크가 만료되었거나 유효하지 않아요.',
  'Could not load the preview.': '미리보기를 불러오지 못했어요.',
  'Preparing preview…': '미리보기 준비 중…',

  // ── 스튜디오 공통: global-chat ──
  '{stage} section': '{stage} 구간',
  Now: '지금',
  Thinking: '생각 중',
  'Copy failed.': '복사에 실패했어요.',
  'Copy message': '메시지 복사',
  Character: '캐릭터',
  Location: '장소',
  "I'm still building scenes and shots right now, so I can't take revision requests. Once the draft is ready, let me know — I'll apply it right away.":
    '지금은 씬·샷을 만드는 중이라 수정 요청을 접수할 수 없어요. 초안이 완성되면 다시 말씀해 주세요 — 그때 바로 반영할게요.',
  'Scenes confirmed — starting character, visual, and shot design': '씬 확정 — 인물·비주얼·샷 설계를 시작해요',
  'Confirmation failed — try again from the gate panel in the writer screen':
    '확정에 실패했어요 — writer 화면의 게이트 패널에서 시도해 주세요',
  'Open a project first.': '프로젝트를 먼저 열어 주세요.',
  'You can upload up to {count} images at once.': '이미지는 한 번에 {count}장까지 올릴 수 있어요.',
  '{name} exceeded the limit — the rest was cut off.': '{name} 이(가) 상한을 넘어 뒷부분이 잘렸어요.',
  'Upload failed.': '업로드에 실패했어요.',
  Accept: '수락',
  Later: '나중에',
  'Agent chat': '에이전트 채팅',
  'One conversation that continues across every stage': '모든 단계가 이어지는 하나의 대화',
  'Collapse chat': '채팅 접기',
  'Attached image': '첨부 이미지',
  '{from} invited {to} to the chat': '{from}가 {to}를 채팅에 초대했어요',
  Suggestion: '제안',
  Approve: '승인',
  'Type my own answer…': '직접 입력…',
  'Type my own answer': '직접 입력',
  'Type what you want to say, then press Enter…': '하고 싶은 말을 입력하고 Enter…',
  Continue: '계속하기',
  'Select (2× = confirm)': '선택 (2회=확정)',
  Confirm: '확정',
  Close: '닫기',
  'Close choices': '선택지 닫기',
  '{count} slices': '{count}조각',
  Truncated: '잘림',
  'Remove attachment': '첨부 제거',
  'Remove {name}': '{name} 첨부 제거',
  'Answer using the choices above': '위 선택지에서 답해 주세요',
  'Type your changes — or press Enter as-is to confirm the scenes': '수정할 내용을 입력하세요 — 없으면 그대로 Enter (씬 확정)',
  "Tell us how to use it — leave blank and we'll fold it into the story": '어떻게 쓸지 적어 주세요 — 비워 두면 스토리로 정리해요',
  'Attach a file — manuscript (txt·md·docx) or image (jpg·png·webp)': '파일 첨부 — 원고(txt·md·docx)나 이미지(jpg·png·webp)',
  'Attach file': '파일 첨부',
  'Quick requests': '빠른 요청',
  "Chat isn't supported at this stage.": '이 단계에서는 채팅을 지원하지 않아요.',
  'Select style': '스타일 선택',
  'Asset mentions': '에셋 멘션',
  "There's nothing to mention at this stage.": '이 단계에서 멘션할 수 있는 항목이 없어요.',
  'Stop generating response': '응답 생성 중단',
  Send: '보내기',
  'Open chat': '채팅 열기',

  // ── 스튜디오 공통: sidebar ──
  'Generation failed · retry': '생성 실패·재시도',
  'Generating images {ready}/{total}': '이미지 생성 중 {ready}/{total}',
  'Project name': '프로젝트 이름',
  'Enter to save · Esc to cancel': 'Enter 저장 · Esc 취소',
  Share: '공유',
  Export: '내보내기',
  "Feedback is always open. If we don't reply within 12 hours, you'll get {credit} per hour.":
    '피드백은 항상 열려있습니다. 12시간 내로 답변 없을 시 시간당 {credit}을 제공해드립니다.',
  'Contact / Help': '문의 / Help',
  Profile: '프로필',

  // ── 스튜디오 공통: writer-progress ──
  'Warming up…': '시동 거는 중…',
  'Choosing the tone of the story…': '이야기의 결을 고르는 중…',
  'Structuring the plot…': '기승전결을 짜는 중…',
  'Breathing life into characters…': '캐릭터에 숨을 불어넣는 중…',
  'Breaking the story into scenes…': '장면을 나누는 중…',
  'Checking the story for gaps…': '이야기에 구멍이 없나 살피는 중…',
  'Setting the visual tone…': '화면의 톤앤매너를 잡는 중…',
  'Building sets and props…': '세트를 짓고 소품을 채우는 중…',
  'Framing the camera…': '카메라 자리를 잡는 중…',
  'Designing shots…': '샷을 설계하는 중…',
  'Reviewing shots one by one…': '샷을 한 컷씩 검수하는 중…',
  'Sequencing the shots…': '샷 순서를 엮는 중…',
  'Crafting prompts…': '프롬프트를 빚는 중…',
  'Gathering props…': '소품을 챙기는 중…',
  'Drawing each shot…': '한 컷씩 그려내는 중…',
  'Rolling camera…': '카메라를 돌리는 중…',
  'Finalizing characters and backgrounds…': '캐릭터·배경을 정리하는 중…',
  'Finalizing the storyboard…': '콘티를 정리하는 중…',
  'Raising the curtain…': '막을 올리는 중…',
  'Generating with AI…': 'AI 자동 생성 진행 중…',
  'Generating images': '이미지 생성',
  'Generating story, characters, scenes, shots, and prompts in the background. About 3-5 minutes.':
    '스토리, 캐릭터, 씬, 샷, 프롬프트를 백그라운드에서 생성 중. 약 3-5분.',

  // ── 스튜디오 공통: user-menu ──
  'Just now': '방금',
  '{mins}m ago': '{mins}분 전',
  '{hours}h ago': '{hours}시간 전',
  '{days}d ago': '{days}일 전',
  '{months}mo ago': '{months}달 전',
  'Delete project "{title}"?': '"{title}" 프로젝트를 삭제하시겠습니까?',

  // ── 스튜디오 공통: mention-textarea ──
  'Card/object mentions — ↑↓ to move, Enter to select': '카드/오브젝트 멘션 — ↑↓ 이동, Enter 선택',
  'View content above': '입력 위쪽 내용 보기',
  'View content below': '입력 아래쪽 내용 보기',

  // ── 스튜디오 공통: chat-progress-pin ──
  '{count} items': '{count}건',
  'Failed {count}': '실패 {count}',

  // ── 스튜디오 공통: writer-resume-button ──
  'Resuming…': '재개하는 중…',
  Resume: '이어서 재시도',
  "Picks up from where it stopped — it won't start over from scratch.": '중단된 단계부터 다시 시작해요 — 처음부터 다시 만들지 않아요.',

  // ── 스튜디오 공통: share-button ──
  'Share link copied — a read-only preview that opens without logging in': '공유 링크 복사됨 — 로그인 없이 열리는 읽기전용 미리보기',
  'Failed to create share link': '공유 링크 생성에 실패했어요',
  'Create share link': '공유 링크 만들기',
  'Create share link (read-only preview)': '공유 링크 만들기 (읽기전용 미리보기)',

  // ── 스튜디오 공통: demo-banner ──
  'Preview · generation disabled': '미리보기 · 실제 생성 비활성',
}
