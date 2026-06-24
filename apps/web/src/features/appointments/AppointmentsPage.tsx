import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Input, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime, getDayBounds } from '../../shared/utils/date';
import { createOwner, createOwnerAnimal } from '../owners/owners.api';
import { createAppointment, listAppointments } from './appointments.api';
import { AppointmentFormDrawer, AppointmentFormSubmit } from './AppointmentFormDrawer';
import { EmployeeShiftsPanel } from './EmployeeShiftsPanel';
import {
  Appointment,
  AppointmentStatus,
  appointmentStatusColors,
  appointmentStatusLabels,
} from './types';

const pageSize = 10;

export function AppointmentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'appointments.manage');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState(toDateInput(new Date()));
  const [status, setStatus] = useState<AppointmentStatus | undefined>();
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const dateBounds = getDayBounds(date);
  const appointmentsQuery = useQuery({
    queryKey: ['appointments', { search, status, date, limit: pageSize, offset }],
    queryFn: () => listAppointments({ search, status, ...dateBounds, limit: pageSize, offset }),
  });
  const createMutation = useMutation({
    mutationFn: async (values: AppointmentFormSubmit) => {
      let ownerId = values.appointment.ownerId;
      let animalId = values.appointment.animalId;

      if (values.newOwner && values.newAnimal) {
        const owner = await createOwner(values.newOwner);
        const animal = await createOwnerAnimal(owner.id, values.newAnimal);
        ownerId = owner.id;
        animalId = animal.id;
      }

      if (!ownerId || !animalId) {
        throw new Error('Выберите владельца и пациента');
      }

      return createAppointment({
        ...values.appointment,
        ownerId,
        animalId,
      });
    },
    onSuccess: async (appointment) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['appointments'] }),
        queryClient.invalidateQueries({ queryKey: ['owners'] }),
        queryClient.invalidateQueries({ queryKey: ['animals'] }),
      ]);
      setCreateOpen(false);
      message.success('Запись создана');
      navigate(`/schedule/${appointment.id}`);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const columns = useMemo<ColumnsType<Appointment>>(
    () => [
      {
        title: 'Дата и время',
        dataIndex: 'startsAt',
        key: 'startsAt',
        render: (value: string, record) => (
          <Button type="link" className="table-link" onClick={() => navigate(`/schedule/${record.id}`)}>
            {formatDateTime(value)}
          </Button>
        ),
      },
      { title: 'Клиент', key: 'owner', render: (_, record) => record.owner?.fullName ?? '—' },
      {
        title: 'Пациент',
        key: 'animal',
        render: (_, record) => (
          <Space size={6}>
            <AnimalSpeciesLabel species={record.animal?.species} fallback="Вид не указан" />
            <Typography.Text>{record.animal?.nickname ?? '—'}</Typography.Text>
          </Space>
        ),
      },
      { title: 'Сотрудник', key: 'employee', render: (_, record) => record.employee?.fullName ?? '—' },
      { title: 'Кабинет', key: 'room', render: (_, record) => record.room?.name ?? '—' },
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        render: (value: AppointmentStatus) => <Tag color={appointmentStatusColors[value]}>{appointmentStatusLabels[value]}</Tag>,
      },
      { title: 'Комментарий', dataIndex: 'comment', key: 'comment', ellipsis: true, render: (value: string | null) => value || '—' },
    ],
    [navigate],
  );

  function handleTableChange(pagination: TablePaginationConfig) {
    const current = pagination.current ?? 1;
    const size = pagination.pageSize ?? pageSize;
    setOffset((current - 1) * size);
  }

  return (
    <div className="page">
      <PageHeader
        title="Расписание"
        extra={
          canManage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Записать на приём
            </Button>
          ) : null
        }
      />
      <div className="date-ribbon">
        {getDateRibbon(date).map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={item.value === date}
            onClick={() => {
              setDate(item.value);
              setOffset(0);
            }}
          >
            <span>{item.weekday}</span>
            <strong>{item.day}</strong>
            <span>{item.month}</span>
          </button>
        ))}
      </div>
      <div className="list-panel">
        <Tabs
          items={[
            {
              key: 'appointments',
              label: 'Записи на приём',
              children: (
                <>
                  <div className="list-panel-header">
                    <Input.Search
                      allowClear
                      enterButton={<SearchOutlined />}
                      placeholder="Поиск по клиенту, пациенту или комментарию"
                      className="search-input"
                      onSearch={(value) => {
                        setSearch(value.trim());
                        setOffset(0);
                      }}
                    />
                    <Space wrap>
                      <Input
                        type="date"
                        className="date-filter"
                        value={date}
                        onChange={(event) => {
                          setDate(event.target.value);
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
                        options={Object.entries(appointmentStatusLabels).map(([value, label]) => ({ value, label }))}
                      />
                    </Space>
                  </div>
                  <div className="list-panel-body">
                    <Space direction="vertical" size={16} className="full-width">
                      {appointmentsQuery.isError ? (
                        <Typography.Text type="danger">{getErrorMessage(appointmentsQuery.error)}</Typography.Text>
                      ) : null}
                      <Table<Appointment>
                        rowKey="id"
                        columns={columns}
                        dataSource={appointmentsQuery.data?.items ?? []}
                        loading={appointmentsQuery.isLoading}
                        onRow={(record) => ({ onDoubleClick: () => navigate(`/schedule/${record.id}`) })}
                        pagination={{
                          current: offset / pageSize + 1,
                          pageSize,
                          total: appointmentsQuery.data?.total ?? 0,
                          showSizeChanger: false,
                        }}
                        onChange={handleTableChange}
                        className="dense-table"
                      />
                    </Space>
                  </div>
                </>
              ),
            },
            {
              key: 'employee-shifts',
              label: 'Смены сотрудников',
              children: (
                <div className="list-panel-body">
                  <EmployeeShiftsPanel canManage={canManage} />
                </div>
              ),
            },
          ]}
        />
      </div>
      <AppointmentFormDrawer
        open={createOpen}
        title="Создать запись"
        onClose={() => setCreateOpen(false)}
        onSubmit={(values) => createMutation.mutate(values)}
        isSubmitting={createMutation.isPending}
        submitError={createMutation.error}
      />
    </div>
  );
}

function toDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateRibbon(currentDate: string) {
  const base = currentDate ? new Date(`${currentDate}T00:00:00`) : new Date();
  const start = new Date(base);
  start.setDate(base.getDate() - 3);

  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(start);
    value.setDate(start.getDate() + index);

    return {
      value: toDateInput(value),
      weekday: value.toLocaleDateString('ru-RU', { weekday: 'short' }),
      day: value.toLocaleDateString('ru-RU', { day: 'numeric' }),
      month: value.toLocaleDateString('ru-RU', { month: 'short' }),
    };
  });
}
