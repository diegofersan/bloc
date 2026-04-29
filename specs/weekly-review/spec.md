---
**Status**: done (v2)
**Criado**: 2026-04-29
**Última iteração**: 2026-04-29 (v2 — migração por bloco/projecto)
---

# Revisão Semanal Guiada

## Problema

A vista actual `/week` é um calendário livre com auto-distribute — ferramenta poderosa, mas sem ritual. O utilizador pode planear a semana, mas não tem prática estruturada para **fechar** a anterior: o que correu bem, o que ficou por fazer, o que aprendi. Sem revisão, tarefas pendentes acumulam silenciosamente, padrões repetem-se, e o planeamento da semana seguinte parte de uma página em branco em vez de uma reflexão consciente.

Este projecto substitui a vista de planeamento livre por um **método** guiado em 4 fases que combina retrospectiva, migração, reflexão e planeamento. A visualização semanal do calendário em si fica para uma feature separada.

## Utilizador e cenário

Utilizador único do Bloc (eu), tipicamente **domingo à noite ou segunda de manhã**, com café, mente calma, querendo fechar a semana anterior e abrir a próxima com intenção. Não é uma tarefa de 30 segundos — é um ritual de 5-15 minutos. O utilizador não está a fazer multitasking; está focado em reflectir.

## Solução proposta (alto nível)

Nova rota `/review` substitui o botão actual `/week` na toolbar do calendário. Ao entrar:

1. **Selector de semana**: o utilizador escolhe que semana quer rever (default: semana passada). Pode rever semanas mais antigas se quiser.
2. **4 fases sequenciais** numa única vista, com indicador de progresso (1/4, 2/4, …) e navegação avanço/retrocesso:
   - **Look back** — estatísticas observáveis da semana escolhida
   - **Migrate** — decisão por tarefa pendente
   - **Reflect** — 3 perguntas curtas, com drag-and-drop de items da semana
   - **Plan** — UI actual de calendário semanal + auto-distribute, agora como fase final do método
3. Estado **auto-guardado** por semana, em ficheiro próprio (`~/Bloc/YYYY/YYYY-Www-review.md`). Sair a meio e voltar depois retoma exactamente onde estava.
4. Ao concluir a fase Plan, a revisão fica **selada** (read-only) — pode ser consultada mas não editada.

## Fluxo principal

1. Utilizador clica no botão "Revisão semanal" na toolbar do calendário (ou `⌘⇧W`).
2. Aterra em `/review`. Se não há revisão em curso, vê selector de semana com a anterior pré-seleccionada. Se há revisão em curso (de qualquer semana), retoma-a.
3. **Fase 1 — Look back**: vê estatísticas da semana (tarefas feitas vs pendentes, blocos completados, pomodoros totais, streaks). Não há acção, é leitura. Botão "Avançar".
4. **Fase 2 — Migrate**: lista de todas as tarefas não-feitas da semana. Para cada uma, 3 botões: **Mover para próxima semana** (default, pré-seleccionado), **Manter no dia original**, **Descartar**. Há acção em massa "Aplicar a todas: mover" / "manter" / "descartar". CTA "Confirmar migração" aplica decisões e avança.
5. **Fase 3 — Reflect**: 3 campos de texto, um por pergunta:
   - **Destaque** — o que correu melhor?
   - **Obstáculo** — o que travou?
   - **Intenção** — uma intenção concreta para a semana seguinte
   
   À direita, sidebar com lista de items da semana (tarefas concluídas + blocos). Utilizador pode arrastar items para qualquer um dos 3 campos — aparecem como chips clicáveis dentro do texto. Texto livre é editável à volta dos chips. Botão "Avançar".
6. **Fase 4 — Plan**: UI actual de planeamento semanal (calendário + lista de pending + auto-distribute). Funciona exactamente como hoje, mas a próxima semana já vem pré-populada com as tarefas migradas no passo 4. CTA final "Concluir revisão" sela o documento e volta ao calendário.
7. Se sair a meio, na próxima visita a `/review` aparece banner: "Tens uma revisão em curso da semana de DD-DD/MM. Continuar / Recomeçar".

