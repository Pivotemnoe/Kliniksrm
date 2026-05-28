const { PrismaClient } = require('@prisma/client');
const { randomBytes, scryptSync } = require('node:crypto');

const prisma = new PrismaClient();

const permissions = [
  ['dashboard.read', 'Просмотр сводки'],
  ['queue.read', 'Просмотр очереди'],
  ['queue.manage', 'Управление очередью'],
  ['appointments.read', 'Просмотр расписания'],
  ['appointments.manage', 'Управление расписанием'],
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
      'queue.read',
      'queue.manage',
      'appointments.read',
      'appointments.manage',
      'owners.read',
      'owners.manage',
      'animals.read',
      'animals.manage',
      'visits.read',
      'visits.manage',
      'billing.read',
      'billing.manage',
      'payments.manage',
      'documents.read',
      'documents.print',
    ],
  ],
  [
    'doctor',
    'Врач',
    [
      'dashboard.read',
      'queue.read',
      'appointments.read',
      'owners.read',
      'animals.read',
      'animals.manage',
      'visits.read',
      'visits.manage',
      'billing.read',
      'documents.read',
      'documents.print',
    ],
  ],
  [
    'assistant',
    'Ассистент',
    ['dashboard.read', 'queue.read', 'appointments.read', 'owners.read', 'animals.read', 'visits.read'],
  ],
  [
    'cashier',
    'Кассир',
    ['dashboard.read', 'owners.read', 'animals.read', 'billing.read', 'billing.manage', 'payments.manage', 'documents.print'],
  ],
  ['stock', 'Складской сотрудник', ['dashboard.read', 'stock.read', 'stock.manage']],
];

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${key}`;
}

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

  await prisma.role.deleteMany({
    where: {
      code: 'owner',
      employees: { none: {} },
    },
  });

  await seedDirectorEmployee();

  console.log(`Seeded organization: ${organization.displayName}`);
}

async function seedDirectorEmployee() {
  const isProduction = process.env.NODE_ENV === 'production';
  const defaultPassword = 'ChangeMe123!';
  const password = process.env.BOOTSTRAP_DIRECTOR_PASSWORD ?? (isProduction ? undefined : defaultPassword);

  if (!password) {
    console.log('Skipped bootstrap director: BOOTSTRAP_DIRECTOR_PASSWORD is not set');
    return;
  }

  const phone = process.env.BOOTSTRAP_DIRECTOR_PHONE ?? '+70000000001';
  const email = process.env.BOOTSTRAP_DIRECTOR_EMAIL ?? 'director@example.local';
  const resetPassword = process.env.BOOTSTRAP_DIRECTOR_RESET_PASSWORD === 'true';
  const passwordHash = hashPassword(password);
  const directorRole = await prisma.role.findUniqueOrThrow({ where: { code: 'director' } });

  let user = await prisma.user.findFirst({
    where: {
      OR: [{ phone }, { email }],
    },
    include: { employee: true },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        phone,
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

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    void prisma.$disconnect();
  });
