---
**Status**: done
**Criado**: 2026-05-04
---

# Vista Blocos — evolução da TAB Tarefas

## Problema

A TAB "Tarefas" no `/inbox` ([InboxView.tsx:191-262](../../src/renderer/views/InboxView.tsx)) já agrupa tarefas por bloco (introduzido pela feature `tasks-management`, status done). À medida que o número de blocos cresce, surgem três fricções: (1) localizar um bloco específico exige scroll, (2) blocos sem tarefas activas geram ruído, (3) reorganizar tarefas que ficaram no projecto errado obriga a remover-criar manualmente. O delete actual em [InboxView.tsx:345](../../src/renderer/views/InboxView.tsx) só funciona quando o bloco está vazio, o que é demasiado restritivo.

## Utilizador e cenário

Utilizador em sessão de triagem/planeamento de projectos, fora do contexto de um dia. Tem dezenas de blocos com tarefas espalhadas. Quer reorganizar e fazer limpeza.

## Solução proposta (alto nível)

A TAB "Tarefas" passa a chamar-se **"Blocos"** (rename do label e do ícone). Acima da lista, novos controlos:

- **Barra de pesquisa** que filtra grupos pelo nome do bloco (case-insensitive, match parcial). Não pesquisa texto de tarefas.
- Toggle **"Ocultar blocos vazios"** que esconde grupos sem tarefas pendentes; estado persiste entre sessões.
- Toggle existente **"Mostrar concluídas"** mantém-se.

Cada grupo aceita **drag-and-drop** de tarefas — agarrar uma tarefa e largá-la noutro grupo transfere-a via `moveTask` ([taskStore.ts:138](../../src/renderer/stores/taskStore.ts), já existente). Apenas entre blocos com instância (untimed ou calendar). Não suporta largar em "Sem bloco" nem reordenar dentro do mesmo bloco.

Cada grupo ganha **botão eliminar** visível no hover do header (não só quando vazio). Click abre modal de confirmação: *"Eliminar bloco "X" e as N tarefas?"*. Confirmar remove o bloco untimed e todas as tarefas atribuídas em qualquer data.

## Fluxo principal

1. Utilizador abre `/inbox` e vai à tab **Blocos** (antes "Tarefas").
2. No topo da lista vê: barra de pesquisa, toggle "Ocultar blocos vazios", toggle "Mostrar concluídas", botão "Criar bloco".
3. Escreve "rev" na pesquisa → lista colapsa para grupos cujo título contém "rev".
4. Limpa, activa "Ocultar blocos vazios" → grupos sem tarefas pendentes desaparecem.
5. Agarra tarefa do bloco "EMMA" e arrasta até ao header de "Latino Coelho" → transfere.
6. Hover no header de "KDA" → carrega no botão eliminar → modal *"Eliminar bloco "KDA" e as 4 tarefas?"* → confirma → bloco e tarefas desaparecem.
7. Reabre a app → "Ocultar blocos vazios" continua activo.

## Casos extremos / fora de âmbito

**Cobre**
- Rename "Tarefas" → "Blocos" (label + ícone na tab).
- Pesquisa por nome do bloco (case-insensitive, match parcial).
- Ocultar blocos sem tarefas pendentes (toggle persistido).
- DnD de tarefas entre blocos com instância (untimed e calendar).
- Eliminar bloco com confirmação a indicar contagem; cascata para tarefas em todas as datas/instâncias.

**Não cobre (por agora)**
- DnD para "Sem bloco" (desatribuir).
- DnD para reordenar dentro do mesmo bloco.
- Pesquisa por texto de tarefas.
- Renomear bloco ou mudar cor a partir desta vista.
- Eliminar com undo — confirmação é a salvaguarda; ficheiros MD ficam em iCloud (recuperáveis via histórico).
- Multi-select de tarefas para mover/eliminar em batch.

## Critérios de aceitação

- [ ] A tab antes chamada "Tarefas" no `/inbox` aparece como "Blocos" (label + ícone).
- [ ] Acima da lista existe barra de pesquisa que filtra grupos por nome do bloco em tempo real.
- [ ] Existe toggle "Ocultar blocos vazios" que esconde grupos sem tarefas pendentes; estado persiste entre sessões.
- [ ] Pode-se arrastar uma tarefa de um grupo e largá-la noutro grupo — transfere-se via `moveTask`.
- [ ] DnD não permite largar no grupo "Sem bloco" (passivo) nem reordenar dentro do mesmo bloco.
- [ ] Cada grupo de bloco com instância tem botão eliminar visível no hover do header, mesmo com tarefas.
- [ ] Click em eliminar abre modal a indicar nome + contagem de tarefas a remover.
- [ ] Confirmar elimina o bloco untimed (se existir) e todas as tarefas atribuídas em qualquer data.
- [ ] O grupo "Sem bloco" não pode ser eliminado.
- [ ] Toggle "Mostrar concluídas" continua a funcionar.
- [ ] Pesquisa + "ocultar vazios" + "mostrar concluídas" combinam-se de forma previsível (intersecção dos filtros).

## Questões em aberto (para Fase plan)

- **Library de DnD**: HTML5 nativo (draggable + dragover) ou já existe `@dnd-kit` ou outra no projecto? Verificar `package.json` e precedente noutras vistas (ex: `WeekDayColumn`).
- **Eliminar blocos com instâncias agendadas no calendário**: a semântica "elimina tarefas" está clara, mas e os `TimeBlock` agendados em datas que partilham título? Eliminar todas as instâncias ou apenas o untimed + tarefas?
- **Persistência do "ocultar vazios"**: localStorage chave dedicada vs nova entry no `settingsStore`?
- **Atalho de pesquisa**: ⌘F focar a barra dentro da view?
- **"Sem bloco" e a pesquisa**: aparece sempre ou também é filtrado pelo termo?
