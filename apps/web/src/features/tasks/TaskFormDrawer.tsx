import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Drawer, Form, Input, Radio, Select, Space } from 'antd';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { fromDatetimeLocal, toDatetimeLocal } from '../../shared/utils/date';
import { listRoles } from '../employees/employees.api';
import { listOwnerAnimals, listOwners } from '../owners/owners.api';
import { getSchedulingResources } from '../scheduling/scheduling.api';
import { Task, TaskMutationInput, TaskStatus, taskStatusLabels, taskTypeOptions } from './types';

const taskSchema = z
  .object({
    title: z.string().trim().min(2, 'Укажите задачу').max(200),
    taskType: nullableString(80),
    ownerId: nullableString(),
    animalId: nullableString(),
    assigneeMode: z.enum(['none', 'employee', 'role']),
    assigneeId: nullableString(),
    assigneeRoleCode: nullableString(80),
    dueAt: nullableDateTime(),
    status: z.enum(['OPEN', 'DONE', 'CANCELLED', 'ARCHIVED']),
    comment: nullableString(1000),
  })
  .superRefine((values, context) => {
    if (values.assigneeMode === 'employee' && !values.assigneeId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['assigneeId'], message: 'Выберите сотрудника' });
    }

    if (values.assigneeMode === 'role' && !values.assigneeRoleCode) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['assigneeRoleCode'], message: 'Выберите роль' });
    }
  });

type TaskFormValues = z.infer<typeof taskSchema>;
type TaskFormInput = z.input<typeof taskSchema>;

type TaskFormDrawerProps = {
  open: boolean;
  title: string;
  initialTask?: Task | null;
  initialOwnerId?: string;
  initialAnimalId?: string;
  submitError?: unknown;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (values: TaskMutationInput) => void;
};

