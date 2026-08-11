// LLM JSON 응답 복구: 마크다운 fence / 미종료 문자열 / 잘린 배열-객체 처리
// 사용 정책: 원본 parse 실패 시에만 호출. 성공 시 직접 반환.

/** 어떤 전략으로 복구했는가 — 손실 성격이 전략마다 다르다(호출자의 후속 판단 재료).
 *  clean: 펜스 제거만 / punch: 잉여 문자 삭제(비손실) /
 *  close: **잘린 항목을 닫아서** 살림 — 마지막 항목의 값이 중간에 끊겨 있을 수 있다 /
 *  trim:  마지막 유효 지점까지 절단 — 남은 항목은 온전하나 뒤가 통째로 사라졌다 */
export type RepairStrategy = 'clean' | 'punch' | 'close' | 'trim'

export function repairJson<T = unknown>(raw: string): T {
  return repairJsonWithMeta<T>(raw).value
}

/** 손실 복구(전략2·3)를 **에러로 표면화**한다 — 호출자가 "한 번 더 물어볼지"를 결정할 수 있게.
 *
 *  왜 에러인가: 손실 복구는 데이터를 버리고도 파싱을 성립시켜 "정상"으로 통과한다(무신호 손실).
 *  이 자리(문자열 복구기)는 프롬프트도 모델도 모르므로 스스로 재호출할 수 없다 — 그래서 신호만
 *  올려보내고 판단은 dispatch 에 맡긴다. 재호출도 잘리면 그때 쓰라고 **살아남은 값을 error.value
 *  에 실어 보낸다**(그 경우 종전과 동일한 최악치로 수렴한다 — 이 변경으로 잃는 것은 없다).
 *
 *  ⚠️ repairJson(비-strict)의 계약은 그대로다. 기존 호출자(agentic-reply-guard 등)는 영향 없음. */
export class LossyRepairError extends Error {
  constructor(
    readonly value: unknown,
    readonly strategy: RepairStrategy,
    readonly rawLength: number,
    readonly items: number | null,
  ) {
    super(
      `repairJson: 손실 복구(${strategy}) — 원문 ${rawLength}자, 복구된 최상위 아이템 ${items ?? '미상'}개`,
    )
    this.name = 'LossyRepairError'
  }
}

export function repairJsonStrict<T = unknown>(raw: string): T {
  const { value, strategy } = repairJsonWithMeta<T>(raw)
  if (strategy === 'close' || strategy === 'trim') {
    throw new LossyRepairError(value, strategy, raw.length, countItems(value))
  }
  return value
}

export function repairJsonWithMeta<T = unknown>(raw: string): { value: T; strategy: RepairStrategy } {
  const stripped = raw
    .replace(/^\uFEFF/, '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    return { value: JSON.parse(stripped) as T, strategy: 'clean' };
  } catch {}

  if (!stripped.startsWith('{') && !stripped.startsWith('[')) {
    throw new Error('repairJson: response is not JSON-shaped');
  }

  // 전략 1: 에러 위치의 잉여 캐릭터 삭제 (stray quote/comma 등 모델 hallucination)
  //   비손실 계열 — 아이템을 버리지 않으므로 경고하지 않는다.
  const punched = tryRemoveErrorChars<T>(stripped);
  if (punched !== undefined) return { value: punched, strategy: 'punch' };

  // 전략 2·3 은 **손실 복구**다: 잘린 응답을 닫거나(2) 마지막 유효 지점까지 잘라내(3) 파싱을
  //   성립시킨다 — 즉 성공해도 뒤쪽 내용이 사라진 채 "정상"으로 통과한다. 이게 Q6 무신호 손실의
  //   기제(8샷→2샷이 에러 0으로 통과). 호출자 배선 없이 여기서 바로 신호를 남긴다(병렬 안전).
  const closed = tryCloseAndParse<T>(stripped);
  if (closed !== undefined) {
    warnLossyRepair('닫기(전략2)', stripped, closed);
    return { value: closed, strategy: 'close' };
  }

  const trimmed = tryTrimToLastValid<T>(stripped);
  if (trimmed !== undefined) {
    warnLossyRepair('절단(전략3)', stripped, trimmed);
    return { value: trimmed, strategy: 'trim' };
  }

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

/** 손실 복구 신호(#p4-json-guard 2026-08-11) — 소실 규모를 숫자로 남긴다.
 *  루트가 배열/배열 필드면 아이템 수까지 세어 "몇 개가 사라졌나"를 즉시 읽히게 한다. */
function warnLossyRepair(strategy: string, raw: string, result: unknown): void {
  const n = countItems(result);
  console.warn(
    `[repairJson] 손실 복구 ${strategy} — 응답이 잘려 뒤쪽 내용이 사라졌다` +
      ` (원문 ${raw.length}자${n != null ? `, 복구된 최상위 아이템 ${n}개` : ''}).` +
      ' 배열 산출 스테이지라면 개수 검증이 필요하다(#p4-json-guard).',
  );
}

/** 최상위 배열 또는 배열을 담은 단일 필드의 아이템 수 (없으면 null) */
function countItems(v: unknown): number | null {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object') {
    const arrays = Object.values(v as Record<string, unknown>).filter(Array.isArray);
    if (arrays.length === 1) return (arrays[0] as unknown[]).length;
  }
  return null;
}

function stripTrailingPartialEscape(s: string): string {
  if (s.endsWith('\\')) return s.slice(0, -1);
  return s;
}

function removeDanglingComma(s: string): string {
  return s.replace(/,\s*$/, '');
}
