import { useQuery } from '@tanstack/react-query';
import { Button, Descriptions, Divider, Drawer, Empty, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { getVisit, listVisits } from './visits.api';
import { Visit, VisitListItem, visitStatusColors, visitStatusLabels } from './types';

export function VisitHistoryTab({ visit }: { visit: Visit }) {
  const navigate = useNavigate();
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const historyQuery = useQuery({
    queryKey: ['visits', 'animal-history', visit.animalId],
    queryFn: () => listVisits({ animalId: visit.animalId, limit: 30, offset: 0 }),
  });
  const selectedVisitQuery = useQuery({
    queryKey: ['visits', selectedVisitId],
    queryFn: () => getVisit(selectedVisitId!),
    enabled: Boolean(selectedVisitId),
  });
  const columns = useMemo<ColumnsType<VisitListItem>>(
    () => [
      {
        title: 'Дата',
        dataIndex: 'startedAt',
        key: 'startedAt',
        width: 180,
        render: formatDateTime,
      },
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        width: 150,
        render: (value: VisitListItem['status'], record) => (
          <Tag color={visitStatusColors[value]}>{record.id === visit.id ? 'Текущий · ' : ''}{visitStatusLabels[value]}</Tag>
        ),
      },
      {
        title: 'Врач',
        key: 'employee',
        render: (_, record) => record.employee?.fullName ?? '—',
      },
      {
        title: 'Итог',
        dataIndex: 'totalAmount',
        key: 'totalAmount',
        width: 140,
        render: formatMoney,
      },
      {
        title: 'Записи',
        key: 'counts',
        width: 180,
        render: (_, record) => `Диагнозы: ${record._count?.diagnoses ?? 0}, документы: ${record._count?.documents ?? 0}`,
      },
      {
        title: '',
        key: 'action',
        width: 100,
        render: (_, record) => (
          <Button size="small" type="link" onClick={() => setSelectedVisitId(record.id)}>
            Смотреть
          </Button>
        ),
      },
    ],
    [visit.id],
  );

  return (
    <div className="visit-tab-panel">
      <div className="tab-toolbar">
        <div>
          <Typography.Title level={4}>История болезни</Typography.Title>
          <Typography.Text type="secondary">
            Все приёмы пациента {visit.animal.nickname} в клинике, включая текущий.
          </Typography.Text>
        </div>
      </div>
      {historyQuery.isError ? <Typography.Text type="danger">{getErrorMessage(historyQuery.error)}</Typography.Text> : null}
      <Table<VisitListItem>
        rowKey="id"
        className="dense-table"
        columns={columns}
        dataSource={historyQuery.data?.items ?? []}
        loading={historyQuery.isLoading}
        pagination={false}
        locale={{ emptyText: 'История приёмов пока пустая' }}
        onRow={(record) => ({ onDoubleClick: () => setSelectedVisitId(record.id) })}
      />
      <HistoryDrawer
        currentVisitId={visit.id}
        open={Boolean(selectedVisitId)}
        visit={selectedVisitQuery.data}
        isLoading={selectedVisitQuery.isLoading}
        error={selectedVisitQuery.error}
        onClose={() => setSelectedVisitId(null)}
        onNavigate={(visitId) => {
          setSelectedVisitId(null);
          navigate(`/visits/${visitId}`);
        }}
      />
    </div>
  );
}

function HistoryDrawer({
  currentVisitId,
  open,
  visit,
  isLoading,
  error,
  onClose,
  onNavigate,
}: {
  currentVisitId: string;
  open: boolean;
  visit?: Visit;
  isLoading: boolean;
  error: unknown;
  onClose: () => void;
  onNavigate: (visitId: string) => void;
}) {
  return (
    <Drawer
      title={visit ? `Приём от ${formatDateTime(visit.startedAt)}` : 'Приём'}
      width={760}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={
        visit ? (
          <Button type="primary" onClick={() => onNavigate(visit.id)} disabled={visit.id === currentVisitId}>
            {visit.id === currentVisitId ? 'Текущий приём' : 'Открыть карточку'}
          </Button>
        ) : null
      }
    >
      {isLoading ? <Typography.Text type="secondary">Загрузка приёма...</Typography.Text> : null}
      {error ? <Typography.Text type="danger">{getErrorMessage(error)}</Typography.Text> : null}
      {visit ? <HistoryDetails visit={visit} /> : !isLoading && !error ? <Empty description="Приём не найден" /> : null}
    </Drawer>
  );
}

