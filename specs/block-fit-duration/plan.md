---
name: block-fit-duration
description: Plano técnico para o botão "fit" — alinha duração do bloco com soma das estimativas das tarefas internas.
type: plan
---

# Block Fit Duration — Plano técnico

**Status**: done
**Spec**: ./spec.md

## Resumo da abordagem

A acção fit é **puro cálculo derivado**: lê tarefas do bloco, soma estimativas, calcula novo `endTime` com clamping (próximo bloco + duração mínima 15min), e chama o `updateBlock` que já existe. Sem schema novo, sem IPC novo. A lógica vive numa **utility partilhada** (`utils/blockFit.ts`) usada pelo componente UI; a tool MCP nova replica a mesma lógica server-side. UI: novo botão condicional em `TimeBlockItem` que aparece só quando há estimativas, é editável e está timed.

## Layer 1 — Schema Markdown (iCloud)

**Sem alterações.** A acção só altera `endTime` (ocasionalmente também via overlap clamping), que já é serializado pelo `markdownSerializer.ts` no campo de tempo do bloco. Os ficheiros existentes continuam a parsear sem mudanças.

## Layer 2 — Stores Zustand (renderer)

### Stores tocadas
- **`taskStore`**: leitura apenas (`state.tasks[blockKey]`). Sem alterações.
- **`timeBlockStore`**: leitura apenas (já expõe `updateBlock` e a lista de blocos do dia). Sem alterações.

### Estado novo
Nenhum.

### Acções novas
Nenhuma — reusa `timeBlockStore.updateBlock(date, blockId, { endTime })` existente.

### Utility nova: `src/renderer/utils/blockFit.ts`

```ts
import type { Task } from '../stores/taskStore'
import type { TimeBlock } from '../stores/timeBlockStore'

export interface FitResult {
  /** New endTime (minutes since midnight). Equal to block.endTime if no-op. */
  newEndTime: number
  /** Sum of estimates that the user "wanted". May exceed what was applied. */
  desiredDuration: number
  /** Duration actually applied (newEndTime - block.startTime). */
  appliedDuration: number
  /** Why the result was clamped, if at all. */
  clamped: 'none' | 'next-block' | 'min-duration' | 'no-op'
  /** Minutes that did not fit (positive when clamped: next-block). */
  overflowMinutes: number
}

/** Recursively sum estimates per task tree.
 *  If a task has subtasks with any estimates, use sum of subtask estimates.
 *  Otherwise, use the task's own estimatedMinutes (or 0).
 *  Avoids double-counting parent + children. */
export function sumBlockEstimates(tasks: Task[]): number { ... }

/** Pure calculation. Does not mutate. */
export function computeBlockFit(
  block: Pick<TimeBlock, 'startTime' | 'endTime'>,
  tasks: Task[],
  otherBlocksSameDay: Array<Pick<TimeBlock, 'startTime' | 'endTime' | 'id'>>,
  blockId: string
): FitResult { ... }
```

**Regras de clamping** (em ordem de aplicação):
1. `desired = sumBlockEstimates(tasks)`
2. Se `desired === 0` → `clamped: 'no-op'`, `newEndTime = block.endTime`
3. `desiredEnd = block.startTime + desired`
4. Encontrar `nextBlockStart` = `min(b.startTime)` para `b.startTime > block.startTime` e `b.id !== blockId`. Se não houver, usar `1440` (00:00 do dia seguinte).
5. `maxEnd = nextBlockStart`
6. `clampedEnd = min(desiredEnd, maxEnd)`
7. Aplicar duração mínima: `if (clampedEnd - block.startTime < 15) clampedEnd = block.startTime + 15`
8. Se `clampedEnd === block.endTime` → `clamped: 'no-op'` (não chamar `updateBlock`)
9. `clamped: 'next-block'` se `desiredEnd > maxEnd`; `clamped: 'min-duration'` se desejado <15min; senão `'none'`

### Selector novo (opcional)
Não estritamente necessário — o componente já lê `state.tasks[blockKey]` directamente.

## Layer 3 — IPC main↔renderer

**Sem alterações.** A actualização do bloco já flui via:
- `timeBlockStore.updateBlock` (in-memory)
- Listener existente que serializa para `~/Bloc/YYYY/YYYY-MM-DD.md` via IPC

Nenhum novo handler ou evento.

## Layer 4 — MCP server (`mcp-server/`)

