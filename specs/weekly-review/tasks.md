---
**Status**: done (v2)
**Plan**: ./plan.md
**Última iteração**: 2026-04-29 (v2 — migração por bloco/projecto)
---

# Revisão Semanal — Tasks

## Ordem de execução

> Schema MD primeiro (paridade renderer + MCP), depois IPC, depois store, depois UI. A fase Plan reaproveita `WeeklyPlanningView` — não a tocamos. Última tarefa de cada bloco verifica o build antes de avançar.

---

### 1. Schema & types partilhados

- [ ] **T1.1** — Criar tipo `WeeklyReviewData` num local partilhado consumido pelos 3 layers (renderer + main + mcp).
  - **Ficheiro**: `src/shared/types/weeklyReview.ts` (criar; se `src/shared/` não existir, usar localização equivalente já em uso pelos `DayFileData` types — verificar antes)
  - **Conteúdo**: `WeeklyReviewData`, `MigrationDecision`, `MigrationDecisionEntry`, `ReviewPhase`, `ReviewStatus`
  - **Verificação**: `tsc --noEmit` sem erros

- [ ] **T1.2** — Helper de cálculo de week ID e datas.
  - **Ficheiro**: `src/shared/utils/weekId.ts` (ou onde encaixa o resto dos shared utils)
  - **Funções**: `getISOWeekId(date: Date | string): string` (devolve `YYYY-Www`), `getWeekStartFromId(id: string): string`, `getWeekEndFromId(id: string): string`
  - **Verificação**: chamar de DevTools com `2026-04-29` → `2026-W18`; `2026-W17` → start `2026-04-27`, end `2026-05-03`

---

### 2. MCP server (paridade primeiro)

- [ ] **T2.1** — Adicionar serializer/deserializer de revisão em `mcp-server/src/markdown.ts`
  - **Funções**: `serializeReview(data): string`, `deserializeReview(content): WeeklyReviewData | null`
  - **Formato exacto**: ver plan.md secção Layer 1
  - **Verificação**: round-trip — serialize → deserialize → comparar deep equal com original; `cd mcp-server && npm run build` sem erros

- [ ] **T2.2** — Adicionar helpers de ficheiro em `mcp-server/src/storage.ts`
  - **Funções**: `getReviewFilePath(weekStart: string): string`, `readReviewFile(weekStart): string | null`, `listReviewFiles(): string[]`
  - **Verificação**: confirmar que o pattern de file existing helpers continua a ignorar `*-review.md` (ler `read_week`, `read_day`, `list_days` e validar regex)

- [ ] **T2.3** — Confirmar que tools existentes (`read_week`, `read_day`, `list_days`) ignoram ficheiros de revisão.
  - **Acção**: ler a regex de match nos handlers e adicionar comentário a explicar que `*-review.md` é diferente
  - **Verificação**: criar um ficheiro fake `2099-W01-review.md` na pasta dev e correr `list_days` via MCP — confirmar que não aparece

---

### 3. Main process — ficheiros e IPC

- [ ] **T3.1** — Adicionar helpers de revisão em `src/main/services/icloud.ts`
  - **Funções**: `getReviewFilePath(weekStart)`, `readReviewFile(weekStart)`, `writeReviewFile(weekStart, content)`, `listReviewFiles()`
  - **Verificação**: type-check ok; nenhum dos exports existentes (`getFilePath`, `readDayFile`, etc.) é alterado

- [ ] **T3.2** — Adicionar serializer/deserializer em `src/main/services/markdownSerializer.ts`
  - **Funções**: `serializeReview`, `deserializeReview` — **byte-equivalentes ao MCP**
  - **Verificação**: serializar um exemplo no main e no mcp e diff dos outputs (manual com `diff` no terminal)

- [ ] **T3.3** — Registar 3 IPC handlers em `src/main/ipc/syncHandlers.ts`
  - **Canais**: `icloud:read-review` (input: `weekStart`), `icloud:write-review` (input: `WeeklyReviewData`), `icloud:list-reviews` (sem input)
  - **Verificação**: invocar via DevTools renderer (`window.electron.ipcRenderer.invoke('icloud:list-reviews')`) → retorna array vazio antes de escrever, retorna `[weekStart]` depois de uma escrita

- [ ] **T3.4** — Expor handlers no preload (`src/preload/index.ts`)
  - **Acção**: seguir o padrão dos handlers existentes (provavelmente em `electron.ipcRenderer.invoke` directo, ou num namespace tipado)
  - **Verificação**: type-check ok; chamada no renderer aparece autocompleted

---

### 4. Stores e serviços do renderer

