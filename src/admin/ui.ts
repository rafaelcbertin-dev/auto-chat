const STYLE = `
:root{--bg:#f6f7f9;--card:#fff;--text:#16181d;--muted:#667085;--line:#e4e7ec;--accent:#5b4be1;--accent-ink:#fff;--ok:#12805c;--err:#c0362c;--chip:#eef0ff}
@media (prefers-color-scheme:dark){:root{--bg:#111318;--card:#1a1d24;--text:#e8eaf0;--muted:#98a2b3;--line:#2b303b;--accent:#8b7dff;--accent-ink:#0e0e14;--ok:#4cc38a;--err:#ff7b6e;--chip:#272a3d}}
*{box-sizing:border-box}body{margin:0;font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text)}
header{display:flex;align-items:center;gap:16px;padding:12px 20px;border-bottom:1px solid var(--line);background:var(--card);position:sticky;top:0;z-index:5;flex-wrap:wrap}
header b{font-size:17px}nav{display:flex;gap:4px;flex:1;flex-wrap:wrap}nav a{padding:6px 12px;border-radius:8px;color:var(--muted);text-decoration:none;cursor:pointer}
nav a.on{background:var(--chip);color:var(--text);font-weight:600}main{max-width:1000px;margin:0 auto;padding:20px 16px 80px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.stat b{display:block;font-size:26px}.stat span{color:var(--muted);font-size:13px}
button,.btn{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--text);padding:7px 12px;border-radius:8px;cursor:pointer}
button:disabled{opacity:.45;cursor:not-allowed}button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:600}button.danger{color:var(--err)}button.small{padding:3px 8px;font-size:13px}
input,select,textarea{font:inherit;color:var(--text);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:7px 9px;width:100%}
textarea{min-height:70px;resize:vertical}label{display:block;font-size:13px;color:var(--muted);margin:10px 0 4px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.row>*{flex:1;min-width:140px}.row>.auto{flex:0 0 auto;min-width:0}
table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:9px 6px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;color:var(--muted);font-weight:600}
tr.click{cursor:pointer}tr.click:hover{background:var(--bg)}.muted{color:var(--muted)}.chip{display:inline-block;background:var(--chip);border-radius:20px;padding:1px 9px;font-size:12px;margin:2px 3px 2px 0}
.node{border:1px solid var(--line);border-radius:10px;padding:12px;margin:10px 0;background:var(--bg)}.node h4{margin:0;display:flex;gap:8px;align-items:center}
.pill{font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:2px 8px;border-radius:20px;background:var(--chip)}
.msgs{max-height:420px;overflow:auto;display:flex;flex-direction:column;gap:6px;padding:4px}.m{max-width:80%;padding:7px 11px;border-radius:12px;white-space:pre-wrap;word-break:break-word}
.m.in{background:var(--bg);border:1px solid var(--line);align-self:flex-start}.m.out{background:var(--accent);color:var(--accent-ink);align-self:flex-end}.m.error{background:transparent;color:var(--err);border:1px dashed var(--err);align-self:center;font-size:13px}
.m small{display:block;opacity:.7;font-size:11px}.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--text);color:var(--bg);padding:10px 16px;border-radius:10px;z-index:20}
code{background:var(--chip);padding:1px 6px;border-radius:6px;word-break:break-all}.switch{display:flex;gap:6px;align-items:center;font-size:14px;color:var(--text);margin:0}.switch input{width:auto}
`;

export function loginPage(noPassword: boolean, error: boolean): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AutoChat · Entrar</title><style>${STYLE}</style></head>
<body><main style="max-width:380px;padding-top:12vh"><div class="card"><h2 style="margin-top:0">AutoChat</h2>
${noPassword ? '<p style="color:var(--err)">Defina o segredo <code>ADMIN_PASSWORD</code> antes de entrar:<br><code>npx wrangler secret put ADMIN_PASSWORD</code></p>' : ''}
${error ? '<p style="color:var(--err)">Senha incorreta.</p>' : ''}
<form method="post" action="/login"><label>Senha</label><input type="password" name="password" autofocus required>
<p><button class="primary" style="width:100%">Entrar</button></p></form></div></main></body></html>`;
}

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function simplePage(title: string, body: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)}</title><style>${STYLE}</style></head>
<body><main style="max-width:720px"><div class="card">${body}</div></main></body></html>`;
}

export function messagePage(title: string, message: string, isError = false): string {
  return simplePage(
    title,
    `<h2 style="margin-top:0">${escHtml(title)}</h2><p${isError ? ' style="color:var(--err)"' : ''}>${escHtml(message)}</p><p><a href="/">← Voltar ao painel</a></p>`,
  );
}

