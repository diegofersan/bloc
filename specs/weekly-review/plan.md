---
**Status**: done (v2)
**Spec**: ./spec.md
**Última iteração**: 2026-04-29 (v2 — migração por bloco/projecto)
---

# Revisão Semanal — Plano técnico

## Resumo da abordagem

Substituímos `/week` por `/review`. A rota orquestra um wizard de 4 fases: as 3 primeiras são novas (Look back / Migrate / Reflect) e a 4ª reaproveita inteiramente `WeeklyPlanningView` em modo embutido. Cada revisão é persistida num ficheiro markdown próprio (`YYYY-Www-review.md`) ao lado dos ficheiros diários, com um parser dedicado em paralelo nos dois layers (renderer + MCP) para manter a invariante de paridade — embora não exponhamos tools MCP nesta feature, o parser MCP existe para que tools futuras sejam um wire-up. Estado intermédio vive numa `weeklyReviewStore` Zustand persistida em localStorage como cache, com escrita debounced ao MD via novo IPC.

A acção da fase Migrate reaproveita os mecanismos existentes: `createTaskRef` para "mover", `removeTask` para "descartar", no-op para "manter". A fase Plan invoca `WeeklyPlanningView` com a semana = semana seguinte à revista, e as refs criadas pela migração já estão lá quando a vista carrega.

## Layer 1 — Schema Markdown (iCloud)

### Localização e nomeação
- **Pasta**: `~/Library/Mobile Documents/com~apple~CloudDocs/Bloc[-Dev]/<YYYY>/`
- **Nome**: `<YYYY>-W<ww>-review.md` (ex: `2026-W17-review.md`). Pattern não colide com `\d{4}-\d{2}-\d{2}\.md` usado em `listDayFiles` — ficheiros de revisão são invisíveis aos parsers existentes.
- **YYYY** = ano da segunda-feira da semana. **ww** = ISO week number, zero-padded.

### Estrutura do ficheiro

```markdown
---
week: 2026-W17
weekStart: 2026-04-27
weekEnd: 2026-05-03
status: draft
currentPhase: 2
createdAt: 1714435200000
updatedAt: 1714435800000
---

## Migrate

- next-week <!--@taskId:uuid @originDate:2026-04-29 @snapshot:"Refactor parser"-->
- keep <!--@taskId:uuid @originDate:2026-04-30 @snapshot:"Email cliente"-->
- discard <!--@taskId:uuid @originDate:2026-04-28 @snapshot:"Ler artigo"-->

## Reflect

### Destaque

Consegui finalmente fechar [Refactor parser](bloc://task/uuid@2026-04-29). Texto livre à volta.

### Obstáculo

Demasiadas reuniões na [quinta](bloc://day/2026-04-30).

### Intenção

Bloco de foco profundo às 09:00 todos os dias.
```

**Notas**:
- **Look back não é serializado** — stats são derivadas dos ficheiros diários a cada visita.
- **Plan não é serializado** — output da fase Plan vive nos ficheiros diários da semana seguinte (refs criadas via fluxo existente).
- **Chips em Reflect**: sintaxe markdown standard `[texto](bloc://<kind>/<id>@<date>)` onde `kind ∈ {task, block, day}`. Renderiza em qualquer viewer MD; parser regex-friendly.
- **Status quando selada**: `status: sealed` + campo `sealedAt: <timestamp>` adicionado ao frontmatter.

### Migração de ficheiros existentes
N/A — feature nova, sem ficheiros pré-existentes a migrar.

## Layer 2 — Stores Zustand (renderer)

### Nova store: `src/renderer/stores/weeklyReviewStore.ts`

