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
  private?: boolean
  /** True for blocks without a calendar instance (project-mode). */
  untimed?: boolean
}

/**
 * Untimed block (project) — has no date/start/end. Lives in the dedicated
 * `untimedBlocks` slice; persisted to `~/Bloc/blocks.md` via IPC.
 */
export interface UntimedBlock {
  id: string
  title: string
  color: TimeBlockColor
  createdAt: number
  updatedAt: number
}

export interface DeletedTimeBlock extends TimeBlock {
  deletedAt: number
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

interface TimeBlockState {
  blocks: Record<string, TimeBlock[]>
  deletedBlocks: DeletedTimeBlock[]
  untimedBlocks: UntimedBlock[]
  addBlock: (date: string, block: Omit<TimeBlock, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateBlock: (date: string, blockId: string, updates: Partial<Pick<TimeBlock, 'startTime' | 'endTime' | 'title' | 'color' | 'private'>>) => void
  removeBlock: (date: string, blockId: string) => void
  restoreBlock: (blockId: string) => void
  permanentlyDeleteBlock: (blockId: string) => void
  clearAllDeletedBlocks: () => void
  cleanOldDeletedBlocks: () => void
  getBlocksForDate: (date: string) => TimeBlock[]
  getDatesWithBlocks: () => string[]
  setBlocksForDate: (date: string, blocks: TimeBlock[]) => void
  deferBlock: (fromDate: string, blockId: string, toDate: string) => void
  // Untimed (project) blocks
  addUntimedBlock: (input: { title: string; color: TimeBlockColor }) => string
  updateUntimedBlock: (id: string, updates: Partial<Pick<UntimedBlock, 'title' | 'color'>>) => void
  removeUntimedBlock: (id: string) => void
  setUntimedBlocks: (blocks: UntimedBlock[]) => void
  getUntimedBlockById: (id: string) => UntimedBlock | null
  getBlockById: (id: string) => TimeBlock | UntimedBlock | null
  getBlocksByTitle: (title: string) => (TimeBlock | UntimedBlock)[]
  /** Títulos únicos de todos os blocos (temporal + untimed), para autocomplete. Opcional: excluir um bloco ao editar o próprio. */
  getDistinctBlockTitles: (excludeBlockId?: string) => string[]
}

export const useTimeBlockStore = create<TimeBlockState>()(
  persist(
    (set, get) => ({
      blocks: {},
      deletedBlocks: [],
      untimedBlocks: [],

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
      },

      addUntimedBlock: ({ title, color }) => {
        const id = crypto.randomUUID()
        const now = Date.now()
        const newBlock: UntimedBlock = { id, title, color, createdAt: now, updatedAt: now }
        set((state) => ({ untimedBlocks: [...state.untimedBlocks, newBlock] }))
        return id
      },

      updateUntimedBlock: (id, updates) => {
        set((state) => ({
          untimedBlocks: state.untimedBlocks.map((b) =>
            b.id === id ? { ...b, ...updates, updatedAt: Date.now() } : b
          )
        }))
      },

      removeUntimedBlock: (id) => {
        set((state) => ({
          untimedBlocks: state.untimedBlocks.filter((b) => b.id !== id)
        }))
      },

      setUntimedBlocks: (blocks) => {
        set({ untimedBlocks: blocks })
      },

      getUntimedBlockById: (id) => {
        return get().untimedBlocks.find((b) => b.id === id) || null
      },

      getBlockById: (id) => {
        const state = get()
        for (const dateBlocks of Object.values(state.blocks)) {
          const found = dateBlocks.find((b) => b.id === id)
          if (found) return found
        }
        return state.untimedBlocks.find((b) => b.id === id) || null
      },

      getBlocksByTitle: (title) => {
        const target = title.trim()
        if (!target) return []
        const state = get()
        const matches: (TimeBlock | UntimedBlock)[] = []
        for (const dateBlocks of Object.values(state.blocks)) {
          for (const b of dateBlocks) {
            if (b.title.trim() === target) matches.push(b)
          }
        }
        for (const b of state.untimedBlocks) {
          if (b.title.trim() === target) matches.push(b)
        }
        return matches
      },

      getDistinctBlockTitles: (excludeBlockId) => {
        const state = get()
        const seen = new Set<string>()
        const out: string[] = []
        const push = (raw: string) => {
          const t = raw.trim()
          if (!t || t.toLowerCase() === 'sem título') return
          const k = t.toLowerCase()
          if (seen.has(k)) return
          seen.add(k)
          out.push(t)
        }
        for (const dateBlocks of Object.values(state.blocks)) {
          for (const b of dateBlocks) {
            if (excludeBlockId && b.id === excludeBlockId) continue
            push(b.title)
          }
        }
        for (const b of state.untimedBlocks) {
          if (excludeBlockId && b.id === excludeBlockId) continue
          push(b.title)
        }
        out.sort((a, b) => a.localeCompare(b, 'pt'))
        return out
      }
    }),
    {
      name: 'bloc-timeblocks',
      version: 3,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>
        let next = state
        if (version < 2) {
          next = { ...next, deletedBlocks: [] }
        }
        if (version < 3) {
          next = { ...next, untimedBlocks: [] }
        }
        return next
      }
    }
  )
)
