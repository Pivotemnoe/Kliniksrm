import {
  BankOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  ExperimentOutlined,
  FileDoneOutlined,
  MedicineBoxOutlined,
  OrderedListOutlined,
  PlusOutlined,
  ShopOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Descriptions, Drawer, Input, List, Select, Space, Table, Tag, Typography } from 'antd';
import { type ReactNode, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { ProgressiveTable } from '../../shared/ui/InfiniteTable';
import { formatDate, formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { appointmentStatusColors, appointmentStatusLabels } from '../appointments/types';
import { queueStatusColors, queueStatusLabels, queueUrgencyColors, queueUrgencyLabels } from '../queue/types';
import { getTaskTypeLabel } from '../tasks/types';
import { visitStatusColors, visitStatusLabels } from '../visits/types';
import { getDashboardToday, getDirectorPortalStatistics } from './dashboard.api';
import { DashboardQueueItem, DashboardSummary, DirectorPortalOwnerItem, DirectorPortalStatistics } from './types';

const hospitalStatusLabels = { ACTIVE: 'В стационаре', DISCHARGED: 'Выписан', CANCELLED: 'Отменён' } as const;
const hospitalStatusColors = { ACTIVE: 'blue', DISCHARGED: 'green', CANCELLED: 'default' } as const;
const portalStatusLabels = {
  ACTIVATED: 'Активирован',
  INVITED: 'Ожидает входа',
  ENABLED: 'Доступ включён',
  BLOCKED: 'Заблокирован',
  DISABLED: 'Доступ выключен',
} as const;
const portalStatusColors = { ACTIVATED: 'green', INVITED: 'gold', ENABLED: 'blue', BLOCKED: 'red', DISABLED: 'default' } as const;

type PortalStatusFilter = 'ALL' | 'NOT_ACTIVATED' | DirectorPortalOwnerItem['status'];
type PortalActivityFilter = 'ALL' | 'SEEN' | 'NEVER_SEEN' | 'ACTIVE_30_DAYS' | 'INACTIVE_30_DAYS';
type PortalTodayFilter = 'ALL' | 'INVITED_TODAY' | 'ACTIVATED_TODAY' | 'SEEN_TODAY';
type PortalChannelFilter = 'ALL' | 'TELEGRAM' | 'MAX' | 'NO_MESSENGER';
type PortalSort = 'LAST_SEEN_DESC' | 'LAST_SEEN_ASC' | 'INVITED_DESC' | 'INVITED_ASC' | 'NAME_ASC';

export function DashboardPage() {
  const navigate = useNavigate();
  const [portalStatisticsOpen, setPortalStatisticsOpen] = useState(false);
  const { data: auth } = useCurrentEmployee();
  const employee = auth?.employee;
  const today = useMemo(() => toDateInput(new Date()), []);
  const dashboardQuery = useQuery({
    queryKey: ['dashboard', today],
    queryFn: () => getDashboardToday({ date: today }),
    refetchInterval: 10_000,
  });
  const summary = dashboardQuery.data;
  const portalStatisticsQuery = useQuery({
    queryKey: ['dashboard', 'portal-statistics'],
    queryFn: getDirectorPortalStatistics,
    enabled: summary?.workspace.mode === 'director',
    refetchInterval: 60_000,
  });
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
            {hasPermission(employee, 'business.read') ? (
              <Button icon={<BankOutlined />} onClick={() => navigate('/business')}>
                Бизнес и прибыль
              </Button>
            ) : null}
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
          hint={`Незавершённых ${summary?.visits.active ?? 0}`}
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
        {summary?.workspace.mode === 'director' ? (
          <DashboardActionTile
            title="Личные кабинеты"
            value={portalStatisticsQuery.isError ? '—' : formatGatewayMetric(portalStatisticsQuery.data, 'registered')}
            hint={getPortalStatisticsHint(portalStatisticsQuery.data, portalStatisticsQuery.isError)}
            icon={<UserOutlined />}
            loading={portalStatisticsQuery.isLoading}
            variant="portal"
            onClick={() => {
              setPortalStatisticsOpen(true);
              void portalStatisticsQuery.refetch();
            }}
          />
        ) : null}
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
            <Typography.Title level={4}>Незавершённые приёмы</Typography.Title>
            <Tag color={summary?.visits.active ? 'orange' : 'default'}>{summary?.visits.active ?? 0}</Tag>
          </div>
          <List
            className="compact-list"
            loading={dashboardQuery.isLoading}
            dataSource={summary?.visits.items ?? []}
            locale={{ emptyText: 'Незавершённых приёмов нет' }}
            renderItem={(item) => (
              <List.Item onClick={() => navigate(`/visits/${item.id}`)}>
                <List.Item.Meta
                  title={`${item.animal?.nickname ?? 'Пациент'} · ${item.owner?.fullName ?? 'Владелец не указан'}`}
                  description={
                    <Space wrap size={6}>
                      <Tag color={visitStatusColors[item.status]}>{visitStatusLabels[item.status]}</Tag>
                      <span>{item.employee?.fullName ?? 'Врач не назначен'}</span>
                      <span>Начат {formatDateTime(item.startedAt)}</span>
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
              <List.Item onClick={() => navigate(`/hospital/${item.id}`)}>
                <List.Item.Meta
                  title={`${item.animal?.nickname ?? 'Пациент'} · ${item.hospitalBox?.name ?? 'Бокс не указан'}`}
                  description={
                    <Space wrap size={6}>
                      <Tag color={hospitalStatusColors[item.status]}>{hospitalStatusLabels[item.status]}</Tag>
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
      <PortalStatisticsDrawer
        open={portalStatisticsOpen}
        loading={portalStatisticsQuery.isLoading}
        error={portalStatisticsQuery.error}
        statistics={portalStatisticsQuery.data}
        onClose={() => setPortalStatisticsOpen(false)}
        onOpenOwner={(ownerId) => {
          setPortalStatisticsOpen(false);
          navigate(`/owners/${ownerId}`);
        }}
      />
    </div>
  );
}

function PortalStatisticsDrawer({
  open,
  loading,
  error,
  statistics,
  onClose,
  onOpenOwner,
}: {
  open: boolean;
  loading: boolean;
  error: unknown;
  statistics: DirectorPortalStatistics | undefined;
  onClose: () => void;
  onOpenOwner: (ownerId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PortalStatusFilter>('ALL');
  const [activityFilter, setActivityFilter] = useState<PortalActivityFilter>('ALL');
  const [todayFilter, setTodayFilter] = useState<PortalTodayFilter>('ALL');
  const [channelFilter, setChannelFilter] = useState<PortalChannelFilter>('ALL');
  const [sort, setSort] = useState<PortalSort>('LAST_SEEN_DESC');
  const listedItems = statistics?.items ?? [];
  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('ru');
    const activeSince = Date.now() - 30 * 86_400_000;
    const todayKey = statistics?.today.date;
    const matches = listedItems.filter((owner) => {
      const searchDigits = normalizedSearch.replace(/\D/g, '');
      const matchesSearch = !normalizedSearch
        || owner.fullName.toLocaleLowerCase('ru').includes(normalizedSearch)
        || (searchDigits.length > 0 && (owner.phone ?? '').replace(/\D/g, '').includes(searchDigits));
      const matchesStatus = statusFilter === 'ALL'
        || (statusFilter === 'NOT_ACTIVATED' ? !owner.registered : owner.status === statusFilter);
      const lastSeenAt = owner.lastSeenAt ? new Date(owner.lastSeenAt).getTime() : null;
      const matchesActivity = activityFilter === 'ALL'
        || (activityFilter === 'SEEN' && lastSeenAt !== null)
        || (activityFilter === 'NEVER_SEEN' && lastSeenAt === null)
        || (activityFilter === 'ACTIVE_30_DAYS' && lastSeenAt !== null && lastSeenAt >= activeSince)
        || (activityFilter === 'INACTIVE_30_DAYS' && (lastSeenAt === null || lastSeenAt < activeSince));
      const matchesChannel = channelFilter === 'ALL'
        || (channelFilter === 'TELEGRAM' && owner.telegramLinked)
        || (channelFilter === 'MAX' && owner.maxLinked)
        || (channelFilter === 'NO_MESSENGER' && !owner.telegramLinked && !owner.maxLinked);
      const matchesToday = todayFilter === 'ALL'
        || (todayFilter === 'INVITED_TODAY' && isClinicDate(owner.invitedAt, todayKey))
        || (todayFilter === 'ACTIVATED_TODAY' && isClinicDate(owner.activatedAt, todayKey))
        || (todayFilter === 'SEEN_TODAY' && isClinicDate(owner.lastSeenAt, todayKey));
      return matchesSearch && matchesStatus && matchesActivity && matchesChannel && matchesToday;
    });

    return matches.sort((left, right) => {
      if (sort === 'NAME_ASC') return left.fullName.localeCompare(right.fullName, 'ru');
      const field = sort.startsWith('INVITED') ? 'invitedAt' : 'lastSeenAt';
      const leftDate = left[field] ?? '';
      const rightDate = right[field] ?? '';
      const direction = sort.endsWith('ASC') ? 1 : -1;
      return direction * leftDate.localeCompare(rightDate) || left.fullName.localeCompare(right.fullName, 'ru');
    });
  }, [activityFilter, channelFilter, listedItems, search, sort, statistics?.today.date, statusFilter, todayFilter]);

  return (
    <Drawer
      title="Личные кабинеты владельцев"
      open={open}
      onClose={onClose}
      width={920}
      className="portal-statistics-drawer"
      destroyOnHidden
    >
      {error ? <Alert type="error" showIcon message={getErrorMessage(error)} className="form-alert" /> : null}
      {statistics && !statistics.gatewayAvailable ? (
        <Alert
          type="warning"
          showIcon
          className="form-alert"
          message="Публичный шлюз сейчас недоступен"
          description="Показаны локальные данные CRM. Последние входы и подключения Telegram/MAX могут быть неполными; нулевые значения не означают, что подключений нет."
        />
      ) : null}
      <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} className="portal-statistics-summary">
        <Descriptions.Item label="Владельцев приглашено сегодня">{statistics?.today.invitationsCreated ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Активировали сегодня">{formatTodayGatewayMetric(statistics, 'activated')}</Descriptions.Item>
        <Descriptions.Item label="Заходили сегодня">{formatTodayGatewayMetric(statistics, 'activeOwners')}</Descriptions.Item>
        <Descriptions.Item label="Владельцев в CRM">{statistics?.totals.owners ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Активировали кабинет">{formatGatewayMetric(statistics, 'registered')}</Descriptions.Item>
        <Descriptions.Item label="Приглашены, но не вошли">{statistics?.totals.invited ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Заходили за 30 дней">{formatGatewayMetric(statistics, 'active30Days')}</Descriptions.Item>
        <Descriptions.Item label="Подключили Telegram">{formatGatewayMetric(statistics, 'telegramLinked')}</Descriptions.Item>
        <Descriptions.Item label="Подключили MAX">{formatGatewayMetric(statistics, 'maxLinked')}</Descriptions.Item>
        <Descriptions.Item label="Заблокированы">{statistics?.totals.blocked ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Данные шлюза">
          {statistics?.gatewayAvailable ? `Обновлены ${formatDateTime(statistics.gatewayUpdatedAt)}` : 'Нет связи'}
        </Descriptions.Item>
      </Descriptions>
      <Typography.Paragraph type="secondary" className="portal-statistics-note">
        Приглашённые считаются по уникальным владельцам, а не по числу повторно созданных ссылок или QR-кодов. Активированным считается кабинет, в который владелец впервые успешно вошёл.
      </Typography.Paragraph>
      <Space wrap align="start" className="portal-statistics-filters">
        <Input.Search
          allowClear
          value={search}
          placeholder="Владелец или телефон"
          onChange={(event) => setSearch(event.target.value)}
          style={{ width: 250 }}
        />
        <Select<PortalStatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 210 }}
          options={[
            { value: 'ALL', label: 'Все состояния' },
            { value: 'ACTIVATED', label: 'Активирован' },
            { value: 'NOT_ACTIVATED', label: 'Не активирован' },
            { value: 'INVITED', label: 'Приглашён, не вошёл' },
            { value: 'ENABLED', label: 'Доступ включён' },
            { value: 'BLOCKED', label: 'Заблокирован' },
            { value: 'DISABLED', label: 'Доступ выключен' },
          ]}
        />
        <Select<PortalTodayFilter>
          value={todayFilter}
          onChange={setTodayFilter}
          style={{ width: 220 }}
          options={[
            { value: 'ALL', label: 'Любая дата события' },
            { value: 'INVITED_TODAY', label: 'Приглашены сегодня' },
            { value: 'ACTIVATED_TODAY', label: 'Впервые вошли сегодня' },
            { value: 'SEEN_TODAY', label: 'Заходили сегодня' },
          ]}
        />
        <Select<PortalActivityFilter>
          value={activityFilter}
          onChange={setActivityFilter}
          style={{ width: 205 }}
          options={[
            { value: 'ALL', label: 'Любой последний вход' },
            { value: 'SEEN', label: 'Хотя бы раз входил' },
            { value: 'NEVER_SEEN', label: 'Ни разу не входил' },
            { value: 'ACTIVE_30_DAYS', label: 'Заходил за 30 дней' },
            { value: 'INACTIVE_30_DAYS', label: 'Не заходил 30 дней' },
          ]}
        />
        <Select<PortalChannelFilter>
          value={channelFilter}
          onChange={setChannelFilter}
          style={{ width: 185 }}
          options={[
            { value: 'ALL', label: 'Все каналы' },
            { value: 'TELEGRAM', label: 'Telegram подключён' },
            { value: 'MAX', label: 'MAX подключён' },
            { value: 'NO_MESSENGER', label: 'Без мессенджера' },
          ]}
        />
        <Select<PortalSort>
          value={sort}
          onChange={setSort}
          style={{ width: 230 }}
          options={[
            { value: 'LAST_SEEN_DESC', label: 'Последний вход: новые' },
            { value: 'LAST_SEEN_ASC', label: 'Последний вход: старые' },
            { value: 'INVITED_DESC', label: 'Приглашение: новые' },
            { value: 'INVITED_ASC', label: 'Приглашение: старые' },
            { value: 'NAME_ASC', label: 'Владелец: А–Я' },
          ]}
        />
      </Space>
      <ProgressiveTable<DirectorPortalOwnerItem>
        rowKey="ownerId"
        loading={loading}
        dataSource={filteredItems}
        scroll={{ x: 760 }}
        locale={{ emptyText: 'По выбранным условиям владельцев нет' }}
        columns={[
          {
            title: 'Владелец',
            dataIndex: 'fullName',
            width: 230,
            render: (fullName: string, owner) => (
              <div>
                <Button type="link" className="portal-statistics-owner-link" onClick={() => onOpenOwner(owner.ownerId)}>
                  {fullName}
                </Button>
                <Typography.Text type="secondary" className="portal-statistics-owner-phone">{owner.phone || 'Телефон не указан'}</Typography.Text>
              </div>
            ),
          },
          {
            title: 'Состояние',
            dataIndex: 'status',
            width: 145,
            render: (status: DirectorPortalOwnerItem['status']) => <Tag color={portalStatusColors[status]}>{portalStatusLabels[status]}</Tag>,
          },
          {
            title: 'Первый вход',
            dataIndex: 'activatedAt',
            width: 155,
            render: (value: string | null) => formatDateTime(value),
          },
          {
            title: 'Последний вход',
            dataIndex: 'lastSeenAt',
            width: 155,
            render: (value: string | null) => formatDateTime(value),
          },
          {
            title: 'Приглашён',
            dataIndex: 'invitedAt',
            width: 155,
            render: (value: string | null) => formatDateTime(value),
          },
          {
            title: 'Каналы',
            key: 'channels',
            width: 150,
            render: (_, owner) => (
              <Space wrap size={4}>
                {owner.telegramLinked ? <Tag color="blue">Telegram</Tag> : null}
                {owner.maxLinked ? <Tag color="purple">MAX</Tag> : null}
                {!owner.telegramLinked && !owner.maxLinked ? '—' : null}
              </Space>
            ),
          },
        ]}
      />
      <Typography.Text type="secondary">
        Показано {filteredItems.length} из {listedItems.length} загруженных кабинетов.
      </Typography.Text>
      {statistics && statistics.listedOwners > statistics.items.length ? (
        <Typography.Text type="secondary">
          Показаны последние {statistics.items.length} из {statistics.listedOwners} владельцев с личным кабинетом.
        </Typography.Text>
      ) : null}
    </Drawer>
  );
}

function isClinicDate(value: string | null, expectedDate?: string) {
  if (!value || !expectedDate) return false;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value)) === expectedDate;
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
          hint={`Незавершённых ${summary.visits.active}`}
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
            <Typography.Title level={4}>Мои незавершённые приёмы</Typography.Title>
            <Tag color={summary.visits.active ? 'orange' : 'default'}>{summary.visits.active}</Tag>
          </div>
          <List
            className="compact-list"
            loading={loading}
            dataSource={summary.visits.items}
            locale={{ emptyText: 'Все приёмы завершены' }}
            renderItem={(item) => (
              <List.Item onClick={() => navigate(`/visits/${item.id}`)}>
                <List.Item.Meta
                  title={`${item.animal?.nickname ?? 'Пациент'} · ${item.owner?.fullName ?? 'Владелец не указан'}`}
                  description={
                    <Space wrap size={6}>
                      <Tag color={visitStatusColors[item.status]}>{visitStatusLabels[item.status]}</Tag>
                      <span>Начат {formatDateTime(item.startedAt)}</span>
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

function getPortalStatisticsHint(statistics: DirectorPortalStatistics | undefined, isError: boolean) {
  if (isError) {
    return 'Не удалось получить статистику';
  }
  if (!statistics) {
    return 'Загрузка данных';
  }
  if (!statistics.gatewayAvailable) {
    return `Сегодня приглашений ${statistics.today.invitationsCreated} · шлюз недоступен`;
  }
  return `Сегодня приглашений ${statistics.today.invitationsCreated} · активаций ${statistics.today.activated}`;
}

function formatGatewayMetric(
  statistics: DirectorPortalStatistics | undefined,
  metric: 'registered' | 'active30Days' | 'telegramLinked' | 'maxLinked',
) {
  if (!statistics) {
    return '—';
  }
  const value = statistics.totals[metric];
  if (statistics.gatewayAvailable) {
    return value;
  }
  return value > 0 ? `${value}+` : '—';
}

function formatTodayGatewayMetric(
  statistics: DirectorPortalStatistics | undefined,
  metric: 'activated' | 'activeOwners',
) {
  if (!statistics) {
    return '—';
  }
  const value = statistics.today[metric];
  if (statistics.gatewayAvailable) {
    return value;
  }
  return value > 0 ? `${value}+` : '—';
}

function toDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
