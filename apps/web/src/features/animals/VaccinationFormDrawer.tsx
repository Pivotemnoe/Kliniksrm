import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Drawer, Form, Input, Radio, Select, Space } from 'antd';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { nullToEmpty } from '../../shared/utils/forms';
import { listRoles } from '../employees/employees.api';
import { getSchedulingResources } from '../scheduling/scheduling.api';
import { Vaccination, VaccinationMutationInput } from './types';

const vaccinationSchema = z
  .object({
    title: z.string().trim().min(2, 'Введите название').max(200),
    status: nullableString(80),
    vaccinatedAt: nullableDateString(),
    expiresAt: nullableDateString(),
    vaccineBatch: nullableString(120),
    vaccineSeries: nullableString(120),
    vaccineExpiresAt: nullableDateString(),
    smsReminder: z.boolean(),
    notes: nullableString(1000),
    createRevaccinationTask: z.boolean(),
    revaccinationAssigneeMode: z.enum(['none', 'employee', 'role']),
    revaccinationAssigneeId: nullableString(),
    revaccinationAssigneeRoleCode: nullableString(80),
  })
  .superRefine((values, context) => {
    const taskEnabled = Boolean(values.expiresAt && values.createRevaccinationTask);

    if (!taskEnabled) {
      return;
    }

    if (values.revaccinationAssigneeMode === 'employee' && !values.revaccinationAssigneeId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['revaccinationAssigneeId'],
        message: 'Выберите сотрудника',
      });
    }

    if (values.revaccinationAssigneeMode === 'role' && !values.revaccinationAssigneeRoleCode) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['revaccinationAssigneeRoleCode'],
        message: 'Выберите роль',
      });
    }
  });

type VaccinationFormValues = z.infer<typeof vaccinationSchema>;
type VaccinationFormInput = z.input<typeof vaccinationSchema>;

type VaccinationFormDrawerProps = {
  open: boolean;
  title: string;
  initialVaccination?: Vaccination | null;
  submitError?: unknown;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (values: VaccinationMutationInput) => void;
};

