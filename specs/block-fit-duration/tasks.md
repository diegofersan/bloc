---
name: block-fit-duration
description: Tasks ordenadas para implementar o botão fit, mantendo paridade renderer↔MCP.
type: tasks
---

# Block Fit Duration — Tasks

**Status**: done
**Plan**: ./plan.md

## Ordem de execução

> Regra: utility partilhada primeiro (define o algoritmo), depois MCP (paridade do mesmo algoritmo), depois UI (consome o utility). Não introduzir UI antes do utility — força reescrita.

### 1. Schema & types partilhados

- [ ] **T1.1** — Sem alterações de schema MD nem types existentes. Confirmar lendo `src/main/services/markdownSerializer.ts` que `endTime` já é serializado/parseado sem mudanças. **Verificação**: leitura, sem código alterado.

### 2. Utility partilhada (renderer)

- [ ] **T2.1** — Criar `src/renderer/utils/blockFit.ts` com:
  - `interface FitResult` (campos: `newEndTime`, `desiredDuration`, `appliedDuration`, `clamped`, `overflowMinutes`).
  - `sumBlockEstimates(tasks: Task[]): number` — recursiva com regra anti-double-count (se `subtasks` tiver alguma estimativa, usa soma das subtasks; senão usa `task.estimatedMinutes ?? 0`).
  - `computeBlockFit(block, tasks, otherBlocksSameDay, blockId): FitResult` — aplica clamping em ordem: `desired === 0` → no-op; clamp para `nextBlockStart` (ou 1440); duração mínima 15min; final `clamped: 'no-op'` se `newEndTime === block.endTime`.
  - Ficheiros: `src/renderer/utils/blockFit.ts` (novo).
  - **Verificação**: `npm run typecheck` (ou `npm run build`) passa.

- [ ] **T2.2** — Validar manualmente o algoritmo com 5 casos no head do ficheiro (apenas comentário JSDoc com exemplos curtos no `computeBlockFit`, **não inventar comments fora disso**).
  - **Verificação**: leitura visual.

### 3. MCP server (paridade)

- [ ] **T3.1** — Identificar onde no `mcp-server/` ler tarefas de um bloco a partir do `readDay` output. Inspeccionar `mcp-server/src/storage.ts` e o tipo retornado por `readDay`. Se não houver helper, decidir se criar `getTasksForBlock(data, blockId)` em `mcp-server/src/storage.ts` ou inline na nova tool.
  - Ficheiros: `mcp-server/src/storage.ts` (leitura), `mcp-server/src/index.ts` (referência).
  - **Verificação**: comentário em `tasks.md` ou em PR notes a explicar a escolha.

- [ ] **T3.2** — Criar `mcp-server/src/blockFit.ts` (cópia do algoritmo de T2.1 adaptada aos types do MCP).
  - Mesmas funções: `sumBlockEstimates`, `computeBlockFit`, mesmo `FitResult`.
  - Comentário JSDoc no topo: `// MIRRORS src/renderer/utils/blockFit.ts — keep behavior identical. Any change here MUST be replicated there (and vice versa).`
  - Adicionar comentário recíproco em `src/renderer/utils/blockFit.ts` apontando para o do MCP.
  - **Verificação**: `cd mcp-server && npm run build` passa.

- [ ] **T3.3** — Adicionar tool `fit_time_block` em `mcp-server/src/index.ts`:
  - Parâmetros: `date: string`, `block_id: string`.
  - Validações: dia existe; bloco existe; não `isGoogleReadOnly`; não `untimed`.
  - Lógica: ler tarefas do bloco, chamar `computeBlockFit`, se `clamped === 'no-op'` retornar texto sem mutar; senão actualizar `block.endTime` + `updatedAt`, `writeDay(data)`.
  - Texto de retorno conforme plan (3 ramos: `none`, `next-block`, `min-duration`).
  - Ficheiros: `mcp-server/src/index.ts`.
  - **Verificação**: `cd mcp-server && npm run build` passa; tool aparece em `tools/list`.

### 4. Stores Zustand

- [ ] **T4.1** — Sem alterações. Confirmação leitura.

### 5. IPC handlers

- [ ] **T5.1** — Sem alterações. Confirmação leitura.

### 6. UI / componentes

- [ ] **T6.1** — Em `src/renderer/components/TimeBlockItem.tsx`:
  - Importar `Sparkles` de `lucide-react`.
  - Importar `sumBlockEstimates` de `../utils/blockFit`.
  - Adicionar prop `onFit: (blockId: string) => void` à interface `TimeBlockItemProps`.
  - Calcular `estimateSum = useMemo(() => sumBlockEstimates(blockTasks ?? []), [blockTasks])`.
  - Adicionar `canFit = !block.untimed && !block.isGoogleReadOnly && estimateSum > 0`.
  - Renderizar botão `Sparkles` (size 11) **antes** do `Palette` na barra de acções (linha ~206), envolto em `{canFit && (...)}`. Handler: `e.stopPropagation(); onFit(block.id)`. `aria-label="Ajustar duração às tarefas"`.
  - Ficheiros: `src/renderer/components/TimeBlockItem.tsx`.
  - **Verificação**: `npm run typecheck`; visual: o componente compila e o botão aparece em hover.

