---
**Status**: done
**Spec**: ./spec.md
---

# Melhoria na Gestão de Tarefas — Plano técnico

## Resumo da abordagem

Mantemos a interface `TimeBlock` actual mas introduzimos a noção de **bloco "sem instância"** — um bloco com `id`, `title`, `color` mas sem `date`/`startTime`/`endTime`. Estes blocos vivem num ficheiro novo `~/Bloc/blocks.md` (raiz da iCloud, fora das pastas YYYY/). Tarefas ligadas a um bloco sem instância usam o storeKey `__block__<uuid>` (sem prefixo de data). A view "Tarefas" passa a agrupar **por título de bloco** (cross-date), unindo automaticamente tarefas de instâncias datadas e do bloco sem instância — exactamente o comportamento "como se fosse uma tag" que o utilizador descreveu.

## Layer 1 — Schema Markdown (iCloud)

### Ficheiro novo: `~/Bloc/blocks.md`

Vive na raiz da pasta Bloc (não dentro de `YYYY/`). Schema:

```markdown
## Blocos

- Login feature <!--@id:abc-123 @color:indigo @created:1730000000000 @updated:1730000000000-->
- API auth <!--@id:def-456 @color:emerald @created:1730000000000 @updated:1730000000000-->

### Bloco: Login feature <!--@blockId:abc-123-->

- [ ] Refactor session middleware <!--@id:t1-->
- [ ] Add logout button <!--@id:t2-->

### Bloco: API auth <!--@blockId:def-456-->

- [ ] Choose JWT vs session <!--@id:t3-->
```

- Secção `## Blocos`: lista de blocos sem instância (mesma sintaxe de meta dos blocos de tempo, mas **sem** `@start`/`@end`/`@date`).
- Secções `### Bloco: <title>`: idênticas às dos day files — tarefas pertencentes ao bloco.
- O parser tolera ausência de qualquer secção (ficheiro vazio = sem blocos).

### Migração

- Ficheiros antigos não mudam — mantêm o seu schema. Continuam a parsear inalterados.
- Ausência de `blocks.md` é um estado válido (sem blocos sem instância).
- Não há campos novos em ficheiros existentes.

> Mudança ao schema MD obriga a actualizar **renderer + MCP em paralelo** (ver Layer 4).

## Layer 2 — Stores Zustand (renderer)

### `timeBlockStore` — alterações

**Estado novo**:
```ts
untimedBlocks: TimeBlock[]   // blocks sem date/startTime/endTime
```

**`TimeBlock` interface**: `date`, `startTime`, `endTime` continuam `string`/`number` mas para blocos sem instância são preenchidos com sentinelas (`date: ''`, `startTime: 0`, `endTime: 0`). Adiciona-se a flag opcional `untimed?: true` para discriminar inequivocamente em runtime.

**Acções novas**:
```ts
addUntimedBlock: (input: { title: string; color: TimeBlockColor }) => string  // returns id
updateUntimedBlock: (id: string, updates: { title?: string; color?: TimeBlockColor }) => void
removeUntimedBlock: (id: string) => void  // (out of UI scope, mas existe para MCP)
```

**Persistência**: `untimedBlocks` entra no `persist()` (mesmo nome existente `'bloc-timeblocks'`, bump version `2 → 3` com migration que define `untimedBlocks: []` para state v2).

**Selectors derivados**:
```ts
getBlockById(id: string): TimeBlock | null         // procura em blocks[*][*] e untimedBlocks
getBlocksByTitle(title: string): TimeBlock[]       // todas as instâncias com mesmo título (case-sensitive, trimmed)
```

### `taskStore` — alterações

**Storekey detection**: o split actual `storeKey.includes('__block__')` continua a funcionar; o lado esquerdo pode ser vazio quando é `__block__<uuid>`. Caso especial: `originDate = ''` significa "bloco sem instância".

**Acção `addTask` aceita storeKey vazio em forma `__block__<uuid>`** (já é compatível, nada a mudar).

**Selector novo** — `getTasksGroupedByBlockTitle()`:
```ts
interface BlockGroup {
  blockId: string | null         // null para "Sem bloco"
  title: string                  // "Sem bloco" para órfãs
  color: TimeBlockColor | null   // null para "Sem bloco"
  isUntimed: boolean             // só untimed (não tem instância calendário)
  isMixed: boolean               // tem instâncias datadas + untimed (já unidos)
  items: TaskHit[]
}

interface TaskHit {
  task: Task
  storeKey: string
  date: string | null            // null para untimed-block tasks
  blockInstanceId: string | null // uuid da instância (datada) ou do untimed
}

getTasksGroupedByBlockTitle(): BlockGroup[]
```

