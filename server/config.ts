import path from 'node:path';
import { settingsFrom } from './settings';

const env = process.env;
const port = Number(env.PORT) || 3000;

/** Settings for the Node server. Everything comes from environment variables, so nothing is edited in code to deploy. */
export const config = {
  port,
  host: env.HOST ?? '127.0.0.1',
  /** Where the SQLite file lives. */
  dataDir: path.resolve(env.WINGMATE_DATA_DIR ?? 'data'),
  /** The built front end (npm run build). */
  publicDir: path.resolve(env.WINGMATE_PUBLIC_DIR ?? 'dist'),
  settings: settingsFrom(env, { publicUrl: `http://localhost:${port}`, secureCookies: false }),
} as const;
