# Weekly Planning — Tasks

**Status**: tasks
**Plan**: ./plan.md

## Ordem de execução

> Regra: spike de build → `shared/` → schema MD (renderer + MCP em paralelo) → MCP tools → stores → UI → verificação. **Nunca quebrar paridade**: T3.x toca em ambos os serializers no mesmo passo. Não avançar para T4 sem T3 verde.

---

### 0. Pré-flight — branch e estado

- [x] **T0.1** — Confirmar `git status` limpo, branch `feat/weekly-planning`. Se há `node_modules` desactualizados após pull, correr `npm i` na raiz e em `mcp-server/`.

---

### 1. Spike de build (R5: validar shared/ antes de investir)

- [x] **T1.1** — Criar `shared/types.ts` mínimo (1 export stub). Adicionar `"../shared/**/*"` ao `include` em `mcp-server/tsconfig.json`. Correr `cd mcp-server && npm run build`. **Critério**: `mcp-server/dist/shared/types.js` existe e `node mcp-server/dist/index.js --help` arranca sem erro.
- [x] **T1.2** — Path alias renderer: em `tsconfig.web.json` adicionar `"paths": { "@shared/*": ["../shared/*"] }` e respectivo `baseUrl`. Adicionar mesma resolução ao `electron.vite.config.ts` (alias do Vite). **Critério**: importar `@shared/types` num componente de teste compila e hot-reload funciona.

---

### 2. Pacote `shared/` — conteúdo real

- [x] **T2.1** — `shared/types.ts`: definir `Task`, `TaskRef`, `TimeBlock`, `Distraction`, `DayFileData` consolidando os tipos hoje duplicados entre renderer e MCP. **Critério**: tsc verde em ambos os lados.
- [x] **T2.2** — `shared/refs.ts`: `dedupKey(ref)`, `isSameRef(a, b)`, `makeRefId()`. **Critério**: testes triviais via REPL/script.
- [x] **T2.3** — `shared/priority.ts`: `priorityScore(task, ctx)` conforme fórmula do plan. Pesos como constantes exportadas. **Critério**: input determinístico produz score conhecido.
- [x] **T2.4** — `shared/distribute.ts`: `distribute({ pending, days, weights? })` → `assignments[]`. Round-robin pelos dias com menos refs. Sem I/O. **Critério**: dado backlog fixo + 7 dias vazios, output reprodutível.

---

### 3. Schema MD + serializers (paridade renderer↔MCP)

> Estas tarefas são feitas em pares — nunca commitar mudança a um serializer sem a outra.

- [ ] **T3.1** — Auditar passthrough actual: nos dois parsers, criar ficheiro com secção desconhecida `## Foo`, parse + serialize, ver se sobrevive. Documentar resultado em comment do PR. Se não sobrevive, adicionar `unknownSections: Record<string,string>` em `DayFileData` e preservar.
  - Ficheiros: `mcp-server/src/markdown.ts`, `src/main/services/markdownSerializer.ts`
- [ ] **T3.2** — Parser de `## Referências` no MCP: deserialize linhas para `TaskRef[]`. Snapshot title é descartado na leitura (re-gerado no save). **Critério**: file fixture é parsed correctamente.
  - Ficheiro: `mcp-server/src/markdown.ts`
- [ ] **T3.3** — Serialize de `## Referências` no MCP: insere após `## Tarefas` se houver refs. Resolve título de `originDate` se disponível na invocação (best-effort). **Critério**: round-trip parse→serialize estável.
  - Ficheiro: `mcp-server/src/markdown.ts`
- [ ] **T3.4** — Mesma mudança no serializer do main (paridade). **Critério**: snapshot test — serializar mesmo `DayFileData` em ambos produz string byte-equal (excepto ordering deterministico).
  - Ficheiro: `src/main/services/markdownSerializer.ts`
- [ ] **T3.5** — Teste de paridade: pequeno script em `scripts/check-md-parity.mjs` que pega 1 fixture, parse+serialize com ambos os serializers, faz diff. **Critério**: zero diff. Manter como ferramenta para futuras mudanças.

---

### 4. MCP server — storage + tools

- [ ] **T4.1** — `storage.ts`: `readWeek(weekStartDate, days = 7)` lê N dias em `Promise.all`. **Critério**: input segunda → array com 7 entradas ordenadas.
  - Ficheiro: `mcp-server/src/storage.ts`
