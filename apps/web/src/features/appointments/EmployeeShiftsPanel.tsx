import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Checkbox, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { fromDatetimeLocal, formatDateTime, getDayBounds, toDatetimeLocal } from '../../shared/utils/date';
import {
  createEmployeeShift,
  disableEmployeeShift,
  getSchedulingResources,
  listEmployeeShifts,
  updateEmployeeShift,
} from '../scheduling/scheduling.api';
import { EmployeeShift } from '../scheduling/types';

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

export function EmployeeShiftsPanel({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const [date, setDate] = useState(toDateInput(new Date()));
  const [employeeId, setEmployeeId] = useState<string>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<EmployeeShift | null>(null);
  const dateBounds = getDayBounds(date);
  const resourcesQuery = useQuery({ queryKey: ['scheduling', 'resources'], queryFn: getSchedulingResources });
  const shiftsQuery = useQuery({
    queryKey: ['employee-shifts', { date, employeeId }],
    queryFn: () => listEmployeeShifts({ employeeId, from: dateBounds.dateFrom, to: dateBounds.dateTo }),
  });
  const employees = resourcesQuery.data?.employees ?? [];
  const { control, handleSubmit, reset } = useForm<ShiftFormInput, unknown, ShiftFormValues>({
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
        width: 210,
        render: (_, shift) =>
          canManage ? (
            <Space wrap>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(shift)}>
                Изменить
              </Button>
              {shift.isActive ? (
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => confirmDisable(shift)}>
                  Отключить
                </Button>
              ) : null}
            </Space>
          ) : null,
      },
    ],
    [canManage],
  );

  function openCreate() {
    setEditingShift(null);
    reset(getDefaultShiftValues(date, null, employeeId ?? employees[0]?.id));
    setModalOpen(true);
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

  function confirmDisable(shift: EmployeeShift) {
    modal.confirm({
      title: 'Отключить смену?',
      content: `${shift.employee.fullName}: ${formatDateTime(shift.startsAt)} - ${formatDateTime(shift.endsAt)}`,
      okText: 'Отключить',
      okButtonProps: { danger: true },
      cancelText: 'Отмена',
      onOk: () => disableMutation.mutateAsync(shift.id),
    });
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
          <Button type="primary" icon={<PlusOutlined />} disabled={!employees.length} onClick={openCreate}>
            Добавить смену
          </Button>
        ) : null}
      </div>
      {resourcesQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(resourcesQuery.error)} /> : null}
      {shiftsQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(shiftsQuery.error)} /> : null}
      <Table<EmployeeShift>
        rowKey="id"
        className="dense-table"
        columns={columns}
        dataSource={shiftsQuery.data ?? []}
        loading={resourcesQuery.isLoading || shiftsQuery.isLoading}
        pagination={false}
        scroll={{ x: 1100 }}
        locale={{ emptyText: 'На выбранную дату смены не выставлены' }}
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
    </Space>
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

function toDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
