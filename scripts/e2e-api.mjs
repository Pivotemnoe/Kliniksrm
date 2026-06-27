#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const baseUrl = process.env.APP_BASE_URL ?? 'http://127.0.0.1:4000';
const e2eMarker = 'e2e-smoke';
const fakeId = '00000000-0000-0000-0000-00000000e2e0';
const testPassword = process.env.SEED_TEST_PASSWORD ?? 'TestPass123!';
const queueAcceptDelayMs = 10_000;

const users = {
  director: { login: '+70000000001', password: process.env.BOOTSTRAP_DIRECTOR_PASSWORD ?? 'ChangeMe123!' },
  administrator: { login: '+70000000002', password: testPassword },
  doctor: { login: '+70000000003', password: testPassword },
  assistant: { login: '+70000000004', password: testPassword },
  cashier: { login: '+70000000005', password: testPassword },
  stock: { login: '+70000000006', password: testPassword },
};

const permissionsByRole = {
  director: new Set(['*']),
  administrator: new Set([
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
  ]),
  doctor: new Set([
    'dashboard.read',
    'news.read',
    'queue.read',
    'queue.call',
    'queue.manage',
    'appointments.read',
    'tasks.read',
    'tasks.manage',
    'owners.read',
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
  ]),
  assistant: new Set([
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
  ]),
  cashier: new Set([
    'dashboard.read',
    'news.read',
    'owners.read',
    'animals.read',
    'billing.read',
    'billing.manage',
    'payments.manage',
    'stock.read',
    'notifications.read',
    'documents.print',
  ]),
  stock: new Set(['dashboard.read', 'news.read', 'stock.read', 'stock.manage']),
};

const sessions = {};
const cleanupEnabled = process.env.E2E_CLEANUP !== 'false';

async function main() {
  await cleanupE2eData();
  await waitForApi();
  await loginAllRoles();

  await scenarioPasswordChange();
  await assertProtectedEndpointsRequireAuth();
  await assertRbacMatrix();
  await runStatusFlows();
  await runNotificationArchitectureFlow();
  await runDocumentFlow();
  await runRequestedE2eScenarios();
  await assertAuditLog();

  if (cleanupEnabled) {
    await cleanupE2eData();
  }

  console.log('E2E API checks passed');
}

async function waitForApi() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 30_000) {
    try {
      const health = await request(null, 'GET', '/api/health');
      assertEqual(health.status, 'ok', 'health status');
      return;
    } catch {
      await delay(500);
    }
  }

  throw new Error(`API did not become healthy at ${baseUrl}`);
}

async function loginAllRoles() {
  for (const [role, credentials] of Object.entries(users)) {
    sessions[role] = await login(credentials.login, credentials.password);
  }
}

async function login(loginValue, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login: loginValue, password }),
  });

  const body = await parseBody(response);

  if (!response.ok) {
    throw new Error(
      `Login failed for ${loginValue}. Run docker compose up -d api with SEED_TEST_DATA=true. Response: ${response.status} ${JSON.stringify(body)}`,
    );
  }

  const setCookie = response.headers.get('set-cookie');
  const cookie = setCookie?.split(';')[0];

  if (!cookie) {
    throw new Error(`Login did not return session cookie for ${loginValue}`);
  }

  return { cookie, employee: body.employee };
}

async function rawLoginStatus(loginValue, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login: loginValue, password }),
  });

  return response.status;
}

async function scenarioPasswordChange() {
  const originalPassword = users.director.password;
  const temporaryPassword = `E2ePass${randomDigits(6)}!`;
  let changed = false;

  const wrongPasswordResponse = await rawRequest('director', 'PATCH', '/api/auth/password', {
    currentPassword: 'wrong-password',
    newPassword: temporaryPassword,
  });
  assertEqual(wrongPasswordResponse.status, 400, 'password change wrong current password');

  try {
    const changeResponse = await rawRequest('director', 'PATCH', '/api/auth/password', {
      currentPassword: originalPassword,
      newPassword: temporaryPassword,
    });
    assertEqual(changeResponse.status, 200, 'password change status');
    changed = true;

    const oldLoginStatus = await rawLoginStatus(users.director.login, originalPassword);
    assertEqual(oldLoginStatus, 401, 'old password rejected');

    sessions.director = await login(users.director.login, temporaryPassword);
  } finally {
    if (changed) {
      const revertResponse = await rawRequest('director', 'PATCH', '/api/auth/password', {
        currentPassword: temporaryPassword,
        newPassword: originalPassword,
      });
      assertEqual(revertResponse.status, 200, 'password change revert status');
      sessions.director = await login(users.director.login, originalPassword);
    }
  }
}

async function assertProtectedEndpointsRequireAuth() {
  for (const endpoint of rbacEndpoints) {
    const response = await rawRequest(null, endpoint.method, endpoint.path, endpoint.body);
    assertEqual(response.status, 401, `no-auth ${endpoint.method} ${endpoint.path}`);
  }
}

async function assertRbacMatrix() {
  for (const endpoint of rbacEndpoints) {
    for (const role of Object.keys(users)) {
      const response = await rawRequest(role, endpoint.method, endpoint.path, endpoint.body);
      const allowed = isRoleAllowed(role, endpoint.permissions);

      if (allowed && (response.status === 401 || response.status === 403 || response.status >= 500)) {
        throw new Error(`${role} should pass RBAC for ${endpoint.method} ${endpoint.path}, got ${response.status}`);
      }

      if (!allowed && response.status !== 403) {
        throw new Error(`${role} should be forbidden for ${endpoint.method} ${endpoint.path}, got ${response.status}`);
      }
    }
  }
}

async function runStatusFlows() {
  await runQueueStatusFlow();
  await runAppointmentStatusFlow();
  await runVisitStatusFlow();
  await runTaskStatusFlow();
  await runVaccinationRevaccinationTaskFlow();
  await runBillStatusFlow();
}

async function runQueueStatusFlow() {
  const queueEntry = await createQueueEntry('Status Queue');
  const updatedQueueEntry = await request('administrator', 'PATCH', `/api/v1/queue/${queueEntry.id}`, {
    comment: `${e2eMarker} queue updated`,
  });
  assertEqual(updatedQueueEntry.comment, `${e2eMarker} queue updated`, 'queue update');

  const startedQueueEntry = await request('administrator', 'POST', `/api/v1/queue/${queueEntry.id}/start`);
  assertEqual(startedQueueEntry.status, 'IN_PROGRESS', 'queue start status');
  assertEqual(startedQueueEntry.callCount, 1, 'queue first call count');

  const repeatedQueueEntry = await request('administrator', 'POST', `/api/v1/queue/${queueEntry.id}/start`);
  assertEqual(repeatedQueueEntry.status, 'IN_PROGRESS', 'queue repeat call status');
  assertEqual(repeatedQueueEntry.callCount, 2, 'queue repeat call count');

  const earlyComplete = await rawRequest('administrator', 'POST', `/api/v1/queue/${queueEntry.id}/complete`);
  assertEqual(earlyComplete.status, 400, 'queue early complete status');

  await delay(queueAcceptDelayMs + 300);

  const completedQueueEntry = await request('administrator', 'POST', `/api/v1/queue/${queueEntry.id}/complete`);
  assertEqual(completedQueueEntry.status, 'COMPLETED', 'queue complete status');
}

