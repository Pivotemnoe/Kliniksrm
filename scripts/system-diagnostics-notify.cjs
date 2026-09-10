// Runs through stdin in the existing API container; no Nest boot, jobs or schema changes.
async function publishDiagnostic(prisma, report) {
  if (!report?.event || !/^[a-f0-9-]{36}$/.test(report.event.id) || !['ok','warning'].includes(report.state)) throw new Error('Invalid diagnostic event');
  const id = report.event.id;
  const recovery = report.event.recovery === true;
  const issues = recovery ? report.event.previousIssues : report.issues;
  if (!Array.isArray(issues) || issues.length > 40 || issues.some(i => typeof i.message !== 'string' || i.message.length > 500)) throw new Error('Invalid diagnostic issues');
  const body = [
    `Проверка TECNO: ${report.checkedAt}.`,
    recovery ? 'Ранее обнаруженные проблемы больше не выявляются:' : 'Требуется проверка:',
    ...issues.map(i => `• ${i.message}`),
    `Подтверждённая версия: ${String(report.expectedRevision).slice(0,7)}.`,
    'Самодиагностика ничего не перезапускала и не меняла клинические данные.',
    'Подробный отчёт: папка diagnostics на сервере TECNO.',
  ].join('\n');
  return prisma.$transaction(async tx => {
    if (await tx.newsPost.findUnique({ where: { id }, select: { id: true } })) return { duplicate: true };
    await tx.newsPost.create({ data: { id, title: recovery ? 'Самодиагностика CRM: работа восстановлена' : 'Самодиагностика CRM: требуется проверка', body, audienceRoleCodes: ['director'], priority: recovery ? 'INFO' : 'IMPORTANT', isPinned: false } });
    await tx.auditLog.create({ data: { action: 'system.diagnostics.notification', entityType: 'NewsPost', entityId: id, metadata: { recovery, issueCodes: issues.map(i => i.code), checkedAt: report.checkedAt } } });
    return { published: true };
  });
}
if (typeof diagnosticPayload !== 'undefined') {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const timeout = setTimeout(() => { console.error('Notification timed out'); process.exit(1); }, 40000);
  publishDiagnostic(prisma, diagnosticPayload).then(() => console.log('NOTIFICATION_OK')).catch(() => { console.error('Notification failed'); process.exitCode = 1; }).finally(async () => { clearTimeout(timeout); await prisma.$disconnect(); });
} else { module.exports = { publishDiagnostic }; }
