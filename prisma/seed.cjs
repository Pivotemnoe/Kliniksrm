const { PrismaClient } = require('@prisma/client');
const { createHash, randomBytes, scryptSync } = require('node:crypto');

const prisma = new PrismaClient();

const DEFAULT_ORGANIZATION_ID = '11111111-1111-4111-8111-000000000001';
const DEFAULT_OFFICE_ID = '11111111-1111-4111-8111-000000000101';

const permissions = [
  ['news.read', 'Просмотр новостей клиники'],
  ['news.manage', 'Публикация новостей клиники'],
  ['dashboard.read', 'Просмотр сводки'],
  ['queue.read', 'Просмотр очереди'],
  ['queue.call', 'Вызов пациентов из очереди'],
  ['queue.manage', 'Управление очередью'],
  ['appointments.read', 'Просмотр расписания'],
  ['appointments.manage', 'Управление расписанием'],
  ['tasks.read', 'Просмотр задач'],
  ['tasks.manage', 'Управление задачами'],
  ['owners.read', 'Просмотр владельцев'],
  ['owners.manage', 'Управление владельцами'],
  ['animals.read', 'Просмотр пациентов'],
  ['animals.manage', 'Управление пациентами'],
  ['visits.read', 'Просмотр приемов'],
  ['visits.manage', 'Проведение приемов'],
  ['billing.read', 'Просмотр счетов'],
  ['billing.manage', 'Счета и оплаты'],
  ['payments.manage', 'Прием оплат'],
  ['stock.read', 'Просмотр склада'],
  ['stock.manage', 'Склад'],
  ['laboratory.read', 'Просмотр лаборатории'],
  ['laboratory.manage', 'Управление лабораторией'],
  ['hospital.read', 'Просмотр стационара'],
  ['hospital.manage', 'Управление стационаром'],
  ['notifications.read', 'Просмотр уведомлений'],
  ['notifications.manage', 'Уведомления и рассылки'],
  ['documents.read', 'Просмотр документов'],
  ['documents.print', 'Печать документов'],
  ['documents.manage', 'Документы и шаблоны'],
  ['settings.read', 'Просмотр настроек клиники'],
  ['settings.manage', 'Настройки клиники'],
  ['employees.read', 'Просмотр сотрудников'],
  ['employees.manage', 'Сотрудники и доступы'],
  ['roles.manage', 'Назначение ролей и прав'],
  ['audit.read', 'Просмотр журнала действий'],
  ['backups.manage', 'Резервные копии'],
];

const roles = [
  ['director', 'Директор', permissions.map(([code]) => code)],
  [
    'administrator',
    'Администратор клиники',
    [
      'dashboard.read',
      'news.read',
      'news.manage',
      'queue.read',
      'queue.call',
      'queue.manage',
      'appointments.read',
      'appointments.manage',
      'tasks.read',
      'tasks.manage',
      'owners.read',
      'owners.manage',
      'animals.read',
      'animals.manage',
      'visits.read',
      'visits.manage',
      'billing.read',
      'billing.manage',
      'payments.manage',
      'stock.read',
      'laboratory.read',
      'laboratory.manage',
      'hospital.read',
      'hospital.manage',
      'notifications.read',
      'notifications.manage',
      'documents.read',
      'documents.print',
      'documents.manage',
    ],
  ],
  [
    'doctor',
    'Врач',
    [
      'dashboard.read',
      'news.read',
      'queue.read',
      'queue.call',
      'queue.manage',
      'appointments.read',
      'tasks.read',
      'tasks.manage',
      'owners.read',
      'owners.manage',
      'animals.read',
      'animals.manage',
      'visits.read',
      'visits.manage',
      'billing.read',
      'laboratory.read',
      'laboratory.manage',
      'hospital.read',
      'hospital.manage',
      'notifications.read',
      'documents.read',
      'documents.print',
      'documents.manage',
    ],
  ],
  [
    'assistant',
    'Ассистент',
    [
      'dashboard.read',
      'news.read',
      'queue.read',
      'appointments.read',
      'tasks.read',
      'owners.read',
      'animals.read',
      'visits.read',
      'laboratory.read',
      'notifications.read',
    ],
  ],
  [
    'cashier',
    'Кассир',
    [
      'dashboard.read',
      'news.read',
      'owners.read',
      'animals.read',
      'billing.read',
      'billing.manage',
      'payments.manage',
      'notifications.read',
      'documents.print',
    ],
  ],
  ['stock', 'Складской сотрудник', ['dashboard.read', 'news.read', 'stock.read', 'stock.manage']],
];