- [ ] **T4.2** — Tool `read_week`: registo no `index.ts`, schema Zod (ou equivalente actual), normaliza `week_start` para segunda. **Critério**: chamada via stdio devolve estrutura esperada.
- [ ] **T4.3** — Tool `list_pending_tasks`: itera `listDays`, agrega pendentes, agrupa por bloco-pai, aplica filtros opcionais. **Critério**: dia com 3 pendentes em 2 blocos retorna 2 grupos.
- [ ] **T4.4** — Tool `create_task_ref`: lê `target_date`, valida origem existe + pendente, lê título de origem, escreve. **Critério**: file MD ganha linha em `## Referências`; chamar 2× igual retorna skip.
- [ ] **T4.5** — Tool `delete_task_ref`: remove linha do MD. **Critério**: file perde a linha; idempotente em ref inexistente (devolve `deleted: false`).
- [ ] **T4.6** — Tool `distribute_tasks_for_week`: usa `read_week` + `list_pending_tasks`, importa `priorityScore` e `distribute` de `@shared/...` (ou path relativo `../../shared/...` no MCP). Implementa `dry_run`. **Critério**: dry_run não escreve; non-dry escreve refs nos dias dos assignments; output coerente.
- [ ] **T4.7** — Build mcp-server (`npm run build`), smoke test de cada tool nova via cliente MCP local. **Critério**: 5 tools listadas em `tools/list`; cada uma responde a um input válido.

---

### 5. Stores Zustand (renderer)

- [ ] **T5.1** — `settingsStore`: campo `weekViewDays: 5 | 7` (default 7), setter `setWeekViewDays`. Bumpar versão `persist()` se necessário com migration trivial. **Critério**: alterar valor sobrevive a reload.
  - Ficheiro: `src/renderer/stores/settingsStore.ts`
- [ ] **T5.2** — `taskStore`: hidratar `taskRefs` a partir do MD nos paths que hoje populam `tasks` (procurar `setState` após `read_day`). **Critério**: MD com 1 ref aparece em `taskRefs[date]` após sync.
  - Ficheiro: `src/renderer/stores/taskStore.ts`
- [ ] **T5.3** — `taskStore`: `createTaskRef` / `toggleTaskRef` / `removeTaskRef` passam a chamar `write_day` do destino afectado (mesmo padrão das acções de tasks/blocks). **Critério**: criar ref no renderer → ler MD em disco → ref presente.
- [ ] **T5.4** — `taskStore`: helper `getPendingByBlock()` (puro). **Critério**: estado fixture com pendentes em 2 blocos retorna 2 grupos com counts certos.
- [ ] **T5.5** — `taskStore`: `distributeTasks(plan)` (bulk + dedup + batch write por dia destino) e `undoLastDistribution()` (snapshot revert). **Critério**: aplicar 5 refs em 3 dias → 3 writes, não 5; undo reverte estado e MD.
- [ ] **T5.6** — Novo `weeklyPlanningUiStore` em `src/renderer/stores/weeklyPlanningUiStore.ts`: estado conforme plan, persiste só `weekStart`. **Critério**: navegar para outra semana, reload, volta à mesma semana.

---

### 6. UI — rota, botão e componentes

- [ ] **T6.1** — Rota `/week/:weekStart?` em `src/renderer/App.tsx`. Lazy-load do `WeeklyPlanningView`. **Critério**: navegação manual via URL abre vista vazia.
- [ ] **T6.2** — Botão `CalendarDays` (lucide) na toolbar do `CalendarView.tsx` (linhas 113-196), tooltip "Planeamento semanal", atalho `⌘⇧W` (verificar conflitos no `keyboardShortcuts.ts` ou equivalente antes). **Critério**: clique navega; atalho dispara navegação.
  - Ficheiro: `src/renderer/views/CalendarView.tsx`
- [ ] **T6.3** — Shell de `WeeklyPlanningView.tsx`: layout 2 colunas, header (navegação ←/→/"Esta semana", toggle 5/7, botão "Distribuir automaticamente"), `Promise.all` de read+gcal para a semana, `watch-dates` no mount/unmount. **Critério**: 7 colunas vazias renderizam; navegação muda data; toggle alterna 5/7.
  - Ficheiro: `src/renderer/views/WeeklyPlanningView.tsx`
