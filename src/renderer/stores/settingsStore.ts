import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AIProvider = 'openai' | 'anthropic' | 'gemini'

const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  gemini: 'gemini-2.0-flash'
}

export type WeekViewDays = 5 | 7

interface SettingsState {
  provider: AIProvider
  apiKey: string
  model: string
  primaryTimezone: string
  secondaryTimezone: string | null
  githubToken: string
  confettiOnComplete: boolean
  /** Weekly planning view: show 5 (Mon–Fri) or 7 (Mon–Sun) day columns. */
  weekViewDays: WeekViewDays
  /** Blocks view: hide groups with no pending tasks. */
  hideEmptyBlocks: boolean
  /** Pasta com ficheiros de áudio tocados durante o Flow (fase foco). */
  flowMusicFolderPath: string | null
  /** Ordem aleatória na lista de ficheiros da pasta. */
  flowMusicShuffle: boolean
  /** Música de fundo no Flow; alertas sonoros Pomodoro mantêm-se. */
  flowMusicDuringFlow: boolean
  setProvider: (provider: AIProvider) => void
  setApiKey: (key: string) => void
  setModel: (model: string) => void
  setPrimaryTimezone: (tz: string) => void
  setSecondaryTimezone: (tz: string | null) => void
  setGithubToken: (token: string) => void
  setConfettiOnComplete: (v: boolean) => void
  setWeekViewDays: (days: WeekViewDays) => void
  setHideEmptyBlocks: (v: boolean) => void
  setFlowMusicFolderPath: (path: string | null) => void
  setFlowMusicShuffle: (v: boolean) => void
  setFlowMusicDuringFlow: (v: boolean) => void
  isConfigured: () => boolean
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      provider: 'openai',
      apiKey: '',
      model: DEFAULT_MODELS['openai'],
      primaryTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      secondaryTimezone: null,
      githubToken: '',
      confettiOnComplete: true,
      weekViewDays: 7,
      hideEmptyBlocks: false,
      flowMusicFolderPath: null,
      flowMusicShuffle: true,
      flowMusicDuringFlow: true,
      setProvider: (provider) => {
        set({ provider, model: DEFAULT_MODELS[provider] })
      },

      setApiKey: (key) => {
        set({ apiKey: key })
      },

      setModel: (model) => {
        set({ model })
      },

      setPrimaryTimezone: (tz) => {
        set({ primaryTimezone: tz })
      },

      setSecondaryTimezone: (tz) => {
        set({ secondaryTimezone: tz })
      },

      setGithubToken: (token) => {
        set({ githubToken: token })
      },

      setConfettiOnComplete: (v) => {
        set({ confettiOnComplete: v })
      },

      setWeekViewDays: (days) => {
        set({ weekViewDays: days })
      },

      setHideEmptyBlocks: (v) => {
        set({ hideEmptyBlocks: v })
      },

      setFlowMusicFolderPath: (path) => {
        set({ flowMusicFolderPath: path })
      },

      setFlowMusicShuffle: (v) => {
        set({ flowMusicShuffle: v })
      },

      setFlowMusicDuringFlow: (v) => {
        set({ flowMusicDuringFlow: v })
      },

      isConfigured: () => {
        return get().apiKey.length > 0
      }
    }),
    {
      name: 'bloc-settings'
    }
  )
)

export function formatTzOffset(tz: string): string {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'shortOffset' })
  const parts = formatter.formatToParts(now)
  const offsetPart = parts.find(p => p.type === 'timeZoneName')
  return offsetPart?.value ?? tz
}

export function getTzOffsetMinutes(tz: string): number {
  const now = new Date()
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' })
  const tzStr = now.toLocaleString('en-US', { timeZone: tz })
  return (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 60000
}
