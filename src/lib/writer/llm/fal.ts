// fal.ai 클라이언트 (이미지/영상 생성)
//
// 두 가지 API:
//   1. submit/fetch 분리 — Next.js maxDuration timeout 회피용. submit으로 request_id만 받고
//      별도 fetch 호출로 결과 수집. 끊겨도 fal 큐 작업은 살아있음.
//   2. *Generate (legacy wrapper) — submit + 짧은 polling을 묶은 thin wrapper. 빠른 작업용.
import { fal } from '@fal-ai/client';
import { recordRawCall } from './raw_collector';
import { withLlmRetry } from './retry';

const apiKey = process.env.FAL_KEY;
fal.config({ credentials: () => apiKey ?? '' });

let imageCallCount = 0;
let videoCallCount = 0;
export function getFalImageCount() {
  return imageCallCount;
}
export function getFalVideoCount() {
  return videoCallCount;
}
export function resetFalCounts() {
  imageCallCount = 0;
  videoCallCount = 0;
}

// ===== 공통 유틸 =====

export type FalQueueStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'UNKNOWN';

export interface FalFetchPending {
  status: 'IN_QUEUE' | 'IN_PROGRESS';
}
export interface FalImageFetchSuccess {
  status: 'COMPLETED';
  url: string;
  width?: number;
  height?: number;
  raw: unknown;
}
export interface FalVideoFetchSuccess {
  status: 'COMPLETED';
  url: string;
  duration?: number;
  raw: unknown;
}
export interface FalFetchFailed {
  status: 'FAILED';
  error: string;
}
export type FalImageFetchResult = FalFetchPending | FalImageFetchSuccess | FalFetchFailed;
export type FalVideoFetchResult = FalFetchPending | FalVideoFetchSuccess | FalFetchFailed;

/**
 * fal 클라이언트 에러에서 진단 가능한 상세(status + 본문)를 뽑는다.
 *   "Forbidden"(HTTP status text)만으론 원인(잔액/모델권한/OpenAI org 인증/레이트리밋)을 구분 못 하므로,
 *   @fal-ai/client 가 던지는 에러의 status·body(detail) 를 평탄화해 메시지로 만든다.
 */
function falErrorDetail(e: unknown): string {
  if (!e || typeof e !== 'object') return String(e);
  const err = e as { status?: number; message?: string; body?: unknown };
  const parts: string[] = [];
  if (err.status != null) parts.push(`status=${err.status}`);
  if (err.message) parts.push(err.message);
  if (err.body != null) {
    try {
      const bodyStr =
        typeof err.body === 'string' ? err.body : JSON.stringify(err.body);
      if (bodyStr && bodyStr !== '{}') parts.push(`body=${bodyStr.slice(0, 600)}`);
    } catch {
      /* body 직렬화 실패는 무시 */
    }
  }
  return parts.length ? parts.join(' | ') : String(e);
}

// ===== T2I =====

export interface FalImageOptions {
  model?: string;             // 기본: openai/gpt-image-2
  prompt: string;
  aspect_ratio?: string;
  reference_image_urls?: string[];
  negative_prompt?: string;
  /** 고정 시 diffusion 노이즈 초기값 고정 → 스타일 베이스라인 일관성 + 재생성 재현성 (flux 계열 지원). */
  seed?: number;
  webhookUrl?: string;        // 설정 시 fal 큐가 완료를 이 URL로 POST (비동기 webhook 전환)
}

export interface FalImageResult {
  url: string;
  width?: number;
  height?: number;
  raw: unknown;
}

const DEFAULT_IMAGE_MODEL = 'openai/gpt-image-2';
// reference 있을 때 자동 사용할 edit 모델 (image_urls 입력)
const DEFAULT_EDIT_IMAGE_MODEL = 'openai/gpt-image-2/edit';
// 러프 스토리보드(previz 스케치) 전용 — 비용/속도 우선 경량 모델 (2026-06-12 사용자 결정).
//   흑백 연필 스케치 + 목각 인형 수준이라 소형 모델로 충분. LoRA 미지정 시 base 로 동작.
//   2026-06-18: 4b → 9b 격상 (4b 가 monochrome/featureless 지시 위반·구도 결함 심함, 일관성 개선 목적).
export const ROUGH_STORYBOARD_IMAGE_MODEL = 'fal-ai/flux-2/klein/9b/lora';

// flux 계열 입력 스키마 모델인지 (aspect_ratio 대신 image_size preset 사용)
function isFluxFamilyModel(model: string): boolean {
  return /\bflux\b|\/flux/.test(model);
}

