# Pomodoro Transition Alerts — Tasks

**Status**: done
**Plan**: ./plan.md

## Ordem de execução

> Layers 1 (markdown), 2 (stores) e 4 (MCP) **não têm alterações** nesta feature. O trabalho começa directamente em IPC + tipos partilhados, segue para o serviço novo no renderer, e termina no wire-up dos dois componentes timer e na verificação manual.

### 1. IPC main↔renderer

- [x] **T1.1** — Adicionar handler `alert-attention` no main process
  - Ficheiro: `src/main/index.ts`
  - Local: dentro do `app.whenReady().then(...)`, perto dos outros `ipcMain.on(...)` (linhas ~223-237)
  - Comportamento:
    - Se `mainWindow?.isFocused()` → `return` (no-op)
    - macOS: `if (process.platform === 'darwin') app.dock?.bounce('informational')`
    - Windows: `if (process.platform === 'win32') mainWindow?.flashFrame(true)`
    - Linux: sem acção
  - Verificação: `npm run typecheck` passa; `console.log` temporário no handler confirma chegada do evento durante teste manual.

- [x] **T1.2** — Registar listener `mainWindow.on('focus', ...)` para parar `flashFrame` no Windows
  - Ficheiro: `src/main/index.ts`
  - Local: dentro de `createWindow()`, junto aos outros listeners de `mainWindow.on(...)` (linhas 135-149)
  - Código: `mainWindow.on('focus', () => { if (process.platform === 'win32') mainWindow?.flashFrame(false) })`
  - Verificação: typecheck passa.

- [x] **T1.3** — Expor `alertAttention()` no preload
  - Ficheiro: `src/preload/index.ts`
  - Local: dentro do objecto `bloc`, perto de `focusWindow` (linha 26-28)
  - Código:
    ```ts
    alertAttention: () => {
      ipcRenderer.send('alert-attention')
    }
    ```
  - Verificação: typecheck passa.

- [x] **T1.4** — Estender o tipo global `Window['bloc']`
  - Ficheiro: `src/renderer/App.tsx`
  - Local: dentro do `declare global` (linha 29-74), depois de `focusWindow: () => void`
  - Código: `alertAttention: () => void`
  - Verificação: typecheck passa; `window.bloc?.alertAttention` autocompletes em `*.tsx`.

### 2. Serviço novo no renderer

- [x] **T2.1** — Criar `src/renderer/services/transitionAlert.ts`
  - Exporta duas funções:
    ```ts
    export function alertWorkDone(breakMinutes: number): void
    export function alertBreakDone(): void
    ```
  - Comportamento partilhado (helper interno):
    1. Se `document.hasFocus()` → return
    2. Try/catch em torno de `new Notification(title, { body, icon, silent: true })` — falha silenciosa se permissão negada ou API indisponível
    3. `notification.onclick = () => window.bloc?.focusWindow()`
    4. `window.bloc?.alertAttention()`
  - Strings (em PT, alinhado com locale):
    - `alertWorkDone`: title `'Bloc — Hora da pausa'`, body `\`Pausa de ${breakMinutes} min\``
    - `alertBreakDone`: title `'Bloc — De volta ao foco'`, body `'A pausa terminou.'`
  - Ícone: tentar resolver através do que já existe (sem novos ficheiros) — se simplesmente não passarmos `icon`, o SO usa o ícone da app, o que é aceitável e mais simples.
  - Verificação: typecheck passa; ficheiro segue o estilo de `notificationSound.ts`.

### 3. Wire-up nos componentes timer

- [x] **T3.1** — `PomodoroTimer.tsx`: chamar alertas a seguir aos sons
  - Ficheiro: `src/renderer/components/PomodoroTimer.tsx`
  - Local: useEffect de transições (linhas 38-47)
  - Adicionar import: `import { alertWorkDone, alertBreakDone } from '../services/transitionAlert'`
  - Adicionar selector do store: `const breakDuration = usePomodoroStore((s) => s.breakDuration)` (se ainda não estiver presente — verificar antes de duplicar)
  - Após `playWorkDoneSound()` → `alertWorkDone(breakDuration)`
  - Após `playBreakDoneSound()` → `alertBreakDone()`
  - Verificação: typecheck passa; comportamento existente (som) inalterado em runtime.

- [x] **T3.2** — `FlowTimer.tsx`: chamar alertas a seguir aos sons
  - Ficheiro: `src/renderer/components/FlowTimer.tsx`
  - Local: useEffect de transições (linhas 44-50)
  - Adicionar import equivalente
  - Obter duração da pausa do `flowStore` — verificar nome do campo (provavelmente `breakDurationMinutes` ou similar; ler o store antes de assumir)
  - Após `playWorkDoneSound()` → `alertWorkDone(breakDuration)`
  - Após `playBreakDoneSound()` → `alertBreakDone()`
  - Verificação: typecheck passa.

### 4. Verificação manual

- [x] **T4.1** — Build/typecheck end-to-end
  - Correr `npm run build` (ou `npm run typecheck` se existir) — confirmar zero errors em main, preload e renderer.

- [x] **T4.2** — Teste pomodoro standalone (Bloc não-focado)
  - Abrir `npm run dev`, iniciar pomodoro (reduzir duração para teste se possível, ex: editar localmente para 1 min de focus + 1 min de break).
  - Mudar para outra app (browser).
  - Fim do focus → confirmar: notificação OS "Bloc — Hora da pausa", dock bounce uma vez (macOS), som actual a tocar.
  - Clicar na notificação → Bloc volta para foreground.
  - Fim do break → confirmar: notificação "Bloc — De volta ao foco", dock bounce, som.

- [x] **T4.3** — Teste de supressão (Bloc focado)
  - Repetir o ciclo com a janela do Bloc focada durante a transição.
  - Confirmar: **sem** notificação, **sem** dock bounce, mas som actual continua a tocar.

- [x] **T4.4** — Teste Flow timer
  - Iniciar Flow com 2-3 tasks (durações curtas), Bloc não-focado.
  - Validar transições focus↔break disparam notificações distintas.

- [x] **T4.5** — Permissão de notificação negada
  - Em System Settings → Notifications → Bloc, revogar permissão.
  - Repetir T4.2.
  - Esperado: nenhuma exception no console; dock bounce e som continuam a funcionar; só a notificação OS fica suprimida.

- [x] **T4.6** — Limpeza e final
  - Remover qualquer `console.log` temporário adicionado em T1.1.
  - Marcar todos os ficheiros do spec como `Status: done`.
