import { CheckOutlined, CloseOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { listAnimals } from '../animals/animals.api';
import { getSchedulingResources } from '../scheduling/scheduling.api';
import { VisitStatus, visitStatusColors, visitStatusLabels } from '../visits/types';
import {
  admitHospitalPatient,
  cancelHospitalStay,
  dischargeHospitalStay,
  getHospitalResources,
  listHospital,
} from './hospital.api';
import { HospitalStay } from './types';

const pageSize = 10;

export function HospitalPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'hospital.manage');
  const [search, setSearch] = useState('');
  const [boxId, setBoxId] = useState<string | undefined>();
  const [status, setStatus] = useState<VisitStatus | undefined>();
  const [offset, setOffset] = useState(0);
  const [admitOpen, setAdmitOpen] = useState(false);
  const hospitalQuery = useQuery({
    queryKey: ['hospital', { search, boxId, status, limit: pageSize, offset }],
    queryFn: () => listHospital({ search, hospitalBoxId: boxId, status, limit: pageSize, offset }),
  });
  const resourcesQuery = useQuery({ queryKey: ['hospital', 'resources'], queryFn: getHospitalResources });
  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'discharge' | 'cancel' }) =>
      action === 'discharge' ? dischargeHospitalStay(id) : cancelHospitalStay(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['hospital'] });
      message.success('Статус стационара обновлён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const columns = useMemo<ColumnsType<HospitalStay>>(
    () => [
      { title: 'Бокс', key: 'box', render: (_, record) => record.hospitalBox?.name ?? '—' },
      {
        title: 'Пациент',
        key: 'animal',
        render: (_, record) => (
          <Button type="link" className="table-link" onClick={() => navigate(`/patients/${record.animalId}`)}>
            {record.animal?.nickname ?? 'Пациент'}
          </Button>
        ),
      },
      { title: 'Вид', key: 'species', render: (_, record) => <AnimalSpeciesLabel species={record.animal?.species} /> },
      { title: 'Владелец', key: 'owner', render: (_, record) => record.owner?.fullName ?? '—' },
      { title: 'Сотрудник', key: 'employee', render: (_, record) => record.employee?.fullName ?? '—' },
      { title: 'Поступил', dataIndex: 'startedAt', key: 'startedAt', render: formatDateTime },
      { title: 'В стационаре', key: 'duration', render: (_, record) => getStayDuration(record.startedAt, record.completedAt) },
      { title: 'Причина / назначения', key: 'purpose', ellipsis: true, render: (_, record) => record.exam?.purpose || record.recommendation?.careNotes || '—' },
      {
        title: 'Счёт',
        key: 'bill',
        render: (_, record) =>
          record.bill ? `${formatMoney(record.bill.paidAmount)} / ${formatMoney(record.bill.totalAmount)}` : '—',
      },
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        render: (value: HospitalStay['status']) => <Tag color={visitStatusColors[value]}>{visitStatusLabels[value]}</Tag>,
      },
      {
        title: 'Действия',
        key: 'actions',
        render: (_, record) => (
          <Space wrap>
            <Button size="small" onClick={() => navigate(`/visits/${record.id}`)}>
              Приём
            </Button>
            {canManage && ['DRAFT', 'IN_PROGRESS'].includes(record.status) ? (
              <>
              <Button size="small" icon={<CheckOutlined />} onClick={() => actionMutation.mutate({ id: record.id, action: 'discharge' })}>
                Выписать
              </Button>
              <Button size="small" danger icon={<CloseOutlined />} onClick={() => actionMutation.mutate({ id: record.id, action: 'cancel' })}>
                Отменить
              </Button>
              </>
            ) : null}
          </Space>
        ),
      },
    ],
    [actionMutation, canManage, navigate],
  );

  function handleTableChange(pagination: TablePaginationConfig) {
    const current = pagination.current ?? 1;
    const size = pagination.pageSize ?? pageSize;
    setOffset((current - 1) * size);
  }

  return (
    <div className="page">
      <PageHeader
        title="Стационар"
        description="Госпитализированные пациенты и боксы на текущий день."
        extra={
          canManage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdmitOpen(true)}>
              Поместить в стационар
            </Button>
          ) : null
        }
      />
      <div className="list-panel">
        <div className="list-panel-header">
          <Input.Search
            allowClear
            enterButton={<SearchOutlined />}
            placeholder="Поиск по пациенту, владельцу или боксу"
            className="search-input"
            onSearch={(value) => {
              setSearch(value.trim());
              setOffset(0);
            }}
          />
          <Select
            allowClear
            placeholder="Бокс"
            className="status-filter"
            value={boxId}
            onChange={(value) => {
              setBoxId(value);
              setOffset(0);
            }}
            options={resourcesQuery.data?.boxes.map((box) => ({ value: box.id, label: box.name })) ?? []}
          />
          <Select
            allowClear
            placeholder="Активные статусы"
            className="status-filter"
            value={status}
            onChange={(value) => {
              setStatus(value);
              setOffset(0);
            }}
            options={hospitalStatusOptions}
          />
        </div>
        <div className="list-panel-body">
          {hospitalQuery.isError ? <Typography.Text type="danger">{getErrorMessage(hospitalQuery.error)}</Typography.Text> : null}
          <Table<HospitalStay>
            rowKey="id"
            className="dense-table"
            columns={columns}
            dataSource={hospitalQuery.data?.items ?? []}
            loading={hospitalQuery.isLoading}
            pagination={{ current: offset / pageSize + 1, pageSize, total: hospitalQuery.data?.total ?? 0, showSizeChanger: false }}
            onChange={handleTableChange}
            onRow={(record) => ({ onDoubleClick: () => navigate(`/visits/${record.id}`) })}
          />
        </div>
      </div>
      <AdmitModal open={admitOpen} onClose={() => setAdmitOpen(false)} />
    </div>
  );
}

