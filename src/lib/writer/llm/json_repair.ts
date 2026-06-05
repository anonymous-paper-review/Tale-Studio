// LLM JSON 응답 복구: 마크다운 fence / 미종료 문자열 / 잘린 배열-객체 처리
// 사용 정책: 원본 parse 실패 시에만 호출. 성공 시 직접 반환.

export function repairJson<T = unknown>(raw: string): T {
  const stripped = raw
    .replace(/^\uFEFF/, '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    return JSON.parse(stripped) as T;
  } catch {}

  if (!stripped.startsWith('{') && !stripped.startsWith('[')) {
    throw new Error('repairJson: response is not JSON-shaped');
  }

  // 전략 1: 에러 위치의 잉여 캐릭터 삭제 (stray quote/comma 등 모델 hallucination)
  const punched = tryRemoveErrorChars<T>(stripped);
  if (punched !== undefined) return punched;

  // 전략 2: 미종료 문자열 닫기 + 열린 괄호 스택 닫기
  const closed = tryCloseAndParse<T>(stripped);
  if (closed !== undefined) return closed;

  // 전략 3: 루트 depth의 마지막 쉼표까지 잘라 닫기
  const trimmed = tryTrimToLastValid<T>(stripped);
  if (trimmed !== undefined) return trimmed;

  throw new Error('repairJson: all strategies failed');
}

// JSON.parse 에러의 "position N" 정보를 보고 해당 위치 캐릭터 삭제 후 재시도.
// stray quote / 잉여 콤마 등 모델 hallucination 대응.
function tryRemoveErrorChars<T>(s: string, maxRemove = 8): T | undefined {
  let current = s;
  let lastPos = -1;
  let samePosCount = 0;
  for (let attempt = 0; attempt < maxRemove; attempt++) {
    try {
      return JSON.parse(current) as T;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const m = /position (\d+)/.exec(msg);
      if (!m) return undefined;
      const pos = parseInt(m[1], 10);
      if (Number.isNaN(pos) || pos < 0 || pos >= current.length) return undefined;
      // 같은 위치에서 두 번 이상 멈추면 의미없는 삭제 → 중단
      if (pos === lastPos) {
        samePosCount++;
        if (samePosCount > 1) return undefined;
      } else {
        samePosCount = 0;
      }
      lastPos = pos;
      current = current.slice(0, pos) + current.slice(pos + 1);
    }
  }
  return undefined;
}

// 미종료 문자열 닫기 + 열린 괄호 스택 닫기
function tryCloseAndParse<T>(s: string): T | undefined {
  let inStr = false;
  let esc = false;
  const stack: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  let repaired = s;
  if (inStr) {
    repaired = stripTrailingPartialEscape(repaired);
    repaired += '"';
  } else {
    repaired = removeDanglingComma(repaired);
  }
  while (stack.length > 0) {
    const op = stack.pop()!;
    repaired += op === '{' ? '}' : ']';
  }
  try { return JSON.parse(repaired) as T; } catch { return undefined; }
}

// 루트 depth의 마지막 쉼표 지점까지 잘라 닫기 (잘린 마지막 키-값 쌍 제거)
function tryTrimToLastValid<T>(s: string): T | undefined {
  const candidates: Array<{ pos: number; stack: string[] }> = [];
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
    else if (ch === ',' && stack.length >= 1) {
      candidates.push({ pos: i, stack: [...stack] });
    }
  }
  for (let k = candidates.length - 1; k >= 0; k--) {
    const c = candidates[k];
    let repaired = s.slice(0, c.pos);
    for (let j = c.stack.length - 1; j >= 0; j--) {
      repaired += c.stack[j] === '{' ? '}' : ']';
    }
    try { return JSON.parse(repaired) as T; } catch {}
  }
  return undefined;
}

function stripTrailingPartialEscape(s: string): string {
  if (s.endsWith('\\')) return s.slice(0, -1);
  return s;
}

function removeDanglingComma(s: string): string {
  return s.replace(/,\s*$/, '');
}
