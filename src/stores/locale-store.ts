import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { isDemoSession } from '@/lib/demo/context'
import { translate } from '@/lib/i18n/translate'
import { parseAppLocale, type AppLocale } from '@/lib/locale'

/**
 * UI 표시 언어 (#i18n-s5) — 진실은 auth user_metadata.locale(서버도 같은 값을 읽어
 * 신규 프로젝트 locale 로 박는다), 이 store 는 무플래시 첫 페인트용 캐시(persist)다.
 * 기본 en. 데모(공유) 세션은 updateUser 가 없으므로 로컬 전환만 되고 저장은 조용히 생략.
 */
interface LocaleState {
  locale: AppLocale
  hydrated: boolean
  /** 로그인 세션의 user_metadata.locale 을 읽어 캐시를 진실에 맞춘다 — 대시보드 진입 시 1회. */
  hydrateFromUser: () => Promise<void>
  setLocale: (l: AppLocale) => Promise<void>
  /** 표시 전용 전환(저장 없음) — 공유(데모) 뷰가 프로젝트 locale 을 따르게 한다 (#i18n-s5).
   *  hydrated 를 잠가 같은 세션에서 hydrateFromUser 가 덮어쓰지 않게 한다. 새 전체 로드에서는
   *  hydrated 가 리셋되므로 로그인 화면 복귀 시 user_metadata 가 다시 이긴다. */
  setLocaleForDisplay: (l: AppLocale) => void
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set, get) => ({
      locale: 'en',
      hydrated: false,
      hydrateFromUser: async () => {
        if (get().hydrated) return
        set({ hydrated: true })
        try {
          const supabase = createClient()
          const {
            data: { user },
          } = await supabase.auth.getUser()
          const stored = parseAppLocale(user?.user_metadata?.locale)
          if (stored) set({ locale: stored })
        } catch {
          // 비로그인/데모 — persist 캐시(기본 en) 그대로.
        }
      },
      setLocaleForDisplay: (l) => set({ locale: l, hydrated: true }),
      setLocale: async (l) => {
        set({ locale: l })
        // 데모(공유) 세션: updateUser 없음 — 표시 전환만, 경고 없이.
        if (isDemoSession()) return
        try {
          const supabase = createClient()
          const { error } = await supabase.auth.updateUser({ data: { locale: l } })
          if (error) throw error
        } catch (err) {
          // 무음 실패 금지(#chat-locale-follow 2026-08-31 실사고): 저장 실패를 삼키면 표시(ko)와
          //   계정 진실(미설정→en 폴백)이 영구히 갈려 신규 프로젝트가 계속 영어로 생성된다.
          console.error('[locale-store] locale save failed:', err)
          toast.error(
            translate(
              l,
              "Couldn't save your language setting — new projects may not follow it. Please try again.",
            ),
          )
        }
      },
    }),
    { name: 'tale-locale', partialize: (s) => ({ locale: s.locale }) },
  ),
)
