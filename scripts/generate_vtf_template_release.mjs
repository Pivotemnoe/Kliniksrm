import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const sourcePath = process.argv[2] ?? '/private/tmp/vtf-documents-20260812.json';
const sourceDocuments = JSON.parse(readFileSync(sourcePath, 'utf8'));

const replacements = new Map([
  ['Owner.name', 'owner.fullName'],
  ['Owner.address', 'owner.address'],
  ['Owner.passport', 'owner.passportData'],
  ['Owner.phonePrimary', 'owner.phone'],
  ['Organization.Details.name', 'organization.legalName'],
  ['Organization.Details.address', 'organization.legalAddress'],
  ['Organization.Details.inn', 'organization.inn'],
  ['Organization.Details.bik', 'organization.bik'],
  ['Organization.Details.checkingAccount', 'organization.account'],
  ['Organization.Office.phonePrimary', 'office.phone'],
  ['Organization.code', ''],
  ['d.m.Y', 'currentDate'],
]);

const documents = sourceDocuments.map((document) => ({
  ...document,
  body: convertText(document.body),
  layout: convertLayout(document.layout),
  categoryTitle: document.category === '37'
    ? 'VTF · на юридическую проверку'
    : 'VTF · лабораторные бланки (ручные)',
  requiresSignature: document.category === '37',
}));

