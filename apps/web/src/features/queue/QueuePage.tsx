import { CheckOutlined, DeleteOutlined, ExportOutlined, FileTextOutlined, PhoneOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button, Popconfirm, Segmented, Select, Space, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { InfiniteTable, useInfiniteListQuery } from '../../shared/ui/InfiniteTable';
import { LiveSearchInput } from '../../shared/ui/LiveSearchInput';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatAnimalAge } from '../../shared/utils/animalBirthDate';
import { formatDateTime } from '../../shared/utils/date';
import { createVisit } from '../visits/visits.api';
import { visitStatusColors, visitStatusLabels } from '../visits/types';
import { cancelQueueEntry, completeQueueEntry, listQueue, startQueueEntry } from './queue.api';
import { createQueueEntryFromForm } from './createQueueEntryFromForm';
import { QueueFormDrawer, QueueFormSubmitInput } from './QueueFormDrawer';
import { QueueWorkstationRoomSelect, useQueueWorkstationDeviceId } from './QueueWorkstationRoomSelect';
import {
  QueueEntry,
  QueueMutationInput,
  QueueStatus,
  QueueUrgency,
  getQueueDisplayStatus,
  queuePurposeLabels,
  queueUrgencyColors,
  queueUrgencyLabels,
} from './types';

