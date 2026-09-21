// 대본 판별·요소 추출(#script-preserve 2026-09-17) — 사용자가 붙여 넣은 글이 촬영용 대본·무대 희곡·라디오 드라마인지
//   알아보고, 씬·인물·대사·지문·카메라·트랜지션·화면 문자·소리를 종류별로 나눈다. LLM 없음. 대사 본문은 원문 그대로(양끝 공백만).
//   실측 근거: LCFA 촬영용 10편(INT./EXT. 헤딩·대문자 큐·괄호 지시), 위키문헌 희곡 7편(막·장 + 등장인물/때/무대광경 앞머리,
//   "이름: 대사"), 라디오 1편((MUSIC…)/(SOUND…) 큐). research/seeds/scripts/ 참조.
//   약속: tests/writer/script-parse.test.ts

export type ScriptKind = 'screenplay' | 'stage_play' | 'radio' | 'none';

export interface ScriptDetection {
  kind: ScriptKind;
  confidence: number; // 0~1
  signals: Record<string, number>;
}

export type ScriptElement =
  | { type: 'action'; text: string }
  | { type: 'dialogue'; character: string; character_id: string; text: string; parenthetical?: string; extension?: string }
  | { type: 'transition'; text: string }
  | { type: 'camera'; text: string }
  | { type: 'sound'; text: string }
  | { type: 'on_screen'; text: string };

export interface ScriptScene {
  scene_id: string;
  index: number;
  heading: string;
  int_ext?: 'INT' | 'EXT' | 'INT/EXT';
  location: string;
  time_of_day?: string;
  elements: ScriptElement[];
  /** 말한 인물 + 지문에 이름이 나온 인물(character_id, 첫 등장 순) */
  characters: string[];
}

export interface ScriptCharacter {
  id: string;
  name: string; // 정본 이름(설명 목록에 있으면 그 이름, 없으면 큐 이름)
  aliases: string[]; // 큐에 쓰인 다른 표기(예: MAYA ← MAYA RIVAS, 양수 ← 강양수)
  description?: string; // 인물 설정(character breakdown) 본문
  line_count: number;
}

export interface ScriptDocument {
  kind: Exclude<ScriptKind, 'none'>;
  title?: string;
  author?: string;
  front_matter: {
    raw: string; // 첫 씬 앞의 원문 전부
    logline?: string;
    on_screen: string[]; // 첫 씬 앞의 SUPER/ON SCREEN 문자
    notes: string[]; // 초안 표기·경고 등 남은 줄
    default_location?: string; // 무대 희곡 앞머리의 무대·장소
    default_time?: string; // 무대 희곡 앞머리의 때·시절
  };
  characters: ScriptCharacter[];
  scenes: ScriptScene[];
  stats: { scenes: number; dialogue_lines: number; action_blocks: number; camera: number; transitions: number; sound: number; on_screen: number };
}

