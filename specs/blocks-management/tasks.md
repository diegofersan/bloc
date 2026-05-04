---
**Status**: done
**Plan**: ./plan.md
---

# Vista Blocos — Tasks

## Ordem de execução

> Esta feature **não toca em schema MD, MCP ou IPC** (decisão do plan). Logo as secções 1, 2 e 4 estão vazias. Trabalho concentra-se em store (1 task) + UI (10 tasks) + verificação.

### 1. Schema & types partilhados
- Sem alterações.

### 2. MCP server
- Sem alterações. Tool `delete_block` já cobre a operação de cascata; sem mudanças no schema.

### 3. Stores Zustand

- [x] **T3.1** — Adicionar toggle persistido `hideEmptyBlocks` ao `settingsStore`
  · ficheiro: [src/renderer/stores/settingsStore.ts](../../src/renderer/stores/settingsStore.ts)
  · adicionar `hideEmptyBlocks: boolean` (default `false`) e `setHideEmptyBlocks(v: boolean)` ao `SettingsState`
  · sem migration (Zustand persist hidrata default em sessões antigas)
  · verificação: `npx tsc --noEmit` passa; toggle no DevTools (`useSettingsStore.getState()`) tem o campo.

### 4. IPC handlers
- Sem alterações.

### 5. UI / componentes

- [x] **T5.1** — Rename tab "Tarefas" → "Blocos" (label + ícone)
  · ficheiro: [src/renderer/views/InboxView.tsx](../../src/renderer/views/InboxView.tsx) (linhas ~70-80)
  · `<ListTodo>` → `<Boxes>` (lucide-react), label "Tarefas" → "Blocos"
  · manter `Tab = 'inbox' | 'tasks'` (key interna) para preservar `?tab=tasks` em URLs guardados
  · verificação: tab muda visualmente, navegação por URL continua a funcionar.

- [x] **T5.2** — Barra de pesquisa no header do `TasksTab`
  · ficheiro: [src/renderer/views/InboxView.tsx](../../src/renderer/views/InboxView.tsx) (`TasksTab`, linhas ~191-262)
  · `<input>` com ícone `Search` (lucide), state local `searchTerm`, ref `searchInputRef`
  · placeholder: "Pesquisar bloco…"
  · clear button (X) à direita quando `searchTerm !== ''`
  · verificação: digitar não filtra ainda (T5.4 ativa o filtro), mas input reflecte teclas.

- [x] **T5.3** — Toggle "Ocultar blocos vazios"
  · ficheiro: [src/renderer/views/InboxView.tsx](../../src/renderer/views/InboxView.tsx)
  · botão tipo `Eye/EyeOff` igual ao "Mostrar concluídas" (mesma row de controlos)
  · lê e escreve `useSettingsStore` (`hideEmptyBlocks`, `setHideEmptyBlocks`)
  · label dinâmico: "Ocultar vazios" / "Mostrar vazios"
  · verificação: clicar alterna; recarregar a app preserva o estado.

- [x] **T5.4** — Filtro combinado por pesquisa + ocultar vazios
  · ficheiro: [src/renderer/views/InboxView.tsx](../../src/renderer/views/InboxView.tsx) (`TasksTab`)
  · `useMemo` que aplica:
    - `g.blockId === null` (Sem bloco): só aparece se `searchTerm === ''` E (`!hideEmptyBlocks` OU tem pendentes)
    - outros grupos: filtra por `g.title.toLowerCase().includes(term)` E (`!hideEmptyBlocks` OU tem pendentes)
  · usar a lista filtrada na renderização em vez de `groups`
  · verificação: combinar pesquisa + ocultar vazios + mostrar concluídas e confirmar intersecção previsível.

- [x] **T5.5** — Atalho ⌘F local para focar a pesquisa
  · ficheiro: [src/renderer/views/InboxView.tsx](../../src/renderer/views/InboxView.tsx) (`TasksTab`)
  · `useEffect` com `keydown` listener no window, só quando `tab === 'tasks'` (a tab activa)
  · `(e.metaKey || e.ctrlKey) && e.key === 'f'` → `e.preventDefault()` + `searchInputRef.current?.focus()`
  · cleanup no unmount
  · verificação: ⌘F com a vista activa foca o input; em outras tabs/views o atalho não interfere.

- [x] **T5.6** — Empty states diferenciados
  · ficheiro: [src/renderer/views/InboxView.tsx](../../src/renderer/views/InboxView.tsx)
  · 3 mensagens conforme razão da lista vazia:
    - sem dados (existente): "Sem tarefas. Cria um bloco para começar."
    - filtro de pesquisa sem matches: `Nenhum bloco corresponde a "<termo>".` + botão "Limpar pesquisa"
    - hideEmptyBlocks sem matches: "Sem blocos com tarefas pendentes."
  · verificação: cada cenário mostra a mensagem correcta.

- [x] **T5.7** — Criar `DeleteBlockConfirmModal`
  · ficheiro novo: `src/renderer/components/DeleteBlockConfirmModal.tsx`
  · props: `{ visible, blockTitle, taskCount, onConfirm, onCancel }`
  · padrão do [DailyStandupModal.tsx](../../src/renderer/components/DailyStandupModal.tsx): overlay framer-motion, Escape fecha, click fora cancela
  · texto dinâmico: 0 tarefas → `Eliminar o bloco "X"?`; 1 → `Eliminar o bloco "X" e a 1 tarefa?`; N → `Eliminar o bloco "X" e as N tarefas?`
  · botões: "Cancelar" (foco inicial, ghost) e "Eliminar" (`bg-rose-500`)
  · verificação: visualmente correcto; Escape fecha; foco inicia em "Cancelar".

