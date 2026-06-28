// content-safety-hint — 가벼운 "인지용" 감지기 (차단/재시도 아님).
//
// Gemini 안전필터는 *미성년(아동) + 위해(피·폭력)* 조합에서 PROHIBITED_CONTENT 로
//   파이프라인을 죽일 확률이 크다(2026-06-28 shotCheck 실패). 단, 비결정적이라 같은 입력도
//   통과/차단을 오간다. 여기서는 그 위험 조합이 producer 입력에 섞였는지 감지해 경고만 남긴다.
//   → 작성자가 사전에 콘텐츠를 우회(예: 피 → 검은 액체로 심볼릭)하도록 돕는 힌트.
//
// 의도적으로 보수적(과탐 허용) — 막는 게 아니라 알려주는 것이므로 오탐 비용이 낮다.

const MINOR_PATTERN =
  /(아동|어린이|미성년|소녀|소년|아이|애기|10대|십대|초등|유아|\bchild\b|children|\bkid\b|\bminor\b|\bteen\b|\bgirl\b|\bboy\b|infant|toddler|baby)/i;

const HARM_PATTERN =
  /(피|유혈|혈흔|살해|살인|죽이|죽음|시체|시신|사체|납치|고문|베어|베고|찌르|칼|목을|학살|자해|blood|gore|\bkill\b|murder|corpse|stab|behead|torture|mutilat|abduct|slaughter|dismember)/i;

export interface ContentSafetyHint {
  risky: boolean;
  minorTerms: string[];
  harmTerms: string[];
}

function collect(pattern: RegExp, text: string): string[] {
  const g = new RegExp(pattern.source, 'gi');
  const hits = new Set<string>();
  for (const m of text.matchAll(g)) hits.add(m[0].toLowerCase());
  return [...hits];
}

/**
 * 텍스트 묶음에 *미성년 + 위해* 조합이 동시에 존재하면 risky=true.
 *   producer 입력(스토리 + 캐릭터 외형/아크 + 배경 설명)을 합쳐 넘긴다.
 */
export function assessContentSafetyRisk(text: string): ContentSafetyHint {
  const minorTerms = collect(MINOR_PATTERN, text);
  const harmTerms = collect(HARM_PATTERN, text);
  return {
    risky: minorTerms.length > 0 && harmTerms.length > 0,
    minorTerms,
    harmTerms,
  };
}