export function privacyPage(origin: string): string {
  return simplePage(
    'Política de Privacidade',
    `<h2 style="margin-top:0">Política de Privacidade</h2>
<p>Este aplicativo é uma ferramenta de uso interno que responde automaticamente mensagens diretas e comentários enviados à conta profissional do próprio titular no Instagram e no WhatsApp.</p>
<h3>Dados tratados</h3>
<p>Identificador da conta (fornecido pela Meta), nome e nome de usuário públicos, o conteúdo das mensagens e comentários enviados à conta, e dados que a própria pessoa informar na conversa (como e-mail ou telefone).</p>
<h3>Finalidade</h3>
<p>Os dados são usados exclusivamente para responder às mensagens, organizar os contatos e dar continuidade ao atendimento. Não são vendidos, compartilhados com terceiros nem usados para publicidade.</p>
<h3>Armazenamento</h3>
<p>Os dados ficam armazenados em banco de dados privado na infraestrutura da Cloudflare, com acesso restrito ao titular da conta.</p>
<h3>Exclusão</h3>
<p>Para pedir a exclusão dos seus dados, siga as instruções em <a href="${escHtml(origin)}/exclusao-de-dados">${escHtml(origin)}/exclusao-de-dados</a>.</p>`,
  );
}

export function dataDeletionPage(): string {
  return simplePage(
    'Exclusão de dados',
    `<h2 style="margin-top:0">Exclusão de dados</h2>
<p>Para excluir os dados de uma conversa com esta conta, envie uma mensagem direta com o texto <b>"excluir meus dados"</b> ou peça pelo próprio canal de atendimento. A exclusão é feita em até 30 dias e inclui o histórico de mensagens, as tags e os dados informados na conversa.</p>`,
  );
}