export function VaccinationFormDrawer({
  open,
  title,
  initialVaccination,
  submitError,
  isSubmitting,
  onClose,
  onSubmit,
}: VaccinationFormDrawerProps) {
  const { control, handleSubmit, reset, setValue } = useForm<VaccinationFormInput, unknown, VaccinationFormValues>({
    resolver: zodResolver(vaccinationSchema),
    defaultValues: getDefaultValues(initialVaccination),
  });
  const expiresAt = useWatch({ control, name: 'expiresAt' });
  const createRevaccinationTask = useWatch({ control, name: 'createRevaccinationTask' });
  const revaccinationAssigneeMode = useWatch({ control, name: 'revaccinationAssigneeMode' });
  const showTaskFields = Boolean(expiresAt && createRevaccinationTask);

  const resourcesQuery = useQuery({
    queryKey: ['scheduling', 'resources'],
    queryFn: getSchedulingResources,
    enabled: open,
  });
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: listRoles, enabled: open });

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      reset(getDefaultValues(initialVaccination));
    }
  }

  function submit(values: VaccinationFormValues) {
    const shouldCreateTask = Boolean(values.expiresAt && values.createRevaccinationTask);

    onSubmit({
      title: values.title,
      status: values.status,
      vaccinatedAt: values.vaccinatedAt,
      expiresAt: values.expiresAt,
      vaccineBatch: values.vaccineBatch,
      vaccineSeries: values.vaccineSeries,
      vaccineExpiresAt: values.vaccineExpiresAt,
      smsReminder: values.smsReminder,
      notes: values.notes,
      createRevaccinationTask: shouldCreateTask,
      revaccinationAssigneeId: shouldCreateTask && values.revaccinationAssigneeMode === 'employee' ? values.revaccinationAssigneeId : null,
      revaccinationAssigneeRoleCode:
        shouldCreateTask && values.revaccinationAssigneeMode === 'role' ? values.revaccinationAssigneeRoleCode : null,
    });
  }

  return (
    <Drawer
      title={title}
      width={680}
      open={open}
      onClose={onClose}
      afterOpenChange={handleOpenChange}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>Отмена</Button>
          <Button type="primary" loading={isSubmitting} onClick={handleSubmit(submit)}>
            Сохранить
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
            <Form.Item label="Название вакцины" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input {...field} autoFocus />
            </Form.Item>
          )}
        />
        <div className="form-grid two-columns">
          <Controller
            control={control}
            name="vaccinatedAt"
            render={({ field, fieldState }) => (
              <Form.Item label="Дата вакцинации" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input type="date" {...field} value={field.value ?? ''} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="expiresAt"
            render={({ field, fieldState }) => (
              <Form.Item label="Дата ревакцинации" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input type="date" {...field} value={field.value ?? ''} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="status"
            render={({ field, fieldState }) => (
              <Form.Item label="Статус" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} value={field.value ?? ''} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="vaccineBatch"
            render={({ field, fieldState }) => (
              <Form.Item label="Номер" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} value={field.value ?? ''} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="vaccineSeries"
            render={({ field, fieldState }) => (
              <Form.Item label="Серия" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} value={field.value ?? ''} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="vaccineExpiresAt"
            render={({ field, fieldState }) => (
              <Form.Item
                label="Срок годности вакцины"
                validateStatus={fieldState.error ? 'error' : undefined}
                help={fieldState.error?.message}
              >
                <Input type="date" {...field} value={field.value ?? ''} />
              </Form.Item>
            )}
          />
        </div>
        <Space direction="vertical" size={12} className="full-width">
          <Controller
            control={control}
            name="smsReminder"
            render={({ field }) => (
              <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                SMS-уведомление
              </Checkbox>
            )}
          />
          <Controller
            control={control}
            name="createRevaccinationTask"
            render={({ field }) => (
              <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                Создать задачу ревакцинации, если указана дата
              </Checkbox>
            )}
          />
        </Space>
        {showTaskFields ? (
          <>
            <Controller
              control={control}
              name="revaccinationAssigneeMode"
              render={({ field }) => (
                <Form.Item label="Исполнитель задачи">
                  <Radio.Group
                    {...field}
                    optionType="button"
                    buttonStyle="solid"
                    onChange={(event) => {
                      field.onChange(event.target.value);
                      setValue('revaccinationAssigneeId', '');
                      setValue('revaccinationAssigneeRoleCode', '');
                      if (event.target.value === 'role') {
                        setValue('revaccinationAssigneeRoleCode', 'doctor');
                      }
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
            {revaccinationAssigneeMode === 'employee' ? (
              <Controller
                control={control}
                name="revaccinationAssigneeId"
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
            {revaccinationAssigneeMode === 'role' ? (
              <Controller
                control={control}
                name="revaccinationAssigneeRoleCode"
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
          </>
        ) : null}
        <Controller
          control={control}
          name="notes"
          render={({ field, fieldState }) => (
            <Form.Item label="Примечание" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input.TextArea rows={4} {...field} value={field.value ?? ''} />
            </Form.Item>
          )}
        />
      </Form>
    </Drawer>
  );
}

function getDefaultValues(vaccination?: Vaccination | null): VaccinationFormInput {
  const task = vaccination?.revaccinationTask;

  return {
    title: vaccination?.title ?? '',
    status: nullToEmpty(vaccination?.status),
    vaccinatedAt: dateToInput(vaccination?.vaccinatedAt),
    expiresAt: dateToInput(vaccination?.expiresAt),
    vaccineBatch: nullToEmpty(vaccination?.vaccineBatch),
    vaccineSeries: nullToEmpty(vaccination?.vaccineSeries),
    vaccineExpiresAt: dateToInput(vaccination?.vaccineExpiresAt),
    smsReminder: vaccination?.smsReminder ?? false,
    notes: nullToEmpty(vaccination?.notes),
    createRevaccinationTask: vaccination ? Boolean(vaccination.expiresAt && task?.status !== 'CANCELLED') : true,
    revaccinationAssigneeMode: task?.assigneeId ? 'employee' : task?.assigneeRoleCode ? 'role' : 'role',
    revaccinationAssigneeId: task?.assigneeId ?? '',
    revaccinationAssigneeRoleCode: task?.assigneeRoleCode ?? 'doctor',
  };
}

function dateToInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '';
}

function nullableString(maxLength?: number) {
  let schema = z.string().trim();

  if (maxLength) {
    schema = schema.max(maxLength);
  }

  return schema.transform((value) => (value === '' ? null : value));
}

function nullableDateString() {
  return z
    .string()
    .trim()
    .refine((value) => !value || !Number.isNaN(new Date(value).getTime()), 'Укажите корректную дату')
    .transform((value) => (value === '' ? null : value));
}