const medicalPhrases = [
  phrase('visit.recommendation.treatmentPlan', 'VTF · План лечения', 'ЛОЖНАЯ БЕРЕМЕННОСТЬ', `П/К - Мастометрин + Травматин по ; 
П/О - Лакто-Стоп мл. 

Рекомендации: 
1. Урезать кормление в 50%.
2. Активный моцион.
3. Лакто-Стоп (или Галастоп по мл. - Курс 4 - 7 дней.`),
  phrase('visit.recommendation.treatmentPlan', 'VTF · План лечения', 'ОГЭ', `Атропин - ; Анальгин - ; Димедрол - ; Медитин - ; Антимедин - ; Везотил - 
Фуросенит-вет - ; Эмицидин - ; Аскорбиновая кислота ; Конафлион - ; Амоксициллин - 

Рекомендации: 
1. Амоксициллин по мл. - 
2. Травматин - 
3. Аскорбиновая кислота - 

Рекомендации: 
1. Не допускать нализывания швов.
2. Ношение послеоперационной попоны или защитного воротника
3. Обработка швов водным раствором Хлоргексидина Биглюконата 0,05% 1-2 раза в день. При образовании корочек - аккуратно. 

Снятие швов -`),
  phrase('visit.recommendation.treatmentPlan', 'VTF · План лечения', 'ОТЕК ЛЁГКИХ', `Rg-снимок - 
Постановка в/в катетера; Измерение уровня глюкозы - ммоль/л.
В/В - Фуросемид - ; Эмицидин - ; Тонокард - ; Рибоксин - ; Панангин - 
Ректально : Габапентин мг. 
Кислородная камера.`),
  phrase('visit.recommendation.treatmentPlan', 'VTF · План лечения', 'ПРОТИВОКАШЛЕВАЯ ТЕРАПИЯ', `Противокашлевая терапия: 
1. Коделак ( с кодеином ) Аналог - Терпинкод табл. - 0,008 внутрь по 0,1 - 2 мг/кг 3 - 4 раза в сутки.
2. Бутамират внутрь по 0,5 - 2 мг / кг 3-4 раза в сутки ( Синекод сироп 1,5 мг/мл, Омнитус )
3. Либексин внутрь 10 мг/кг. 2 раза в сутки

Стероиды: 
1. Системно: Преднизолон 0,25 - 0,5 мг./кг.
2. Местно: ингаляции через спейсер или небулайзер.`),
  phrase('visit.recommendation.treatmentPlan', 'VTF · План лечения', 'ОТРАВЛЕНИЕ', `Постановка в/в катетера; Измерение уровня глюкозы - ммоль/л.
В/В - NaCI 0,9% - Рингера-Локка - Глюкоза 5% - ; Атропин - ; Супрастин - ; Антитокс - ; Тонокард - ; Эмицидин -; В6 - ; Магния Сульфат - ;`),
  phrase('visit.recommendation.treatmentPlan', 'VTF · План лечения', 'ПОСЛЕРОДОВАЯ ЭКЛАМПСИЯ', `Постановка в/в катетера; Измерение уровня глюкозы - ммоль/л.
В/В - NaCI 0,9% - Рингера-Лока - Глюкоза 5% - ; Кальция глюконат - ; Магния сульфат - ; Панангин - 
В/М - Литическая смесь по 
П/К - Кафорсен -`),
  phrase('visit.recommendation.treatmentPlan', 'VTF · План лечения', 'ЧУМА ПЛОТОЯДНЫХ', `ОАК - 
Тест на чуму плотоядных - 
Постановка в/в катетера; Измерение уровня глюкозы - ммоль/л.
В/В - NaCI 0,9% - Рингера-Локка - Глюкоза 5% - ; В1 - (Чередовать с В6); Кальция глюконат - ; 
В/М - Кобактан - / Тилозин - ; Анандин - ; Супрастин - 
П/К - Гискан 1 доза`),
  phrase('visit.recommendation.treatmentPlan', 'VTF · План лечения', 'ДИРОФИЛЯРИОЗ', `ОАК - 
Тест на дирофиляриоз - положительный. 
Микроскопия - 

Назначение:
1. Доксициклин (100мг) - 10 мг./кг. - по таб 1 р в день - 21 день
2. Рибоксин по 1 таб 2 р в день - 1 месяц
3. Панангин по 1 таб 2 р в день -14 дней.
4. Верошпирон (50мг) по таб. 1 р в день - 21 - 28 дней.
5. Диронет (по весу) - 1 р в месяц (пожизненно) или Инспектор квадро. 
6. Кардиомагнил по таб. ( в летний период ).`),
  phrase('visit.recommendation.treatmentPlan', 'VTF · План лечения', 'КАСТРАЦИЯ', `Атропин - ; Анальгин - ; Димедрол - ; Медитин - ; Антимедин - ; 
Фуросенит-вет - ; Эмицидин - ; Аскорбиновая кислота - ; Конафлион - ; Амоксициллин - 
Оперативное вмешательство : Орхиэктомия. 

Рекомендации в послеоперационном уходе: 
1. Не допускать нализывания послеоперационной раны. 
2. Ношение защитного воротника. 

На приём - ( осмотр раны )`),
  phrase('visit.recommendation.treatmentPlan', 'VTF · План лечения', 'БАБЕЗИОЗ', `ОАК - 
Центрифугирование крови - гемолиз ( )
В/М - Литическая смесь по Супрастин - ; Конафлион - ; ПенСтреп - ; Гептрал - ; Пиро-стоп ( : )
П/К - В12 - ; Кантарен + Панкреалекс + Лиарсин по`),
  phrase('visit.recommendation.treatmentPlan', 'VTF · План лечения', 'ПАНЛЕЙКОПЕНИЯ', `Тест на панлейкопению - положительный
Постановка в/в катетера; измерение уровня глюкозы - ммоль/л.
В/В - NaCI 0,9% - Рингера-Локка - Глюкоза 5% - ; Аскорбиновая кислота - ; Конафлион - ; Рибоксин - ; Панангин - ; Маропиталь - 
В/М - Тилозин - ; литическая смесь - ; Супрастин - ; Спазмамирал - ; Фелиферон 1,0
П/К - Глобфел 1 доза

Прогноз : осторожный - неблагоприятный
На приём -`),
  phrase('visit.exam.anamnesis', 'VTF · Осмотр', 'АНАМНЕЗ', `Жалобы: 

Условия содержания - 
Вакцинации - 
Обработка от экто- и эндопаразитов - 
Кормление - 
Статус репродукции - 
Хронические заболевания -`),
  phrase('visit.recommendation.treatmentPlan', 'VTF · План лечения', 'ПАРВОВИРУСНЫЙ ЭНТЕРИТ', `Тест на парвовирусный энтерит - положительный.
Постановка в/в катетера; измерение уровня глюкозы - ммоль/л. 
в/в NaCI 0,9% - ; Рингера-Локка - ; Глюкоза 5% - ; Аскорбиновая кислота - ; Конафлион - ; Рибоксин - ; Панангин - ; Маропиталь - 
в/м Литическая смесь по ; Тилозин - ; Супрастин - ; Спазмамирал - ; Догферон - ; 
п/к Гискан 1 доза

Прогноз : осторожный - неблагоприятный
На приём -`),
  phrase('visit.exam.examination', 'VTF · Осмотр', 'БЛАНК ОСМОТРА', `ЧСС - 
ЧДД - 
Видимые слизистые оболочки - 
Тургор кожи и состояние шерсти - 
Лимфатические узлы - 
Пальпация области живота - 
Мочевой пузырь - 
Почки -`),
];