- [x] **T5.8** — Botão eliminar sempre visível + handler de cascata
  · ficheiro: [src/renderer/views/InboxView.tsx](../../src/renderer/views/InboxView.tsx) (`BlockGroupView`)
  · remover lógica `canDelete = isEmpty`. Mostrar botão X no header sempre que `group.blockId !== null` (esconder só para "Sem bloco"); manter `opacity-0 group-hover/header:opacity-100`
  · ao clicar: abre `DeleteBlockConfirmModal` com `blockTitle = group.title`, `taskCount = group.items.length`
  · `onConfirm` chama helper `deleteBlockGroup(group)` que:
    1. itera `group.items` e chama `taskStore.removeTask(it.storeKey, it.task.id)`
    2. itera `matchingUntimed(group.title)` e chama `timeBlockStore.removeUntimedBlock(ub.id)`
    3. **não toca** em `TimeBlock` agendados
  · verificação: confirmar com tarefas elimina tudo; "Sem bloco" não tem botão; cancelar não muda nada; `blocks.md` no iCloud reflecte a remoção.

- [x] **T5.9** — `TaskItem` draggable (HTML5)
  · ficheiro: [src/renderer/views/InboxView.tsx](../../src/renderer/views/InboxView.tsx) (`TaskItem`, linhas ~442-534)
  · adicionar `draggable={true}` ao container do item
  · `onDragStart(e)`: `e.dataTransfer.setData('application/x-bloc-task', JSON.stringify({ storeKey, taskId: task.id }))`; `effectAllowed = 'move'`
  · `onDragEnd(e)`: limpar state visual local
  · estado local `isDragging` → `opacity-50` + `cursor-grabbing` durante drag; `cursor-grab` no idle
  · cuidado com o conflito framer-motion `<AnimatePresence>`: se `motion.div` é o container, mover `draggable` para wrapper interno
  · verificação: arrastar a tarefa visualmente "agarra"; soltar fora não dá erro.

- [x] **T5.10** — `BlockGroupView` drop target com feedback
  · ficheiro: [src/renderer/views/InboxView.tsx](../../src/renderer/views/InboxView.tsx) (`BlockGroupView`)
  · `onDragOver(e)`: se `group.blockId !== null`, `e.preventDefault()` + `dropEffect = 'move'`; senão não previne (rejeita drop)
  · `onDrop(e)`:
    - parse `JSON.parse(e.dataTransfer.getData('application/x-bloc-task'))` (try/catch para drops de fora da app)
    - resolver `targetKey` (mesmo padrão de `commitNewTask` em [InboxView.tsx:308-330](../../src/renderer/views/InboxView.tsx) — auto-cria untimed se não existir, key resultante = `__block__{hostId}`)
    - se `fromKey === targetKey` → no-op
    - chama `taskStore.moveTask(fromKey, targetKey, taskId)`
  · estado local `isDropTarget` que activa `ring-2 ring-accent` ou similar quando `dragOver` activo; clear no `dragLeave`/`drop`
  · "Sem bloco" não destaca como target (rejeita drag visualmente também)
  · verificação: arrastar tarefa entre dois blocos transfere; arrastar para o próprio bloco não duplica; "Sem bloco" não aceita.

### 6. Verificação manual

- [x] **T6.1** — `npm run dev`. `/inbox` → tab "Blocos" (com ícone novo).
- [x] **T6.2** — Criar 3 blocos com tarefas + 1 bloco vazio. Pesquisar parte de um nome filtra em tempo real; "Sem bloco" some quando há termo.
- [x] **T6.3** — Activar "Ocultar blocos vazios": bloco vazio desaparece. Recarregar app: toggle continua activo.
- [x] **T6.4** — Combinar os 3 filtros (pesquisa + ocultar vazios + mostrar concluídas) e validar intersecção.
- [x] **T6.5** — ⌘F com vista activa: foca pesquisa. Mudar para tab Inbox: ⌘F já não interfere.
- [x] **T6.6** — Drag de uma tarefa do bloco A → soltar em B: tarefa transfere, counts actualizam.
- [x] **T6.7** — Tentar arrastar para "Sem bloco": rejeitado.
- [x] **T6.8** — Hover no header de um bloco com tarefas → botão X visível → click → modal mostra contagem certa. Cancelar não muda nada.
- [x] **T6.9** — Confirmar delete em bloco com 5 tarefas: tudo desaparece. Abrir `~/Library/Mobile Documents/.../Bloc-Dev/blocks.md` (ou `~/Bloc/blocks.md` em prod) e confirmar que o `untimedBlocks` e `tasks.__block__{id}` saíram.
- [x] **T6.10** — Confirmar que TimeBlock agendados no calendário com o mesmo título do bloco eliminado **continuam lá** (apenas vazios). Abrir um dia que tinha um desses TimeBlock e confirmar.
- [x] **T6.11** — Invocar a tool MCP `read_day` para um dia que tinha tarefa movida via DnD: confirmar que o output bate com a UI.
- [x] **T6.12** — `npx tsc --noEmit -p .` no fim, sem erros.
- [x] **T6.13** — `npm run build` end-to-end, sem erros.