**Decisão**: criar tool nova `fit_time_block`. Justificação: a soma de estimativas requer leitura do dia, parsing das tarefas do bloco e replicar a mesma lógica de clamping. Expor isso como uma única chamada poupa ao agente 3-4 chamadas e elimina o risco de divergência entre como o agente faz e como a UI faz.

### Tool nova: `fit_time_block`

**Ficheiro**: `mcp-server/src/index.ts` (junto a `update_time_block`)

```
fit_time_block(date: string, block_id: string)
```

**Validações** (mesmas do `update_time_block`, reutilizar helpers):
- Day data existe → erro se não.
- Block existe → erro se não.
- Block não é `isGoogleReadOnly` → erro.
- Block não é `untimed` → erro (untimed blocks não têm startTime).

**Lógica**:
1. Ler `data = readDay(date)`.
2. Encontrar tarefas do bloco em `data` (estrutura partilhada com renderer; ler de `data.blocks[blockKey]` ou equivalente — ver `mcp-server/src/storage.ts`).
3. Replicar `sumBlockEstimates` (port do utility para TS partilhado em `mcp-server/src/`, **OU** copiar a função mantendo idêntica). **Decisão**: copiar (simples, repo-local) e adicionar comentário cruzado nas duas cópias a apontar uma para a outra. As duas funções devem ter o mesmo comportamento — qualquer mudança a uma exige mudança à outra (regra de paridade).
4. Replicar `computeBlockFit` da mesma forma.
5. Se `result.clamped === 'no-op'`: retornar texto `Block "X" already fits its tasks (Nmin). No change.`
6. Aplicar `block.endTime = result.newEndTime`, `block.updatedAt = Date.now()`, `writeDay(data)`.
7. Retornar texto descritivo:
   - `none`: `Fit time block "X" — adjusted to Nmin to match estimates.`
   - `next-block`: `Fit time block "X" — clamped to Nmin (Mmin overflow into next block "Y").`
   - `min-duration`: `Fit time block "X" — clamped to 15min minimum (estimates totalled Nmin).`

### Storage helper
Verificar `mcp-server/src/storage.ts` se já expõe leitura das tarefas por bloco. Se sim, reusar; se não, expor selector (não criar novo I/O — só helper in-memory sobre o output de `readDay`).

### Serialize/deserialize
Sem ajustes — o output é uma mutação do `endTime` que o serializer existente já trata.

## UI / componentes

### Componentes alterados

#### `src/renderer/components/TimeBlockItem.tsx`

Adicionar import e botão na barra de acções (linha 206-241):

- Ícone proposto: `Sparkles` (do lucide-react) — sugere "ajuste mágico/inteligente". (Alternativas consideradas: `Maximize2` sugere "aumentar" e perde a semântica de encolher; `AlignVerticalJustifyCenter` é demasiado abstracto.)
- Posição: **primeiro** botão da barra (à esquerda do `Palette`), porque é o mais "criativo"/discricionário.
- Visibilidade condicional:
  - `block.untimed === true` → não renderizar.
  - `block.isGoogleReadOnly === true` → não renderizar.
  - `sumBlockEstimates(blockTasks) === 0` → não renderizar.
- Handler: chamar nova prop `onFit(blockId)` (em vez de calcular dentro do componente — o pai tem acesso a todos os blocos do dia para passar ao `computeBlockFit`).

```tsx
interface TimeBlockItemProps {
  ...
  onFit: (blockId: string) => void   // novo
}
```

#### `src/renderer/views/TimelineView.tsx` (ou onde o `TimeBlockItem` é instanciado)

- Importar `computeBlockFit` e `sumBlockEstimates` de `utils/blockFit.ts`.
- Implementar `handleFit(blockId)`:
  1. Ler bloco actual e tarefas (via stores).
  2. Ler outros blocos do dia (para detectar próximo bloco).
  3. `result = computeBlockFit(block, tasks, otherBlocks, blockId)`.
  4. Se `result.clamped === 'no-op'` → não fazer nada (silencioso, conforme spec).
  5. Senão: `updateBlock(date, blockId, { endTime: result.newEndTime })`.
  6. Mostrar toast conforme `result.clamped`:
     - `next-block`: `"Não há espaço para Mmin adicionais. Bloco ajustado ao máximo possível."` (ícone `AlertCircle` em texto-muted).
     - `min-duration`: `"Estimativas <15min — bloco ajustado ao mínimo de 15min."`
     - `none`: toast curto opcional `"Bloco ajustado a Nmin."` ou silencioso. **Decisão para implementação**: silencioso quando `clamped === 'none'` (a UI já mostra o resultado; toast só quando há informação útil).
