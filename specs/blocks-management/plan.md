---
**Status**: done
**Spec**: ./spec.md
---

# Vista Blocos — Plano técnico

## Resumo da abordagem

Mudança 100% confinada ao renderer. Não toca em schema markdown nem em MCP — todas as operações já existem (`moveTask`, `removeTask`, `removeUntimedBlock`). O `TasksTab` em [InboxView.tsx](../../src/renderer/views/InboxView.tsx) é refactorado: rename → "Blocos", adiciona barra de pesquisa, toggle "ocultar vazios" persistido em `settingsStore`, drag-and-drop HTML5 nativo (padrão consolidado em `WeekDayColumn` e `FlowQueueView` — sem dependência externa), e botão eliminar sempre visível com modal de confirmação que mostra contagem.

## Layer 1 — Schema Markdown (iCloud)

**Sem alterações.** A feature usa só operações que já manipulam o schema existente:
- `removeUntimedBlock(id)` → escreve em `blocks.md` removendo a entrada e a chave `__block__{id}` de `tasks`.
- `removeTask(storeKey, taskId)` → escreve no day file (`YYYY-MM-DD.md`) ou em `blocks.md` consoante o storeKey.
- `moveTask(fromKey, toKey, taskId)` → remove de um e adiciona ao outro; ambos os ficheiros tocados são reescritos.

Nenhum campo novo, nenhuma secção nova. Ficheiros antigos continuam a abrir sem mudanças.

## Layer 2 — Stores Zustand (renderer)

**Stores tocadas**: `settingsStore` (toggle persistido). `taskStore` e `timeBlockStore` apenas consumidas — sem novas acções.

### `settingsStore.ts` — campo novo
- **Estado**: `hideEmptyBlocks: boolean` (default `false`).
- **Acção**: `setHideEmptyBlocks(value: boolean): void`.
- **Persistência**: já é `persist({ name: 'bloc-settings' })`. Como a chave de persistência não muda, `partialize` não precisa de update — Zustand persist apanha o novo campo automaticamente. Versões antigas hidratam com `false` (default), sem migration.

### Selector novo derivado (no componente, não na store)
- `filteredGroups = useMemo(() => groups.filter(g => matchesSearch(g) && (showAllBlocks || hasPending(g))), [groups, search, hideEmptyBlocks])` — local ao componente.

### Sem mudanças em `taskStore.ts`
- `moveTask(fromKey, toKey, taskId)` em [taskStore.ts:138](../../src/renderer/stores/taskStore.ts) é exactamente o que precisamos para o DnD — recebe `storeKey` (formato `__block__{id}` para untimed, `YYYY-MM-DD__block__{id}` para timed). Como o "destino" do drop é sempre um grupo de bloco (não uma data), o destino vai ser sempre `__block__{targetUntimedId}` — o mesmo padrão que `commitNewTask` em [InboxView.tsx:308-330](../../src/renderer/views/InboxView.tsx) já usa para criar tarefas (auto-cria untimed se não existir).

### Sem mudanças em `timeBlockStore.ts`
- `removeUntimedBlock(id)` é suficiente para remover o "container" do bloco. Os `TimeBlock` agendados no calendário com o mesmo título permanecem (ficam vazios). Decisão alinhada com a tool MCP `delete_block` (que também não toca em day files).

## Layer 3 — IPC main↔renderer

**Sem alterações IPC.** Todas as operações já vão pelo `syncHandlers` existente que escreve `.md` quando as stores mudam.

## Layer 4 — MCP server (`mcp-server/`)

**Sem alterações.** O schema não muda, a tool `delete_block` em `mcp-server/src/index.ts:678-696` já faz exactamente a operação de cascata (remove untimed + tasks `__block__{id}`). A operação de mover tarefa entre blocos não tem tool MCP dedicada (continua a ser composta no renderer), mas isso é o estado actual e não é um requisito desta feature expor isso ao MCP.

**Paridade verificada**: a operação de delete cascata no renderer vai produzir exactamente o mesmo `.md` resultante que `delete_block` produziria — ambas removem a entrada do `untimedBlocks` e a chave `__block__{id}` em `tasks`.

## UI / componentes

### Componente alterado: `InboxView.tsx`

**Nível 1 — Tab label/ícone** ([linhas 70-80](../../src/renderer/views/InboxView.tsx)):
- `<ListTodo size={14} />` → trocar por `<Boxes size={14} />` (ou `<Layers />` — ambos lucide).
- "Tarefas" → "Blocos".
- Tipo `Tab = 'inbox' | 'tasks'` mantém-se ('tasks' como key interna; só muda label visível) para não invalidar URLs `?tab=tasks` que possam estar guardados.