async function runAppointmentStatusFlow() {
  const { owner, animal } = await createOwnerAnimal('Status Appointment');
  const appointment = await createAppointment(owner.id, animal.id, '2026-06-03T09:00:00.000Z', 'status-flow');

  const updatedAppointment = await request('administrator', 'PATCH', `/api/v1/appointments/${appointment.id}`, {
    comment: `${e2eMarker} appointment updated`,
  });
  assertEqual(updatedAppointment.comment, `${e2eMarker} appointment updated`, 'appointment update');

  const arrivedAppointment = await request('administrator', 'POST', `/api/v1/appointments/${appointment.id}/arrive`);
  assertEqual(arrivedAppointment.status, 'ARRIVED', 'appointment arrived status');

  const startedAppointment = await request('administrator', 'POST', `/api/v1/appointments/${appointment.id}/start`);
  assertEqual(startedAppointment.status, 'IN_PROGRESS', 'appointment start status');

  const completedAppointment = await request('administrator', 'POST', `/api/v1/appointments/${appointment.id}/complete`);
  assertEqual(completedAppointment.status, 'COMPLETED', 'appointment complete status');
}

async function runVisitStatusFlow() {
  const { owner, animal } = await createOwnerAnimal('Status Visit');
  const visit = await request('doctor', 'POST', '/api/v1/visits', { ownerId: owner.id, animalId: animal.id });
  assertEqual(visit.status, 'IN_PROGRESS', 'visit create status');

  const updatedVisit = await request('doctor', 'PATCH', `/api/v1/visits/${visit.id}`, { status: 'IN_PROGRESS' });
  assertEqual(updatedVisit.status, 'IN_PROGRESS', 'visit update status');

  const completedVisit = await request('doctor', 'POST', `/api/v1/visits/${visit.id}/complete`);
  assertEqual(completedVisit.status, 'COMPLETED', 'visit complete status');

  const cancellableVisit = await request('doctor', 'POST', '/api/v1/visits', { ownerId: owner.id, animalId: animal.id });
  const cancelledVisit = await request('doctor', 'POST', `/api/v1/visits/${cancellableVisit.id}/cancel`);
  assertEqual(cancelledVisit.status, 'CANCELLED', 'visit cancel status');
}

async function runTaskStatusFlow() {
  const { owner, animal } = await createOwnerAnimal('Status Task');
  const task = await request('administrator', 'POST', '/api/v1/tasks', {
    ownerId: owner.id,
    animalId: animal.id,
    assigneeRoleCode: 'doctor',
    taskType: 'follow_up',
    title: `${e2eMarker} status task`,
    comment: e2eMarker,
    dueAt: '2026-06-06T09:00:00.000Z',
  });
  assertEqual(task.status, 'OPEN', 'task create status');
  assertEqual(task.assigneeRoleCode, 'doctor', 'task role assignment');

  const updatedTask = await request('administrator', 'PATCH', `/api/v1/tasks/${task.id}`, {
    comment: `${e2eMarker} task updated`,
  });
  assertEqual(updatedTask.comment, `${e2eMarker} task updated`, 'task update');

  const completedTask = await request('doctor', 'POST', `/api/v1/tasks/${task.id}/done`);
  assertEqual(completedTask.status, 'DONE', 'task done status');

  const reopenedTask = await request('doctor', 'POST', `/api/v1/tasks/${task.id}/reopen`);
  assertEqual(reopenedTask.status, 'OPEN', 'task reopen status');

  const cancelledTask = await request('doctor', 'POST', `/api/v1/tasks/${task.id}/cancel`);
  assertEqual(cancelledTask.status, 'CANCELLED', 'task cancel status');

  const archivedTask = await request('doctor', 'POST', `/api/v1/tasks/${task.id}/archive`);
  assertEqual(archivedTask.status, 'ARCHIVED', 'task archive status');
}

async function runVaccinationRevaccinationTaskFlow() {
  const { animal } = await createOwnerAnimal('Vaccination Task');
  const vaccination = await request('doctor', 'POST', `/api/v1/animals/${animal.id}/vaccinations`, {
    title: `${e2eMarker} Nobivac`,
    status: 'Плановая',
    vaccinatedAt: '2026-06-04',
    expiresAt: '2027-06-04',
    vaccineBatch: `${e2eMarker}-batch`,
    vaccineSeries: 'A1',
    vaccineExpiresAt: '2027-12-31',
    smsReminder: true,
    notes: e2eMarker,
    createRevaccinationTask: true,
    revaccinationAssigneeRoleCode: 'doctor',
  });

  if (!vaccination.revaccinationTask) {
    throw new Error('revaccination task was not created');
  }
  assertEqual(vaccination.revaccinationTask.status, 'OPEN', 'revaccination task created');
  assertEqual(vaccination.revaccinationTask.assigneeRoleCode, 'doctor', 'revaccination task role');

  const updatedVaccination = await request('doctor', 'PATCH', `/api/v1/animals/${animal.id}/vaccinations/${vaccination.id}`, {
    expiresAt: '2027-07-04',
    vaccineSeries: 'A2',
    createRevaccinationTask: true,
    revaccinationAssigneeRoleCode: 'assistant',
  });
  assertEqual(updatedVaccination.revaccinationTask.id, vaccination.revaccinationTask.id, 'revaccination task reused');
  assertEqual(updatedVaccination.revaccinationTask.assigneeRoleCode, 'assistant', 'revaccination task role updated');

  const listedTasks = await request('doctor', 'GET', `/api/v1/tasks?animalId=${animal.id}&search=${encodeURIComponent(e2eMarker)}`);
  if (!listedTasks.items.some((task) => task.id === vaccination.revaccinationTask.id)) {
    throw new Error('revaccination task is missing from task list');
  }

  const clearedVaccination = await request('doctor', 'PATCH', `/api/v1/animals/${animal.id}/vaccinations/${vaccination.id}`, {
    expiresAt: null,
    createRevaccinationTask: false,
  });
  assertEqual(clearedVaccination.revaccinationTask.status, 'CANCELLED', 'revaccination task cancelled after date clear');
}

async function runNotificationArchitectureFlow() {
  const { owner, animal } = await createOwnerAnimal('Notifications');
  const updatedOwner = await request('administrator', 'PATCH', `/api/v1/owners/${owner.id}`, {
    preferredNotificationChannel: 'TELEGRAM',
    telegramChatId: `${e2eMarker}-telegram-chat`,
    allowTelegram: true,
    allowSms: false,
    allowEmail: true,
  });
  assertEqual(updatedOwner.preferredNotificationChannel, 'TELEGRAM', 'owner preferred notification channel');
  assertEqual(updatedOwner.allowTelegram, true, 'owner telegram allowed');

  const template = await request('administrator', 'POST', '/api/v1/notifications/templates', {
    channel: 'TELEGRAM',
    eventCode: `${e2eMarker}-appointment`,
    title: `${e2eMarker} appointment template`,
    body: `${e2eMarker} Уведомление для {owner.fullName}`,
    isActive: true,
  });
  assertEqual(template.eventCode, `${e2eMarker}-appointment`, 'notification template upsert');

  const queued = await request('administrator', 'POST', '/api/v1/notifications/outbox', {
    ownerId: owner.id,
    animalId: animal.id,
    templateId: template.id,
    channel: 'TELEGRAM',
    recipient: `${e2eMarker}-telegram-chat`,
    body: `${e2eMarker} test message`,
  });
  assertEqual(queued.status, 'QUEUED', 'notification queued');

  const listed = await request('administrator', 'GET', `/api/v1/notifications/outbox?ownerId=${owner.id}`);
  if (!listed.items.some((item) => item.id === queued.id)) {
    throw new Error('queued notification missing from outbox');
  }

  const retried = await request('administrator', 'POST', `/api/v1/notifications/outbox/${queued.id}/retry`);
  assertEqual(retried.status, 'QUEUED', 'notification retry');

  const cancelled = await request('administrator', 'POST', `/api/v1/notifications/outbox/${queued.id}/cancel`);
  assertEqual(cancelled.status, 'CANCELLED', 'notification cancel');

  const portalAccess = await request('administrator', 'PATCH', `/api/v1/notifications/owners/${owner.id}/portal-access`, {
    status: 'INVITED',
  });
  assertEqual(portalAccess.status, 'INVITED', 'portal invited');
  if (!portalAccess.inviteToken) {
    throw new Error('portal invite token was not returned');
  }
}

