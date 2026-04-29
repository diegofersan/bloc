# Weekly Planning — Plano técnico

**Status**: plan
**Spec**: ./spec.md

## Resumo da abordagem

Feature com paridade total renderer↔MCP. Ambos os lados conseguem ler a semana, listar pendentes, criar referências e correr auto-distribuição. Para isso:

1. **Layer 1 muda**: adiciona secção `## Referências` ao formato MD (representa `taskRefs`).
2. **Layer 4 muda**: MCP ganha 5 tools novas + parser actualizado.
3. **Pasta `shared/`** é introduzida na raiz com tipos, função pura `priorityScore` e função pura `distribute(...)`. Renderer e MCP importam de lá. Uma fonte de verdade para o algoritmo.
4. **Bonus**: passar refs ao MD elimina o R2 do plan anterior — refs sincronizam entre dispositivos via iCloud.

Reutiliza-se o que já existe: `timeBlockStore` (eventos GC), `gcal:list-events`, `icloud:read-day`, `icloud:watch-dates`, padrão de DnD HTML5 do `FlowQueueView`.

## Layer 0 — Pacote partilhado `shared/`

Nova pasta `shared/` na raiz, com **TS puro, zero dependências externas**.

```
shared/
  types.ts            // Task, TaskRef, TimeBlock, DayFileData (single source)
  priority.ts         // priorityScore(task, ctx) — função pura
  distribute.ts       // distribute(input, opts) → assignments[]
  refs.ts             // helpers: dedupKey(ref), isSameRef(a, b)
```

**Integração**:
- **Renderer**: path alias em `tsconfig.web.json` — `"@shared/*": ["../shared/*"]`. Imports tipo `import { priorityScore } from '@shared/priority'`.
- **MCP** (`mcp-server/`): adicionar `"../shared/**/*"` ao `include` em `mcp-server/tsconfig.json`. Como `mcp-server` é publicado standalone, o `tsc` vai compilar `shared/` para dentro de `mcp-server/dist/shared/` no build, e o pacote npm contém-no naturalmente (já está no `files: ["dist"]`).
- **Main** (`src/main/...`): se precisar, importa via path relativo. Esta feature não obriga a tocar no main directamente.

**Não migra ainda** o `markdownSerializer` para `shared/` — fica como follow-up (eliminaria a duplicação restante). Esta feature só introduz a infra; futuras features beneficiam.

## Layer 1 — Schema Markdown (iCloud)

### Mudança ao formato

Adiciona secção `## Referências` ao ficheiro `YYYY-MM-DD.md`. **Posição**: depois de `## Tarefas`, antes de `## Distrações`.

**Formato de cada linha**:
```markdown
## Referências
- "Snapshot do título" <!--@refId:UUID @origin:YYYY-MM-DD @taskId:UUID @added:TIMESTAMP-->
```

- O texto entre aspas é um **snapshot** do título da task de origem (best-effort, para o ficheiro continuar humano-legível). É reescrito na próxima save quando a origem é resolvida; pode ficar stale até lá.
- Source of truth da completion é a **task de origem** — TaskRef não tem `[ ]`/`[x]`. Resolvido em runtime.

### Migração

Parser tolerante: ficheiros sem `## Referências` continuam a ler como antes (refs vazias). Ficheiros novos da versão antiga não perdem nada — secções desconhecidas são preservadas no parse-and-rewrite (verificar — possivelmente já é o caso). **Acção**: confirmar e, se não for, adicionar.

### Implicação para parsing

- Regex actual `^---\n([\s\S]*?)\n---\n?([\s\S]*)$` continua a funcionar.
- Adicionar handler para a secção `## Referências` no deserialize.
- No serialize, inserir após `## Tarefas` se houver refs no estado.

## Layer 2 — Stores Zustand (renderer)

### `settingsStore` — alterado
- Campo: `weekViewDays: 5 | 7` (default `7`).
- Acção: `setWeekViewDays(value)`.
- `persist()` existente; bump versão se necessário, migração ausente→7.

### `taskStore` — actualizado para serializar refs

`taskRefs: Record<string, TaskRef[]>` continua existindo, mas agora a **fonte de verdade é o MD** (igual a `tasks`):
- Boot/sync hidrata `taskRefs` lendo `## Referências` de cada `read_day`.
- Acções `createTaskRef`, `toggleTaskRef`, `removeTaskRef`: além de mutar o estado, **disparam `write_day`** do dia afectado (mesmo padrão das acções de tasks/blocks actuais).
- `getResolvedTask(ref)` mantém-se (resolve origem para mostrar título/completion actuais).
- `instanceHistory` na task de origem: mantido em memória + persistido em `localStorage`. **Não** migrar para MD agora (mais um campo no schema, fora de scope). Se origem está num dispositivo que nunca viu uma ref, `instanceHistory` será reconstruída de `taskRefs` ao próximo boot (audit do scoring continua estável).

