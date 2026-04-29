---
name: Private Blocks — Plano técnico
description: Plano técnico para flag de privacidade em time blocks com sync bidireccional ao Google Calendar
type: plan
---

# Blocos Privados — Plano técnico

**Status**: done
**Spec**: ./spec.md

## Resumo da abordagem

Adicionar um campo opcional `private?: boolean` ao tipo `TimeBlock` (renderer + main + MCP). Persistido no markdown como meta-tag `@private:true` (omitida quando `false`/`undefined`, no mesmo estilo de `@gcalReadOnly`). No push, mapeado para `visibility: "private"` no Google Calendar; no pull, eventos com `visibility: "private"` (ou `confidential`) tornam-se blocos privados. UI: toggle no `DetailBlockHeader` + ícone de cadeado em `TimeBlockItem`. O fluxo reactivo de push existente já propaga via `updatedAt` — basta abrir a porta para `private` em `updateBlock` e nas mutações da reactive sync.

## Layer 1 — Schema Markdown (iCloud)

- **Mudança ao formato**: nova meta-tag opcional `@private:true` em linhas de bloco da secção `## Blocos de Tempo`. Omitida quando `false`/`undefined` para manter ficheiros antigos visualmente inalterados.
- **Migração**: nenhuma migração escrita necessária. Ficheiros antigos não têm `@private` → desserializam como `private: undefined` (= público). Round-trip preserva ficheiros pré-feature byte-a-byte (mesmo padrão de `@gcalId`/`@gcalReadOnly`).
- **Exemplo**:
  ```markdown
  ## Blocos de Tempo

  - Sessão terapia <!--@id:abc123 @start:900 @end:960 @color:rose @created:1714300000000 @updated:1714300000000 @private:true-->
  - Stand-up equipa <!--@id:def456 @start:570 @end:600 @color:indigo @created:1714300000000 @updated:1714300000000-->
  ```

## Layer 2 — Stores Zustand (renderer)

- **Stores tocadas**: `useTimeBlockStore` (`src/renderer/stores/timeBlockStore.ts`).
- **Estado novo**: campo `private?: boolean` em `TimeBlock` interface.
- **Acções alteradas**:
  - `addBlock` — assinatura aceita `private` no objecto inicial (já é spread, basta tipar). Default permanece omitido (público).
  - `updateBlock` — alargar o tipo de `updates` de `Partial<Pick<TimeBlock, 'startTime' | 'endTime' | 'title' | 'color'>>` para incluir `'private'`. **Isto também obriga a actualizar a assinatura de `TimeBlockItem.onUpdate`, `TimelineGrid.onUpdate`, `handleUpdate` em `TimelineView`.**
  - `setBlocksForDate` — sem alteração (passa array completo).
- **Persistência**: o store usa `persist()` com versão 2. **Não é preciso bump de versão** — o campo é opcional e ausente em dados antigos é equivalente a público. Adicionar passo no `migrate` para v3 só se quisermos defaults explícitos; preferir não.
- **Selectors / derivados**: nenhum novo. Os componentes lêem `block.private` directamente.

## Layer 3 — IPC main↔renderer

- **Tipos partilhados**:
  - `src/main/services/markdownSerializer.ts` → `TimeBlockData` ganha `private?: boolean`. `serializeTimeBlock` adiciona `if (b.private) meta += ' @private:true'`. `parseTimeBlockLine` faz `private: meta.private === 'true' || undefined` (undefined em vez de false para manter ficheiros minimalistas no round-trip).
  - `src/main/services/googleCalendar.ts` → `GoogleCalendarEvent` ganha `visibility?: string`. `createEvent` e `updateEvent` aceitam `visibility?: 'private' | 'public' | 'default'` no payload (passthrough literal — Google API aceita esses valores).