```typescript
export type ReviewPhase = 1 | 2 | 3 | 4
export type ReviewStatus = 'draft' | 'sealed'
export type MigrationDecision = 'next-week' | 'keep' | 'discard'

export interface MigrationItem {
  taskId: string
  originDate: string
  titleSnapshot: string
}

export interface WeeklyReview {
  weekStart: string  // YYYY-MM-DD (Monday)
  weekEnd: string    // YYYY-MM-DD (Sunday)
  status: ReviewStatus
  currentPhase: ReviewPhase
  migrationDecisions: Record<string, MigrationDecision>  // taskId -> decision
  reflectHighlight: string
  reflectObstacle: string
  reflectIntention: string
  createdAt: number
  updatedAt: number
  sealedAt?: number
}

interface WeeklyReviewState {
  reviews: Record<string, WeeklyReview>   // by weekStart
  activeWeekStart: string | null

  loadReview: (weekStart: string) => Promise<WeeklyReview | null>
  startReview: (weekStart: string) => WeeklyReview
  setPhase: (weekStart: string, phase: ReviewPhase) => void
  setMigrationDecision: (weekStart: string, taskId: string, d: MigrationDecision) => void
  applyMassDecision: (weekStart: string, d: MigrationDecision, taskIds: string[]) => void
  setReflectField: (weekStart: string, field: 'highlight'|'obstacle'|'intention', text: string) => void
  applyMigration: (weekStart: string) => Promise<{ moved: number; discarded: number; kept: number }>
  seal: (weekStart: string) => Promise<void>
  discardDraft: (weekStart: string) => Promise<void>
  getActiveDraft: () => WeeklyReview | null
}
```

**Persistência**:
- `persist()` com `name: 'bloc-weekly-reviews'`, `version: 1`. Persiste `reviews` e `activeWeekStart` em localStorage como cache.
- **MD é source of truth**: cada mutação dispara `debouncedWriteReview(weekStart)` (300ms) → IPC → ficheiro.
- Ao montar `/review` para uma semana: chama `loadReview(weekStart)` que tenta IPC `icloud:read-review`; se há ficheiro, reidrata `reviews[weekStart]`; se não há, devolve null e UI mostra estado "ainda não iniciada".

**Selectors derivados** (helpers no mesmo ficheiro, não estado):
- `selectMigrationCounts(review)` → `{ next: n, keep: n, discard: n, undecided: n }`
- `selectIsSealed(review)` → boolean

### Novo serviço: `src/renderer/services/weekStats.ts`

Computa stats locais para a fase Look back, sem ir aos ficheiros (lê de `taskStore`, `pomodoroStore`, `timeBlockStore`):

```typescript
export interface WeekStats {
  weekStart: string
  weekEnd: string
  totalTasks: number
  completedTasks: number
  pendingTasks: number  // == migrationItems.length
  completionRate: number  // 0..1
  totalDistractions: number
  totalBlocks: number
  totalBlockMinutes: number
  totalPomodoros: number
  daysWithActivity: number  // dias com ≥ 1 task ou bloco
}

export function computeWeekStats(weekStart: string, weekEnd: string): WeekStats
export function getMigrationItems(weekStart: string, weekEnd: string): MigrationItem[]
```

`getMigrationItems` percorre `taskStore.tasks` filtrando por datas no range e devolve as não-completed (incluindo block-tasks via storeKey `date__block__id`).

### Reuso (Phase 4): `weeklyPlanningUiStore` permanece como está.

## Layer 3 — IPC main↔renderer

### Novos handlers em `src/main/ipc/syncHandlers.ts`

```typescript
ipcMain.handle('icloud:read-review', (_e, weekStart: string): WeeklyReviewData | null)
ipcMain.handle('icloud:write-review', (_e, data: WeeklyReviewData): boolean)
ipcMain.handle('icloud:list-reviews', (): string[])  // weekStarts dos ficheiros existentes
```

Onde `WeeklyReviewData` é o tipo serializável (idêntico em forma a `WeeklyReview` da store).

### Novos helpers em `src/main/services/icloud.ts`

```typescript
function getReviewFilePath(weekStart: string): string  // computa YYYY/YYYY-Www-review.md
function readReviewFile(weekStart: string): string | null
function writeReviewFile(weekStart: string, content: string): void
function listReviewFiles(): string[]  // devolve weekStarts (YYYY-MM-DD da segunda)
```

