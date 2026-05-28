export const seed = {
  user: {
    name: "Темичев Константин Валерьевич",
    role: "Директор",
    clinic: "Ветеринарный центр \"Айболит\"",
    balance: 35157
  },
  offices: [
    { id: "office-1", name: "Ветеринарный центр \"Айболит\"", city: "Армавир", active: true },
    { id: "office-2", name: "Ветеринарная клиника \"Айболит\"", city: "Армавир", active: false }
  ],
  office: {
    name: "Ветеринарный центр \"Айболит\"",
    phonePrimary: "+7 (928) 421-45-42",
    phoneExtra: "",
    expiryNotice: "за 30 дней",
    timezone: "Московское время MSK (UTC+3)",
    address: "Адрес филиала",
    schedule: {
      mode: "круглосуточно",
      nightMode: true,
      nightStart: "20:00",
      nightEnd: "08:00"
    },
    appointmentNotifications: ["за 1 час"],
    vaccinationNotifications: ["за сутки", "за неделю"],
    onlineBookingEnabled: false,
    cashboxes: [],
    laboratories: ["Внутренняя", "Vet Union"],
    voip: ["Mango Office", "Мегафон", "Яндекс.Телефония"]
  },
  employees: [
    {
      id: "emp-1",
      name: "Казарина Елена Владимировна",
      short: "КЕ",
      position: "Врач - терапевт",
      status: "Активный",
      defaultSection: "Расписание",
      visitDuration: "10 минут",
      modules: ["Общее", "Склад", "Настройки"],
      warehouses: ["wh-1"],
      notifications: ["Финансы"]
    },
    {
      id: "emp-2",
      name: "Колесникова Наталья Юрьевна",
      short: "КН",
      position: "Ветеринарный врач",
      status: "Активный",
      defaultSection: "Расписание",
      visitDuration: "10 минут",
      modules: ["Общее", "Склад"],
      warehouses: ["wh-1"],
      notifications: []
    },
    {
      id: "emp-3",
      name: "Сечкина Екатерина Виталиевна",
      short: "СЕ",
      position: "Администратор",
      status: "Активный",
      defaultSection: "Очередь",
      visitDuration: "10 минут",
      modules: ["Общее"],
      warehouses: ["wh-1"],
      notifications: ["Финансы"]
    },
    {
      id: "emp-4",
      name: "Темичев Константин Валерьевич",
      short: "ТК",
      position: "Директор",
      status: "Активный",
      defaultSection: "Расписание",
      visitDuration: "10 минут",
      modules: ["Общее", "Склад", "Настройки"],
      warehouses: ["wh-1"],
      notifications: ["Финансы"]
    }
  ],
  employeeAccess: {
    common: [
      "Новости",
      "Сводка: графики",
      "Сводка: отчёты",
      "Расписание",
      "Онлайн-запись",
      "Календарь задач",
      "Очередь",
      "Владельцы",
      "Пациенты",
      "Счета",
      "Продажи",
      "Стационар",
      "Сообщения"
    ],
    stock: ["Товары", "Услуги", "Учёт: списание", "Учёт: перемещение", "Учёт: удаление", "Печать ценников"],
    settings: [
      "Организация: профиль",
      "Организация: реквизиты",
      "Организация: тарифы и платежи",
      "Филиал: график сотрудников",
      "Филиал: события",
      "Филиал: расходы",
      "Филиал: зарплатные профили",
      "Филиал: телефония",
      "Филиал: лаборатории",
      "Филиал: стационар",
      "Филиал: кабинеты",
      "Филиал: онлайн-кассы",
      "Филиал: склады",
      "Сотрудники",
      "Шаблоны"
    ]
  },
  rooms: [
    { id: "room-1", name: "Приёмная 1" },
    { id: "room-2", name: "Приёмная 2" },
    { id: "room-3", name: "Процедурная" },
    { id: "room-4", name: "Операционная" },
    { id: "room-5", name: "Лаборатория" },
    { id: "room-6", name: "Рентген - УЗИ" }
  ],
  warehouses: [
    { id: "wh-1", title: "Основной склад", employees: 11 },
    { id: "wh-2", title: "Расходный склад", employees: 4 }
  ],
  hospitalBoxes: [
    { id: "box-1", title: "1" },
    { id: "box-2", title: "2" },
    { id: "box-big", title: "Большой" },
    { id: "box-virus-1", title: "Вирусный 1" }
  ],
  owners: [
    {
      id: "owner-1",
      name: "Иванова Анна Сергеевна",
      organization: "",
      phone: "+7 (900) 100-10-10",
      phoneExtra: "",
      address: "Адрес владельца",
      email: "",
      balance: 0,
      deposit: 0,
      discountGoods: 0,
      discountServices: 0,
      source: "Рекомендация",
      registered: "2026-05-20",
      channels: ["Чат", "SMS"]
    },
    {
      id: "owner-2",
      name: "Петров Максим Олегович",
      organization: "",
      phone: "+7 (900) 200-20-20",
      phoneExtra: "",
      address: "Адрес владельца",
      email: "client@example.local",
      balance: 1500,
      deposit: 1500,
      discountGoods: 5,
      discountServices: 0,
      source: "Онлайн-запись",
      registered: "2026-05-21",
      channels: ["Чат", "SMS", "Push"]
    }
  ],
  trustedPeople: [
    { id: "trusted-1", ownerId: "owner-2", name: "Петрова Ольга Игоревна", phone: "+7 (900) 222-22-22" }
  ],
  animals: [
    {
      id: "animal-1",
      ownerId: "owner-1",
      name: "Марта",
      kind: "Кошка",
      breed: "Метис",
      sex: "Самка",
      birthDate: "2024-09-01",
      age: "1 год и 8 месяцев",
      color: "",
      chip: "",
      mark: "",
      weight: "4.2",
      sterilized: true,
      favorite: false,
      status: "Здоров"
    },
    {
      id: "animal-2",
      ownerId: "owner-2",
      name: "Рич",
      kind: "Собака",
      breed: "Корги",
      sex: "Самец",
      birthDate: "2021-03-12",
      age: "5 лет",
      color: "рыжий",
      chip: "",
      mark: "",
      weight: "12.1",
      sterilized: false,
      favorite: true,
      status: "Улучшение"
    }
  ],
  visits: [
    {
      id: "visit-1",
      animalId: "animal-1",
      ownerId: "owner-1",
      status: "Завершён",
      title: "Первичный приём",
      employeeId: "emp-1",
      date: "2026-05-23T10:30:00",
      total: 0,
      reason: "Первичный приём",
      anamnesis: "Жалобы владельца фиксируются в свободном редакторе.",
      exam: "Осмотр, вес, температура, симптомы и диагнозы.",
      manipulations: "Инъекции, обработки и выполненные процедуры.",
      symptoms: "",
      temperature: "",
      diagnoses: [],
      treatmentPlan: "План лечения.",
      careAdvice: "Рекомендации по уходу.",
      recommendation: "Рекомендации и план лечения.",
      documents: [],
      items: []
    }
  ],
  vaccinations: [
    { id: "vac-1", animalId: "animal-1", title: "Рабифел", status: "Действует", expires: "2026-11-22" },
    { id: "vac-2", animalId: "animal-1", title: "Мультифел-4", status: "Действует", expires: "2026-11-22" }
  ],
  timetable: [],
  queue: [],
  tasks: [
    { id: "task-1", title: "Контрольный звонок после приёма", type: "Сотрудник", status: "Текущая", due: "2026-05-24", ownerId: "owner-1", animalId: "animal-1", employeeId: "emp-3" }
  ],
  bills: [
    {
      id: "bill-1",
      visitId: "visit-1",
      ownerId: "owner-2",
      animalId: "animal-2",
      status: "Оплачен",
      date: "2026-05-22",
      total: 1500,
      method: "Безналичный",
      employeeId: "emp-1",
      items: [{ title: "Первичный приём", type: "услуга", quantity: 1, price: 500, discount: 0, total: 500 }],
      payments: [{ date: "2026-05-22T13:32:00", type: "Безналичный", amount: 1500 }]
    }
  ],
  sales: [
    { id: "sale-1", title: "Розничная продажа", sellerId: "emp-3", date: "2026-05-22", total: 900, status: "Оплачен", items: [{ title: "Тест экспресс", quantity: 1, discount: 0, total: 900 }] }
  ],
  goods: [
    {
      id: "good-1",
      title: "Вакцина комплексная",
      group: "Вакцины",
      vat: "Без НДС",
      gtin: "",
      barcodes: [],
      priceType: "Фиксированная цена",
      price: 1200,
      expenseAccounting: "Учитывать",
      shelfLife: "Есть",
      stockUnit: "штука",
      writeOffUnit: "доза",
      packRatio: 10,
      stock: 8,
      min: 3
    },
    {
      id: "good-2",
      title: "Тест экспресс",
      group: "Диагностика",
      vat: "Без НДС",
      gtin: "",
      barcodes: [],
      priceType: "Фиксированная цена",
      price: 850,
      expenseAccounting: "Учитывать",
      shelfLife: "Есть",
      stockUnit: "штука",
      writeOffUnit: "штука",
      packRatio: 1,
      stock: 14,
      min: 5
    }
  ],
  services: [
    { id: "service-1", title: "Первичный приём", group: "Приёмы", price: 500, priceType: "Фиксированная цена", vat: "Без НДС", description: "Описание видно при поиске услуги в приёме", goods: [] },
    { id: "service-2", title: "Повторный приём", group: "Приёмы", price: 300, priceType: "Фиксированная цена", vat: "Без НДС", description: "", goods: [] },
    { id: "service-3", title: "Общий анализ крови", group: "Анализы", price: 700, priceType: "Плавающая цена", vat: "Без НДС", description: "", goods: [{ goodId: "good-2", quantity: 1 }] }
  ],
  supplies: [
    {
      id: "supply-1",
      warehouseId: "wh-1",
      warehouse: "Основной склад",
      title: "Вакцина комплексная",
      supplier: "Поставщик",
      invoice: "5/05-08",
      date: "2026-05-05",
      expires: "2027-07",
      purchasePrice: 1167,
      total: 12000,
      qty: 10,
      rest: 8,
      rack: "",
      shelf: "",
      series: ""
    }
  ],
  supplyInvoices: [
    { id: "inv-1", number: "5/05-08", supplier: "Поставщик", date: "2026-05-05", total: 12000, rows: ["supply-1"] }
  ],
  templates: [
    { id: "tpl-1", title: "Бланк осмотра", type: "Текстовый", target: "Приём: Осмотр", category: "Приём", updated: "2026-05-21", body: "Текстовый шаблон редактора осмотра." },
    { id: "tpl-2", title: "Согласие на обработку персональных данных", type: "Текстовый", target: "Документы для клиентов", category: "Документы для клиентов", updated: "2026-05-20", body: "Документ с переменными клиента и организации." },
    { id: "tpl-3", title: "Уведомление о вакцинации", type: "Уведомление", target: "SMS/Push/Telegram/Max/WhatsApp", category: "Вакцинация", updated: "2026-05-19", body: "{{Animal.nick}}, напоминаем о вакцинации." }
  ],
  notificationVariables: [
    "Название организации",
    "Тип организации",
    "Название филиала",
    "Адрес",
    "Телефон",
    "ФИО владельца",
    "Кличка",
    "Дата приёма",
    "Время приёма"
  ],
  hospitalPatients: [
    { id: "hp-1", animalId: "animal-2", boxId: "box-1", from: "2026-02-10", status: "Здоров", todayAssignments: [] }
  ],
  logs: [
    { id: "log-1", employeeId: "emp-4", event: "создал(а) продажу [тестовая пустая продажа]", date: "2026-05-23T17:11:00" },
    { id: "log-2", employeeId: "emp-1", event: "создал(а) приём пациента", date: "2026-05-23T15:40:00" }
  ],
  expenses: [],
  wageProfiles: [],
  news: [
    { id: "news-1", date: "2026-05-20", title: "Проверка чеков и маркировки", tags: ["ОФД", "Касса"], text: "Новостная лента для внутренних уведомлений клиники." },
    { id: "news-2", date: "2026-05-19", title: "Обновление интерфейса CRM", tags: ["Интерфейс", "Склады"], text: "Здесь будут релизы, инструкции и важные объявления." }
  ],
  onlineRequests: []
};