- [ ] **T4.1** — Criar `src/renderer/services/weekStats.ts`
  - **Função**: `computeWeekStats(weekStart, weekEnd): WeekStats` — lê `taskStore`, `pomodoroStore`, `timeBlockStore` via `getState()`
  - **Função**: `getMigrationItems(weekStart, weekEnd): MigrationItem[]` — extrai pendentes da semana
  - **Verificação**: chamar de DevTools com uma semana com dados conhecidos → comparar com inspecção manual dos stores

- [ ] **T4.2** — Criar `src/renderer/stores/weeklyReviewStore.ts`
  - **Estado**: ver plan.md secção Layer 2
  - **Acções**: `loadReview`, `startReview`, `setPhase`, `setMigrationDecision`, `applyMassDecision`, `setReflectField`, `applyMigration`, `seal`, `discardDraft`, `getActiveDraft`
  - **Persist**: `name: 'bloc-weekly-reviews'`, version 1
  - **Auto-save**: cada mutação dispara debounce 300ms → `window.electron.ipcRenderer.invoke('icloud:write-review', data)`
  - **applyMigration**: itera decisões → para cada `next-week` chama `useTaskStore.getState().createTaskRef(originDate, taskId, weekEndPlus1)`; para cada `discard` chama `useTaskStore.getState().removeTask(originDate, taskId)`; devolve `{ moved, discarded, kept }`
  - **seal**: marca status sealed + sealedAt + flush ao MD
  - **Verificação**: type-check; chamar `startReview('2026-04-27')` e `setReflectField('2026-04-27', 'highlight', 'teste')` em DevTools → confirmar localStorage actualiza

---

### 5. Componentes UI

- [ ] **T5.1** — Criar pasta `src/renderer/components/review/` e shell de componentes vazios
  - **Ficheiros**: `ReviewView.tsx`, `WeekSelector.tsx`, `ReviewWizard.tsx`, `LookBackPhase.tsx`, `MigratePhase.tsx`, `ReflectPhase.tsx`, `ReflectField.tsx`, `WeekItemsSidebar.tsx`, `PlanPhase.tsx`, `SealedReviewView.tsx`
  - Cada um exporta um componente trivial (`<div>TODO: <Name></div>`)
  - **Verificação**: tsc ok; podemos importar todos sem erros

- [ ] **T5.2** — Implementar `ReviewView.tsx` (orquestrador)
  - Lê param `weekStart` da URL; se ausente, usa `getActiveDraft()?.weekStart` ou cai em selector
  - Carrega via `loadReview`; mostra loading; em sucesso renderiza `ReviewWizard` ou `SealedReviewView` consoante status
  - **Verificação**: navegar para `/review` em estado limpo → mostra selector

- [ ] **T5.3** — Implementar `WeekSelector.tsx`
  - Date picker / lista de semanas recentes (8 últimas), default = semana anterior
  - Banner "draft em curso" se `getActiveDraft()` retorna outra semana — opções "Continuar" / "Recomeçar"
  - CTA "Iniciar revisão" → `startReview(weekStart)` + `navigate('/review/<weekStart>')`
  - **Verificação**: clicar uma semana → aterrar em `/review/<weekStart>` com fase 1

- [ ] **T5.4** — Implementar `ReviewWizard.tsx`
  - Header com título "Revisão de DD–DD MMM", indicador "Fase X de 4: <nome>", indicador auto-save
  - Body renderiza fase actual via switch
  - Footer com botões prev/next, atalhos `←`/`→`
  - Esc volta com confirmação se há mudanças não confirmadas em Migrate
  - **Verificação**: navegar entre fases preserva estado; reload da página retoma na fase guardada

- [ ] **T5.5** — Implementar `LookBackPhase.tsx`
  - Grid de stats (tarefas feitas/pendentes, blocos, pomodoros, dias activos, completion rate)
  - Link "Ver pendentes →" salta para fase 2
  - **Verificação**: stats batem com inspecção manual dos stores

- [ ] **T5.6** — Implementar `MigratePhase.tsx`
  - Lista de `MigrationItem[]` com 3 botões por linha (mover/manter/descartar) + estado visual da decisão
  - Toolbar com acções em massa (aplicar a todas: mover/manter/descartar)
  - CTA "Confirmar migração" → `applyMigration` → toast com `{ moved, discarded, kept }` → avança para fase 3
  - **Verificação**: criar 3 tarefas pendentes em dias da semana, fazer decisões variadas, confirmar — verificar nos stores que refs/removes aconteceram

