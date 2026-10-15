/**
 * Detect a running local Supabase (supabase start) once per test run.
 * If found, its URL and keys are provided to the tests and the live integration suites run;
 * otherwise those suites are skipped (reported as skipped, not passed).
 *
 * Explicit env wins: set SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY /
 * SUPABASE_JWT_SECRET to point the tests at another stack.
 */
import { execFile } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function supabaseStatus() {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    execFile(
      cmd,
      ['--no-install', 'supabase', 'status', '-o', 'env'],
      { cwd: repoRoot, timeout: 30_000, shell: process.platform === 'win32' },
      (err, stdout) => {
        if (err) return resolve(undefined);
        const env = {};
        for (const line of stdout.split(/\r?\n/)) {
          const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
          if (m) env[m[1]] = m[2];
        }
        resolve(env.API_URL ? env : undefined);
      },
    );
  });
}

async function reachable(url, key) {
  try {
    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key }, signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function setup({ provide }) {
  let live = {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    jwtSecret: process.env.SUPABASE_JWT_SECRET,
  };

  if (!live.url || !live.serviceKey) {
    const st = process.env.SKIP_SUPABASE_DETECT ? undefined : await supabaseStatus();
    if (st) {
      live = { url: st.API_URL, anonKey: st.ANON_KEY, serviceKey: st.SERVICE_ROLE_KEY, jwtSecret: st.JWT_SECRET };
    }
  }

  const ok = Boolean(live.url && live.serviceKey && live.anonKey) && (await reachable(live.url, live.anonKey));
  provide('supabase', ok ? { available: true, ...live } : { available: false });

  if (!ok) {
    console.warn('\n[tests] Local Supabase not reachable: live integration suites (test/integration) will be SKIPPED.\n' +
      '        Start it with `npm run db:start` (repo root; needs Docker) and re-run.\n');
  }
}
