import { CheckOutlined, ExportOutlined, FileTextOutlined, PhoneOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Input, Segmented, Select, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/utils/date';
import { createOwner, createOwnerAnimal } from '../owners/owners.api';
import { createVisit } from '../visits/visits.api';
import { completeQueueEntry, createQueueEntry, listQueue, startQueueEntry } from './queue.api';
import { QueueFormDrawer, QueueFormSubmitInput } from './QueueFormDrawer';
import {
  QueueEntry,
  QueueMutationInput,
  QueueStatus,
  QueueUrgency,
  getQueueDisplayStatus,
  queueUrgencyColors,
  queueUrgencyLabels,
} from './types';

const pageSize = 10;
const queueAcceptDelayMs = 10_000;

export function QueuePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'queue.manage');
  const canCallQueue = hasPermission(auth?.employee, 'queue.call') || canManage;
  const canManageVisits = hasPermission(auth?.employee, 'visits.manage');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<QueueStatus | undefined>('WAITING');
  const [urgency, setUrgency] = useState<QueueUrgency | undefined>();
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const now = useNow();
  const dateRange = getQueueDateRange(status);
  const queueQuery = useQuery({
    queryKey: ['queue', { search, status, urgency, limit: pageSize, offset, ...dateRange }],
    queryFn: () => listQueue({ search, status, urgency, limit: pageSize, offset, ...dateRange }),
  });
  const createMutation = useMutation({
    mutationFn: async (values: QueueFormSubmitInput) => {
      if (!values.createCards) {
        return createQueueEntry(values);
      }

      const owner = await createOwner(values.createCards.owner);
      const animal = await createOwnerAnimal(owner.id, values.createCards.animal);
      const { createCards, ...queueInput } = values;

      return createQueueEntry({
        ...queueInput,
        ownerId: owner.id,
        animalId: animal.id,
        ownerName: undefined,
        phone: undefined,
        ownerAddress: undefined,
        animalNickname: undefined,
        animalSpecies: undefined,
        animalBreed: undefined,
        animalSex: undefined,
      });
    },
    onSuccess: async (queueEntry) => {
      await queryClient.invalidateQueries({ queryKey: ['queue'] });
      setCreateOpen(false);
      message.success('Пациент добавлен в очередь');
      navigate(`/queue/${queueEntry.id}`);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const actionMutation = useMutation({
    mutationFn: async ({ record, action }: { record: QueueEntry; action: 'call' | 'repeat' | 'accept' | 'createVisit' }) => {
      if (action === 'call' || action === 'repeat') {
        const queueEntry = await startQueueEntry(record.id);
        return { action, queueEntry };
      }

      if (record.visit) {
        return { action, visit: record.visit };
      }

      if (!record.ownerId || !record.animalId) {
        throw new Error('Сначала заведите карточки владельца и пациента');
      }

      if (action === 'accept') {
        await completeQueueEntry(record.id);
      }

      const visit = await createVisit({
        queueEntryId: record.id,
        ownerId: record.ownerId,
        animalId: record.animalId,
        employeeId: record.employeeId ?? undefined,
        startedAt: new Date().toISOString(),
        status: 'IN_PROGRESS',
      });

      return { action, visit };
    },
    onSuccess: async (result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['queue'] });
      await queryClient.invalidateQueries({ queryKey: ['visits'] });
      const successText = {
        call: 'Клиент вызван на приём',
        repeat: 'Вызов повторён',
        accept: 'Приём создан и открыт',
        createVisit: 'Приём создан и открыт',
      }[variables.action];
      message.success(successText);
      if ((result.action === 'accept' || result.action === 'createVisit') && result.visit) {
        navigate(`/visits/${result.visit.id}`);
      }
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const columns = useMemo<ColumnsType<QueueEntry>>(
    () => [
      {
        title: 'Клиент',
        key: 'client',
        width: 190,
        render: (_, record) => (
          <Button type="link" className="table-link" onClick={() => navigate(`/queue/${record.id}`)}>
            {record.owner?.fullName ?? record.ownerName ?? '—'}
          </Button>
        ),
      },
      {
        title: 'Пациент',
        key: 'animal',
        width: 190,
        render: (_, record) => (
          <Space size={6}>
            <AnimalSpeciesLabel species={record.animal?.species ?? record.animalSpecies} fallback="Вид не указан" />
            <Typography.Text>{record.animal?.nickname ?? record.animalNickname ?? '—'}</Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Действие',
        key: 'action',
        width: 210,
        render: (_, record) =>
          canCallQueue || canManageVisits ? (
            <QueueActionButton
              record={record}
              now={now}
              loading={actionMutation.isPending}
              canCallQueue={canCallQueue}
              canManageVisits={canManageVisits}
              onCall={() => actionMutation.mutate({ record, action: 'call' })}
              onRepeat={() => actionMutation.mutate({ record, action: 'repeat' })}
              onAccept={() => actionMutation.mutate({ record, action: 'accept' })}
              onOpenVisit={() => navigate(`/visits/${record.visit?.id}`)}
              onCreateVisit={() => actionMutation.mutate({ record, action: 'createVisit' })}
            />
          ) : null,
      },
      {
        title: 'Срочность',
        dataIndex: 'urgency',
        key: 'urgency',
        width: 120,
        render: (value: QueueUrgency) => <Tag color={queueUrgencyColors[value]}>{queueUrgencyLabels[value]}</Tag>,
      },
      { title: 'Вызовов', dataIndex: 'callCount', key: 'callCount', width: 100, render: (value: number) => value || '—' },
      { title: 'Ожидание', key: 'waiting', width: 120, render: (_, record) => getWaitingTime(record, now) },
      {
        title: 'Статус',
        key: 'status',
        width: 150,
        render: (_, record) => {
          const statusView = getQueueDisplayStatus(record);
          return <Tag color={statusView.color}>{statusView.label}</Tag>;
        },
      },
      {
        title: 'Комментарий',
        dataIndex: 'comment',
        key: 'comment',
        width: 220,
        ellipsis: true,
        render: (value: string | null) => value || '—',
      },
      { title: 'Создана', dataIndex: 'createdAt', key: 'createdAt', width: 145, render: formatDateTime },
      { title: 'Сотрудник', key: 'employee', width: 150, render: (_, record) => record.employee?.fullName ?? '—', responsive: ['xl'] },
      { title: 'Кабинет', key: 'room', width: 120, render: (_, record) => record.room?.name ?? '—', responsive: ['xl'] },
    ],
    [actionMutation, canCallQueue, canManage, canManageVisits, navigate, now],
  );

  function handleTableChange(pagination: TablePaginationConfig) {
    const current = pagination.current ?? 1;
    const size = pagination.pageSize ?? pageSize;
    setOffset((current - 1) * size);
  }

  return (
    <div className="page">
      <PageHeader
        title={`Электронная очередь${queueQuery.data?.total !== undefined ? ` ${queueQuery.data.total}` : ''}`}
        extra={
          <Space>
            <Button icon={<ExportOutlined />} onClick={() => window.open('/queue/tv', '_blank', 'noopener,noreferrer')}>
              Экран для клиентов
            </Button>
            {canManage ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                Добавить в очередь
              </Button>
            ) : null}
          </Space>
        }
      />
      <div className="list-panel">
        <div className="list-panel-header">
          <Segmented
            className="status-tabs"
            value={status ?? 'ALL'}
            onChange={(value) => {
              setStatus(value === 'ALL' ? undefined : (value as QueueStatus));
              setOffset(0);
            }}
            options={[
              { label: 'В очереди', value: 'WAITING' },
              { label: 'Вызваны', value: 'IN_PROGRESS' },
              { label: 'На приём', value: 'COMPLETED' },
              { label: 'Все записи', value: 'ALL' },
            ]}
          />
          <Select
            allowClear
            placeholder="Срочность"
            className="status-filter"
            value={urgency}
            onChange={(value) => {
              setUrgency(value);
              setOffset(0);
            }}
            options={Object.entries(queueUrgencyLabels).map(([value, label]) => ({ value, label }))}
          />
        </div>
        <div className="list-panel-body">
        <Space direction="vertical" size={16} className="full-width">
          <div className="toolbar-row">
            <Input.Search
              allowClear
              enterButton={<SearchOutlined />}
              placeholder="Поиск по клиенту, телефону или пациенту"
              className="search-input"
              onSearch={(value) => {
                setSearch(value.trim());
                setOffset(0);
              }}
            />
          </div>
          {queueQuery.isError ? <Typography.Text type="danger">{getErrorMessage(queueQuery.error)}</Typography.Text> : null}
          <Table<QueueEntry>
            rowKey="id"
            columns={columns}
            dataSource={queueQuery.data?.items ?? []}
            loading={queueQuery.isLoading}
            onRow={(record) => ({ onDoubleClick: () => navigate(`/queue/${record.id}`) })}
            pagination={{
              current: offset / pageSize + 1,
              pageSize,
              total: queueQuery.data?.total ?? 0,
              showSizeChanger: false,
            }}
            onChange={handleTableChange}
            className="dense-table"
            scroll={{ x: 1180 }}
          />
        </Space>
        </div>
      </div>
      <QueueFormDrawer
        open={createOpen}
        title="Добавить в очередь"
        onClose={() => setCreateOpen(false)}
        onSubmit={(values) => createMutation.mutate(values)}
        isSubmitting={createMutation.isPending}
        submitError={createMutation.error}
      />
    </div>
  );
}

function QueueActionButton({
  record,
  now,
  loading,
  onCall,
  onRepeat,
  onAccept,
  canCallQueue,
  canManageVisits,
  onOpenVisit,
  onCreateVisit,
}: {
  record: QueueEntry;
  now: number;
  loading: boolean;
  canCallQueue: boolean;
  canManageVisits: boolean;
  onCall: () => void;
  onRepeat: () => void;
  onAccept: () => void;
  onOpenVisit: () => void;
  onCreateVisit: () => void;
}) {
  if (record.status === 'WAITING' && canCallQueue) {
    return (
      <Button size="small" icon={<PhoneOutlined />} loading={loading} onClick={onCall}>
        Вызвать
      </Button>
    );
  }

  if (record.status === 'IN_PROGRESS' && canCallQueue) {
    const waitSeconds = getQueueAcceptWaitSeconds(record.lastCalledAt ?? record.startedAt, now);

    return (
      <Space size={6} wrap>
        <Button size="small" icon={<PhoneOutlined />} loading={loading} onClick={onRepeat}>
          Повторить
        </Button>
        {canManageVisits ? (
          <Button
            size="small"
            type="primary"
            icon={<CheckOutlined />}
            loading={loading}
            disabled={waitSeconds > 0}
            onClick={onAccept}
          >
            {waitSeconds > 0 ? `Начать через ${waitSeconds} с` : 'Начать приём'}
          </Button>
        ) : null}
      </Space>
    );
  }

  if (record.status === 'COMPLETED') {
    if (record.visit) {
      return (
        <Button size="small" icon={<FileTextOutlined />} onClick={onOpenVisit}>
          {record.visit.status === 'COMPLETED' ? 'Открыть завершённый' : 'Открыть приём'}
        </Button>
      );
    }

    if (canManageVisits && record.ownerId && record.animalId) {
      return (
        <Button size="small" icon={<FileTextOutlined />} onClick={onCreateVisit}>
          Создать приём
        </Button>
      );
    }
  }

  return <Typography.Text type="secondary">—</Typography.Text>;
}

function useNow() {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(timerId);
  }, []);

  return now;
}

function getQueueAcceptWaitSeconds(startedAt: string | null, now: number) {
  if (!startedAt) {
    return Math.ceil(queueAcceptDelayMs / 1000);
  }

  const elapsedMs = now - new Date(startedAt).getTime();

  return Math.max(0, Math.ceil((queueAcceptDelayMs - elapsedMs) / 1000));
}

function getWaitingTime(record: QueueEntry, now: number) {
  if (record.status === 'CANCELLED') {
    return '—';
  }

  const endTime =
    record.status === 'COMPLETED'
      ? record.completedAt ?? record.lastCalledAt ?? record.startedAt ?? undefined
      : record.startedAt ?? record.lastCalledAt ?? undefined;
  const endMs = endTime ? new Date(endTime).getTime() : now;
  const minutes = Math.max(0, Math.floor((endMs - new Date(record.createdAt).getTime()) / 60000));

  if (minutes < 60) {
    return `${minutes} мин`;
  }

  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}

function getQueueDateRange(status?: QueueStatus) {
  if (status !== undefined && status !== 'COMPLETED') {
    return {};
  }

  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);

  return {
    dateFrom: from.toISOString(),
    dateTo: to.toISOString(),
  };
}