export function appPage(): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AutoChat</title><style>${STYLE}</style></head>
<body><header><b>AutoChat</b><nav id="nav"></nav><a class="btn" href="/logout">Sair</a></header><main id="app"></main>
<script>${CLIENT_JS}</script></body></html>`;
}

const CLIENT_JS = String.raw`
const $ = (s, el=document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (t) => t ? new Date(t).toLocaleString('pt-BR', {dateStyle:'short', timeStyle:'short'}) : '—';
const app = $('#app');
function toast(msg){ const d=document.createElement('div'); d.className='toast'; d.textContent=msg; document.body.appendChild(d); setTimeout(()=>d.remove(), 3500); }
async function api(path, opts={}){
  const r = await fetch('/api'+path, {headers:{'Content-Type':'application/json'}, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined});
  if (r.status===401){ location.href='/login'; throw new Error('login'); }
  const j = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(j.error || ('Erro '+r.status));
  return j;
}

const PAGES = {painel:'Painel', automacoes:'Automações', contatos:'Contatos'};
function route(){
  const [page, arg] = (location.hash.slice(1) || 'painel').split('/');
  $('#nav').innerHTML = Object.entries(PAGES).map(([k,v]) => '<a href="#'+k+'" class="'+(k===page?'on':'')+'">'+v+'</a>').join('');
  app.innerHTML = '<p class="muted">Carregando…</p>';
  const fn = {painel: viewDashboard, automacoes: arg ? () => viewEditor(arg) : viewAutomations, contatos: arg ? () => viewContact(arg) : viewContacts}[page] || viewDashboard;
  fn().catch(e => { app.innerHTML = '<div class="card" style="color:var(--err)">'+esc(e.message)+'</div>'; });
}
addEventListener('hashchange', route);

// ---------------- Painel ----------------
async function viewDashboard(){
  const [s, ig] = await Promise.all([api('/stats'), api('/instagram')]);
  const hook = location.origin + '/webhook';
  const accs = ig.accounts || [];
  const igCard = '<div class="card"><h3 style="margin-top:0">Instagram</h3>'
    + (accs.length
      ? accs.map(c => '<div class="row" style="align-items:center"><div><p style="margin:4px 0">✅ <b>@'+esc(c.username||c.accountId)+'</b>'+(c.connectedAt ? ' <span class="muted">desde '+fmt(c.connectedAt)+'</span>' : '')+'</p>'
          + (c.subscribeWarning ? '<p style="color:var(--err);margin:4px 0">A conta conectou, mas a inscrição nos avisos da Meta falhou: '+esc(c.subscribeWarning)+'. Tente "Reconectar".</p>' : '')
          + '</div><button class="auto danger small" data-igoff="'+esc(c.accountId)+'" data-name="'+esc(c.username||c.accountId)+'">Desconectar</button></div>').join('')
        + '<p class="muted" style="font-size:13px">Para conectar outra conta (ex.: a da Ampliar), entre com um perfil do Facebook que administre a Página ligada a ela e marque <b>as duas contas</b> na tela da Meta.</p>'
        + '<div class="row"><a class="btn auto" href="/connect/instagram">Conectar outra conta / reconectar</a></div>'
      : ig.connected
      ? '<p>✅ Conectado pelo token antigo (IG_ACCESS_TOKEN).</p><div class="row"><a class="btn auto" href="/connect/instagram">Conectar pelo login da Meta</a></div>'
      : (ig.canConnect
        ? '<p class="muted">Clique abaixo, entre com a conta da empresa e selecione o Instagram. O AutoChat guarda o acesso sozinho.</p><a class="btn" href="/connect/instagram" style="display:inline-block;background:var(--accent);color:var(--accent-ink);border-color:var(--accent);font-weight:600">Conectar Instagram</a>'
        : '<p style="color:var(--err)">Faltam META_APP_ID e META_LOGIN_CONFIG_ID na configuração.</p>'))
    + (ig.hasAppSecret ? '' : '<p style="color:var(--err)">Falta o segredo <code>META_APP_SECRET</code> (Chave secreta do app). Sem ele os avisos da Meta são recusados.</p>')
    + '</div>';
  app.innerHTML = '<div class="grid">'
    + [['Contatos', s.contacts], ['Recebidas (24h)', s.in24h], ['Enviadas (24h)', s.out24h], ['Erros (24h)', s.errors24h]]
      .map(([l,v]) => '<div class="card stat"><b>'+v+'</b><span>'+l+'</span></div>').join('')
    + '</div>' + igCard + '<div class="card"><h3 style="margin-top:0">Webhook da Meta</h3>'
    + '<p>URL do webhook (Instagram e WhatsApp): <code>'+esc(hook)+'</code></p>'
    + '<p class="muted">Token de verificação: o valor do segredo <code>META_VERIFY_TOKEN</code>. '
    + 'No Instagram assine os campos <code>messages</code>, <code>messaging_postbacks</code> e <code>comments</code>; no WhatsApp, <code>messages</code>.</p>'
    + '<p class="muted">Política de privacidade (para publicar o app): <code>'+esc(location.origin)+'/privacidade</code><br>Exclusão de dados: <code>'+esc(location.origin)+'/exclusao-de-dados</code></p>'
    + (s.errors24h ? '<p style="color:var(--err)">Houve erros de envio nas últimas 24h — abra o contato em <a href="#contatos">Contatos</a> para ver o detalhe.</p>' : '')
    + '</div>';
  app.querySelectorAll('[data-igoff]').forEach(b => b.onclick = async () => {
    if (!confirm('Desconectar @'+b.dataset.name+'? As automações dessa conta param de responder.')) return;
    await api('/instagram?account='+encodeURIComponent(b.dataset.igoff), {method:'DELETE'}); route();
  });
}

// Contas conectadas (para o seletor do editor e a lista de automações)
let IGS = null;
async function igAccounts(){ if (!IGS) IGS = (await api('/instagram')).accounts || []; return IGS; }
const accName = (id) => { const c = (IGS||[]).find(x => x.accountId === id); return c ? '@'+(c.username||c.accountId) : (id ? 'conta '+id : 'todas as contas'); };

// ---------------- Automações ----------------
const TRIG = {comment:'Comentário → DM', keyword:'Palavra-chave na DM'};
const CH = {instagram:'Instagram', whatsapp:'WhatsApp'};
async function viewAutomations(){
  const [list] = await Promise.all([api('/automations'), igAccounts()]);
  app.innerHTML = '<div class="row" style="margin-bottom:12px"><h2 style="margin:0">Automações</h2>'
    + '<select class="auto" id="tpl"><option value="">+ Nova automação…</option><option value="comment">Comentário → DM com link</option>'
    + '<option value="lead">Captura de e-mail (com botões)</option><option value="wa">WhatsApp: menu com botões</option><option value="default">Resposta padrão</option><option value="blank">Em branco</option></select></div>'
    + (list.length ? '<div class="card"><table><tr><th>Nome</th><th>Canal / gatilho</th><th>Palavras</th><th>Disparos</th><th></th></tr>'
      + list.map(a => '<tr class="click" data-id="'+a.id+'"><td><b>'+esc(a.name)+'</b>'+(a.enabled?'':' <span class="pill">pausada</span>')+'</td>'
        + '<td>'+CH[a.channel]+' · '+TRIG[a.trigger]+(a.channel==='instagram' && (IGS||[]).length>1 ? '<br><span class="muted">'+esc(accName(a.accountId))+'</span>' : '')+'</td><td>'+(a.matchMode==='any'?'<i class="muted">qualquer mensagem</i>':a.keywords.map(k=>'<span class="chip">'+esc(k)+'</span>').join(''))+'</td>'
        + '<td>'+a.runs+'</td><td class="auto"><button class="small" data-toggle="'+a.id+'">'+(a.enabled?'Pausar':'Ativar')+'</button></td></tr>').join('')
      + '</table></div>' : '<div class="card muted">Nenhuma automação ainda. Comece por um modelo acima.</div>');
  $('#tpl').onchange = (e) => { if (e.target.value) location.hash = 'automacoes/novo-'+e.target.value; };
  app.querySelectorAll('tr.click').forEach(tr => tr.onclick = (e) => { if (!e.target.dataset.toggle) location.hash = 'automacoes/'+tr.dataset.id; });
  app.querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => {
    const a = list.find(x => x.id == b.dataset.toggle); a.enabled = !a.enabled;
    try { await api('/automations/'+a.id, {method:'PUT', body:a}); route(); } catch(e){ toast(e.message); }
  });
}

