---
name: Private Blocks
description: Marcar blocos como privados para que apareçam como private no Google Calendar
type: spec
---

# Blocos Privados

**Status**: done
**Criado**: 2026-04-28

## Problema

Hoje, todos os blocos sincronizados para o Google Calendar herdam a visibilidade default do calendário — o que significa que se o utilizador partilhar o calendário (com colegas, parceiro/a, equipa), o título e horário de qualquer bloco ficam visíveis. Há blocos que o utilizador quer agendar (terapia, reuniões pessoais, tempo focado em assuntos sensíveis) sem expor o conteúdo a quem tem acesso ao calendário. Faltam-lhe um interruptor por bloco para marcar privacidade.

## Utilizador e cenário

O utilizador já tem o Google Calendar sync ligado e usa o Bloc como source of truth. No meio do planeamento da semana ou ao editar o dia, encontra um bloco que não quer expor (ex.: "Sessão terapia 15:00") e quer rapidamente marcá-lo como privado para que terceiros que vêem o seu calendário só vejam "Ocupado" naquele slot.

## Solução proposta (alto nível)

Adicionar uma propriedade `private: bool` a cada bloco. O utilizador alterna esta flag a partir de duas localizações:

1. **Editor do bloco** (modal/painel de edição) — toggle "Privado".
2. **Vista do dia (timeline)** — ao clicar num bloco abre o popover/editor inline que também expõe esse toggle.

Na timeline, um bloco privado mostra um pequeno ícone de cadeado junto ao título; o título permanece visível para o utilizador (é o calendário dele). Ao sincronizar para o Google Calendar, o evento é criado/actualizado com `visibility: "private"`. O sync é bidireccional: eventos do Google Calendar que tenham `visibility: "private"` são importados como blocos privados.

Por defeito, blocos novos são públicos.

## Fluxo principal

1. Utilizador abre o Bloc na vista do dia ou no editor de bloco.
2. Selecciona um bloco existente (ou cria novo).
3. Vê um toggle "Privado" no editor.
4. Activa o toggle → bloco passa a privado, ícone de cadeado aparece na timeline imediatamente.
5. O sync com Google Calendar (push) actualiza o evento correspondente com `visibility: "private"`.
6. Outros utilizadores com acesso ao calendário Google passam a ver "Ocupado" naquele slot, sem título.
7. (Inverso) Utilizador cria um evento privado directamente no Google Calendar → no próximo pull, o bloco é importado para o Bloc com a flag privada activa e mostra o cadeado.

## Casos extremos / fora de âmbito

- **Cobre**:
  - Toggle individual por bloco (público ↔ privado).
  - Indicador visual (cadeado) na timeline.
  - Toggle disponível tanto no editor de bloco quanto no popover/edição inline da vista do dia.
  - Push: novos blocos privados criam eventos com `visibility: "private"`.
  - Push: alterar privacidade num bloco existente actualiza o evento correspondente.
  - Pull: eventos com `visibility: "private"` no Google Calendar tornam-se blocos privados.
  - Persistência no ficheiro markdown do dia.
  - Paridade entre renderer e MCP server (criar/ler tarefas via MCP respeita a flag).

- **Não cobre (por agora)**:
  - Configuração global "todos os blocos privados por defeito".
  - Substituir título por "Privado" / blur na própria timeline do Bloc (o utilizador vê sempre o título real no seu Bloc).
  - Privacidade granular do Google Calendar (`confidential` vs `private`) — usamos só `private`.
  - Encriptação local do conteúdo do bloco no markdown.
  - Marcar blocos privados em massa (selecção múltipla).
  - UI específica para o caso "este bloco veio do GCal e é privado lá" (só importa se a flag está activa, sem distinção de origem).

## Critérios de aceitação

- [ ] Existe um toggle "Privado" no editor de bloco (modal de edição).
- [ ] Existe o mesmo toggle no popover/edição inline da vista do dia.
- [ ] Quando o toggle está activo, um ícone de cadeado aparece junto ao título do bloco na timeline.
- [ ] O título do bloco continua legível para o utilizador no Bloc, mesmo quando privado.
- [ ] Blocos novos começam públicos por defeito.
- [ ] Ao sincronizar para o Google Calendar (push), um bloco privado cria/actualiza o evento com `visibility: "private"`.
- [ ] Ao sincronizar do Google Calendar (pull), um evento com `visibility: "private"` é importado como bloco privado.
- [ ] Alterar a flag num bloco existente propaga ao evento gcal correspondente no próximo push.
- [ ] A flag é persistida no ficheiro markdown do dia, sobrevive a reinício da app.
- [ ] O MCP server lê e escreve a flag em paridade com o renderer (criar bloco via MCP com `private: true` produz o mesmo formato).
- [ ] Ficheiros markdown antigos (sem a flag) continuam a parsear correctamente — blocos sem flag são tratados como públicos.

## Questões em aberto

- Forma exacta de representar a flag no markdown (frontmatter por bloco? sufixo na linha do bloco? metadata inline?). A decidir na fase de plan, mas com critério: continuar legível para humanos e robusto a parser tolerante.
- Ícone de cadeado: usar Lucide React (já em uso no projecto?) ou SVG inline.
- Conflict resolution: se um bloco mudar de privacidade no Bloc enquanto o evento gcal também muda, quem ganha? Investigar a estratégia actual do `googleCalendarSync.ts` na fase de plan.