- [ ] **T5.7** — Implementar `WeekItemsSidebar.tsx`
  - Lista de tasks completed da semana + blocos, com `draggable="true"` e `dataTransfer.setData('application/bloc-item', JSON.stringify({...}))`
  - Visual: agrupado por dia, scroll vertical
  - **Verificação**: arrastar um item para o navigator do browser mostra os dados no devtools event inspector

- [ ] **T5.8** — Implementar `ReflectField.tsx`
  - Modo edição: `<textarea>` com `onDragOver` (preventDefault) e `onDrop` (insere `[title](bloc://kind/id@date)` no cursor)
  - Modo preview (em blur ou em SealedReviewView): parse markdown links com regex e substitui por `<button>` chips clicáveis (clicar = navigate para o dia)
  - Toggle entre modos: focus → edição, blur → preview se há chips
  - **Verificação**: arrastar um item para o textarea aparece a sintaxe markdown; perder focus mostra chip; clicar no chip navega

- [ ] **T5.9** — Implementar `ReflectPhase.tsx`
  - Layout 2 colunas: 3 `ReflectField` à esquerda (Destaque/Obstáculo/Intenção) + `WeekItemsSidebar` à direita
  - Auto-save dispara via `setReflectField`
  - **Verificação**: typing em qualquer campo aparece "Guardado" no header após 300ms; ficheiro MD é actualizado

- [ ] **T5.10** — Implementar `PlanPhase.tsx`
  - Wrapper que renderiza `<WeeklyPlanningView />` com semana = weekEnd + 1 (Monday seguinte)
  - Pode requerer pequena refactor de `WeeklyPlanningView` para aceitar `weekStart` como prop (em vez de só URL param) — fazer isso aqui se necessário
  - CTA final "Concluir revisão" → `seal` → `navigate('/')`
  - **Verificação**: refs criadas no passo Migrate aparecem no Monday da semana seguinte na vista de Plan

- [ ] **T5.11** — Implementar `SealedReviewView.tsx`
  - Render read-only das 4 secções (sem botões de edição)
  - Pill "Selada em DD/MM" no header
  - Reflect renderiza chips em modo preview
  - **Verificação**: abrir uma revisão selada e tentar interagir — não há campos editáveis

---

### 6. Routing e toolbar

- [ ] **T6.1** — Substituir rotas em `src/renderer/App.tsx`
  - Adicionar `/review` e `/review/:weekStart` apontando a `<ReviewView />` (lazy, em `Suspense`)
  - **Remover** rotas `/week` e `/week/:weekStart` (componente `WeeklyPlanningView` continua a existir, é importado pelo `PlanPhase`)
  - Atalho `⌘⇧W` → `navigate('/review')`
  - **Verificação**: navegar para `/week` aterra em rota inexistente / fallback; `⌘⇧W` leva a `/review`

- [ ] **T6.2** — Actualizar toolbar `src/renderer/views/CalendarView.tsx`
  - Linha 121-127: trocar `onClick` para `navigate('/review')`, `aria-label`/`title` para "Revisão semanal (⌘⇧W)"
  - **Verificação**: clicar o ícone `CalendarDays` no calendário leva a `/review`

---

### 7. Verificação end-to-end

- [ ] **T7.1** — `npm run typecheck` no root + `cd mcp-server && npm run build`
  - **Verificação**: ambos sem erros

- [ ] **T7.2** — Fluxo manual completo (golden path)
  - Abrir `npm run dev`
  - Ir ao calendário, clicar ícone "Revisão semanal"
  - Selector mostra semana anterior pré-seleccionada → iniciar
  - Fase 1: confirmar stats batem
  - Fase 2: aplicar acção em massa "mover" → confirmar
  - Fase 3: arrastar 1 task para Destaque, escrever texto, perder focus → ver chip
  - Fase 4: confirmar que refs aparecem no Monday seguinte; concluir revisão
  - Reabrir `/review/<weekStart>` → ver versão selada
  - **Verificação**: fluxo termina sem erros, ficheiro `<Bloc-Dev>/<YYYY>/<YYYY>-W<ww>-review.md` existe e tem o formato esperado

- [ ] **T7.3** — Verificar paridade renderer ↔ MCP no ficheiro produzido
  - Abrir o ficheiro com editor externo, copiar conteúdo
  - Correr `node mcp-server/dist/index.js` ou similar e chamar `deserializeReview` directo no MCP
  - **Verificação**: deserializa sem erros e produz o mesmo objecto que o renderer guardou

- [ ] **T7.4** — Cenário de retomar
  - Iniciar revisão, fazer mudanças em Reflect, fechar app (Cmd+Q)
  - Reabrir app, ir a `/review` → banner "draft em curso"
  - Continuar → estado preservado
  - **Verificação**: texto digitado antes do close ainda lá