**Nível 2 — `TasksTab` (renomear opcional para `BlocksTab` no ficheiro, ou manter)** ([linhas 191-262](../../src/renderer/views/InboxView.tsx)):
- Adicionar header com **3 controlos novos** acima da lista (na mesma linha que "Criar bloco" / "Mostrar concluídas"):
  - `<input>` de pesquisa com ícone `Search` (lucide). State local `searchTerm`. Ref para focar via ⌘F.
  - Toggle `Eye/EyeOff` "Ocultar blocos vazios" — lê/escreve `settingsStore.hideEmptyBlocks`.
- Filtro local com `useMemo`:
  ```ts
  const filteredGroups = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return groups.filter(g => {
      // "Sem bloco" só aparece quando não há pesquisa
      if (g.blockId === null) return term === '' && (!hideEmptyBlocks || hasPendingItems(g))
      // Pesquisa: nome do bloco contém termo
      if (term && !g.title.toLowerCase().includes(term)) return false
      // Ocultar vazios: precisa ter pelo menos uma tarefa pendente
      if (hideEmptyBlocks && !hasPendingItems(g)) return false
      return true
    })
  }, [groups, searchTerm, hideEmptyBlocks])
  ```
- Empty state quando filtro não devolve nada: `"Nenhum bloco corresponde a "<termo>""` (ou "Sem blocos com tarefas pendentes" se for por causa do toggle).
- Atalho local **⌘F**: `useEffect` com `keydown` listener no window que filtra contra `searchInputRef.current?.focus()`. Cleanup no unmount.

**Nível 3 — `BlockGroupView`** ([linhas 264-440](../../src/renderer/views/InboxView.tsx)):
- **Botão eliminar sempre visível** (substituir lógica `canDelete = isEmpty`):
  - Mostrar para qualquer grupo com `blockId !== null` (untimed ou inferido) — escondido só para "Sem bloco".
  - `opacity-0 group-hover/header:opacity-100` mantém-se (visível no hover do header).
  - Click abre o modal de confirmação (estado local no `BlockGroupView` ou içar para `BlocksTab`).
- **Drop target** — `<div onDragOver={handleDragOver} onDrop={handleDrop}>` envolve o header + lista do grupo:
  - `onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }` (necessário para activar drop).
  - Visual feedback: classe `data-dropping` ou state `isDropTarget` que muda fundo/border quando `dragOver` activo.
  - `onDrop` lê `e.dataTransfer.getData('application/x-bloc-task')`, parse `{ storeKey, taskId }`, resolve `targetKey` (mesmo padrão que `commitNewTask` para auto-criar untimed se necessário), chama `taskStore.moveTask(fromKey, targetKey, taskId)`.
  - Reject se `group.blockId === null` ("Sem bloco" não é destino).
  - Reject se `fromKey === targetKey` (drop no próprio grupo — no-op, evita ruído visual).

**Nível 4 — `TaskItem`** ([linhas 442-534](../../src/renderer/views/InboxView.tsx)):
- `<div draggable onDragStart={handleDragStart}>`:
  - `e.dataTransfer.setData('application/x-bloc-task', JSON.stringify({ storeKey, taskId: task.id }))`.
  - `e.dataTransfer.effectAllowed = 'move'`.
  - Visual: cursor `grab` no idle, opacity reduzida durante drag (state local `isDragging`).
- `onDragEnd` limpa state visual.

### Componente novo: `DeleteBlockConfirmModal.tsx`

Pequeno modal centrado seguindo o padrão de [`DailyStandupModal.tsx`](../../src/renderer/components/DailyStandupModal.tsx) (overlay + framer-motion, key Escape para fechar).

**Props**:
```ts
interface Props {
  visible: boolean
  blockTitle: string
  taskCount: number
  onConfirm: () => void
  onCancel: () => void
}
```

**Conteúdo**:
- Título: `Eliminar bloco`
- Texto: `Eliminar o bloco "<title>" e as <N> tarefas?` (singular: `1 tarefa`; plural: `N tarefas`; sem tarefas: "Eliminar o bloco "<title>"?")
- Botões: `Cancelar` (secundário) e `Eliminar` (destrutivo, vermelho — `bg-rose-500`).
- Foco inicial em `Cancelar` (safer default).

### Helper para delete cascata (no `BlockGroupView` ou utilitário local)

```ts
function deleteBlockGroup(group: BlockGroup) {
  // 1. Apagar todas as tarefas (em qualquer storeKey)
  for (const it of group.items) {
    taskStore.removeTask(it.storeKey, it.task.id)
  }
  // 2. Apagar untimed block (se houver)
  for (const ub of matchingUntimedBlocks(group.title)) {
    timeBlockStore.removeUntimedBlock(ub.id)
  }
  // 3. TimeBlock agendados ficam intocados (decisão de spec)
}
```

### Atalhos / tray / menus

Sem alterações ao menu nativo. Apenas o atalho local ⌘F na vista Blocos.

