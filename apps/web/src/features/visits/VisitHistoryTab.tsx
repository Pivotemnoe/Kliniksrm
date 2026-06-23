import { useQuery } from '@tanstack/react-query';
import { Button, Descriptions, Divider, Empty, Space, Table, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { getVisit, listVisits } from './visits.api';
import { Visit, VisitListItem, visitStatusColors, visitStatusLabels } from './types';

export function VisitHistoryTab({ visit }: { visit: Visit }) {
  const navigate = useNavigate();
  const [selectedVisitId, setSelectedVisitId] = useState(visit.id);
  const historyQuery = useQuery({
    queryKey: ['visits', 'animal-history', visit.animalId],
    queryFn: () => listVisits({ animalId: visit.animalId, limit: 50, offset: 0 }),
  });
  const selectedVisitQuery = useQuery({
    queryKey: ['visits', selectedVisitId],
    queryFn: () => getVisit(selectedVisitId),
    enabled: Boolean(selectedVisitId) && selectedVisitId !== visit.id,
  });

  useEffect(() => {
    setSelectedVisitId(visit.id);
  }, [visit.id]);

  const historyItems = useMemo<VisitListItem[]>(() => {
    const items = historyQuery.data?.items ?? [];
    const merged = items.some((item) => item.id === visit.id) ? items : [visit, ...items];

    return [...merged].sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime());
  }, [historyQuery.data?.items, visit]);
  const selectedSummary = historyItems.find((item) => item.id === selectedVisitId) ?? null;
  const selectedVisit = selectedVisitId === visit.id ? visit : selectedVisitQuery.data;
  const selectedIsLoading = selectedVisitId !== visit.id && selectedVisitQuery.isLoading;
  const selectedError = selectedVisitId !== visit.id ? selectedVisitQuery.error : null;

  return (
    <div className="visit-tab-panel">
      <div className="tab-toolbar">
        <div>
          <Typography.Title level={4}>История болезни</Typography.Title>
          <Typography.Text type="secondary">
            Все приёмы пациента {visit.animal.nickname}. Слева выберите визит, справа отображается подробный лист.
          </Typography.Text>
        </div>
      </div>
      {historyQuery.isError ? <Typography.Text type="danger">{getErrorMessage(historyQuery.error)}</Typography.Text> : null}
      <div className="visit-history-layout">
        <aside className="visit-history-list" aria-label="Список приёмов пациента">
          {historyQuery.isLoading ? <Typography.Text type="secondary">Загрузка истории...</Typography.Text> : null}
          {!historyQuery.isLoading && !historyItems.length ? <Empty description="История приёмов пока пустая" /> : null}
          {historyItems.map((item) => (
            <VisitHistoryListItem
              key={item.id}
              record={item}
              active={item.id === selectedVisitId}
              current={item.id === visit.id}
              onSelect={() => setSelectedVisitId(item.id)}
            />
          ))}
        </aside>
        <section className="visit-history-detail">
          {selectedIsLoading ? <Typography.Text type="secondary">Загрузка приёма...</Typography.Text> : null}
          {selectedError ? <Typography.Text type="danger">{getErrorMessage(selectedError)}</Typography.Text> : null}
          {selectedVisit ? (
            <>
              <VisitHistoryHeader
                visit={selectedVisit}
                currentVisitId={visit.id}
                onOpenCard={(visitId) => navigate(`/visits/${visitId}`)}
              />
              <HistoryDetails visit={selectedVisit} />
            </>
          ) : !selectedIsLoading && !selectedError && selectedSummary ? (
            <Empty description="Подробности приёма не найдены" />
          ) : null}
        </section>
      </div>
    </div>
  );
}

function VisitHistoryListItem({
  record,
  active,
  current,
  onSelect,
}: {
  record: VisitListItem;
  active: boolean;
  current: boolean;
  onSelect: () => void;
}) {
  return (
    <button className={`visit-history-item${active ? ' is-active' : ''}`} type="button" onClick={onSelect}>
      <span className="visit-history-item-title">{getVisitListTitle(record, current)}</span>
      <span className="visit-history-item-date">{formatDateTime(record.startedAt)}</span>
      <span className="visit-history-item-meta">{record.employee?.fullName ?? 'Врач не указан'}</span>
      <span className="visit-history-item-footer">
        <Tag color={visitStatusColors[record.status]}>{visitStatusLabels[record.status]}</Tag>
        <span>{formatRecordCounts(record)}</span>
      </span>
    </button>
  );
}

