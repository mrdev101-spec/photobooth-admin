/**
 * Runs once when a server instance starts. In production it refuses to start with settings
 * that would break or weaken the system, instead of failing later on the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production') return;
  const { checkProductionEnv } = await import('./server/lib/env-check');
  const { errors, warnings } = checkProductionEnv(process.env);
  for (const w of warnings) console.warn(`[env] ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`[env] ${e}`);
    throw new Error(`Admin cannot start: ${errors.length} environment setting(s) missing or invalid (see the log above, docs/DEPLOY.md)`);
  }
}
