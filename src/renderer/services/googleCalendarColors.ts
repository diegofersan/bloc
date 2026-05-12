// Bidirectional mapping between Bloc's 7-color palette and Google Calendar's
// 11 event colorIds. Google → Bloc collapses some pairs onto the same Bloc
// color; Bloc → Google is one-to-one for the 7 colors we use.

import type { TimeBlockColor } from '../stores/timeBlockStore'

const BLOC_TO_GCAL: Record<TimeBlockColor, string> = {
  indigo: '9',  // Blueberry
  emerald: '10', // Basil
  amber: '5',  // Banana
  rose: '11', // Tomato
  sky: '7',  // Peacock
  violet: '3',  // Grape
  slate: '8'   // Graphite
}

const GCAL_TO_BLOC: Record<string, TimeBlockColor> = {
  '1':  'sky',     // Lavender
  '2':  'emerald', // Sage
  '3':  'violet',  // Grape
  '4':  'rose',    // Flamingo
  '5':  'amber',   // Banana
  '6':  'amber',   // Tangerine
  '7':  'sky',     // Peacock
  '8':  'slate',   // Graphite
  '9':  'indigo',  // Blueberry
  '10': 'emerald', // Basil
  '11': 'rose'     // Tomato
}

export function blocColorToGcal(color: TimeBlockColor): string {
  return BLOC_TO_GCAL[color] ?? BLOC_TO_GCAL.sky
}

export function gcalColorToBloc(id: string | undefined | null): TimeBlockColor {
  if (!id) return 'sky'
  return GCAL_TO_BLOC[id] ?? 'sky'
}
