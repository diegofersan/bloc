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

export interface DeletedTimeBlock extends TimeBlock {
  deletedAt: number
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

interface TimeBlockState {
  blocks: Record<string, TimeBlock[]>
  deletedBlocks: DeletedTimeBlock[]
  addBlock: (date: string, block: Omit<TimeBlock, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateBlock: (date: string, blockId: string, updates: Partial<Pick<TimeBlock, 'startTime' | 'endTime' | 'title' | 'color'>>) => void
  removeBlock: (date: string, blockId: string) => void
  restoreBlock: (blockId: string) => void
  permanentlyDeleteBlock: (blockId: string) => void
  clearAllDeletedBlocks: () => void
  cleanOldDeletedBlocks: () => void
  getBlocksForDate: (date: string) => TimeBlock[]
  getDatesWithBlocks: () => string[]
  setBlocksForDate: (date: string, blocks: TimeBlock[]) => void
  deferBlock: (fromDate: string, blockId: string, toDate: string) => void
}

export const useTimeBlockStore = create<TimeBlockState>()(
  persist(
    (set, get) => ({
      blocks: {},
      deletedBlocks: [],

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
          const block = dateBlocks.find((b) => b.id === blockId)
          if (!block) return state
          const updated = dateBlocks.filter((b) => b.id !== blockId)
          const newBlocks = { ...state.blocks }
          if (updated.length === 0) {
            delete newBlocks[date]
          } else {
            newBlocks[date] = updated
          }
          const deletedBlock: DeletedTimeBlock = { ...block, deletedAt: Date.now() }
          return {
            blocks: newBlocks,
            deletedBlocks: [...state.deletedBlocks, deletedBlock]
          }
        })
      },

      restoreBlock: (blockId) => {
        set((state) => {
          const deleted = state.deletedBlocks.find((b) => b.id === blockId)
          if (!deleted) return state
          const { deletedAt: _, ...block } = deleted
          const date = block.date
          return {
            deletedBlocks: state.deletedBlocks.filter((b) => b.id !== blockId),
            blocks: {
              ...state.blocks,
              [date]: [...(state.blocks[date] || []), block]
            }
          }
        })
      },

      permanentlyDeleteBlock: (blockId) => {
        set((state) => ({
          deletedBlocks: state.deletedBlocks.filter((b) => b.id !== blockId)
        }))
      },

      clearAllDeletedBlocks: () => {
        set({ deletedBlocks: [] })
      },

      cleanOldDeletedBlocks: () => {
        const now = Date.now()
        set((state) => ({
          deletedBlocks: state.deletedBlocks.filter(
            (b) => now - b.deletedAt < THIRTY_DAYS_MS
          )
        }))
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
      },

      deferBlock: (fromDate, blockId, toDate) => {
        set((state) => {
          const dateBlocks = state.blocks[fromDate]
          if (!dateBlocks) return state
          const block = dateBlocks.find((b) => b.id === blockId)
          if (!block) return state
          const updated = dateBlocks.filter((b) => b.id !== blockId)
          const newBlocks = { ...state.blocks }
          if (updated.length === 0) {
            delete newBlocks[fromDate]
          } else {
            newBlocks[fromDate] = updated
          }
          const deferredBlock: TimeBlock = { ...block, date: toDate, updatedAt: Date.now() }
          newBlocks[toDate] = [...(newBlocks[toDate] || []), deferredBlock]
          return { blocks: newBlocks }
        })
      }
    }),
    {
      name: 'bloc-timeblocks',
      version: 2,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>
        if (version < 2) {
          return { ...state, deletedBlocks: [] }
        }
        return state
      }
    }
  )
)
