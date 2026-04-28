---
name: deploy
description: Publica uma nova release do Bloc. Usa quando o utilizador quer fazer deploy, lançar versão, publicar release ou pedir "/deploy". Conduz bump de versão → push da tag → espera CI (build nas 3 plataformas via electron-builder) → verifica artefactos da Draft Release → publica a release no GitHub. NUNCA cria release manualmente com `gh release create`.
---

# /deploy — Release do Bloc

Orquestra o pipeline de release de ponta a ponta. O CI (`.github/workflows/release.yml`) faz o trabalho pesado: ao receber uma tag `v*`, electron-builder builda nas 3 plataformas com `--publish always`, criando uma **GitHub Release como Draft** com os assets. Esta skill prepara, dispara, espera e publica.

## Regras invioláveis

- **NUNCA** correr `gh release create` manualmente. A release é criada pelo electron-builder no CI. Criar à mão produz uma release sem os ficheiros `latest-*.yml` e parte o autoupdate.
- **NUNCA** fazer push de tag a partir de uma branch que não seja `main`.
- **NUNCA** publicar (`--draft=false`) sem confirmar que os 3 ficheiros `latest-*.yml` estão presentes nos assets — sem eles o autoupdate dos clients existentes não funciona.
- **NUNCA** saltar o checkpoint final de aprovação antes de publicar.

## Fase 0 — Pré-voo

Antes de tocar em qualquer coisa, valida o estado:

1. Branch actual = `main`. Se não, pára e pergunta.
2. Working tree limpo (`git status --porcelain` vazio). Se há mudanças, pára e pergunta.
3. Sincronizado com remoto: `git fetch origin && git status` — sem commits em divergência. Se estás atrás, faz `git pull --ff-only`. Se estás à frente, lista os commits ao utilizador para confirmar que devem mesmo entrar nesta release.
4. Lê a versão actual em `package.json` (`"version"`).
5. Lê a última tag: `git tag --sort=-v:refname | head -1`. Devem coincidir com `v<package.json version>` — se não, pergunta antes de seguir (pode haver release a meio).
6. CI green em `main`: `gh run list --branch main --limit 1 --json conclusion,status` — se a última corrida falhou, avisa antes de avançar.

## Fase 1 — Bump de versão

1. Pergunta ao utilizador: **patch, minor ou major?** (ou versão explícita). Não decidas sozinho.
2. Calcula a nova versão (`X.Y.Z`).
3. Bump + commit + tag numa só operação:
   ```bash
   npm version <patch|minor|major> -m "Bump version to %s"
   ```
   Isto:
   - Edita `package.json`
   - Cria commit `Bump version to X.Y.Z` (matching o histórico)
   - Cria tag anotada `vX.Y.Z`
4. Não faz push automaticamente — confirma com o utilizador antes da Fase 2.

> **Se houver outros ficheiros que precisam de bump** (ex: `mcp-server/package.json` se mexer nele): faz-lo ANTES de `npm version`, com `--no-git-tag-version`, ou edita à mão e inclui no mesmo commit. O importante é um único commit por release.

## Fase 2 — Push (dispara o CI)

```bash
git push origin main --follow-tags
```

`--follow-tags` empurra o commit + a tag anotada `vX.Y.Z` reachable a partir do commit. É a tag que dispara o job de release.

Após o push:
1. Espera 5-10 segundos para o GitHub registar o run.
2. Encontra o run da release: `gh run list --workflow=release.yml --limit=1 --json databaseId,headSha,status,event` — confirma que `event == "push"` e `headSha` bate com `git rev-parse HEAD`.
3. Mostra ao utilizador o ID e o URL: `gh run view <id> --json url -q .url`.

## Fase 3 — Esperar o build

O CI corre 3 jobs em paralelo (macOS, Windows, Linux). Tipicamente 5-10 min total.

Comando preferido (bloqueia até terminar, exit-status ≠ 0 se falhar):
```bash
gh run watch <id> --exit-status --interval 30
```

Se o `Bash` timeout (10 min) for excedido, faz polling em vez disso:
```bash
gh run view <id> --json status,conclusion,jobs
```
Repete a cada 30-60s até `status == "completed"`.

**Se algum job falhar**:
- Pára imediatamente, **não publiques nada**.
- Mostra o output do job falhado: `gh run view <id> --log-failed`.
- Pergunta ao utilizador se quer:
  - corrigir e fazer nova release (apaga a tag remota? `git push --delete origin vX.Y.Z` + `git tag -d vX.Y.Z` — **só com aprovação explícita**)
  - re-correr o workflow (`gh run rerun <id>`)
  - investigar manualmente

## Fase 4 — Verificar a Draft Release

Quando o CI passa, electron-builder já criou a release como Draft. Verifica:

```bash
gh release view vX.Y.Z --json isDraft,assets,url
```

Confirma:
- `isDraft == true` (esperado neste momento)
- **Assets obrigatórios** (sem estes, o autoupdate parte):
  - `latest-mac.yml`
  - `latest.yml` (Windows)
  - `latest-linux.yml`
- **Binários esperados** (nomes podem variar pela versão de electron-builder, valida pela extensão):
  - macOS: pelo menos um `.dmg` (idealmente x64 + arm64) e um `.zip` (necessário para autoupdate Mac)
  - Windows: um `Bloc-Setup-*.exe`
  - Linux: um `*.AppImage`

Se faltar algo, **não publiques**. Mostra a lista ao utilizador e pergunta como prosseguir.

## Fase 5 — Publicar (checkpoint!)

Antes de publicar, mostra ao utilizador um resumo:
- Versão: `vX.Y.Z`
- URL da release (Draft): `<url>`
- Assets confirmados: `<lista>`
- Pergunta literal: **"Confirmas a publicação da release vX.Y.Z?"**

Só com confirmação explícita:
```bash
gh release edit vX.Y.Z --draft=false
```

Após publicar:
1. Confirma: `gh release view vX.Y.Z --json isDraft,url` → `isDraft == false`.
2. Mostra o URL final ao utilizador.
3. **Não** envies notificações nem postas em lado nenhum sem ser pedido.

## Recuperação de erros comuns

- **Tag já existe localmente** (`fatal: tag 'vX.Y.Z' already exists`) → alguém já bumpou; investiga `git log` antes de qualquer destrutivo.
- **Push rejeitado por non-fast-forward** → alguém empurrou para `main` entretanto. Faz `git pull --ff-only` e reavalia se a release ainda faz sentido.
- **CI falhou em 1 plataforma só** → não publiques parcialmente. Investiga, corrige, ou re-runa esse job (`gh run rerun --failed <id>`).
- **Draft criada sem `latest-*.yml`** → CI não correu com `--publish always`. Confirma que o ref começa por `refs/tags/v` (a condição no workflow). Não fixes editando à mão a release.

## Notas

- O electron-builder usa `publish.provider: github` e `owner: diegofersan, repo: bloc` (config em `package.json` → `build.publish`). É esta config que ele consulta para criar a Draft — não tens de a passar.
- macOS tem ad-hoc signing (`CSC_IDENTITY_AUTO_DISCOVERY: false`). Os DMGs não são notarizados — utilizadores podem ver aviso de Gatekeeper. Documenta isto se for surpresa.
- O autoupdate só funciona se os ficheiros `latest-*.yml` estiverem presentes E a release estiver publicada (não Draft).
