# 📘 Guia Passo a Passo — Supabase + GitHub + Vercel

Este guia mostra como colocar o **Controle de Plano de Testes** no ar com:
- **GitHub** → repositório do código
- **Vercel** → hospedagem (site estático, grátis)
- **Supabase** → banco de dados + armazenamento de evidências + login

Tempo estimado: **20 a 30 minutos**. Nenhum backend precisa ser programado.

---

## PARTE 1 — Criar e configurar o projeto no Supabase

### 1.1 Criar a conta e o projeto
1. Acesse **https://supabase.com** e clique em **Start your project** (pode entrar com a conta do GitHub).
2. Clique em **New project**.
3. Preencha:
   - **Name:** `controle-de-testes` (ou o nome que preferir)
   - **Database Password:** crie uma senha forte e **guarde-a** (é a senha do banco, não do app)
   - **Region:** `South America (São Paulo)` — menor latência para o Brasil
4. Clique em **Create new project** e aguarde ~2 minutos até o projeto ficar pronto.

### 1.2 Criar as tabelas e as regras de segurança
1. No menu lateral do painel, clique em **SQL Editor**.
2. Clique em **New query**.
3. Abra o arquivo **`sql/supabase-setup.sql`** (está neste pacote), copie **todo** o conteúdo e cole no editor.
4. Clique em **Run** (ou `Ctrl+Enter`).
5. Deve aparecer **"Success. No rows returned"**. Pronto: tabela `cloud_runs`, bucket `evidencias` e todas as políticas de segurança foram criados.

> 💡 Para conferir: menu **Table Editor** → deve existir a tabela `cloud_runs`. Menu **Storage** → deve existir o bucket `evidencias`.

### 1.3 Configurar o login (Auth)
1. Menu lateral → **Authentication** → **Providers** (ou "Sign In / Up").
2. Confirme que **Email** está habilitado (já vem por padrão).
3. **Recomendado para uso interno:** desative a confirmação de e-mail para a equipe entrar na hora:
   - Em **Authentication → Providers → Email**, desmarque **"Confirm email"** e salve.
   - Se preferir manter a confirmação, cada usuário receberá um e-mail e precisará clicar no link antes do primeiro login.

### 1.4 Copiar as credenciais de conexão
1. Menu lateral → **Project Settings** (ícone de engrenagem) → **API** (ou "API Keys").
2. Anote dois valores:
   - **Project URL** → algo como `https://abcdefgh.supabase.co`
   - **anon public key** → um texto longo começando com `eyJ...`
3. ⚠️ **Nunca use a `service_role key`** no app — ela é secreta e dá acesso total. A `anon public` é a correta e foi feita para ficar exposta no navegador (a segurança vem das políticas RLS que o script SQL criou).

---

## PARTE 2 — Subir o código para o GitHub

### 2.1 Criar o repositório
1. Acesse **https://github.com** → **New repository**.
2. Nome sugerido: `controle-de-testes`. Escolha **Private** (ferramenta interna).
3. Crie sem README (o projeto já tem um).

### 2.2 Enviar os arquivos
No seu computador, dentro da pasta do projeto (a pasta `controle-testes` deste pacote, contendo `index.html`, `js/`, `style.css`, `logo.png` etc.):

```bash
git init
git add .
git commit -m "Aplicação modularizada + integração Supabase"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/controle-de-testes.git
git push -u origin main
```

> 💡 O pacote entregue já está completo e pronto para deploy: `index.html`, pasta `js/` (11 módulos), `style.css`, imagens, `export-teams.js`, `sql/` e este guia.

> 🔒 Sobre as chaves no repositório: a `anon key` **pode** ficar no código sem problema (é pública por design). Mas o app já foi feito para funcionar **sem** colocá-la no código: cada usuário informa a URL e a chave uma única vez no modal ☁️, e fica salvo no navegador dele. Escolha o que preferir:
> - **Opção A (repo limpo):** não mexa em nada — cada usuário configura no modal.
> - **Opção B (equipe sem configurar nada):** edite `js/11-supabase-sync.js` e preencha as constantes `SB_DEFAULT_URL` e `SB_DEFAULT_ANON_KEY` no topo do arquivo antes do push.

---

## PARTE 3 — Publicar no Vercel