const notificationTemplates = [];
for (const channel of ['TELEGRAM', 'MAX', 'PUSH']) {
  notificationTemplates.push({
    channel,
    eventCode: 'appointment_reminder',
    title: 'Напоминание о записи',
    body: `🐾 {organization.orgType} «{organization.displayName}»\nНапоминаем о записи на приём пациента «{animal.nickname}»\n🕒 {appointment.time} {appointment.date}\n📞 Контактный телефон: {office.phone}`,
  });
  notificationTemplates.push({
    channel,
    eventCode: 'revaccination_reminder',
    title: 'Напоминание о вакцинации',
    body: `💉 Напоминание о вакцинации\nПациент: «{animal.nickname}»\n{organization.orgType} «{organization.displayName}»\n📞 Контактный телефон: {office.phone}`,
  });
}
notificationTemplates.push({
  channel: 'SMS',
  eventCode: 'appointment_reminder',
  title: 'Короткое напоминание о записи',
  body: `{organization.displayName}: {animal.nickname} записан на {appointment.time} {appointment.date}. Телефон: {office.phone}`,
});
notificationTemplates.push({
  channel: 'SMS',
  eventCode: 'revaccination_reminder',
  title: 'Короткое напоминание о вакцинации',
  body: `{organization.displayName}: пациенту {animal.nickname} пора на вакцинацию. Телефон: {office.phone}`,
});

const seedModule = `// Generated from clinic-owned VTF templates. Do not edit by hand.\n` +
  `const vtfDocumentTemplates = ${JSON.stringify(documents, null, 2)};\n\n` +
  `const vtfMedicalPhrases = ${JSON.stringify(medicalPhrases, null, 2)};\n\n` +
  `const vtfNotificationTemplates = ${JSON.stringify(notificationTemplates, null, 2)};\n\n` +
  `module.exports = { vtfDocumentTemplates, vtfMedicalPhrases, vtfNotificationTemplates };\n`;

const sql = buildSql(documents, medicalPhrases, notificationTemplates);
if (process.argv.includes('--write')) {
  writeFileSync(new URL('../prisma/vtf-clinic-templates.generated.cjs', import.meta.url), seedModule);
  const migrationDirectory = new URL('../prisma/migrations/20260812000100_vtf_templates_reports_and_daily_briefing/', import.meta.url);
  mkdirSync(migrationDirectory, { recursive: true });
  writeFileSync(new URL('migration.sql', migrationDirectory), sql);
  process.stdout.write(`Generated ${documents.length} document templates, ${medicalPhrases.length} medical phrases and ${notificationTemplates.length} notification templates.\n`);
} else {
  process.stdout.write(JSON.stringify({ seedModule, sql }));
}

function phrase(field, category, title, text) {
  return { field, category, title, text, textHash: hash(text), source: 'SYSTEM', scopeKey: 'system' };
}

function hash(text) {
  return createHash('sha256').update(text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU')).digest('hex');
}

function convertText(text) {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key) => {
    const replacement = replacements.get(key);
    return replacement === undefined ? `{${key}}` : replacement ? `{${replacement}}` : '';
  });
}

function convertLayout(layout) {
  return {
    ...layout,
    page: {
      ...layout.page,
      showVisitMeta: false,
      showSignatures: layout.page.showSignatures,
    },
    blocks: layout.blocks.map((block) => block.type === 'text'
      ? { ...block, text: convertText(block.text) }
      : block.type === 'table'
        ? { ...block, rows: block.rows.map((row) => row.map(convertText)) }
        : block),
  };
}