**Importante**: `listDayFiles` mantém regex `^\d{4}-\d{2}-\d{2}\.md$` — review files são ignorados, sem alterar comportamento existente.

### Watch
**Não adicionamos** review files ao `icloud:watch-dates` neste round. Justificação: revisões são editadas num único cliente de cada vez (não há colaboração); polling de daily files é suficiente. Pode ser adicionado depois se aparecer caso de uso.

### Preload
Expor 3 novos métodos em `src/preload/index.ts` no objecto `electron.ipcRenderer.invoke` ou no namespace existente (qualquer que seja o padrão actual).

## Layer 4 — MCP server (`mcp-server/`)

**Regra de paridade**: Layer 1 mudou (formato novo de ficheiro markdown). Adicionamos parser/serializer em `mcp-server/src/markdown.ts` para que escritas futuras a partir de tools MCP usem o mesmo formato. **Não expomos tools nesta feature** — fica preparado.

### Adições a `mcp-server/src/markdown.ts`
- Tipo `WeeklyReviewData` (idêntico ao do main).
- `serializeReview(data: WeeklyReviewData): string`
- `deserializeReview(content: string): WeeklyReviewData`

### Adições a `mcp-server/src/storage.ts` (helpers de I/O)
- `getReviewFilePath(weekStart): string`
- `readReviewFile(weekStart): string | null`

### `mcp-server/src/index.ts`
- **Sem novas tools nesta feature.**
- Confirmar que `read_week`, `read_day`, `list_days` continuam a filtrar por pattern de ficheiro diário e ignoram `*-review.md`.

## UI / componentes

### Rotas (`src/renderer/App.tsx`)
- `/review` → `<ReviewView />` (sem param: vai para selector se não há draft activo, senão retoma)
- `/review/:weekStart` → `<ReviewView />` (semana específica)
- Atalho `⌘⇧W` → `navigate('/review')` (substitui `/week`)
- **Remover** rotas `/week` e `/week/:weekStart` (componente `WeeklyPlanningView` continua a existir, é embutido na fase 4).

### Toolbar do CalendarView (`src/renderer/views/CalendarView.tsx:121-127`)
- Ícone `CalendarDays` continua, mas:
  - `onClick` → `navigate('/review')`
  - `aria-label`/`title` → "Revisão semanal (⌘⇧W)"

### Novos componentes em `src/renderer/components/review/`

```
ReviewView.tsx           // orquestrador: selector inicial + wizard, header com progress bar
WeekSelector.tsx         // date picker para escolher semana, com banner "draft em curso"
ReviewWizard.tsx         // shell das 4 fases, com nav prev/next e indicador "Fase X de 4"
LookBackPhase.tsx        // stats grid, link para Migrate, botão "Avançar"
MigratePhase.tsx         // lista de tarefas pendentes, decisões, acção em massa, CTA confirmar
ReflectPhase.tsx         // 3 secções (Destaque/Obstáculo/Intenção) + sidebar de items
ReflectField.tsx         // textarea + drag target + chip rendering em modo preview
WeekItemsSidebar.tsx     // sidebar com tasks completas e blocos da semana, draggable
PlanPhase.tsx            // wrapper que reusa WeeklyPlanningView com semana = weekStart + 7
SealedReviewView.tsx     // render read-only de uma revisão selada
```

### Drag-and-drop em ReflectField
- **Padrão**: HTML5 native (consistente com weekly-planning existente que usa `dragKind` na UI store).
- **Origem**: `WeekItemsSidebar` define `draggable="true"` em cada item, com `dataTransfer.setData('application/bloc-item', JSON.stringify({kind, id, date, title}))`.
- **Destino**: `ReflectField` é um `<textarea>` com handlers `onDragOver` (preventDefault) e `onDrop` (lê `dataTransfer`, insere markdown link no cursor: `[title](bloc://task/uuid@date)`).
- **Render preview**: quando o campo perde o foco (ou em modo selada), parsing do texto: regex `/\[([^\]]+)\]\(bloc:\/\/(task|block|day)\/([^@]+)@(\d{4}-\d{2}-\d{2})\)/g` → substitui matches por chips React inline (clicar = `navigate('/day/<date>')`).
- **Edição**: voltar a focar = volta ao textarea raw.