Helpers novos (puros):
- `getPendingByBlock(): Array<{ blockKey: string; blockTitle: string; tasks: Task[] }>` — agrega pendentes cross-day, agrupa por bloco-pai.

Acções bulk:
- `distributeTasks(plan: Array<{originDate, taskId, targetDate}>): { applied, skipped }` — itera `createTaskRef`, deduplica refs já existentes, escreve cada dia destino apenas uma vez no fim (batch write).
- `undoLastDistribution()` — reverte últimos refs criados (snapshot pré-aplicação) + reescreve MDs afectados.

### `weeklyPlanningUiStore` — NOVO (UI efémera)

```ts
{
  weekStart: string                     // YYYY-MM-DD da segunda
  draggingTaskRef: { originDate, taskId } | null
  autoDistPreview: Array<{ originDate, taskId, targetDate, score }> | null
  isLoadingWeek: boolean
}
```

Persiste apenas `weekStart` (sobrevive a refresh). Resto efémero.

## Layer 3 — IPC main↔renderer

**Sem novas APIs.** As existentes cobrem tudo:
- `gcal:list-events` 7× em paralelo (uma por dia).
- `icloud:read-day` 7× em paralelo via `Promise.all`.
- `icloud:watch-dates([7 dates])` ao entrar; substitui ao navegar entre semanas; restaura ao sair.

**Alteração mínima necessária no main**: o serializer (`src/main/services/markdownSerializer.ts`) precisa de aprender a secção `## Referências`. Mesma mudança que o MCP fará — idealmente o código sai daqui também via `shared/`, mas neste passo só duplicamos a lógica de parse/serialize de refs (com o objectivo de eventual unificação).

## Layer 4 — MCP server (`mcp-server/`)

### Parser/Serializer
`mcp-server/src/markdown.ts` ganha suporte a `## Referências`. **Paridade obrigatória** com o serializer do renderer — mesmas chaves, mesma ordem.

### Storage helpers
`mcp-server/src/storage.ts`:
- `readWeek(weekStartDate, days = 7)` — lê N ficheiros em paralelo.
- Helpers já existentes (`readDay`, `writeDay`) suportam o novo schema automaticamente após o update do `markdown.ts`.

### Tools novas

#### `read_week`
- Input: `{ week_start: string, days?: 5 | 7 }`
- Output: `{ start: string, end: string, days: Array<{ date, blocks, tasks, refs, distractions, pomodoros }> }`
- Validações: `week_start` é YYYY-MM-DD; se não for segunda, normaliza ao início de semana ISO.

#### `list_pending_tasks`
- Input: `{ origin_after?: string, block_id?: string, exclude_already_referenced_in_range?: { start, end } }`
- Output: `{ groups: Array<{ block_key, block_title, tasks: Task[] }>, total: number }`
- Iteração: lê todos os ficheiros em `~/Bloc/` (já existe `listDays`), agrega tasks com `completed: false`. Filtros opcionais.

#### `create_task_ref`
- Input: `{ origin_date, task_id, target_date }`
- Side effect: lê `target_date` MD, adiciona ref, escreve. Lê `origin_date` MD para apanhar o título snapshot.
- Validações: task tem de existir e estar pendente; sem dup `(origin_date, task_id)` em `target_date`.
- Output: `{ ref_id, target_date }`.

#### `delete_task_ref`
- Input: `{ target_date, ref_id }`
- Side effect: remove a ref do MD do dia.
- Output: `{ deleted: bool }`.

#### `distribute_tasks_for_week`
- Input: `{ week_start, days?: 5 | 7, dry_run?: boolean, weights?: { age?, instances?, estimate?, blockLoad? } }`
- Lógica:
  1. `read_week(week_start, days)` → estado actual.
  2. `list_pending_tasks({ exclude_already_referenced_in_range: {start, end} })` → backlog.
  3. Calcular score com `priorityScore` (de `shared/priority.ts`, com `weights` opcionais).
  4. `distribute(...)` (de `shared/distribute.ts`) → `assignments[]`.
  5. Se `dry_run`: devolve sem aplicar; senão, faz `create_task_ref` para cada assignment, agregando writes por dia.
- Output: `{ assignments: Array<{ origin_date, task_id, target_date, score }>, applied: number, skipped: number, dry_run: boolean }`.

### Tools existentes — sem regressão
`read_day` já vai retornar refs no payload (campo novo no output). Tools de stats não dependem de refs (verificar). Tools de criação/eliminação de tasks/blocks não tocam em refs.

## UI / componentes (renderer)

### Rota e botão
- Rota nova: `/week/:weekStart?` em `src/renderer/App.tsx`.
- Botão `CalendarDays` (lucide) na toolbar do `CalendarView.tsx` (linhas 113-196) → `navigate('/week')`.
- Atalho: `⌘⇧W` (verificar conflitos antes — `⌘W` é fechar janela em macOS).