const animalCatalog = [
  {
    code: 'cat',
    title: 'Кошка',
    breeds: [
      'Беспородная',
      'Метис',
      'Британская короткошёрстная',
      'Шотландская вислоухая',
      'Шотландская прямоухая',
      'Мейн-кун',
      'Сфинкс',
      'Бенгальская',
      'Сиамская',
      'Ориентальная',
      'Абиссинская',
      'Русская голубая',
      'Персидская',
      'Экзотическая короткошёрстная',
      'Рэгдолл',
      'Сибирская',
      'Невская маскарадная',
      'Корниш-рекс',
      'Девон-рекс',
      'Курильский бобтейл',
    ],
  },
  {
    code: 'dog',
    title: 'Собака',
    breeds: [
      'Беспородная',
      'Метис',
      'Лабрадор-ретривер',
      'Золотистый ретривер',
      'Немецкая овчарка',
      'Французский бульдог',
      'Английский бульдог',
      'Йоркширский терьер',
      'Джек-рассел-терьер',
      'Чихуахуа',
      'Шпиц',
      'Такса',
      'Мопс',
      'Бигль',
      'Хаски',
      'Маламут',
      'Акита-ину',
      'Сиба-ину',
      'Кане-корсо',
      'Ротвейлер',
      'Доберман',
      'Боксер',
      'Пудель',
      'Мальтийская болонка',
      'Ши-тцу',
      'Корги',
      'Далматин',
      'Алабай',
      'Кавказская овчарка',
      'Русский той',
    ],
  },
  {
    code: 'turtle',
    title: 'Черепаха',
    breeds: [
      'Не указана',
      'Красноухая',
      'Среднеазиатская',
      'Европейская болотная',
      'Трионикс',
      'Мускусная',
      'Угольная',
      'Средиземноморская',
    ],
  },
  {
    code: 'horse',
    title: 'Лошадь',
    breeds: [
      'Не указана',
      'Арабская',
      'Ахалтекинская',
      'Английская чистокровная',
      'Орловский рысак',
      'Русский рысак',
      'Донская',
      'Будённовская',
      'Тракененская',
      'Фризская',
      'Пони',
    ],
  },
  {
    code: 'reptile',
    title: 'Рептилия',
    breeds: [
      'Не указана',
      'Игуана',
      'Бородатая агама',
      'Леопардовый геккон',
      'Хамелеон',
      'Маисовый полоз',
      'Королевский питон',
      'Удав',
      'Варан',
    ],
  },
  {
    code: 'parrot',
    title: 'Попугай',
    breeds: [
      'Не указана',
      'Волнистый попугай',
      'Корелла',
      'Неразлучник',
      'Жако',
      'Ара',
      'Какаду',
      'Амазон',
      'Ожереловый попугай',
    ],
  },
  {
    code: 'bird',
    title: 'Птица',
    breeds: ['Не указана', 'Канарейка', 'Амадина', 'Голубь', 'Курица', 'Утка', 'Гусь', 'Индейка'],
  },
  {
    code: 'rabbit',
    title: 'Кролик',
    breeds: [
      'Не указана',
      'Декоративный',
      'Вислоухий баран',
      'Карликовый',
      'Рекс',
      'Ангорский',
      'Калифорнийский',
      'Новозеландский',
    ],
  },
  {
    code: 'rodent',
    title: 'Грызун',
    breeds: [
      'Не указана',
      'Хомяк',
      'Морская свинка',
      'Крыса',
      'Мышь',
      'Шиншилла',
      'Дегу',
      'Песчанка',
    ],
  },
  {
    code: 'ferret',
    title: 'Хорёк',
    breeds: ['Не указана', 'Домашний хорёк', 'Фретка'],
  },
  {
    code: 'farm',
    title: 'Сельхозживотное',
    breeds: ['Не указана', 'Корова', 'Коза', 'Овца', 'Свинья', 'Осёл', 'Верблюд', 'Лама', 'Альпака'],
  },
  {
    code: 'exotic',
    title: 'Экзотическое животное',
    breeds: ['Не указана', 'Ёж', 'Енот', 'Сурикат', 'Мини-пиг', 'Белка', 'Сахарный поссум'],
  },
];