const TEMPLATES = {
  comment: () => ({name:'Comentário → link', channel:'instagram', trigger:'comment', matchMode:'contains', keywords:['quero'], publicReplies:['Te mandei no direct! 📩','Olha sua DM 😉'], oncePerContact:false, enabled:true,
    flow:{start:'marcar', nodes:[
      {id:'marcar', type:'tag', add:['recebeu-link'], next:'inicio'},
      {id:'inicio', type:'message', text:'Oi {{first_name}}! Que bom que você se interessou 😊 Toca no botão pra abrir:', buttons:[{title:'Quero o link', url:'https://seusite.com.br'}]}]}}),
  lead: () => ({name:'Captura de e-mail', channel:'instagram', trigger:'keyword', matchMode:'contains', keywords:['ebook'], publicReplies:[], oncePerContact:false, enabled:true,
    flow:{start:'inicio', nodes:[
      {id:'inicio', type:'message', text:'Oi {{first_name}}! Quer receber o e-book grátis?', buttons:[{title:'Sim, quero!', next:'email'},{title:'Agora não', next:'tchau'}]},
      {id:'email', type:'question', text:'Perfeito! Qual é o seu melhor e-mail?', saveTo:'email', validate:'email', retryText:'Esse e-mail parece inválido. Pode digitar de novo?', next:'tag'},
      {id:'tag', type:'tag', add:['lead'], next:'fim'},
      {id:'fim', type:'message', text:'Obrigado! Enviei o e-book para {{email}} 📚'},
      {id:'tchau', type:'message', text:'Tudo bem! Se mudar de ideia é só mandar "ebook".'}]}}),
  wa: () => ({name:'Menu WhatsApp', channel:'whatsapp', trigger:'keyword', matchMode:'contains', keywords:['oi','olá','menu'], publicReplies:[], oncePerContact:false, enabled:true,
    flow:{start:'menu', nodes:[
      {id:'menu', type:'message', text:'Olá {{first_name}}! Como posso ajudar?', buttons:[{title:'Preços', next:'precos'},{title:'Horários', next:'horarios'},{title:'Falar com humano', next:'humano'}]},
      {id:'precos', type:'message', text:'Nossa tabela de preços: https://seusite.com.br/precos'},
      {id:'horarios', type:'message', text:'Atendemos de segunda a sexta, das 9h às 18h.'},
      {id:'humano', type:'tag', add:['quer-atendimento'], next:'aguarde'},
      {id:'aguarde', type:'message', text:'Certo! Em breve alguém da equipe te responde por aqui.'}]}}),
  default: () => ({name:'Resposta padrão', channel:'instagram', trigger:'keyword', matchMode:'any', keywords:[], publicReplies:[], oncePerContact:true, enabled:true,
    flow:{start:'oi', nodes:[{id:'oi', type:'message', text:'Oi! Recebi sua mensagem e já te respondo 🙂'}]}}),
  blank: () => ({name:'', channel:'instagram', trigger:'keyword', matchMode:'contains', keywords:[], publicReplies:[], oncePerContact:false, enabled:true,
    flow:{start:'inicio', nodes:[{id:'inicio', type:'message', text:''}]}}),
};