### Auto-save
- Debounce 300ms em qualquer mudança da review (typing, decisão, fase).
- Visual: pequeno texto "Guardado" no header do wizard, com ícone check, fade in/out 1s.

### Estados
- **Loading**: spinner enquanto `loadReview` está pending.
- **Empty**: WeekSelector com banner se há draft de outra semana ("Tens uma revisão em curso de 27 Abr – 3 Mai. Continuar / Recomeçar").
- **Sealed**: SealedReviewView, sem botões de edição, com pill "Selada em DD/MM" no header.
- **Erro IPC**: toast "Falhou guardar revisão. Tenta novamente." + retry implícito no próximo debounce.

### Atalhos teclado dentro do wizard
- `→` / `←`: avançar / voltar fase (se permitido)
- `Esc`: voltar ao calendário (com confirmação se há decisões não confirmadas em Migrate)

## Verificação

### Manual (golden path)
1. `npm run dev`. Abrir app, clicar ícone `CalendarDays` no calendário. Aterragem em `/review` com selector pré-preenchido na semana anterior.
2. Avançar para fase 1 (Look back). Confirmar que stats batem com a soma manual de 1-2 dias da semana (verificar no DevTools store ou nos MD files directamente).
3. Avançar para fase 2 (Migrate). Confirmar que aparecem todas as pendentes da semana. Aplicar acção em massa "mover". Confirmar.
4. Avançar para fase 3 (Reflect). Arrastar 1 task da sidebar para o campo Destaque. Confirmar que aparece chip. Clicar no chip → navega para o dia. Voltar.
5. Avançar para fase 4 (Plan). Confirmar que `WeeklyPlanningView` carrega a semana seguinte e que as refs criadas no passo 3 já aparecem no Monday da próxima semana.
6. Concluir revisão. Voltar a `/review/<weekStart>` → ver versão selada read-only.

### Cenários iCloud
7. Abrir o ficheiro `~/Library/Mobile Documents/.../Bloc-Dev/2026/2026-W17-review.md` num editor externo. Confirmar que a estrutura corresponde ao formato planeado. Editar manualmente o texto de Reflect, gravar. Re-abrir a revisão na app — o texto editado aparece (via reload).
8. Confirmar que `listDayFiles()` continua a devolver só dias, não revisões (testar via MCP `list_days` ou abrir DevTools no main).

### Persistência e retomar
9. Iniciar revisão da semana A, avançar até fase 2, fazer 2 decisões. Fechar app. Reabrir. Aterragem directa em `/review` mostra banner "draft em curso". Continuar → estado preservado.
10. Tentar iniciar revisão da semana B com draft de A activa. Confirmar prompt "tens uma revisão em curso de A — descartar para começar B?".

### Edge cases
11. Semana sem actividade nenhuma: stats a zero, fase Migrate sem items, fluxo continua.
12. Semana com >50 pendentes: scroll vertical funciona, performance OK.
13. Reabrir revisão selada: tentar editar campo Reflect — bloqueado (read-only).

### Automatizada
- **Type-check**: `npm run typecheck` (ou `npm run build`) sem erros.
- **MCP build**: `cd mcp-server && npm run build` sem erros.
- Sem testes unitários nesta feature (consistente com o resto do código).

## Riscos e alternativas

### Risco: edição manual do MD durante uma sessão activa
Cenário: utilizador edita `2026-W17-review.md` num editor externo enquanto a revisão está aberta na app. Como não fazemos watch, a app sobrepõe na próxima escrita.
**Mitigação**: ao escrever, comparar mtime — se mtime é mais recente do que o último read, prompt "ficheiro mudou externamente, recarregar?". Aceitável para v1.

