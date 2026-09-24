import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
export function loadPrintModule(name, capture = () => {}) {
  const imports = {
    '../../app/config': { appConfig: { brandName: 'TemichevVet' } },
    '../../shared/utils/date': { formatDateTime: (v) => new Date(v).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) },
    '../../shared/utils/money': { formatMoney: (v) => `${v} ₽` },
    '../../shared/utils/animalBirthDate': { formatAnimalAge: () => '7 лет' },
    './types': { visitTypeLabels: { PRIMARY: 'Первичный' } },
    '../visits/types': { laboratoryOrderStatusLabels: { COMPLETED: 'Завершён', IN_PROGRESS: 'В работе' } },
  };
  const source = readFileSync(new URL(`../../apps/web/src/features/${name}`, import.meta.url), 'utf8');
  const exports = {};
  const context = { exports, URL, console, Intl, Date,
    require: (id) => { if (!(id in imports)) throw Error(`Unexpected import ${id}`); return imports[id]; },
    window: { location: { href: 'http://127.0.0.1:4319/' }, open: () => ({ document: { write: capture, close() {} } }) },
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return exports;
}