async function runDocumentFlow() {
  const { owner, animal } = await createOwnerAnimal('Documents');
  const visit = await request('doctor', 'POST', '/api/v1/visits', { ownerId: owner.id, animalId: animal.id });
  const template = await request('doctor', 'POST', '/api/v1/document-templates', {
    title: `${e2eMarker} document template`,
    categoryTitle: `${e2eMarker} documents`,
    body: `${e2eMarker} Документ для {owner.fullName} и {animal.nickname}`,
  });
  assertEqual(template.title, `${e2eMarker} document template`, 'document template create');

  const templates = await request('doctor', 'GET', '/api/v1/document-templates');
  if (!templates.some((item) => item.id === template.id)) {
    throw new Error('document template missing from list');
  }

  const visitDocument = await request('doctor', 'POST', `/api/v1/visits/${visit.id}/documents`, {
    templateId: template.id,
  });
  assertEqual(visitDocument.title, template.title, 'visit document title from template');
  assertEqual(visitDocument.status, 'DRAFT', 'visit document draft status');

  const updatedDocument = await request('doctor', 'PATCH', `/api/v1/visits/${visit.id}/documents/${visitDocument.id}`, {
    body: `${e2eMarker} document updated`,
    status: 'GENERATED',
  });
  assertEqual(updatedDocument.status, 'GENERATED', 'visit document update status');

  const documents = await request('doctor', 'GET', `/api/v1/visits/${visit.id}/documents`);
  if (!documents.some((item) => item.id === visitDocument.id)) {
    throw new Error('visit document missing from list');
  }
}

async function runBillStatusFlow() {
  const { owner, animal } = await createOwnerAnimal('Status Bill');
  const bill = await request('cashier', 'POST', '/api/v1/bills', { ownerId: owner.id, animalId: animal.id });
  assertEqual(bill.status, 'UNPAID', 'manual bill status');

  await request('cashier', 'POST', `/api/v1/bills/${bill.id}/items`, {
    title: `${e2eMarker} bill status item`,
    quantity: 2,
    unitPrice: 500,
  });

  let billCard = await request('cashier', 'GET', `/api/v1/bills/${bill.id}`);
  assertEqual(billCard.status, 'UNPAID', 'bill unpaid status');
  assertEqual(Number(billCard.totalAmount), 1000, 'bill total after item');

  await request('cashier', 'POST', `/api/v1/bills/${bill.id}/payments`, {
    type: 'CARD',
    amount: 400,
    comment: `${e2eMarker} partial payment`,
  });
  billCard = await request('cashier', 'GET', `/api/v1/bills/${bill.id}`);
  assertEqual(billCard.status, 'PARTIAL', 'bill partial status');

  await request('cashier', 'POST', `/api/v1/bills/${bill.id}/payments`, {
    type: 'CASH',
    amount: 600,
    comment: `${e2eMarker} final payment`,
  });
  billCard = await request('cashier', 'GET', `/api/v1/bills/${bill.id}`);
  assertEqual(billCard.status, 'PAID', 'bill paid status');
}

async function runRequestedE2eScenarios() {
  await scenarioQueueToPayment();
  await scenarioAppointmentToQueue();
  await scenarioAppointmentPartialAndFinalPayment();
  await scenarioCancelQueue();
  await scenarioCancelAppointment();
  await scenarioRefund();
  await scenarioManualBillWithoutVisit();
  await scenarioManualBillProductStockWriteOff();
  await scenarioLaboratoryWorkflow();
}

async function scenarioAppointmentToQueue() {
  const { owner, animal } = await createOwnerAnimal('Appointment Queue');
  const appointment = await createAppointment(owner.id, animal.id, '2026-06-04T12:00:00.000Z', 'appointment-to-queue');
  const arrivedAppointment = await request('administrator', 'POST', `/api/v1/appointments/${appointment.id}/arrive`);
  assertEqual(arrivedAppointment.status, 'ARRIVED', 'appointment queue arrived');

  const queueEntry = await createQueueEntry('Appointment Queue', owner.id, animal.id);
  assertEqual(queueEntry.ownerId, owner.id, 'appointment queue owner');
  assertEqual(queueEntry.animalId, animal.id, 'appointment queue animal');

  const cancelledQueueEntry = await request('administrator', 'POST', `/api/v1/queue/${queueEntry.id}/cancel`);
  assertEqual(cancelledQueueEntry.status, 'CANCELLED', 'appointment queue cancelled');
}

async function scenarioQueueToPayment() {
  const { owner, animal } = await createOwnerAnimal('Queue Payment');
  const queueEntry = await createQueueEntry('Queue Payment', owner.id, animal.id);
  const visit = await request('doctor', 'POST', '/api/v1/visits', { queueEntryId: queueEntry.id });

  await request('doctor', 'PUT', `/api/v1/visits/${visit.id}/exam`, {
    purpose: `${e2eMarker} queue visit`,
    examination: `${e2eMarker} queue exam`,
    weightKg: 5.5,
  });

  await request('doctor', 'POST', `/api/v1/visits/${visit.id}/services`, {
    title: `${e2eMarker} queue service`,
    quantity: 1,
    unitPrice: 1200,
  });

  const visitCard = await request('doctor', 'POST', `/api/v1/visits/${visit.id}/complete`);
  assertEqual(visitCard.status, 'COMPLETED', 'queue visit completed');

  const bill = await request('cashier', 'GET', `/api/v1/bills/${visit.bill.id}`);
  await request('cashier', 'POST', `/api/v1/bills/${bill.id}/payments`, {
    type: 'CARD',
    amount: Number(bill.totalAmount),
    comment: `${e2eMarker} queue payment`,
  });

  const paidBill = await request('cashier', 'GET', `/api/v1/bills/${bill.id}`);
  assertEqual(paidBill.status, 'PAID', 'queue bill paid');
}

