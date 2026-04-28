---
name: feature
description: Spec-Driven Development para o Bloc. Usa quando o utilizador quer desenhar, planear ou implementar uma nova funcionalidade. Conduz o fluxo spec → plan → tasks → implement com checkpoints de aprovação entre fases. Activa em pedidos como "nova feature", "vamos adicionar", "quero implementar X", ou quando o utilizador invoca /feature.
---

# /feature — Spec-Driven Development para o Bloc

Conduz o desenvolvimento de uma nova funcionalidade em **4 fases sequenciais**, cada uma a produzir um artefacto markdown em `specs/<feature-slug>/`. Cada fase termina num **checkpoint de aprovação** — não avanças sem o "ok" do utilizador.

## Estado e retomar

Antes de qualquer coisa: descobre em que fase estás.

1. Determina o **slug** (kebab-case do nome da feature). Se o utilizador não disse, pergunta.
2. Verifica `specs/<slug>/` (cria a pasta se necessário):
   - Sem ficheiros → começa em **Fase 1: spec**
   - Existe `spec.md` mas não `plan.md` → **Fase 2: plan**
   - Existe `plan.md` mas não `tasks.md` → **Fase 3: tasks**
   - Existe `tasks.md` → **Fase 4: implement**
3. Se o utilizador pedir explicitamente uma fase ("refaz o plan", "salta para tasks"), respeita.
4. Confirma com o utilizador em que fase vais entrar antes de produzir output.

---

## Fase 1 — `spec.md` (O QUÊ e PORQUÊ)

**Objectivo**: descrever a feature do ponto de vista do utilizador, sem código nem decisões técnicas.

Faz perguntas até teres clareza sobre: problema, utilizador-alvo, fluxo de uso, critérios de aceitação. **Não inventes** — se não souberes, pergunta.

Escreve `specs/<slug>/spec.md` com este template:

```markdown
# <Nome da feature>

**Status**: spec
**Criado**: <YYYY-MM-DD>

## Problema
<1-3 frases: que dor resolve? Porque agora?>

## Utilizador e cenário
<Quem usa, em que momento do dia/fluxo, com que estado mental.>

## Solução proposta (alto nível)
<Descrição em 1-2 parágrafos do que o utilizador vai ver/fazer. Sem código.>

## Fluxo principal
1. <passo>
2. <passo>
…

## Casos extremos / fora de âmbito
- **Cobre**: …
- **Não cobre (por agora)**: …

## Critérios de aceitação
- [ ] <comportamento observável e verificável>
- [ ] …

## Questões em aberto
- <decisões adiadas para a fase de plan>
```

**Checkpoint**: mostra o spec e pergunta "Aprovas o spec? Avanço para plan?" — só prossegue após confirmação.

---

## Fase 2 — `plan.md` (COMO, tecnicamente)

**Objectivo**: traduzir o spec em decisões técnicas concretas para os 4 layers do Bloc. Lê o spec e o código relevante (stores, ficheiros MCP, IPC handlers) antes de escrever.

Escreve `specs/<slug>/plan.md`:

```markdown
# <Nome> — Plano técnico

**Status**: plan
**Spec**: ./spec.md

## Resumo da abordagem
<1 parágrafo: a estratégia geral.>

## Layer 1 — Schema Markdown (iCloud)
<Os ficheiros em ~/Bloc/YYYY/YYYY-MM-DD.md são source of truth.>

- **Mudanças ao formato**: <novas secções? novos campos? nada?>
- **Migração**: <ficheiros antigos continuam a parsear? estratégia de leitura tolerante?>
- **Exemplo de bloco MD novo/alterado**:
  ```markdown
  <snippet>
  ```

> Se esta secção for "nenhuma mudança", diz explicitamente.

## Layer 2 — Stores Zustand (renderer)
- **Stores tocadas**: <ex: `taskStore`, `flowStore`>
- **Estado novo**: <campos, tipos>
- **Acções novas**: <assinaturas>
- **Persistência**: <persist() afectado? selectors novos?>
- **Selectors / derivados**: …

## Layer 3 — IPC main↔renderer
- **Handlers novos/alterados**: `<canal>` → contrato (input, output, eventos)
- **Eventos push (main → renderer)**: …
- **Permissões / capacidades do main process** (idle, tray, fs, network): …

> Se nada muda no main, diz "sem alterações IPC".

## Layer 4 — MCP server (`mcp-server/`)
**Regra**: se a Layer 1 mudou, o MCP TEM de ser actualizado em paridade. Renderer e MCP escrevem o mesmo formato — divergência corrompe ficheiros.

- **Tools afectadas**: <ex: `read_day`, `create_task`>
- **Tools novas**: <nome + I/O + validações>
- **Serialize/deserialize**: <ajustes em `mcp-server/src/storage.ts`>

## UI / componentes
- **Componentes novos**: …
- **Componentes alterados**: …
- **Atalhos / tray / menus**: …
- **Estados de loading / erro / vazio**: …

## Verificação
- **Manual**: passos para validar end-to-end (incl. cenário iCloud-watch e MCP)
- **Automatizada** (se aplicável): …

## Riscos e alternativas
- <risco>: <mitigação>
- <alternativa considerada>: <porque foi rejeitada>
```

