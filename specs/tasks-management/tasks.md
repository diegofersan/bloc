---
**Status**: done
**Plan**: ./plan.md
---

# Melhoria na Gestão de Tarefas — Tasks

## Ordem de execução

> Regra: schema MD primeiro (renderer + MCP em paralelo), depois MCP storage/tools, depois stores, depois IPC, depois UI. Paridade renderer↔MCP é obrigatória — qualquer mudança de markdown afecta ambos no mesmo passo.

### 1. Schema & types partilhados

- [ ] **T1.1** — Adicionar `untimed?: boolean` ao tipo `TimeBlockData` em `shared/types.ts` + nova interface `BlocksFileData { untimedBlocks: TimeBlockData[]; tasks: Record<string, TaskData[]> }`. · ficheiros: `shared/types.ts` · verificação: `cd mcp-server && npm run build` (re-sincroniza shared) sem erros.

- [ ] **T1.2** — Renderer markdown: adicionar `serializeBlocksFile(data: BlocksFileData): string` e `parseBlocksFile(content: string): BlocksFileData` em `src/main/services/markdownSerializer.ts`. Tolera ficheiro vazio. Reutiliza helpers existentes (`serializeTask`, `parseTaskLine`, etc.). · ficheiro: `src/main/services/markdownSerializer.ts` · verificação: round-trip mental: serializar `{ untimedBlocks: [{id:'x',title:'A',color:'indigo',...}], tasks: {'__block__x':[...]}}` → parse → igual ao input.

- [ ] **T1.3** — MCP markdown (paridade 1:1): mesmas funções `serializeBlocksFile` / `parseBlocksFile` em `mcp-server/src/markdown.ts`. · ficheiro: `mcp-server/src/markdown.ts` · verificação: `cd mcp-server && npm run build` sem erros; output das duas funções (renderer + MCP) deve ser byte-equivalente para o mesmo input.

### 2. MCP server (storage + tools)

- [ ] **T2.1** — Storage helpers em `mcp-server/src/storage.ts`: `getBlocksFilePath()` (raiz da iCloud, `blocks.md`), `readBlocksFile(): Promise<BlocksFileData | null>`, `writeBlocksFile(data: BlocksFileData): Promise<void>`. · ficheiro: `mcp-server/src/storage.ts` · verificação: build clean.

- [ ] **T2.2** — MCP tool `create_block({ title, color? })` → `{ id }`. Validações: trim title, não-vazio; color válida (default `indigo`); read-modify-write atómico no `blocks.md`. · ficheiro: `mcp-server/src/index.ts` · verificação: tool registada + build clean.

- [ ] **T2.3** — MCP tool `list_blocks()` → `{ blocks: [{ id, title, color, taskCount }] }`. Lê apenas o ficheiro `blocks.md` (não enumera dated blocks). · verificação: tool registada.

- [ ] **T2.4** — MCP tool `delete_block({ id })` → `{}`. Valida que `id` existe nos `untimedBlocks` (rejeita se não existir, ou se for um id de bloco datado). Apaga o bloco e as suas tarefas em `__block__<id>`. · verificação: tool registada.

- [ ] **T2.5** — Verificar/ajustar `list_pending_tasks` em `mcp-server/src/index.ts` para incluir storeKeys do formato `__block__<uuid>` (provável já funciona via loop genérico — confirmar). · verificação: leitura do código.

### 3. Stores Zustand (renderer)

- [ ] **T3.1** — `timeBlockStore`: adicionar estado `untimedBlocks: TimeBlock[]` + acções `addUntimedBlock({ title, color }) => string`, `updateUntimedBlock(id, updates)`, `removeUntimedBlock(id)`. Bump `persist` version `2 → 3` com migration que define `untimedBlocks: []` para state v2. · ficheiro: `src/renderer/stores/timeBlockStore.ts` · verificação: hot-reload preserva untimedBlocks após criar; build clean.

- [ ] **T3.2** — `timeBlockStore` selectors: `getBlockById(id)` (procura em `blocks[*][*]` e `untimedBlocks`), `getBlocksByTitle(title)` (todas instâncias com mesmo título trimmed). · verificação: build clean.

- [ ] **T3.3** — `taskStore`: novo selector `getTasksGroupedByBlockTitle(): BlockGroup[]`. Lógica: itera `tasks` storeKeys; resolve título via `useTimeBlockStore.getState().getBlockById(uuid)`; agrupa por `title.trim()`; "Sem bloco" absorve `BACKLOG_KEY` + storeKeys date-only; inclui untimedBlocks sem tarefas como grupos vazios; cor = primeira instância por `createdAt`; ordem: alfa + "Sem bloco" no fim. · ficheiro: `src/renderer/stores/taskStore.ts` · verificação: build clean.

