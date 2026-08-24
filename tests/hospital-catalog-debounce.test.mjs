import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('поиск препаратов и услуг стационара ждёт паузу и отменяет устаревший запрос', async () => {
  const [hook, card, treatmentPlan, api] = await Promise.all([
    read('apps/web/src/shared/hooks/useDebouncedValue.ts'),
    read('apps/web/src/features/hospital/HospitalCardPage.tsx'),
    read('apps/web/src/features/hospital/HospitalTreatmentPlanModal.tsx'),
    read('apps/web/src/features/hospital/hospital.api.ts'),
  ]);

  assert.match(hook, /delayMs = 300/);
  assert.match(hook, /window\.setTimeout/);
  assert.match(hook, /window\.clearTimeout/);

  for (const source of [card, treatmentPlan]) {
    assert.match(source, /useDebouncedValue\(catalogSearch\.trim\(\)\)/);
    assert.match(source, /queryFn: \(\{ signal \}\) => getHospitalCatalog\(debouncedCatalogSearch \|\| undefined, signal\)/);
    assert.doesNotMatch(source, /useDeferredValue/);
  }

  assert.match(api, /getHospitalCatalog\(search\?: string, signal\?: AbortSignal\)/);
  assert.match(api, /buildQuery\(\{ search \}\)}`, \{ signal \}/);
});