async function scenarioAppointmentPartialAndFinalPayment() {
  const { owner, animal } = await createOwnerAnimal('Appointment Payment');
  const appointment = await createAppointment(owner.id, animal.id, '2026-06-04T10:00:00.000Z', 'appointment-payment');
  const arrivedAppointment = await request('administrator', 'POST', `/api/v1/appointments/${appointment.id}/arrive`);
  assertEqual(arrivedAppointment.status, 'ARRIVED', 'appointment arrived');

  const visit = await request('doctor', 'POST', '/api/v1/visits', { appointmentId: appointment.id });
  await request('doctor', 'POST', `/api/v1/visits/${visit.id}/services`, {
    title: `${e2eMarker} appointment service`,
    quantity: 1,
    unitPrice: 1800,
  });

  await request('cashier', 'POST', `/api/v1/bills/${visit.bill.id}/payments`, {
    type: 'CARD',
    amount: 800,
    comment: `${e2eMarker} appointment partial`,
  });
  let bill = await request('cashier', 'GET', `/api/v1/bills/${visit.bill.id}`);
  assertEqual(bill.status, 'PARTIAL', 'appointment partial payment');

  await request('cashier', 'POST', `/api/v1/bills/${visit.bill.id}/payments`, {
    type: 'CASH',
    amount: 1000,
    comment: `${e2eMarker} appointment final`,
  });
  bill = await request('cashier', 'GET', `/api/v1/bills/${visit.bill.id}`);
  assertEqual(bill.status, 'PAID', 'appointment full payment');
}

async function scenarioCancelQueue() {
  const queueEntry = await createQueueEntry('Cancel Queue');
  const cancelledQueueEntry = await request('administrator', 'POST', `/api/v1/queue/${queueEntry.id}/cancel`);
  assertEqual(cancelledQueueEntry.status, 'CANCELLED', 'queue cancelled');
}

async function scenarioCancelAppointment() {
  const { owner, animal } = await createOwnerAnimal('Cancel Appointment');
  const appointment = await createAppointment(owner.id, animal.id, '2026-06-05T11:00:00.000Z', 'cancel-appointment');
  const cancelledAppointment = await request('administrator', 'POST', `/api/v1/appointments/${appointment.id}/cancel`);
  assertEqual(cancelledAppointment.status, 'CANCELLED', 'appointment cancelled');
}

async function scenarioRefund() {
  const { owner, animal } = await createOwnerAnimal('Refund');
  const bill = await request('cashier', 'POST', '/api/v1/bills', { ownerId: owner.id, animalId: animal.id });
  await request('cashier', 'POST', `/api/v1/bills/${bill.id}/items`, {
    title: `${e2eMarker} refund item`,
    quantity: 1,
    unitPrice: 900,
  });

  const payment = await request('cashier', 'POST', `/api/v1/bills/${bill.id}/payments`, {
    type: 'CARD',
    amount: 900,
    comment: `${e2eMarker} refund source payment`,
  });

  const refund = await request('cashier', 'POST', `/api/v1/bills/${bill.id}/payments/${payment.id}/refund`, {
    amount: 300,
    comment: `${e2eMarker} refund`,
  });
  assertEqual(Number(refund.amount), -300, 'refund negative payment');

  const refundedBill = await request('cashier', 'GET', `/api/v1/bills/${bill.id}`);
  assertEqual(refundedBill.status, 'PARTIAL', 'refund bill status');
}

async function scenarioManualBillWithoutVisit() {
  const { owner } = await createOwnerAnimal('Manual Bill');
  const bill = await request('cashier', 'POST', '/api/v1/bills', { ownerId: owner.id });
  assertEqual(bill.source, 'MANUAL', 'manual bill source');
  assertEqual(bill.visitId, null, 'manual bill without visit');

  await request('cashier', 'POST', `/api/v1/bills/${bill.id}/items`, {
    title: `${e2eMarker} manual bill item`,
    quantity: 1,
    unitPrice: 500,
  });

  const cancelledBill = await request('cashier', 'POST', `/api/v1/bills/${bill.id}/cancel`);
  assertEqual(cancelledBill.status, 'CANCELLED', 'manual bill cancel');

  const reopenedBill = await request('cashier', 'POST', `/api/v1/bills/${bill.id}/reopen`);
  assertEqual(reopenedBill.status, 'UNPAID', 'manual bill reopen');
}

async function scenarioManualBillProductStockWriteOff() {
  const { owner } = await createOwnerAnimal('Bill Stock');
  const product = await createStockProductWithSupply('Bill Stock', 5);
  const initialProductCard = await request('stock', 'GET', `/api/v1/stock/products/${product.id}`);
  assertEqual(Number(initialProductCard.stockRest), 5, 'stock product initial rest');

  const bill = await request('cashier', 'POST', '/api/v1/bills', { ownerId: owner.id });
  const billItem = await request('cashier', 'POST', `/api/v1/bills/${bill.id}/items`, {
    productId: product.id,
    quantity: 2,
    unitPrice: 125,
  });

  let productCard = await request('stock', 'GET', `/api/v1/stock/products/${product.id}`);
  assertEqual(Number(productCard.stockRest), 3, 'stock rest after bill product');

  let billCard = await request('cashier', 'GET', `/api/v1/bills/${bill.id}`);
  const itemFromBill = billCard.items.find((item) => item.id === billItem.id);
  if (!itemFromBill?.stockMovements?.length) {
    throw new Error('bill product item has no stock movements');
  }

  await request('cashier', 'POST', `/api/v1/bills/${bill.id}/cancel`);
  productCard = await request('stock', 'GET', `/api/v1/stock/products/${product.id}`);
  assertEqual(Number(productCard.stockRest), 5, 'stock rest after bill cancel');

  await request('cashier', 'POST', `/api/v1/bills/${bill.id}/reopen`);
  productCard = await request('stock', 'GET', `/api/v1/stock/products/${product.id}`);
  assertEqual(Number(productCard.stockRest), 3, 'stock rest after bill reopen');

  await request('cashier', 'PATCH', `/api/v1/bills/${bill.id}/items/${billItem.id}`, {
    quantity: 1,
  });
  productCard = await request('stock', 'GET', `/api/v1/stock/products/${product.id}`);
  assertEqual(Number(productCard.stockRest), 4, 'stock rest after bill product decrease');

  await request('cashier', 'DELETE', `/api/v1/bills/${bill.id}/items/${billItem.id}`);
  productCard = await request('stock', 'GET', `/api/v1/stock/products/${product.id}`);
  assertEqual(Number(productCard.stockRest), 5, 'stock rest after bill product delete');
}