// reference_image_urls 필요한 edit 류 모델인지
function isImageEditModel(model: string): boolean {
  return /\/edit$/.test(model) || /redux/.test(model) || /ip-adapter/.test(model);
}

// aspect_ratio 'W:H' → openai/gpt-image-2/edit이 받는 image_size preset 매핑
//   미스매치 시 'auto' fallback (모델이 첫 reference 이미지 비율 따라감)
function arToImageSize(ar?: string): string {
  if (!ar) return 'auto';
  const cleaned = ar.replace(/^(horizontal_|vertical_|cinema_)/, '');
  const map: Record<string, string> = {
    '16:9': 'landscape_16_9',
    '4:3': 'landscape_4_3',
    '1:1': 'square_hd',
    '3:4': 'portrait_4_3',
    '9:16': 'portrait_16_9',
  };
  if (map[cleaned]) return map[cleaned];
  // 숫자 비율 → 가까운 preset
  const m = /^([\d.]+):([\d.]+)$/.exec(cleaned);
  if (m) {
    const ratio = parseFloat(m[1]) / parseFloat(m[2]);
    if (ratio > 1.6) return 'landscape_16_9';      // 1.78, 2.39 등
    if (ratio > 1.2) return 'landscape_4_3';
    if (Math.abs(ratio - 1) < 0.05) return 'square_hd';
    if (ratio > 0.65) return 'portrait_4_3';
    return 'portrait_16_9';
  }
  return 'auto';
}

// reference 있으면 자동으로 edit 모델로 라우팅 (요청한 모델이 순수 T2I일 때만)
function resolveImageModel(opts: FalImageOptions): string {
  const explicit = opts.model;
  const hasRef = !!opts.reference_image_urls?.length;
  if (explicit) {
    // 명시 모델이 edit인데 ref 없으면 ref 없이는 못 돌리니 → 순수 T2I로 강등
    if (isImageEditModel(explicit) && !hasRef) return DEFAULT_IMAGE_MODEL;
    return explicit;
  }
  return hasRef ? DEFAULT_EDIT_IMAGE_MODEL : DEFAULT_IMAGE_MODEL;
}

function buildFalImageInput(opts: FalImageOptions, model: string): Record<string, unknown> {
  const input: Record<string, unknown> = { prompt: opts.prompt };
  if (opts.negative_prompt) input.negative_prompt = opts.negative_prompt;
  if (typeof opts.seed === 'number') input.seed = opts.seed;

  if (isImageEditModel(model)) {
    // edit 모델: image_urls 필수 + image_size preset
    input.image_urls = opts.reference_image_urls ?? [];
    input.image_size = arToImageSize(opts.aspect_ratio);
  } else if (isFluxFamilyModel(model)) {
    // flux 계열: aspect_ratio 파라미터가 없고 image_size preset 사용 ('auto' 미지원 → 16:9 fallback)
    const size = arToImageSize(opts.aspect_ratio);
    input.image_size = size === 'auto' ? 'landscape_16_9' : size;
    if (opts.reference_image_urls?.length) input.image_urls = opts.reference_image_urls;
  } else {
    // 순수 T2I: aspect_ratio. reference 있어도 모델이 받으면 함께 보냄
    if (opts.aspect_ratio) input.aspect_ratio = opts.aspect_ratio;
    if (opts.reference_image_urls?.length) input.reference_image_urls = opts.reference_image_urls;
  }
  return input;
}

function extractImageUrlFromData(raw: unknown): { url: string; width?: number; height?: number } {
  const data = raw as {
    images?: Array<{ url?: string; width?: number; height?: number }>;
    image?: { url?: string };
  };
  const url = data?.images?.[0]?.url ?? data?.image?.url ?? '';
  return { url, width: data?.images?.[0]?.width, height: data?.images?.[0]?.height };
}

/** submit only — request_id 반환 즉시 리턴. polling은 별도. */
export async function falImageSubmit(
  opts: FalImageOptions,
): Promise<{ request_id: string; model: string }> {
  if (!apiKey) throw new Error('FAL_KEY not set');
  const model = resolveImageModel(opts);
  const input = buildFalImageInput(opts, model);
  try {
    const { request_id } = await withLlmRetry(
      () =>
        fal.queue.submit(model, opts.webhookUrl ? { input, webhookUrl: opts.webhookUrl } : { input }),
      'fal-image-submit',
    );
    return { request_id, model };
  } catch (e) {
    // fal 실패 상세를 표면화 — 라우트(500 body.error)→client(✗ failed)까지 진짜 이유가 전파된다.
    const detail = falErrorDetail(e);
    console.error(`[fal-image-submit] model=${model} failed: ${detail}`);
    throw new Error(`fal submit (${model}): ${detail}`);
  }
}