### Risco: chips com IDs inexistentes
Cenário: utilizador discarta uma task; um chip que aponta para essa task fica "morto".
**Mitigação**: ao renderizar chip, validar que a task ainda existe em `taskStore.tasks[date]`. Se não, mostrar chip esmaecido com tooltip "item já não existe". Não bloquear render.

### Risco: drag-and-drop em mobile / trackpad sem mouse
**Mitigação**: textarea sempre permite typing manual com sintaxe markdown. Não vamos a touch DnD nesta v1; é desktop-first.

### Alternativa rejeitada: contenteditable rich editor (Tiptap/Slate)
Considerei usar editor rico para chips first-class durante edição. **Rejeitada** porque:
- Complexidade significativa para benefício limitado
- Conflito com fluxo PT-locale e simplicidade do Bloc
- Markdown raw é parseable por humanos (se editar externamente)
- Padrão híbrido (textarea + preview) cobre 90% do valor

### Alternativa rejeitada: 1 ficheiro só por ano com todas as revisões
**Rejeitada** porque um ficheiro por revisão é mais resiliente (corrupção isolada), mais simples de eliminar/arquivar, e alinha com o princípio "1 ficheiro = 1 unidade de tempo".

### Alternativa rejeitada: persistir só no MD (sem store cache)
**Rejeitada** porque cada keystroke teria de aguardar IPC roundtrip → laggy. O cache em store + write debounced é o padrão do resto do app (taskStore, timeBlockStore).

---

## v2 — Migração por bloco/projecto + won't-do (2026-04-29)

A v1 foi entregue mas a fase Migrate revelou três problemas (ver `spec.md` → "Revisão v2"). Esta secção descreve o delta técnico, sobrepondo-se às secções acima onde colidir.

### Layer 1 — Schema Markdown (delta)

**Estado novo de tarefa**: `wontDo`. Persiste no checkbox markdown como `- [-]` (existente: `- [ ]` open, `- [x]` completed). Meta opcional `@wontDoAt:<timestamp>` para ordenação/inspecção.

Exemplo de bloco MD novo:

```markdown
- [-] Tarefa que decidi não fazer @wontDoAt:1714435200000
  - Subtask herdada (mantém o seu próprio estado)
```

**Compatibilidade**: ficheiros antigos continuam a parsear sem mudança. Parser tolerante: qualquer checkbox que não seja `[ ]` nem `[x]` cai num default seguro (open). O caractere `-` é escolhido por:
- Não é standard mas é usado por flavors GitHub-extended e by Obsidian-style task plugins → degrada sem ruído visual em viewers genéricos
- Visualmente distinto de `[x]` num plain-text viewer
- Inequívoco no parser regex: `\[([ x-])\]`

**Sem mudança a `*-review.md`**: a v1 já guarda decisões `next-week | keep | discard`. Mantemos esses tokens (são metadata da revisão, não estado da tarefa). O facto de "discard" em v2 significar "won't-do" em vez de "delete" é apenas uma mudança de implementação no `applyMigration` — o token MD não muda.

### Layer 2 — Stores (delta)

#### `taskStore.ts`

```ts
// Acrescentar a Task
export interface Task {
  // ... campos existentes
  wontDo?: boolean
  wontDoAt?: number
}

// Acrescentar acção
markWontDo: (storeKey: string, taskId: string) => void
```