async function scenarioLaboratoryWorkflow() {
  const test = await request('doctor', 'POST', '/api/v1/laboratory/tests', {
    title: `${e2eMarker} laboratory glucose`,
    code: `${e2eMarker}-LAB-${randomDigits(6)}`,
    groupName: `${e2eMarker} biochemistry`,
    material: 'Кровь',
    method: 'Экспресс',
    unit: 'ммоль/л',
    referenceRange: '3.3-6.1',
    species: ['Кошка'],
    isActive: true,
    description: `${e2eMarker} laboratory test`,
  });
  assertEqual(test.title, `${e2eMarker} laboratory glucose`, 'laboratory test create');

  const testsList = await request('assistant', 'GET', `/api/v1/laboratory/tests?search=${encodeURIComponent(test.code)}`);
  if (!testsList.items.some((item) => item.id === test.id)) {
    throw new Error('laboratory test missing from catalog');
  }

  const { owner, animal } = await createOwnerAnimal('Laboratory');
  const visit = await request('doctor', 'POST', '/api/v1/visits', { ownerId: owner.id, animalId: animal.id });
  const visitWithOrder = await request('doctor', 'POST', `/api/v1/visits/${visit.id}/laboratory-orders`, {
    testIds: [test.id],
    comment: `${e2eMarker} laboratory order`,
  });
  const order = visitWithOrder.laboratoryOrders.find((candidate) => candidate.comment === `${e2eMarker} laboratory order`);

  if (!order) {
    throw new Error('laboratory order was not created from visit');
  }

  const item = order.items.find((candidate) => candidate.testId === test.id);
  if (!item) {
    throw new Error('laboratory order item was not created from test');
  }

  let activeOrders = await request('assistant', 'GET', `/api/v1/laboratory/orders?activeOnly=true&search=${encodeURIComponent(e2eMarker)}`);
  if (!activeOrders.items.some((candidate) => candidate.id === order.id)) {
    throw new Error('laboratory order missing from active journal');
  }

  const inProgressItem = await request('doctor', 'PATCH', `/api/v1/laboratory/orders/${order.id}/items/${item.id}`, {
    status: 'IN_PROGRESS',
    resultValue: '5.2',
    comment: `${e2eMarker} first result`,
  });
  assertEqual(inProgressItem.status, 'IN_PROGRESS', 'laboratory item in progress');
  assertEqual(inProgressItem.resultValue, '5.2', 'laboratory result value');

  const inProgressOrders = await request('assistant', 'GET', `/api/v1/laboratory/orders?status=IN_PROGRESS&search=${encodeURIComponent(e2eMarker)}`);
  if (!inProgressOrders.items.some((candidate) => candidate.id === order.id)) {
    throw new Error('laboratory order did not move to IN_PROGRESS');
  }

  const completedOrder = await request('doctor', 'PATCH', `/api/v1/laboratory/orders/${order.id}`, {
    status: 'COMPLETED',
  });
  assertEqual(completedOrder.status, 'COMPLETED', 'laboratory order completed');
  if (!completedOrder.items.every((candidate) => candidate.status === 'COMPLETED')) {
    throw new Error('laboratory order quick complete did not complete every item');
  }

  const today = toDateInput(new Date());
  const completedToday = await request(
    'assistant',
    'GET',
    `/api/v1/laboratory/orders?status=COMPLETED&from=${today}&to=${today}&search=${encodeURIComponent(e2eMarker)}`,
  );
  if (!completedToday.items.some((candidate) => candidate.id === order.id)) {
    throw new Error('laboratory order missing from completed-today journal');
  }

  const dashboard = await request('assistant', 'GET', `/api/v1/dashboard/today?date=${today}`);
  if (dashboard.laboratory.completedToday < 1) {
    throw new Error('dashboard laboratory completed counter did not update');
  }
}

async function assertAuditLog() {
  const logs = await request('director', 'GET', '/api/v1/audit-logs');
  const actions = new Set(logs.map((log) => log.action));
  const requiredActions = [
    'auth.login',
    'auth.password_change',
    'owner.create',
    'owner.update',
    'animal.create',
    'animal.update',
    'vaccination.create',
    'vaccination.update',
    'queue.create',
    'queue.update',
    'queue.start',
    'queue.call',
    'queue.complete',
    'queue.cancel',
    'task.create',
    'task.update',
    'task.done',
    'task.reopen',
    'task.cancel',
    'task.archive',
    'notification.queue',
    'notification.retry',
    'notification.cancel',
    'notification_template.upsert',
    'client_portal.access_update',
    'document_template.create',
    'appointment.create',
    'appointment.update',
    'appointment.arrive',
    'appointment.start',
    'appointment.complete',
    'appointment.cancel',
    'visit.create',
    'visit.update',
    'visit.complete',
    'visit.cancel',
    'visit_exam.upsert',
    'visit_service.add',
    'visit_document.create',
    'visit_document.update',
    'bill.create',
    'bill_item.create',
    'payment.create',
    'payment.refund',
  ];

  for (const action of requiredActions) {
    if (!actions.has(action)) {
      throw new Error(`Audit log missing action: ${action}`);
    }
  }
}

async function createOwnerAnimal(label) {
  const owner = await request('administrator', 'POST', '/api/v1/owners', {
    fullName: `${e2eMarker} ${label} Owner`,
    phone: `+7999${randomDigits(7)}`,
    comment: e2eMarker,
  });

  const updatedOwner = await request('administrator', 'PATCH', `/api/v1/owners/${owner.id}`, {
    comment: `${e2eMarker} owner updated`,
  });
  assertEqual(updatedOwner.comment, `${e2eMarker} owner updated`, 'owner update');

  const animal = await request('administrator', 'POST', `/api/v1/owners/${owner.id}/animals`, {
    nickname: `${e2eMarker} ${label} Animal`,
    species: 'Кошка',
    breed: 'Беспородная',
    sex: 'UNKNOWN',
    comment: e2eMarker,
  });

  const updatedAnimal = await request('doctor', 'PATCH', `/api/v1/animals/${animal.id}`, {
    comment: `${e2eMarker} animal updated`,
  });
  assertEqual(updatedAnimal.comment, `${e2eMarker} animal updated`, 'animal update');

  return { owner, animal: updatedAnimal };
}

async function createQueueEntry(label, ownerId, animalId) {
  return request('administrator', 'POST', '/api/v1/queue', {
    ownerId,
    animalId,
    ownerName: ownerId ? undefined : `${e2eMarker} ${label} Primary`,
    phone: ownerId ? undefined : `+7888${randomDigits(7)}`,
    animalNickname: ownerId ? undefined : `${e2eMarker} ${label} Animal`,
    animalSpecies: ownerId ? undefined : 'Кошка',
    animalBreed: ownerId ? undefined : 'Беспородная',
    animalSex: ownerId ? undefined : 'UNKNOWN',
    urgency: 'PLANNED',
    comment: e2eMarker,
  });
}

async function createAppointment(ownerId, animalId, startsAt, label) {
  return request('administrator', 'POST', '/api/v1/appointments', {
    ownerId,
    animalId,
    startsAt,
    comment: `${e2eMarker} ${label}`,
  });
}

async function createStockProductWithSupply(label, quantity) {
  const product = await request('stock', 'POST', '/api/v1/stock/products', {
    title: `${e2eMarker} ${label} product`,
    categoryTitle: `${e2eMarker} products`,
    retailPrice: 125,
    stockUnit: 'шт',
    minStock: 1,
  });
  const resources = await request('stock', 'GET', '/api/v1/stock/resources');
  const warehouseId = resources.warehouses[0]?.id;

  if (!warehouseId) {
    throw new Error('No warehouse available for stock e2e scenario');
  }

  await request('stock', 'POST', '/api/v1/stock/supply-invoices', {
    supplierTitle: `${e2eMarker} supplier`,
    number: `${e2eMarker}-${randomDigits(8)}`,
    items: [
      {
        productId: product.id,
        warehouseId,
        quantity,
        purchasePrice: 50,
        series: `${e2eMarker}-${label}`,
      },
    ],
  });

  return product;
}