// ── 줄 판별 정규식 ────────────────────────────────────────────────────────────
const HEADING_RE = /^\s*(?:\d+[.)]?\s*)?(INT\.?\s*\/\s*EXT\.?|I\/E\.?|INT\.?|EXT\.?)\s*[.:\-–—]?\s+(.+?)\s*$/i;
const KO_SCENE_RE = /^\s*(?:S#|씬|장면|Scene)\s*(\d+)\s*[.:\-–—)]?\s*(.*)$/i;
const ACT_RE = /^\s*(?:제\s*)?(\d+)\s*(막|장|경)\s*[.:]?\s*(.*)$|^\s*(프롤로그|에필로그|서막|종막)\s*$|^\s*(ACT|SCENE)\s+([IVX]+|\d+)\s*[.:]?\s*(.*)$/i;
const TRANSITION_RE = /^\s*(CUT TO|SMASH CUT(?: TO)?|MATCH CUT(?: TO)?|HARD CUT(?: TO)?|JUMP CUT(?: TO)?|DISSOLVE(?: TO)?|FADE (?:IN|OUT|TO BLACK|TO WHITE|TO \w+)|CUT TO BLACK|BACK TO SCENE|BACK TO|INTERCUT(?: WITH)?|END OF PLAY|THE END|END|BLACK SCREEN|OVER BLACK|BLACKOUT|CURTAIN|끝|막|암전|검은 화면|흰 화면|페이드 ?(?:인|아웃)|컷 ?투|디졸브)\s*[:.]?\s*$/i;
const CAMERA_RE = /^\s*(PUSH IN|PULL BACK|PULL OUT|CLOSE ON|CLOSE UP|CLOSE-UP|C\.U\.|C\/U|ECU|EXTREME CLOSE|WIDE (?:SHOT|ON)|ANGLE ON|REVERSE ANGLE|INSERT(?!\s*[-–—:]?\s*TEXT)|POV|TILT (?:UP|DOWN)|PAN (?:LEFT|RIGHT|TO|UP|DOWN)|TRACKING|DOLLY|ZOOM|CRANE|HOLD ON|HOLD\b|RACK FOCUS|SLOW MOTION|SLOW-MO|THE CAMERA|CAMERA|카메라|클로즈업|푸시 ?인|틸트|팬|트래킹|줌)\b/i;
const ON_SCREEN_RE = /^\s*(SUPER|ON SCREEN|TITLE CARD|CHYRON|TEXT ON SCREEN|INSERT\s*[-–—:]?\s*TEXT|자막|화면 ?문자|타이틀 ?카드|화면)\b\s*[:\-–—]?\s*(.*)$/i;
const SOUND_LABEL_RE = /^\s*(SFX|SOUND(?: EFFECT)?|MUSIC|효과음|음악|소리)\b\s*[:\-–—.]?\s*(.*)$/i;
const RADIO_CUE_RE = /^\s*\(\s*(MUSIC|SOUND|SFX|음악|효과음)\b[^)]*\)\s*$/i;
const SOUND_WORD_RE = /\b(DING|BANG|SLAM|CRASH|THUD|BUZZ|RING|KNOCK|BEEP|CLICK|SCREECH|SIREN|HONK|GUNSHOT|THUNDER|SPLASH|SCREAM|CLANG|BOOM|CLATTER|BZ+Z+)\b/g;
const PARENTHETICAL_RE = /^\s*\((.*)\)\s*$/;
const STRUCTURAL_CAPS_RE = /^(INT|EXT|I\/E|CUT TO|FADE|MONTAGE|SERIES OF SHOTS|INTERCUT|FLASHBACK|TIME JUMP|BLACK SCREEN|TITLE CARD|SUPER|ON SCREEN|THE END|END|CONTINUED|MORE|BACK TO|LATER|SAME|CONTINUOUS|END OF PLAY|CURTAIN|SCENE|ACT|CONTENT WARNING|DRAFT|CAST|CHARACTERS|PERSONS|PLACE|TIME|SETTING|NOTE|NOTES|CHARACTER BREAKDOWN)\b/;
const EXTENSION_RE = /\(\s*(V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT'?D|CONT’D|PRE-LAP|ON PHONE|INTO PHONE|FILTERED|ON TV|ON RADIO|OFF|narrates?|reads?|sings?)\s*\)/i;
const CAPS_CUE_RE = /^\s*([A-Z0-9][A-Z0-9 .'’\-#&]{0,40}?)\s*((?:\([^)]{1,30}\)\s*)*)\s*:?\s*$/;
const COLON_CUE_RE = /^\s*(?:\*\*)?([가-힣A-Za-z0-9·]{1,10}(?:[ ,·][가-힣A-Za-z0-9·]{1,10}){0,2})(?:\*\*)?\s*((?:\([^)]{1,40}\)\s*)*)\s*[:：]\s*(.*)$/;
const BOLD_CUE_RE = /^\s*\*\*([^*]{1,20})\*\*\s*(.*)$/;

const FRONT_LABELS: Array<{ re: RegExp; kind: 'characters' | 'time' | 'location' | 'logline' }> = [
  { re: /^\s*#*\s*(?:\*\*)?(?:[^:：*]{0,40}?\s)?(등장인물|나오는 사람들|인물 소개|인물 설정|인물|character breakdowns?(?:\s+for\s+.{0,40})?|character sheet|characters?|cast of characters|cast|persons|dramatis personae)(?:\([^)]*\))?(?:\*\*)?\s*(?:[:：]\s*(.*)|\s*(.{0,30}))$/i, kind: 'characters' },
  { re: /^\s*#*\s*(?:\*\*)?(때|시절|시간|시대|time)(?:\([^)]*\))?(?:\*\*)?\s*[:：]?\s*(.*)$/i, kind: 'time' },
  { re: /^\s*#*\s*(?:\*\*)?(무대광경|무대 광경|장경|처소|장소|무대|배경|setting|place and time|place|scene)(?:\([^)]*\))?(?:\*\*)?\s*[.:：]?\s*(.*)$/i, kind: 'location' },
  { re: /^\s*#*\s*(?:\*\*)?(로그라인|logline)(?:\*\*)?\s*[:：]?\s*(.*)$/i, kind: 'logline' },
];
const META_LABEL_RE = /^(핵심 성격|성격|감정 아크|이야기 속 기능|외형|역할|나이|관계|동기|좋아하는 말|말투|비고|자막|화면|장르|형식|분량|출처|초안|작가|원제|제목|core traits|traits|emotional arc|function in story|appearance|role|age|motivation|arc|note|notes|logline|genre|format)$/i;
const BYLINE_RE = /^\s*(?:written\s+by|screenplay\s+by|story\s+by|by|지은이|작가|글)\s*[:：]?\s*(.*)$/i;

function isBlank(s: string): boolean {
  return !s.trim();
}
function hasLower(s: string): boolean {
  return /[a-z]/.test(s);
}
function stripMd(s: string): string {
  let t = s.replace(/^\s*(?:>\s?)+/, '').replace(/^\s*#{1,6}\s*/, '').replace(/^\s*[-*]\s+/, '').trim();
  const bold = t.match(/^\*\*(.+)\*\*$/);
  if (bold) t = bold[1].trim(); // 줄 전체가 굵게면 표기만 벗긴다("**INT. 보안실 – 낮**")
  return t;
}

/** 촬영용 씬 헤딩 → 장소·시간. "INT. SECURITY ROOM – DAY" / "EXT. BEACH - DUSK" / "S#3. 편의점 (실내/밤)" */
function parseHeading(line: string): { int_ext?: ScriptScene['int_ext']; location: string; time_of_day?: string } | null {
  const m = line.match(HEADING_RE);
  if (m) {
    const tag = m[1].toUpperCase().replace(/\s|\./g, '');
    const int_ext: ScriptScene['int_ext'] = tag.includes('/') || tag === 'I/E' ? 'INT/EXT' : tag.startsWith('INT') ? 'INT' : 'EXT';
    const parts = m[2].split(/\s+[-–—]\s+/);
    const location = parts[0].trim();
    const time_of_day = parts.length > 1 ? parts.slice(1).join(' - ').trim() : undefined;
    return { int_ext, location, time_of_day };
  }
  const k = line.match(KO_SCENE_RE);
  if (k) {
    const rest = k[2].trim();
    const paren = rest.match(/^(.*?)\s*[(（](.*?)[)）]\s*$/);
    if (paren) return { location: paren[1].trim() || rest, time_of_day: paren[2].trim() };
    const parts = rest.split(/\s+[-–—/]\s+/);
    return { location: parts[0].trim(), time_of_day: parts.length > 1 ? parts.slice(1).join(' ').trim() : undefined };
  }
  return null;
}

function isActHeading(line: string): string | null {
  const s = stripMd(line);
  if (!ACT_RE.test(s)) return null;
  if (s.length > 40) return null;
  return s;
}

interface CueMatch {
  name: string;
  extension?: string;
  parenthetical?: string;
  inlineText: string | null; // "이름: 대사" 꼴이면 같은 줄의 대사, 아니면 null
}

/** 촬영용 대문자 큐(다음 줄이 대사). "ELENA RIVAS (CONT'D)" / "JEFF (O.S.)" / "MAYA" */
function matchCapsCue(line: string, next: string | undefined, known?: (name: string) => boolean): CueMatch | null {
  if (!next || isBlank(next)) return null;
  if (hasLower(line)) return null;
  line = line.replace(/\.\s*$/, ''); // "NORA." 꼴
  if (/[:：]\s*\S/.test(line)) return null; // "NAME: text" 는 colon 큐
  const m = line.match(CAPS_CUE_RE);
  if (!m) return null;
  const name = m[1].trim();
  if (!/[A-Z]/.test(name) || name.length > 40) return null;
  if (STRUCTURAL_CAPS_RE.test(name)) return null;
  if (name.split(/\s+/).length > 5) return null;
  if (TRANSITION_RE.test(line) || CAMERA_RE.test(line) || ON_SCREEN_RE.test(line) || SOUND_LABEL_RE.test(line)) return null;
  if (parseHeading(line) || isActHeading(line)) return null;
  // 다음 줄이 또 큐/헤딩/트랜지션이면 큐가 아니다(제목 줄 등)
  if (parseHeading(next) || TRANSITION_RE.test(next) || (!hasLower(next) && CAPS_CUE_RE.test(next) && !PARENTHETICAL_RE.test(next))) return null;
  const exts = [...(m[2] ?? '').matchAll(/\(([^)]{1,30})\)/g)].map((x) => x[1].trim());
  const extension = exts.find((e) => EXTENSION_RE.test(`(${e})`));
  const parenthetical = exts.filter((e) => e !== extension).join(' / ') || undefined;
  return { name, extension: extension?.replace(/\s+/g, '').replace(/^VO$/i, 'V.O.').replace(/^OS$/i, 'O.S.'), parenthetical, inlineText: null };
}

/** "이름: 대사" / "이름 (지문): 대사" / "**이름:** 대사" / "**이름** (지문) 대사" */
function matchColonCue(line: string): CueMatch | null {
  const b = line.match(BOLD_CUE_RE);
  if (b) {
    const name = b[1].replace(/[:：]\s*$/, '').trim();
    const rest = b[2].replace(/^[:：]\s*/, '');
    if (FRONT_LABELS.some((f) => f.re.test(name)) || META_LABEL_RE.test(name)) return null;
    const { parenthetical, text } = splitLeadingParenthetical(rest);
    return { name, parenthetical, inlineText: text };
  }
  const m = line.match(COLON_CUE_RE);
  if (!m) return null;
  const name = m[1].trim();
  if (FRONT_LABELS.some((f) => f.re.test(name)) || META_LABEL_RE.test(name)) return null;
  if (/^(https?|ftp)$/i.test(name)) return null;
  if (parseHeading(line) || ON_SCREEN_RE.test(line) || SOUND_LABEL_RE.test(line)) return null;
  const exts = [...(m[2] ?? '').matchAll(/\(([^)]{1,40})\)/g)].map((x) => x[1].trim());
  const extension = exts.find((e) => EXTENSION_RE.test(`(${e})`));
  const pre = exts.filter((e) => e !== extension);
  const { parenthetical, text } = splitLeadingParenthetical(m[3]);
  const par = [...pre, ...(parenthetical ? [parenthetical] : [])].join(' / ') || undefined;
  return { name, extension, parenthetical: par, inlineText: text };
}

/** 한국어 이름만 있는 큐 줄("리로이" / "엘레나 리바스") — 다음 줄이 대사·괄호 지시이고 이름을 이미 알 때만. */
function matchKoreanNameCue(line: string, next: string | undefined, known: (name: string) => boolean): CueMatch | null {
  if (!next || isBlank(next)) return null;
  const m = line.match(/^\s*([가-힣]{1,6}(?:\s[가-힣]{1,6})?)\s*((?:\([^)]{1,30}\)\s*)*)$/);
  if (!m) return null;
  const name = m[1].trim();
  if (FRONT_LABELS.some((f) => f.re.test(name))) return null;
  if (!known(name)) return null;
  const nx = stripMd(next);
  if (parseHeading(nx) || isActHeading(nx) || TRANSITION_RE.test(nx)) return null;
  const exts = [...(m[2] ?? '').matchAll(/\(([^)]{1,30})\)/g)].map((x) => x[1].trim());
  return { name, parenthetical: exts.join(' / ') || undefined, inlineText: null };
}

/** 체호프 구텐베르크 꼴 "POPOVA. [Looking at the window] It isn't right…" — 대문자 이름 + 마침표 + 같은 줄 대사. */
function matchPeriodCue(line: string): CueMatch | null {
  const m = line.match(/^\s*([A-Z][A-Z.'’\-]*(?:\s+[A-Z][A-Z.'’\-]*){0,2})\.\s+(\S.*)$/);
  if (!m) return null;
  const name = m[1].trim();
  if (name.length < 2 || STRUCTURAL_CAPS_RE.test(name) || /^(INT|EXT|MR|MRS|MS|DR|ST)$/.test(name)) return null;
  const rest = m[2];
  if (!hasLower(rest)) return null;
  let text = rest.trim();
  const pars: string[] = [];
  for (;;) {
    const b = text.match(/^\[\s*_?([\s\S]*?)_?\s*\]\s*[—–-]?\s*([\s\S]*)$/) ?? text.match(/^\(\s*_?([\s\S]*?)_?\s*\)\s*[—–-]?\s*([\s\S]*)$/) ?? text.match(/^_([\s\S]*?)_\s*[—–-]?\s*([\s\S]*)$/);
    if (!b) break;
    pars.push(b[1].trim());
    text = b[2].trim();
  }
  return { name, parenthetical: pars.join(' / ') || undefined, inlineText: text };
}

function splitLeadingParenthetical(rest: string): { parenthetical?: string; text: string } {
  let text = rest.trim();
  const pars: string[] = [];
  for (;;) {
    const m = text.match(/^[(（]([^()（）]{1,120})[)）]\s*([\s\S]*)$/);
    if (!m) break;
    pars.push(m[1].trim());
    text = m[2].trim();
  }
  return { parenthetical: pars.join(' / ') || undefined, text };
}

function slugify(name: string, fallbackIndex: number): string {
  const ascii = name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return ascii || `char_${fallbackIndex}`;
}

// ── 판별 ─────────────────────────────────────────────────────────────────────
export function detectScript(text: string): ScriptDetection {
  const lines = (text ?? '').split(/\r?\n/);
  const sig = { headings: 0, act_headings: 0, caps_cues: 0, colon_cues: 0, music_sound: 0, parentheticals: 0, front_labels: 0, transitions: 0, lines: 0 };
  // 이름만 있는 한국어 줄이 반복되면 큐로 센다(파싱과 같은 규칙).
  const bare = new Map<string, number>();
  for (let k = 0; k < lines.length; k++) {
    const t = stripMd(lines[k]);
    const bm = t.match(/^([가-힣]{1,6}(?:\s[가-힣]{1,6})?)\s*((?:\([^)]{1,30}\)\s*)*)$/);
    if (bm && lines[k + 1] !== undefined && !isBlank(lines[k + 1]) && !FRONT_LABELS.some((f) => f.re.test(bm[1])) && !META_LABEL_RE.test(bm[1])) bare.set(bm[1], (bare.get(bm[1]) ?? 0) + 1);
  }
  const bareCue = (t: string) => { const bm = t.match(/^([가-힣]{1,6}(?:\s[가-힣]{1,6})?)\s*((?:\([^)]{1,30}\)\s*)*)$/); return !!bm && (bare.get(bm[1]) ?? 0) >= (bm[1].replace(/\s/g, '').length <= 1 ? 3 : 2); };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isBlank(line)) continue;
    sig.lines++;
    const s = stripMd(line);
    if (parseHeading(s)) { sig.headings++; continue; }
    if (isActHeading(s)) { sig.act_headings++; continue; }
    if (RADIO_CUE_RE.test(s)) { sig.music_sound++; continue; }
    if (TRANSITION_RE.test(s)) { sig.transitions++; continue; }
    if (FRONT_LABELS.some((f) => f.re.test(s) && (stripMd(s).length <= 24 || /^[^:：]{0,24}[:：]/.test(s)))) { sig.front_labels++; continue; }
    if (PARENTHETICAL_RE.test(s)) { sig.parentheticals++; continue; }
    if (matchColonCue(s) || matchPeriodCue(s)) { sig.colon_cues++; continue; }
    if (matchCapsCue(s, lines[i + 1])) { sig.caps_cues++; continue; }
    if (bareCue(s) && lines[i + 1] !== undefined && !isBlank(lines[i + 1])) { sig.colon_cues++; continue; }
  }
  const cues = sig.caps_cues + sig.colon_cues;
  let kind: ScriptKind = 'none';
  let confidence = 0;
  if (sig.headings >= 2 && cues >= 3) {
    kind = 'screenplay';
    confidence = Math.min(1, 0.7 + 0.05 * Math.min(sig.headings, 4) + 0.01 * Math.min(cues, 10));
  } else if (sig.headings >= 1 && cues >= 8) {
    kind = 'screenplay';
    confidence = 0.75;
  } else if (sig.music_sound >= 2 && cues >= 3) {
    kind = 'radio';
    confidence = Math.min(1, 0.7 + 0.05 * Math.min(sig.music_sound, 4));
  } else if ((sig.act_headings >= 1 || sig.front_labels >= 2) && cues >= 3) {
    kind = 'stage_play';
    confidence = Math.min(1, 0.7 + 0.05 * Math.min(sig.act_headings, 2) + 0.05 * Math.min(sig.front_labels, 3));
  } else if (cues >= 8 && cues / Math.max(1, sig.lines) >= 0.3) {
    kind = 'stage_play';
    confidence = 0.6;
  }
  return { kind, confidence, signals: sig };
}