- [ ] **T6.4** — `WeekDayColumn.tsx`: header (dia+data, badge "hoje"), lista cronológica de blocos (Bloc cor própria, GC sky+ícone), placeholder vazio. **Critério**: dia com 2 blocos + 1 GC mostra 3 entradas ordenadas.
- [ ] **T6.5** — `PendingTasksPanel.tsx`: header com total, grupos colapsáveis a partir de `getPendingByBlock`, item com idade ("3d") e estimativa. **Critério**: backlog de 5 tasks em 2 blocos mostra 2 grupos com counts; collapse/expand persiste durante a sessão.
- [ ] **T6.6** — DnD HTML5 nativo: `draggable` no item de pending, `onDragStart` set no `weeklyPlanningUiStore`, `onDragOver`/`onDrop` em `WeekDayColumn`, dispara `taskStore.createTaskRef`. **Critério**: drag → drop num dia → ref aparece imediatamente; MD updated.
- [ ] **T6.7** — Quick action "+ Bloco" no rodapé de `WeekDayColumn`: mini-modal (título, hora início, duração default 60min, cor). Cria via `timeBlockStore.addBlock`. **Critério**: bloco aparece e MD updated.
- [ ] **T6.8** — Quick action "+ Tarefa": se o dia tem 1 bloco, adiciona à key desse bloco; se >1, abre selector; se 0, cria na key do dia. Usa `taskStore.addTask`. **Critério**: tarefa criada e MD updated.
- [ ] **T6.9** — `AutoDistributeModal.tsx`: ao abrir, calcula plano localmente (mesma lib `@shared/distribute`) **OU** chama tool MCP `distribute_tasks_for_week` com `dry_run: true` (decidir em T6.9 — usar `@shared` directo é mais simples). Mostra preview com score por linha. "Aplicar" chama `taskStore.distributeTasks`. **Critério**: preview consistente; aplicar resulta em refs visíveis; toast com "Desfazer" funciona.
- [ ] **T6.10** — Estados UX: skeleton de 7 colunas no loading; card "Sem pendentes" no painel vazio; banner discreto em erro GC; sem GC ligado, nem mostra banner. **Critério**: cada estado reproduzível em dev.

---

### 7. Verificação

- [ ] **T7.1** — `npm run build` na raiz e em `mcp-server/`. Zero erros tsc. **Critério**: build limpo.
- [ ] **T7.2** — Golden path manual (10 passos do plan, secção Verificação). **Critério**: cada passo OK; anotar issues.
- [ ] **T7.3** — Edge cases (8 do plan): backlog vazio, dup-skip, MD legacy sem secção, 2-device sim (criar via MCP, ver no renderer após poll 3s), toggle durante view, GC desligado, MCP cria ref para origem em dia não-carregado, ficheiro com `## Foo` desconhecida (passthrough).
- [ ] **T7.4** — Paridade serializer (T3.5 re-run): correr `scripts/check-md-parity.mjs` em ≥3 fixtures variadas (com/sem refs, com blocos, com distractions). **Critério**: zero diff.
- [ ] **T7.5** — Paridade end-to-end:
  - (a) renderer cria ref → MCP `read_day` retorna ref → ficheiro MD em disco tem linha em `## Referências`.
  - (b) MCP `create_task_ref` → wait 3s (poll) → ref aparece no renderer sem reload.
  - **Critério**: ambos os caminhos verdes.
- [ ] **T7.6** — `dist/shared/` no pacote MCP: `cd mcp-server && npm pack --dry-run` e confirmar que tarball inclui `dist/shared/*.js`. **Critério**: ficheiros presentes.
- [ ] **T7.7** — Atualizar headers `**Status**: done` em `spec.md`, `plan.md`, `tasks.md`. Resumir entrega ao utilizador. **Não fazer commit** sem pedido explícito.

---

## Notas de execução

- **TaskCreate**: ao entrar na fase 4, criar items na lista de tarefas Claude correspondendo 1:1 a estas T*. Marcar `[x]` aqui à medida que avança.
- **Paridade**: se algures detectares divergência entre os 2 serializers, **pára** e reconcilia antes de prosseguir.
- **Scope creep**: se descobrires necessidade fora do plan (ex: novo campo de task), pergunta antes de adicionar.
- **Build incremental**: após T2 corre tsc; após T3 corre paridade; após T4 corre smoke test MCP; após T5 corre app em dev; após T6 corre golden path.
