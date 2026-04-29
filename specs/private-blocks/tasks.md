---
name: Private Blocks — Tasks
description: Decomposição do plan em tarefas executáveis na ordem schema → MCP → stores → IPC → sync → UI → verificação
type: tasks
---

# Blocos Privados — Tasks

**Status**: done
**Plan**: ./plan.md

## Ordem de execução

> Regra: schema MD primeiro, depois MCP + storage helpers, depois stores, depois IPC, depois sync, depois UI. **Nunca quebrar paridade entre renderer e MCP** — qualquer mudança ao serializer/parser do timeblock toca `src/main/services/markdownSerializer.ts` E `mcp-server/src/markdown.ts` no mesmo commit.

### 1. Schema & types partilhados (paridade renderer↔MCP)

- [x] **T1.1** — Adicionar `private?: boolean` ao interface `TimeBlockData` nos dois ficheiros: `src/main/services/markdownSerializer.ts` e `mcp-server/src/markdown.ts`. **Verificação**: `tsc --noEmit` em ambos os roots não regride.

- [x] **T1.2** — Estender `serializeTimeBlock` em ambos os ficheiros para emitir ` @private:true` no final do meta-comment quando `b.private === true`. Omitir quando falsy. **Verificação**: serializar um bloco com `private: true` deve produzir uma linha que contém `@private:true`; serializar sem o campo não muda o output.

- [x] **T1.3** — Estender `parseTimeBlockLine` em ambos os ficheiros para ler `meta.private === 'true'` → `private: true`. Quando ausente, deixar `private` undefined (não escrever `false`, para preservar minimalidade no round-trip). **Verificação**: round-trip de um MD pré-feature (sem `@private`) reproduz o ficheiro byte-a-byte; round-trip de um MD com `@private:true` mantém a flag.

### 2. MCP server

- [x] **T2.1** — Adicionar parâmetro `private: z.boolean().optional().describe('Marca o bloco como privado. Quando true, ao sincronizar com o Google Calendar o evento aparece como visibility=private.')` à definição de `create_time_block` em `mcp-server/src/index.ts:347`. No corpo, atribuir `private: private_param || undefined` no objecto `block` (renomear o destructure se necessário, já que `private` é palavra reservada). **Verificação**: chamar a tool com `private: true` produz `@private:true` no MD; sem o param, o MD fica idêntico ao formato actual.

- [x] **T2.2** — Adicionar o mesmo parâmetro opcional a `update_time_block` (`mcp-server/src/index.ts:443`). Aplicar `if (privateParam !== undefined) block.private = privateParam || undefined`. **Verificação**: actualizar bloco com `private: false` remove o tag do MD; com `private: true` adiciona-o; sem o param, deixa o estado anterior.

- [x] **T2.3** — Confirmar que a tool `read_day` mostra a flag de privacidade ao chamador. Procurar em `mcp-server/src/index.ts` se há formatação custom da resposta de blocks (em vez de devolver `data.timeBlocks` cru); se houver, incluir `[privado]` ou `🔒` discreto no título do bloco listado. **Verificação**: chamar `read_day` num dia com bloco privado retorna texto que sinaliza a privacidade.

- [x] **T2.4** — Build do MCP: `cd mcp-server && npm run build`. **Verificação**: compila sem erros TypeScript.

### 3. Stores Zustand (renderer)

- [x] **T3.1** — Adicionar `private?: boolean` ao interface `TimeBlock` em `src/renderer/stores/timeBlockStore.ts`. **Verificação**: TypeScript reconhece o campo.

- [x] **T3.2** — Alargar o tipo de `updates` em `updateBlock` (linha 29 e linha 65) de `Partial<Pick<TimeBlock, 'startTime' | 'endTime' | 'title' | 'color'>>` para `Partial<Pick<TimeBlock, 'startTime' | 'endTime' | 'title' | 'color' | 'private'>>`. **Verificação**: `npm run typecheck` (ou `npm run build`) — esperar erros propagados em `TimeBlockItem.onUpdate`, `TimelineGrid.onUpdate`, `handleUpdate` em `TimelineView`. Estes serão corrigidos em T6.x.

### 4. IPC main↔renderer

- [x] **T4.1** — Em `src/main/services/googleCalendar.ts`: adicionar `visibility?: string` ao interface `GoogleCalendarEvent` (linha 5). Estender os parâmetros de `createEvent` e `updateEvent` para aceitar `visibility?: 'private' | 'public' | 'default'`. **Verificação**: tipos compilam.

- [x] **T4.2** — Em `src/main/ipc/googleCalendarHandlers.ts`: alargar o tipo do `eventData` em `gcal:create-event` e `gcal:update-event` para incluir `visibility?: string`. **Verificação**: `npm run build` no root passa.

### 5. Sync bidireccional (renderer service)

