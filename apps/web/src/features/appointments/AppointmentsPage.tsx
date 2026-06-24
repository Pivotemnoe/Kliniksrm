import { LeftOutlined, PlusOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
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
  const weekDays = useMemo(() => getWeekDays(date), [date]);
  const weekBounds = useMemo(() => getRangeBounds(weekDays[0].value, weekDays[6].value), [weekDays]);
  const appointmentsQuery = useQuery({
    queryKey: ['appointments', { search, status, date, limit: pageSize, offset }],
    queryFn: () => listAppointments({ search, status, ...dateBounds, limit: pageSize, offset }),
  });
  const weeklyAppointmentsQuery = useQuery({
    queryKey: ['appointments-week', { search, status, from: weekBounds.dateFrom, to: weekBounds.dateTo }],
    queryFn: () => listAppointments({ search, status, ...weekBounds, limit: 100, offset: 0 }),
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
        {weekDays.map((item) => (
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
      <AppointmentsWeekBoard
        days={weekDays}
        selectedDate={date}
        appointments={weeklyAppointmentsQuery.data?.items ?? []}
        loading={weeklyAppointmentsQuery.isLoading}
        total={weeklyAppointmentsQuery.data?.total}
        canManage={canManage}
        onSelectDate={(value) => {
          setDate(value);
          setOffset(0);
        }}
        onMoveWeek={(direction) => {
          setDate(shiftDate(date, direction * 7));
          setOffset(0);
        }}
        onToday={() => {
          setDate(toDateInput(new Date()));
          setOffset(0);
        }}
        onCreate={() => setCreateOpen(true)}
        onOpen={(appointmentId) => navigate(`/schedule/${appointmentId}`)}
      />
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

function AppointmentsWeekBoard({
  days,
  selectedDate,
  appointments,
  loading,
  total,
  canManage,
  onSelectDate,
  onMoveWeek,
  onToday,
  onCreate,
  onOpen,
}: {
  days: WeekDay[];
  selectedDate: string;
  appointments: Appointment[];
  loading: boolean;
  total?: number;
  canManage: boolean;
  onSelectDate: (date: string) => void;
  onMoveWeek: (direction: -1 | 1) => void;
  onToday: () => void;
  onCreate: () => void;
  onOpen: (appointmentId: string) => void;
}) {
  const appointmentsByDay = useMemo(() => groupAppointmentsByDay(appointments), [appointments]);
  const visibleCount = appointments.length;

  return (
    <section className="schedule-app-panel">
      <div className="schedule-app-toolbar">
        <div>
          <Typography.Title level={4}>Неделя записей</Typography.Title>
          <Typography.Text type="secondary">
            {formatCompactDate(days[0].value)} - {formatCompactDate(days[6].value)}
            {typeof total === 'number' ? ` · ${total} записей` : ''}
            {typeof total === 'number' && total > visibleCount ? ` · показаны первые ${visibleCount}` : ''}
          </Typography.Text>
        </div>
        <Space wrap>
          <Button icon={<LeftOutlined />} onClick={() => onMoveWeek(-1)} aria-label="Предыдущая неделя" />
          <Button onClick={onToday}>Сегодня</Button>
          <Button icon={<RightOutlined />} onClick={() => onMoveWeek(1)} aria-label="Следующая неделя" />
          {canManage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
              Записать
            </Button>
          ) : null}
        </Space>
      </div>
      <div className="schedule-week-grid">
        {days.map((day) => {
          const dayAppointments = appointmentsByDay.get(day.value) ?? [];
          const isSelected = day.value === selectedDate;

          return (
            <section key={day.value} className={`schedule-day-card${isSelected ? ' is-active' : ''}`}>
              <button type="button" className="schedule-day-head" onClick={() => onSelectDate(day.value)}>
                <span>
                  {day.weekday}
                  {day.isToday ? <Tag color="green">Сегодня</Tag> : null}
                </span>
                <strong>{day.day}</strong>
                <small>{day.month}</small>
              </button>
              <div className="schedule-day-body">
                {loading ? <span className="schedule-empty">Загрузка</span> : null}
                {!loading && !dayAppointments.length ? <span className="schedule-empty">Свободно</span> : null}
                {!loading
                  ? dayAppointments.slice(0, 4).map((appointment) => (
                      <button
                        key={appointment.id}
                        type="button"
                        className="schedule-appointment-pill"
                        onClick={() => onOpen(appointment.id)}
                      >
                        <span className="schedule-appointment-time">{formatTime(appointment.startsAt)}</span>
                        <span className="schedule-appointment-title">{appointment.animal?.nickname ?? 'Пациент'}</span>
                        <span className="schedule-appointment-meta">{appointment.employee?.fullName ?? appointment.room?.name ?? 'Не назначено'}</span>
                        <Tag color={appointmentStatusColors[appointment.status]}>{appointmentStatusLabels[appointment.status]}</Tag>
                      </button>
                    ))
                  : null}
                {!loading && dayAppointments.length > 4 ? (
                  <button type="button" className="schedule-more-button" onClick={() => onSelectDate(day.value)}>
                    Ещё {dayAppointments.length - 4}
                  </button>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

type WeekDay = {
  value: string;
  weekday: string;
  day: string;
  month: string;
  isToday: boolean;
};

function getWeekDays(currentDate: string): WeekDay[] {
  const base = currentDate ? new Date(`${currentDate}T00:00:00`) : new Date();
  const start = new Date(base);
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(base.getDate() + mondayOffset);
  const today = toDateInput(new Date());

  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(start);
    value.setDate(start.getDate() + index);

    return {
      value: toDateInput(value),
      weekday: value.toLocaleDateString('ru-RU', { weekday: 'short' }),
      day: value.toLocaleDateString('ru-RU', { day: 'numeric' }),
      month: value.toLocaleDateString('ru-RU', { month: 'short' }),
      isToday: toDateInput(value) === today,
    };
  });
}

function getRangeBounds(dateFrom: string, dateTo: string) {
  const start = new Date(`${dateFrom}T00:00:00`);
  const end = new Date(`${dateTo}T23:59:59.999`);

  return {
    dateFrom: start.toISOString(),
    dateTo: end.toISOString(),
  };
}

function groupAppointmentsByDay(appointments: Appointment[]) {
  const groups = new Map<string, Appointment[]>();

  for (const appointment of appointments) {
    const key = toDateInput(new Date(appointment.startsAt));
    const group = groups.get(key);
    if (group) {
      group.push(appointment);
    } else {
      groups.set(key, [appointment]);
    }
  }

  return groups;
}

function shiftDate(date: string, days: number) {
  const value = date ? new Date(`${date}T00:00:00`) : new Date();
  value.setDate(value.getDate() + days);
  return toDateInput(value);
}

function formatTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '--:--';
}

function formatCompactDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
