import type { Db } from './runtime';
import type { Settings } from './settings';

const DAY = 86_400_000;

/** Housekeeping the brief asks for. The Node server runs it hourly; on Cloudflare a cron trigger does. */
export async function runJobs(db: Db, s: Settings): Promise<{ flyersCleared: number; chatsDeleted: number }> {
  const now = Date.now();

  // 1. Remember when each person last flew: the landing time of their flight, once it has passed.
  await db.run(
    `UPDATE users SET last_flight_at = (SELECT MAX(f.lands_at) FROM user_flights uf JOIN flights f ON f.key = uf.flight_key WHERE uf.user_id = users.id AND f.lands_at <= ?)
     WHERE (SELECT MAX(f.lands_at) FROM user_flights uf JOIN flights f ON f.key = uf.flight_key WHERE uf.user_id = users.id AND f.lands_at <= ?) > last_flight_at`,
    now, now,
  );

  // 2. No flight for 3 months: delete saved frequent flyer details.
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - s.flyerRetentionMonths);
  const flyersCleared = (await db.run('UPDATE users SET flyer_num = NULL, flyer_tier = NULL WHERE flyer_num IS NOT NULL AND last_flight_at < ?', cutoff.getTime())).changes;

  // 3. Chats closed for a while are deleted with their messages.
  const stale = await db.all<{ id: number; from_id: number; to_id: number }>(
    `SELECT c.id, c.from_id, c.to_id FROM connections c JOIN flights f ON f.key = c.flight_key WHERE f.lands_at + ? < ?`,
    48 * 3_600_000 + s.chatRetentionDays * DAY, now,
  );
  if (stale.length) {
    await db.batch(
      stale.flatMap((c) => [
        { sql: 'DELETE FROM messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', params: [c.from_id, c.to_id, c.to_id, c.from_id] },
        { sql: 'DELETE FROM connections WHERE id = ?', params: [c.id] },
      ]),
    );
  }

  await db.batch([
    { sql: 'DELETE FROM sessions WHERE expires_at <= ?', params: [now] },
    { sql: 'DELETE FROM tokens WHERE expires_at <= ?', params: [now] },
    { sql: 'DELETE FROM rate_limits WHERE reset_at <= ?', params: [now] },
    // games are short-lived: anything untouched for two days goes
    { sql: 'DELETE FROM games WHERE updated_at < ?', params: [now - 2 * DAY] },
    // group chats nobody has written in for 30 days are removed with their messages
    { sql: 'DELETE FROM group_messages WHERE group_id IN (SELECT id FROM groups WHERE updated_at < ?)', params: [now - 30 * DAY] },
    { sql: 'DELETE FROM group_members WHERE group_id IN (SELECT id FROM groups WHERE updated_at < ?)', params: [now - 30 * DAY] },
    { sql: 'DELETE FROM groups WHERE updated_at < ?', params: [now - 30 * DAY] },
    // sign-ups that never confirmed their email within a week are removed, so the address can be used again
    { sql: 'DELETE FROM users WHERE email_verified = 0 AND created_at < ?', params: [now - 7 * DAY] },
  ]);
  return { flyersCleared, chatsDeleted: stale.length };
}