- [ ] **T6.2** — Identificar onde `TimeBlockItem` é instanciado (provavelmente `src/renderer/views/TimelineView.tsx` ou `DayView.tsx`). Adicionar handler `handleFit(blockId)`:
  - Importar `computeBlockFit` de `../utils/blockFit`.
  - Ler `block`, `tasks` (via `useTaskStore` com `state.tasks[blockKey]`), `otherBlocks` (do dia, excluindo o próprio).
  - Chamar `computeBlockFit(block, tasks, otherBlocks, blockId)`.
  - Se `result.clamped === 'no-op'` → return.
  - Senão: `updateBlock(date, blockId, { endTime: result.newEndTime })`.
  - Conforme `result.clamped`:
    - `next-block`: setar toast `"Não há espaço para ${result.overflowMinutes}min adicionais. Bloco ajustado ao máximo possível."`.
    - `min-duration`: setar toast `"Estimativas <15min — bloco ajustado ao mínimo de 15min."`.
    - `none`: silencioso.
  - Passar `onFit={handleFit}` ao `TimeBlockItem`.
  - Ficheiros: `src/renderer/views/TimelineView.tsx` (ou onde estiver).
  - **Verificação**: `npm run typecheck`.

- [ ] **T6.3** — Garantir que existe `<Toast />` controlado no parent (TimelineView ou DayView) com estado local `[toast, setToast]`. Se já houver toast machinery, reusar; senão adicionar `useState` e renderizar `<Toast visible={!!toast} message={toast?.message ?? ''} onClose={() => setToast(null)} />`.
  - **Verificação**: visual em dev.

### 7. Verificação manual end-to-end

- [ ] **T7.1** — `rm -rf out/renderer/` (regra do CLAUDE.md sobre stale builds) e `npm run dev`.

- [ ] **T7.2** — **Fluxo simples (encolher)**: bloco 09:00–10:00 + 2 tarefas estimadas total 45min → fit → bloco 09:00–09:45.

- [ ] **T7.3** — **Fluxo simples (expandir)**: bloco 09:00–09:30 + tarefas total 90min, sem bloco à frente → fit → bloco 09:00–10:30.

- [ ] **T7.4** — **Clamp next-block**: bloco A 09:00–09:30 com 90min de estimativas + bloco B 10:00–11:00 → fit em A → A 09:00–10:00 + toast com 30min de overflow.

- [ ] **T7.5** — **Clamp min-duration**: bloco com 1 tarefa de 5min → fit → bloco fica 15min + toast informativo.

- [ ] **T7.6** — **No-op**: bloco já alinhado com soma → fit → sem alteração visual e sem toast.

- [ ] **T7.7** — **Visibilidade do botão**: confirmar que NÃO aparece em (a) bloco sem tarefas, (b) bloco com tarefas todas sem `estimatedMinutes`, (c) bloco `untimed` na vista de projetos, (d) bloco vindo de Google Calendar com `isGoogleReadOnly: true`.

- [ ] **T7.8** — **Regra anti-double-count**: tarefa com estimativa 30min + 2 subtasks (10min + 15min) → soma usa subtasks (25min), não 55min.

- [ ] **T7.9** — **Persistência MD**: abrir `~/Library/Mobile Documents/.../Bloc-Dev/<data>.md` (ou `~/Bloc/<data>.md` em produção) após T7.2 e confirmar que a hora final do bloco bate com o que está na UI.

- [ ] **T7.10** — **Paridade MCP**:
  - Reiniciar servidor MCP (`cd mcp-server && npm run build && reload`).
  - Invocar `fit_time_block(date, block_id)` para um bloco com clamping `next-block`.
  - Confirmar que (a) o `.md` reflecte a mesma alteração que a UI faria, (b) o texto retornado menciona o overflow.
  - Repetir para os ramos `none` e `min-duration`.

- [ ] **T7.11** — **Type-check final**: `npm run typecheck` no root e em `mcp-server/`.

### 8. Wrap-up

- [ ] **T8.1** — Actualizar headers dos 3 ficheiros (`spec.md`, `plan.md`, `tasks.md`) para `**Status**: done`.
- [ ] **T8.2** — Resumir ao utilizador o que foi entregue + cenários verificados. **Não fazer commit sem ser pedido.**
