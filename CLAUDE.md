# AutoChat: contexto para o Claude

Ferramenta própria de automação de Instagram e WhatsApp, parecida com o ManyChat, para a **Terravo Origem** (@terravoorigem). Uso próprio, não é para vender. Converse com o dono em **português**.

## Onde está cada coisa

- **Painel em produção:** https://autochat.rafaelcbertin.workers.dev (senha no segredo `ADMIN_PASSWORD`)
- **Código:** este repositório (`rafaelcbertin-dev/auto-chat`), branch `main`
- **Hospedagem:** Cloudflare Workers, Worker `autochat`, e banco D1 `autochat` (o ID está no `wrangler.toml`)
- **App da Meta:** "Autochat", ID `1084098101307628`, com o caso de uso "Gerenciar mensagens e conteúdo no Instagram" e o **login unificado** (config `29640439518978612`). Status: **Publicado**.
- **Conta conectada:** @terravoorigem (ID da conta profissional `17841477127210729`), ligada pelo botão "Conectar Instagram" do painel. O token fica no D1, na tabela `settings`, chave `instagram_connection`. Ele não expira.

## Segredos na Cloudflare (nunca no código nem no chat)

`ADMIN_PASSWORD`, `META_VERIFY_TOKEN` (token de verificação do webhook), `META_APP_SECRET` (chave secreta do app da Meta), `AUTOCHAT_API_KEY` (mínimo 32 caracteres; dá acesso só à `/api/*` pelo cabeçalho `Authorization: Bearer`, usado pela aba **AutoChat** do painel de Gestão da Revenda no projeto-churrasco, que guarda a mesma chave). WhatsApp ainda não configurado: faltam `WA_ACCESS_TOKEN` e `WA_PHONE_NUMBER_ID`.

Para publicar ou consultar a partir de uma sessão na nuvem: um token da API da Cloudflare (permissões Workers + D1 Edit) precisa estar salvo no ambiente para `api.cloudflare.com`. Com ele, use `CLOUDFLARE_API_TOKEN=proxy-injected` e `CLOUDFLARE_ACCOUNT_ID` da conta. No computador do dono, basta `npx wrangler login`.

## Comandos

```bash
npm install
npm test                 # vitest, 25 testes
npm run typecheck
npx wrangler deploy      # publica
npx wrangler d1 migrations apply autochat --remote   # migrações novas
```

Os logs do Worker estão ligados (`[observability]`): cada webhook recebido aparece como `webhook recebido` no painel da Cloudflare, em Workers › autochat › Observability.

## Estado atual (18/11/2026)

**Funcionando em produção, testado com a conta pessoal @bertin_rafa:**
- Comentário com palavra-chave → resposta pública + DM com botão que **abre link direto** (`web_url`). A automação 1, "Comentário → link", usa a palavra `Meet` e abre `https://app.terravoorigem.com.br/churrasco`, além de aplicar a tag `recebeu-link`.
- Contatos, tags, histórico e exportação CSV no painel.

**Bloqueado pela Meta:** nenhum aviso de **DM nem de clique em botão de resposta (postback)** chega ao webhook. Só os de **comentário** chegam. A chave "Permitir acesso às mensagens" do Instagram está ligada. Conclusão: a Meta só entrega avisos de mensagem de quem não tem função no app depois do **acesso avançado** (análise do app) a `instagram_manage_messages`. Enquanto isso não acontece, ficam sem funcionar: DM com palavra-chave, perguntas (capturar e-mail etc.) e botões que levam a outro passo. Por isso, use botões com **link** nos fluxos de comentário.

## Próximos passos possíveis (o dono escolhe)

1. Criar mais automações por comentário (já funcionam).
2. **WhatsApp:** o código está pronto (`src/channels/meta.ts`). Para o número da própria empresa não precisa de análise. Falta um número livre, o produto WhatsApp no mesmo app e os segredos `WA_*`, além de webhook com o campo `messages`.
3. **Análise do app** só com `instagram_basic`, `instagram_manage_messages` e `instagram_manage_comments`. Antes, tirar as permissões extras (anúncios, insights, eventos, publicação, Human Agent) do pedido. Precisa de textos de uso e de um vídeo curto. Existe um rascunho de pedido parado na Meta com 8 permissões: não enviar como está.

## Arquitetura (resumo)

| Arquivo | Função |
|---|---|
| `src/index.ts` | Rotas: `/webhook`, `/login`, `/connect/instagram` + retorno OAuth em `/?code&state`, `/api/*`, `/privacidade`, `/exclusao-de-dados` |
| `src/oauth.ts` | Login unificado: troca o code pelo token em `graph.facebook.com/oauth/access_token`, busca `me/assigned_instagram_accounts` e faz `POST /<IG_ID>/subscribed_apps` |
| `src/channels/meta.ts` | Envio: `POST graph.facebook.com/<IG_ID>/messages` (resposta privada com `recipient.comment_id`), `/<comment>/replies`, WhatsApp Cloud API |
| `src/engine.ts` | Motor: gatilhos (comentário / palavra-chave), fluxo (mensagem, pergunta, tag), sessões, botões de link e de próximo passo |
| `src/webhook.ts` | Converte os webhooks da Meta (Instagram e WhatsApp) e valida `X-Hub-Signature-256` |
| `src/db.ts` | D1: contatos, tags, automações, sessões, mensagens, configurações |
| `src/admin/*` | API, login (cookie HMAC) e o painel (HTML e JS puros) |

Graph API `v26.0` (variável `GRAPH_API_VERSION`). Apps novos da Meta **não** têm mais o "Instagram API with Instagram Login" (`graph.instagram.com`), só o login unificado.
