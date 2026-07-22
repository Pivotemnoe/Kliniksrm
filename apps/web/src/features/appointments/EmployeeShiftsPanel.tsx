import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  LeftOutlined,
  PlusOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Checkbox, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { fromDatetimeLocal, formatDateTime, toDatetimeLocal } from '../../shared/utils/date';
import {
  createEmployeeShift,
  createEmployeeShifts,
  deleteEmployeeShift,
  disableEmployeeShift,
  getSchedulingResources,
  listEmployeeShifts,
  updateEmployeeShift,
} from '../scheduling/scheduling.api';
import { EmployeeShift, EmployeeShiftPayload } from '../scheduling/types';

const shiftSchema = z
  .object({
    employeeId: z.string().trim().min(1, 'Выберите сотрудника'),
    startsAt: z.string().trim().min(1, 'Укажите начало смены'),
    endsAt: z.string().trim().min(1, 'Укажите окончание смены'),
    comment: z.string().trim().max(500, 'До 500 символов').optional(),
    isActive: z.boolean().default(true),
  })
  .superRefine((values, context) => {
    const startsAt = values.startsAt ? new Date(values.startsAt) : null;
    const endsAt = values.endsAt ? new Date(values.endsAt) : null;

    if (startsAt && endsAt && startsAt >= endsAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'Окончание должно быть позже начала',
      });
    }
  });

type ShiftFormValues = z.output<typeof shiftSchema>;
type ShiftFormInput = z.input<typeof shiftSchema>;
type CopyDraft = {
  title: string;
  shifts: EmployeeShift[];
  sourceDate: string;
};

