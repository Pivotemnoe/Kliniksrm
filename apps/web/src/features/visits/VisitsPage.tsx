import { FolderOpenOutlined, OrderedListOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Select, Space, Tag } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { InfiniteTable, useInfiniteListQuery } from '../../shared/ui/InfiniteTable';
import { LiveSearchInput } from '../../shared/ui/LiveSearchInput';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatAnimalAge } from '../../shared/utils/animalBirthDate';
import { formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { getAppointment } from '../appointments/appointments.api';
import { getQueueEntry } from '../queue/queue.api';
import { createQueueEntryFromForm } from '../queue/createQueueEntryFromForm';
import { QueueFormDrawer, QueueFormSubmitInput } from '../queue/QueueFormDrawer';
import { createVisit, listVisits } from './visits.api';
import { VisitFormDrawer } from './VisitFormDrawer';
import { CreateVisitInput, VisitListItem, VisitStatus, visitStatusColors, visitStatusLabels } from './types';

export function VisitsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'visits.manage');
  const canManageQueue = hasPermission(auth?.employee, 'queue.manage');
  const canCreateQueue = canManageQueue || canManage;
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<VisitStatus | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [createQueueOpen, setCreateQueueOpen] = useState(false);
  const appointmentId = searchParams.get('appointmentId') ?? undefined;
  const queueEntryId = searchParams.get('queueEntryId') ?? undefined;
  const initialOwnerId = searchParams.get('ownerId') ?? undefined;
  const initialAnimalId = searchParams.get('animalId') ?? undefined;
  const createRequested = searchParams.get('create') === '1';
  const employeeId = searchParams.get('employeeId') ?? undefined;
  const isPersonalVisits = Boolean(employeeId && employeeId === auth?.employee.id);

  const visitsQuery = useInfiniteListQuery({
    queryKey: ['visits', { search, status, employeeId }],
    queryFn: ({ limit, offset }) => listVisits({ search, status, employeeId, limit, offset }),
  });
  const appointmentQuery = useQuery({
    queryKey: ['appointments', appointmentId],
    queryFn: () => getAppointment(appointmentId!),
    enabled: Boolean(appointmentId),
  });
  const queueQuery = useQuery({
    queryKey: ['queue', queueEntryId],
    queryFn: () => getQueueEntry(queueEntryId!),
    enabled: Boolean(queueEntryId),
  });
  const createMutation = useMutation({
    mutationFn: (values: CreateVisitInput) => createVisit(values),
    onSuccess: async (visit) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
        queryClient.invalidateQueries({ queryKey: ['appointments'] }),
        queryClient.invalidateQueries({ queryKey: ['queue'] }),
      ]);
      setCreateOpen(false);
      setSearchParams({});
      message.success('Приём создан');
      navigate(`/visits/${visit.id}`);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const createQueueMutation = useMutation({
    mutationFn: (values: QueueFormSubmitInput) => createQueueEntryFromForm(values),
    onSuccess: async (queueEntry) => {
      await queryClient.invalidateQueries({ queryKey: ['queue'] });
      setCreateQueueOpen(false);
      message.success('Пациент добавлен в очередь');
      navigate(`/queue/${queueEntry.id}`);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const sourceContext = appointmentQuery.data
    ? ({ type: 'appointment' as const, appointment: appointmentQuery.data })
    : queueQuery.data
      ? ({ type: 'queue' as const, queueEntry: queueQuery.data })
      : null;

  useEffect(() => {
    if (appointmentQuery.data?.visit) {
      navigate(`/visits/${appointmentQuery.data.visit.id}`, { replace: true });
      return;
    }

    if (queueQuery.data?.visit) {
      navigate(`/visits/${queueQuery.data.visit.id}`, { replace: true });
      return;
    }

    if (createRequested || (appointmentId && appointmentQuery.data) || (queueEntryId && queueQuery.data) || (initialOwnerId && initialAnimalId)) {
      setCreateOpen(true);
    }
  }, [appointmentId, appointmentQuery.data, createRequested, initialAnimalId, initialOwnerId, navigate, queueEntryId, queueQuery.data]);

  const columns = useMemo<ColumnsType<VisitListItem>>(
    () => [
      {
        title: 'Дата',
        dataIndex: 'startedAt',
        key: 'startedAt',
        render: (value: string, record) => (
          <Button type="link" className="table-link" onClick={() => navigate(`/visits/${record.id}`)}>
            {formatDateTime(value)}
          </Button>
        ),
      },
      { title: 'Владелец', key: 'owner', render: (_, record) => record.owner?.fullName ?? '—' },
      { title: 'Пациент', key: 'animal', render: (_, record) => record.animal?.nickname ?? '—' },
      { title: 'Возраст', key: 'animalAge', render: (_, record) => formatAnimalAge(record.animal?.birthDate) },
      { title: 'Врач/сотрудник', key: 'employee', render: (_, record) => record.employee?.fullName ?? '—' },
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        render: (value: VisitStatus) => <Tag color={visitStatusColors[value]}>{visitStatusLabels[value]}</Tag>,
      },
      { title: 'Сумма', dataIndex: 'totalAmount', key: 'totalAmount', render: formatMoney },
      {
        title: 'Действия',
        key: 'actions',
        width: 130,
        render: (_, record) => (
          <Button size="small" icon={<FolderOpenOutlined />} onClick={() => navigate(`/visits/${record.id}`)}>
            Открыть
          </Button>
        ),
      },
    ],
    [navigate],
  );

  function closeCreateDrawer() {
    setCreateOpen(false);
    if (createRequested || appointmentId || queueEntryId || initialOwnerId || initialAnimalId) {
      setSearchParams({});
    }
  }

  return (
    <div className="page visits-page">
      <PageHeader
        title={isPersonalVisits ? 'Мои приёмы' : 'Приёмы'}
        extra={
          canManage || canCreateQueue ? (
            <Space wrap>
              {canCreateQueue ? (
                <Button icon={<OrderedListOutlined />} onClick={() => setCreateQueueOpen(true)}>
                  Добавить в очередь
                </Button>
              ) : null}
              {canManage ? (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                  Добавить на приём
                </Button>
              ) : null}
            </Space>
          ) : null
        }
      />
      <div className="list-panel">
        <div className="list-panel-header">
          <LiveSearchInput
            allowClear
            enterButton={<SearchOutlined />}
            placeholder="Поиск по клиенту, пациенту, врачу или диагнозу"
            className="search-input"
            onSearch={(value) => {
              setSearch(value.trim());
            }}
          />
          <Select
            allowClear
            placeholder="Статус"
            className="status-filter"
            value={status}
            onChange={(value) => {
              setStatus(value);
            }}
            options={Object.entries(visitStatusLabels).map(([value, label]) => ({ value, label }))}
          />
        </div>
        <div className="list-panel-body">
        <Space direction="vertical" size={16} className="full-width">
          <InfiniteTable<VisitListItem>
            query={visitsQuery}
            errorText={visitsQuery.isError ? getErrorMessage(visitsQuery.error) : undefined}
            rowKey="id"
            columns={columns}
            onRow={(record) => ({ onDoubleClick: () => navigate(`/visits/${record.id}`) })}
            className="dense-table"
          />
        </Space>
        </div>
      </div>
      <VisitFormDrawer
        open={createOpen}
        sourceContext={sourceContext}
        initialOwnerId={initialOwnerId}
        initialAnimalId={initialAnimalId}
        onClose={closeCreateDrawer}
        onSubmit={(values) => createMutation.mutate(values)}
        isSubmitting={createMutation.isPending}
        submitError={createMutation.error ?? appointmentQuery.error ?? queueQuery.error}
      />
      <QueueFormDrawer
        open={createQueueOpen}
        title="Добавить в очередь"
        onClose={() => setCreateQueueOpen(false)}
        onSubmit={(values) => createQueueMutation.mutate(values)}
        isSubmitting={createQueueMutation.isPending}
        submitError={createQueueMutation.error}
      />
    </div>
  );
}