let A = null; // automação em edição
async function viewEditor(arg){
  await igAccounts();
  if (arg.startsWith('novo-')) {
    A = TEMPLATES[arg.slice(5)]?.() || TEMPLATES.blank();
    // Nova automação do Instagram começa na primeira conta conectada
    if (A.channel === 'instagram' && IGS.length) A.accountId = IGS[0].accountId;
  } else A = await api('/automations/'+arg);
  renderEditor();
}

function nextSelect(value, attrs){
  return '<select '+attrs+'><option value="">— fim —</option>'+A.flow.nodes.map(n => '<option value="'+esc(n.id)+'"'+(n.id===value?' selected':'')+'>'+esc(n.id)+'</option>').join('')+'</select>';
}

function renderEditor(){
  const a = A, isNew = !a.id;
  app.innerHTML = '<p><a href="#automacoes">← Automações</a></p><div class="card">'
    + '<div class="row"><div><label>Nome</label><input id="f-name" value="'+esc(a.name)+'"></div>'
    + '<div class="auto"><label>&nbsp;</label><label class="switch"><input type="checkbox" id="f-enabled"'+(a.enabled?' checked':'')+'> Ativa</label></div></div>'
    + '<div class="row"><div><label>Canal</label><select id="f-channel"><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option></select></div>'
    + '<div><label>Gatilho</label><select id="f-trigger"><option value="keyword">Palavra-chave na DM</option>'+(a.channel==='instagram'?'<option value="comment">Comentário em post/reels</option>':'')+'</select></div>'
    + '<div><label>Disparar quando</label><select id="f-match"><option value="contains">contém a palavra</option><option value="exact">é exatamente a palavra</option><option value="any">qualquer mensagem</option></select></div></div>'
    + (a.channel==='instagram' && (IGS||[]).length ? '<label>Conta do Instagram</label><select id="f-account">'
      + IGS.map(c => '<option value="'+esc(c.accountId)+'"'+(c.accountId===a.accountId?' selected':'')+'>@'+esc(c.username||c.accountId)+'</option>').join('')
      + '<option value=""'+(a.accountId?'':' selected')+'>Todas as contas</option></select>' : '')
    + (a.matchMode!=='any' ? '<label>Palavras-chave (separadas por vírgula)</label><input id="f-keywords" value="'+esc(a.keywords.join(', '))+'">' : '')
    + (a.trigger==='comment' ? '<label>ID do post (opcional — vazio = qualquer post)</label><input id="f-media" value="'+esc(a.mediaId||'')+'">'
      + '<label>Respostas públicas no comentário (uma por linha, sorteada; vazio = não responde)</label><textarea id="f-public">'+esc(a.publicReplies.join('\n'))+'</textarea>' : '')
    + '<label class="switch" style="margin-top:12px"><input type="checkbox" id="f-once"'+(a.oncePerContact?' checked':'')+'> Disparar só uma vez por contato</label>'
    + '</div><div class="card"><div class="row"><h3 style="margin:0">Fluxo</h3><div class="auto"><label style="margin:0">Começa em</label></div>'
    + '<div>'+nextSelect(a.flow.start, 'id="f-start"').replace('<option value="">— fim —</option>','')+'</div></div>'
    + (a.trigger==='comment' ? '<p class="muted" style="font-size:13px">No Instagram a resposta a um comentário só pode ter <b>uma</b> mensagem. Coloque botões no primeiro passo para o fluxo continuar quando a pessoa clicar.</p>' : '')
    + '<p class="muted" style="font-size:13px">Variáveis: <code>{{first_name}}</code> <code>{{name}}</code> <code>{{username}}</code> <code>{{email}}</code> <code>{{phone}}</code> e qualquer campo salvo por uma pergunta.</p>'
    + '<div id="nodes">'+a.flow.nodes.map(renderNode).join('')+'</div>'
    + '<div class="row"><button class="auto" data-add="message">+ Mensagem</button><button class="auto" data-add="question">+ Pergunta</button><button class="auto" data-add="tag">+ Tag</button></div></div>'
    + '<div class="row"><button class="primary auto" id="save">Salvar</button>'+(isNew?'':'<button class="danger auto" id="del">Excluir</button>')+'</div>';

  $('#f-channel').value = a.channel; $('#f-trigger').value = a.trigger; $('#f-match').value = a.matchMode;
  const bind = (id, fn) => { const el = $(id); if (el) el.oninput = el.onchange = fn; };
  bind('#f-name', e => a.name = e.target.value);
  bind('#f-enabled', e => a.enabled = e.target.checked);
  bind('#f-once', e => a.oncePerContact = e.target.checked);
  bind('#f-keywords', e => a.keywords = e.target.value.split(',').map(s=>s.trim()).filter(Boolean));
  bind('#f-media', e => a.mediaId = e.target.value.trim() || null);
  bind('#f-account', e => a.accountId = e.target.value || null);
  bind('#f-public', e => a.publicReplies = e.target.value.split('\n').map(s=>s.trim()).filter(Boolean));
  bind('#f-start', e => a.flow.start = e.target.value);
  $('#f-channel').onchange = e => { a.channel = e.target.value; if (a.channel==='whatsapp') a.trigger='keyword'; renderEditor(); };
  $('#f-trigger').onchange = e => { a.trigger = e.target.value; renderEditor(); };
  $('#f-match').onchange = e => { a.matchMode = e.target.value; renderEditor(); };
  app.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
    const t = b.dataset.add; let i = a.flow.nodes.length + 1; while (a.flow.nodes.some(n => n.id === t+i)) i++;
    const n = {id: t+i, type:t};
    if (t==='message') n.text=''; if (t==='question'){ n.text=''; n.saveTo='resposta'; n.validate='none'; } if (t==='tag'){ n.add=[]; n.remove=[]; }
    a.flow.nodes.push(n); renderEditor();
  });
  bindNodes();
  $('#save').onclick = save;
  if ($('#del')) $('#del').onclick = async () => { if (!confirm('Excluir esta automação?')) return; await api('/automations/'+a.id, {method:'DELETE'}); location.hash='automacoes'; };
}

