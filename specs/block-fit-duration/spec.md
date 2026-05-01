---
name: block-fit-duration
description: Botão "fit" no bloco que ajusta a duração do bloco para igualar a soma do tempo estimado das tarefas internas.
type: spec
---

# Block Fit Duration

**Status**: done
**Criado**: 2026-04-30

## Problema

Hoje, ajustar a duração de um bloco para corresponder ao trabalho realmente planeado dentro dele é um gesto manual: ler as estimativas das tarefas, somar de cabeça, arrastar o limite inferior do bloco até bater certo. É fricção repetida várias vezes por dia, sobretudo quando se reorganiza o planeamento e se movem tarefas entre blocos. O resultado prático é blocos quase sempre desalinhados com o esforço real — demasiado curtos (overflow) ou demasiado longos (folga vazia).

## Utilizador e cenário

Utilizador que planeia o dia em blocos e atribui estimativas de tempo (`estimatedMinutes`) às tarefas. Cenário típico: depois de adicionar/remover tarefas de um bloco, ou de actualizar a estimativa de uma delas, quer rapidamente encaixar a duração do bloco no esforço estimado, sem cálculo mental nem drag-resize. É um gesto de "afinar o plano" tipicamente feito de manhã ou ao reorganizar a tarde.

## Solução proposta (alto nível)

Adicionar um botão "fit" à barra de acções de cada bloco (ao lado de cor, adiar, lixo). Ao clicar, a duração do bloco é ajustada para que `endTime - startTime` seja igual à soma das estimativas (`estimatedMinutes`) de todas as tarefas dentro do bloco. O `startTime` mantém-se; só `endTime` muda.

O botão é **condicional**: só aparece quando o bloco tem pelo menos uma tarefa com estimativa definida. Sem estimativas, sem botão — não há nada a fazer.

Quando expandir o bloco colidiria com o bloco seguinte, o fit estica até ao limite disponível e mostra um toast a avisar que não chegou para todas as tarefas.

## Fluxo principal

1. Utilizador tem um bloco "Trabalho profundo" das 09:00 às 11:00 (120min).
2. Dentro do bloco há 3 tarefas com estimativas: 30min, 25min, 20min — total 75min.
3. Utilizador faz hover no bloco; vê os botões da barra de acções, incluindo o novo ícone "fit".
4. Clica em fit.
5. O bloco encolhe para 09:00–10:15 (75min). A vista actualiza em tempo real.
6. (Variante encolher → folga aparece no timeline; variante expandir → bloco aumenta o `endTime`.)

### Variante: overlap com bloco seguinte

1. Bloco "Reuniões" 14:00–14:30, próximo bloco "Almoço tardio" começa às 15:00.
2. Tarefas dentro de "Reuniões" totalizam 90min (esperado endTime 15:30).
3. Utilizador clica fit.
4. Bloco estica até 14:00–15:00 (limite máximo possível, 60min em vez dos 90 desejados).
5. Toast: "Não há espaço para 30min adicionais. Bloco ajustado ao máximo possível."

## Casos extremos / fora de âmbito

- **Cobre**:
  - Bloco com mistura de tarefas com e sem estimativa → soma só as que têm estimativa (tarefas sem estimativa contam como 0).
  - Tarefas concluídas contam para a soma (decisão tomada — mais previsível).
  - Encolher e expandir são ambos suportados.
  - Fit chocaria com duração mínima (15min) → aplica 15min e avisa via toast.
  - Soma é exactamente igual à duração actual → no-op silencioso (não mexe, não avisa).

- **Não cobre (por agora)**:
  - Empurrar o bloco seguinte para abrir espaço.
  - Fit em múltiplos blocos de uma vez.
  - Fit automático ao adicionar/remover tarefas (continua a ser um gesto explícito).
  - Fit em blocos `untimed` (não têm `startTime`/`endTime` materiais — botão não aparece).
  - Fit em blocos `isGoogleReadOnly` (não são editáveis no Bloc — botão não aparece).
  - Atalho de teclado dedicado.

## Critérios de aceitação

- [ ] Bloco com tarefas estimadas mostra botão fit na barra de acções, ao lado dos existentes.
- [ ] Bloco sem tarefas com estimativa não mostra o botão.
- [ ] Bloco `untimed` ou `isGoogleReadOnly` não mostra o botão.
- [ ] Clicar em fit num bloco onde a soma cabe no espaço livre disponível ajusta `endTime` para `startTime + soma`, mantendo `startTime`.
- [ ] Tarefas concluídas contam para a soma tal como as pendentes.
- [ ] Tarefas sem `estimatedMinutes` contribuem 0 para a soma.
- [ ] Quando a soma desejada excederia o início do próximo bloco, o `endTime` é definido até ao máximo possível e aparece toast com a diferença que não coube.
- [ ] Quando a soma seria <15min, o bloco fica com 15min e aparece toast informativo.
- [ ] Quando a soma é exactamente igual à duração actual, clicar fit não altera nada (no-op, sem toast).
- [ ] A acção é reversível pelos meios já existentes (drag de resize manual).
- [ ] A alteração persiste no markdown do dia (mesmo formato — só `startTime`/`endTime` mudaram, sem schema novo).
- [ ] Existe paridade MCP: agente externo consegue replicar o gesto via tool MCP.

## Questões em aberto

- **Tool MCP** — criar nova `fit_time_block(date, block_id)` ou deixar como utility client-side e expor apenas `update_time_block` (que já existe)? Decisão para a fase plan, com inclinação para tool nova porque a soma de estimativas é um cálculo não-trivial que um agente teria de replicar.
- **Ícone exacto** — `Maximize2`, `AlignVerticalJustifyCenter`, ou outro do lucide-react? Decisão UI menor para a fase plan.
- **Animação** — transição suave do `endTime` (ex: framer-motion) ou snap imediato? Decisão UI menor para a fase plan.