async function cleanupE2eData() {
  const sql = `
    BEGIN;
    CREATE TEMP TABLE e2e_ids (id text);
    INSERT INTO e2e_ids SELECT id FROM "Owner" WHERE "fullName" LIKE '${e2eMarker}%' OR comment LIKE '${e2eMarker}%';
    INSERT INTO e2e_ids SELECT id FROM "Animal" WHERE nickname LIKE '${e2eMarker}%' OR comment LIKE '${e2eMarker}%';
    INSERT INTO e2e_ids SELECT id FROM "Vaccination" WHERE "animalId" IN (SELECT id FROM e2e_ids) OR title LIKE '${e2eMarker}%' OR notes LIKE '${e2eMarker}%';
    INSERT INTO e2e_ids SELECT id FROM "NotificationTemplate" WHERE title LIKE '${e2eMarker}%' OR body LIKE '${e2eMarker}%';
    INSERT INTO e2e_ids SELECT id FROM "NotificationOutbox" WHERE "ownerId" IN (SELECT id FROM e2e_ids) OR "animalId" IN (SELECT id FROM e2e_ids) OR body LIKE '${e2eMarker}%' OR recipient LIKE '${e2eMarker}%';
    INSERT INTO e2e_ids SELECT id FROM "ClientPortalAccess" WHERE "ownerId" IN (SELECT id FROM e2e_ids);
    INSERT INTO e2e_ids SELECT id FROM "DocumentTemplateCategory" WHERE title LIKE '${e2eMarker}%';
    INSERT INTO e2e_ids SELECT id FROM "DocumentTemplate" WHERE title LIKE '${e2eMarker}%' OR body LIKE '${e2eMarker}%';
    INSERT INTO e2e_ids SELECT id FROM "QueueEntry" WHERE "ownerName" LIKE '${e2eMarker}%' OR comment LIKE '${e2eMarker}%';
    INSERT INTO e2e_ids SELECT id FROM "Appointment" WHERE comment LIKE '${e2eMarker}%';
    INSERT INTO e2e_ids SELECT id FROM "Task" WHERE title LIKE '${e2eMarker}%' OR comment LIKE '${e2eMarker}%';
    INSERT INTO e2e_ids SELECT id FROM "Visit" WHERE "ownerId" IN (SELECT id FROM e2e_ids) OR "animalId" IN (SELECT id FROM e2e_ids);
    INSERT INTO e2e_ids SELECT id FROM "LaboratoryTest" WHERE title LIKE '${e2eMarker}%' OR code LIKE '${e2eMarker}%' OR description LIKE '${e2eMarker}%';
    INSERT INTO e2e_ids SELECT id FROM "LaboratoryProfile" WHERE title LIKE '${e2eMarker}%' OR code LIKE '${e2eMarker}%' OR description LIKE '${e2eMarker}%';
    INSERT INTO e2e_ids SELECT id FROM "LaboratoryOrder" WHERE "visitId" IN (SELECT id FROM e2e_ids) OR comment LIKE '${e2eMarker}%';
    INSERT INTO e2e_ids SELECT id FROM "LaboratoryOrderItem" WHERE "orderId" IN (SELECT id FROM e2e_ids) OR "testId" IN (SELECT id FROM e2e_ids) OR "profileId" IN (SELECT id FROM e2e_ids) OR title LIKE '${e2eMarker}%' OR comment LIKE '${e2eMarker}%';
    INSERT INTO e2e_ids SELECT id FROM "VisitDocument" WHERE "visitId" IN (SELECT id FROM e2e_ids) OR "templateId" IN (SELECT id FROM e2e_ids) OR title LIKE '${e2eMarker}%' OR body LIKE '${e2eMarker}%';
    INSERT INTO e2e_ids SELECT id FROM "Bill" WHERE "visitId" IN (SELECT id FROM e2e_ids) OR "ownerId" IN (SELECT id FROM e2e_ids) OR "animalId" IN (SELECT id FROM e2e_ids);
    INSERT INTO e2e_ids SELECT id FROM "BillItem" WHERE title LIKE '${e2eMarker}%' OR "billId" IN (SELECT id FROM e2e_ids);
    INSERT INTO e2e_ids SELECT id FROM "Payment" WHERE "billId" IN (SELECT id FROM e2e_ids) OR comment LIKE '${e2eMarker}%';
    INSERT INTO e2e_ids SELECT id FROM "VisitDiagnosis" WHERE title LIKE '${e2eMarker}%' OR "visitId" IN (SELECT id FROM e2e_ids);
    INSERT INTO e2e_ids SELECT id FROM "ProductCategory" WHERE title LIKE '${e2eMarker}%';
    INSERT INTO e2e_ids SELECT id FROM "Product" WHERE title LIKE '${e2eMarker}%' OR "categoryId" IN (SELECT id FROM e2e_ids);
    INSERT INTO e2e_ids SELECT id FROM "Supplier" WHERE title LIKE '${e2eMarker}%';
    INSERT INTO e2e_ids SELECT id FROM "SupplyInvoice" WHERE number LIKE '${e2eMarker}%' OR "supplierId" IN (SELECT id FROM e2e_ids);
    INSERT INTO e2e_ids SELECT id FROM "SupplyInvoiceItem" WHERE "supplyInvoiceId" IN (SELECT id FROM e2e_ids) OR "productId" IN (SELECT id FROM e2e_ids);
    INSERT INTO e2e_ids SELECT id FROM "StockBatch" WHERE "productId" IN (SELECT id FROM e2e_ids) OR "supplierId" IN (SELECT id FROM e2e_ids);
    INSERT INTO e2e_ids SELECT id FROM "StockMovement" WHERE "productId" IN (SELECT id FROM e2e_ids) OR "billItemId" IN (SELECT id FROM e2e_ids) OR comment LIKE '%${e2eMarker}%';
    DELETE FROM "AuditLog" WHERE "entityId" IN (SELECT id FROM e2e_ids) OR metadata::text LIKE '%${e2eMarker}%';
    DELETE FROM "StockMovement" WHERE id IN (SELECT id FROM e2e_ids) OR "productId" IN (SELECT id FROM e2e_ids) OR "billItemId" IN (SELECT id FROM e2e_ids);
    DELETE FROM "Payment" WHERE id IN (SELECT id FROM e2e_ids) OR "billId" IN (SELECT id FROM e2e_ids);
    DELETE FROM "BillItem" WHERE id IN (SELECT id FROM e2e_ids) OR "billId" IN (SELECT id FROM e2e_ids);
    DELETE FROM "Bill" WHERE id IN (SELECT id FROM e2e_ids);
    DELETE FROM "LaboratoryOrderItem" WHERE id IN (SELECT id FROM e2e_ids) OR "orderId" IN (SELECT id FROM e2e_ids) OR "testId" IN (SELECT id FROM e2e_ids) OR "profileId" IN (SELECT id FROM e2e_ids);
    DELETE FROM "LaboratoryOrder" WHERE id IN (SELECT id FROM e2e_ids) OR "visitId" IN (SELECT id FROM e2e_ids);
    DELETE FROM "LaboratoryProfileTest" WHERE "profileId" IN (SELECT id FROM e2e_ids) OR "testId" IN (SELECT id FROM e2e_ids);
    DELETE FROM "LaboratoryProfile" WHERE id IN (SELECT id FROM e2e_ids);
    DELETE FROM "LaboratoryTest" WHERE id IN (SELECT id FROM e2e_ids);
    DELETE FROM "SupplyInvoiceItem" WHERE id IN (SELECT id FROM e2e_ids) OR "supplyInvoiceId" IN (SELECT id FROM e2e_ids) OR "productId" IN (SELECT id FROM e2e_ids);
    DELETE FROM "StockBatch" WHERE id IN (SELECT id FROM e2e_ids) OR "productId" IN (SELECT id FROM e2e_ids) OR "supplierId" IN (SELECT id FROM e2e_ids);
    DELETE FROM "SupplyInvoice" WHERE id IN (SELECT id FROM e2e_ids) OR "supplierId" IN (SELECT id FROM e2e_ids);
    DELETE FROM "Product" WHERE id IN (SELECT id FROM e2e_ids) OR "categoryId" IN (SELECT id FROM e2e_ids);
    DELETE FROM "ProductCategory" WHERE id IN (SELECT id FROM e2e_ids);
    DELETE FROM "Supplier" WHERE id IN (SELECT id FROM e2e_ids);
    DELETE FROM "VisitDocument" WHERE id IN (SELECT id FROM e2e_ids) OR "visitId" IN (SELECT id FROM e2e_ids) OR "templateId" IN (SELECT id FROM e2e_ids);
    DELETE FROM "Visit" WHERE id IN (SELECT id FROM e2e_ids);
    DELETE FROM "Task" WHERE id IN (SELECT id FROM e2e_ids) OR "ownerId" IN (SELECT id FROM e2e_ids) OR "animalId" IN (SELECT id FROM e2e_ids);
    DELETE FROM "NotificationOutbox" WHERE id IN (SELECT id FROM e2e_ids) OR "ownerId" IN (SELECT id FROM e2e_ids) OR "animalId" IN (SELECT id FROM e2e_ids);
    DELETE FROM "ClientPortalAccess" WHERE id IN (SELECT id FROM e2e_ids) OR "ownerId" IN (SELECT id FROM e2e_ids);
    DELETE FROM "NotificationTemplate" WHERE id IN (SELECT id FROM e2e_ids);
    DELETE FROM "DocumentTemplate" WHERE id IN (SELECT id FROM e2e_ids);
    DELETE FROM "DocumentTemplateCategory" WHERE id IN (SELECT id FROM e2e_ids);
    DELETE FROM "Vaccination" WHERE id IN (SELECT id FROM e2e_ids) OR "animalId" IN (SELECT id FROM e2e_ids);
    DELETE FROM "Appointment" WHERE id IN (SELECT id FROM e2e_ids);
    DELETE FROM "QueueEntry" WHERE id IN (SELECT id FROM e2e_ids);
    DELETE FROM "Owner" WHERE id IN (SELECT id FROM e2e_ids);
    COMMIT;
  `;

  execFileSync('docker', [
    'exec',
    'clinic-crm-postgres',
    'psql',
    '-U',
    process.env.POSTGRES_USER ?? 'clinic_crm',
    '-d',
    process.env.POSTGRES_DB ?? 'clinic_crm',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ]);
}

