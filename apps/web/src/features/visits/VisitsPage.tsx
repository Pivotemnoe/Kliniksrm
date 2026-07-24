import { OrderedListOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { getAppointment } from '../appointments/appointments.api';
import { getQueueEntry } from '../queue/queue.api';
import { createQueueEntryFromForm } from '../queue/createQueueEntryFromForm';
import { QueueFormDrawer, QueueFormSubmitInput } from '../queue/QueueFormDrawer';
import { createVisit, listVisits } from './visits.api';
import { VisitFormDrawer } from './VisitFormDrawer';
import { CreateVisitInput, VisitListItem, VisitStatus, visitStatusColors, visitStatusLabels } from './types';

const pageSize = 10;

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
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [createQueueOpen, setCreateQueueOpen] = useState(false);
  const appointmentId = searchParams.get('appointmentId') ?? undefined;
  const queueEntryId = searchParams.get('queueEntryId') ?? undefined;
  const initialOwnerId = searchParams.get('ownerId') ?? undefined;
  const initialAnimalId = searchParams.get('animalId') ?? undefined;
  const createRequested = searchParams.get('create') === '1';
  const employeeId = searchParams.get('employeeId') ?? undefined;
  const isPersonalVisits = Boolean(employeeId && employeeId === auth?.employee.id);

  const visitsQuery = useQuery({
    queryKey: ['visits', { search, status, employeeId, limit: pageSize, offset }],
    queryFn: () => listVisits({ search, status, employeeId, limit: pageSize, offset }),
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
      { title: 'Врач/сотрудник', key: 'employee', render: (_, record) => record.employee?.fullName ?? '—' },
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        render: (value: VisitStatus) => <Tag color={visitStatusColors[value]}>{visitStatusLabels[value]}</Tag>,
      },
      { title: 'Сумма', dataIndex: 'totalAmount', key: 'totalAmount', render: formatMoney },
    ],
    [navigate],
  );

  function handleTableChange(pagination: TablePaginationConfig) {
    const current = pagination.current ?? 1;
    const size = pagination.pageSize ?? pageSize;
    setOffset((current - 1) * size);
  }

  function closeCreateDrawer() {
    setCreateOpen(false);
    if (createRequested || appointmentId || queueEntryId || initialOwnerId || initialAnimalId) {
      setSearchParams({});
    }
  }

  return (
    <div className="page">
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
          <Input.Search
            allowClear
            enterButton={<SearchOutlined />}
            placeholder="Поиск по клиенту, пациенту, врачу или диагнозу"
            className="search-input"
            onSearch={(value) => {
              setSearch(value.trim());
              setOffset(0);
            }}
          />
          <Select
            allowClear
            placeholder="Статус"
            className="status-filter"
            value={status}
            onChange={(value) => {
              setStatus(value);
              setOffset(0);
            }}
            options={Object.entries(visitStatusLabels).map(([value, label]) => ({ value, label }))}
          />
        </div>
        <div className="list-panel-body">
        <Space direction="vertical" size={16} className="full-width">
          {visitsQuery.isError ? <Typography.Text type="danger">{getErrorMessage(visitsQuery.error)}</Typography.Text> : null}
          <Table<VisitListItem>
            rowKey="id"
            columns={columns}
            dataSource={visitsQuery.data?.items ?? []}
            loading={visitsQuery.isLoading}
            onRow={(record) => ({ onDoubleClick: () => navigate(`/visits/${record.id}`) })}
            pagination={{
              current: offset / pageSize + 1,
              pageSize,
              total: visitsQuery.data?.total ?? 0,
              showSizeChanger: false,
            }}
            onChange={handleTableChange}
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