/** fetch — fal queue status + result. 완료 시 url 포함, 미완료 시 pending */
export async function falImageFetch(
  model: string,
  request_id: string,
): Promise<FalImageFetchResult> {
  if (!apiKey) throw new Error('FAL_KEY not set');
  const status = await fal.queue.status(model, { requestId: request_id, logs: false });
  const s = (status.status as string).toUpperCase();
  if (s === 'COMPLETED') {
    let result;
    try {
      result = await fal.queue.result(model, { requestId: request_id });
    } catch (e) {
      // fal 큐는 처리 중 실패한 요청도 status=COMPLETED 로 두고, result 조회가 422 로 실패 상세를 돌려준다.
      //   422 = 터미널 실패(예: reference 이미지 fetch 불가) → FAILED 매핑. 이를 transient 로 취급해
      //   reconcile 이 잡을 영영 queued 로 두고 dedupe 가 재생성까지 막던 버그 수정 (2026-07-12).
      //   그 외(네트워크/5xx)는 일시 오류 → 재던져 호출자가 queued 유지·다음 폴링에서 재시도.
      if ((e as { status?: number })?.status === 422)
        return { status: 'FAILED', error: falErrorDetail(e) };
      throw e;
    }
    const { url, width, height } = extractImageUrlFromData(result.data);
    if (!url) return { status: 'FAILED', error: 'no image URL in result' };
    return { status: 'COMPLETED', url, width, height, raw: result.data };
  }
  if (s === 'FAILED') return { status: 'FAILED', error: 'fal queue FAILED' };
  return { status: s === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'IN_QUEUE' };
}

/** legacy — submit + 폴링 합쳐 결과까지 await. 짧은 작업용. */
export async function falImageGenerate(opts: FalImageOptions): Promise<FalImageResult> {
  if (!apiKey) throw new Error('FAL_KEY not set');
  imageCallCount++;
  const model = resolveImageModel(opts);
  const started = Date.now();
  let url = '';
  let error: string | undefined;
  let raw: unknown = null;

  try {
    const input = buildFalImageInput(opts, model);
    const result = await withLlmRetry(
      () => fal.subscribe(model, { input, logs: false }),
      'fal-image',
    );
    raw = result.data;
    const ex = extractImageUrlFromData(result.data);
    url = ex.url;
    if (!url) throw new Error(`fal image: no URL in response: ${JSON.stringify(result.data).slice(0, 200)}`);
    return { url, width: ex.width, height: ex.height, raw };
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    recordRawCall({
      timestamp: new Date().toISOString(),
      provider: 'local',
      model: `fal:${model}`,
      prompt: opts.prompt,
      response: JSON.stringify({ url, raw }, null, 2),
      duration_ms: Date.now() - started,
      error,
      input_chars: opts.prompt.length,
      output_chars: url.length,
    });
  }
}

// ===== TI2V =====

export interface FalVideoOptions {
  model?: string;
  prompt: string;
  image_url: string;
  duration?: number;
  aspect_ratio?: string;
  negative_prompt?: string;
  webhookUrl?: string;        // 설정 시 fal 큐가 완료를 이 URL로 POST (비동기 webhook 전환)
}

export interface FalVideoResult {
  url: string;
  duration?: number;
  raw: unknown;
}

const DEFAULT_VIDEO_MODEL = 'alibaba/happy-horse/reference-to-video';

// happy-horse는 negative_prompt 미지원 → 보내면 에러 가능
const MODELS_WITHOUT_NEGATIVE_PROMPT = new Set([
  'alibaba/happy-horse/reference-to-video',
]);

// fal 비디오 모델이 받아들이는 표준 aspect ratio
const VALID_VIDEO_AR = new Set(['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']);

// '2.39:1', 'horizontal_16:9' 같은 비표준을 가장 가까운 표준으로 매핑
function normalizeVideoAspectRatio(ar?: string): string | undefined {
  if (!ar) return undefined;
  const cleaned = ar.replace(/^(horizontal_|vertical_|cinema_)/, '');
  if (VALID_VIDEO_AR.has(cleaned)) return cleaned;
  const m = /^([\d.]+):([\d.]+)$/.exec(cleaned);
  if (m) {
    const ratio = parseFloat(m[1]) / parseFloat(m[2]);
    if (ratio > 1.7) return '16:9';
    if (ratio < 0.6) return '9:16';
    if (Math.abs(ratio - 1) < 0.05) return '1:1';
    if (ratio > 1.2 && ratio < 1.4) return '4:3';
    return '16:9';
  }
  return undefined;
}