## Casos extremos / fora de âmbito

- **Cobre**:
  - Rever semanas passadas (qualquer semana, não só a última)
  - Auto-save de progresso parcial
  - Reabrir uma revisão **selada** em modo read-only
  - Drag-and-drop dentro da fase Reflect
  - Migração em massa
  - Ficheiro markdown próprio por revisão (parseable, MCP-acessível no futuro)

- **Não cobre (por agora)**:
  - Visualização semanal no calendário (feature separada)
  - Notificações ou lembretes para fazer a revisão
  - Comparações entre semanas (analytics)
  - Editar uma revisão depois de selada
  - Tools MCP para ler/escrever revisões (markdown fica preparado, mas exposição ao MCP fica para outra feature)
  - Exportação / partilha
  - Métricas agregadas mensais ou anuais

## Critérios de aceitação

- [ ] Botão `/week` actual na toolbar é substituído por um para `/review` (atalho `⌘⇧W` mantém-se, agora aponta a `/review`)
- [ ] Rota `/review` é acessível e renderiza selector de semana se não há revisão activa
- [ ] Selector de semana permite escolher qualquer semana com dados; default é a semana anterior
- [ ] Indicador de progresso visível em todas as 4 fases ("Fase X de 4: <nome>")
- [ ] É possível voltar atrás entre fases sem perder estado
- [ ] **Look back** mostra: tarefas feitas, tarefas pendentes (com link para Migrate), nº de blocos completados, pomodoros totais, dias com actividade
- [ ] **Migrate** lista pendentes da semana; cada uma tem 3 acções; default = "mover para próxima semana"
- [ ] Acção em massa em Migrate funciona ("aplicar a todas")
- [ ] Confirmar migração aplica decisões: tarefas movidas vão para o primeiro dia da semana seguinte; mantidas ficam onde estão; descartadas são apagadas
- [ ] **Reflect** tem 3 campos de texto, um por pergunta
- [ ] Sidebar de items da semana é visível em Reflect e suporta drag para os 3 campos
- [ ] Item arrastado aparece como chip clicável (clicar abre o dia desse item)
- [ ] Texto à volta dos chips é editável
- [ ] **Plan** reaproveita a UI actual de `WeeklyPlanningView`, com tarefas migradas pré-populadas
- [ ] Concluir revisão sela o documento (frontmatter ou meta marca `sealed: true`)
- [ ] Reabrir revisão selada mostra-a em modo read-only (sem botões de edição)
- [ ] Auto-save: cada mudança persiste em `~/Bloc/YYYY/YYYY-Www-review.md` em <500ms
- [ ] Ao fechar a app a meio de uma revisão, reabrir leva ao mesmo ponto
- [ ] Banner "revisão em curso" aparece se há draft não selada

## Revisão v2 — Migração por bloco/projecto (2026-04-29)

Ao usar a v1, ficaram claros três problemas:

1. **Tarefas soltas, sem contexto de projecto.** A lista da fase Migrate mostra tarefas individuais sem o bloco a que pertencem — o utilizador pensa por projecto, não por tarefa.
2. **Âmbito demasiado estreito.** A lista só inclui pendentes da semana revista. Tarefas em aberto de semanas anteriores não aparecem, ficando esquecidas.
3. **Semântica errada de "mover".** O verbo sugere remover da origem, quando na verdade queremos *copiar* (mantendo a origem como histórico). O sistema já suporta refs nativamente — devíamos usar isso.

### Mudanças de comportamento (v2)

