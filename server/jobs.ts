import { config } from './config';
import { all, run } from './db';
import { sweepRateLimits } from './http';

const DAY = 86_400_000;

/** Housekeeping the brief asks for. Runs at start and then every hour. */
export function runJobs(): { flyersCleared: number; chatsDeleted: number } {
  const now = Date.now();

  // 1. Remember when each person last flew: the landing time of their flight, once it has passed.
  run(
    `UPDATE users SET last_flight_at = (SELECT f.lands_at FROM flights f WHERE f.key = users.flight_key)
     WHERE flight_key IS NOT NULL
       AND (SELECT f.lands_at FROM flights f WHERE f.key = users.flight_key) <= ?
       AND (SELECT f.lands_at FROM flights f WHERE f.key = users.flight_key) > last_flight_at`,
    now,
  );

  // 2. No flight for 3 months: delete saved frequent flyer details.
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - config.flyerRetentionMonths);
  const flyersCleared = run('UPDATE users SET flyer_num = NULL, flyer_tier = NULL WHERE flyer_num IS NOT NULL AND last_flight_at < ?', cutoff.getTime()).changes;

  // 3. Chats closed for a while are deleted with their messages.
  const stale = all<{ id: number; from_id: number; to_id: number }>(
    `SELECT c.id, c.from_id, c.to_id FROM connections c JOIN flights f ON f.key = c.flight_key WHERE f.lands_at + ? < ?`,
    (48 * 3_600_000) + config.chatRetentionDays * DAY, now,
  );
  for (const c of stale) {
    run('DELETE FROM messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', c.from_id, c.to_id, c.to_id, c.from_id);
    run('DELETE FROM connections WHERE id = ?', c.id);
  }

  run('DELETE FROM sessions WHERE expires_at <= ?', now);
  run('DELETE FROM tokens WHERE expires_at <= ?', now);
  // sign-ups that never confirmed their email within a week are removed, so the address can be used again
  run('DELETE FROM users WHERE email_verified = 0 AND created_at < ?', now - 7 * DAY);
  sweepRateLimits();
  return { flyersCleared, chatsDeleted: stale.length };
}
