import type { Automation, Channel, Contact, SessionState, Store, TriggerType } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const now = () => Date.now();

function parseJSON<T>(s: unknown, fallback: T): T {
  if (typeof s !== 'string') return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function rowToAutomation(r: any): Automation {
  return {
    id: r.id,
    name: r.name,
    enabled: !!r.enabled,
    channel: r.channel,
    trigger: r.trigger_type,
    keywords: parseJSON(r.keywords, []),
    matchMode: r.match_mode,
    mediaId: r.media_id || null,
    publicReplies: parseJSON(r.public_replies, []),
    oncePerContact: !!r.once_per_contact,
    flow: parseJSON(r.flow, { start: '', nodes: [] }),
  };
}

function rowToContact(r: any, tags: string[]): Contact {
  return {
    id: r.id,
    channel: r.channel,
    externalId: r.external_id,
    username: r.username,
    name: r.name,
    phone: r.phone,
    email: r.email,
    fields: parseJSON(r.fields, {}),
    tags,
  };
}

export class D1Store implements Store {
  constructor(private db: D1Database) {}

  async claimEvent(eventId: string): Promise<boolean> {
    const r = await this.db
      .prepare('INSERT OR IGNORE INTO processed_events (id, created_at) VALUES (?, ?)')
      .bind(eventId, now())
      .run();
    return (r.meta.changes ?? 0) > 0;
  }

  async upsertContact(channel: Channel, externalId: string, info: { username?: string; name?: string; phone?: string }) {
    const existing = await this.db.prepare('SELECT * FROM contacts WHERE channel = ? AND external_id = ?').bind(channel, externalId).first<any>();
    if (existing) {
      const username = info.username ?? existing.username;
      const name = existing.name ?? info.name ?? null;
      const phone = existing.phone ?? info.phone ?? null;
      if (username !== existing.username || name !== existing.name || phone !== existing.phone) {
        await this.db.prepare('UPDATE contacts SET username = ?, name = ?, phone = ? WHERE id = ?').bind(username, name, phone, existing.id).run();
      }
      return { ...rowToContact({ ...existing, username, name, phone }, await this.tags(existing.id)), isNew: false };
    }
    const row = await this.db
      .prepare(
        `INSERT INTO contacts (channel, external_id, username, name, phone, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(channel, external_id) DO UPDATE SET username = COALESCE(excluded.username, contacts.username)
         RETURNING *`,
      )
      .bind(channel, externalId, info.username ?? null, info.name ?? null, info.phone ?? null, now())
      .first<any>();
    return { ...rowToContact(row, []), isNew: true };
  }

  private async tags(contactId: number): Promise<string[]> {
    const r = await this.db.prepare('SELECT tag FROM contact_tags WHERE contact_id = ? ORDER BY tag').bind(contactId).all<{ tag: string }>();
    return r.results.map((x) => x.tag);
  }

  async touchInbound(contactId: number) {
    await this.db.prepare('UPDATE contacts SET last_inbound_at = ? WHERE id = ?').bind(now(), contactId).run();
  }

  async updateContact(contactId: number, patch: { email?: string; phone?: string; name?: string; fields?: Record<string, string> }) {
    const stmts: D1PreparedStatement[] = [];
    for (const col of ['email', 'phone', 'name'] as const) {
      if (patch[col] !== undefined) stmts.push(this.db.prepare(`UPDATE contacts SET ${col} = ? WHERE id = ?`).bind(patch[col], contactId));
    }
    if (patch.fields) {
      for (const [k, v] of Object.entries(patch.fields)) {
        stmts.push(this.db.prepare('UPDATE contacts SET fields = json_set(fields, ?, ?) WHERE id = ?').bind(`$."${k.replace(/"/g, '')}"`, v, contactId));
      }
    }
    if (stmts.length) await this.db.batch(stmts);
  }

  async addTags(contactId: number, tags: string[]) {
    const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
    if (!clean.length) return;
    await this.db.batch(
      clean.map((t) => this.db.prepare('INSERT OR IGNORE INTO contact_tags (contact_id, tag, created_at) VALUES (?, ?, ?)').bind(contactId, t, now())),
    );
  }

  async removeTags(contactId: number, tags: string[]) {
    if (!tags.length) return;
    await this.db.batch(tags.map((t) => this.db.prepare('DELETE FROM contact_tags WHERE contact_id = ? AND tag = ?').bind(contactId, t.trim())));
  }

  async logMessage(contactId: number, direction: 'in' | 'out' | 'error', text: string, meta?: unknown) {
    await this.db
      .prepare('INSERT INTO messages (contact_id, direction, text, meta, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(contactId, direction, text, meta === undefined ? null : JSON.stringify(meta), now())
      .run();
  }

  async listAutomations(channel: Channel, trigger: TriggerType): Promise<Automation[]> {
    const r = await this.db
      .prepare('SELECT * FROM automations WHERE enabled = 1 AND channel = ? AND trigger_type = ? ORDER BY id')
      .bind(channel, trigger)
      .all();
    return r.results.map(rowToAutomation);
  }

  async getAutomation(id: number): Promise<Automation | null> {
    const r = await this.db.prepare('SELECT * FROM automations WHERE id = ?').bind(id).first();
    return r ? rowToAutomation(r) : null;
  }

  async getSession(contactId: number): Promise<SessionState | null> {
    const r = await this.db.prepare('SELECT * FROM sessions WHERE contact_id = ?').bind(contactId).first<any>();
    if (!r) return null;
    if (now() - r.updated_at > SESSION_TTL_MS) {
      await this.clearSession(contactId);
      return null;
    }
    return { automationId: r.automation_id, nodeId: r.node_id };
  }

  async setSession(contactId: number, s: SessionState) {
    await this.db
      .prepare(
        `INSERT INTO sessions (contact_id, automation_id, node_id, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(contact_id) DO UPDATE SET automation_id = excluded.automation_id, node_id = excluded.node_id, updated_at = excluded.updated_at`,
      )
      .bind(contactId, s.automationId, s.nodeId, now())
      .run();
  }

  async clearSession(contactId: number) {
    await this.db.prepare('DELETE FROM sessions WHERE contact_id = ?').bind(contactId).run();
  }

  async hasRun(automationId: number, contactId: number) {
    const r = await this.db.prepare('SELECT 1 FROM runs WHERE automation_id = ? AND contact_id = ? LIMIT 1').bind(automationId, contactId).first();
    return !!r;
  }

  async recordRun(automationId: number, contactId: number) {
    await this.db.prepare('INSERT INTO runs (automation_id, contact_id, created_at) VALUES (?, ?, ?)').bind(automationId, contactId, now()).run();
  }

  // ---------- consultas do painel ----------

  async allAutomations() {
    const r = await this.db.prepare('SELECT * FROM automations ORDER BY id DESC').all();
    const counts = await this.db.prepare('SELECT automation_id, COUNT(*) AS n FROM runs GROUP BY automation_id').all<{ automation_id: number; n: number }>();
    const m = new Map(counts.results.map((c) => [c.automation_id, c.n]));
    return r.results.map((row) => ({ ...rowToAutomation(row), runs: m.get((row as any).id) ?? 0 }));
  }

  async saveAutomation(a: Omit<Automation, 'id'> & { id?: number }) {
    const vals = [
      a.name,
      a.enabled ? 1 : 0,
      a.channel,
      a.trigger,
      JSON.stringify(a.keywords),
      a.matchMode,
      a.mediaId || null,
      JSON.stringify(a.publicReplies),
      a.oncePerContact ? 1 : 0,
      JSON.stringify(a.flow),
      now(),
    ];
    if (a.id) {
      await this.db
        .prepare(
          `UPDATE automations SET name=?, enabled=?, channel=?, trigger_type=?, keywords=?, match_mode=?, media_id=?,
           public_replies=?, once_per_contact=?, flow=?, updated_at=? WHERE id=?`,
        )
        .bind(...vals, a.id)
        .run();
      return a.id;
    }
    const r = await this.db
      .prepare(
        `INSERT INTO automations (name, enabled, channel, trigger_type, keywords, match_mode, media_id, public_replies,
         once_per_contact, flow, updated_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      )
      .bind(...vals, now())
      .first<{ id: number }>();
    return r!.id;
  }

  async deleteAutomation(id: number) {
    await this.db.batch([
      this.db.prepare('DELETE FROM automations WHERE id = ?').bind(id),
      this.db.prepare('DELETE FROM sessions WHERE automation_id = ?').bind(id),
      this.db.prepare('DELETE FROM runs WHERE automation_id = ?').bind(id),
    ]);
  }

  async listContacts(opts: { q?: string; tag?: string; channel?: string; limit?: number; offset?: number }) {
    const where: string[] = [];
    const args: unknown[] = [];
    if (opts.q) {
      where.push('(c.username LIKE ? OR c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)');
      const like = `%${opts.q}%`;
      args.push(like, like, like, like);
    }
    if (opts.tag) {
      where.push('EXISTS (SELECT 1 FROM contact_tags t WHERE t.contact_id = c.id AND t.tag = ?)');
      args.push(opts.tag);
    }
    if (opts.channel) {
      where.push('c.channel = ?');
      args.push(opts.channel);
    }
    const sql = `SELECT c.*, (SELECT group_concat(tag, '\u001f') FROM contact_tags t WHERE t.contact_id = c.id) AS tag_list
      FROM contacts c ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY COALESCE(c.last_inbound_at, c.created_at) DESC LIMIT ? OFFSET ?`;
    const r = await this.db
      .prepare(sql)
      .bind(...args, Math.min(opts.limit ?? 50, 200), opts.offset ?? 0)
      .all<any>();
    return r.results.map((row) => ({
      ...rowToContact(row, row.tag_list ? String(row.tag_list).split('\u001f').sort() : []),
      createdAt: row.created_at,
      lastInboundAt: row.last_inbound_at,
    }));
  }

  async getContact(id: number) {
    const row = await this.db.prepare('SELECT * FROM contacts WHERE id = ?').bind(id).first<any>();
    if (!row) return null;
    const msgs = await this.db
      .prepare('SELECT direction, text, meta, created_at FROM messages WHERE contact_id = ? ORDER BY created_at DESC, id DESC LIMIT 200')
      .bind(id)
      .all<any>();
    return {
      ...rowToContact(row, await this.tags(id)),
      createdAt: row.created_at,
      lastInboundAt: row.last_inbound_at,
      messages: msgs.results.reverse().map((m) => ({ direction: m.direction, text: m.text, meta: parseJSON(m.meta, null), createdAt: m.created_at })),
    };
  }

  async allTags() {
    const r = await this.db.prepare('SELECT tag, COUNT(*) AS n FROM contact_tags GROUP BY tag ORDER BY tag').all<{ tag: string; n: number }>();
    return r.results;
  }

  async stats() {
    const day = now() - 24 * 60 * 60 * 1000;
    const [contacts, msgsIn, msgsOut, errors] = await this.db.batch<{ n: number }>([
      this.db.prepare('SELECT COUNT(*) AS n FROM contacts'),
      this.db.prepare("SELECT COUNT(*) AS n FROM messages WHERE direction = 'in' AND created_at > ?").bind(day),
      this.db.prepare("SELECT COUNT(*) AS n FROM messages WHERE direction = 'out' AND created_at > ?").bind(day),
      this.db.prepare("SELECT COUNT(*) AS n FROM messages WHERE direction = 'error' AND created_at > ?").bind(day),
    ]);
    return {
      contacts: contacts.results[0]?.n ?? 0,
      in24h: msgsIn.results[0]?.n ?? 0,
      out24h: msgsOut.results[0]?.n ?? 0,
      errors24h: errors.results[0]?.n ?? 0,
    };
  }

  async cleanup() {
    const week = now() - 7 * 24 * 60 * 60 * 1000;
    await this.db.batch([
      this.db.prepare('DELETE FROM processed_events WHERE created_at < ?').bind(week),
      this.db.prepare('DELETE FROM sessions WHERE updated_at < ?').bind(now() - SESSION_TTL_MS),
    ]);
  }
}
