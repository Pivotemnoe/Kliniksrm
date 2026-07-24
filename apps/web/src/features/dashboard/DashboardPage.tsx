import {
  CalendarOutlined,
  ClockCircleOutlined,
  ExperimentOutlined,
  FileDoneOutlined,
  MedicineBoxOutlined,
  OrderedListOutlined,
  PlusOutlined,
  ShopOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, List, Space, Tag, Typography } from 'antd';
import { type ReactNode, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDate, formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { appointmentStatusColors, appointmentStatusLabels } from '../appointments/types';
import { queueStatusColors, queueStatusLabels, queueUrgencyColors, queueUrgencyLabels } from '../queue/types';
import { getTaskTypeLabel } from '../tasks/types';
import { visitStatusColors, visitStatusLabels } from '../visits/types';
import { getDashboardToday } from './dashboard.api';
import { DashboardQueueItem, DashboardSummary } from './types';

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: auth } = useCurrentEmployee();
  const employee = auth?.employee;
  const today = useMemo(() => toDateInput(new Date()), []);
  const dashboardQuery = useQuery({
    queryKey: ['dashboard', today],
    queryFn: () => getDashboardToday({ date: today }),
    refetchInterval: 10_000,
  });
  const summary = dashboardQuery.data;
  const todayVisits = summary?.visits.todayItems ?? summary?.visits.items ?? [];
  const stockAlerts = (summary?.stock.lowStockProducts ?? 0) + (summary?.stock.expiringBatches ?? 0);
  const requestAlerts = (summary?.onlineRequests.newRequests ?? 0) + (summary?.onlineRequests.inReview ?? 0);

  if (summary?.workspace.mode === 'doctor' && employee) {
    return (
      <DoctorDashboard
        summary={summary}
        employeeId={employee.id}
        loading={dashboardQuery.isLoading}
        error={dashboardQuery.error}
      />
    );
  }

  if (summary?.workspace.mode === 'employee' && employee) {
    return <EmployeeDashboard summary={summary} loading={dashboardQuery.isLoading} error={dashboardQuery.error} />;
  }

  return (
    <div className="page">
      <PageHeader
        title={summary?.workspace.mode === 'director' ? 'Кабинет директора' : summary?.workspace.mode === 'administrator' ? 'Кабинет администратора' : 'Сводка'}
        description={`Рабочая картина клиники на ${formatDate(today)}.`}
        extra={
          <Space wrap>
            <Button icon={<OrderedListOutlined />} onClick={() => navigate('/queue')}>
              Очередь
            </Button>
            <Button icon={<CalendarOutlined />} onClick={() => navigate('/schedule')}>
              Расписание
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => navigate('/queue?create=1')}>
              Добавить в очередь
            </Button>
            <Button type="primary" icon={<CalendarOutlined />} onClick={() => navigate('/schedule?create=1')}>
              Записать на приём
            </Button>
          </Space>
        }
      />
      {dashboardQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(dashboardQuery.error)} className="form-alert" /> : null}
      <div className="dashboard-app-strip">
        <DashboardActionTile
          title="Очередь"
          value={summary?.queue.waiting ?? 0}
          hint={`В работе ${summary?.queue.inProgress ?? 0}`}
          icon={<OrderedListOutlined />}
          loading={dashboardQuery.isLoading}
          variant="queue"
          onClick={() => navigate('/queue')}
        />
        <DashboardActionTile
          title="Расписание"
          value={summary?.appointments.today ?? 0}
          hint={`Пришли ${summary?.appointments.arrived ?? 0} · в работе ${summary?.appointments.inProgress ?? 0}`}
          icon={<CalendarOutlined />}
          loading={dashboardQuery.isLoading}
          variant="schedule"
          onClick={() => navigate('/schedule')}
        />
        <DashboardActionTile
          title="Приёмы"
          value={summary?.visits.totalToday ?? 0}
          hint={`Активных ${summary?.visits.active ?? 0}`}
          icon={<FileDoneOutlined />}
          loading={dashboardQuery.isLoading}
          variant="visits"
          onClick={() => navigate('/visits')}
        />
        <DashboardActionTile
          title="Оплаты"
          value={formatMoney(summary?.finance.paymentsTodayAmount ?? 0)}
          hint={`Неоплаченных ${summary?.finance.unpaidBills ?? 0}`}
          icon={<WalletOutlined />}
          loading={dashboardQuery.isLoading}
          variant="money"
          onClick={() => navigate('/bills')}
        />
        <DashboardActionTile
          title="Стационар"
          value={summary?.hospital.activePatients ?? 0}
          hint={`Поступили ${summary?.hospital.admittedToday ?? 0} · выписаны ${summary?.hospital.dischargedToday ?? 0}`}
          icon={<MedicineBoxOutlined />}
          loading={dashboardQuery.isLoading}
          variant="hospital"
          onClick={() => navigate('/hospital')}
        />
        <DashboardActionTile
          title="Склад"
          value={stockAlerts}
          hint={`Остатки ${summary?.stock.lowStockProducts ?? 0} · сроки ${summary?.stock.expiringBatches ?? 0}`}
          icon={<ShopOutlined />}
          loading={dashboardQuery.isLoading}
          variant="stock"
          onClick={() => navigate('/stock')}
        />
        <DashboardActionTile
          title="Заявки"
          value={requestAlerts}
          hint={`Новые ${summary?.onlineRequests.newRequests ?? 0} · в разборе ${summary?.onlineRequests.inReview ?? 0}`}
          icon={<PlusOutlined />}
          loading={dashboardQuery.isLoading}
          variant="requests"
          onClick={() => navigate('/online-requests')}
        />
        <DashboardActionTile
          title="Лаборатория"
          value={summary?.laboratory.pending ?? 0}
          hint={`Сегодня назначено ${summary?.laboratory.orderedToday ?? 0}`}
          icon={<ExperimentOutlined />}
          loading={dashboardQuery.isLoading}
          variant="lab"
          onClick={() => navigate('/laboratory?status=active')}
        />
      </div>
      <div className="dashboard-grid dashboard-grid-expanded">
        <section className="list-panel">
          <div className="list-panel-header">
            <Typography.Title level={4}>Живая очередь</Typography.Title>
            <Button size="small" onClick={() => window.open('/queue/tv', '_blank', 'noopener,noreferrer')}>
              Экран клиентов
            </Button>
          </div>
          <List
            className="compact-list"
            loading={dashboardQuery.isLoading}
            dataSource={summary?.queue.items ?? []}
            locale={{ emptyText: 'Очередь пуста' }}
            renderItem={(item) => (
              <List.Item onClick={() => navigate(`/queue/${item.id}`)}>
                <List.Item.Meta
                  title={getQueueTitle(item)}
                  description={
                    <Space wrap size={6}>
                      <Tag color={queueStatusColors[item.status]}>{queueStatusLabels[item.status]}</Tag>
                      <Tag color={queueUrgencyColors[item.urgency]}>{queueUrgencyLabels[item.urgency]}</Tag>
                      <span>{formatDateTime(item.createdAt)}</span>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </section>
        <section className="list-panel">
          <div className="list-panel-header">
            <Typography.Title level={4}>Расписание сегодня</Typography.Title>
            <Button size="small" onClick={() => navigate('/schedule')}>
              Открыть
            </Button>
          </div>
          <List
            className="compact-list"
            loading={dashboardQuery.isLoading}
            dataSource={summary?.appointments.items ?? []}
            locale={{ emptyText: 'Записей нет' }}
            renderItem={(item) => (
              <List.Item onClick={() => navigate(`/schedule/${item.id}`)}>
                <List.Item.Meta
                  title={`${formatDateTime(item.startsAt)} · ${item.animal?.nickname ?? 'Пациент'}`}
                  description={
                    <Space wrap size={6}>
                      <Tag color={appointmentStatusColors[item.status]}>{appointmentStatusLabels[item.status]}</Tag>
                      <span>{item.owner?.fullName ?? 'Владелец не указан'}</span>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </section>
        <section className="list-panel">
          <div className="list-panel-header">
            <Typography.Title level={4}>Приёмы сегодня</Typography.Title>
            <Button size="small" onClick={() => navigate('/visits')}>
              Все приёмы
            </Button>
          </div>
          <List
            className="compact-list"
            loading={dashboardQuery.isLoading}
            dataSource={todayVisits}
            locale={{ emptyText: 'Приёмов сегодня нет' }}
            renderItem={(item) => (
              <List.Item onClick={() => navigate(`/visits/${item.id}`)}>
                <List.Item.Meta
                  title={`${item.animal?.nickname ?? 'Пациент'} · ${item.owner?.fullName ?? 'Владелец не указан'}`}
                  description={
                    <Space wrap size={6}>
                      <Tag color={visitStatusColors[item.status]}>{visitStatusLabels[item.status]}</Tag>
                      <span>{item.employee?.fullName ?? 'Сотрудник не назначен'}</span>
                      <span>{formatDateTime(item.completedAt ?? item.startedAt)}</span>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </section>
        <section className="list-panel">
          <div className="list-panel-header">
            <Typography.Title level={4}>Стационар</Typography.Title>
            <Button size="small" onClick={() => navigate('/hospital')}>
              Открыть
            </Button>
          </div>
          <List
            className="compact-list"
            loading={dashboardQuery.isLoading}
            dataSource={summary?.hospital.items ?? []}
            locale={{ emptyText: 'Пациентов в стационаре нет' }}
            renderItem={(item) => (
              <List.Item onClick={() => navigate(`/visits/${item.id}`)}>
                <List.Item.Meta
                  title={`${item.animal?.nickname ?? 'Пациент'} · ${item.hospitalBox?.name ?? 'Бокс не указан'}`}
                  description={
                    <Space wrap size={6}>
                      <Tag color={visitStatusColors[item.status]}>{visitStatusLabels[item.status]}</Tag>
                      <span>{item.owner?.fullName ?? 'Владелец не указан'}</span>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </section>
        <section className="list-panel">
          <div className="list-panel-header">
            <Typography.Title level={4}>Онлайн-заявки</Typography.Title>
            <Button size="small" onClick={() => navigate('/online-requests')}>
              Открыть
            </Button>
          </div>
          <List
            className="compact-list"
            loading={dashboardQuery.isLoading}
            dataSource={summary?.onlineRequests.items ?? []}
            locale={{ emptyText: 'Новых заявок нет' }}
            renderItem={(item) => (
              <List.Item onClick={() => navigate('/online-requests')}>
                <List.Item.Meta
                  title={`${item.animalNickname} · ${item.ownerName}`}
                  description={
                    <Space wrap size={6}>
                      <Tag color={item.status === 'NEW' ? 'blue' : 'gold'}>{item.status === 'NEW' ? 'Новая' : 'В работе'}</Tag>
                      <span>{item.phone}</span>
                      {item.preferredAt ? <span>{formatDateTime(item.preferredAt)}</span> : null}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </section>
        <section className="list-panel">
          <div className="list-panel-header">
            <Typography.Title level={4}>Лаборатория</Typography.Title>
            <Button size="small" onClick={() => navigate('/laboratory?status=active')}>
              Журнал
            </Button>
          </div>
          <List
            className="compact-list"
            loading={dashboardQuery.isLoading}
            dataSource={summary?.laboratory.items ?? []}
            locale={{ emptyText: 'Ожидающих исследований нет' }}
            renderItem={(item) => (
              <List.Item onClick={() => navigate('/laboratory?status=active')}>
                <List.Item.Meta
                  title={`${item.visit.animal.nickname} · ${item.visit.owner.fullName}`}
                  description={
                    <Space wrap size={6}>
                      <Tag color={item.status === 'ORDERED' ? 'blue' : 'gold'}>{item.status === 'ORDERED' ? 'Назначено' : 'В работе'}</Tag>
                      <span>{item.items.map((line) => line.title).join(', ')}</span>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </section>
        <section className="list-panel">
          <div className="list-panel-header">
            <Typography.Title level={4}>Складские предупреждения</Typography.Title>
            <Button size="small" onClick={() => navigate('/stock')}>
              Склад
            </Button>
          </div>
          <List
            className="compact-list"
            loading={dashboardQuery.isLoading}
            dataSource={[...(summary?.stock.lowStockItems ?? []), ...(summary?.stock.expiringItems ?? [])]}
            locale={{ emptyText: 'Критичных остатков и сроков нет' }}
            renderItem={(item) => (
              <List.Item onClick={() => navigate('/stock')}>
                {'minStock' in item ? (
                  <List.Item.Meta
                    title={item.title}
                    description={
                      <Space wrap size={6}>
                        <Tag color="red">Низкий остаток</Tag>
                        <span>
                          {item.rest} / минимум {item.minStock} {item.stockUnit ?? ''}
                        </span>
                      </Space>
                    }
                  />
                ) : (
                  <List.Item.Meta
                    title={item.product.title}
                    description={
                      <Space wrap size={6}>
                        <Tag color="orange">Срок годности</Tag>
                        <span>{item.expiresAt ? formatDate(item.expiresAt) : 'Дата не указана'}</span>
                        <span>
                          {Number(item.rest)} {item.product.stockUnit ?? ''}
                        </span>
                      </Space>
                    }
                  />
                )}
              </List.Item>
            )}
          />
        </section>
      </div>
    </div>
  );
}

function EmployeeDashboard({
  summary,
  loading,
  error,
}: {
  summary: DashboardSummary;
  loading: boolean;
  error: unknown;
}) {
  const navigate = useNavigate();
  const { data: auth } = useCurrentEmployee();
  const employee = auth?.employee;

  return (
    <div className="page">
      <PageHeader
        title="Рабочий кабинет"
        description={`Доступные разделы на ${formatDate(summary.date)}. Набор данных и действий зависит от роли сотрудника.`}
      />
      {error ? <Alert type="error" showIcon message={getErrorMessage(error)} className="form-alert" /> : null}
      <div className="dashboard-app-strip">
        {hasPermission(employee, 'queue.read') ? (
          <DashboardActionTile
            title="Очередь"
            value={summary.queue.waiting}
            hint={`В работе ${summary.queue.inProgress}`}
            icon={<OrderedListOutlined />}
            loading={loading}
            variant="queue"
            onClick={() => navigate('/queue')}
          />
        ) : null}
        {hasPermission(employee, 'appointments.read') ? (
          <DashboardActionTile
            title="Расписание"
            value={summary.appointments.today}
            hint={`Пришли ${summary.appointments.arrived}`}
            icon={<CalendarOutlined />}
            loading={loading}
            variant="schedule"
            onClick={() => navigate('/schedule')}
          />
        ) : null}
        {hasPermission(employee, 'tasks.read') ? (
          <DashboardActionTile
            title="Задачи"
            value="Открыть"
            hint="Задачи на сегодня"
            icon={<ClockCircleOutlined />}
            loading={loading}
            variant="requests"
            onClick={() => navigate('/tasks')}
          />
        ) : null}
        {hasPermission(employee, 'visits.read') ? (
          <DashboardActionTile
            title="Приёмы"
            value={summary.visits.totalToday}
            hint={`Активных ${summary.visits.active}`}
            icon={<FileDoneOutlined />}
            loading={loading}
            variant="visits"
            onClick={() => navigate('/visits')}
          />
        ) : null}
        {hasPermission(employee, 'billing.read') ? (
          <DashboardActionTile
            title="Счета"
            value={formatMoney(summary.finance.paymentsTodayAmount)}
            hint={`Не оплачено ${summary.finance.unpaidBills}`}
            icon={<WalletOutlined />}
            loading={loading}
            variant="money"
            onClick={() => navigate('/bills')}
          />
        ) : null}
        {hasPermission(employee, 'laboratory.read') ? (
          <DashboardActionTile
            title="Лаборатория"
            value={summary.laboratory.pending}
            hint={`Готово сегодня ${summary.laboratory.completedToday}`}
            icon={<ExperimentOutlined />}
            loading={loading}
            variant="laboratory"
            onClick={() => navigate('/laboratory')}
          />
        ) : null}
        {hasPermission(employee, 'hospital.read') ? (
          <DashboardActionTile
            title="Стационар"
            value={summary.hospital.activePatients}
            hint={`Поступило сегодня ${summary.hospital.admittedToday}`}
            icon={<MedicineBoxOutlined />}
            loading={loading}
            variant="hospital"
            onClick={() => navigate('/hospital')}
          />
        ) : null}
        {hasPermission(employee, 'stock.read') ? (
          <DashboardActionTile
            title="Склад"
            value={summary.stock.lowStockProducts + summary.stock.expiringBatches}
            hint="Остатки и сроки годности"
            icon={<ShopOutlined />}
            loading={loading}
            variant="stock"
            onClick={() => navigate('/stock')}
          />
        ) : null}
      </div>
    </div>
  );
}

function DoctorDashboard({
  summary,
  employeeId,
  loading,
  error,
}: {
  summary: DashboardSummary;
  employeeId: string;
  loading: boolean;
  error: unknown;
}) {
  const navigate = useNavigate();
  const { data: auth } = useCurrentEmployee();
  const employee = auth?.employee;
  const scope = `employeeId=${encodeURIComponent(employeeId)}`;
  const canCallQueue = hasPermission(employee, 'queue.call');
  const canManageVisits = hasPermission(employee, 'visits.manage');

  return (
    <div className="page">
      <PageHeader
        title="Кабинет врача"
        description={`Личная рабочая картина на ${formatDate(summary.date)}: смена, назначенные записи, очередь, приёмы и задачи.`}
        extra={
          <Space wrap>
            <Button icon={<OrderedListOutlined />} onClick={() => navigate('/queue')}>
              Общая очередь
            </Button>
            <Button icon={<CalendarOutlined />} onClick={() => navigate(`/schedule?${scope}`)}>
              Моё расписание
            </Button>
            {canManageVisits ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/visits?create=1')}>
                Начать приём
              </Button>
            ) : null}
          </Space>
        }
      />
      {error ? <Alert type="error" showIcon message={getErrorMessage(error)} className="form-alert" /> : null}
      <div className="dashboard-app-strip">
        <DashboardActionTile
          title="Моя очередь"
          value={summary.queue.waiting}
          hint={`Вызваны ${summary.queue.inProgress}`}
          icon={<OrderedListOutlined />}
          loading={loading}
          variant="queue"
          onClick={() => navigate(`/queue?${scope}`)}
        />
        <DashboardActionTile
          title="Моё расписание"
          value={summary.appointments.today}
          hint={`Пришли ${summary.appointments.arrived} · в работе ${summary.appointments.inProgress}`}
          icon={<CalendarOutlined />}
          loading={loading}
          variant="schedule"
          onClick={() => navigate(`/schedule?${scope}`)}
        />
        <DashboardActionTile
          title="Мои приёмы"
          value={summary.visits.totalToday}
          hint={`Активных ${summary.visits.active}`}
          icon={<FileDoneOutlined />}
          loading={loading}
          variant="visits"
          onClick={() => navigate(`/visits?${scope}`)}
        />
        <DashboardActionTile
          title="Мои задачи"
          value={summary.workspace.tasks.length}
          hint="Открытые и назначенные роли врача"
          icon={<ClockCircleOutlined />}
          loading={loading}
          variant="requests"
          onClick={() => navigate('/tasks?mine=true')}
        />
      </div>
      <div className="dashboard-grid dashboard-grid-expanded">
        <section className="list-panel">
          <div className="list-panel-header">
            <Typography.Title level={4}>Моя смена сегодня</Typography.Title>
            <ClockCircleOutlined />
          </div>
          <List
            className="compact-list"
            loading={loading}
            dataSource={summary.workspace.shifts}
            locale={{ emptyText: 'Активная смена на сегодня не назначена' }}
            renderItem={(shift) => (
              <List.Item>
                <List.Item.Meta
                  title={`${formatDateTime(shift.startsAt)} — ${formatDateTime(shift.endsAt)}`}
                  description={shift.comment || 'Без комментария'}
                />
              </List.Item>
            )}
          />
        </section>
        <section className="list-panel">
          <div className="list-panel-header">
            <Typography.Title level={4}>Мои задачи</Typography.Title>
            <Button size="small" onClick={() => navigate('/tasks?mine=true')}>
              Все задачи
            </Button>
          </div>
          <List
            className="compact-list"
            loading={loading}
            dataSource={summary.workspace.tasks}
            locale={{ emptyText: 'Открытых задач нет' }}
            renderItem={(task) => (
              <List.Item onClick={() => navigate(`/tasks/${task.id}`)}>
                <List.Item.Meta
                  title={task.title}
                  description={
                    <Space wrap size={6}>
                      <Tag color="blue">{getTaskTypeLabel(task.taskType)}</Tag>
                      {task.animal ? <span>{task.animal.nickname}</span> : null}
                      {task.owner ? <span>{task.owner.fullName}</span> : null}
                      <span>{task.dueAt ? formatDateTime(task.dueAt) : 'Без срока'}</span>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </section>
        <section className="list-panel">
          <div className="list-panel-header">
            <Typography.Title level={4}>Назначенные записи</Typography.Title>
            <Button size="small" onClick={() => navigate(`/schedule?${scope}`)}>
              Моё расписание
            </Button>
          </div>
          <List
            className="compact-list"
            loading={loading}
            dataSource={summary.appointments.items}
            locale={{ emptyText: 'Записей на сегодня нет' }}
            renderItem={(item) => (
              <List.Item onClick={() => navigate(`/schedule/${item.id}`)}>
                <List.Item.Meta
                  title={`${formatDateTime(item.startsAt)} · ${item.animal?.nickname ?? 'Пациент'}`}
                  description={
                    <Space wrap size={6}>
                      <Tag color={appointmentStatusColors[item.status]}>{appointmentStatusLabels[item.status]}</Tag>
                      <span>{item.owner?.fullName ?? 'Владелец не указан'}</span>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </section>
        <section className="list-panel">
          <div className="list-panel-header">
            <Typography.Title level={4}>Назначенная очередь</Typography.Title>
            <Button size="small" disabled={!canCallQueue} onClick={() => navigate(`/queue?${scope}`)}>
              Открыть
            </Button>
          </div>
          <List
            className="compact-list"
            loading={loading}
            dataSource={summary.queue.items}
            locale={{ emptyText: 'Назначенных пациентов нет' }}
            renderItem={(item) => (
              <List.Item onClick={() => navigate(`/queue/${item.id}`)}>
                <List.Item.Meta
                  title={getQueueTitle(item)}
                  description={
                    <Space wrap size={6}>
                      <Tag color={queueStatusColors[item.status]}>{queueStatusLabels[item.status]}</Tag>
                      <Tag color={queueUrgencyColors[item.urgency]}>{queueUrgencyLabels[item.urgency]}</Tag>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </section>
        <section className="list-panel">
          <div className="list-panel-header">
            <Typography.Title level={4}>Мои приёмы сегодня</Typography.Title>
            <Button size="small" onClick={() => navigate(`/visits?${scope}`)}>
              Все приёмы
            </Button>
          </div>
          <List
            className="compact-list"
            loading={loading}
            dataSource={summary.visits.todayItems}
            locale={{ emptyText: 'Приёмов сегодня нет' }}
            renderItem={(item) => (
              <List.Item onClick={() => navigate(`/visits/${item.id}`)}>
                <List.Item.Meta
                  title={`${item.animal?.nickname ?? 'Пациент'} · ${item.owner?.fullName ?? 'Владелец не указан'}`}
                  description={
                    <Space wrap size={6}>
                      <Tag color={visitStatusColors[item.status]}>{visitStatusLabels[item.status]}</Tag>
                      <span>{formatDateTime(item.completedAt ?? item.startedAt)}</span>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </section>
      </div>
    </div>
  );
}

function getQueueTitle(item: DashboardQueueItem) {
  const animal = item.animal?.nickname ?? item.animalNickname ?? 'Пациент';
  const owner = item.owner?.fullName ?? item.ownerName ?? 'Клиент без карточки';
  return `${animal} · ${owner}`;
}

function DashboardActionTile({
  title,
  value,
  hint,
  icon,
  loading,
  variant,
  onClick,
}: {
  title: string;
  value: string | number;
  hint: string;
  icon: ReactNode;
  loading: boolean;
  variant: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`dashboard-action-tile dashboard-action-${variant}`} onClick={onClick}>
      <span className="dashboard-action-icon">{icon}</span>
      <span className="dashboard-action-copy">
        <span>{title}</span>
        <strong>{loading ? '...' : value}</strong>
        <small>{hint}</small>
      </span>
    </button>
  );
}

function toDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