export function QueuePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'queue.manage');
  const canCallQueue = hasPermission(auth?.employee, 'queue.call') || canManage;
  const canManageVisits = hasPermission(auth?.employee, 'visits.manage');
  const employeeId = searchParams.get('employeeId') ?? undefined;
  const isPersonalQueue = Boolean(employeeId && employeeId === auth?.employee.id);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<QueueStatus | undefined>('WAITING');
  const [urgency, setUrgency] = useState<QueueUrgency | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const workstationDeviceId = useQueueWorkstationDeviceId();
  const now = useNow();
  const dateRange = getQueueDateRange(status);
  const queueQuery = useInfiniteListQuery({
    queryKey: ['queue', { search, status, urgency, employeeId, ...dateRange }],
    queryFn: ({ limit, offset }) => listQueue({ search, status, urgency, employeeId, limit, offset, ...dateRange }),
  });
  const queueItems = useMemo(() => queueQuery.data?.pages.flatMap((page) => page.items) ?? [], [queueQuery.data]);

  useEffect(() => {
    if (!queueItems.some((item) => item.status === 'IN_PROGRESS' && item.acceptWaitSeconds > 0)) return;
    const timer = window.setInterval(() => void queueQuery.refetch(), 1000);
    return () => window.clearInterval(timer);
  }, [queueItems, queueQuery.refetch]);

  useEffect(() => {
    if (searchParams.get('create') !== '1') {
      return;
    }

    setCreateOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('create');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);
  const createMutation = useMutation({
    mutationFn: (values: QueueFormSubmitInput) => createQueueEntryFromForm(values),
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
        const queueEntry = await startQueueEntry(record.id, workstationDeviceId);
        return { action, queueEntry };
      }

      if (record.visit) {
        return { action, visit: record.visit };
      }

      if (!record.ownerId || !record.animalId) {
        throw new Error('Сначала заведите карточки владельца и пациента');
      }

      if (record.isVaccination) {
        if (action === 'accept') {
          await completeQueueEntry(record.id);
        }
        return { action, vaccinationAnimalId: record.animalId };
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
        visitType: record.visitType ?? 'PRIMARY',
      });

      return { action, visit };
    },
    onSuccess: async (result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['queue'] });
      await queryClient.invalidateQueries({ queryKey: ['visits'] });
      if (result.action === 'call') {
        setStatus('IN_PROGRESS');
      }
      const successText = {
        call: 'Клиент вызван на приём',
        repeat: 'Вызов повторён',
        accept: result.vaccinationAnimalId ? 'Открыта карточка вакцинации' : 'Приём создан и открыт',
        createVisit: result.vaccinationAnimalId ? 'Открыта карточка вакцинации' : 'Приём создан и открыт',
      }[variables.action];
      message.success(successText);
      if ((result.action === 'accept' || result.action === 'createVisit') && result.visit) {
        navigate(`/visits/${result.visit.id}`);
      } else if (result.vaccinationAnimalId) {
        navigate(`/patients/${result.vaccinationAnimalId}?tab=vaccinations&new=vaccination`);
      }
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const cancelMutation = useMutation({
    mutationFn: cancelQueueEntry,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['queue'] });
      message.success('Запись удалена из очереди');
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
        title: 'Возраст',
        key: 'animalAge',
        width: 145,
        render: (_, record) => formatAnimalAge(record.animal?.birthDate),
      },
      {
        title: 'Действие',
        key: 'action',
        width: 210,
        render: (_, record) =>
          canCallQueue || canManageVisits ? (
            <QueueActionButton
              record={record}
              loading={actionMutation.isPending}
              canCallQueue={canCallQueue}
              canManage={canManage}
              canManageVisits={canManageVisits}
              onCall={() => actionMutation.mutate({ record, action: 'call' })}
              onRepeat={() => actionMutation.mutate({ record, action: 'repeat' })}
              onAccept={() => actionMutation.mutate({ record, action: 'accept' })}
              onOpenVisit={() => navigate(`/visits/${record.visit?.id}`)}
              onCreateVisit={() => actionMutation.mutate({ record, action: 'createVisit' })}
              onCancel={() => cancelMutation.mutate(record.id)}
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
      {
        title: 'Прием',
        key: 'visitType',
        width: 120,
        render: (_, record) => record.isVaccination ? queuePurposeLabels.VACCINATION : record.visitType ? queuePurposeLabels[record.visitType] : '—',
      },
      {
        title: 'Состояние приёма',
        key: 'visitStatus',
        width: 155,
        render: (_, record) => {
          if (record.visit) {
            return <Tag color={visitStatusColors[record.visit.status]}>{visitStatusLabels[record.visit.status]}</Tag>;
          }

          if (record.status === 'IN_PROGRESS') {
            return <Tag color="gold">Вызван</Tag>;
          }

          if (record.status === 'WAITING') {
            return <Tag color="blue">Ожидает вызова</Tag>;
          }

          return '—';
        },
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
    [actionMutation, cancelMutation, canCallQueue, canManage, canManageVisits, navigate, now],
  );

  return (
    <div className="page">
      <PageHeader
        title={`${isPersonalQueue ? 'Моя очередь' : 'Электронная очередь'}${queueQuery.data?.pages[0]?.total !== undefined ? ` ${queueQuery.data.pages[0].total}` : ''}`}
        extra={
          <Space>
            {canCallQueue ? <QueueWorkstationRoomSelect deviceId={workstationDeviceId} canChange={canManage} /> : null}
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
            }}
            options={Object.entries(queueUrgencyLabels).map(([value, label]) => ({ value, label }))}
          />
        </div>
        <div className="list-panel-body">
        <Space direction="vertical" size={16} className="full-width">
          <div className="toolbar-row">
            <LiveSearchInput
              allowClear
              enterButton={<SearchOutlined />}
              placeholder="Поиск по клиенту, телефону или пациенту"
              className="search-input"
              onSearch={(value) => {
                setSearch(value.trim());
              }}
            />
          </div>
          <InfiniteTable<QueueEntry>
            query={queueQuery}
            errorText={queueQuery.isError ? getErrorMessage(queueQuery.error) : undefined}
            rowKey="id"
            columns={columns}
            onRow={(record) => ({ onDoubleClick: () => navigate(`/queue/${record.id}`) })}
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
  loading,
  onCall,
  onRepeat,
  onAccept,
  canCallQueue,
  canManage,
  canManageVisits,
  onOpenVisit,
  onCreateVisit,
  onCancel,
}: {
  record: QueueEntry;
  loading: boolean;
  canCallQueue: boolean;
  canManage: boolean;
  canManageVisits: boolean;
  onCall: () => void;
  onRepeat: () => void;
  onAccept: () => void;
  onOpenVisit: () => void;
  onCreateVisit: () => void;
  onCancel: () => void;
}) {
  if (record.status === 'WAITING' && canCallQueue) {
    return (
      <Space size={6} wrap>
        <Button size="small" icon={<PhoneOutlined />} loading={loading} onClick={onCall}>Вызвать</Button>
        {canManage ? (
          <Popconfirm title="Удалить запись из очереди?" okText="Удалить" cancelText="Отмена" onConfirm={onCancel}>
            <Button danger size="small" icon={<DeleteOutlined />}>Удалить из очереди</Button>
          </Popconfirm>
        ) : null}
      </Space>
    );
  }

  if (record.status === 'IN_PROGRESS' && canCallQueue) {
    const waitSeconds = record.acceptWaitSeconds;

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
            {waitSeconds > 0 ? `Начать через ${waitSeconds} с` : record.isVaccination ? 'Начать вакцинацию' : 'Начать приём'}
          </Button>
        ) : null}
        {canManage ? (
          <Popconfirm title="Удалить вызванную запись из очереди?" okText="Удалить" cancelText="Отмена" onConfirm={onCancel}>
            <Button danger size="small" icon={<DeleteOutlined />}>Удалить из очереди</Button>
          </Popconfirm>
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
          {record.isVaccination ? 'Открыть вакцинацию' : 'Создать приём'}
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