export function TaskFormDrawer({
  open,
  title,
  initialTask,
  initialOwnerId,
  initialAnimalId,
  submitError,
  isSubmitting,
  onClose,
  onSubmit,
}: TaskFormDrawerProps) {
  const isEdit = Boolean(initialTask);
  const { control, handleSubmit, reset, setValue } = useForm<TaskFormInput, unknown, TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: getDefaultValues(initialTask, initialOwnerId, initialAnimalId),
  });
  const [ownerSearch, setOwnerSearch] = useState('');
  const ownerId = useWatch({ control, name: 'ownerId' });
  const assigneeMode = useWatch({ control, name: 'assigneeMode' });

  const resourcesQuery = useQuery({
    queryKey: ['scheduling', 'resources'],
    queryFn: getSchedulingResources,
    enabled: open,
  });
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: listRoles, enabled: open });
  const ownersQuery = useQuery({
    queryKey: ['owners', { search: ownerSearch, limit: 20, offset: 0 }],
    queryFn: () => listOwners({ search: ownerSearch, limit: 20, offset: 0 }),
    enabled: open,
  });
  const animalsQuery = useQuery({
    queryKey: ['owners', ownerId, 'animals'],
    queryFn: () => listOwnerAnimals(ownerId!),
    enabled: open && Boolean(ownerId),
  });

  const ownerOptions = [
    ...(initialTask?.owner ? [{ label: ownerLabel(initialTask.owner), value: initialTask.owner.id }] : []),
    ...(ownersQuery.data?.items.map((owner) => ({ label: ownerLabel(owner), value: owner.id })) ?? []),
  ].filter((option, index, options) => options.findIndex((item) => item.value === option.value) === index);
  const animalOptions = [
    ...(initialTask?.animal ? [{ label: animalLabel(initialTask.animal), value: initialTask.animal.id }] : []),
    ...(animalsQuery.data?.map((animal) => ({ label: animalLabel(animal), value: animal.id })) ?? []),
  ].filter((option, index, options) => options.findIndex((item) => item.value === option.value) === index);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      reset(getDefaultValues(initialTask, initialOwnerId, initialAnimalId));
      setOwnerSearch('');
    }
  }

  function submit(values: TaskFormValues) {
    onSubmit({
      title: values.title,
      taskType: values.taskType,
      ownerId: values.ownerId,
      animalId: values.animalId,
      assigneeId: values.assigneeMode === 'employee' ? values.assigneeId : null,
      assigneeRoleCode: values.assigneeMode === 'role' ? values.assigneeRoleCode : null,
      dueAt: values.dueAt ? fromDatetimeLocal(values.dueAt) : null,
      status: values.status,
      comment: values.comment,
    });
  }

  return (
    <Drawer
      title={title}
      width={620}
      open={open}
      onClose={onClose}
      afterOpenChange={handleOpenChange}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>Отмена</Button>
          <Button type="primary" loading={isSubmitting} onClick={handleSubmit(submit)}>
            {isEdit ? 'Сохранить' : 'Создать'}
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        {submitError ? <Alert type="error" showIcon message={getErrorMessage(submitError)} className="form-alert" /> : null}
        {resourcesQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(resourcesQuery.error)} className="form-alert" /> : null}
        {rolesQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(rolesQuery.error)} className="form-alert" /> : null}
        <Controller
          control={control}
          name="title"
          render={({ field, fieldState }) => (
            <Form.Item label="Название" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input {...field} autoFocus />
            </Form.Item>
          )}
        />
        <div className="form-grid two-columns">
          <Controller
            control={control}
            name="taskType"
            render={({ field }) => (
              <Form.Item label="Тип">
                <Select {...field} allowClear options={taskTypeOptions} placeholder="Не выбран" onChange={(value) => field.onChange(value ?? '')} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="dueAt"
            render={({ field, fieldState }) => (
              <Form.Item label="Срок" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input type="datetime-local" {...field} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="ownerId"
            render={({ field }) => (
              <Form.Item label="Владелец">
                <Select
                  {...field}
                  allowClear
                  showSearch
                  filterOption={false}
                  onSearch={setOwnerSearch}
                  loading={ownersQuery.isLoading}
                  options={ownerOptions}
                  placeholder="Найти владельца"
                  onChange={(value) => {
                    field.onChange(value ?? '');
                    setValue('animalId', '');
                  }}
                />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="animalId"
            render={({ field }) => (
              <Form.Item label="Пациент">
                <Select
                  {...field}
                  allowClear
                  disabled={!ownerId}
                  loading={animalsQuery.isLoading}
                  options={animalOptions}
                  placeholder="Выберите пациента"
                  onChange={(value) => field.onChange(value ?? '')}
                />
              </Form.Item>
            )}
          />
        </div>
        <Controller
          control={control}
          name="assigneeMode"
          render={({ field }) => (
            <Form.Item label="Исполнитель">
              <Radio.Group
                {...field}
                optionType="button"
                buttonStyle="solid"
                onChange={(event) => {
                  field.onChange(event.target.value);
                  setValue('assigneeId', '');
                  setValue('assigneeRoleCode', '');
                }}
                options={[
                  { value: 'none', label: 'Не назначен' },
                  { value: 'employee', label: 'Сотрудник' },
                  { value: 'role', label: 'Роль' },
                ]}
              />
            </Form.Item>
          )}
        />
        {assigneeMode === 'employee' ? (
          <Controller
            control={control}
            name="assigneeId"
            render={({ field, fieldState }) => (
              <Form.Item label="Сотрудник" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select
                  {...field}
                  allowClear
                  loading={resourcesQuery.isLoading}
                  options={resourcesQuery.data?.employees.map((employee) => ({
                    label: employee.position ? `${employee.fullName}, ${employee.position}` : employee.fullName,
                    value: employee.id,
                  }))}
                  placeholder="Выберите сотрудника"
                  onChange={(value) => field.onChange(value ?? '')}
                />
              </Form.Item>
            )}
          />
        ) : null}
        {assigneeMode === 'role' ? (
          <Controller
            control={control}
            name="assigneeRoleCode"
            render={({ field, fieldState }) => (
              <Form.Item label="Роль" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select
                  {...field}
                  allowClear
                  loading={rolesQuery.isLoading}
                  options={rolesQuery.data?.map((role) => ({ label: role.title, value: role.code }))}
                  placeholder="Выберите роль"
                  onChange={(value) => field.onChange(value ?? '')}
                />
              </Form.Item>
            )}
          />
        ) : null}
        {isEdit ? (
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Form.Item label="Статус">
                <Select<TaskStatus>
                  {...field}
                  options={Object.entries(taskStatusLabels).map(([value, label]) => ({ value: value as TaskStatus, label }))}
                />
              </Form.Item>
            )}
          />
        ) : null}
        <Controller
          control={control}
          name="comment"
          render={({ field, fieldState }) => (
            <Form.Item label="Комментарий" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input.TextArea rows={4} {...field} />
            </Form.Item>
          )}
        />
      </Form>
    </Drawer>
  );
}

function getDefaultValues(task?: Task | null, initialOwnerId?: string, initialAnimalId?: string): TaskFormInput {
  return {
    title: task?.title ?? '',
    taskType: task?.taskType ?? '',
    ownerId: task?.ownerId ?? initialOwnerId ?? '',
    animalId: task?.animalId ?? initialAnimalId ?? '',
    assigneeMode: task?.assigneeId ? 'employee' : task?.assigneeRoleCode ? 'role' : 'none',
    assigneeId: task?.assigneeId ?? '',
    assigneeRoleCode: task?.assigneeRoleCode ?? '',
    dueAt: toDatetimeLocal(task?.dueAt),
    status: task?.status ?? 'OPEN',
    comment: task?.comment ?? '',
  };
}

function nullableString(maxLength?: number) {
  let schema = z.string().trim();

  if (maxLength) {
    schema = schema.max(maxLength);
  }

  return schema.transform((value) => (value === '' ? null : value));
}

function nullableDateTime() {
  return z
    .string()
    .trim()
    .refine((value) => !value || Boolean(fromDatetimeLocal(value)), 'Укажите корректную дату и время')
    .transform((value) => (value === '' ? null : value));
}

function ownerLabel(owner: { fullName: string; phone?: string | null }) {
  return owner.phone ? `${owner.fullName}, ${owner.phone}` : owner.fullName;
}

function animalLabel(animal: { nickname: string; species?: string | null; breed?: string | null }) {
  return [animal.nickname, animal.species, animal.breed].filter(Boolean).join(', ');
}