const medicalPhrases = [
  {
    field: 'visit.exam.anamnesis',
    category: 'Со слов владельца',
    title: 'Без активных жалоб',
    text: 'Со слов владельца активных жалоб на момент приема нет.',
  },
  {
    field: 'visit.exam.anamnesis',
    category: 'Со слов владельца',
    title: 'Аппетит и вода сохранены',
    text: 'Аппетит сохранен. Вода в обычном объеме. Рвоты и диареи не отмечалось.',
  },
  {
    field: 'visit.exam.anamnesis',
    category: 'Со слов владельца',
    title: 'Снижение аппетита',
    text: 'Со слов владельца отмечается снижение аппетита, активность снижена.',
  },
  {
    field: 'visit.exam.anamnesis',
    category: 'Профилактика',
    title: 'Вакцинация по графику',
    text: 'Вакцинация проводится по возрасту. Дегельминтизация по графику.',
  },
  {
    field: 'visit.exam.anamnesis',
    category: 'ЖКТ',
    title: 'Рвота и диарея',
    text: 'Со слов владельца отмечались эпизоды рвоты и жидкого стула.',
  },
  {
    field: 'visit.exam.examination',
    category: 'Общий осмотр',
    title: 'Общее без особенностей',
    text: 'Общее состояние удовлетворительное. Слизистые розовые. Дыхание без хрипов. Живот мягкий, безболезненный.',
  },
  {
    field: 'visit.exam.examination',
    category: 'Слизистые',
    title: 'Слизистые розовые',
    text: 'Видимые слизистые оболочки розовые, влажные, капиллярное наполнение в норме.',
  },
  {
    field: 'visit.exam.examination',
    category: 'Кожа и шерсть',
    title: 'Кожа без повреждений',
    text: 'Кожные покровы без выраженных повреждений. Шерстный покров удовлетворительный.',
  },
  {
    field: 'visit.exam.examination',
    category: 'Кожа и шерсть',
    title: 'Зуд и расчесы',
    text: 'На коже отмечаются расчесы, участки эритемы и зуд по словам владельца.',
  },
  {
    field: 'visit.exam.examination',
    category: 'Живот',
    title: 'Живот мягкий',
    text: 'Живот мягкий, умеренно наполнен, выраженной болезненности при пальпации не выявлено.',
  },
  {
    field: 'visit.exam.examination',
    category: 'Дыхание',
    title: 'Дыхание без хрипов',
    text: 'Дыхание ровное, хрипов и одышки при осмотре не выявлено.',
  },
  {
    field: 'visit.exam.examination',
    category: 'Сердце',
    title: 'Тоны сердца ясные',
    text: 'Тоны сердца ясные, ритм регулярный.',
  },
  {
    field: 'visit.exam.examination',
    category: 'Уши',
    title: 'Наружный отит',
    text: 'В наружном слуховом проходе отмечается загрязнение, гиперемия, болезненность при пальпации.',
  },
  {
    field: 'visit.exam.examination',
    category: 'Глаза',
    title: 'Глаза без выделений',
    text: 'Глаза без выраженных патологических выделений, роговица прозрачная.',
  },
  {
    field: 'visit.exam.examination',
    category: 'Ротовая полость',
    title: 'Зубной камень',
    text: 'В ротовой полости отмечается зубной налет и зубной камень.',
  },
  {
    field: 'visit.exam.symptoms',
    category: 'Общие симптомы',
    title: 'Вялость',
    text: 'Вялость, снижение активности.',
  },
  {
    field: 'visit.exam.symptoms',
    category: 'ЖКТ',
    title: 'Рвота',
    text: 'Рвота.',
  },
  {
    field: 'visit.exam.symptoms',
    category: 'ЖКТ',
    title: 'Диарея',
    text: 'Диарея.',
  },
  {
    field: 'visit.exam.symptoms',
    category: 'Дерматология',
    title: 'Зуд',
    text: 'Зуд, расчесы.',
  },
  {
    field: 'visit.exam.symptoms',
    category: 'Респираторные',
    title: 'Кашель',
    text: 'Кашель.',
  },
  {
    field: 'visit.exam.symptoms',
    category: 'Ортопедия',
    title: 'Хромота',
    text: 'Хромота, болезненность при движении.',
  },
  {
    field: 'visit.exam.manipulations',
    category: 'Осмотр',
    title: 'Клинический осмотр',
    text: 'Проведен клинический осмотр.',
  },
  {
    field: 'visit.exam.manipulations',
    category: 'Осмотр',
    title: 'Термометрия',
    text: 'Проведена термометрия.',
  },
  {
    field: 'visit.exam.manipulations',
    category: 'Инъекции',
    title: 'Подкожная инъекция',
    text: 'Выполнена подкожная инъекция препарата согласно назначению.',
  },
  {
    field: 'visit.exam.manipulations',
    category: 'Инъекции',
    title: 'Внутримышечная инъекция',
    text: 'Выполнена внутримышечная инъекция препарата согласно назначению.',
  },
  {
    field: 'visit.exam.manipulations',
    category: 'Диагностика',
    title: 'Забор крови',
    text: 'Выполнен забор крови для лабораторного исследования.',
  },
  {
    field: 'visit.exam.manipulations',
    category: 'Обработка',
    title: 'Обработка пораженной области',
    text: 'Проведена обработка пораженной области.',
  },
  {
    field: 'visit.exam.manipulations',
    category: 'Вакцинация',
    title: 'Вакцинация',
    text: 'Проведена вакцинация, данные внесены в карту пациента.',
  },
  {
    field: 'visit.recommendation.treatmentPlan',
    category: 'Контроль',
    title: 'Контроль 3 дня',
    text: 'Контроль состояния через 3 дня или раньше при ухудшении.',
  },
  {
    field: 'visit.recommendation.treatmentPlan',
    category: 'Контроль',
    title: 'Повторный прием',
    text: 'Повторный прием по динамике или при ухудшении состояния.',
  },
  {
    field: 'visit.recommendation.treatmentPlan',
    category: 'Диагностика',
    title: 'Контрольные анализы',
    text: 'Рекомендованы контрольные лабораторные исследования по динамике.',
  },
  {
    field: 'visit.recommendation.treatmentPlan',
    category: 'Питание',
    title: 'Диетотерапия',
    text: 'Диетотерапия согласно назначению, смену корма проводить постепенно.',
  },
  {
    field: 'visit.recommendation.careNotes',
    category: 'Владельцу',
    title: 'Вода и покой',
    text: 'Обеспечить доступ к воде и щадящий режим.',
  },
  {
    field: 'visit.recommendation.careNotes',
    category: 'Владельцу',
    title: 'Срочно при ухудшении',
    text: 'При рвоте, отказе от корма, выраженной вялости или ухудшении состояния связаться с клиникой.',
  },
  {
    field: 'visit.recommendation.careNotes',
    category: 'Владельцу',
    title: 'Не отменять препараты',
    text: 'Соблюдать назначения врача и не отменять препараты без согласования.',
  },
  {
    field: 'visit.recommendation.careNotes',
    category: 'Владельцу',
    title: 'Защитный воротник',
    text: 'Использовать защитный воротник, не допускать разлизывания обработанной области.',
  },
  {
    field: 'visit.recommendation.treatmentPlan',
    category: 'Шаблон по диагнозу',
    title: 'Парвовирусный энтерит: план',
    text: 'Инфузионная терапия по состоянию, противорвотная терапия, гастропротекция, контроль глюкозы и электролитов, контроль ОАК/биохимии по динамике.',
    source: 'DIAGNOSIS_TEMPLATE',
    diagnosis: 'парвовирусный энтерит',
    species: 'Собака',
  },
  {
    field: 'visit.recommendation.careNotes',
    category: 'Шаблон по диагнозу',
    title: 'Парвовирусный энтерит: владельцу',
    text: 'Изоляция от других животных, контроль рвоты, стула, аппетита и активности. При ухудшении состояния срочно обратиться в клинику.',
    source: 'DIAGNOSIS_TEMPLATE',
    diagnosis: 'парвовирусный энтерит',
    species: 'Собака',
  },
  {
    field: 'visit.recommendation.treatmentPlan',
    category: 'Шаблон по диагнозу',
    title: 'Панлейкопения: план',
    text: 'Инфузионная терапия по состоянию, противорвотная терапия, гастропротекция, контроль температуры, контроль ОАК/биохимии по динамике.',
    source: 'DIAGNOSIS_TEMPLATE',
    diagnosis: 'панлейкопения',
    species: 'Кошка',
  },
  {
    field: 'visit.recommendation.treatmentPlan',
    category: 'Шаблон по диагнозу',
    title: 'Дерматит: план',
    text: 'Обработка пораженных участков, контроль зуда, исключение паразитарных и аллергических причин, контрольный осмотр по динамике.',
    source: 'DIAGNOSIS_TEMPLATE',
    diagnosis: 'дерматит',
  },
  {
    field: 'visit.recommendation.treatmentPlan',
    category: 'Шаблон по диагнозу',
    title: 'Отит: план',
    text: 'Очистка наружного слухового прохода, местная терапия согласно назначению, контрольный осмотр уха по динамике.',
    source: 'DIAGNOSIS_TEMPLATE',
    diagnosis: 'отит',
  },
  {
    field: 'visit.recommendation.treatmentPlan',
    category: 'Шаблон по диагнозу',
    title: 'Цистит: план',
    text: 'Контроль мочеиспускания, УЗИ мочевыделительной системы по показаниям, общий анализ мочи и коррекция терапии по результатам.',
    source: 'DIAGNOSIS_TEMPLATE',
    diagnosis: 'цистит',
  },
  {
    field: 'visit.recommendation.treatmentPlan',
    category: 'Шаблон по диагнозу',
    title: 'Гастроэнтерит: план',
    text: 'Диетотерапия, контроль рвоты и стула, регидратация по состоянию, контрольный прием при отсутствии положительной динамики.',
    source: 'DIAGNOSIS_TEMPLATE',
    diagnosis: 'гастроэнтерит',
  },
];

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${key}`;
}

function normalizePhoneForLookup(value) {
  const digits = String(value ?? '').replace(/\D/g, '');

  if (!digits) {
    return null;
  }

  let normalized = digits;

  if (digits.length === 10) {
    normalized = `7${digits}`;
  } else if (digits.length === 11 && digits.startsWith('8')) {
    normalized = `7${digits.slice(1)}`;
  }

  if (!/^7\d{10}$/.test(normalized)) {
    throw new Error('Телефон должен быть российским номером в формате +7 XXX XXX XX XX');
  }

  return normalized;
}

function formatNormalizedRussianPhone(value) {
  if (!value) {
    return null;
  }

  return `+7 ${value.slice(1, 4)} ${value.slice(4, 7)} ${value.slice(7, 9)} ${value.slice(9, 11)}`;
}

function hashMedicalPhrase(text) {
  return createHash('sha256').update(text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU')).digest('hex');
}

async function main() {
  const isProduction = process.env.NODE_ENV === 'production';
  const organization = await prisma.organization.upsert({
    where: { id: DEFAULT_ORGANIZATION_ID },
    update: {},
    create: {
      id: DEFAULT_ORGANIZATION_ID,
      displayName: 'Ветеринарная клиника',
      orgType: 'clinic',
      offices: {
        create: {
          id: DEFAULT_OFFICE_ID,
          name: 'Основная клиника',
          timezone: 'Europe/Moscow',
          rooms: {
            create: [
              { name: 'Приемная 1' },
              { name: 'Приемная 2' },
              { name: 'Процедурная' },
              { name: 'Операционная' },
              { name: 'Лаборатория' },
              { name: 'Рентген - УЗИ' },
            ],
          },
          warehouses: {
            create: [{ name: 'Основной склад' }],
          },
          hospitalBoxes: {
            create: [{ name: 'Бокс 1' }, { name: 'Бокс 2' }],
          },
        },
      },
    },
  });

  const paymentMethods = [
    { title: 'Наличные', type: 'CASH', sortOrder: 10 },
    { title: 'Банковская карта', type: 'CARD', sortOrder: 20 },
    { title: 'Перевод на счёт', type: 'BANK_TRANSFER', sortOrder: 30 },
    { title: 'Депозит владельца', type: 'DEPOSIT', sortOrder: 40 },
    { title: 'Другое', type: 'OTHER', sortOrder: 50 },
  ];

  for (const method of paymentMethods) {
    await prisma.paymentMethod.upsert({
      where: { title: method.title },
      update: { type: method.type, sortOrder: method.sortOrder, isActive: true },
      create: method,
    });
  }

  await prisma.cashbox.upsert({
    where: {
      officeId_title: {
        officeId: DEFAULT_OFFICE_ID,
        title: 'Основная касса',
      },
    },
    update: { isActive: true },
    create: {
      officeId: DEFAULT_OFFICE_ID,
      title: 'Основная касса',
    },
  });

  for (const [code, title] of permissions) {
    await prisma.permission.upsert({
      where: { code },
      update: { title },
      create: { code, title },
    });
  }

  for (const [code, title, rolePermissions] of roles) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { title },
      create: { code, title },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

    for (const permissionCode of rolePermissions) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code: permissionCode },
      });

      await prisma.rolePermission.create({
        data: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }
  }

  await prisma.role.deleteMany({
    where: {
      code: 'owner',
      employees: { none: {} },
    },
  });

  await seedAnimalCatalog();
  await seedNotificationTemplates();
  await seedDocumentTemplates();
  await seedMedicalPhrases();
  await seedDirectorEmployee();
  await seedTestingData({ isProduction });

  console.log(`Seeded organization: ${organization.displayName}`);
}

async function seedNotificationTemplates() {
  const templates = [
    {
      channel: 'TELEGRAM',
      eventCode: 'appointment_reminder',
      title: 'Напоминание о записи',
      body: 'Здравствуйте, {owner.fullName}. Напоминаем о записи пациента {animal.nickname} на {appointment.startsAt}.',
    },
    {
      channel: 'TELEGRAM',
      eventCode: 'revaccination_reminder',
      title: 'Напоминание о ревакцинации',
      body: 'Здравствуйте, {owner.fullName}. Пациенту {animal.nickname} пора на ревакцинацию: {vaccination.title}.',
    },
    {
      channel: 'MAX',
      eventCode: 'appointment_reminder',
      title: 'Напоминание о записи',
      body: 'Здравствуйте, {owner.fullName}. Напоминаем о записи пациента {animal.nickname} на {appointment.startsAt}.',
    },
    {
      channel: 'SMS',
      eventCode: 'appointment_reminder',
      title: 'Короткое напоминание о записи',
      body: '{owner.fullName}, запись {animal.nickname}: {appointment.startsAt}. TemichevVet.',
    },
  ];

  for (const template of templates) {
    await prisma.notificationTemplate.upsert({
      where: {
        channel_eventCode: {
          channel: template.channel,
          eventCode: template.eventCode,
        },
      },
      update: {
        title: template.title,
        body: template.body,
        isActive: true,
      },
      create: {
        ...template,
        isActive: true,
      },
    });
  }
}

async function seedDocumentTemplates() {
  const categories = [
    {
      title: 'Приём',
      templates: [
        {
          title: 'Лист первичного приёма',
          body:
            'Пациент: {animal.nickname}\nВладелец: {owner.fullName}\nЖалобы:\n\nАнамнез:\n\nОсмотр:\n\nДиагноз:\n\nРекомендации:\n',
        },
        {
          title: 'Рекомендации после приёма',
          body:
            'Пациент: {animal.nickname}\nДата приёма: {visit.startedAt}\nНазначения и уход:\n\nКонтрольный визит:\n',
        },
      ],
    },
    {
      title: 'Согласия',
      templates: [
        {
          title: 'Согласие на проведение манипуляций',
          body:
            'Я, {owner.fullName}, подтверждаю согласие на проведение ветеринарных манипуляций пациенту {animal.nickname}.\n\nПодпись владельца: ____________',
        },
        {
          title: 'Информированное согласие на стационар',
          body:
            'Я, {owner.fullName}, согласен на размещение пациента {animal.nickname} в стационаре клиники.\n\nПодпись владельца: ____________',
        },
      ],
    },
  ];

  for (const categoryData of categories) {
    const category = await prisma.documentTemplateCategory.upsert({
      where: { title: categoryData.title },
      update: {},
      create: { title: categoryData.title },
    });

    for (const template of categoryData.templates) {
      const existingTemplate = await prisma.documentTemplate.findFirst({
        where: {
          categoryId: category.id,
          title: template.title,
        },
        select: { id: true },
      });

      if (existingTemplate) {
        await prisma.documentTemplate.update({
          where: { id: existingTemplate.id },
          data: {
            body: template.body,
          },
        });
      } else {
        await prisma.documentTemplate.create({
          data: {
            categoryId: category.id,
            title: template.title,
            body: template.body,
          },
        });
      }
    }
  }
}

async function seedMedicalPhrases() {
  for (const phrase of medicalPhrases) {
    const textHash = hashMedicalPhrase(phrase.text);
    const source = phrase.source ?? 'SYSTEM';
    const scopeKey = source === 'DIAGNOSIS_TEMPLATE' ? `diagnosis:${phrase.diagnosis ?? 'common'}` : 'system';

    await prisma.medicalPhrase.upsert({
      where: {
        field_scopeKey_textHash: {
          field: phrase.field,
          scopeKey,
          textHash,
        },
      },
      update: {
        category: phrase.category,
        title: phrase.title,
        text: phrase.text,
        species: phrase.species,
        diagnosis: phrase.diagnosis,
        source,
      },
      create: {
        field: phrase.field,
        category: phrase.category,
        title: phrase.title,
        text: phrase.text,
        textHash,
        species: phrase.species,
        diagnosis: phrase.diagnosis,
        source,
        scopeKey,
      },
    });
  }
}

async function seedAnimalCatalog() {
  for (const [speciesIndex, speciesItem] of animalCatalog.entries()) {
    const species = await prisma.animalSpecies.upsert({
      where: { code: speciesItem.code },
      update: {
        title: speciesItem.title,
        sortOrder: speciesIndex,
      },
      create: {
        code: speciesItem.code,
        title: speciesItem.title,
        sortOrder: speciesIndex,
      },
    });

    for (const [breedIndex, breedTitle] of speciesItem.breeds.entries()) {
      await prisma.animalBreed.upsert({
        where: {
          speciesId_title: {
            speciesId: species.id,
            title: breedTitle,
          },
        },
        update: {
          sortOrder: breedIndex,
        },
        create: {
          speciesId: species.id,
          title: breedTitle,
          sortOrder: breedIndex,
        },
      });
    }
  }
}

async function seedDirectorEmployee() {
  const isProduction = process.env.NODE_ENV === 'production';
  const defaultPassword = 'ChangeMe123!';
  const password = process.env.BOOTSTRAP_DIRECTOR_PASSWORD ?? (isProduction ? undefined : defaultPassword);

  if (!password) {
    console.log('Skipped bootstrap director: BOOTSTRAP_DIRECTOR_PASSWORD is not set');
    return;
  }

  const phoneNormalized = normalizePhoneForLookup(process.env.BOOTSTRAP_DIRECTOR_PHONE ?? '+70000000001');
  const phone = formatNormalizedRussianPhone(phoneNormalized);
  const email = process.env.BOOTSTRAP_DIRECTOR_EMAIL ?? 'director@example.local';
  const resetPassword = process.env.BOOTSTRAP_DIRECTOR_RESET_PASSWORD === 'true';
  const passwordHash = hashPassword(password);
  const directorRole = await prisma.role.findUniqueOrThrow({ where: { code: 'director' } });

  let user = await prisma.user.findFirst({
    where: {
      OR: [{ phone }, { phoneNormalized }, { email }],
    },
    include: { employee: true },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        phone,
        phoneNormalized,
        email,
        passwordHash,
      },
      include: { employee: true },
    });
  } else if (resetPassword) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
      include: { employee: true },
    });
  }

  const employee =
    user.employee ??
    (await prisma.employee.create({
      data: {
        userId: user.id,
        fullName: process.env.BOOTSTRAP_DIRECTOR_NAME ?? 'Директор клиники',
        phone,
        position: 'Директор',
        status: 'ACTIVE',
      },
    }));

  await prisma.employeeRole.upsert({
    where: {
      employeeId_roleId: {
        employeeId: employee.id,
        roleId: directorRole.id,
      },
    },
    update: {},
    create: {
      employeeId: employee.id,
      roleId: directorRole.id,
    },
  });

  console.log(`Seeded director employee: ${employee.fullName}`);
}

async function seedTestingData({ isProduction }) {
  const seedTestData = process.env.SEED_TEST_DATA ?? (isProduction ? 'false' : 'true');

  if (seedTestData !== 'true') {
    console.log('Skipped test seed data: SEED_TEST_DATA is not true');
    return;
  }

  await seedTestEmployees();
  await seedTestServices();

  console.log('Seeded test employees and services');
}

async function seedTestEmployees() {
  const password = process.env.SEED_TEST_PASSWORD ?? 'TestPass123!';
  const testEmployees = [
    {
      phone: '+70000000002',
      email: 'administrator@example.local',
      fullName: 'Тестовый администратор',
      position: 'Администратор',
      roleCode: 'administrator',
    },
    {
      phone: '+70000000003',
      email: 'doctor@example.local',
      fullName: 'Тестовый врач',
      position: 'Врач',
      roleCode: 'doctor',
    },
    {
      phone: '+70000000004',
      email: 'assistant@example.local',
      fullName: 'Тестовый ассистент',
      position: 'Ассистент',
      roleCode: 'assistant',
    },
    {
      phone: '+70000000005',
      email: 'cashier@example.local',
      fullName: 'Тестовый кассир',
      position: 'Кассир',
      roleCode: 'cashier',
    },
    {
      phone: '+70000000006',
      email: 'stock@example.local',
      fullName: 'Тестовый склад',
      position: 'Склад',
      roleCode: 'stock',
    },
  ];

  for (const testEmployee of testEmployees) {
    await seedEmployeeUser({
      ...testEmployee,
      password,
      resetPassword: process.env.SEED_TEST_RESET_PASSWORD === 'true',
      replaceRoles: true,
    });
  }
}

async function seedEmployeeUser({ phone, email, password, fullName, position, roleCode, resetPassword, replaceRoles }) {
  const phoneNormalized = normalizePhoneForLookup(phone);
  const formattedPhone = formatNormalizedRussianPhone(phoneNormalized);
  const passwordHash = hashPassword(password);
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });

  let user = await prisma.user.findFirst({
    where: {
      OR: [{ phone: formattedPhone }, { phoneNormalized }, { email }],
    },
    include: { employee: true },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        phone: formattedPhone,
        phoneNormalized,
        email,
        passwordHash,
      },
      include: { employee: true },
    });
  } else if (resetPassword) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
      include: { employee: true },
    });
  }

  const employee = user.employee
    ? await prisma.employee.update({
        where: { id: user.employee.id },
        data: {
          fullName,
          phone: formattedPhone,
          position,
          status: 'ACTIVE',
        },
      })
    : await prisma.employee.create({
        data: {
          userId: user.id,
          fullName,
          phone: formattedPhone,
          position,
          status: 'ACTIVE',
        },
      });

  if (replaceRoles) {
    await prisma.employeeRole.deleteMany({ where: { employeeId: employee.id } });
  }

  await prisma.employeeRole.upsert({
    where: {
      employeeId_roleId: {
        employeeId: employee.id,
        roleId: role.id,
      },
    },
    update: {},
    create: {
      employeeId: employee.id,
      roleId: role.id,
    },
  });
}

async function seedTestServices() {
  const category = await prisma.serviceCategory.upsert({
    where: { title: 'Тестовые услуги' },
    update: {},
    create: { title: 'Тестовые услуги' },
  });

  const services = [
    { title: 'Первичный прием', price: 1500 },
    { title: 'Повторный прием', price: 1000 },
    { title: 'Инъекция', price: 350 },
  ];

  for (const service of services) {
    const existingService = await prisma.service.findFirst({
      where: { title: service.title },
      select: { id: true },
    });

    if (existingService) {
      await prisma.service.update({
        where: { id: existingService.id },
        data: {
          categoryId: category.id,
          price: service.price,
          priceType: 'FIXED',
        },
      });
    } else {
      await prisma.service.create({
        data: {
          categoryId: category.id,
          title: service.title,
          price: service.price,
          priceType: 'FIXED',
        },
      });
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    void prisma.$disconnect();
  });
