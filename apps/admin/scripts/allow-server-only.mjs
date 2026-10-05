// Lets command-line scripts import server modules: `server-only` only guards against bundling
// them into browser code, which cannot happen in a script.
//   npx tsx --import ./scripts/allow-server-only.mjs …
import { register } from 'node:module';

const hook = `export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export%20%7B%7D', shortCircuit: true };
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);