- [ ] **T7.5** — Cenário ficheiro externo
  - Abrir `<YYYY>-W<ww>-review.md` num editor de texto
  - Editar manualmente o campo Destaque (mudar 1 palavra)
  - Reabrir a revisão na app (sem fechar a app, navegar para fora e voltar)
  - **Verificação**: app reflecte a mudança externa (ou mostra prompt — aceitável dependendo da implementação)

- [ ] **T7.6** — Confirmar que MCP `list_days` ignora ficheiros de revisão
  - Ter pelo menos 1 review file e 1 day file
  - Chamar `mcp__bloc__list_days`
  - **Verificação**: só aparecem dias, sem ruído

- [ ] **T7.7** — Marcar specs como `done`
  - Actualizar header de `spec.md`, `plan.md`, `tasks.md` para `**Status**: done`
  - **Verificação**: 3 ficheiros consistentes

---

### Notas

- **Não comitar** durante a implementação — só no fim, com mensagem única descrevendo a feature.
- **Não fazer deploy** automaticamente. O utilizador pediu explicitamente para esperar.
- **Paridade markdown**: ao tocar T2.1 ou T3.2, validar imediatamente o byte-diff antes de avançar.
- **Não adicionar funcionalidades fora do scope** (visualização semanal no calendário, MCP tools de review, comparações entre semanas, etc.) — ficaram out-of-scope na spec.

---

## v2 — Tasks (2026-04-29)

> Mesma regra de ordem: schema MD primeiro (paridade), depois stores, depois UI. Won't-do é Layer 1 (afecta todos os dias) — começa por aí. A re-implementação da fase Migrate vem por último.

### v2.1 — Schema won't-do (paridade renderer + MCP)

- [ ] **V1.1** — Acrescentar `wontDo?` + `wontDoAt?` ao tipo `Task` em `src/renderer/stores/taskStore.ts`
  - **Verificação**: type-check ok; campos opcionais não quebram código existente

- [ ] **V1.2** — Estender parser/serializer em `src/main/services/markdownSerializer.ts`
  - Parser: regex de checkbox passa de `\[([ x])\]` para `\[([ x-])\]`; mapear `-` → `wontDo: true`
  - Parser: extrair `@wontDoAt:<n>` para `wontDoAt`
  - Serializer: escolher `[-]` quando `wontDo === true` (precedência: completed > wontDo > open, mas guardar campos separados)
  - **Verificação**: round-trip — escrever task com `wontDo: true, wontDoAt: 123` → reler → mesmo objecto

- [ ] **V1.3** — Espelhar parser/serializer em `mcp-server/src/markdown.ts` (paridade obrigatória)
  - Mesmas mudanças que V1.2; tipo `TaskData` MCP ganha os campos
  - **Verificação**: `cd mcp-server && npm run build` ok; criar 1 ficheiro de teste, parsear no main e no MCP, diff dos resultados

- [ ] **V1.4** — Filtrar won't-do em queries MCP de pendentes
  - `mcp-server/src/index.ts`: `list_pending_tasks` ignora `wontDo === true`
  - **Verificação**: criar fixture com 3 tasks, marcar 1 wontDo no MD, chamar tool — só vêm 2

### v2.2 — taskStore: won't-do action + filtragem

- [ ] **V2.1** — Acrescentar `markWontDo(storeKey, taskId)` em `taskStore.ts`
  - Idempotente; setta `wontDo: true, wontDoAt: Date.now()`
  - Walks subtasks também? **Decisão**: NÃO. Won't-do é per-task; subtasks ficam como estão. (User pode marcar separadamente.)
  - **Verificação**: type-check; chamar de DevTools, ler `taskStore.tasks[storeKey]` antes/depois