**Lógica do selector**:
1. Para cada storeKey em `tasks`:
   - `BACKLOG_KEY` → grupo "Sem bloco"
   - `YYYY-MM-DD` (sem `__block__`) → grupo "Sem bloco"
   - `YYYY-MM-DD__block__<uuid>` → resolve título via `timeBlockStore.getBlockById(uuid)`; agrupa por título
   - `__block__<uuid>` → resolve via `untimedBlocks`; agrupa por título
2. Para cada bloco em `untimedBlocks` SEM tarefas → grupo vazio (header com 0 contagem) — para garantir que blocos recém-criados aparecem sem tarefas.
3. Cor do grupo: primeira instância encontrada (ordem determinística por `createdAt`).
4. Filtra `completed`/`wontDo` da contagem do header (mas itens podem aparecer se `showCompleted=true`).
5. Ordem dos grupos: alfabética por `title.toLowerCase()`, "Sem bloco" sempre último.

## Layer 3 — IPC main↔renderer

### Handlers novos

```ts
icloud:read-blocks   → () => BlocksFileData | null
icloud:write-blocks  → (data: BlocksFileData) => void
```

`BlocksFileData`:
```ts
{
  untimedBlocks: TimeBlock[]    // sem date/startTime/endTime (ou com sentinelas)
  tasks: Record<string, Task[]> // storeKeys no formato `__block__<uuid>`
}
```

**Watch**: o watcher iCloud existente (poll 3s) precisa de incluir `blocks.md` — extender `listFilesToWatch` ou registar separadamente.

**Eventos push**: `icloud:blocks-changed` (parallel ao `icloud:day-changed`).

### `icloud.ts` — novas funções

```ts
getBlocksFilePath(): string   // raiz da Bloc, "blocks.md"
readBlocksFile(): Promise<string | null>
writeBlocksFile(content: string): Promise<void>
```

**Permissões**: nenhuma alteração — mesmo escopo de FS já existente.

## Layer 4 — MCP server (`mcp-server/`)

**Regra**: paridade obrigatória com o renderer.

### `mcp-server/src/markdown.ts`

- Adicionar `BlocksFileData` interface.
- `serializeBlocks(data: BlocksFileData): string` — serializa `## Blocos` + `### Bloco: …`.
- `deserializeBlocks(content: string): BlocksFileData` — parse tolerante.
- Reutilizar helpers existentes onde possível (parseTaskLine, etc.).

### `mcp-server/src/storage.ts`

- `getBlocksFilePath()`, `readBlocks()`, `writeBlocks(data)`.

### `mcp-server/src/index.ts` — tools novas

```ts
create_block({ title, color? })            → { id }   // untimed
list_blocks()                              → { blocks: [{ id, title, color, taskCount }] }
delete_block({ id })                       → {}        // só untimed; rejeita se id corresponder a bloco com instância
```

**Tools afectadas (filtro)**:
- `list_pending_tasks` deve incluir tarefas dos `__block__<uuid>` storeKeys (untimed blocks). Verificar que iteração actual sobre `tasks` já as apanha (sim, é só loop sobre keys).

**Validação**:
- `create_block`: `title` não-vazio (após trim), `color` válida (default `indigo`).
- Não há overlap-check (não há tempo).

## UI / componentes

### Componentes alterados

**`src/renderer/views/InboxView.tsx`** — `TasksTab`:
- Substitui o `useMemo` que agrupa por data por uma chamada a `useTaskStore.getTasksGroupedByBlockTitle()` (com `useMemo([tasks, untimedBlocks, allBlocks])` por causa do problema de selector que apanhámos no MigratePhase).
- Renderiza grupos com header (color dot + título + contagem) + lista de tarefas + acção "Adicionar tarefa".
- Cada item de tarefa mostra um pequeno label de data (se existir) à direita.
- Botão "Criar bloco" no topo abre modal.
- Backlog `TaskEditor` continua no topo (decisão: mantemos para criação rápida sem bloco) — alternativa é absorver no grupo "Sem bloco". **Decisão**: mantemos por agora; revisitar se feedback indicar redundância.

**`src/renderer/components/EditableTaskRow.tsx`**: sem alterações estruturais. Mas precisa de saber renderizar tasks num bloco untimed (storeKey sem data) — confirmar que actions actuais funcionam (toggleTask aceita storeKey arbitrário, nada a mudar).

### Componentes novos

