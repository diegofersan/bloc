# Pomodoro Transition Alerts — Plano técnico

**Status**: done
**Spec**: ./spec.md

## Resumo da abordagem

Adicionar uma camada de alerta — notificação OS + dock bounce / flashFrame — disparada nas transições já existentes do `pomodoroStore` e `flowStore`. A detecção de transição **já está implementada** em `PomodoroTimer.tsx` e `FlowTimer.tsx` (via `prevStatusRef`/`prevPhaseRef`), pelo que o trabalho concentra-se em criar um serviço novo no renderer e um único canal IPC para o main disparar atenção visual nativa. O som actual fica intocado.

## Layer 1 — Schema Markdown (iCloud)

**Sem alterações.** A feature é puramente de UX/notificação — não afecta o formato dos ficheiros `~/Bloc/YYYY/YYYY-MM-DD.md` nem `Bloc-Blocks.md`. Não há estado novo a persistir nem dados a serializar.

## Layer 2 — Stores Zustand (renderer)

**Sem alterações estruturais.** As transições já existem:

- `pomodoroStore.ts:96-110` — `tick()` transita `working → break` e `break → idle`
- `flowStore.ts:327-360` — `tick()` transita `working → break` e `break → working`

Não adicionamos campos, acções, nem persistência. Os componentes `PomodoroTimer` e `FlowTimer` já observam estas transições (`prevStatusRef` / `prevPhaseRef` em useEffect) — vamos pendurar o novo trigger no mesmo sítio onde hoje se chama `playWorkDoneSound()` / `playBreakDoneSound()`.

## Layer 3 — IPC main↔renderer

### Novo canal

**`alert-attention`** (renderer → main, fire-and-forget via `ipcMain.on`)

- **Input**: nenhum (a chamada significa "chama atenção, qualquer plataforma")
- **Comportamento no main**:
  - macOS: `app.dock?.bounce('critical')` — bounce contínuo até o utilizador focar o Bloc (decisão revista durante teste manual: o pulso único era demasiado subtil)
  - Windows: `mainWindow.flashFrame(true)` (e `flashFrame(false)` quando a janela ganha foco — registado uma vez no setup)
  - Linux: no-op (sem equivalente fiável)
  - **Guard**: se `mainWindow?.isFocused()` for `true`, não faz nada (defesa em profundidade — o renderer também filtra)
- **Sem retorno** — fire-and-forget. Falha silenciosa se main não estiver pronto.

### Reutilizado (já existe)

**`focus-window`** (`main/index.ts:232-237`, exposto como `bloc.focusWindow()` em preload) — usado no `onclick` da notificação para trazer o Bloc para foreground. Sem alterações.

### Setup adicional no main

- No `createWindow()`, registar listener `mainWindow.on('focus', () => mainWindow.flashFrame(false))` para parar o flash do Windows quando o utilizador volta à app.

### Preload

Adicionar em `bloc` (ficheiro `src/preload/index.ts`):

```ts
alertAttention: () => {
  ipcRenderer.send('alert-attention')
}
```

E no tipo correspondente (ver `src/renderer/types/electron.d.ts` ou onde estiver declarado o `window.bloc`).

## Layer 4 — MCP server

**Sem alterações.** O MCP server (`mcp-server/`) lida com leitura/escrita de ficheiros markdown (dias, blocos, tasks). Notificações de transições do timer são puramente de UX local e não fazem parte da superfície que o MCP expõe.

> Confirmado: nenhuma tool MCP toca em `pomodoroStore`/`flowStore` ou nas transições.

## UI / componentes

### Novo serviço — `src/renderer/services/transitionAlert.ts`

Módulo único responsável por disparar o pulso visual. Mantém-se separado de `notificationSound.ts` (que continua a tratar do som).

API:

```ts
export function alertWorkDone(): void
export function alertBreakDone(): void
```

Comportamento de cada função:

1. Se `document.hasFocus()` → **return** (Bloc está em foreground, som basta)
2. Tenta criar `new Notification(title, { body, icon, silent: true })`
   - `silent: true` porque o som já é tratado por `notificationSound.ts`
   - `icon`: caminho do ícone da app (reutilizado — não criamos ícones novos para manter o scope pequeno; a distinção fica no título/corpo)
   - **`alertWorkDone`**: title `'Bloc — Hora da pausa'`, body com a duração da pausa (ex: `'Pausa de 5 min'`)
   - **`alertBreakDone`**: title `'Bloc — De volta ao foco'`, body curto (ex: `'A pausa terminou.'`)
