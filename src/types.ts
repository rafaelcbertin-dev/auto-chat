export type Channel = 'instagram' | 'whatsapp';

/** Botão de um passo "message". `next` é o id do passo seguinte quando clicado. */
export interface FlowButton {
  title: string;
  /** Passo seguinte quando clicado (precisa do aviso de clique da Meta) */
  next?: string;
  /** Link aberto direto pelo botão (não depende de aviso da Meta) */
  url?: string;
}

export interface MessageNode {
  id: string;
  type: 'message';
  text: string;
  buttons?: FlowButton[];
  next?: string;
}

export interface QuestionNode {
  id: string;
  type: 'question';
  text: string;
  /** "email", "phone", "name" ou qualquer outro nome de campo personalizado */
  saveTo: string;
  validate?: 'none' | 'email' | 'phone';
  retryText?: string;
  next?: string;
}

export interface TagNode {
  id: string;
  type: 'tag';
  add?: string[];
  remove?: string[];
  next?: string;
}

export type FlowNode = MessageNode | QuestionNode | TagNode;

export interface Flow {
  start: string;
  nodes: FlowNode[];
}

/** comment = comentário em post/reels (só Instagram); keyword = mensagem direta */
export type TriggerType = 'comment' | 'keyword';
/** any = responde qualquer mensagem (resposta padrão) */
export type MatchMode = 'contains' | 'exact' | 'any';

export interface Automation {
  id: number;
  name: string;
  enabled: boolean;
  channel: Channel;
  trigger: TriggerType;
  keywords: string[];
  matchMode: MatchMode;
  /** Restringe o gatilho de comentário a um post específico (null = qualquer post) */
  mediaId: string | null;
  /** Respostas públicas ao comentário; uma é sorteada */
  publicReplies: string[];
  oncePerContact: boolean;
  flow: Flow;
  /** Conta do Instagram (ID da conta profissional) em que a automação vale; null/ausente = todas */
  accountId?: string | null;
}

export interface Contact {
  id: number;
  channel: Channel;
  externalId: string;
  username: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  fields: Record<string, string>;
  tags: string[];
  /** Última conta do Instagram com que a pessoa falou (as respostas manuais saem por ela) */
  accountId?: string | null;
}

export interface CommentEvent {
  kind: 'comment';
  channel: 'instagram';
  eventId: string;
  commentId: string;
  mediaId: string | null;
  text: string;
  from: { id: string; username?: string };
  /** Conta do Instagram que recebeu o comentário (entry.id do webhook) */
  accountId?: string;
}

export interface MessageEvent {
  kind: 'message';
  channel: Channel;
  eventId: string;
  text: string;
  /** Payload de botão/resposta rápida, quando o usuário clicou em um */
  payload?: string;
  from: { id: string; username?: string; name?: string };
  /** Conta do Instagram que recebeu a mensagem (entry.id do webhook) */
  accountId?: string;
}

export type InboundEvent = CommentEvent | MessageEvent;

export interface OutButton {
  title: string;
  /** Botão de resposta (postback) */
  payload?: string;
  /** Botão que abre um link */
  url?: string;
}

export interface OutMessage {
  text: string;
  buttons?: OutButton[];
}

/** Destino: um usuário, ou (Instagram) um comentário para "resposta privada" */
export type Recipient = { userId: string } | { commentId: string };

export interface Sender {
  send(channel: Channel, to: Recipient, msg: OutMessage): Promise<void>;
  replyToComment(commentId: string, text: string): Promise<void>;
  fetchInstagramProfile?(userId: string): Promise<{ username?: string; name?: string } | null>;
}

export interface SessionState {
  automationId: number;
  nodeId: string;
}

export interface Store {
  /** Retorna true se o evento ainda não foi processado (e marca como processado). */
  claimEvent(eventId: string): Promise<boolean>;
  upsertContact(
    channel: Channel,
    externalId: string,
    info: { username?: string; name?: string; phone?: string; accountId?: string },
  ): Promise<Contact & { isNew: boolean }>;
  touchInbound(contactId: number): Promise<void>;
  updateContact(contactId: number, patch: { email?: string; phone?: string; name?: string; fields?: Record<string, string> }): Promise<void>;
  addTags(contactId: number, tags: string[]): Promise<void>;
  removeTags(contactId: number, tags: string[]): Promise<void>;
  logMessage(contactId: number, direction: 'in' | 'out' | 'error', text: string, meta?: unknown): Promise<void>;
  listAutomations(channel: Channel, trigger: TriggerType): Promise<Automation[]>;
  getAutomation(id: number): Promise<Automation | null>;
  getSession(contactId: number): Promise<SessionState | null>;
  setSession(contactId: number, state: SessionState): Promise<void>;
  clearSession(contactId: number): Promise<void>;
  hasRun(automationId: number, contactId: number): Promise<boolean>;
  recordRun(automationId: number, contactId: number): Promise<void>;
}