**`src/renderer/components/CreateBlockModal.tsx`**:
- Mini-diálogo: input de título (autofocus) + `ColorPicker` (reutilizar componente existente em `src/renderer/components/ColorPicker.tsx`).
- Validação client-side: título não-vazio (após trim).
- Ao confirmar: `timeBlockStore.addUntimedBlock({ title, color })` → fecha modal → grupo aparece.
- Cancelar: ESC ou clicar fora.

**`src/renderer/components/review/`** (não): nada a mudar lá.

### UI fluxo "Adicionar tarefa" dentro de grupo

- Cada grupo (incluindo "Sem bloco" e blocos sem instância) tem um botão "+ Adicionar tarefa" no fim.
- Click → renderiza inline um input (não modal) — reutiliza `TaskEditor` ou um wrapper minimalista que apenas chama `taskStore.addTask(storeKey, text)`.
- StoreKey usado:
  - Bloco com instâncias datadas mas SEM untimed: precisa de escolher uma instância. **Decisão**: para blocos com múltiplas instâncias datadas e sem untimed correspondente, criar uma tarefa pede um destino — mas isto é fora de escopo deste v1. Solução pragmática: se um título tem só instâncias datadas, "Adicionar tarefa" cria primeiro um bloco untimed com esse título + cor e atribui a tarefa lá. (Cria-se a "ponte" automaticamente.)
  - Bloco com instância untimed: usa `__block__<untimedId>`.
  - "Sem bloco" → backlog (`BACKLOG_KEY`).

> **Esta decisão é importante**: garante que adicionar tarefa nunca falha por ambiguidade. Funciona porque o agrupamento é por título — qualquer untimed block contribui para o mesmo grupo.

### Atalhos / tray / menus

- Sem alterações.

### Estados de loading / erro / vazio

- Estado vazio do tab Tarefas: já existe (placeholder do TaskEditor backlog). Não muda.
- Bloco sem tarefas: header visível, lista vazia, ainda mostra "+ Adicionar tarefa".

## Verificação

### Manual

1. `npm run dev` arranca app.
2. Abrir Inbox → tab Tarefas → confirmar que tarefas existentes aparecem agrupadas por título de bloco (não por data).
3. Tarefas standalone (com data, sem bloco) e backlog → grupo "Sem bloco" no fim.
4. Clicar "Criar bloco" → modal → título "Test Project" + cor → confirmar.
5. Novo grupo aparece imediatamente, vazio.
6. "Adicionar tarefa" → input → escrever → enter → tarefa aparece no grupo.
7. Confirmar `~/Library/Mobile Documents/.../Bloc-Dev/blocks.md` existe e contém o bloco + tarefa no formato esperado.
8. Ir ao calendário, criar bloco em 2026-05-04 com título "Test Project" → adicionar tarefa "Calendar task".
9. Voltar ao tab Tarefas → confirmar que ambas as tarefas aparecem no mesmo grupo "Test Project".
10. Toggle "Mostrar concluídas" — confirmar que filtra correctamente.
11. Invocar tool MCP `create_block { title: "MCP Project", color: "rose" }` → confirmar que aparece no renderer (após poll iCloud 3s).
12. Invocar `list_blocks` → vê os blocos.

### Automatizada

- Não há testes unitários no projecto. Build limpo (`npx electron-vite build` + `cd mcp-server && npm run build`) é o gate mínimo.

## Riscos e alternativas

- **Risco — divergência renderer/MCP no parser de `blocks.md`**: mitigação — `mcp-server/src/markdown.ts` espelha 1:1 o renderer; ambos buildam após qualquer mudança.
- **Risco — múltiplas instâncias do mesmo título com cores diferentes**: prevalece a primeira encontrada (ordem determinística por `createdAt`). Documentar; tornar consistente é fora de escopo.
- **Risco — tarefas órfãs em untimed block após "delete" no MCP**: `delete_block` para untimed deve apagar também as suas tarefas. Documentar no contrato da tool.
- **Alternativa rejeitada — refactor profundo**: tornar `date`/`startTime`/`endTime` opcionais em `TimeBlock`. Rejeitada por afectar muita UI (calendário, drag, gcal sync); usar sentinelas `''`/`0` + flag `untimed` é ortogonal e backwards-compatible.
- **Alternativa rejeitada — identidade do bloco por UUID partilhado**: ao criar instância no calendário, copiar o UUID do untimed. Rejeitada porque exigiria UI de "associar bloco existente" no calendário e migração para tarefas — mais complexa que agrupar visualmente por título.