3. `notification.onclick = () => window.bloc?.focusWindow()`
4. Chama `window.bloc?.alertAttention()` (dock bounce / flashFrame)
5. Falha silenciosa se Notification API estiver indisponível ou permissão negada — outras camadas (som) continuam a funcionar

A duração da pausa é lida via parâmetro (`alertWorkDone(breakMinutes: number)`) para o body ser preciso. Cada timer passa o valor que tem.

### Componentes alterados

**`src/renderer/components/PomodoroTimer.tsx`** (linhas 38-47)

No `useEffect` de transições, adicionar a chamada ao alerta a seguir ao som:

```ts
if (prev === 'working' && status === 'break') {
  playWorkDoneSound()
  alertWorkDone(breakDuration)
} else if (prev === 'break' && status === 'idle') {
  playBreakDoneSound()
  alertBreakDone()
}
```

(`breakDuration` é obtido do store — já é `usePomodoroStore((s) => s.breakDuration)`.)

**`src/renderer/components/FlowTimer.tsx`** (linhas 45-50)

Equivalente:

```ts
if (prev === 'working' && phase === 'break') {
  playWorkDoneSound()
  alertWorkDone(breakDurationMinutes)
}
if (prev === 'break' && phase === 'working') {
  playBreakDoneSound()
  alertBreakDone()
}
```

### Atalhos / tray / menus

Sem alterações.

### Estados de loading / erro / vazio

- Se a permissão de notificação estiver negada (`Notification.permission === 'denied'`) → `transitionAlert` continua chamando `alertAttention` (dock bounce / flashFrame) e o som mantém-se. Sem UI de erro, sem prompt de permissão (a app já criou a permissão durante a feature de idle detection).

## Verificação

### Manual

1. **Setup**: garantir que a permissão de notificação está concedida (via prompt anterior do idle, ou conceder em System Settings → Notifications → Bloc).
2. **Pomodoro standalone**:
   - Iniciar pomodoro com duração curta (ex: 1 min de teste — alterar localmente no setting ou usar duração default).
   - Mudar de janela (browser, terminal, etc.) e esperar o fim do pomodoro.
   - **Esperado**: notificação OS "Hora da pausa", dock saltar uma vez (macOS), som actual a tocar.
   - Clicar na notificação → Bloc volta para foreground.
3. **Repetir para fim do break** com Bloc não-focado → notificação "De volta ao foco".
4. **Verificar supressão**: deixar o Bloc focado durante uma transição → notificação **não** dispara, dock **não** salta, mas o som toca.
5. **Flow timer**: iniciar Flow com várias tasks, durações curtas, e validar transições focus↔break com Bloc não-focado.
6. **Permissão negada**: revogar permissão de notificação no SO → confirmar que dock bounce e som continuam a funcionar; nenhuma exception.
7. **Windows** (se possível): mesmo fluxo, esperar `flashFrame` na taskbar.

### Automatizada

Não introduzimos testes automatizados nesta feature — o comportamento é nativo (Notification API, electron `dock`/`flashFrame`) e difícil de mockar sem grande infraestrutura. Tratamos isto como tradeoff aceitável para o scope.

## Riscos e alternativas

- **Risco — múltiplos disparos**: se ambos `pomodoroStore` e `flowStore` estiverem activos simultaneamente (improvável, mas possível?), pode disparar duas notificações ao mesmo tempo. Mitigação: comportamento dos stores actuais já é mutuamente exclusivo no fluxo normal; deixamos como está, e se aparecer empiricamente adicionamos um debounce no serviço.
- **Decisão revista (durante teste manual) — `dock.bounce('critical')`**: `'informational'` revelou-se demasiado subtil (um único salto passa despercebido). Mudámos para `'critical'`, que salta até o utilizador focar a janela. Alinha-se com o comportamento default do `flashFrame(true)` no Windows (também contínuo até foreground).
- **Risco — `flashFrame` não pára**: se não registarmos o listener `on('focus')` para chamar `flashFrame(false)`, o Windows continua a piscar. Mitigação: incluído no setup do main.
- **Alternativa rejeitada — disparar tudo do main process**: poderíamos mover a Notification para o main (`new Notification` do Electron). Rejeitada porque (a) o renderer já usa `new Notification()` (browser API) consistentemente em `App.tsx:315` e (b) adicionar mais um canal IPC apenas para a notificação é overhead sem benefício.
- **Alternativa rejeitada — ícones distintos por transição**: criar `notif-focus.png` e `notif-break.png`. Rejeitada para manter scope pequeno; distinção fica no título/corpo. Pode ser revisitado se houver fricção.
- **Alternativa rejeitada — setting para desligar**: spec já confirmou que fica fora de scope inicial.