- Estado local de toast: padrão da app — `useState<{ message: string } | null>` + `<Toast />` controlado.

### Componentes novos
Nenhum.

### Atalhos / tray / menus
Sem alterações.

### Estados de loading / erro / vazio
- Sem loading (operação síncrona).
- Sem estado de erro UI (clamping é o único "erro" possível e é comunicado por toast).
- Sem estado vazio dedicado — a ausência do botão é o próprio estado vazio.

### Animação
A `motion.div` raiz do `TimeBlockItem` já tem `layout` (linha 154) — a transição da altura ao mudar `endTime` é automática quando `isDragging`/`isResizing` são `false`. Sem trabalho extra.

## Verificação

### Manual

1. **Caso simples (sem clamping)**:
   - Criar bloco 09:00–10:00 com 2 tarefas (estimativas 20min e 25min, total 45min).
   - Verificar que botão fit aparece em hover.
   - Clicar fit → bloco passa a 09:00–09:45.
   - Confirmar `~/Library/Mobile Documents/.../Bloc-Dev/<data>.md` reflecte 09:00–09:45.

2. **Expansão**:
   - Bloco 09:00–09:30, tarefas que totalizam 90min.
   - Clicar fit → bloco passa a 09:00–10:30 (assumindo nada à frente).

3. **Clamp para próximo bloco**:
   - Bloco A 09:00–09:30 com tarefas totalizando 90min. Bloco B 10:00–11:00.
   - Clicar fit em A → A passa a 09:00–10:00; toast `"Não há espaço para 30min adicionais..."`.

4. **Clamp para mínimo**:
   - Bloco 14:00–15:00 com 1 tarefa de 5min.
   - Clicar fit → bloco passa a 14:00–14:15; toast informativo.

5. **No-op**:
   - Bloco 09:00–10:00 com tarefas que totalizam 60min.
   - Clicar fit → nenhuma alteração visível, sem toast.

6. **Visibilidade**:
   - Bloco sem tarefas → botão não aparece.
   - Bloco com tarefas mas sem `estimatedMinutes` em nenhuma → botão não aparece.
   - Bloco `untimed` (em `BacklogView` ou similar) → botão não aparece.
   - Bloco vindo de Google Calendar (`isGoogleReadOnly`) → botão não aparece.

7. **Subtasks**:
   - Tarefa com 2 subtasks (10min + 15min) e sem estimativa própria → conta 25min.
   - Tarefa com estimativa 30min e 0 subtasks → conta 30min.
   - Tarefa com estimativa 30min E subtasks (10min + 15min) → usa subtasks (25min), parent ignorado (regra anti-double-count).

8. **Paridade MCP**:
   - Invocar `fit_time_block(date, block_id)` via cliente MCP.
   - Confirmar que o `.md` reflecte mudança idêntica à da UI.
   - Testar os 3 ramos de clamping (none, next-block, min-duration) e confirmar texto retornado.

### Automatizada
Pequena suite de unit tests para `computeBlockFit` (`src/renderer/utils/blockFit.test.ts` se existir convenção de testes; senão omitir e cobrir manualmente). Casos: cada um dos 4 valores de `clamped`. **Verificar primeiro se há infra de testes** — se não houver, não introduzir nova; manual chega.

## Riscos e alternativas

- **Risco**: divergência entre `computeBlockFit` no renderer e na cópia no MCP. **Mitigação**: comentário cruzado em ambas a apontar para a outra; checklist em `tasks.md` para manter paridade.
- **Risco**: regra de subtasks anti-double-count surpreender utilizadores que põem estimativa no parent E nas subtasks. **Mitigação**: documentar a regra na spec; comportamento previsível e único; alternativa (somar tudo) seria pior.
- **Risco**: blocos `googleEventId` mas não `isGoogleReadOnly` (i.e. eventos editáveis sincronizados) — fit pode causar dessincronização? **Mitigação**: o `updateBlock` existente já trata sync com Google; nada de novo aqui — fit é só um wrapper sobre updateBlock.
- **Alternativa rejeitada**: animar o resize com framer-motion explicitamente. Rejeitada porque o `layout` do motion.div já dá transição automática.
- **Alternativa rejeitada**: clamping agressivo (empurrar bloco seguinte). Rejeitada na spec — fora de âmbito; risco de cascata de mudanças não-pedidas pelo utilizador.
- **Alternativa rejeitada**: contar só tarefas pendentes. Rejeitada na spec — saltos visuais ao concluir.
