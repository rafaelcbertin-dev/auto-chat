# AutoChat

Automação de DMs e comentários do **Instagram** e do **WhatsApp**, para uso próprio. Roda em **Cloudflare Workers + D1** (o plano gratuito costuma bastar) e usa só as **APIs oficiais da Meta**.

## O que faz

- **Comentário → DM**: alguém comenta uma palavra-chave num post/reels e recebe uma DM automática. Pode também responder o comentário publicamente, com uma frase sorteada de uma lista. Dá para limitar a um post específico.
- **Palavra-chave na DM** (Instagram e WhatsApp): responde mensagens que contêm, ou são exatamente, certas palavras. Ignora acentos e maiúsculas. Também tem o modo "qualquer mensagem", que serve de resposta padrão.
- **Fluxos com botões**: mensagens com botões que levam a outros passos. Até 3 viram botões; com mais, viram respostas rápidas (Instagram) ou lista (WhatsApp). Há também **perguntas** que salvam a resposta (e-mail, telefone, nome ou qualquer campo, com validação) e passos de **tag**.
- **Contatos e tags**: lista com busca, filtro por tag e canal, exportação em CSV, histórico da conversa, tags manuais e resposta manual dentro da janela de 24h.
- Variáveis nas mensagens: `{{first_name}}`, `{{name}}`, `{{username}}`, `{{email}}`, `{{phone}}` e qualquer campo salvo.

## Limites impostos pela Meta (valem para qualquer ferramenta, inclusive o ManyChat)

- Só dá para mandar mensagem até **24h depois da última mensagem da pessoa**. O AutoChat só responde, nunca inicia conversa.
- No Instagram, a resposta privada a um comentário é **uma única mensagem**. Para o fluxo continuar, ponha botões no primeiro passo; o modelo "Comentário → DM com link" já vem assim.
- No WhatsApp a Meta cobra por conversa, conforme a tabela dela. Conversas iniciadas pelo cliente costumam ter uma cota gratuita.

## Instalação

Pré-requisitos: Node 20+, uma conta Cloudflare e uma conta de desenvolvedor Meta (developers.facebook.com).

```bash
npm install
npx wrangler login
npx wrangler d1 create autochat      # copie o database_id para o wrangler.toml
npm run db:migrate
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put META_VERIFY_TOKEN   # invente um texto
npm run deploy                        # mostra a URL, ex.: https://autochat.SEU-USUARIO.workers.dev
```

Abra a URL, entre com a senha e veja em **Painel** o endereço do webhook.

### Instagram (Instagram API with Instagram Login)

A conta precisa ser **profissional** (Criador ou Empresa).

1. Em developers.facebook.com, crie um app do tipo **Business** e adicione o produto **Instagram** › *API setup with Instagram login*.
2. Em *Generate access tokens*, adicione sua conta e gere o token. Depois salve o token e o *Instagram app secret*:
   ```bash
   npx wrangler secret put IG_ACCESS_TOKEN
   npx wrangler secret put IG_APP_SECRET
   ```
3. Em *Configure webhooks*, use a URL `https://SEU-WORKER/webhook` e o mesmo `META_VERIFY_TOKEN`. Depois assine os campos `messages`, `messaging_postbacks` e `comments`.
4. No app do Instagram, ative em *Configurações › Mensagens › Ferramentas conectadas* a opção **Permitir acesso às mensagens**.
5. Como só a sua própria conta é usada, o app pode ficar em modo de desenvolvimento, desde que você seja administrador do app. Se a Meta exigir *App Review* para alguma permissão, siga o assistente do painel.

> O token do Instagram dura 60 dias. Renove pelo painel da Meta, ou com `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=...`, e atualize o segredo.

Para pegar o **ID de um post** e restringir um gatilho de comentário a ele: depois do primeiro comentário nesse post, o ID aparece no contato (em *Contatos*, o comentário guarda o `mediaId`). Outra opção é consultar `GET https://graph.instagram.com/v21.0/me/media?access_token=...`.

### WhatsApp (Cloud API)

1. No mesmo app, adicione o produto **WhatsApp** e registre seu número. Ele não pode estar em uso no app comum do WhatsApp.
2. Crie um **usuário de sistema** no Business Manager e gere um token permanente com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`.
3. Salve os segredos:
   ```bash
   npx wrangler secret put WA_ACCESS_TOKEN
   npx wrangler secret put WA_PHONE_NUMBER_ID
   npx wrangler secret put META_APP_SECRET   # App Secret em Configurações › Básico
   ```
4. Em *WhatsApp › Configuração › Webhook*, use a mesma URL e o mesmo token de verificação, e assine o campo `messages`.

## Desenvolvimento

```bash
cp .dev.vars.example .dev.vars   # preencha
npm run db:migrate:local
npm run dev                      # http://localhost:8787
npm test
npm run typecheck
```

Para simular webhooks sem assinatura em ambiente local, ponha `ALLOW_UNSIGNED_WEBHOOKS=true` no `.dev.vars`. **Nunca** use isso em produção.

## Estrutura

| Arquivo | Função |
|---|---|
| `src/index.ts` | Rotas: `/webhook`, `/login`, `/api/*`, painel |
| `src/webhook.ts` | Converte os webhooks da Meta em eventos e valida a assinatura |
| `src/engine.ts` | Motor das automações (gatilhos, fluxo, perguntas, tags) |
| `src/channels/meta.ts` | Envio pela Graph API (Instagram e WhatsApp) |
| `src/db.ts` | Acesso ao D1 |
| `src/admin/*` | API, login e interface do painel |
| `migrations/` | Esquema do banco |