function renderNode(n, i){
  const maxBtn = A.channel==='whatsapp' ? 10 : 13;
  let body = '';
  if (n.type==='message' || n.type==='question') body += '<label>'+(n.type==='question'?'Pergunta':'Texto')+'</label><textarea data-k="text">'+esc(n.text)+'</textarea>';
  if (n.type==='message'){
    body += '<label>Botões (até 3 aparecem como botões; mais que isso vira lista/respostas rápidas, máx. '+maxBtn+')</label>'
      + (n.buttons||[]).map((b,j) => '<div class="row" style="margin-bottom:6px"><input data-btn="'+j+'" data-bk="title" maxlength="20" placeholder="Título (até 20 letras)" value="'+esc(b.title)+'">'
        + '<div>'+(b.url ? '<span class="muted" style="font-size:13px">abre o link →</span>' : nextSelect(b.next, 'data-btn="'+j+'" data-bk="next"'))+'</div>'
        + '<input data-btn="'+j+'" data-bk="url" data-rerender placeholder="ou abrir link: https://…" value="'+esc(b.url||'')+'">'
        + '<button class="small auto" data-rmbtn="'+j+'">✕</button></div>').join('')
      + '<p class="muted" style="font-size:12px;margin:2px 0 8px">Botão com link abre o site direto. Botão sem link leva para outro passo do fluxo.</p>'
      + ((n.buttons||[]).length < maxBtn ? '<button class="small" data-addbtn>+ botão</button>' : '');
  }
  if (n.type==='question'){
    body += '<div class="row"><div><label>Salvar resposta em</label><input data-k="saveTo" value="'+esc(n.saveTo)+'" placeholder="email, phone, name ou outro"></div>'
      + '<div><label>Validar</label><select data-k="validate"><option value="none">nada</option><option value="email"'+(n.validate==='email'?' selected':'')+'>e-mail</option><option value="phone"'+(n.validate==='phone'?' selected':'')+'>telefone</option></select></div></div>'
      + '<label>Mensagem se a resposta for inválida</label><input data-k="retryText" value="'+esc(n.retryText||'')+'">';
  }
  if (n.type==='tag'){
    body += '<div class="row"><div><label>Adicionar tags (vírgula)</label><input data-k="add" value="'+esc((n.add||[]).join(', '))+'"></div>'
      + '<div><label>Remover tags (vírgula)</label><input data-k="remove" value="'+esc((n.remove||[]).join(', '))+'"></div></div>';
  }
  const showNext = !(n.type==='message' && (n.buttons||[]).some(b => !b.url));
  if (showNext) body += '<label>Depois, ir para</label>'+nextSelect(n.next, 'data-k="next"');
  const label = {message:'mensagem', question:'pergunta', tag:'tag'}[n.type];
  return '<div class="node" data-i="'+i+'"><h4><span class="pill">'+label+'</span><input data-k="id" value="'+esc(n.id)+'" style="max-width:200px" title="Identificador do passo">'
    + '<span style="flex:1"></span>'+(i>0?'<button class="small" data-up>↑</button>':'')+'<button class="small danger" data-rm>Remover</button></h4>'+body+'</div>';
}