function buildSql(documentItems, phraseItems, notificationItems) {
  const lines = [
    '-- Additive VTF template import. No clinical, financial, file, or generated-document rows are changed.',
    '-- Laboratory forms are ordinary manual document templates only; no laboratory completion automation is enabled.',
  ];
  const categoryIds = new Map([
    ['VTF · на юридическую проверку', 'a1000000-0000-4000-8000-000000000001'],
    ['VTF · лабораторные бланки (ручные)', 'a1000000-0000-4000-8000-000000000002'],
  ]);
  for (const [title, id] of categoryIds) {
    lines.push(`INSERT INTO "DocumentTemplateCategory" ("id","title","createdAt","updatedAt") VALUES (${q(id)},${q(title)},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("title") DO NOTHING;`);
  }
  for (const item of documentItems) {
    const templateId = uuid('a2', item.id);
    const versionId = uuid('a3', item.id);
    const categoryId = categoryIds.get(item.categoryTitle);
    lines.push(`INSERT INTO "DocumentTemplate" ("id","categoryId","title","body","layout","variables","requiresSignature","currentVersion","createdAt","updatedAt") SELECT ${q(templateId)},c."id",${q(item.title)},${q(item.body)},${json(item.layout)},${json({ source: 'VTF', sourceId: item.id, reviewStatus: item.requiresSignature ? 'LEGAL_REVIEW_REQUIRED' : 'MANUAL_FORM' })},${item.requiresSignature},1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplateCategory" c WHERE c."title"=${q(item.categoryTitle)} AND NOT EXISTS (SELECT 1 FROM "DocumentTemplate" t WHERE t."categoryId"=c."id" AND t."title"=${q(item.title)});`);
    lines.push(`INSERT INTO "DocumentTemplateVersion" ("id","templateId","version","categoryTitle","title","body","layout","variables","requiresSignature","createdByName","publishedAt","createdAt") SELECT ${q(versionId)},t."id",1,${q(item.categoryTitle)},t."title",t."body",t."layout",t."variables",t."requiresSignature",'Импорт VTF',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplate" t JOIN "DocumentTemplateCategory" c ON c."id"=t."categoryId" WHERE c."title"=${q(item.categoryTitle)} AND t."title"=${q(item.title)} AND NOT EXISTS (SELECT 1 FROM "DocumentTemplateVersion" v WHERE v."templateId"=t."id" AND v."version"=1);`);
  }
  for (const item of phraseItems) {
    lines.push(`INSERT INTO "MedicalPhrase" ("id","field","category","title","text","textHash","source","scopeKey","isActive","isAccepted","isPinned","usageCount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,${q(item.field)},${q(item.category)},${q(item.title)},${q(item.text)},${q(item.textHash)},'SYSTEM','system',true,false,false,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("field","scopeKey","textHash") DO NOTHING;`);
  }
  for (const item of notificationItems) {
    const variables = variableKeys(item.body);
    lines.push(`INSERT INTO "NotificationTemplate" ("id","channel","eventCode","title","body","variables","isActive","createdAt","updatedAt") VALUES (gen_random_uuid()::text,${q(item.channel)},${q(item.eventCode)},${q(item.title)},${q(item.body)},${json(variables)},true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("channel","eventCode") DO UPDATE SET "title"=EXCLUDED."title","body"=EXCLUDED."body","variables"=EXCLUDED."variables","isActive"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "NotificationTemplate"."body" IN ('Здравствуйте, {owner.fullName}. Напоминаем о записи пациента {animal.nickname} на {appointment.startsAt}.','Здравствуйте, {owner.fullName}. Пациенту {animal.nickname} пора на ревакцинацию: {vaccination.title}.','{owner.fullName}, запись {animal.nickname}: {appointment.startsAt}. TemichevVet.');`);
  }
  lines.push(
    '',
    '-- Configurable daily director briefing. The report is generated from CRM facts only and never changes clinical or financial records.',
    'ALTER TABLE "Organization" ADD COLUMN "directorBriefingEnabled" BOOLEAN NOT NULL DEFAULT true;',
    'ALTER TABLE "Organization" ADD COLUMN "directorBriefingTime" TEXT NOT NULL DEFAULT \'08:00\';',
    'ALTER TABLE "Organization" ADD COLUMN "directorBriefingTimezone" TEXT NOT NULL DEFAULT \'Europe/Moscow\';',
    'CREATE TABLE "DirectorBriefing" (',
    '  "id" TEXT NOT NULL,',
    '  "organizationId" TEXT NOT NULL,',
    '  "businessDate" DATE NOT NULL,',
    '  "rangeFrom" TIMESTAMP(3) NOT NULL,',
    '  "rangeTo" TIMESTAMP(3) NOT NULL,',
    '  "trigger" TEXT NOT NULL,',
    '  "title" TEXT NOT NULL,',
    '  "summary" TEXT NOT NULL,',
    '  "snapshot" JSONB NOT NULL,',
    '  "createdById" TEXT,',
    '  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
    '  CONSTRAINT "DirectorBriefing_pkey" PRIMARY KEY ("id")',
    ');',
    'CREATE UNIQUE INDEX "DirectorBriefing_organizationId_businessDate_key" ON "DirectorBriefing"("organizationId", "businessDate");',
    'CREATE INDEX "DirectorBriefing_createdAt_idx" ON "DirectorBriefing"("createdAt");',
    'ALTER TABLE "DirectorBriefing" ADD CONSTRAINT "DirectorBriefing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;',
    'ALTER TABLE "DirectorBriefing" ADD CONSTRAINT "DirectorBriefing_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;',
  );
  return lines.join('\n') + '\n';
}

function variableKeys(body) {
  return [...new Set([...body.matchAll(/\{([\w.]+)\}/g)].map((match) => match[1]))];
}

function uuid(prefix, id) {
  return `${prefix}000000-0000-4000-8000-${id.padStart(12, '0')}`;
}

function q(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function json(value) {
  return `${q(JSON.stringify(value))}::jsonb`;
}