- [ ] **V2.2** — Filtrar `wontDo` em `getPendingByBlock`
  - Adicionar guard em `collectFromList` (`if (t.wontDo) return` — não recolhe nem desce em subtasks de won't-do? Sim, descem; subtasks têm decisão própria. Re-leitura: descer mas não adicionar a parent.)
  - **Verificação**: criar 1 task wontDo + 1 normal, chamar `getPendingByBlock()`, confirmar que só a normal aparece

- [ ] **V2.3** — Renderização visual de won't-do em `TaskItem` (ou equivalente)
  - Localizar componente — provavelmente `src/renderer/components/tasks/TaskItem.tsx` (verificar antes)
  - Adicionar `line-through opacity-60` quando `task.wontDo === true`
  - Tooltip "Marcada como não-fazer em DD/MM" se houver `wontDoAt`
  - **Verificação**: marcar uma task como wontDo via DevTools (`useTaskStore.getState().markWontDo(...)`) — ver imediatamente no dia barrada

### v2.3 — weeklyReviewStore: applyMigration v2

- [ ] **V3.1** — Re-implementar `applyMigration(week)` em `weeklyReviewStore.ts`
  - Lógica conforme `plan.md` → "v2 → Layer 2 → weeklyReviewStore"
  - Helper local `sameWeekdayInWeekOf(originDate, nextWeekMonday)` — testar isolado
  - Cache `blockMap` por sessão de migração (Map local à invocação) para garantir 1 bloco recriado por bloco origem
  - Degradação graceful se bloco origem não existir
  - **Verificação**: 3 tarefas no mesmo bloco origem → 1 só bloco recriado em W+1 com 3 refs

- [ ] **V3.2** — Estender `applyMassDecision(week, decision, taskIds?)` para aceitar lista opcional
  - Se `taskIds` ausente, comportamento actual (todas as decisões)
  - Se presente, só itera essa lista
  - **Verificação**: chamar com lista de 2 IDs num grupo de 5 — só 2 ficam afectados

### v2.4 — UI da fase Migrate

- [ ] **V4.1** — Re-implementar `MigratePhase.tsx`
  - Data source: `useTaskStore(s => s.getPendingByBlock())` em vez de `getMigrationItems(weekStart, weekEnd)`
  - Render por grupo: header com `Layers` icon + título resolvido + 3 botões de mass-action por grupo
  - Cada tarefa: row com texto + label de data origem (ex: "29 Abr · há 5 dias") + 3 botões de override
  - Acção em massa "aplicar a todas" continua a existir, mas agora trabalha sobre todos os grupos
  - Remover dependência de `getMigrationItems` (já estava removida em v1 patch)
  - **Verificação**: visual — abrir review, ver tarefas agrupadas por bloco com data origem visível; clicar mass-action de grupo só afecta esse grupo

- [ ] **V4.2** — Confirmar que `applyMigration` é disparada ao avançar de fase 2 para 3 (já feito no patch anterior)
  - **Verificação**: avançar via footer, confirmar refs criadas + bloco recriado

### v2.5 — Reflect (já implementado)

- [x] **V5.1** — Reflect mostra duas colunas (Realizado / Por fechar) sem sidebar drag
- [x] **V5.2** — Footer do wizard é única fonte de Avançar/Anterior

### v2.6 — Verificação end-to-end (v2)

- [ ] **V6.1** — `npm run build` (root) + `cd mcp-server && npm run build` — ambos sem erros

- [ ] **V6.2** — Fluxo manual completo
  1. Criar 2-3 tarefas em dias passados (não só semana revista) com bloco
  2. Iniciar revisão; fase Migrate mostra todas, agrupadas por bloco
  3. Marcar grupo todo "Mover" via mass-action; ver visual aplicado às 3 tarefas
  4. Marcar 1 individual "Descartar" (override do grupo)
  5. Avançar para fase 3 → migração aplica
  6. Verificar:
     - Origem: 1 task barrada (won't-do); 2 tasks intactas (refs criadas em W+1)
     - W+1: 1 bloco recriado no mesmo dia-da-semana e hora; com 2 refs lá dentro
  7. Avançar para fase 4 → ver bloco recriado no calendário do `WeeklyPlanningView`

- [ ] **V6.3** — Round-trip MD com won't-do
  - Após V6.2, abrir ficheiro do dia origem em editor externo
  - Confirmar que tarefa descartada está como `- [-] X @wontDoAt:<n>`
  - Editar `[-]` para `[ ]`, salvar
  - Reabrir app — task volta a aparecer como pendente

- [ ] **V6.4** — Paridade MCP
  - Após V6.2, chamar `mcp__bloc__read_day` para o dia origem — confirmar `wontDo: true` no objecto retornado
  - Chamar `mcp__bloc__list_pending_tasks` — won't-do não deve aparecer

- [ ] **V6.5** — Edge cases
  - Bloco origem foi removido antes de aplicar: tarefa cai como standalone em W+1 (sem erro)
  - Aplicar migração quando há 0 tarefas pendentes: `{moved: 0, kept: 0, discarded: 0}` sem efeito
  - Tarefa de >4 semanas atrás: aparece e é migrada normalmente

- [ ] **V6.6** — Marcar v2 como done
  - Header dos 3 ficheiros: `**Status**: done (v2)`
  - **Verificação**: 3 ficheiros consistentes
