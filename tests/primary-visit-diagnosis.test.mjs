import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('первичный приём не завершается без диагноза и его типа', async () => {
  const { assertPrimaryVisitDiagnosesReady } = await import('../apps/api/dist/modules/visits/visit-diagnosis-rules.js');

  assert.throws(
    () => assertPrimaryVisitDiagnosesReady({ visitType: 'PRIMARY' }, []),
    /Вы не указали ни одного диагноза/,
  );
  assert.throws(
    () => assertPrimaryVisitDiagnosesReady({ visitType: 'PRIMARY' }, [{ diagnosisType: null }]),
    /Укажите тип для каждого диагноза/,
  );
  assert.doesNotThrow(() =>
    assertPrimaryVisitDiagnosesReady({ visitType: 'PRIMARY' }, [{ diagnosisType: 'Предварительный' }]),
  );
  assert.doesNotThrow(() => assertPrimaryVisitDiagnosesReady({ visitType: 'FOLLOW_UP' }, []));
});

test('запрет нельзя обойти прямым PATCH или переводом в стационар', async () => {
  const [visits, hospital] = await Promise.all([
    read('apps/api/src/modules/visits/visits.service.ts'),
    read('apps/api/src/modules/hospital/hospital.service.ts'),
  ]);

  assert.match(visits, /dto\.status === VisitStatus\.COMPLETED[\s\S]*ensurePrimaryVisitDiagnosesReady/);
  assert.match(visits, /status === VisitStatus\.COMPLETED[\s\S]*ensurePrimaryVisitDiagnosesReady/);
  assert.match(hospital, /assertPrimaryVisitDiagnosesReady\([\s\S]*visit\.diagnoses/);
});

test('тип диагноза обязателен в API и в быстром вводе', async () => {
  const [createDto, tab, card] = await Promise.all([
    read('apps/api/src/modules/visits/dto/create-visit-diagnosis.dto.ts'),
    read('apps/web/src/features/visits/VisitDiagnosesTab.tsx'),
    read('apps/web/src/features/visits/VisitCardPage.tsx'),
  ]);

  assert.match(createDto, /@ApiProperty\(\{ enum: VISIT_DIAGNOSIS_TYPES \}\)/);
  assert.match(createDto, /diagnosisType!:/);
  assert.match(tab, /placeholder="Тип диагноза"/);
  assert.match(tab, /quickTitle\.trim\(\)\.length < 2 \|\| !quickDiagnosisType/);
  assert.match(card, /Вы не указали ни одного диагноза/);
});