export function EmployeeShiftsPanel({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const [date, setDate] = useState(toDateInput(new Date()));
  const [employeeId, setEmployeeId] = useState<string>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<EmployeeShift | null>(null);
  const [copyDraft, setCopyDraft] = useState<CopyDraft | null>(null);
  const [copyTargetDates, setCopyTargetDates] = useState<string[]>([]);
  const weekDays = useMemo(() => getWeekDays(date), [date]);
  const weekBounds = useMemo(() => getRangeBounds(weekDays[0].value, weekDays[6].value), [weekDays]);
  const resourcesQuery = useQuery({ queryKey: ['scheduling', 'resources'], queryFn: getSchedulingResources });
  const shiftsQuery = useQuery({
    queryKey: ['employee-shifts', { employeeId, from: weekBounds.dateFrom, to: weekBounds.dateTo }],
    queryFn: () => listEmployeeShifts({ employeeId, from: weekBounds.dateFrom, to: weekBounds.dateTo }),
  });
  const employees = resourcesQuery.data?.employees ?? [];
  const selectedDayShifts = useMemo(
    () => (shiftsQuery.data ?? []).filter((shift) => overlapsDay(shift, date)),
    [date, shiftsQuery.data],
  );
  const { control, getValues, handleSubmit, reset, setValue } = useForm<ShiftFormInput, unknown, ShiftFormValues>({
    resolver: zodResolver(shiftSchema),
    defaultValues: getDefaultShiftValues(date, null),
  });

  const saveMutation = useMutation({
    mutationFn: (values: ShiftFormValues) => {
      const payload = {
        employeeId: values.employeeId,
        startsAt: fromDatetimeLocal(values.startsAt)!,
        endsAt: fromDatetimeLocal(values.endsAt)!,
        comment: values.comment || null,
        isActive: values.isActive,
      };

      return editingShift ? updateEmployeeShift(editingShift.id, payload) : createEmployeeShift(payload);
    },
    onSuccess: async () => {
      await invalidateShifts(queryClient);
      message.success(editingShift ? 'Смена сохранена' : 'Смена добавлена');
      closeModal();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const disableMutation = useMutation({
    mutationFn: disableEmployeeShift,
    onSuccess: async () => {
      await invalidateShifts(queryClient);
      message.success('Смена отключена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEmployeeShift,
    onSuccess: async () => {
      await invalidateShifts(queryClient);
      message.success('Смена удалена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const copyMutation = useMutation({
    mutationFn: async ({ shifts, targetDates }: { shifts: EmployeeShift[]; targetDates: string[] }) => {
      const payloads = targetDates.flatMap((date) =>
        shifts.map((shift) => buildCopiedShiftPayload(shift, date)),
      );

      return createEmployeeShifts(payloads);
    },
    onSuccess: async (_, variables) => {
      await invalidateShifts(queryClient);
      setDate(variables.targetDates[0]);
      const shiftsCount = variables.shifts.length * variables.targetDates.length;
      message.success(`Скопировано смен: ${shiftsCount}`);
      closeCopyModal();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const columns = useMemo<ColumnsType<EmployeeShift>>(
    () => [
      {
        title: 'Время',
        key: 'time',
        width: 260,
        render: (_, shift) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{formatDateTime(shift.startsAt)}</Typography.Text>
            <Typography.Text type="secondary">до {formatDateTime(shift.endsAt)}</Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Сотрудник',
        key: 'employee',
        width: 240,
        render: (_, shift) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{shift.employee.fullName}</Typography.Text>
            <Typography.Text type="secondary">{shift.employee.position || 'Должность не указана'}</Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Контроль входа',
        key: 'loginControl',
        width: 190,
        render: (_, shift) =>
          shift.employee.restrictLoginToShifts ? <Tag color="orange">Вход только в смену</Tag> : <Tag>Не ограничен</Tag>,
      },
      {
        title: 'Статус',
        dataIndex: 'isActive',
        key: 'isActive',
        width: 120,
        render: (value: boolean) => (value ? <Tag color="green">Активна</Tag> : <Tag>Отключена</Tag>),
      },
      { title: 'Комментарий', dataIndex: 'comment', key: 'comment', ellipsis: true, render: (value: string | null) => value || '—' },
      {
        title: 'Действия',
        key: 'actions',
        width: 320,
        render: (_, shift) =>
          canManage ? (
            <Space wrap>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(shift)}>
                Изменить
              </Button>
              <Button size="small" icon={<CopyOutlined />} onClick={() => openCopyShift(shift)}>
                Копировать
              </Button>
              {shift.isActive ? (
                <Button size="small" icon={<EyeInvisibleOutlined />} onClick={() => confirmDisable(shift)}>
                  Скрыть
                </Button>
              ) : null}
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => confirmDelete(shift)}>
                Удалить
              </Button>
            </Space>
          ) : null,
      },
    ],
    [canManage],
  );

  function openCreate(targetDate = date) {
    setEditingShift(null);
    reset(getDefaultShiftValues(targetDate, null, employeeId ?? employees[0]?.id));
    setModalOpen(true);
  }

  function openCreateForDate(targetDate: string) {
    setDate(targetDate);
    openCreate(targetDate);
  }

  function openEdit(shift: EmployeeShift) {
    setEditingShift(shift);
    reset(getDefaultShiftValues(date, shift));
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingShift(null);
    reset(getDefaultShiftValues(date, null, employeeId ?? employees[0]?.id));
  }

  function openCopyShift(shift: EmployeeShift) {
    const sourceDate = toDateInput(new Date(shift.startsAt));
    setCopyDraft({
      title: `Копировать смену: ${shift.employee.fullName}`,
      shifts: [shift],
      sourceDate,
    });
    setCopyTargetDates([shiftDate(sourceDate, 1)]);
  }

  function openCopyDay(sourceDate: string, shifts: EmployeeShift[]) {
    const activeShifts = shifts.filter((shift) => shift.isActive);
    if (!activeShifts.length) {
      message.warning('В этом дне нет активных смен для копирования');
      return;
    }

    setDate(sourceDate);
    setCopyDraft({
      title: `Копировать день ${formatCompactDate(sourceDate)}`,
      shifts: activeShifts,
      sourceDate,
    });
    setCopyTargetDates([shiftDate(sourceDate, 7)]);
  }

  function closeCopyModal() {
    setCopyDraft(null);
    setCopyTargetDates([]);
  }

  function confirmDisable(shift: EmployeeShift) {
    modal.confirm({
      title: 'Скрыть смену?',
      content: `${shift.employee.fullName}: ${formatDateTime(shift.startsAt)} - ${formatDateTime(shift.endsAt)}`,
      okText: 'Скрыть',
      cancelText: 'Отмена',
      onOk: () => disableMutation.mutateAsync(shift.id),
    });
  }

  function confirmDelete(shift: EmployeeShift) {
    modal.confirm({
      title: 'Удалить смену из графика?',
      content: `${shift.employee.fullName}: ${formatDateTime(shift.startsAt)} - ${formatDateTime(shift.endsAt)}`,
      okText: 'Удалить',
      okButtonProps: { danger: true },
      cancelText: 'Отмена',
      onOk: () => deleteMutation.mutateAsync(shift.id),
    });
  }

  function setFullDayShift() {
    const currentStart = getValues('startsAt');
    const targetDate = currentStart?.slice(0, 10) || date;

    setValue('startsAt', `${targetDate}T00:00`, { shouldDirty: true, shouldValidate: true });
    setValue('endsAt', `${shiftDate(targetDate, 1)}T00:00`, { shouldDirty: true, shouldValidate: true });
  }

  return (
    <Space direction="vertical" size={16} className="full-width">
      <Alert
        type="info"
        showIcon
        message="Смены сотрудников"
        description="Если в карточке сотрудника включён вход только во время смены, без активной смены он не сможет войти и продолжить работу в CRM."
      />
      <div className="list-panel-header inner">
        <Space wrap>
          <Input
            type="date"
            className="date-filter"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <Select
            allowClear
            placeholder="Все сотрудники"
            className="status-filter"
            value={employeeId}
            options={employees.map((employee) => ({ value: employee.id, label: getEmployeeLabel(employee) }))}
            onChange={setEmployeeId}
          />
        </Space>
        {canManage ? (
          <Button type="primary" icon={<PlusOutlined />} disabled={!employees.length} onClick={() => openCreate()}>
            Добавить смену
          </Button>
        ) : null}
      </div>
      <EmployeeShiftWeekBoard
        days={weekDays}
        selectedDate={date}
        shifts={shiftsQuery.data ?? []}
        loading={resourcesQuery.isLoading || shiftsQuery.isLoading}
        canManage={canManage}
        onSelectDate={setDate}
        onMoveWeek={(direction) => setDate(shiftDate(date, direction * 7))}
        onToday={() => setDate(toDateInput(new Date()))}
        onCreate={openCreateForDate}
        onEdit={openEdit}
        onCopy={openCopyShift}
        onDelete={confirmDelete}
        onCopyDay={openCopyDay}
      />
      {resourcesQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(resourcesQuery.error)} /> : null}
      {shiftsQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(shiftsQuery.error)} /> : null}
      <div className="shift-table-title">
        <Typography.Title level={5}>Смены выбранного дня</Typography.Title>
        <Typography.Text type="secondary">{formatCompactDate(date)}</Typography.Text>
      </div>
      <Table<EmployeeShift>
        rowKey="id"
        className="dense-table"
        columns={columns}
        dataSource={selectedDayShifts}
        loading={resourcesQuery.isLoading || shiftsQuery.isLoading}
        pagination={false}
        scroll={{ x: 1100 }}
        locale={{ emptyText: 'На выбранный день смены не выставлены' }}
      />
      <Modal
        title={editingShift ? 'Редактировать смену' : 'Добавить смену'}
        width={620}
        open={modalOpen}
        onCancel={closeModal}
        destroyOnHidden
        footer={
          <Space>
            <Button onClick={closeModal}>Отмена</Button>
            <Button type="primary" loading={saveMutation.isPending} onClick={handleSubmit((values) => saveMutation.mutate(values))}>
              Сохранить
            </Button>
          </Space>
        }
      >
        <Form layout="vertical">
          <Controller
            control={control}
            name="employeeId"
            render={({ field, fieldState }) => (
              <Form.Item label="Сотрудник" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select
                  {...field}
                  showSearch
                  optionFilterProp="label"
                  options={employees.map((employee) => ({ value: employee.id, label: getEmployeeLabel(employee) }))}
                />
              </Form.Item>
            )}
          />
          <div className="form-grid two-columns">
            <Controller
              control={control}
              name="startsAt"
              render={({ field, fieldState }) => (
                <Form.Item label="Начало" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                  <Input {...field} type="datetime-local" />
                </Form.Item>
              )}
            />
            <Controller
              control={control}
              name="endsAt"
              render={({ field, fieldState }) => (
                <Form.Item label="Окончание" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                  <Input {...field} type="datetime-local" />
                </Form.Item>
              )}
            />
          </div>
          <Button type="default" onClick={setFullDayShift}>
            Поставить смену на 24 часа
          </Button>
          <Controller
            control={control}
            name="comment"
            render={({ field, fieldState }) => (
              <Form.Item label="Комментарий" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input.TextArea {...field} rows={3} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <Form.Item>
                <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                  Активная смена
                </Checkbox>
              </Form.Item>
            )}
          />
        </Form>
      </Modal>
      <Modal
        title={copyDraft?.title ?? 'Копировать смену'}
        width={520}
        open={Boolean(copyDraft)}
        onCancel={closeCopyModal}
        destroyOnHidden
        footer={
          <Space>
            <Button onClick={closeCopyModal}>Отмена</Button>
            <Button
              type="primary"
              icon={<CopyOutlined />}
              disabled={!copyDraft || !copyTargetDates.length}
              loading={copyMutation.isPending}
              onClick={() =>
                copyDraft
                  ? copyMutation.mutate({ shifts: copyDraft.shifts, targetDates: copyTargetDates })
                  : undefined
              }
            >
              Скопировать
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size={14} className="full-width">
          <Typography.Text>
            {copyDraft
              ? `Исходный день: ${formatCompactDate(copyDraft.sourceDate)}. Смен в исходном наборе: ${copyDraft.shifts.length}.`
              : null}
          </Typography.Text>
          <ShiftCopyDatePicker
            selectedDates={copyTargetDates}
            initialMonth={copyTargetDates[0] ?? copyDraft?.sourceDate ?? date}
            onChange={setCopyTargetDates}
          />
          <Typography.Text type="secondary">
            {copyTargetDates.length
              ? `Выбрано дат: ${copyTargetDates.length}. Будет создано смен: ${(copyDraft?.shifts.length ?? 0) * copyTargetDates.length}.`
              : 'Выберите одну или несколько дат в календаре.'}
          </Typography.Text>
        </Space>
      </Modal>
    </Space>
  );
}

function ShiftCopyDatePicker({
  selectedDates,
  initialMonth,
  onChange,
}: {
  selectedDates: string[];
  initialMonth: string;
  onChange: (dates: string[]) => void;
}) {
  const [visibleMonth, setVisibleMonth] = useState(toMonthInput(initialMonth));
  const calendarCells = useMemo(() => getCalendarCells(visibleMonth), [visibleMonth]);
  const selected = useMemo(() => new Set(selectedDates), [selectedDates]);

  function toggleDate(date: string) {
    const next = selected.has(date)
      ? selectedDates.filter((item) => item !== date)
      : [...selectedDates, date].sort();

    onChange(next);
  }

  return (
    <div className="shift-copy-calendar">
      <div className="shift-copy-calendar-head">
        <Button size="small" icon={<LeftOutlined />} onClick={() => setVisibleMonth(shiftMonth(visibleMonth, -1))} />
        <Typography.Text strong>{formatMonthLabel(visibleMonth)}</Typography.Text>
        <Button size="small" icon={<RightOutlined />} onClick={() => setVisibleMonth(shiftMonth(visibleMonth, 1))} />
      </div>
      <div className="shift-copy-calendar-weekdays">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className="shift-copy-calendar-grid">
        {calendarCells.map((cell, index) =>
          cell ? (
            <button
              key={cell}
              type="button"
              className="shift-copy-date"
              aria-pressed={selected.has(cell)}
              onClick={() => toggleDate(cell)}
            >
              {new Date(`${cell}T00:00:00`).getDate()}
            </button>
          ) : (
            <span key={`blank-${index}`} className="shift-copy-date blank" />
          ),
        )}
      </div>
      <div className="shift-copy-selected-dates">
        {selectedDates.map((date) => (
          <Tag key={date} closable onClose={() => toggleDate(date)}>
            {formatFullDate(date)}
          </Tag>
        ))}
        <Button size="small" disabled={!selectedDates.length} onClick={() => onChange([])}>
          Очистить
        </Button>
      </div>
    </div>
  );
}

function getDefaultShiftValues(date: string, shift: EmployeeShift | null, fallbackEmployeeId = ''): ShiftFormInput {
  return {
    employeeId: shift?.employeeId ?? fallbackEmployeeId,
    startsAt: shift ? toDatetimeLocal(shift.startsAt) : `${date}T09:00`,
    endsAt: shift ? toDatetimeLocal(shift.endsAt) : `${date}T18:00`,
    comment: shift?.comment ?? '',
    isActive: shift?.isActive ?? true,
  };
}

function buildCopiedShiftPayload(shift: EmployeeShift, targetDate: string): EmployeeShiftPayload {
  return {
    employeeId: shift.employeeId,
    startsAt: copyDateTimeToDate(shift.startsAt, targetDate),
    endsAt: copyDateTimeToDate(shift.endsAt, targetDate, getDaySpan(shift.startsAt, shift.endsAt)),
    comment: shift.comment,
    isActive: true,
  };
}

function copyDateTimeToDate(value: string, targetDate: string, dayOffset = 0) {
  const source = new Date(value);
  const target = new Date(`${targetDate}T00:00:00`);
  target.setDate(target.getDate() + dayOffset);
  target.setHours(source.getHours(), source.getMinutes(), source.getSeconds(), source.getMilliseconds());
  return target.toISOString();
}

function getDaySpan(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

function toDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toMonthInput(value: string) {
  return value ? value.slice(0, 7) : toDateInput(new Date()).slice(0, 7);
}

function shiftMonth(month: string, offset: number) {
  const value = new Date(`${month}-01T00:00:00`);
  value.setMonth(value.getMonth() + offset);
  return toMonthInput(toDateInput(value));
}

function getCalendarCells(month: string) {
  const start = new Date(`${month}-01T00:00:00`);
  const firstWeekdayIndex = (start.getDay() + 6) % 7;
  const cursor = new Date(start);
  const cells: Array<string | null> = Array.from({ length: firstWeekdayIndex }, () => null);

  while (cursor.getMonth() === start.getMonth()) {
    cells.push(toDateInput(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return cells;
}

function formatMonthLabel(month: string) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

function formatFullDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
}

type WeekDay = {
  value: string;
  weekday: string;
  day: string;
  month: string;
  isToday: boolean;
};

function EmployeeShiftWeekBoard({
  days,
  selectedDate,
  shifts,
  loading,
  canManage,
  onSelectDate,
  onMoveWeek,
  onToday,
  onCreate,
  onEdit,
  onCopy,
  onDelete,
  onCopyDay,
}: {
  days: WeekDay[];
  selectedDate: string;
  shifts: EmployeeShift[];
  loading: boolean;
  canManage: boolean;
  onSelectDate: (date: string) => void;
  onMoveWeek: (direction: -1 | 1) => void;
  onToday: () => void;
  onCreate: (date: string) => void;
  onEdit: (shift: EmployeeShift) => void;
  onCopy: (shift: EmployeeShift) => void;
  onDelete: (shift: EmployeeShift) => void;
  onCopyDay: (date: string, shifts: EmployeeShift[]) => void;
}) {
  const shiftsByDay = useMemo(() => groupShiftsByDay(days, shifts), [days, shifts]);

  return (
    <section className="shift-week-panel">
      <div className="schedule-app-toolbar">
        <div>
          <Typography.Title level={4}>График смен</Typography.Title>
          <Typography.Text type="secondary">
            {formatCompactDate(days[0].value)} - {formatCompactDate(days[6].value)}
          </Typography.Text>
        </div>
        <Space wrap>
          <Button icon={<LeftOutlined />} onClick={() => onMoveWeek(-1)} aria-label="Предыдущая неделя" />
          <Button onClick={onToday}>Сегодня</Button>
          <Button icon={<RightOutlined />} onClick={() => onMoveWeek(1)} aria-label="Следующая неделя" />
        </Space>
      </div>
      <div className="shift-week-grid">
        {days.map((day) => {
          const dayShifts = shiftsByDay.get(day.value) ?? [];

          return (
            <section key={day.value} className={`shift-day-card${day.value === selectedDate ? ' is-active' : ''}`}>
              <button type="button" className="shift-day-head" onClick={() => onSelectDate(day.value)}>
                <span>
                  {day.weekday}
                  {day.isToday ? <Tag color="green">Сегодня</Tag> : null}
                </span>
                <strong>{day.day}</strong>
                <small>{day.month}</small>
              </button>
              <div className="shift-day-body">
                {loading ? <span className="schedule-empty">Загрузка</span> : null}
                {!loading && !dayShifts.length ? <span className="schedule-empty">Смен нет</span> : null}
                {!loading
                  ? dayShifts.slice(0, 5).map((shift) => (
                      <div key={shift.id} className="shift-chip-wrap">
                        <button
                          type="button"
                          className={`shift-chip${shift.isActive ? '' : ' is-disabled'}`}
                          onClick={() => (canManage ? onEdit(shift) : onSelectDate(day.value))}
                        >
                          <span className="shift-chip-time">{formatShiftTime(shift)}</span>
                          <span className="shift-chip-name">{shift.employee.fullName}</span>
                          <span className="shift-chip-meta">{shift.employee.position || 'Должность не указана'}</span>
                          {shift.employee.restrictLoginToShifts ? <Tag color="orange">Вход по смене</Tag> : null}
                        </button>
                        {canManage ? (
                          <div className="shift-chip-actions">
                            <button type="button" className="shift-inline-copy-button" onClick={() => onCopy(shift)}>
                              <CopyOutlined /> Копировать
                            </button>
                            <button type="button" className="shift-inline-delete-button" onClick={() => onDelete(shift)}>
                              <DeleteOutlined /> Удалить
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))
                  : null}
                {!loading && dayShifts.length > 5 ? (
                  <button type="button" className="schedule-more-button" onClick={() => onSelectDate(day.value)}>
                    Ещё {dayShifts.length - 5}
                  </button>
                ) : null}
                {canManage && dayShifts.some((shift) => shift.isActive) ? (
                  <button type="button" className="shift-copy-day-button" onClick={() => onCopyDay(day.value, dayShifts)}>
                    <CopyOutlined /> Копировать день
                  </button>
                ) : null}
                {canManage ? (
                  <button type="button" className="shift-add-button" onClick={() => onCreate(day.value)}>
                    Добавить
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

function groupShiftsByDay(days: WeekDay[], shifts: EmployeeShift[]) {
  const groups = new Map<string, EmployeeShift[]>();

  for (const day of days) {
    groups.set(
      day.value,
      shifts
        .filter((shift) => overlapsDay(shift, day.value))
        .sort((first, second) => new Date(first.startsAt).getTime() - new Date(second.startsAt).getTime()),
    );
  }

  return groups;
}

function overlapsDay(shift: EmployeeShift, date: string) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);

  return new Date(shift.startsAt) < end && new Date(shift.endsAt) > start;
}

function shiftDate(date: string, days: number) {
  const value = date ? new Date(`${date}T00:00:00`) : new Date();
  value.setDate(value.getDate() + days);
  return toDateInput(value);
}

function formatShiftTime(shift: EmployeeShift) {
  return `${formatTime(shift.startsAt)} - ${formatTime(shift.endsAt)}`;
}

function formatTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '--:--';
}

function formatCompactDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function getEmployeeLabel(employee: { fullName: string; position?: string | null }) {
  return employee.position ? `${employee.fullName}, ${employee.position}` : employee.fullName;
}

async function invalidateShifts(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['employee-shifts'] }),
    queryClient.invalidateQueries({ queryKey: ['scheduling', 'resources'] }),
  ]);
}