### Componentes novos
- `WeeklyPlanningView.tsx` — layout 2 colunas (painel + grelha), header com navegação semanal, toggle 5/7, botão auto-dist.
- `WeekDayColumn.tsx` — header (dia+data, badge "hoje"), lista cronológica de blocos (Bloc + GC), quick actions "+Bloco"/"+Tarefa", drop target.
- `PendingTasksPanel.tsx` — grupos `{blockTitle, tasks}` colapsáveis, item draggable, badge de idade (`3d`) e estimativa.
- `AutoDistributeModal.tsx` — preview de assignments com score, "Aplicar"/"Cancelar"; toast "Desfazer" pós-aplicar.

### DnD
HTML5 nativo (mesmo padrão de `FlowQueueView.tsx`). Sem nova lib.

### Estados
- Loading: skeleton de 7 colunas.
- Backlog vazio: card "Sem pendentes — bom trabalho.".
- Erro GC: banner discreto, não bloqueante.
- Sem GC ligado: nem mostra banner.

### Visual
Tema creme `#f8f7f4`. CSS custom em `@layer base`/`@layer components` (Tailwind v4). GC distinguível (cor sky + ícone "G").

## Verificação

### Manual (golden path com paridade)
1. `npm run dev` + MCP a correr (`node mcp-server/dist/index.js` ou via `.mcp.json`).
2. CalendarView → botão "Planeamento semanal" → grelha aparece.
3. Drag de tarefa pendente → solta num dia → ref aparece nesse dia.
4. **Verificar paridade**: invocar tool MCP `read_day` para esse dia → deve retornar a ref. Inspeccionar `~/Library/Mobile Documents/.../Bloc-Dev/<dia>.md` → deve ter linha em `## Referências`.
5. Apagar a ref via `delete_task_ref` (MCP) → reabrir vista no renderer → ref desaparece (após próximo poll iCloud, 3s).
6. Toggle 5/7 dias funciona, persiste.
7. Criar bloco/tarefa via vista semanal → confirma no MD.
8. `distribute_tasks_for_week` (dry_run: true) → ver assignments → (dry_run: false) → confirmar refs criadas em N dias do MD; renderer reflecte após poll.
9. Auto-dist no renderer (modal) → preview → aplicar → desfazer → confirma idempotência.
10. Navegação ←/→/"Esta semana" actualiza `watch-dates`.

### Edge cases
- Backlog vazio (auto-dist mostra "nada a distribuir").
- Tarefa pendente já com ref no dia escolhido — auto-dist skip.
- Ficheiro MD antigo (sem `## Referências`) — parser tolera, ref criada adiciona secção.
- 2 dispositivos: criar ref num, sync iCloud, abrir noutro — ref aparece.
- Toggle 5/7 durante view aberta — re-render correcto.
- GC desligado.
- MCP cria ref para uma task cuja origem está num dia ainda não lido em memória do renderer — ao tocar no dia, hidrata e mostra.

### Paridade obrigatória
- Test snapshot manual: criar via renderer, ler via MCP `read_day`. Diff esperado = 0 (excepto talvez ordem se houver bug — ordenar por timestamp em ambos).
- Repetir com create via MCP, ler via renderer.

## Riscos e alternativas

### Riscos
- **R1: Snapshot do título stale** — se a origem é renomeada, o snapshot na ref fica desactualizado até next save. **Mitigação**: re-escrever todos os MD com refs quando o título da origem muda (custo aceitável, raro). Listar como follow-up se for irritante.
- **R2: Parser tolerante a secções desconhecidas** — confirmar comportamento actual; se hoje o parse drop secções não-reconhecidas no rewrite, adicionar "passthrough" para evitar perda de dados ao receber MD criado por versão futura.
- **R3: Race condition entre renderer e MCP a escrever o mesmo MD** — `writeDay` faz overwrite atómico (assumido). Se ambos escrevem ao mesmo tempo, last-write-wins. **Mitigação**: aceitável em uso real (raro). Documentar. Considerar lockfile no futuro se for problema.
- **R4: 7× IPC reads no entry da view** — comparable a `readAllDays` no boot, performance OK. Optimizar só se medir lag.
- **R5: Bundle do `shared/` no MCP** — confirmar que `tsc` com `include: ["src/**", "../shared/**"]` produz o `dist/` correcto e o `npm publish` inclui tudo (`files: ["dist"]` cobre).
- **R6: Conflito `⌘W`** com fechar janela. Mitigação: `⌘⇧W`.

### Alternativas consideradas e rejeitadas
- **Workspaces npm com `@bloc/shared`**: mais limpo a longo prazo mas obriga refactor do build/publish do mcp-server. Adiar.
- **Manter refs só em memória/localStorage** (plan anterior): mais simples mas impede MCP. Rejeitado pela decisão do utilizador.
- **Migrar `instanceHistory` para MD**: mais um campo no schema, fora do escopo. Mantém em memória + reconstrução de `taskRefs` no boot.
- **`@dnd-kit/core`**: padrão nativo já é usado; não justifica nova dep só para esta feature.
- **Auto-dist com slot horário**: explicitamente fora.