// ── 파싱 ─────────────────────────────────────────────────────────────────────
interface CharacterDraft {
  name: string;
  description?: string;
  aliases: Set<string>;
  line_count: number;
}

/** 인물 설정/등장인물 블록의 한 항목: "ELENA RIVAS – Protagonist…" / "* 강양수(姜良洙)" / "* 김원경(金原卿) / 고등여학교장" / "MAURYA (an old woman)…" */
function parseCharacterEntry(line: string): { name: string; description?: string } | null {
  const s = stripMd(line).replace(/\*\*/g, '').trim();
  if (!s || s.length > 200) return null;
  if (/^[(（]/.test(s)) return null;
  if (META_LABEL_RE.test(s.split(/\s*[:：/–—-]\s*/)[0].trim())) return null;
  let s2 = s.replace(/^([가-힣]{1,6}(?:\s[가-힣]{1,6})?)\s*[(（][\u4e00-\u9fff\s]+[)）]/, '$1'); // 한자 병기 괄호는 이름 주석
  s2 = s2.replace(/^([가-힣]{1,6}(?:\s[가-힣]{1,6})?)\s*[(（][A-Za-z .'’\-]+[)）]/, '$1'); // 영문 병기 괄호도 이름 주석
  const enComma = s2.match(/^([A-Z][A-Z.'’\-]*(?:\s+[A-Z][A-Z.'’\-]*){0,3}),\s+(.+)$/);
  if (enComma) return { name: enComma[1].trim(), description: enComma[2].trim() };
  const ko = s2.match(/^([가-힣]{1,6}(?:\s[가-힣]{1,6})?)\s*(?:[/:：–—-]\s*(.*))?$/);
  if (ko) return { name: ko[1].trim(), description: ko[2]?.trim() || undefined };
  const koDesc = s2.match(/^([가-힣]{2,6})\s*[(（]([^)）]+)[)）]\s*(?:[/:：–—-]?\s*(.*))?$/);
  if (koDesc) return { name: koDesc[1].trim(), description: [koDesc[2], koDesc[3]].filter(Boolean).join(' ').trim() || undefined };
  const en = s.match(/^([A-Z][A-Za-z.'’\-]*(?:\s+[A-Z][A-Za-z.'’\-]*){0,3})\s*(?:[–—-]|:)\s*(.+)$/);
  if (en && !hasLowerWordStart(en[1])) return { name: en[1].trim().toUpperCase(), description: en[2].trim() };
  const enParen = s.match(/^([A-Z][A-Z.'’\-]*(?:\s+[A-Z][A-Z.'’\-]*){0,3})\s*[(（]\s*_?([^)）]*?)_?\s*[)）]/);
  if (enParen) return { name: enParen[1].trim(), description: enParen[2].trim() || undefined };
  const bare = s.match(/^([A-Z][A-Z.'’\-]*(?:\s+[A-Z][A-Z.'’\-]*){0,3})$/);
  if (bare) return { name: bare[1].trim() };
  return null;
}
function hasLowerWordStart(s: string): boolean {
  return s.split(/\s+/).some((w) => /^[a-z]/.test(w));
}