- [x] **T5.1** — Em `src/renderer/services/googleCalendarSync.ts`: adicionar `visibility?: string` ao interface local `GCalEvent` (linha 7). **Verificação**: tipos compilam.

- [x] **T5.2** — `eventToTimeBlock` (linha 50): no objecto retornado adicionar `private: event.visibility === 'private' || event.visibility === 'confidential' ? true : undefined`. **Verificação**: pull de evento gcal privado cria bloco com flag activa.

- [x] **T5.3** — `pullEventsFromGcal`, ramo `existing` (linha 190): incluir `private: event.visibility === 'private' || event.visibility === 'confidential' ? true : undefined` no `.map(...)` que actualiza o bloco. **Verificação**: alternar privacidade num evento existente no gcal propaga ao bloco no próximo pull.

- [x] **T5.4** — `pushLocalBlocksToGcal` (linha 69): no payload de `createEvent`, adicionar `visibility: block.private ? 'private' : 'default'`. **Verificação**: criar bloco privado sem `googleEventId` e correr sync → evento criado no gcal com Visibilidade: Privado.

- [x] **T5.5** — `pushUpdatedBlocksToGcal` (linha 100): adicionar `visibility: block.private ? 'private' : 'default'` no payload de `updateEvent`. **Verificação**: alterar título E privacidade num bloco já sincronizado → sync periódico actualiza ambos no gcal.

- [x] **T5.6** — Reactive push (linha 365): adicionar `visibility: block.private ? 'private' : 'default'` no payload de `updateEvent`. **Verificação**: alternar toggle de privacidade na UI → ≤2s depois o gcal reflecte a mudança.

### 6. UI / componentes

- [x] **T6.1** — `src/renderer/components/TimeBlockItem.tsx`: importar `Lock` de `lucide-react`. Adicionar render condicional do ícone na top-right do bloco quando `block.private`, alinhado com o existente `CalendarSync` (separar com pequeno gap). Cor `text-text-muted/60`, `size={10}`, com `title="Privado"`. **Verificação**: bloco privado mostra cadeado discreto na timeline; bloco público não.

- [x] **T6.2** — `src/renderer/views/TimelineView.tsx`, `DetailBlockHeader` (linha 43):
  - Estender o tipo de `onUpdate` para `Partial<Pick<TimeBlock, 'startTime' | 'endTime' | 'title' | 'private'>>`.
  - Adicionar à direita do bloco de horas (depois dos inputs de tempo, antes do fim do flex container) um botão pequeno com `Lock` (Lucide). Toggled state ↔ `block.private`. Click chama `onUpdate({ private: !block.private })`.
  - Visual: `Lock size={14}`, classe `text-rose-500` quando activo, `text-text-muted/40` quando inactivo. `title={block.private ? 'Privado' : 'Público'}`. Padding/bg consistente com o estilo dos inputs adjacentes.
  - **Verificação**: clicar no toggle no detail view alterna o cadeado na timeline imediatamente; o `DetailBlockHeader` reflecte o estado atual quando se entra no detail.

- [x] **T6.3** — Confirmar que `handleUpdate` em `TimelineView` (linha 418) e `onUpdate` em `TimelineGrid` propagam `private` (deve só ser uma questão de tipo após T3.2 — sem alteração de runtime). **Verificação**: `npm run build` no root limpa todos os erros.

### 7. Verificação manual end-to-end

- [ ] **T7.1** — `npm run dev`. Criar bloco novo, marcar privado pelo toggle no detail view, voltar à timeline → cadeado visível.

- [ ] **T7.2** — Abrir o ficheiro `~/Library/Mobile Documents/com~apple~CloudDocs/Bloc-Dev/<YYYY>/<YYYY-MM-DD>.md` (ou caminho do iCloud configurado). Confirmar `@private:true` na linha do bloco em `## Blocos de Tempo`.

- [ ] **T7.3** — Reiniciar a app. Cadeado e estado privado persistem.

- [ ] **T7.4** — Com gcal sync ligado: marcar bloco privado, esperar ≤5s. Abrir o evento no Google Calendar web → "Visibilidade: Privado".

- [ ] **T7.5** — No Google Calendar web, criar evento privado para hoje. Forçar sync no Bloc (re-entrar no dia ou esperar 5min). Bloco aparece com cadeado.

- [ ] **T7.6** — Desligar privacidade no Bloc → após ≤5s, evento gcal volta a `Visibilidade: Default`.

- [ ] **T7.7** — Via cliente MCP: `create_time_block` com `private: true` num slot livre. Recarregar a UI do Bloc → bloco aparece com cadeado. MD do dia contém `@private:true`.

- [ ] **T7.8** — `update_time_block` via MCP com `private: false`. Recarregar UI → cadeado some, MD perde o tag.

- [ ] **T7.9** — Round-trip de MD pré-feature: abrir um dia antigo (sem `@private` em nenhum bloco), guardar (alterar e reverter um bloco para forçar serialize) → diff do ficheiro deve ser vazio.