const admitSchema = z.object({
  ownerId: z.string().min(1, 'Выберите владельца'),
  animalId: z.string().min(1, 'Выберите пациента'),
  hospitalBoxId: z.string().min(1, 'Выберите бокс'),
  employeeId: z.string().optional(),
  admittedAt: z.string().optional(),
  purpose: z.string().trim().optional(),
});

type AdmitFormValues = z.infer<typeof admitSchema>;

function AdmitModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const resourcesQuery = useQuery({ queryKey: ['hospital', 'resources'], queryFn: getHospitalResources, enabled: open });
  const schedulingQuery = useQuery({ queryKey: ['scheduling', 'resources'], queryFn: getSchedulingResources, enabled: open });
  const animalsQuery = useQuery({ queryKey: ['animals', 'hospital-select'], queryFn: () => listAnimals({ limit: 100, offset: 0 }), enabled: open });
  const { control, handleSubmit, watch, reset } = useForm<AdmitFormValues>({
    resolver: zodResolver(admitSchema),
    defaultValues: {
      ownerId: '',
      animalId: '',
      hospitalBoxId: '',
      employeeId: undefined,
      admittedAt: toDatetimeInput(new Date()),
      purpose: '',
    },
  });
  const selectedOwnerId = watch('ownerId');
  const animals = animalsQuery.data?.items ?? [];
  const mutation = useMutation({
    mutationFn: (values: AdmitFormValues) =>
      admitHospitalPatient({
        ...values,
        admittedAt: values.admittedAt ? new Date(values.admittedAt).toISOString() : undefined,
        status: 'IN_PROGRESS',
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['hospital'] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
      ]);
      message.success('Пациент помещён в стационар');
      reset();
      onClose();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  return (
    <Modal title="Поместить в стационар" open={open} onCancel={onClose} onOk={handleSubmit((values) => mutation.mutate(values))} confirmLoading={mutation.isPending} destroyOnHidden width={680}>
      <Form layout="vertical">
        <div className="form-grid two-columns">
          <Controller
            control={control}
            name="ownerId"
            render={({ field, fieldState }) => (
              <Form.Item label="Владелец" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select
                  {...field}
                  showSearch
                  options={dedupeOwners(animals).map((owner) => ({ value: owner.id, label: owner.fullName }))}
                  placeholder="Выберите владельца"
                />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="animalId"
            render={({ field, fieldState }) => (
              <Form.Item label="Пациент" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select
                  {...field}
                  showSearch
                  loading={animalsQuery.isLoading}
                  options={animals
                    .filter((animal) => !selectedOwnerId || animal.ownerId === selectedOwnerId)
                    .map((animal) => ({ value: animal.id, label: `${animal.nickname}${animal.owner ? ` · ${animal.owner.fullName}` : ''}` }))}
                  placeholder="Выберите пациента"
                />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="hospitalBoxId"
            render={({ field, fieldState }) => (
              <Form.Item label="Бокс" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select {...field} options={resourcesQuery.data?.boxes.map((box) => ({ value: box.id, label: box.name })) ?? []} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="employeeId"
            render={({ field }) => (
              <Form.Item label="Ответственный сотрудник">
                <Select
                  {...field}
                  allowClear
                  options={schedulingQuery.data?.employees.map((employee) => ({ value: employee.id, label: employee.fullName })) ?? []}
                />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="admittedAt"
            render={({ field }) => (
              <Form.Item label="Дата и время поступления">
                <Input {...field} type="datetime-local" />
              </Form.Item>
            )}
          />
        </div>
        <Controller
          control={control}
          name="purpose"
          render={({ field }) => (
            <Form.Item label="Причина помещения">
              <Input.TextArea rows={3} {...field} />
            </Form.Item>
          )}
        />
      </Form>
    </Modal>
  );
}

function dedupeOwners(animals: Array<{ owner?: { id: string; fullName: string } | null }>) {
  const owners = new Map<string, { id: string; fullName: string }>();
  for (const animal of animals) {
    if (animal.owner) {
      owners.set(animal.owner.id, animal.owner);
    }
  }

  return [...owners.values()];
}

function toDatetimeInput(value: Date) {
  const offsetDate = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

const hospitalStatusOptions: Array<{ value: VisitStatus; label: string }> = [
  { value: 'DRAFT', label: visitStatusLabels.DRAFT },
  { value: 'IN_PROGRESS', label: visitStatusLabels.IN_PROGRESS },
  { value: 'COMPLETED', label: visitStatusLabels.COMPLETED },
  { value: 'CANCELLED', label: visitStatusLabels.CANCELLED },
];

function getStayDuration(startedAt: string, completedAt?: string | null) {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return '—';
  }

  const totalMinutes = Math.max(1, Math.floor((end - start) / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days} д ${hours} ч`;
  }

  if (hours > 0) {
    return `${hours} ч ${minutes} мин`;
  }

  return `${minutes} мин`;
}
