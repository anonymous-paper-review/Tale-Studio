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
}