function VisitHistoryHeader({
  visit,
  currentVisitId,
  onOpenCard,
}: {
  visit: Visit;
  currentVisitId: string;
  onOpenCard: (visitId: string) => void;
}) {
  return (
    <div className="visit-history-detail-header">
      <div>
        <Typography.Title level={4}>{getVisitTitle(visit)}</Typography.Title>
        <Typography.Text type="secondary">
          {formatDateTime(visit.startedAt)} · {getVisitSourceLabel(visit)} · {visit.employee?.fullName ?? 'врач не указан'}
        </Typography.Text>
      </div>
      <Button type="primary" onClick={() => onOpenCard(visit.id)} disabled={visit.id === currentVisitId}>
        {visit.id === currentVisitId ? 'Текущий приём' : 'Открыть карточку'}
      </Button>
      <Descriptions bordered size="small" column={{ xs: 1, md: 3 }} className="visit-history-summary">
        <Descriptions.Item label="Статус">
          <Tag color={visitStatusColors[visit.status]}>{visitStatusLabels[visit.status]}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Вес">{visit.exam?.weightKg ? `${visit.exam.weightKg} кг` : '—'}</Descriptions.Item>
        <Descriptions.Item label="Температура">{visit.exam?.temperatureC ? `${visit.exam.temperatureC} °C` : '—'}</Descriptions.Item>
        <Descriptions.Item label="Сумма">{formatMoney(visit.totalAmount)}</Descriptions.Item>
        <Descriptions.Item label="Оплачено">{visit.bill ? formatMoney(visit.bill.paidAmount) : '—'}</Descriptions.Item>
        <Descriptions.Item label="Завершён">{formatDateTime(visit.completedAt)}</Descriptions.Item>
      </Descriptions>
    </div>
  );
}

function HistoryDetails({ visit }: { visit: Visit }) {
  const billItems = visit.bill?.items ?? [];
  const labItems = visit.laboratoryOrders.flatMap((order) => order.items);

  return (
    <Space direction="vertical" size={18} className="full-width">
      <HistorySection title="Лист осмотра">
        <Descriptions bordered column={1}>
          <Descriptions.Item label="Цель визита">{visit.exam?.purpose || '—'}</Descriptions.Item>
          <Descriptions.Item label="Анамнез">{visit.exam?.anamnesis || '—'}</Descriptions.Item>
          <Descriptions.Item label="Осмотр">{visit.exam?.examination || '—'}</Descriptions.Item>
          <Descriptions.Item label="Симптомы">{visit.exam?.symptoms || '—'}</Descriptions.Item>
          <Descriptions.Item label="Манипуляции">{visit.exam?.manipulations || '—'}</Descriptions.Item>
          <Descriptions.Item label="Комментарий">{visit.exam?.comment || '—'}</Descriptions.Item>
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

function getVisitListTitle(record: VisitListItem, current: boolean) {
  if (record.exam?.purpose) {
    return record.exam.purpose;
  }

  return current ? 'Текущий приём' : getVisitSourceLabel(record);
}

function getVisitTitle(visit: Visit) {
  return visit.exam?.purpose || visit.diagnoses[0]?.title || getVisitSourceLabel(visit);
}

function getVisitSourceLabel(record: Pick<VisitListItem, 'appointmentId' | 'queueEntryId'>) {
  if (record.appointmentId) {
    return 'Запись на приём';
  }

  if (record.queueEntryId) {
    return 'Электронная очередь';
  }

  return 'Прямой приём';
}

function formatRecordCounts(record: VisitListItem) {
  const parts = [
    record._count?.diagnoses ? `${record._count.diagnoses} диагн.` : null,
    record._count?.documents ? `${record._count.documents} док.` : null,
    record.exam?.weightKg ? `${record.exam.weightKg} кг` : null,
  ].filter(Boolean);

  return parts.length ? parts.join(' · ') : 'без записей';
}
