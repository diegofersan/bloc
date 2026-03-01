import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SiteBlockerState {
  blockedSites: string[]
  blockDuringPomodoro: boolean
  isBlocking: boolean
  addSite: (site: string) => void
  removeSite: (site: string) => void
  setBlockDuringPomodoro: (enabled: boolean) => void
  setIsBlocking: (active: boolean) => void
}

export const useSiteBlockerStore = create<SiteBlockerState>()(
  persist(
    (set, get) => ({
      blockedSites: [],
      blockDuringPomodoro: false,
      isBlocking: false,

      addSite: (site: string) => {
        const current = get().blockedSites
        const normalized = site.toLowerCase().trim()
        if (normalized && !current.includes(normalized)) {
          set({ blockedSites: [...current, normalized] })
        }
      },

      removeSite: (site: string) => {
        set({ blockedSites: get().blockedSites.filter((s) => s !== site) })
      },

      setBlockDuringPomodoro: (enabled: boolean) => set({ blockDuringPomodoro: enabled }),

      setIsBlocking: (active: boolean) => set({ isBlocking: active })
    }),
    {
      name: 'bloc-site-blocker',
      partialize: (state) => ({
        blockedSites: state.blockedSites,
        blockDuringPomodoro: state.blockDuringPomodoro
      })
    }
  )
)