Implementação:
- Idempotente — se já está `wontDo: true`, no-op
- Não mexe em `completed` (won't-do e completed são mutuamente exclusivos por construção, mas guardamos os campos separados para preservar histórico)
- Persiste via `persist()` existente

**Filtragem em `getPendingByBlock`**: adicionar `if (t.wontDo) continue` no início de `collectFromList` para excluir won't-do das listas de pendentes (mas a tarefa continua visível no dia de origem com strikethrough — a renderização do dia mostra-a, só as queries de "pendentes" a filtram).

#### `weeklyReviewStore.ts`

`applyMigration(weekStart)` é re-implementada. Pseudocódigo:

```ts
applyMigration(week) {
  const review = state.reviews[week]
  const groupedItems = useTaskStore.getState().getPendingByBlock()
  const flatItems = groupedItems.flatMap(g => g.items)

  const nextWeekMonday = addDays(parseISO(review.weekEnd), 1)  // YYYY-MM-DD
  const movePlan = []
  const blockMap = new Map<string, string>()  // originBlockKey → newBlockId

  let moved = 0, kept = 0, discarded = 0

  for (const hit of flatItems) {
    const decision = review.migrationDecisions[hit.task.id] ?? 'next-week'

    if (decision === 'keep') {
      kept++
      continue
    }
    if (decision === 'discard') {
      useTaskStore.getState().markWontDo(hit.storeKey, hit.task.id)
      discarded++
      continue
    }
    // 'next-week'
    const targetDate = sameWeekdayInWeekOf(hit.originDate, nextWeekMonday)

    if (hit.blockId) {
      const originBlockKey = `${hit.originDate}__${hit.blockId}`
      let targetBlockId = blockMap.get(originBlockKey)
      if (!targetBlockId) {
        const originBlock = useTimeBlockStore.getState().blocks[hit.originDate]
          ?.find(b => b.id === hit.blockId)
        if (!originBlock) {
          // Bloco origem desapareceu — degradar para standalone
          movePlan.push({ originDate: hit.storeKey, taskId: hit.task.id, targetDate })
          continue
        }
        // Recriar bloco em targetDate (mesma hora, mesmo título, mesma cor)
        targetBlockId = useTimeBlockStore.getState().addBlock(targetDate, {
          date: targetDate,
          title: originBlock.title,
          startTime: originBlock.startTime,
          endTime: originBlock.endTime,
          color: originBlock.color
        })
        blockMap.set(originBlockKey, targetBlockId)
      }
      movePlan.push({
        originDate: hit.storeKey,                              // date__block__originId
        taskId: hit.task.id,
        targetDate: `${targetDate}__block__${targetBlockId}`
      })
    } else {
      movePlan.push({ originDate: hit.storeKey, taskId: hit.task.id, targetDate })
    }
    moved++
  }

  useTaskStore.getState().distributeTasks(movePlan)
  return { moved, kept, discarded }
}
```

**Notas**:
- `sameWeekdayInWeekOf(originDate, nextWeekMonday)`: helper local. Resolve o weekday ISO da origem (Mon=0..Sun=6) e devolve `addDays(nextWeekMonday, weekday)`. Origens muito antigas continuam a cair num dia coerente da semana W+1.
- Se o bloco origem foi entretanto removido (`originBlock === undefined`), a tarefa é movida como standalone — degradação graceful em vez de erro.
- Idempotência: `distributeTasks` já filtra refs duplicadas. `markWontDo` é idempotente. `addBlock` cria sempre um novo bloco — para evitar duplicação ao re-aplicar, `applyMigration` é chamada **uma vez** por sessão (já é o caso, no momento de avançar de fase 2 para 3).
- **Conflito de horários**: o bloco recriado pode sobrepor-se a um bloco existente em targetDate. Isto não é erro — o `WeeklyPlanningView` já lida com sobreposição visual e o user resolve na fase Plan.

#### `timeBlockStore.ts`
Sem mudanças. Reutiliza `addBlock`, `getBlocksForDate` existentes.

### Layer 3 — IPC (delta)
Sem mudanças. O caminho de escrita continua igual: store muta → debounced write → MD diário (que agora pode incluir `[-]`). O serializer no main muda mas o canal IPC é o mesmo.

### Layer 4 — MCP (delta)

**Paridade obrigatória**: o MCP server **tem de** parsear e serializar o estado won't-do, mesmo que nenhuma tool nova o exponha. Se o renderer escreve `- [-] X @wontDoAt:T`, o MCP `read_day` precisa de devolver isso sem perder informação, e `read_week` / outras tools não devem listar won't-do como pendente.

Mudanças em `mcp-server/src/markdown.ts`:
- Tipo de tarefa MCP ganha `wontDo?: boolean` + `wontDoAt?: number`
- Parser de checkbox aceita `-` além de ` ` e `x`; meta `@wontDoAt:` é extraída
- Serializer escolhe `[ ]`, `[x]`, ou `[-]` com base em `completed` / `wontDo`

Mudanças em `mcp-server/src/index.ts`:
- `list_pending_tasks`: filtrar `t.wontDo === true`
- `read_day` / `read_week`: retornar tasks tal-qual (incluindo flag wontDo) — caller decide o que fazer

Sem novas tools nesta v2.

### UI / componentes (delta)

#### `MigratePhase.tsx` — re-implementação

Substitui a lista chã actual por:
- Data source: `useTaskStore(s => s.getPendingByBlock())` → `PendingGroup[]`
- Cada grupo renderiza:
  - Header com ícone `Layers` + título do bloco resolvido (`useTimeBlockStore` lookup) ou "Sem bloco"
  - 3 botões de acção em massa (Mover/Manter/Descartar) que disparam `applyMassDecisionForGroup(week, blockId, decision)` — nova selector que itera só os taskIds do grupo
  - Lista de tarefas do grupo, cada uma com 3 botões individuais (override do grupo)
- Mostra também a `originDate` em cada tarefa (formato curto, ex: "29 Abr") porque o âmbito agora atravessa semanas — sem isso o user perde noção de "quão velha é esta tarefa"

#### `weeklyReviewStore.ts` — pequeno ajuste
- `applyMassDecision(week, decision, taskIds?: string[])`: aceitar `taskIds` opcional para mass-action por grupo. Se ausente, comportamento actual (todas as decisões)

#### Renderização da tarefa won't-do nos dias

Onde quer que `Task` seja renderizada (DayView, etc.), adicionar:
- Texto com `line-through` + opacity reduzida quando `task.wontDo === true`
- Tooltip "Marcada como não-fazer em DD/MM" quando aplicável

A inspecção dos componentes existentes faz parte das tasks (provavelmente `src/renderer/components/tasks/TaskItem.tsx` ou equivalente).

### Verificação adicional (v2)

1. Criar tarefa em data antiga (ex: 2 semanas atrás), confirmar que aparece na fase Migrate
2. Criar 3 tarefas no mesmo bloco origem; aplicar "Mover" em massa; confirmar que **um único** bloco novo é criado em W+1 com as 3 refs
3. Aplicar "Descartar" numa tarefa; confirmar:
   - Tarefa fica barrada no dia de origem
   - Não aparece em `getPendingByBlock` na próxima visita
   - Ficheiro MD do dia mostra `- [-]` + `@wontDoAt:`
4. Reabrir o ficheiro MD num editor externo, alterar `[-]` para `[ ]`, recarregar — tarefa volta a estar pendente (parser tolerante)
5. Round-trip MCP: `read_day` num ficheiro com won't-do retorna o flag; `list_pending_tasks` ignora-a
6. Bloco origem foi apagado entre a abertura da revisão e o apply; "Mover" degrada-se para standalone sem erro

### Riscos v2

- **Bloco recriado conflita com bloco existente**: aceita-se sobreposição visual; user resolve em fase Plan. Não bloqueia migração.
- **Tarefa muito antiga (meses) ressurge inesperadamente**: aceita-se. É feature, não bug — o objectivo é forçar a decisão sobre work em aberto. Se virar problema, adiciona-se cap configurável.
- **Edição manual do MD com `[-]`**: parser deve tolerar. Caso o user escreva `[-]` à mão sem `@wontDoAt`, o flag é setado mas timestamp fica `undefined` — aceitável.