- **Âmbito**: a fase Migrate lista **todas as tarefas em aberto do app**, independentemente da data de origem. Inclui pendentes da semana revista e de semanas anteriores que nunca foram fechadas.
- **Agrupamento**: as pendentes são agrupadas por **bloco/projecto**. Tarefas sem bloco caem num grupo único "Sem bloco". Cada grupo permite acções em massa (mover/manter/descartar) com override por tarefa.
- **"Mover" = copiar como ref**: as tarefas decididas como "mover" são **copiadas** para a próxima semana (W+1) via refs (mecanismo nativo). Origem fica intacta.
- **Recriação de bloco**: quando uma tarefa block-scoped é movida, o bloco é **recriado** em W+1 no **mesmo dia-da-semana e mesma hora** da origem. Refs entram debaixo do bloco recriado. Múltiplas tarefas do mesmo bloco origem caem no mesmo bloco recriado.
- **"Manter"**: no-op. A tarefa fica em aberto na origem e voltará a aparecer em revisões futuras até ser fechada ou descartada.
- **"Descartar" = won't-do**: a tarefa é marcada como **won't-do** (visível barrada na origem, persistida em MD com checkbox `[-]`). Não é apagada — fica como histórico do que foi decidido não fazer. Não volta a aparecer em listas de pendentes.
- **Navegação**: os 3 botões inline de avançar foram removidos das fases. O footer do wizard é a única fonte de Avançar/Anterior.
- **Reflect sem sidebar drag-and-drop**: a fase Reflect mostra duas colunas (Realizado / Por fechar) em modo leitura, em vez do drag-and-drop. Os 3 campos (Destaque/Obstáculo/Intenção) são textareas simples. (Já implementado.)

### Critérios de aceitação adicionais (v2)

- [ ] Fase Migrate mostra **todas** as tarefas pendentes do app, não só da semana revista
- [ ] Tarefas estão agrupadas por bloco; grupo "Sem bloco" para standalone
- [ ] Cada grupo tem 3 botões de acção em massa que aplicam aos seus filhos
- [ ] User pode fazer override por tarefa
- [ ] "Mover" cria refs em W+1 sem remover da origem
- [ ] Bloco origem é recriado em W+1 (mesmo dia-da-semana + mesma hora) quando há tarefas movidas
- [ ] Múltiplas tarefas do mesmo bloco origem caem no mesmo bloco recriado (não 1 bloco por tarefa)
- [ ] "Descartar" marca tarefa como won't-do (estado visível e persistido)
- [ ] Tarefas won't-do aparecem barradas no dia de origem mas não em listas de pendentes
- [ ] MD reflecte won't-do com sintaxe `- [-]` + meta `@wontDoAt:<timestamp>`
- [ ] Renderer e MCP parseiam e serializam `[-]` correctamente (paridade)
- [ ] Footer do wizard é a única fonte de navegação entre fases (já implementado)

### Fora de âmbito da v2

- Reverter won't-do (botão "reabrir tarefa") — pode vir depois; por agora edita-se o MD manualmente.
- Indicador visual no calendário para tarefas won't-do em dias passados (a app só renderiza dias futuros/actuais; o histórico é via MD).
- Tools MCP para listar/marcar won't-do — fica como follow-up.

## Questões em aberto

Decisões adiadas para a fase de plan:

- Estrutura exacta do ficheiro markdown da revisão (frontmatter? secções nomeadas?)
- Como representar drag-and-drop chips em markdown (link MD? sintaxe própria `[[task:id]]`?)
- Onde guardar `currentPhase` e estado de UI parcial (no próprio ficheiro? store separada?)
- Granularidade de auto-save (a cada keystroke debounced? a cada mudança de fase?)
- Nome exacto do botão na toolbar (ícone? "Revisão"? "Rever semana"?)
- Tratamento de tarefas com subtasks na fase Migrate (decidir por tarefa-pai ou granular?)
- Comportamento se utilizador inicia revisão de semana A e depois muda para semana B (descartar A? guardar ambas como drafts independentes?)
- Stats exactas em Look back: incluir tempo total em pomodoros? distrações? média por dia?
