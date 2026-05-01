---
name: Pomodoro Transition Alerts
description: Alerta visual reforçado nas transições do pomodoro/flow para garantir que o utilizador percebe o fim do focus/break mesmo quando está noutra aplicação
type: project
---

# Pomodoro Transition Alerts

**Status**: done
**Criado**: 2026-05-01

## Problema

O som actual tocado nas transições do pomodoro (e do Flow) é insuficiente para chamar a atenção do utilizador quando este está a trabalhar noutra aplicação (browser, IDE, etc.). Resultado: pomodoros que se prolongam para lá do tempo, breaks que passam sem ser notados, e quebra do ciclo de foco/descanso que é o propósito da feature.

## Utilizador e cenário

O próprio utilizador do Bloc — alguém que tem o Bloc a correr em background com um pomodoro/flow activo enquanto trabalha noutras apps (geralmente em fullscreen ou ocupando outro monitor). No momento da transição, a janela do Bloc não está visível e o som por si só passa despercebido (ruído ambiente, headphones com áudio de meeting/música, etc.).

## Solução proposta (alto nível)

Adicionar um **pulso único** de alertas nas transições do pomodoro e do Flow, combinando três camadas:

1. **Notificação nativa do sistema operativo** — uma para cada tipo de transição, com título/corpo/ícone distintos:
   - Fim do focus → "Hora da pausa" (verde/relax)
   - Fim do break → "De volta ao foco" (cor accent do Bloc)
2. **Dock bounce no macOS / `flashFrame` no Windows** — uma vez, para chamar atenção visual mesmo quando o utilizador está focado noutra app.
3. **Click na notificação traz o Bloc para foreground** — para o utilizador conseguir ver o estado actual com um clique.

O **som actual mantém-se inalterado** e continua a tocar em paralelo. Estas camadas adicionam-se ao que existe, não substituem.

## Fluxo principal

### Fim do focus (working → break)
1. Pomodoro/Flow chega a `secondsRemaining === 0` em estado `working`
2. Estado transita para `break` (comportamento actual mantém-se)
3. Som de "work done" toca (comportamento actual mantém-se)
4. **Novo**: notificação nativa do SO dispara: título "Hora da pausa", corpo com duração da pausa
5. **Novo**: dock bounce (macOS) ou flashFrame (Windows) é disparado uma vez
6. Se o utilizador clicar na notificação → Bloc traz a janela para foreground

### Fim do break (break → idle/working)
1. Break chega a `secondsRemaining === 0`
2. Estado transita para `idle` (pomodoroStore) ou `working` (flowStore, próximo ciclo)
3. Som de "break done" toca
4. **Novo**: notificação nativa do SO dispara: título "De volta ao foco", corpo apropriado
5. **Novo**: dock bounce / flashFrame
6. Click traz Bloc para foreground

### Quando o Bloc já está focado
Se a janela do Bloc é a app activa no momento da transição, **a notificação nativa e o dock bounce/flashFrame não disparam** — o som basta e o utilizador já está a ver o estado.

## Casos extremos / fora de âmbito

**Cobre:**
- Transições do `pomodoroStore` (timer pomodoro standalone)
- Transições do `flowStore` (Flow tracking de tasks)
- Ambas as plataformas: macOS (dock bounce) e Windows (flashFrame)
- Linux: cai para apenas notificação nativa (sem flash equivalente fiável)
- Permissão de notificações: usa o que já está em uso para a notificação de "inatividade detectada"

**Não cobre (por agora):**
- **Modo persistente / despertador** — explicitamente fora de scope. Decidido: pulso único só.
- **Detecção de meetings/Zoom/Focus mode** — explicitamente fora de scope.
- **Setting para desligar as notificações** — fora de scope inicial; pode ser adicionado depois se houver fricção.
- **Customização de sons / ícones / títulos pelo utilizador** — fora de scope.
- **Notificações para outros eventos** (ex: idle detection já existe e mantém-se como está).

## Critérios de aceitação

- [ ] Quando um pomodoro acaba (focus → break) com o Bloc não-focado, dispara: notificação OS com título distinto de focus, dock bounce (macOS) ou flashFrame (Windows), e o som actual continua a tocar.
- [ ] Quando um break acaba com o Bloc não-focado, dispara: notificação OS com título distinto de break, dock bounce / flashFrame, e o som actual continua a tocar.
- [ ] As notificações de fim-de-focus e fim-de-break são visualmente distinguíveis (título e/ou ícone diferentes).
- [ ] Click na notificação traz a janela do Bloc para foreground (foco + restore se minimizado).
- [ ] Quando o Bloc é a aplicação focada no momento da transição, não dispara notificação nem dock bounce/flashFrame (apenas o som actual).
- [ ] Funciona tanto para `pomodoroStore` (timer standalone) como para `flowStore` (Flow de tarefas).
- [ ] O som actual e o comportamento existente das transições não mudam.
- [ ] Permissão de notificação (caso negada pelo SO) falha silenciosamente — o resto do fluxo (estado, som, dock bounce) continua a funcionar.

## Questões em aberto

- **Onde dispara o pulso (renderer vs main)?** A notificação nativa pode ser disparada do renderer (Notification API web, já em uso em `App.tsx:315`) mas o `flashFrame` e `dock.bounce` exigem main process — vamos precisar de um canal IPC novo. Decisão técnica para o plan.
- **Ícones das notificações** — usar `build/icon.png` para ambas, ou criar dois ícones distintos (ex: `build/notif-focus.png`, `build/notif-break.png`)? Decisão para o plan; default é reutilizar o ícone existente para não inflar o scope.
- **Detecção de "Bloc focado"** — `BrowserWindow.isFocused()` no main, ou `document.hasFocus()` no renderer? Decisão para o plan.
