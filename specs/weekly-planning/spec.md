# Weekly Planning

**Status**: spec
**Criado**: 2026-04-28

## Problema

Hoje o utilizador planeia o dia-a-dia em vistas diárias (Calendar / Timeline). Não existe um momento dedicado a olhar para a semana inteira e decidir, com intenção, **onde** cada tarefa pendente vai cair. O resultado é que:

- Tarefas pendentes acumulam-se sem visibilidade — nada puxa o utilizador a agendá-las.
- O fim-de-semana ou um dia mais leve é "descoberto" no próprio dia, em vez de ser usado para descomprimir trabalho da semana.
- Eventos do Google Calendar (que hoje aparecem no dia) só são contemplados ao planear quando o utilizador abre cada dia individualmente.

A feature dá um ritual semanal: uma vista única para olhar 7 (ou 5) dias, ver o que já está marcado (incluindo eventos GC), e arrastar/atribuir o backlog pendente — manualmente ou com ajuda automática.

## Utilizador e cenário

Utilizador único (o próprio dono do Bloc), em **dois momentos típicos**:

1. **Início de semana (domingo à noite ou segunda de manhã)** — quer fazer um "weekly review": ver semana vazia, distribuir blocos e tarefas, comprometer-se com um plano.
2. **Meio de semana (replan)** — uma reunião imprevista, um projecto novo, ou um dia que não correu — abre a vista para reorganizar o que falta.

Estado mental: foco curto, quer ver tudo de uma vez, decidir rápido. Não quer abrir 5-7 dias separadamente.

## Solução proposta (alto nível)

Adicionar um botão **"Planeamento semanal"** na tela do calendário. Abre uma vista nova com 3 áreas:

1. **Grelha semanal** (área principal) — 7 colunas (seg→dom), uma por dia. Cada coluna mostra os blocos já existentes nesse dia, **incluindo eventos do Google Calendar** já sincronizados, em formato compacto. Permite **criar blocos e tarefas directamente** num dia.
2. **Painel lateral "Por atribuir"** — lista os blocos/projectos com tarefas pendentes (não concluídas), agrupados pelo bloco-pai. O utilizador arrasta uma tarefa (ou o grupo todo) para um dia da semana.
3. **Toggle 5/7 dias** — alterna entre semana de trabalho (seg→sex) e semana completa (seg→dom). Persistente por utilizador.

Adicionalmente, um botão **"Distribuir automaticamente"** percorre o backlog e encaixa tarefas/blocos nos slots livres da semana, usando uma **score de prioridade calculada** (definição técnica fica para o plan; sinais candidatos abaixo).

## Fluxo principal

1. Utilizador está na vista de Calendar, clica em **"Planeamento semanal"**.
2. Abre a vista da semana actual. Cada dia mostra:
   - Eventos do Google Calendar (read-only, identificados visualmente).
   - Blocos do Bloc já criados nesse dia.
   - Tarefas atribuídas aos blocos do dia.
3. Utilizador navega: setas ←/→ para semana anterior/seguinte, atalho para "esta semana".
4. Pode alternar 5/7 dias.
5. No painel "Por atribuir", vê blocos-pai com contagem de pendentes. Expande um bloco para ver as tarefas individuais.
6. Arrasta uma tarefa (ou um bloco inteiro) para um dia → cria uma referência da tarefa nesse dia (igual ao mecanismo actual de "block-as-project").
7. Pode criar bloco/tarefa directamente num dia, sem sair da vista (clique → mini-modal).
8. Clique em "Distribuir automaticamente" → confirmação → tarefas pendentes são encaixadas em slots livres da semana, ordenadas por prioridade. Mostra preview antes de aplicar.
9. Sai da vista, regressa ao Calendar com tudo gravado.

## Casos extremos / fora de âmbito

**Cobre**:
- Semana actual e navegação para outras semanas (passadas e futuras).
- Eventos GC já sincronizados (read-only nesta vista — não cria/edita GC daqui).
- Toggle 5/7 dias.
- Drag-and-drop de tarefas pendentes para dias.
- Criar blocos e tarefas directamente num dia da grelha.
- Distribuição automática com preview/confirmação.

**Não cobre (por agora)**:
- Edição de eventos do Google Calendar a partir desta vista (criar/mover/eliminar GC) — só leitura.
- Vista mensal/quinzenal — apenas semanal.
- Multi-select para distribuir um lote específico de tarefas (a auto-distribuição é tudo-ou-nada do backlog).
- Templates de semana ou repetição automática semana-a-semana.
- Drag de eventos GC para outro dia (read-only).
- Sugestões de horário concretas dentro do dia (auto-dist atribui ao DIA, não ao slot exacto — quem decide a hora exacta é a vista do dia).

## Critérios de aceitação

- [ ] Existe um botão "Planeamento semanal" visível na tela de Calendar.
- [ ] A vista mostra os 7 dias da semana actual em grelha.
- [ ] Toggle 5/7 dias funciona e a preferência persiste entre sessões.
- [ ] Eventos Google Calendar do utilizador aparecem nos dias correspondentes (read-only, distinguíveis visualmente dos blocos do Bloc).
- [ ] Blocos e tarefas existentes em cada dia são apresentados.
- [ ] É possível criar um bloco novo num dia sem sair da vista.
- [ ] É possível criar uma tarefa num bloco sem sair da vista.
- [ ] O painel "Por atribuir" mostra todos os blocos-pai com tarefas não concluídas, com contagem.
- [ ] É possível arrastar uma tarefa do painel para um dia, criando uma referência da tarefa nesse dia.
- [ ] O botão "Distribuir automaticamente" mostra um preview da distribuição antes de aplicar.
- [ ] A distribuição automática prioriza tarefas com score mais alto (definido no plan).
- [ ] Após aplicar a distribuição, as tarefas aparecem nos dias atribuídos e a vista de dia normal reflecte-as.
- [ ] Navegação entre semanas (←/→ e "esta semana") funciona.
- [ ] Não corrompe ficheiros Markdown — paridade renderer↔MCP mantida.

## Questões em aberto

Decisões adiadas para a fase de plan:

- **Sinais de prioridade para auto-distribuição**: candidatos a considerar — (a) idade da tarefa (criada há quanto tempo, sem ser concluída), (b) número de instâncias/referências já criadas (sinal de tarefa "perseguida"), (c) estimativa em minutos (encaixar maiores em slots maiores), (d) bloco-pai com mais pendentes (atacar projectos a abandonar), (e) flag explícita de prioridade do utilizador (existe? avaliar no plan). Combinar como? Soma ponderada simples ou ranking por critério primário?
- **Onde encaixar exactamente**: a auto-dist atribui a tarefa a um **dia** (cria referência num bloco existente desse dia? ou cria um bloco "Backlog" novo?). Decidir mecânica.
- **Conflito com tarefas já agendadas**: se uma tarefa do backlog já tem instância(s) em dias futuros desta semana, ainda entra no auto-dist? (proposta: não — só tarefas sem agendamento futuro).
- **Granularidade GC**: mostrar só nome+hora? Ou também duração/local? Há limite de eventos por dia para não saturar o UI?
- **Persistência do toggle 5/7**: settingsStore? Local-only ou sync via iCloud?
- **Drag-and-drop**: biblioteca já em uso no projecto ou introduzir nova?
- **Performance**: carregar 7 dias de uma vez tem custo (7× read iCloud + watch). Caching/strategy?