/** 큐 이름이 정본 이름과 같은 사람인가: 같음 · 영어 첫 단어/마지막 단어(MAYA ← MAYA RIVAS) · 한국어 성 뺀 이름(양수 ← 강양수) */
function sameName(cue: string, canonical: string): boolean {
  const c = cue.trim(), cu = c.toUpperCase(), du = canonical.trim().toUpperCase();
  if (du === cu) return true;
  if (/^[A-Z]/.test(cu) && (du.split(/\s+/)[0] === cu || du.endsWith(' ' + cu))) return true;
  if (/[가-힣]/.test(c) && c.length >= 2 && canonical.length > c.length && (canonical.endsWith(c) || canonical.startsWith(c + ' '))) return true;
  return false;
}
function linkName(cue: string, drafts: CharacterDraft[]): CharacterDraft | null {
  const c = cue.trim();
  for (const d of drafts) if (d.name.toUpperCase() === c.toUpperCase() || d.aliases.has(c)) return d;
  for (const d of drafts) if (sameName(c, d.name)) return d;
  return null;
}

export function parseScript(text: string): ScriptDocument | null {
  const det = detectScript(text);
  if (det.kind === 'none') return null;
  const kind = det.kind;
  const lines = (text ?? '').replace(/\r\n?/g, '\n').split('\n');

  const drafts: CharacterDraft[] = [];
  const front: ScriptDocument['front_matter'] = { raw: '', on_screen: [], notes: [] };
  const scenes: ScriptScene[] = [];
  let title: string | undefined;
  let author: string | undefined;
  let cur: ScriptScene | null = null;
  let section: 'none' | 'characters' | 'time' | 'location' | 'logline' = 'none';
  let sectionBuf: string[] = [];
  const stats = { scenes: 0, dialogue_lines: 0, action_blocks: 0, camera: 0, transitions: 0, sound: 0, on_screen: 0 };
  const frontLines: string[] = [];
  let sceneCounter = 0;

  const ensureChar = (rawCue: string): CharacterDraft => {
    const am = rawCue.match(/^(.+?)\s*[(（]([A-Za-z .'’\-]+)[)）]\s*$/);
    const cueName = am ? am[1].trim() : rawCue.trim();
    const alias = am ? am[2].trim() : null;
    const linked = linkName(cueName, drafts);
    if (linked && alias) linked.aliases.add(alias);
    if (linked) {
      if (linked.name !== cueName) linked.aliases.add(cueName);
      return linked;
    }
    const d: CharacterDraft = { name: cueName, aliases: new Set(alias ? [alias] : []), line_count: 0 };
    drafts.push(d);
    return d;
  };
  const newScene = (heading: string, meta: { int_ext?: ScriptScene['int_ext']; location: string; time_of_day?: string }): ScriptScene => {
    sceneCounter++;
    const sc: ScriptScene = { scene_id: `scene_${sceneCounter}`, index: sceneCounter - 1, heading, int_ext: meta.int_ext, location: meta.location, time_of_day: meta.time_of_day, elements: [], characters: [] };
    scenes.push(sc);
    return sc;
  };
  const flushSection = () => {
    if (section === 'none') return;
    const body = sectionBuf.map((l) => l.trim()).filter(Boolean);
    if (section === 'characters') {
      let last: CharacterDraft | null = null;
      const items = body.flatMap((l) => (/[;／]/.test(l) ? l.split(/\s*[;／]\s*/) : [l]));
      for (const l of items) {
        const e = parseCharacterEntry(l);
        if (e && e.name.length <= 30) {
          const linked = linkName(e.name, drafts);
          if (linked) { last = linked; if (e.description) linked.description = [linked.description, e.description].filter(Boolean).join(' '); continue; }
          last = { name: e.name, description: e.description, aliases: new Set(), line_count: 0 };
          drafts.push(last);
        } else if (last) {
          last.description = [last.description, l].filter(Boolean).join(' ');
        }
      }
    } else if (section === 'time') {
      const v = body.join(' ');
      if (cur) cur.time_of_day = cur.time_of_day ?? v; else front.default_time = front.default_time ?? v;
    } else if (section === 'location') {
      const v = body.join(' ');
      if (cur) cur.location = cur.location || v; else front.default_location = front.default_location ?? v;
    } else if (section === 'logline') {
      front.logline = body.join(' ');
    }
    section = 'none';
    sectionBuf = [];
  };
  const pushEl = (el: ScriptElement) => {
    if (!cur) {
      // 첫 씬 앞: 화면 문자는 앞머리에, 나머지는 노트로
      if (el.type === 'on_screen') { front.on_screen.push(el.text); stats.on_screen++; }
      else if (el.type === 'action') frontLines.push(el.text);
      else if (el.type === 'dialogue') {
        // 헤딩 없는 대본(라디오·희곡)은 첫 대사에서 씬을 연다
        cur = newScene(kind === 'radio' ? 'RADIO' : front.default_location ? front.default_location : '전체', { location: front.default_location ?? '', time_of_day: front.default_time });
        pushEl(el);
      }
      return;
    }
    cur.elements.push(el);
    if (el.type === 'dialogue') {
      stats.dialogue_lines++;
      if (!cur.characters.includes(el.character_id)) cur.characters.push(el.character_id);
    } else if (el.type === 'action') stats.action_blocks++;
    else if (el.type === 'camera') stats.camera++;
    else if (el.type === 'transition') stats.transitions++;
    else if (el.type === 'sound') stats.sound++;
    else if (el.type === 'on_screen') stats.on_screen++;
  };
  const emitSounds = (actionText: string) => {
    const found = new Set<string>();
    for (const m of actionText.matchAll(SOUND_WORD_RE)) found.add(m[1]);
    for (const w of found) pushEl({ type: 'sound', text: w });
  };

  // 이름만 있는 한국어 줄이 반복되면(2회 이상, 한 글자는 3회) 목록에 없어도 큐로 본다("캐시 엄마"·"주례"·"문").
  const bareCount = new Map<string, number>();
  for (let k = 0; k < lines.length; k++) {
    const t = stripMd(lines[k]);
    const bm = t.match(/^([가-힣]{1,6}(?:\s[가-힣]{1,6})?)\s*((?:\([^)]{1,30}\)\s*)*)$/);
    if (bm && lines[k + 1] !== undefined && !isBlank(lines[k + 1])) bareCount.set(bm[1], (bareCount.get(bm[1]) ?? 0) + 1);
  }
  const repeatedName = (n: string) => (bareCount.get(n) ?? 0) >= (n.replace(/\s/g, '').length <= 1 ? 3 : 2);
  const knownForCue = (n: string) => !!linkName(n, drafts) || repeatedName(n);

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');
    const s = stripMd(line);
    if (isBlank(line)) {
      // 인물 설정 블록은 문단(빈 줄)을 넘어 이어진다 — 헤딩·트랜지션·다른 라벨·큐가 나올 때 끝난다.
      if (section !== 'none' && section !== 'characters' && sectionBuf.length) flushSection();
      i++;
      continue;
    }
    if (section === 'characters') {
      // 목록에 있는(아직 확정 전이라도) 인물이 말하기 시작하면 목록이 끝난 것이다.
      const pending = sectionBuf.map((l) => parseCharacterEntry(l)?.name).filter((n): n is string => !!n);
      const known = (n: string) => !!linkName(n, drafts) || pending.some((p) => sameName(n, p)) || repeatedName(n);
      const cueTry = matchColonCue(s);
      const listedSpeaks = !!cueTry && !!cueTry.inlineText && known(cueTry.name) && (/[.?!…]/.test(cueTry.inlineText) || cueTry.inlineText.length > 24 || !!cueTry.parenthetical);
      const periodTry = matchPeriodCue(s);
      const listedSpeaksPeriod = !!periodTry && known(periodTry.name);
      if (parseHeading(s) || isActHeading(s) || TRANSITION_RE.test(s) || matchCapsCue(s, lines[i + 1]) || matchKoreanNameCue(s, lines[i + 1], known) || listedSpeaks || listedSpeaksPeriod) flushSection();
    }
    // 앞머리 라벨 블록(등장인물/때/무대…) — 씬 안팎 모두 인정
    const label = FRONT_LABELS.find((f) => f.re.test(s) && stripMd(s).length <= 40 && !matchColonCueStrict(s));
    if (label) {
      flushSection();
      section = label.kind;
      const lm = s.match(label.re);
      const inline = (lm?.[2] ?? lm?.[3])?.trim();
      sectionBuf = inline ? [inline] : [];
      i++;
      continue;
    }
    if (section !== 'none') {
      if (!/^\s*#{1,6}\s/.test(line)) sectionBuf.push(s); // "### 조연" 같은 소제목은 항목이 아니다
      i++;
      continue;
    }
    // 제목·작가(첫 씬 앞)
    if (!cur && !title && !parseHeading(s) && !isActHeading(s) && s.length <= 80 && !BYLINE_RE.test(s) && !TRANSITION_RE.test(s) && !ON_SCREEN_RE.test(s) && frontLines.length === 0 && !matchColonCueStrict(s)) {
      title = s.replace(/\*\*/g, '').trim();
      i++;
      continue;
    }
    const by = !cur ? s.match(BYLINE_RE) : null;
    if (by) {
      const val = by[1]?.trim();
      if (val) author = val;
      else if (lines[i + 1] && !isBlank(lines[i + 1])) { author = stripMd(lines[i + 1]).trim(); i++; }
      i++;
      continue;
    }
    // 씬 헤딩
    const head = parseHeading(s);
    if (head) { cur = newScene(s, head); stats.scenes++; i++; continue; }
    const act = isActHeading(s);
    if (act) { cur = newScene(act, { location: '', time_of_day: undefined }); stats.scenes++; i++; continue; }
    // 트랜지션 / 화면 문자 / 카메라 / 소리 라벨 / 라디오 큐
    if (TRANSITION_RE.test(s)) { pushEl({ type: 'transition', text: s }); i++; continue; }
    const on = s.match(ON_SCREEN_RE);
    if (on && !/^화면(?!\s*[:：])/.test(s)) { pushEl({ type: 'on_screen', text: on[2]?.trim() || s }); i++; continue; }
    if (RADIO_CUE_RE.test(s)) { pushEl({ type: 'sound', text: s.replace(/^\(|\)$/g, '').trim() }); i++; continue; }
    const sl = s.match(SOUND_LABEL_RE);
    if (sl && !hasLower(sl[1])) { pushEl({ type: 'sound', text: sl[2]?.trim() || s }); i++; continue; }
    const cm = s.match(CAMERA_RE);
    if (cm && !hasLower(cm[1])) { pushEl({ type: 'camera', text: s }); i++; continue; } // 지시어 자체가 대문자일 때만("the camera pulls back" 같은 지문은 제외)
    // 대사: "이름: 대사" 꼴
    const colon = matchColonCue(s);
    if (colon) {
      const d = ensureChar(colon.name);
      let textBody = colon.inlineText ?? '';
      // 같은 줄에 대사가 없으면(라디오 "NAME:" 꼴) 다음 줄들이 대사
      let j = i + 1;
      const extra: string[] = [];
      const pars: string[] = colon.parenthetical ? [colon.parenthetical] : [];
      if (!textBody) {
        while (j < lines.length && !isBlank(lines[j]) && !parseHeading(stripMd(lines[j])) && !matchColonCue(stripMd(lines[j])) && !TRANSITION_RE.test(stripMd(lines[j])) && !RADIO_CUE_RE.test(stripMd(lines[j]))) {
          const t = stripMd(lines[j]);
          const p = t.match(PARENTHETICAL_RE);
          if (p) pars.push(p[1].trim()); else extra.push(t);
          j++;
        }
        textBody = extra.join('\n');
      }
      pushEl({ type: 'dialogue', character: d.name, character_id: '', text: textBody, parenthetical: pars.join(' / ') || undefined, extension: colon.extension });
      d.line_count++;
      i = textBody && !colon.inlineText ? j : i + 1;
      continue;
    }
    // 대사: "NAME. 대사" (체호프 구텐베르크 꼴)
    const period = matchPeriodCue(s);
    if (period) {
      const d = ensureChar(period.name);
      let j = i + 1;
      const extra: string[] = [];
      while (j < lines.length && !isBlank(lines[j]) && !parseHeading(stripMd(lines[j])) && !matchPeriodCue(stripMd(lines[j])) && !TRANSITION_RE.test(stripMd(lines[j]))) { extra.push(stripMd(lines[j])); j++; }
      pushEl({ type: 'dialogue', character: d.name, character_id: '', text: [period.inlineText ?? '', ...extra].filter(Boolean).join('\n'), parenthetical: period.parenthetical });
      d.line_count++;
      i = j;
      continue;
    }
    // 대사: 한국어 이름만 있는 큐 줄 + 다음 줄들(괄호 지시 → 대사)
    const koCue = matchKoreanNameCue(s, lines[i + 1], knownForCue);
    if (koCue) {
      const d = ensureChar(koCue.name);
      let j = i + 1;
      const body: string[] = [];
      const pars: string[] = koCue.parenthetical ? [koCue.parenthetical] : [];
      while (j < lines.length && !isBlank(lines[j])) {
        const t = stripMd(lines[j]);
        if (parseHeading(t) || TRANSITION_RE.test(t) || matchKoreanNameCue(t, lines[j + 1], knownForCue)) break;
        const p = t.match(PARENTHETICAL_RE);
        if (p) pars.push(p[1].trim()); else body.push(t);
        j++;
      }
      pushEl({ type: 'dialogue', character: d.name, character_id: '', text: body.join('\n'), parenthetical: pars.join(' / ') || undefined });
      d.line_count++;
      i = j;
      continue;
    }
    // 대사: 대문자 큐 + 다음 줄들. 아는 이름(등장인물 목록·앞서 말한 인물)이면 큐와 대사 사이 빈 줄 하나를 허용한다(웹 페이지 꼴).
    let gap = 0;
    let caps = matchCapsCue(s, lines[i + 1]);
    if (!caps && lines[i + 1] !== undefined && isBlank(lines[i + 1]) && lines[i + 2] !== undefined && !isBlank(lines[i + 2])) {
      const probe = matchCapsCue(s, lines[i + 2]);
      if (probe && linkName(probe.name, drafts)) { caps = probe; gap = 1; }
    }
    if (caps) {
      const d = ensureChar(caps.name);
      let j = i + 1 + gap;
      const body: string[] = [];
      const pars: string[] = caps.parenthetical ? [caps.parenthetical] : [];
      let openParen = false;
      for (;;) {
        if (j >= lines.length) break;
        if (isBlank(lines[j])) {
          // 빈 줄: gap 꼴에서는 괄호 블록 뒤 한 번 더 이어 읽고, 그 밖에는 대사 끝
          if (gap && body.length === 0 && lines[j + 1] !== undefined && !isBlank(lines[j + 1]) && !matchCapsCue(stripMd(lines[j + 1]), lines[j + 2]) && !parseHeading(stripMd(lines[j + 1]))) { j++; continue; }
          break;
        }
        const t = stripMd(lines[j]);
        if (parseHeading(t) || TRANSITION_RE.test(t)) break;
        if (openParen) { const end = t.match(/^(.*?)\)\s*$/); if (end) { pars[pars.length - 1] += ' ' + end[1].trim(); openParen = false; } else pars[pars.length - 1] += ' ' + t; j++; continue; }
        const p = t.match(PARENTHETICAL_RE);
        if (p) pars.push(p[1].trim());
        else if (/^\(/.test(t) && !/\)\s*$/.test(t)) { pars.push(t.replace(/^\(/, '').trim()); openParen = true; } // 여러 줄 괄호 지시
        else body.push(t);
        j++;
      }
      pushEl({ type: 'dialogue', character: d.name, character_id: '', text: body.join('\n'), parenthetical: pars.join(' / ') || undefined, extension: caps.extension });
      d.line_count++;
      i = j;
      continue;
    }
    // 지문(액션): 빈 줄까지 한 덩이
    let j = i;
    const block: string[] = [];
    while (j < lines.length && !isBlank(lines[j])) {
      const t = stripMd(lines[j]);
      if (j > i && (parseHeading(t) || isActHeading(t) || TRANSITION_RE.test(t) || matchColonCue(t) || matchPeriodCue(t) || matchKoreanNameCue(t, lines[j + 1], knownForCue) || matchCapsCue(t, lines[j + 1]) || FRONT_LABELS.some((f) => f.re.test(t) && t.length <= 40))) break;
      block.push(t);
      j++;
    }
    const actionText = block.join(' ').trim();
    if (actionText) {
      const p = actionText.match(PARENTHETICAL_RE);
      pushEl({ type: 'action', text: p ? p[1].trim() : actionText });
      if (cur) emitSounds(actionText);
    }
    i = Math.max(j, i + 1);
  }
  flushSection();

  // 인물 정본 확정 + character_id 부여
  const characters: ScriptCharacter[] = drafts.map((d, idx) => ({ id: slugify(d.name, idx + 1), name: d.name, aliases: [...d.aliases], description: d.description, line_count: d.line_count }));
  const idByName = new Map<string, string>();
  characters.forEach((c) => { idByName.set(c.name, c.id); c.aliases.forEach((a) => idByName.set(a, c.id)); });
  for (const sc of scenes) {
    const ids: string[] = [];
    for (const el of sc.elements) {
      if (el.type === 'dialogue') {
        el.character_id = idByName.get(el.character) ?? slugify(el.character, 0);
        if (!ids.includes(el.character_id)) ids.push(el.character_id);
      }
    }
    // 지문에 이름이 나온 인물도 씬 인물에 포함
    const actionText = sc.elements.filter((e) => e.type === 'action').map((e) => e.text).join(' ');
    for (const c of characters) {
      const names = [c.name, ...c.aliases].filter((n) => n.length >= 2);
      if (!ids.includes(c.id) && names.some((n) => new RegExp(`(^|[^A-Za-z가-힣])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^A-Za-z가-힣])`, 'i').test(actionText))) ids.push(c.id);
    }
    sc.characters = ids;
  }
  front.raw = frontLines.join('\n');
  front.notes = frontLines.filter((l) => /draft|초안|warning|경고|disclaimer|고지|based on|바탕/i.test(l));

  return { kind, title, author, front_matter: front, characters, scenes, stats: { ...stats, scenes: scenes.length } };
}

/** 라벨 판별에서 "때: 현대" 같은 라벨은 큐가 아니다 — 큐 판별을 라벨보다 뒤에 두기 위한 보조. */
function matchColonCueStrict(s: string): boolean {
  const m = s.match(COLON_CUE_RE);
  if (!m) return false;
  return !FRONT_LABELS.some((f) => f.re.test(m[1]));
}
