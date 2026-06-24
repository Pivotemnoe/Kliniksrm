import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/utils/date';
import { exportAuditReport, listAuditLogs } from './audit.api';
import { AuditLogItem } from './types';

export function AuditLogsPage() {
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canReadAudit = hasPermission(auth?.employee, 'audit.read');
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<string>();
  const [entityType, setEntityType] = useState<string>();
  const auditQuery = useQuery({
    queryKey: ['audit-logs'],
    queryFn: listAuditLogs,
    enabled: canReadAudit,
  });
  const items = auditQuery.data ?? [];
  const actionOptions = useMemo(() => buildOptions(items.map((item) => item.action)), [items]);
  const entityOptions = useMemo(() => buildOptions(items.map((item) => item.entityType)), [items]);
  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (action && item.action !== action) {
          return false;
        }

        if (entityType && item.entityType !== entityType) {
          return false;
        }

        const needle = search.trim().toLowerCase();
        if (!needle) {
          return true;
        }

        return getSearchText(item).includes(needle);
      }),
    [action, entityType, items, search],
  );

  const columns = useMemo<ColumnsType<AuditLogItem>>(
    () => [
      {
        title: 'Дата',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 180,
        render: formatDateTime,
      },
      {
        title: 'Сотрудник',
        key: 'actor',
        width: 220,
        render: (_, item) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{item.actor?.fullName ?? 'Система'}</Typography.Text>
            {item.actor?.position ? <Typography.Text type="secondary">{item.actor.position}</Typography.Text> : null}
          </Space>
        ),
      },
      {
        title: 'Действие',
        dataIndex: 'action',
        key: 'action',
        width: 260,
        render: (value: string) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{actionLabels[value] ?? value}</Typography.Text>
            <Typography.Text type="secondary">{value}</Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Объект',
        key: 'entity',
        width: 240,
        render: (_, item) => (
          <Space direction="vertical" size={0}>
            <Tag>{entityLabels[item.entityType] ?? item.entityType}</Tag>
            <Typography.Text type="secondary">{item.entityId ?? '—'}</Typography.Text>
          </Space>
        ),
      },
      {
        title: 'IP',
        dataIndex: 'ipAddress',
        key: 'ipAddress',
        width: 150,
        render: (value: string | null) => value || '—',
      },
      {
        title: 'Детали',
        dataIndex: 'metadata',
        key: 'metadata',
        render: (value: unknown) => <Typography.Text>{formatMetadata(value)}</Typography.Text>,
      },
    ],
    [],
  );

  async function handleExportReport() {
    try {
      const to = new Date();
      const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
      const report = await exportAuditReport({ from: from.toISOString(), to: to.toISOString(), limit: 10000 });
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `temichevvet-audit-${formatFileDate(to)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      message.success('JSON-отчёт скачан');
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  }

  return (
    <div className="page">
      <PageHeader title="Журнал аудита" description="Последние действия сотрудников и системные события CRM." />
      {!canReadAudit ? (
        <Alert type="warning" showIcon message="У вашей роли нет права просмотра журнала аудита." className="form-alert" />
      ) : null}
      {auditQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(auditQuery.error)} className="form-alert" /> : null}
      <div className="list-panel">
        <div className="list-panel-header">
          <Space wrap>
            <Input
              prefix={<SearchOutlined />}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по журналу"
              style={{ width: 300 }}
            />
            <Select
              allowClear
              placeholder="Действие"
              className="status-filter"
              value={action}
              options={actionOptions}
              onChange={setAction}
            />
            <Select
              allowClear
              placeholder="Объект"
              className="status-filter"
              value={entityType}
              options={entityOptions}
              onChange={setEntityType}
            />
          </Space>
          <Space wrap>
            <Button icon={<DownloadOutlined />} onClick={handleExportReport} disabled={!canReadAudit}>
              Скачать JSON за 24 часа
            </Button>
            <Typography.Text type="secondary">Показано {filteredItems.length} из {items.length}</Typography.Text>
          </Space>
        </div>
        <div className="list-panel-body">
          <Table<AuditLogItem>
            rowKey="id"
            className="dense-table"
            columns={columns}
            dataSource={filteredItems}
            loading={auditQuery.isLoading}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            scroll={{ x: 1200 }}
          />
        </div>
      </div>
    </div>
  );
}

function formatFileDate(date: Date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

const actionLabels: Record<string, string> = {
  'auth.login': 'Вход в систему',
  'auth.logout': 'Выход из системы',
  'auth.login_failed': 'Неудачная попытка входа',
  'auth.password_change': 'Пароль изменён',
  'owner.create': 'Владелец создан',
  'owner.update': 'Владелец изменён',
  'owner.balance_operation.create': 'Операция баланса владельца',
  'animal.create': 'Пациент создан',
  'animal.update': 'Пациент изменён',
  'queue.create': 'Запись в очередь создана',
  'queue.update': 'Очередь изменена',
  'appointment.create': 'Запись на приём создана',
  'appointment.update': 'Запись на приём изменена',
  'visit.create': 'Приём создан',
  'visit.update': 'Приём изменён',
  'bill.create': 'Счёт создан',
  'bill.cancel': 'Счёт отменён',
  'payment.create': 'Оплата проведена',
  'payment.refund': 'Возврат оплаты',
  'employee.create': 'Сотрудник создан',
  'employee.update': 'Сотрудник изменён',
  'notification.queue': 'Уведомление поставлено в очередь',
  'notification.retry': 'Уведомление повторено',
  'notification.cancel': 'Уведомление отменено',
  'news.create': 'Новость опубликована',
  'news.update': 'Новость изменена',
  'news.archive': 'Новость отправлена в архив',
  'news.read': 'Новость прочитана',
  'ui.page_view': 'Открыт раздел',
  'ui.heartbeat': 'Активность в интерфейсе',
  'ui.frontend_error': 'Ошибка интерфейса',
};

const entityLabels: Record<string, string> = {
  Auth: 'Авторизация',
  Session: 'Сессия',
  Owner: 'Владелец',
  Animal: 'Пациент',
  QueueEntry: 'Очередь',
  Appointment: 'Запись',
  Visit: 'Приём',
  Bill: 'Счёт',
  BillItem: 'Позиция счёта',
  Payment: 'Оплата',
  Employee: 'Сотрудник',
  NewsPost: 'Новость',
  NotificationOutbox: 'Уведомление',
  NotificationTemplate: 'Шаблон уведомления',
  Organization: 'Организация',
  ClinicOffice: 'Филиал',
  Room: 'Кабинет',
  HospitalBox: 'Бокс стационара',
  Warehouse: 'Склад',
  UserActivity: 'Активность',
};

function buildOptions(values: string[]) {
  return [...new Set(values)]
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ value, label: value }));
}

function getSearchText(item: AuditLogItem) {
  return [
    item.action,
    item.entityType,
    item.entityId,
    item.ipAddress,
    item.actor?.fullName,
    item.actor?.position,
    formatMetadata(item.metadata),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function formatMetadata(value: unknown) {
  if (!value) {
    return '—';
  }

  try {
    return JSON.stringify(value);
  } catch {
    return '—';
  }
}
