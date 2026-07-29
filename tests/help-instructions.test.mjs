import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('инструкция доступна слева отдельным пунктом сразу под настройками', () => {
  const menu = read('apps/web/src/layouts/menu.tsx');
  const settingsEnd = menu.indexOf("{ key: '/help', icon: <ReadOutlined />, label: 'Инструкция' }");
  const settingsStart = menu.indexOf("key: '/settings'");

  assert.ok(settingsStart >= 0);
  assert.ok(settingsEnd > settingsStart);
  assert.doesNotMatch(read('apps/web/src/layouts/CrmLayout.tsx'), /label: 'Инструкция'/);
});

test('большая инструкция охватывает рабочие и безопасные сценарии клиники', () => {
  const page = read('apps/web/src/features/help/HelpPage.tsx');

  for (const text of [
    'Владельцы и пациенты',
    'Проведение врачебного приёма',
    'Стационар',
    'Лаборатория и профили анализов',
    'Счета, оплаты и чек',
    'Склад: товары, единицы, штрих-коды и сроки годности',
    'Сотрудники и права доступа',
    'Перенос данных из другой системы',
    'Резервные копии и безопасное обновление',
    'Печать / сохранить PDF',
    'http://192.168.x.x:3000',
    'Не удаляйте Docker volumes',
  ]) {
    assert.match(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('маршрут инструкции доступен каждому вошедшему сотруднику', () => {
  const routes = read('apps/web/src/app/routes.tsx');
  const access = read('apps/web/src/auth/access.ts');

  assert.match(routes, /path: '\/help', element: <HelpPage \/>/);
  assert.match(access, /\{ path: '\/help' \}/);
});