- **Handlers IPC**: `gcal:create-event` e `gcal:update-event` em `src/main/ipc/googleCalendarHandlers.ts`. Os tipos do `eventData` já incluem campos opcionais — alargar para incluir `visibility?: string`. (No preload, `eventData: any` já não bloqueia.)
- **Eventos push**: nenhum novo evento main→renderer. O fluxo de pull continua a usar a resposta de `gcal:list-events`, que já passa o evento por inteiro — basta começar a ler `event.visibility`.
- **Permissões / capacidades do main process**: sem alterações (apenas chamadas adicionais à mesma API Google).

## Layer 4 — MCP server (`mcp-server/`)

**Regra de paridade**: `mcp-server/src/markdown.ts` é cópia textual de `src/main/services/markdownSerializer.ts`. Toda a alteração ao serializer/parser do timeblock TEM de ser aplicada nos dois ficheiros no mesmo passo. O `TimeBlockData` interface também duplica e tem de ganhar o campo `private`.

- **Tools afectadas**:
  - `create_time_block` (`mcp-server/src/index.ts:347`) — adicionar parâmetro Zod `private: z.boolean().optional().describe('Marca o bloco como privado. Quando true, ao sincronizar com o Google Calendar o evento aparece como visibility=private.')`. Atribuir `block.private = private || undefined` antes de `writeDay`.
  - `update_time_block` (`mcp-server/src/index.ts:443`) — mesmo parâmetro `private` opcional. Aplicar `if (private !== undefined) block.private = private || undefined` (omitir do MD quando explicitamente `false`).
  - `read_day` — retorna `data.timeBlocks` directamente; o campo passa naturalmente ao chamador. **Confirmar que a representação textual de leitura não esconde o campo** (ler o helper que formata a resposta — se pintar blocks à mão, incluir `[privado]` na linha).
- **Storage helpers**: `mcp-server/src/storage.ts` lê e escreve `DayFileData` via `serialize`/`deserialize`. Sem mudanças — herda automaticamente o campo novo.

## UI / componentes

- **`src/renderer/components/TimeBlockItem.tsx`**:
  - Importar `Lock` do `lucide-react` (lib já em uso — vide `Palette`, `Trash2`).
  - No mesmo nicho onde aparece o `CalendarSync` (top-right), adicionar `Lock` size 10 quando `block.private`. Posicionar à esquerda do gcal sync se ambos presentes (ex.: `right-1.5` para gcal, `right-5` para cadeado, ou render condicional num pequeno wrapper flex). Cor: `text-text-muted/60` para discrição.
  - **Nada mais muda** — título e cores ficam intactos no Bloc do utilizador (decisão do spec).

- **`src/renderer/views/TimelineView.tsx` — `DetailBlockHeader` (linha 43)**:
  - Estender `onUpdate` prop type para incluir `private`.
  - Adicionar à direita do bloco de horas um pequeno toggle/botão `Lock` (Lucide). Estado pressed ↔ `block.private`. Click → `onUpdate({ private: !block.private })`.
  - Visual: ícone `Lock` com `text-rose-500` quando activo, `text-text-muted/40` quando inactivo. Tooltip: "Privado" / "Público" (pt). Manter a métrica visual da header (gap-3, shrink-0).

- **(Optional, fora de scope estrito)** Right-click ou atalho na timeline — **não fazer**. O spec só pede toggle no editor + popover/edição inline. O `DetailBlockHeader` cobre os dois (vista detail é o que aparece ao clicar).

- **Estados de loading / erro / vazio**: nenhum (mudança síncrona).

## Sync bidireccional — comportamento exacto

`src/renderer/services/googleCalendarSync.ts`:

