// Makes a consistent copy of the database:  npm run backup   (safe while the server is running)
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.env.WINGMATE_DATA_DIR ?? 'data');
const source = path.join(dataDir, 'wingmate.db');
if (!existsSync(source)) { console.error(`No database at ${source}`); process.exit(1); }
const dir = path.resolve(process.env.WINGMATE_BACKUP_DIR ?? 'backups');
mkdirSync(dir, { recursive: true });
const target = path.join(dir, `wingmate-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
const db = new DatabaseSync(source);
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
db.close();
console.log(`Backup saved: ${target}`);