function bindNodes(){
  app.querySelectorAll('.node').forEach(el => {
    const n = A.flow.nodes[+el.dataset.i];
    el.querySelectorAll('[data-k]').forEach(inp => {
      const k = inp.dataset.k;
      inp.oninput = inp.onchange = (e) => {
        let v = inp.value;
        if (k==='add' || k==='remove') v = v.split(',').map(s=>s.trim()).filter(Boolean);
        if (k==='next') v = v || undefined;
        if (k==='id'){
          if (e.type !== 'change') return;
          const old = n.id; v = v.trim().replace(/\s+/g,'-');
          A.flow.nodes.forEach(x => { if (x.next===old) x.next=v; (x.buttons||[]).forEach(b => { if (b.next===old) b.next=v; }); });
          if (A.flow.start===old) A.flow.start=v;
          n.id = v; renderEditor(); return;
        }
        n[k] = v;
      };
    });
    el.querySelectorAll('[data-btn]').forEach(inp => inp.oninput = inp.onchange = (e) => {
      const b = n.buttons[+inp.dataset.btn];
      b[inp.dataset.bk] = inp.value.trim() || undefined;
      if (inp.dataset.bk === 'url' && b.url) delete b.next;
      if (inp.dataset.rerender !== undefined && e.type === 'change') renderEditor();
    });
    el.querySelectorAll('[data-rmbtn]').forEach(b => b.onclick = () => { n.buttons.splice(+b.dataset.rmbtn,1); renderEditor(); });
    const add = el.querySelector('[data-addbtn]'); if (add) add.onclick = () => { (n.buttons ||= []).push({title:''}); renderEditor(); };
    el.querySelector('[data-rm]').onclick = () => {
      A.flow.nodes.splice(+el.dataset.i, 1);
      A.flow.nodes.forEach(x => { if (x.next===n.id) delete x.next; (x.buttons||[]).forEach(b => { if (b.next===n.id) delete b.next; }); });
      if (A.flow.start===n.id) A.flow.start = A.flow.nodes[0]?.id || '';
      renderEditor();
    };
    const up = el.querySelector('[data-up]'); if (up) up.onclick = () => { const i=+el.dataset.i; [A.flow.nodes[i-1], A.flow.nodes[i]] = [A.flow.nodes[i], A.flow.nodes[i-1]]; renderEditor(); };
  });
}

async function save(){
  try {
    if (A.id) await api('/automations/'+A.id, {method:'PUT', body:A});
    else { const r = await api('/automations', {method:'POST', body:A}); A.id = r.id; history.replaceState(null,'','#automacoes/'+r.id); }
    toast('Salvo ✔'); renderEditor();
  } catch(e){ toast(e.message); }
}