1. Acesse **https://vercel.com** e entre com a conta do **GitHub**.
2. Clique em **Add New… → Project**.
3. Na lista, localize o repositório `controle-de-testes` e clique em **Import**.
4. Configurações do deploy:
   - **Framework Preset:** `Other`
   - **Build Command:** deixe **vazio**
   - **Output Directory:** deixe **vazio** (raiz)
5. Clique em **Deploy**. Em ~30 segundos o site estará no ar em um endereço como `https://controle-de-testes.vercel.app`.
6. A partir daqui, **todo `git push` na branch `main` publica automaticamente** uma nova versão.

### 3.1 Liberar o domínio no Supabase (importante)
1. Volte ao painel do Supabase → **Authentication → URL Configuration**.
2. Em **Site URL**, coloque a URL do Vercel: `https://controle-de-testes.vercel.app`.
3. Em **Redirect URLs**, adicione a mesma URL. Isso garante que links de confirmação/recuperação de senha voltem para o seu site.

---

## PARTE 4 — Conectar e usar a aplicação

1. Abra o site no Vercel.
2. Na barra lateral, clique no novo botão verde **☁️ Nuvem (Supabase)**.
3. Clique em **⚙️ Configurar conexão** e cole:
   - **URL do projeto** (Parte 1.4)
   - **anon public key** (Parte 1.4)
   - Clique em **Salvar configuração** (fica gravado no navegador — só precisa fazer uma vez por máquina).
   - *(Se você usou a Opção B da Parte 2.2, pule este passo.)*
4. **Criar conta:** informe e-mail e senha (mín. 6 caracteres) → **Criar conta**. Depois **Entrar**.
5. **Salvar na nuvem:** com um plano de testes aberto na tela, dê um nome à run e clique em **💾 Salvar**.
   - O app envia automaticamente **vídeos e imagens grandes para o Storage** (bucket `evidencias`) e grava **todos os dados** (casos, tickets, comentários, tags, histórico) na tabela `cloud_runs`.
   - Imagens pequenas continuam em Base64 dentro do banco, como você pediu.
   - Salvar de novo com o **mesmo nome** sobrescreve a run (atualização).
6. **Carregar:** qualquer pessoa da equipe logada vê a lista de runs e pode clicar em **Carregar** — os dados e as evidências voltam para a tela exatamente como foram salvos.
7. **Excluir:** cada usuário pode excluir apenas as próprias runs (os arquivos do Storage são apagados junto).

---

## Como funciona a segurança

| Item | Regra |
|---|---|
| Ver runs | Qualquer usuário **logado** da equipe vê todas as runs |
| Criar/editar/excluir runs | Apenas o **dono** da run |
| Evidências (Storage) | Bucket **privado**; leitura só logado, via URL assinada válida por 7 dias; upload só na pasta do próprio usuário |
| anon key exposta | Sem risco: sem login não se lê nem grava nada (RLS ativo em tudo) |

---

## Solução de problemas

| Sintoma | Causa provável / solução |
|---|---|
| "Biblioteca do Supabase não carregada" | Verifique se o `index.html` tem a tag do supabase-js (já incluída no pacote) e se há internet |
| Erro "Invalid API key" | anon key copiada errada — copie novamente em Project Settings → API |
| Cadastro criado mas login falha | Confirmação de e-mail está ativa — confirme pelo e-mail ou desative (Parte 1.3) |
| "new row violates row-level security" | O script SQL não foi executado por completo — rode o `supabase-setup.sql` de novo |
| Vídeo não carrega após 7 dias com a página aberta | A URL assinada expirou — basta recarregar a run |
| Upload de vídeo muito grande falha | Limite padrão do Storage é 50 MB por arquivo no plano free; grave vídeos mais curtos ou aumente o limite em Storage → Settings |

---

## Limites do plano gratuito do Supabase (referência)

- **Banco:** 500 MB (os dados dos testes são leves, dura muito)
- **Storage:** 1 GB de arquivos + 5 GB de transferência/mês (evidências em vídeo consomem isso primeiro — monitore em *Reports*)
- **Auth:** 50.000 usuários ativos/mês (irrelevante para equipe interna)
- Projetos gratuitos **pausam após 7 dias sem uso** — basta um acesso ao painel para reativar, sem perda de dados.
