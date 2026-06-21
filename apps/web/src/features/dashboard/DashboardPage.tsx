import {
  CalendarOutlined,
  ExperimentOutlined,
  FileDoneOutlined,
  MedicineBoxOutlined,
  OrderedListOutlined,
  PlusOutlined,
  ShopOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Col, List, Row, Space, Statistic, Tag, Typography } from 'antd';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDate, formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { appointmentStatusColors, appointmentStatusLabels } from '../appointments/types';
import { queueStatusColors, queueStatusLabels, queueUrgencyColors, queueUrgencyLabels } from '../queue/types';
import { visitStatusColors, visitStatusLabels } from '../visits/types';
import { getDashboardToday } from './dashboard.api';
import { DashboardQueueItem } from './types';

export function DashboardPage() {
  const navigate = useNavigate();
  const today = useMemo(() => toDateInput(new Date()), []);
  const dashboardQuery = useQuery({
    queryKey: ['dashboard', today],
    queryFn: () => getDashboardToday({ date: today }),
    refetchInterval: 10_000,
  });
  const summary = dashboardQuery.data;
  const todayVisits = summary?.visits.todayItems ?? summary?.visits.items ?? [];

  return (
    <div className="page">
      <PageHeader
        title="Сводка"
        description={`Рабочая картина клиники на ${formatDate(today)}.`}
        extra={
          <Space wrap>
            <Button icon={<OrderedListOutlined />} onClick={() => navigate('/queue')}>
              Очередь
            </Button>
            <Button icon={<CalendarOutlined />} onClick={() => navigate('/schedule')}>
              Расписание
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/queue')}>
              Добавить в очередь
            </Button>
          </Space>
        }
      />
      {dashboardQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(dashboardQuery.error)} className="form-alert" /> : null}
      <Row gutter={[12, 12]} className="dashboard-metrics">
        <Col xs={12} md={8} xl={6}>
          <div className="metric-tile">
            <Statistic title="Ожидают в очереди" value={summary?.queue.waiting ?? 0} loading={dashboardQuery.isLoading} prefix={<OrderedListOutlined />} />
          </div>
        </Col>
        <Col xs={12} md={8} xl={6}>
          <div className="metric-tile">
            <Statistic title="Записи сегодня" value={summary?.appointments.today ?? 0} loading={dashboardQuery.isLoading} prefix={<CalendarOutlined />} />
          </div>
        </Col>
        <Col xs={12} md={8} xl={6}>
          <div className="metric-tile">
            <Statistic title="Приёмы сегодня" value={summary?.visits.totalToday ?? 0} loading={dashboardQuery.isLoading} prefix={<FileDoneOutlined />} />
          </div>
        </Col>
        <Col xs={12} md={8} xl={6}>
          <div className="metric-tile">
            <Statistic title="Оплаты сегодня" value={summary?.finance.paymentsTodayAmount ?? 0} loading={dashboardQuery.isLoading} formatter={(value) => formatMoney(Number(value))} prefix={<WalletOutlined />} />
          </div>
        </Col>
        <Col xs={12} md={8} xl={6}>
          <div className="metric-tile">
            <Statistic title="Стационар" value={summary?.hospital.activePatients ?? 0} loading={dashboardQuery.isLoading} prefix={<MedicineBoxOutlined />} />
          </div>
        </Col>
        <Col xs={12} md={8} xl={6}>
          <div className="metric-tile">
            <Statistic title="Склад: остатки" value={summary?.stock.lowStockProducts ?? 0} loading={dashboardQuery.isLoading} prefix={<ShopOutlined />} />
          </div>
        </Col>
        <Col xs={12} md={8} xl={6}>
          <div className="metric-tile">
            <Statistic title="Онлайн-заявки" value={summary?.onlineRequests.newRequests ?? 0} loading={dashboardQuery.isLoading} prefix={<PlusOutlined />} />
          </div>
        </Col>
        <Col xs={12} md={8} xl={6}>
          <div className="metric-tile">
            <Statistic title="Лаборатория ждёт" value={summary?.laboratory.pending ?? 0} loading={dashboardQuery.isLoading} prefix={<ExperimentOutlined />} />
          </div>
        </Col>
      </Row>
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
            <Button size="small" onClick={() => navigate('/settings/laboratories')}>
              Справочник
            </Button>
          </div>
          <List
            className="compact-list"
            loading={dashboardQuery.isLoading}
            dataSource={summary?.laboratory.items ?? []}
            locale={{ emptyText: 'Ожидающих исследований нет' }}
            renderItem={(item) => (
              <List.Item onClick={() => navigate(`/visits/${item.visit.id}`)}>
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

function getQueueTitle(item: DashboardQueueItem) {
  const animal = item.animal?.nickname ?? item.animalNickname ?? 'Пациент';
  const owner = item.owner?.fullName ?? item.ownerName ?? 'Клиент без карточки';
  return `${animal} · ${owner}`;
}

function toDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
