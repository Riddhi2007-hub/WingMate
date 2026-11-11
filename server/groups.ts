/**
 * Group chats: a travel mate can start a group (a family trip, solo travellers heading the same way) and invite
 * people they are connected with. Nobody is added without saying yes: an invited person sees the group and who is
 * in it, and joins only if they accept. Any member can invite their own connections, up to 8 people in a group.
 */
import type { Db } from './runtime';
import { HttpError, bad } from './http';

export const MAX_MEMBERS = 8;

interface GroupRow {
  id: number;
  name: string;
  owner_id: number | null;
  created_at: number;
  updated_at: number;
}
interface MemberRow {
  group_id: number;
  user_id: number;
  status: 'invited' | 'joined';
  invited_by: number | null;
  first: string;
  last: string;
}
interface MsgRow {
  id: number;
  group_id: number;
  from_id: number | null;
  text: string;
  created_at: number;
}

const ph = (n: number): string => Array.from({ length: n }, () => '?').join(',');
const shortName = (first: string, last: string): string => (last ? `${first} ${last.charAt(0).toUpperCase()}.` : first);

export function groupName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 1 || name.length > 40) throw bad('Give the group a name of up to 40 characters.', 'name');
  return name;
}

/** The ids of people I can invite: connected with me and not blocked either way. */
export async function invitable(db: Db, me: number, ids: number[]): Promise<number[]> {
  if (!ids.length) return [];
  const rows = await db.all<{ other: number }>(
    `SELECT CASE WHEN c.from_id = ? THEN c.to_id ELSE c.from_id END AS other FROM connections c
     WHERE c.status = 'connected' AND ((c.from_id = ? AND c.to_id IN (${ph(ids.length)})) OR (c.to_id = ? AND c.from_id IN (${ph(ids.length)})))`,
    me, me, ...ids, me, ...ids,
  );
  const blocks = await db.all<{ a: number; b: number }>('SELECT blocker_id AS a, blocked_id AS b FROM blocks WHERE blocker_id = ? OR blocked_id = ?', me, me);
  const blocked = new Set(blocks.map((x) => (x.a === me ? x.b : x.a)));
  return [...new Set(rows.map((r) => r.other))].filter((id) => !blocked.has(id));
}

export async function membership(db: Db, groupId: number, me: number): Promise<{ group: GroupRow; status: 'invited' | 'joined' }> {
  const group = await db.get<GroupRow>('SELECT * FROM groups WHERE id = ?', groupId);
  const row = group ? await db.get<{ status: 'invited' | 'joined' }>('SELECT status FROM group_members WHERE group_id = ? AND user_id = ?', groupId, me) : undefined;
  if (!group || !row) throw new HttpError(404, 'not_found', 'That group is no longer there.');
  return { group, status: row.status };
}

/** Adds invitations (skips people already in the group) and refuses when the group would be too big. */
export async function inviteAll(db: Db, groupId: number, me: number, ids: number[]): Promise<number> {
  const existing = await db.all<{ user_id: number }>('SELECT user_id FROM group_members WHERE group_id = ?', groupId);
  const have = new Set(existing.map((r) => r.user_id));
  const fresh = ids.filter((id) => !have.has(id));
  if (existing.length + fresh.length > MAX_MEMBERS) throw bad(`A group can have up to ${MAX_MEMBERS} people.`);
  const now = Date.now();
  for (const id of fresh) await db.run("INSERT OR IGNORE INTO group_members (group_id, user_id, status, invited_by, created_at) VALUES (?, ?, 'invited', ?, ?)", groupId, id, me, now);
  return fresh.length;
}

/** Everything the browser needs about my groups, plus group messages newer than `after`. */
export async function groupsFor(db: Db, me: number, after: number) {
  const mine = await db.all<GroupRow & { status: 'invited' | 'joined'; invited_by: number | null }>(
    'SELECT g.*, gm.status, gm.invited_by FROM groups g JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ? ORDER BY g.updated_at DESC',
    me,
  );
  if (!mine.length) return { groups: [], groupMessages: [], groupCursor: after };
  const ids = mine.map((g) => g.id);
  const members = await db.all<MemberRow>(
    `SELECT gm.group_id, gm.user_id, gm.status, gm.invited_by, u.first, u.last FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id IN (${ph(ids.length)}) ORDER BY gm.created_at`,
    ...ids,
  );
  const joined = mine.filter((g) => g.status === 'joined').map((g) => g.id);
  const msgs = joined.length
    ? await db.all<MsgRow>(`SELECT * FROM (SELECT * FROM group_messages WHERE group_id IN (${ph(joined.length)}) AND id > ? ORDER BY id DESC LIMIT 500) ORDER BY id ASC`, ...joined, after)
    : [];
  const names = new Map(members.map((m) => [m.user_id, shortName(m.first, m.last)]));
  return {
    groups: mine.map((g) => ({
      id: String(g.id),
      name: g.name,
      myStatus: g.status,
      invitedBy: g.invited_by ? names.get(g.invited_by) ?? 'Someone' : null,
      updatedAt: g.updated_at,
      members: members
        .filter((m) => m.group_id === g.id)
        .map((m) => ({ id: String(m.user_id), name: m.user_id === me ? 'You' : shortName(m.first, m.last), me: m.user_id === me, status: m.status, av: m.user_id % 6 })),
    })),
    groupMessages: msgs.map((m) => ({
      id: m.id,
      group: String(m.group_id),
      from: m.from_id === me ? ('me' as const) : ('them' as const),
      by: m.from_id === null ? 'Someone' : names.get(m.from_id) ?? 'A former member',
      byId: m.from_id === null ? '' : String(m.from_id),
      text: m.text,
      t: m.created_at,
    })),
    groupCursor: msgs.length ? Math.max(...msgs.map((m) => m.id)) : after,
  };
}