function HistoryDetails({ visit }: { visit: Visit }) {
  const billItems = visit.bill?.items ?? [];
  const labItems = visit.laboratoryOrders.flatMap((order) => order.items);

  return (
    <Space direction="vertical" size={18} className="full-width">
      <Descriptions bordered column={1}>
        <Descriptions.Item label="Статус">
          <Tag color={visitStatusColors[visit.status]}>{visitStatusLabels[visit.status]}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Врач">{visit.employee?.fullName ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Сумма">{formatMoney(visit.totalAmount)}</Descriptions.Item>
      </Descriptions>

      <HistorySection title="Лист осмотра">
        <Descriptions bordered column={1}>
          <Descriptions.Item label="Вес">{visit.exam?.weightKg ? `${visit.exam.weightKg} кг` : '—'}</Descriptions.Item>
          <Descriptions.Item label="Температура">{visit.exam?.temperatureC ? `${visit.exam.temperatureC} °C` : '—'}</Descriptions.Item>
          <Descriptions.Item label="Жалобы">{visit.exam?.purpose || '—'}</Descriptions.Item>
          <Descriptions.Item label="Анамнез">{visit.exam?.anamnesis || '—'}</Descriptions.Item>
          <Descriptions.Item label="Осмотр">{visit.exam?.examination || '—'}</Descriptions.Item>
          <Descriptions.Item label="Симптомы">{visit.exam?.symptoms || '—'}</Descriptions.Item>
          <Descriptions.Item label="Манипуляции">{visit.exam?.manipulations || '—'}</Descriptions.Item>
        </Descriptions>
      </HistorySection>

      <HistorySection title="Диагнозы">
        {visit.diagnoses.length ? (
          <Space direction="vertical" size={8} className="full-width">
            {visit.diagnoses.map((diagnosis) => (
              <div className="history-detail-card" key={diagnosis.id}>
                <strong>{diagnosis.title}</strong>
                <Typography.Text type="secondary">
                  {[diagnosis.diagnosisType, diagnosis.status].filter(Boolean).join(' · ') || 'Без типа и статуса'}
                </Typography.Text>
                {diagnosis.description ? <Typography.Paragraph>{diagnosis.description}</Typography.Paragraph> : null}
              </div>
            ))}
          </Space>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Диагнозы не добавлены" />
        )}
      </HistorySection>

      <HistorySection title="Рекомендации">
        <Descriptions bordered column={1}>
          <Descriptions.Item label="План лечения">{visit.recommendation?.treatmentPlan || '—'}</Descriptions.Item>
          <Descriptions.Item label="Уход и назначения">{visit.recommendation?.careNotes || '—'}</Descriptions.Item>
        </Descriptions>
      </HistorySection>

      <HistorySection title="Товары и услуги">
        {billItems.length ? (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={billItems}
            columns={[
              { title: 'Позиция', dataIndex: 'title', key: 'title' },
              { title: 'Кол-во', dataIndex: 'quantity', key: 'quantity', width: 90 },
              { title: 'Сумма', dataIndex: 'totalAmount', key: 'totalAmount', width: 120, render: formatMoney },
            ]}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Товары и услуги не добавлены" />
        )}
      </HistorySection>

      <HistorySection title="Лаборатория">
        {labItems.length ? (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={labItems}
            columns={[
              { title: 'Анализ', dataIndex: 'title', key: 'title' },
              { title: 'Статус', dataIndex: 'status', key: 'status', width: 130 },
              { title: 'Результат', key: 'result', render: (_, item) => item.resultValue || item.resultText || '—' },
            ]}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Лабораторные назначения не добавлены" />
        )}
      </HistorySection>
    </Space>
  );
}

function HistorySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <Divider orientation="left">{title}</Divider>
      {children}
    </section>
  );
}
