import type { VisitRecommendationInput } from './types';

export type RecommendationDraft = { updatedAt: number; values: VisitRecommendationInput };
const queues = new Map<string, Promise<unknown>>();

export function enqueueRecommendationSave<T>(id: string, save: () => Promise<T>): Promise<T> {
  const run = (queues.get(id) ?? Promise.resolve()).catch(() => undefined).then(save);
  queues.set(id, run);
  void run.finally(() => { if (queues.get(id) === run) queues.delete(id); }).catch(() => undefined);
  return run;
}

export function readRecommendationDraft(key: string): RecommendationDraft | null {
  try {
    const draft = JSON.parse(localStorage.getItem(key) || 'null');
    return draft && typeof draft.updatedAt === 'number' && draft.values && typeof draft.values === 'object' ? draft : null;
  } catch { return null; }
}

export function writeRecommendationDraft(key: string, values: VisitRecommendationInput) {
  try {
    localStorage.setItem(key, JSON.stringify({ updatedAt: Date.now(), values }));
    return true;
  } catch { return false; }
}

export function clearRecommendationDraft(key: string, snapshot: string) {
  const draft = readRecommendationDraft(key);
  if (draft && JSON.stringify(draft.values) === snapshot) {
    try { localStorage.removeItem(key); } catch { /* The server copy is saved. */ }
  }
}
