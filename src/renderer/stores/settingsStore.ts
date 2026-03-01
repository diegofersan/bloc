import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AIProvider = 'openai' | 'anthropic' | 'gemini'

const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  gemini: 'gemini-2.0-flash'
}

interface SettingsState {
  provider: AIProvider
  apiKey: string
  model: string
  setProvider: (provider: AIProvider) => void
  setApiKey: (key: string) => void
  setModel: (model: string) => void
  isConfigured: () => boolean
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      provider: 'openai',
      apiKey: '',
      model: DEFAULT_MODELS['openai'],

      setProvider: (provider) => {
        set({ provider, model: DEFAULT_MODELS[provider] })
      },

      setApiKey: (key) => {
        set({ apiKey: key })
      },

      setModel: (model) => {
        set({ model })
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
