const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const permissions = [
  ['dashboard.read', 'Просмотр сводки'],
  ['queue.manage', 'Управление очередью'],
  ['appointments.manage', 'Управление расписанием'],
  ['owners.manage', 'Управление владельцами'],
  ['animals.manage', 'Управление пациентами'],
  ['visits.manage', 'Проведение приемов'],
  ['billing.manage', 'Счета и оплаты'],
  ['stock.manage', 'Склад'],
  ['documents.manage', 'Документы и шаблоны'],
  ['settings.manage', 'Настройки клиники'],
  ['employees.manage', 'Сотрудники и доступы'],
  ['audit.read', 'Просмотр журнала действий'],
  ['backups.manage', 'Резервные копии'],
];

const roles = [
  ['owner', 'Владелец', permissions.map(([code]) => code)],
  [
    'administrator',
    'Администратор клиники',
    [
      'dashboard.read',
      'queue.manage',
      'appointments.manage',
      'owners.manage',
      'animals.manage',
      'billing.manage',
      'documents.manage',
    ],
  ],
  [
    'doctor',
    'Врач',
    ['dashboard.read', 'queue.manage', 'appointments.manage', 'owners.manage', 'animals.manage', 'visits.manage', 'documents.manage'],
  ],
  ['assistant', 'Ассистент', ['dashboard.read', 'queue.manage', 'animals.manage', 'visits.manage']],
  ['cashier', 'Кассир', ['dashboard.read', 'billing.manage', 'owners.manage']],
  ['stock', 'Складской сотрудник', ['dashboard.read', 'stock.manage']],
];

async function main() {
  const organization = await prisma.organization.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      displayName: 'Ветеринарная клиника',
      orgType: 'clinic',
      offices: {
        create: {
          id: '00000000-0000-0000-0000-000000000101',
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

  console.log(`Seeded organization: ${organization.displayName}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    void prisma.$disconnect();
  });