// ---------------- Contatos ----------------
let CQ = {q:'', tag:'', channel:''};
async function viewContacts(){
  const qs = new URLSearchParams(Object.entries(CQ).filter(([,v])=>v));
  const [list, tags] = await Promise.all([api('/contacts?'+qs), api('/tags')]);
  app.innerHTML = '<h2>Contatos</h2><div class="card row"><input id="q" placeholder="Buscar nome, @, e-mail, telefone" value="'+esc(CQ.q)+'">'
    + '<select id="tag"><option value="">Todas as tags</option>'+tags.map(t => '<option'+(t.tag===CQ.tag?' selected':'')+' value="'+esc(t.tag)+'">'+esc(t.tag)+' ('+t.n+')</option>').join('')+'</select>'
    + '<select id="ch"><option value="">Todos os canais</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option></select>'
    + '<button class="auto" id="csv">Exportar CSV</button></div>'
    + '<div class="card">'+(list.length ? '<table><tr><th>Contato</th><th>Canal</th><th>E-mail / telefone</th><th>Tags</th><th>Última msg</th></tr>'
      + list.map(c => '<tr class="click" data-id="'+c.id+'"><td><b>'+esc(c.name||c.username||c.externalId)+'</b>'+(c.username?'<br><span class="muted">@'+esc(c.username)+'</span>':'')+'</td>'
        + '<td>'+CH[c.channel]+'</td><td>'+esc(c.email||'')+(c.email&&c.phone?'<br>':'')+esc(c.phone||'')+'</td>'
        + '<td>'+c.tags.map(t=>'<span class="chip">'+esc(t)+'</span>').join('')+'</td><td class="muted">'+fmt(c.lastInboundAt)+'</td></tr>').join('')+'</table>'
      : '<p class="muted">Nenhum contato encontrado.</p>')+'</div>';
  $('#ch').value = CQ.channel;
  let t; $('#q').oninput = e => { clearTimeout(t); t = setTimeout(() => { CQ.q = e.target.value; viewContacts().then(()=>{ const q=$('#q'); q.focus(); q.setSelectionRange(q.value.length,q.value.length); }); }, 300); };
  $('#tag').onchange = e => { CQ.tag = e.target.value; viewContacts(); };
  $('#ch').onchange = e => { CQ.channel = e.target.value; viewContacts(); };
  app.querySelectorAll('tr.click').forEach(tr => tr.onclick = () => location.hash = 'contatos/'+tr.dataset.id);
  $('#csv').onclick = () => {
    const cols = ['id','channel','username','name','email','phone','tags'];
    const cell = v => '"'+String(v ?? '').replace(/"/g,'""')+'"';
    const csv = [cols.join(',')].concat(list.map(c => cols.map(k => cell(k==='tags' ? c.tags.join(';') : c[k])).join(','))).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'})); a.download = 'contatos.csv'; a.click();
  };
}

async function viewContact(id){
  const c = await api('/contacts/'+id);
  const open = c.lastInboundAt && Date.now() - c.lastInboundAt < 864e5;
  const fields = Object.entries(c.fields||{});
  app.innerHTML = '<p><a href="#contatos">← Contatos</a></p><div class="card"><h2 style="margin:0">'+esc(c.name||c.username||c.externalId)+'</h2>'
    + '<p class="muted">'+CH[c.channel]+(c.username?' · @'+esc(c.username):'')+' · desde '+fmt(c.createdAt)+'</p>'
    + '<p>'+(c.email?'✉️ '+esc(c.email)+'  ':'')+(c.phone?'📞 '+esc(c.phone):'')+'</p>'
    + (fields.length ? '<p>'+fields.map(([k,v]) => '<span class="chip">'+esc(k)+': '+esc(v)+'</span>').join('')+'</p>' : '')
    + '<p><button class="small danger" id="delc">Excluir contato e histórico</button></p>'
    + '<label>Tags</label><div>'+c.tags.map(t => '<span class="chip">'+esc(t)+' <a href="#" data-rmtag="'+esc(t)+'" style="color:inherit">✕</a></span>').join('')
    + '</div><div class="row" style="margin-top:8px"><input id="newtag" placeholder="nova tag"><button class="auto" id="addtag">Adicionar</button></div></div>'
    + '<div class="card"><h3 style="margin-top:0">Conversa</h3><div class="msgs" id="msgs">'
    + c.messages.map(m => '<div class="m '+m.direction+'">'+esc(m.text)+(m.meta&&m.meta.buttons?'<br>'+m.meta.buttons.map(b=>'<span class="chip">'+esc(b)+'</span>').join(''):'')
      +(m.meta&&m.meta.type==='comment'?'<small>💬 comentário</small>':'')+'<small>'+fmt(m.createdAt)+'</small></div>').join('')
    + '</div><div class="row" style="margin-top:10px"><input id="txt" placeholder="'+(open?'Responder manualmente…':'Fora da janela de 24h da Meta')+'"'+(open?'':' disabled')+'><button class="primary auto" id="send"'+(open?'':' disabled')+'>Enviar</button></div></div>';
  const box = $('#msgs'); box.scrollTop = box.scrollHeight;
  const tags = async (body) => { try { await api('/contacts/'+id+'/tags', {method:'POST', body}); viewContact(id); } catch(e){ toast(e.message); } };
  $('#delc').onclick = async () => { if (!confirm('Excluir este contato e todo o histórico? Não dá para desfazer.')) return; await api('/contacts/'+id, {method:'DELETE'}); location.hash='contatos'; };
  $('#addtag').onclick = () => { const v = $('#newtag').value.trim(); if (v) tags({add:[v]}); };
  app.querySelectorAll('[data-rmtag]').forEach(a => a.onclick = (e) => { e.preventDefault(); tags({remove:[a.dataset.rmtag]}); });
  $('#send').onclick = async () => {
    const text = $('#txt').value.trim(); if (!text) return;
    try { await api('/contacts/'+id+'/send', {method:'POST', body:{text}}); viewContact(id); } catch(e){ toast(e.message); }
  };
}

route();
`;
