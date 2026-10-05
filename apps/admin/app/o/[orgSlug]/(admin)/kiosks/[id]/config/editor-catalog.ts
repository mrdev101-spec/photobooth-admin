import 'server-only';
import { getCatalogState } from '@/server/services/catalog';
import { catalogItems } from '@/lib/template-visibility';
import type { EditorCatalog } from './config-editor';

/** Templates the config editor can offer right now (built-in not retired + published uploaded). */
export async function editorCatalog(orgId: string): Promise<EditorCatalog> {
  const state = await getCatalogState(orgId);
  const pick = (kind: Parameters<typeof catalogItems>[0]) => catalogItems(kind, state).map(({ id, name, desc, image }) => ({ id, name, desc, image }));
  return { photo: pick('photo-4x6'), badge: pick('badge'), classic: pick('classic'), ai: pick('ai-scene') };
}
