/* Minimal structured logger. Never pass secrets, tokens or full request bodies. */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

function currentLevel() {
  const configured = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info');
  return LEVELS[configured] ?? LEVELS.info;
}

function serialiseError(err) {
  if (!(err instanceof Error)) return err;
  return { name: err.name, message: err.message, code: err.code, stack: err.stack };
}

function write(level, msg, meta) {
  if (LEVELS[level] < currentLevel()) return;
  const entry = { level, time: new Date().toISOString(), msg };
  if (meta) {
    for (const [k, v] of Object.entries(meta)) entry[k] = v instanceof Error ? serialiseError(v) : v;
  }
  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (msg, meta) => write('debug', msg, meta),
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
};