// 모델별 input schema 차이를 추상화 — reference-to-video 계열은 image_urls 배열 사용
function buildFalVideoInput(opts: FalVideoOptions, model: string): Record<string, unknown> {
  const isReferenceToVideo = /reference-to-video$/.test(model);
  const isHappyHorse = /happy-horse/.test(model);
  const input: Record<string, unknown> = { prompt: opts.prompt };

  if (isReferenceToVideo) {
    input.image_urls = opts.image_url ? [opts.image_url] : [];
  } else {
    input.image_url = opts.image_url;
  }

  // happy-horse는 3~15 정수 enum, 다른 모델은 5/10 문자열
  if (isHappyHorse) {
    const dur = Math.max(3, Math.min(15, Math.round(opts.duration ?? 5)));
    input.duration = dur;
  } else {
    const dur = opts.duration && opts.duration >= 10 ? 10 : 5;
    input.duration = String(dur);
  }

  const ar = normalizeVideoAspectRatio(opts.aspect_ratio);
  if (ar) input.aspect_ratio = ar;

  if (opts.negative_prompt && !MODELS_WITHOUT_NEGATIVE_PROMPT.has(model)) {
    input.negative_prompt = opts.negative_prompt;
  }
  return input;
}

function extractVideoUrlFromData(raw: unknown): { url: string; duration?: number } {
  const data = raw as { video?: { url?: string; duration?: number } };
  return { url: data?.video?.url ?? '', duration: data?.video?.duration };
}

/** submit only */
export async function falVideoSubmit(
  opts: FalVideoOptions,
): Promise<{ request_id: string; model: string }> {
  if (!apiKey) throw new Error('FAL_KEY not set');
  const model = opts.model ?? DEFAULT_VIDEO_MODEL;
  const input = buildFalVideoInput(opts, model);
  const { request_id } = await withLlmRetry(
    () =>
      fal.queue.submit(model, opts.webhookUrl ? { input, webhookUrl: opts.webhookUrl } : { input }),
    'fal-video-submit',
  );
  return { request_id, model };
}

/** fetch — fal queue status + result. */
export async function falVideoFetch(
  model: string,
  request_id: string,
): Promise<FalVideoFetchResult> {
  if (!apiKey) throw new Error('FAL_KEY not set');
  const status = await fal.queue.status(model, { requestId: request_id, logs: false });
  const s = (status.status as string).toUpperCase();
  if (s === 'COMPLETED') {
    let result;
    try {
      result = await fal.queue.result(model, { requestId: request_id });
    } catch (e) {
      // falImageFetch 와 동일: result 422 = 터미널 실패 → FAILED 매핑 (queued 고착 방지, 2026-07-12).
      if ((e as { status?: number })?.status === 422)
        return { status: 'FAILED', error: falErrorDetail(e) };
      throw e;
    }
    const { url, duration } = extractVideoUrlFromData(result.data);
    if (!url) return { status: 'FAILED', error: 'no video URL in result' };
    return { status: 'COMPLETED', url, duration, raw: result.data };
  }
  if (s === 'FAILED') return { status: 'FAILED', error: 'fal queue FAILED' };
  return { status: s === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'IN_QUEUE' };
}

/** legacy — submit + 폴링 합쳐 결과까지 await. 짧은 작업용. */
export async function falVideoGenerate(opts: FalVideoOptions): Promise<FalVideoResult> {
  if (!apiKey) throw new Error('FAL_KEY not set');
  videoCallCount++;
  const model = opts.model ?? DEFAULT_VIDEO_MODEL;
  const started = Date.now();
  let url = '';
  let error: string | undefined;
  let raw: unknown = null;

  try {
    const input = buildFalVideoInput(opts, model);
    const result = await withLlmRetry(
      () => fal.subscribe(model, { input, logs: false }),
      'fal-video',
    );
    raw = result.data;
    const ex = extractVideoUrlFromData(result.data);
    url = ex.url;
    if (!url) throw new Error(`fal video: no URL in response: ${JSON.stringify(result.data).slice(0, 200)}`);
    return { url, duration: ex.duration, raw };
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    recordRawCall({
      timestamp: new Date().toISOString(),
      provider: 'local',
      model: `fal:${model}`,
      prompt: opts.prompt,
      response: JSON.stringify({ url, raw }, null, 2),
      duration_ms: Date.now() - started,
      error,
      input_chars: opts.prompt.length,
      output_chars: url.length,
    });
  }
}
