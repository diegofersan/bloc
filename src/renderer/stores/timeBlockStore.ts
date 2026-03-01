import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type TimeBlockColor = 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet' | 'slate'

export interface TimeBlock {
  id: string
  date: string
  startTime: number
  endTime: number
  title: string
  color: TimeBlockColor
  createdAt: number
  updatedAt: number
  googleEventId?: string
  isGoogleReadOnly?: boolean
}

interface TimeBlockState {
  blocks: Record<string, TimeBlock[]>
  addBlock: (date: string, block: Omit<TimeBlock, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateBlock: (date: string, blockId: string, updates: Partial<Pick<TimeBlock, 'startTime' | 'endTime' | 'title' | 'color'>>) => void
  removeBlock: (date: string, blockId: string) => void
  getBlocksForDate: (date: string) => TimeBlock[]
  getDatesWithBlocks: () => string[]
  setBlocksForDate: (date: string, blocks: TimeBlock[]) => void
}

export const useTimeBlockStore = create<TimeBlockState>()(
  persist(
    (set, get) => ({
      blocks: {},

      addBlock: (date, block) => {
        const id = crypto.randomUUID()
        const now = Date.now()
        const newBlock: TimeBlock = {
          ...block,
          id,
          createdAt: now,
          updatedAt: now
        }
        set((state) => ({
          blocks: {
            ...state.blocks,
            [date]: [...(state.blocks[date] || []), newBlock]
          }
        }))
        return id
      },

      updateBlock: (date, blockId, updates) => {
        set((state) => {
          const dateBlocks = state.blocks[date]
          if (!dateBlocks) return state
          return {
            blocks: {
              ...state.blocks,
              [date]: dateBlocks.map((b) =>
                b.id === blockId ? { ...b, ...updates, updatedAt: Date.now() } : b
              )
            }
          }
        })
      },

      removeBlock: (date, blockId) => {
        set((state) => {
          const dateBlocks = state.blocks[date]
          if (!dateBlocks) return state
          const updated = dateBlocks.filter((b) => b.id !== blockId)
          const newBlocks = { ...state.blocks }
          if (updated.length === 0) {
            delete newBlocks[date]
          } else {
            newBlocks[date] = updated
          }
          return { blocks: newBlocks }
        })
      },

      getBlocksForDate: (date) => {
        return get().blocks[date] || []
      },

      getDatesWithBlocks: () => {
        return Object.keys(get().blocks).filter((date) => get().blocks[date].length > 0)
      },

      setBlocksForDate: (date, blocks) => {
        set((state) => {
          const newBlocks = { ...state.blocks }
          if (blocks.length === 0) {
            delete newBlocks[date]
          } else {
            newBlocks[date] = blocks
          }
          return { blocks: newBlocks }
        })
      }
    }),
    {
      name: 'bloc-timeblocks',
      version: 1
    }
  )
)
