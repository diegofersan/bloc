---
**Status**: done
**Criado**: 2026-04-29
---

# Melhoria na Gestão de Tarefas — Agrupar por Bloco

## Problema

O ecrã "Tarefas" hoje agrupa tudo por data, e o bloco aparece só como tag inline ao lado do título. Resultado: trabalho contínuo num mesmo "projeto" (ex: "Login feature") fica fragmentado por dias, e não há forma de criar/manter um bloco como contentor de tarefas sem o agendar primeiro no calendário. O utilizador quer pensar em projetos, não em datas, neste contexto.

## Utilizador e cenário

Utilizador a fazer triagem ou planeamento de tarefas, fora do contexto de um dia específico. Está no ecrã "Tarefas" do Inbox. Quer:

- Ver todas as tarefas de um determinado projeto (bloco) num grupo único, independente da data em que foram criadas/agendadas.
- Criar um projeto novo (bloco com título + cor) sem ter de o agendar logo no calendário.
- Adicionar tarefas a esse projeto antes de decidir quando o vai trabalhar.

## Solução proposta (alto nível)

O tab "Tarefas" do `InboxView` passa a agrupar **por bloco** (não por data). Cada grupo representa um bloco identificado por título + cor. Tarefas de várias instâncias do mesmo bloco (mesmo título, datas diferentes) aparecem juntas. Tarefas que não pertencem a nenhum bloco (standalone num dia, ou backlog sem data) caem num grupo virtual **"Sem bloco"** no final.

Adiciona-se um botão **"Criar bloco"** no topo. Ao clicar, abre um diálogo simples — só pede **título** e **cor**. O bloco fica registado mesmo sem data/hora atribuídas: aparece de imediato na lista como um grupo vazio. Cada grupo tem uma acção **"Adicionar tarefa"** que cria uma tarefa nesse bloco.

Quando o utilizador depois cria uma instância no calendário com o mesmo título, é o mesmo bloco conceptual: as tarefas adicionadas no ecrã "Tarefas" aparecem nessa instância no calendário e vice-versa.

## Fluxo principal

1. Utilizador abre Inbox → tab **Tarefas**.
2. Vê uma lista de grupos. Cada grupo:
   - Header com indicador de cor + título do bloco + contagem de tarefas pendentes.
   - Lista de tarefas pertencentes ao bloco (qualquer data, qualquer instância).
   - Acção "Adicionar tarefa" no fim do grupo.
3. No fim, um grupo **"Sem bloco"** com tarefas standalone (com data mas sem bloco) e backlog (sem data).
4. No topo, botão **"Criar bloco"**.
5. Clica em "Criar bloco" → mini-diálogo: campo título + selector de cor → confirma.
6. Novo grupo aparece imediatamente na lista, vazio. Utilizador clica "Adicionar tarefa" e começa a popular.
7. Mais tarde, utilizador vai ao calendário, cria um bloco no dia 5 Maio com o mesmo título → as tarefas que adicionou no ecrã "Tarefas" aparecem nesse bloco do calendário (e quaisquer tarefas que adicionar a partir do calendário aparecem no grupo do ecrã "Tarefas").
8. Ao concluir tarefas, contagem do grupo actualiza. Toggle "Mostrar concluídas" continua a funcionar.

## Casos extremos / fora de âmbito

- **Cobre**:
  - Agrupamento por título de bloco (cross-date) no tab "Tarefas".
  - Criar bloco a partir desse ecrã (apenas título + cor — sem data, sem hora).
  - Adicionar tarefa directamente num grupo de bloco (incluindo "Sem bloco" e blocos sem instância de calendário).
  - Mostrar/esconder concluídas (preserva comportamento actual).
  - Mover tarefas entre blocos (reatribuir bloco).
  - Mostrar contagem de tarefas pendentes por grupo.

- **Não cobre (por agora)**:
  - Apagar/renomear blocos a partir deste ecrã (só calendário).
  - Reordenar blocos manualmente (ordem é determinística — alfabética + "Sem bloco" no fim).
  - Editar cor de um bloco já criado (decisão fica no calendário).
  - Sub-blocos / hierarquia de blocos.
  - Filtrar por tags ou outras dimensões.
  - Conflitos de cor entre instâncias do mesmo título — pressuposto: instâncias do mesmo título partilham cor; se divergirem, prevalece a primeira encontrada (decisão de plan).

## Critérios de aceitação

- [ ] No tab "Tarefas", a lista é apresentada como grupos de bloco, não por data.
- [ ] Tarefas de instâncias do mesmo bloco (mesmo título) em datas diferentes aparecem juntas no mesmo grupo.
- [ ] Existe um grupo "Sem bloco" no fim, contendo: tarefas standalone com data + tarefas do backlog (sem data).
- [ ] Botão "Criar bloco" no topo abre diálogo com título + cor; ao confirmar, o grupo aparece na lista mesmo sem instância de calendário.
- [ ] Cada grupo tem uma acção "Adicionar tarefa" que cria tarefa atribuída a esse bloco.
- [ ] Quando o utilizador cria no calendário um bloco com o mesmo título de um bloco "sem instância", os dois ficam unificados — tarefas existentes aparecem nesse novo bloco do calendário.
- [ ] Toggle "Mostrar/esconder concluídas" continua funcional.
- [ ] Tarefas concluídas/won't-do não contam para a contagem de pendentes do header de grupo.
- [ ] Ficheiros markdown anteriores (que não conhecem o conceito de "bloco sem data") continuam a abrir sem erros.

## Questões em aberto (para Fase plan)

- **Onde guardar blocos sem instância de calendário?** Novo ficheiro markdown (ex: `~/Bloc/projects.md`)? Secção nova num ficheiro existente? Ou sintetizados como instância num dia "neutro"?
- **Identidade do bloco (título)**: é case-sensitive? trim de espaços? como tratar duplicados?
- **Onde vivem as tarefas adicionadas a um bloco sem instância?** Storekey precisa de um formato — provável `__project__<id>` ou `__block__<title>` — decidido na fase de plan.
- **Mover tarefa entre blocos**: UI (drag & drop? menu?) — decidido em plan.
- **Cor**: que paleta é oferecida no diálogo de criação? (provável reutilizar a paleta existente do calendário).
- **Migração**: blocos existentes do calendário que partilham título — como detectar e unificar (apenas em runtime via grouping, ou criar um registry persistente)?
