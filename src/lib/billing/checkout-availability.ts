import 'server-only'

/** 운영 구매는 승인·연결 확인 뒤 서버에서 명시적으로 연다. 샌드박스에는 실제 청구가 없다. */
export function isCheckoutEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PADDLE_ENV !== 'production'
    || process.env.PADDLE_LIVE_CHECKOUT_ENABLED === 'true'
}