### 4. IPC handlers

- [ ] **T4.1** — `src/main/services/icloud.ts`: `getBlocksFilePath()` (raiz da Bloc), `readBlocksFile()`, `writeBlocksFile(content)`. Espelha api de review files. · verificação: build clean.

- [ ] **T4.2** — `src/main/ipc/syncHandlers.ts`: handlers `icloud:read-blocks`, `icloud:write-blocks`. Adicionar `blocks.md` ao watcher (poll 3s) com evento `icloud:blocks-changed`. · verificação: build clean; watcher dispara após edição manual do ficheiro.

- [ ] **T4.3** — `src/preload/index.ts`: expor `bloc.icloud.readBlocks()`, `bloc.icloud.writeBlocks(data)`, `bloc.icloud.onBlocksChanged(cb)`. · verificação: types em `window.bloc` correctos.

- [ ] **T4.4** — `src/renderer/App.tsx` (ou onde a hidratação inicial vive): carregar `blocks.md` ao arrancar e popular `untimedBlocks` + tarefas correspondentes. Subscrever `onBlocksChanged` para re-hidratar. · verificação: app reload carrega untimedBlocks correctamente.

### 5. UI / componentes

- [ ] **T5.1** — `src/renderer/components/CreateBlockModal.tsx`: novo componente. Props `{ open, onClose, onCreated?(id) }`. Campos: input título (autofocus), `ColorPicker`. Botões Confirmar/Cancelar. Confirma chama `timeBlockStore.addUntimedBlock`. · verificação: visual render.

- [ ] **T5.2** — `src/renderer/views/InboxView.tsx` `TasksTab`: substituir `useMemo` actual por chamada a `getTasksGroupedByBlockTitle()` via padrão `useTaskStore((s) => s.tasks)` + `useMemo([tasks, allBlocks, untimedBlocks])` (evita o loop de selector que apanhámos no MigratePhase). Renderiza grupos: header (color dot + título + contagem) + lista de tarefas. Cada item mostra date label se aplicável. · verificação: tab renderiza sem loop infinito.

- [ ] **T5.3** — TasksTab: botão "Criar bloco" no topo (acima da secção de grupos). Click abre `CreateBlockModal`. · verificação: modal abre/fecha; bloco aparece após confirm.

- [ ] **T5.4** — TasksTab: por cada grupo, botão "+ Adicionar tarefa" inline (input que aparece on-click). StoreKey-resolution:
  - Grupo "Sem bloco" → `BACKLOG_KEY`
  - Grupo com untimed block existente → `__block__<untimedId>`
  - Grupo só com instâncias datadas (sem untimed) → cria untimed primeiro (`addUntimedBlock` com title+color do grupo), depois `__block__<newId>`
  · verificação: tarefa criada aparece imediatamente no grupo correcto.

- [ ] **T5.5** — Visuais: header de grupo usa color dot do `ColorPicker` palette. "Sem bloco" sem dot (texto muted). Hide concluídas funciona como antes. · verificação: visual.

### 6. Verificação

- [ ] **T6.1** — Build: `npx electron-vite build` (root) + `cd mcp-server && npm run build` — ambos limpos.

- [ ] **T6.2** — `npm run dev`. Inbox → Tarefas → confirmar agrupamento por título de bloco; standalone+backlog em "Sem bloco".

- [ ] **T6.3** — "Criar bloco" → "Test Project" + cor → grupo aparece vazio. "+ Adicionar tarefa" → tarefa criada. Confirmar `~/Library/Mobile Documents/.../Bloc-Dev/blocks.md` tem o formato esperado.

- [ ] **T6.4** — Calendário → criar bloco com mesmo título "Test Project" em data X → adicionar tarefa lá. Voltar ao tab Tarefas → confirmar que ambas as tarefas aparecem no mesmo grupo "Test Project".

- [ ] **T6.5** — Toggle "Mostrar concluídas" preserva comportamento.

- [ ] **T6.6** — MCP: invocar `create_block { title: "MCP test", color: "rose" }` → após poll iCloud (≤3s) aparece no renderer. `list_blocks` retorna o bloco.

- [ ] **T6.7** — Header das 3 specs (`spec.md`, `plan.md`, `tasks.md`) actualizar para `**Status**: done`.
