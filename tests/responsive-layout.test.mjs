import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('CRM предоставляет полноценную мобильную навигацию и безопасную область экрана', async () => {
  const [layout, styles, html, alerts] = await Promise.all([
    read('apps/web/src/layouts/CrmLayout.tsx'),
    read('apps/web/src/styles.css'),
    read('apps/web/index.html'),
    read('apps/web/src/features/staffAlerts/StaffAlertsPopover.tsx'),
  ]);

  assert.match(layout, /className="mobile-nav-trigger"/);
  assert.match(layout, /className="mobile-navigation-drawer"/);
  assert.match(layout, /Профиль и смена пароля/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.crm-sider \{\s+display: none;/);
  assert.match(styles, /grid-template-areas:[\s\S]*"navigation actions"[\s\S]*"search search"/);
  assert.match(styles, /\.ant-drawer-content-wrapper \{\s+width: 100vw !important;/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(alerts, /rootClassName="staff-alerts-popover-root"/);
});

test('мобильный врач сначала видит осмотр, а широкие данные остаются доступными без обрезки страницы', async () => {
  const [visit, styles] = await Promise.all([
    read('apps/web/src/features/visits/VisitCardPage.tsx'),
    read('apps/web/src/styles.css'),
  ]);

  assert.match(visit, /className="visit-mobile-toolbar"/);
  assert.match(visit, /className="visit-mobile-status-actions"/);
  assert.match(visit, /id="visit-context-panel"/);
  assert.match(visit, /Вернуться к осмотру/);
  assert.match(styles, /\.visit-work-area \{\s+order: 2;/);
  assert.match(styles, /\.context-panel \{\s+order: 3;/);
  assert.match(styles, /Таблицу можно листать влево и вправо/);
  assert.match(styles, /\.bill-bulk-alert \.ant-alert-action \{[\s\S]*grid-column: 1 \/ -1;/);
});