async function request(role, method, path, body) {
  const response = await rawRequest(role, method, path, body);
  const parsedBody = response.body;

  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${JSON.stringify(parsedBody)}`);
  }

  return parsedBody;
}

async function rawRequest(role, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(role ? { cookie: sessions[role].cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  return {
    ok: response.ok,
    status: response.status,
    body: await parseBody(response),
  };
}

async function parseBody(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isRoleAllowed(role, requiredPermissions) {
  const rolePermissions = permissionsByRole[role];

  if (rolePermissions.has('*')) {
    return true;
  }

  return requiredPermissions.every((permission) => rolePermissions.has(permission));
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function randomDigits(length) {
  let value = '';

  for (let index = 0; index < length; index += 1) {
    value += Math.floor(Math.random() * 10);
  }

  return value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDateInput(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const rbacEndpoints = [
  { method: 'GET', path: '/api/auth/me', permissions: [] },
  { method: 'PATCH', path: '/api/auth/password', permissions: [], body: {} },
  { method: 'GET', path: '/api/v1/meta', permissions: [] },
  { method: 'GET', path: '/api/v1/audit-logs', permissions: ['audit.read'] },
  { method: 'GET', path: '/api/v1/employees', permissions: ['employees.read'] },
  { method: 'POST', path: '/api/v1/employees', permissions: ['employees.manage', 'roles.manage'], body: {} },
  { method: 'GET', path: `/api/v1/employees/${fakeId}`, permissions: ['employees.read'] },
  { method: 'PATCH', path: `/api/v1/employees/${fakeId}`, permissions: ['employees.manage', 'roles.manage'], body: {} },
  { method: 'GET', path: '/api/v1/roles', permissions: ['employees.read'] },
  { method: 'GET', path: '/api/v1/tasks', permissions: ['tasks.read'] },
  { method: 'POST', path: '/api/v1/tasks', permissions: ['tasks.manage'], body: {} },
  { method: 'GET', path: `/api/v1/tasks/${fakeId}`, permissions: ['tasks.read'] },
  { method: 'PATCH', path: `/api/v1/tasks/${fakeId}`, permissions: ['tasks.manage'], body: {} },
  { method: 'POST', path: `/api/v1/tasks/${fakeId}/done`, permissions: ['tasks.manage'] },
  { method: 'POST', path: `/api/v1/tasks/${fakeId}/cancel`, permissions: ['tasks.manage'] },
  { method: 'POST', path: `/api/v1/tasks/${fakeId}/reopen`, permissions: ['tasks.manage'] },
  { method: 'POST', path: `/api/v1/tasks/${fakeId}/archive`, permissions: ['tasks.manage'] },
  { method: 'GET', path: '/api/v1/notifications/outbox', permissions: ['notifications.read'] },
  { method: 'POST', path: '/api/v1/notifications/outbox', permissions: ['notifications.manage'], body: {} },
  { method: 'POST', path: `/api/v1/notifications/outbox/${fakeId}/retry`, permissions: ['notifications.manage'] },
  { method: 'POST', path: `/api/v1/notifications/outbox/${fakeId}/cancel`, permissions: ['notifications.manage'] },
  { method: 'GET', path: '/api/v1/notifications/templates', permissions: ['notifications.read'] },
  { method: 'POST', path: '/api/v1/notifications/templates', permissions: ['notifications.manage'], body: {} },
  { method: 'GET', path: `/api/v1/notifications/owners/${fakeId}/portal-access`, permissions: ['owners.read'] },
  { method: 'PATCH', path: `/api/v1/notifications/owners/${fakeId}/portal-access`, permissions: ['notifications.manage'], body: {} },
  { method: 'GET', path: '/api/v1/document-templates', permissions: ['documents.read'] },
  { method: 'POST', path: '/api/v1/document-templates', permissions: ['documents.manage'], body: {} },
  { method: 'GET', path: '/api/v1/owners', permissions: ['owners.read'] },
  { method: 'POST', path: '/api/v1/owners', permissions: ['owners.manage'], body: {} },
  { method: 'GET', path: `/api/v1/owners/${fakeId}`, permissions: ['owners.read'] },
  { method: 'PATCH', path: `/api/v1/owners/${fakeId}`, permissions: ['owners.manage'], body: {} },
  { method: 'GET', path: `/api/v1/owners/${fakeId}/animals`, permissions: ['animals.read'] },
  { method: 'POST', path: `/api/v1/owners/${fakeId}/animals`, permissions: ['animals.manage'], body: {} },
  { method: 'GET', path: `/api/v1/owners/${fakeId}/trusted-people`, permissions: ['owners.read'] },
  { method: 'POST', path: `/api/v1/owners/${fakeId}/trusted-people`, permissions: ['owners.manage'], body: {} },
  { method: 'PATCH', path: `/api/v1/owners/${fakeId}/trusted-people/${fakeId}`, permissions: ['owners.manage'], body: {} },
  { method: 'GET', path: '/api/v1/animals', permissions: ['animals.read'] },
  { method: 'GET', path: `/api/v1/animals/${fakeId}`, permissions: ['animals.read'] },
  { method: 'PATCH', path: `/api/v1/animals/${fakeId}`, permissions: ['animals.manage'], body: {} },
  { method: 'GET', path: `/api/v1/animals/${fakeId}/weights`, permissions: ['animals.read'] },
  { method: 'POST', path: `/api/v1/animals/${fakeId}/weights`, permissions: ['animals.manage'], body: {} },
  { method: 'GET', path: `/api/v1/animals/${fakeId}/vaccinations`, permissions: ['animals.read'] },
  { method: 'POST', path: `/api/v1/animals/${fakeId}/vaccinations`, permissions: ['animals.manage'], body: {} },
  { method: 'PATCH', path: `/api/v1/animals/${fakeId}/vaccinations/${fakeId}`, permissions: ['animals.manage'], body: {} },
  { method: 'GET', path: '/api/v1/scheduling/resources', permissions: ['appointments.read'] },
  { method: 'GET', path: '/api/v1/queue', permissions: ['queue.read'] },
  { method: 'POST', path: '/api/v1/queue', permissions: ['queue.manage'], body: {} },
  { method: 'GET', path: `/api/v1/queue/${fakeId}`, permissions: ['queue.read'] },
  { method: 'PATCH', path: `/api/v1/queue/${fakeId}`, permissions: ['queue.manage'], body: {} },
  { method: 'POST', path: `/api/v1/queue/${fakeId}/start`, permissions: ['queue.manage'] },
  { method: 'POST', path: `/api/v1/queue/${fakeId}/complete`, permissions: ['queue.manage'] },
  { method: 'POST', path: `/api/v1/queue/${fakeId}/cancel`, permissions: ['queue.manage'] },
  { method: 'GET', path: '/api/v1/appointments', permissions: ['appointments.read'] },
  { method: 'POST', path: '/api/v1/appointments', permissions: ['appointments.manage'], body: {} },
  { method: 'GET', path: `/api/v1/appointments/${fakeId}`, permissions: ['appointments.read'] },
  { method: 'PATCH', path: `/api/v1/appointments/${fakeId}`, permissions: ['appointments.manage'], body: {} },
  { method: 'POST', path: `/api/v1/appointments/${fakeId}/arrive`, permissions: ['appointments.manage'] },
  { method: 'POST', path: `/api/v1/appointments/${fakeId}/start`, permissions: ['appointments.manage'] },
  { method: 'POST', path: `/api/v1/appointments/${fakeId}/complete`, permissions: ['appointments.manage'] },
  { method: 'POST', path: `/api/v1/appointments/${fakeId}/cancel`, permissions: ['appointments.manage'] },
  { method: 'GET', path: '/api/v1/visits', permissions: ['visits.read'] },
  { method: 'POST', path: '/api/v1/visits', permissions: ['visits.manage'], body: {} },
  { method: 'GET', path: `/api/v1/visits/${fakeId}`, permissions: ['visits.read'] },
  { method: 'PATCH', path: `/api/v1/visits/${fakeId}`, permissions: ['visits.manage'], body: {} },
  { method: 'POST', path: `/api/v1/visits/${fakeId}/start`, permissions: ['visits.manage'] },
  { method: 'POST', path: `/api/v1/visits/${fakeId}/complete`, permissions: ['visits.manage'] },
  { method: 'POST', path: `/api/v1/visits/${fakeId}/cancel`, permissions: ['visits.manage'] },
  { method: 'PUT', path: `/api/v1/visits/${fakeId}/exam`, permissions: ['visits.manage'], body: {} },
  { method: 'PUT', path: `/api/v1/visits/${fakeId}/recommendation`, permissions: ['visits.manage'], body: {} },
  { method: 'POST', path: `/api/v1/visits/${fakeId}/diagnoses`, permissions: ['visits.manage'], body: {} },
  { method: 'PATCH', path: `/api/v1/visits/${fakeId}/diagnoses/${fakeId}`, permissions: ['visits.manage'], body: {} },
  { method: 'DELETE', path: `/api/v1/visits/${fakeId}/diagnoses/${fakeId}`, permissions: ['visits.manage'] },
  { method: 'POST', path: `/api/v1/visits/${fakeId}/services`, permissions: ['visits.manage'], body: {} },
  { method: 'PATCH', path: `/api/v1/visits/${fakeId}/services/${fakeId}`, permissions: ['visits.manage'], body: {} },
  { method: 'DELETE', path: `/api/v1/visits/${fakeId}/services/${fakeId}`, permissions: ['visits.manage'] },
  { method: 'GET', path: `/api/v1/visits/${fakeId}/documents`, permissions: ['documents.read'] },
  { method: 'POST', path: `/api/v1/visits/${fakeId}/documents`, permissions: ['documents.manage'], body: {} },
  { method: 'PATCH', path: `/api/v1/visits/${fakeId}/documents/${fakeId}`, permissions: ['documents.manage'], body: {} },
  { method: 'GET', path: '/api/v1/laboratory/resources', permissions: ['laboratory.read'] },
  { method: 'GET', path: '/api/v1/laboratory/orders', permissions: ['laboratory.read'] },
  { method: 'PATCH', path: `/api/v1/laboratory/orders/${fakeId}`, permissions: ['laboratory.manage'], body: {} },
  { method: 'PATCH', path: `/api/v1/laboratory/orders/${fakeId}/items/${fakeId}`, permissions: ['laboratory.manage'], body: {} },
  { method: 'GET', path: '/api/v1/laboratory/tests', permissions: ['laboratory.read'] },
  { method: 'POST', path: '/api/v1/laboratory/tests', permissions: ['laboratory.manage'], body: {} },
  { method: 'PATCH', path: `/api/v1/laboratory/tests/${fakeId}`, permissions: ['laboratory.manage'], body: {} },
  { method: 'GET', path: '/api/v1/laboratory/profiles', permissions: ['laboratory.read'] },
  { method: 'POST', path: '/api/v1/laboratory/profiles', permissions: ['laboratory.manage'], body: {} },
  { method: 'PATCH', path: `/api/v1/laboratory/profiles/${fakeId}`, permissions: ['laboratory.manage'], body: {} },
  { method: 'GET', path: '/api/v1/bills', permissions: ['billing.read'] },
  { method: 'POST', path: '/api/v1/bills', permissions: ['billing.manage'], body: {} },
  { method: 'GET', path: `/api/v1/bills/${fakeId}`, permissions: ['billing.read'] },
  { method: 'POST', path: `/api/v1/bills/${fakeId}/cancel`, permissions: ['billing.manage'] },
  { method: 'POST', path: `/api/v1/bills/${fakeId}/reopen`, permissions: ['billing.manage'] },
  { method: 'POST', path: `/api/v1/bills/${fakeId}/items`, permissions: ['billing.manage'], body: {} },
  { method: 'PATCH', path: `/api/v1/bills/${fakeId}/items/${fakeId}`, permissions: ['billing.manage'], body: {} },
  { method: 'DELETE', path: `/api/v1/bills/${fakeId}/items/${fakeId}`, permissions: ['billing.manage'] },
  { method: 'GET', path: `/api/v1/bills/${fakeId}/payments`, permissions: ['billing.read'] },
  { method: 'POST', path: `/api/v1/bills/${fakeId}/payments`, permissions: ['payments.manage'], body: {} },
  { method: 'POST', path: `/api/v1/bills/${fakeId}/payments/${fakeId}/refund`, permissions: ['payments.manage'], body: {} },
];

main().catch(async (error) => {
  console.error(error);

  if (cleanupEnabled) {
    try {
      await cleanupE2eData();
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError);
    }
  }

  process.exitCode = 1;
});