1. **`GCalEvent` interface (linha 7)** — adicionar `visibility?: string`.
2. **`eventToTimeBlock` (linha 50)** — quando montar o bloco, adicionar `private: event.visibility === 'private' || event.visibility === 'confidential' ? true : undefined`. (Tratar `confidential` como sinónimo defensivamente — alguns clientes legacy usam.)
3. **`pullEventsFromGcal` (linha 140)** — no ramo `existing` (linha 190), quando o evento gcal é mais recente, propagar também a flag: `private: event.visibility === 'private' || event.visibility === 'confidential' ? true : undefined`. Se o utilizador tirou a privacidade no gcal, ela deve cair no Bloc também.
4. **`pushLocalBlocksToGcal` (linha 69)** — no payload `createEvent`, adicionar `...(block.private ? { visibility: 'private' as const } : {})`.
5. **`pushUpdatedBlocksToGcal` (linha 100)** — mesma adição no `updateEvent` payload. **Sempre enviar o campo** (`visibility: block.private ? 'private' : 'default'`) para que tirar a privacidade no Bloc reverta o estado no gcal — usar PATCH explícito.
6. **Reactive push (linha 365)** — mesma adição no `updateEvent` payload aqui também.
7. **Detecção de mudanças**: o reactive push compara `updatedAt`. Como `updateBlock` no store bumpa `updatedAt`, alterar `private` via UI desencadeia push automaticamente. **Não precisa de listener novo.**

## Verificação

### Manual

1. **MD round-trip**:
   - `npm run dev`
   - Criar bloco, marcar como privado pelo toggle no detail view
   - Verificar `~/Library/Mobile Documents/.../Bloc-Dev/<hoje>.md` contém `@private:true`
   - Reiniciar app — o cadeado continua na timeline.

2. **Push**:
   - Com gcal sync ligado, marcar bloco como privado.
   - Esperar ≤2s (debounce reactive). No Google Calendar web, abrir o evento → "Visibilidade: Privado".

3. **Pull**:
   - No Google Calendar web, criar evento com Visibilidade: Privado para hoje.
   - Forçar sync (esperar 5min ou re-entrar no dia).
   - O bloco aparece com cadeado.

4. **Toggle off**:
   - Desligar privacidade pelo toggle.
   - Verificar que o evento no gcal volta a `visibility: default`.
   - Verificar que `@private:true` desapareceu do MD.

5. **MCP**:
   - Via cliente MCP: `create_time_block` com `private: true` → confirmar `@private:true` no MD e cadeado na UI após reload.
   - `update_time_block` com `private: false` → confirmar remoção do tag e do cadeado.

### Automatizada

- Build: `cd mcp-server && npm run build` deve passar com novos campos.
- `npm run typecheck` (root) — confirmar que extensão de `Partial<Pick<...>>` em `updateBlock` tipa propagadamente em `TimeBlockItem`/`TimelineGrid`/`TimelineView`.

## Riscos e alternativas

- **Risco — paridade MCP↔renderer**: se actualizar só um dos `markdown.ts`, ficheiros escritos por um corrompem o outro (perdem o campo no round-trip). **Mitigação**: tarefa única em `tasks.md` que toca os dois ficheiros — proibido fazer commit parcial.

- **Risco — last-write-wins na privacidade**: se o utilizador alterar o flag no Bloc e no gcal entre syncs, o pull (mais recente em `updated`) ganha. Aceitável, é o comportamento de todos os outros campos.

- **Risco — visibilidade `confidential` em alguns clientes**: tratamos como sinónimo de `private` no pull. Não usamos `confidential` no push (só `private`). Aceitável — semântica do gcal é virtualmente idêntica.

- **Alternativa rejeitada — sufixo `🔒` no título no MD**: visualmente fofinho, mas obriga a parser tolerante e estraga round-trip se o utilizador editar o MD à mão. Meta-tag `@private:true` é mais robusto e consistente com `@gcalReadOnly`.

- **Alternativa rejeitada — substituir título por "Privado" na timeline**: descartada pelo spec. Mantemos título visível para o utilizador.

- **Alternativa rejeitada — setting global "tudo privado por defeito"**: explicitamente fora de scope no spec.