### Estados de loading / erro / vazio

- **Vazio sem filtros**: "Sem tarefas. Cria um bloco para começar." (existente).
- **Vazio por pesquisa**: "Nenhum bloco corresponde a `<termo>`." com botão para limpar pesquisa.
- **Vazio por toggle "ocultar vazios"**: "Sem blocos com tarefas pendentes. Desativa "Ocultar blocos vazios" para ver todos."
- **Drop target activo**: ring/border colorido no grupo de destino.
- **Drop inválido** (sobre "Sem bloco" ou próprio grupo): cursor `not-allowed` ou simplesmente não destacar como target.

## Verificação

### Manual (renderer)
1. `npm run dev`
2. `/inbox` → tab que antes era "Tarefas" agora aparece como **Blocos**.
3. Escrever um termo na pesquisa: lista filtra em tempo real por nome de bloco; "Sem bloco" some; tarefas dentro dos blocos não são pesquisadas (apenas o nome do bloco).
4. Limpar pesquisa, activar "Ocultar blocos vazios": grupos sem pendentes desaparecem; recarregar a app → toggle continua activo.
5. Combinar pesquisa + ocultar vazios + mostrar concluídas: comportamento é a intersecção dos filtros.
6. ⌘F com a vista activa: foco vai para a barra de pesquisa.
7. Arrastar uma tarefa do bloco A e largá-la no header de B: tarefa transfere; counts actualizam; reload mantém estado.
8. Arrastar para "Sem bloco": rejeitado (sem feedback positivo).
9. Hover no header de bloco com tarefas: botão X visível. Click: modal a indicar nome + contagem. Cancelar não faz nada. Confirmar: bloco e tarefas desaparecem; ficheiro `~/Library/Mobile Documents/.../Bloc-Dev/blocks.md` actualizado.
10. Tentar eliminar "Sem bloco": botão não existe.

### Sincronização iCloud + MCP (paridade)
11. Após delete cascata via UI, abrir `blocks.md` num editor externo (ou via MCP `read_day` numa sessão limpa) — confirmar que o untimed e a chave `tasks.__block__{id}` desapareceram.
12. Após `moveTask` via DnD UI, confirmar que o ficheiro do dia (se for tarefa de TimeBlock) e o `blocks.md` (se for tarefa untimed) reflectem a mudança consistentemente.
13. Invocar a tool MCP `read_day` num dia onde uma tarefa foi movida — confirma que o output bate certo com o que a UI mostra.

### Type-check
- `npx tsc --noEmit -p .` no fim de cada layer (stores, depois UI).

## Riscos e alternativas

- **Risco**: drag-and-drop no React 19 + Framer Motion. Os items dentro do `<AnimatePresence>` actual têm `motion.div` — `draggable` HTML5 funciona em qualquer elemento, mas pode haver conflito visual com transições `exit`. **Mitigação**: testar; se houver flicker, mover `draggable` para wrapper interno e não para o `motion.div`.

- **Risco**: ⌘F ser global a Electron e activar a busca do Chromium em vez do nosso input. **Mitigação**: o handler chama `e.preventDefault()` antes do default. Se mesmo assim houver conflito, mudar para ⌘K (Spotlight-style, sem reserva nativa).

- **Risco**: o utilizador eliminar acidentalmente um bloco grande. **Mitigação**: modal de confirmação obrigatória + foco inicial em "Cancelar"; ficheiros MD ficam em iCloud (recuperáveis via histórico). Sem undo no escopo desta feature.

- **Alternativa rejeitada — DnD com library externa** (`@dnd-kit`): adiciona ~30KB ao bundle, mais um conceito a manter. HTML5 nativo já está provado em `WeekDayColumn`/`FlowQueueView`; não justifica.

- **Alternativa rejeitada — ocultar vazios em localStorage ad-hoc**: `settingsStore` é o sítio certo (cross-session app behavior, não layout). Localstorage ad-hoc reserva-se para layout state (divider %).

- **Alternativa rejeitada — eliminar também TimeBlock agendados** com mesmo título: agressivo, viola a separação de fontes (calendário é autoridade para agendamento). Spec reafirma "elimina tarefas", não "elimina o histórico do calendário".

## Respostas às questões em aberto do spec

| Questão | Decisão |
|---------|---------|
| Library de DnD | HTML5 nativo (padrão consolidado em WeekDayColumn/FlowQueueView) |
| Eliminar blocos com instâncias agendadas | Só remove untimed + tarefas; TimeBlock no calendário ficam intactos (alinhado com tool MCP `delete_block`) |
| Persistência "ocultar vazios" | `settingsStore.hideEmptyBlocks` |
| Atalho de pesquisa | ⌘F local na vista Blocos |
| "Sem bloco" e a pesquisa | Escondido quando há termo de pesquisa (não tem nome para fazer match) |