**Princípios de design no Bloc** (lembra-te ao planear):
- Markdown é source of truth — Zustand é cache reactiva. Nunca o inverso.
- Mudança ao schema MD obriga a actualizar **renderer + MCP em paralelo**.
- Watch polling iCloud (3s) significa que o renderer pode receber mudanças externas a qualquer momento — desenha pensando em re-hidratação.
- Tailwind v4 via PostCSS, CSS custom em `@layer base`/`components` (nunca fora de @layer).

**Checkpoint**: mostra o plan e pergunta "Aprovas o plano? Avanço para tasks?".

---

## Fase 3 — `tasks.md` (PASSOS executáveis)

**Objectivo**: decompor o plan em tarefas pequenas, ordenadas por dependência, cada uma verificável.

Escreve `specs/<slug>/tasks.md`:

```markdown
# <Nome> — Tasks

**Status**: tasks
**Plan**: ./plan.md

## Ordem de execução

> Regra: schema MD primeiro, depois MCP + storage helpers, depois stores, depois IPC, depois UI. Nunca quebrar paridade entre renderer e MCP — se alterares o MD, faz MCP+renderer no mesmo passo.

### 1. Schema & types partilhados
- [ ] T1.1 — <descrição> · ficheiro(s): `…` · verificação: `…`

### 2. MCP server
- [ ] T2.1 — …

### 3. Stores Zustand
- [ ] T3.1 — …

### 4. IPC handlers
- [ ] T4.1 — …

### 5. UI / componentes
- [ ] T5.1 — …

### 6. Verificação manual
- [ ] T6.1 — Abrir `npm run dev`, executar fluxo: …
- [ ] T6.2 — Confirmar ficheiro `~/Library/Mobile Documents/.../Bloc-Dev/<data>.md` tem o formato esperado
- [ ] T6.3 — Invocar a tool MCP equivalente e confirmar paridade
```

Cada tarefa deve ter: descrição clara, ficheiro(s) afectado(s), critério de "feito".

**Checkpoint**: "Aprovas as tasks? Começo a implementar?".

---

## Fase 4 — Implementação

1. Lê `tasks.md` e cria items na lista de tarefas (TaskCreate) na mesma ordem.
2. Executa **uma tarefa de cada vez**. Marca `[x]` em `tasks.md` à medida que terminas.
3. **Não saltes ordem de layers**: se T2 depende de T1, T1 acaba primeiro.
4. **Paridade MCP↔renderer**: ao tocar em serialização, valida em ambos antes de avançar.
5. Após cada bloco lógico, corre o type-check / build relevante (`npm run build` se for end-to-end). Não inventes "deve compilar".
6. **Não adicionar features fora do scope** do spec — se descobrires algo necessário, pergunta antes de incluir.
7. Quando todas as tarefas estiverem `[x]`:
   - Actualiza header dos 3 ficheiros para `**Status**: done`
   - Resume ao utilizador o que foi entregue + cenários verificados
   - **Não faças commit** sem ser pedido.

---

## Anti-padrões (evitar)

- ❌ Saltar fases ("é simples, vou directo ao código") — se for mesmo simples, o spec demora 2 minutos.
- ❌ Escrever código no `spec.md` ou `plan.md` em vez de instruções claras.
- ❌ Mudar o schema MD apenas no renderer (ou apenas no MCP). **Sempre os dois**.
- ❌ Criar `specs/<slug>/spec.md` sem alinhar antes o slug com o utilizador.
- ❌ Avançar de fase sem checkpoint explícito de aprovação.
- ❌ Adicionar tarefas no `tasks.md` durante implementação sem actualizar o documento.
