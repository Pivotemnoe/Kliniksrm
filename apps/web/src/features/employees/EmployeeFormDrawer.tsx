import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Checkbox, Form, Input, Modal, Select, Space, Tag, Typography } from 'antd';
import { useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { defaultRouteOptions } from '../../shared/routes/defaultRoutes';
import { RussianPhoneInput } from '../../shared/ui/RussianPhoneInput';
import { nullToEmpty, optionalEmail, optionalString } from '../../shared/utils/forms';
import { Employee, EmployeeStatus, RoleTemplate, UpdateEmployeeInput } from './types';

export type EmployeeWarehouseOption = {
  id: string;
  name: string;
  officeName?: string;
};

const employeeSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Укажите ФИО').max(200),
    phone: optionalString(32),
    email: optionalEmail(),
    position: optionalString(120),
    defaultRoute: z.string().optional().nullable(),
    restrictLoginToShifts: z.boolean().default(false),
    password: optionalString(200).refine((value) => !value || value.length >= 8, 'Минимум 8 символов'),
    status: z.enum(['ACTIVE', 'BLOCKED']),
    roleCodes: z.array(z.string()).min(1, 'Выберите хотя бы одну роль'),
    permissionGrants: z.array(z.string()).default([]),
    permissionDenials: z.array(z.string()).default([]),
    warehouseIds: z.array(z.string()).default([]),
  })
  .superRefine((values, context) => {
    if (!values.phone && !values.email) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phone'],
        message: 'Укажите телефон или email',
      });
    }

    const grants = new Set(values.permissionGrants);
    const conflicts = values.permissionDenials.filter((code) => grants.has(code));
    if (conflicts.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['permissionDenials'],
        message: 'Одно право нельзя одновременно разрешить и запретить',
      });
    }
  });

export type EmployeeFormValues = z.infer<typeof employeeSchema>;
type EmployeeFormInput = z.input<typeof employeeSchema>;

type EmployeeFormDrawerProps = {
  open: boolean;
  title: string;
  roles: RoleTemplate[];
  warehouses: EmployeeWarehouseOption[];
  initialEmployee?: Employee | null;
  submitError?: unknown;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (values: EmployeeFormValues) => void;
};

export function EmployeeFormDrawer({
  open,
  title,
  roles,
  warehouses,
  initialEmployee,
  submitError,
  isSubmitting,
  onClose,
  onSubmit,
}: EmployeeFormDrawerProps) {
  const isEdit = Boolean(initialEmployee);
  const permissionOptions = getPermissionOptions(roles);
  const warehouseOptions = warehouses.map((warehouse) => ({
    value: warehouse.id,
    label: warehouse.officeName ? `${warehouse.name} · ${warehouse.officeName}` : warehouse.name,
  }));
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
    setValue,
  } = useForm<EmployeeFormInput, unknown, EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: getDefaultValues(initialEmployee),
  });
  const selectedRoleCodes = useWatch({ control, name: 'roleCodes' }) ?? [];
  const permissionGrants = useWatch({ control, name: 'permissionGrants' }) ?? [];
  const permissionDenials = useWatch({ control, name: 'permissionDenials' }) ?? [];
  const permissionPreview = useMemo(
    () => buildPermissionPreview(roles, selectedRoleCodes, permissionGrants, permissionDenials),
    [permissionDenials, permissionGrants, roles, selectedRoleCodes],
  );

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      reset(getDefaultValues(initialEmployee));
    }
  }

  function handleValidSubmit(values: EmployeeFormValues) {
    if (!isEdit && !values.password) {
      setError('password', { type: 'manual', message: 'Задайте временный пароль' });
      return;
    }

    onSubmit(values);
  }

  return (
    <Modal
      title={title}
      width={760}
      open={open}
      onCancel={onClose}
      afterOpenChange={handleOpenChange}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onClose}>Отмена</Button>
          <Button type="primary" loading={isSubmitting} onClick={handleSubmit(handleValidSubmit)}>
            {isEdit ? 'Сохранить' : 'Создать'}
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        {submitError ? <Alert type="error" showIcon message={getErrorMessage(submitError)} className="form-alert" /> : null}
        <Controller
          control={control}
          name="fullName"
          render={({ field, fieldState }) => (
            <Form.Item label="ФИО" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input {...field} autoFocus />
            </Form.Item>
          )}
        />
        <div className="form-grid two-columns">
          <Controller
            control={control}
            name="phone"
            render={({ field, fieldState }) => (
              <Form.Item label="Телефон" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <RussianPhoneInput {...field} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="email"
            render={({ field, fieldState }) => (
              <Form.Item label="Email" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} />
              </Form.Item>
            )}
          />
        </div>
        <Controller
          control={control}
          name="position"
          render={({ field, fieldState }) => (
            <Form.Item label="Должность" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input {...field} />
            </Form.Item>
            )}
        />
        <Controller
          control={control}
          name="defaultRoute"
          render={({ field }) => (
            <Form.Item label="Раздел по умолчанию">
              <Select
                {...field}
                allowClear
                placeholder="Сводка"
                options={defaultRouteOptions}
                onChange={(value) => field.onChange(value ?? '')}
              />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="restrictLoginToShifts"
          render={({ field }) => (
            <Form.Item>
              <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                Вход только во время активной смены
              </Checkbox>
              <div>
                <Typography.Text type="secondary">
                  Если включено, сотрудник не сможет войти и продолжить работу без смены в расписании.
                </Typography.Text>
              </div>
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="roleCodes"
          render={({ field }) => (
            <Form.Item label="Роли доступа" validateStatus={errors.roleCodes ? 'error' : undefined} help={errors.roleCodes?.message}>
              <Select
                {...field}
                mode="multiple"
                options={roles.map((role) => ({ value: role.code, label: role.title }))}
                placeholder="Выберите роли"
              />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="permissionGrants"
          render={({ field }) => (
            <Form.Item label="Разрешить дополнительно">
              <Select
                {...field}
                mode="multiple"
                options={permissionOptions}
                placeholder="Права сверх выбранных ролей"
              />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="permissionDenials"
          render={({ field, fieldState }) => (
            <Form.Item
              label="Запретить индивидуально"
              validateStatus={fieldState.error ? 'error' : undefined}
              help={fieldState.error?.message}
            >
              <Select
                {...field}
                mode="multiple"
                options={permissionOptions}
                placeholder="Права, которые нужно убрать у сотрудника"
              />
            </Form.Item>
          )}
        />
        <PermissionPreview preview={permissionPreview} />
        <Controller
          control={control}
          name="warehouseIds"
          render={({ field }) => (
            <Form.Item label="Доступные склады">
              <Select
                {...field}
                mode="multiple"
                options={warehouseOptions}
                placeholder="Выберите склады"
              />
            </Form.Item>
          )}
        />
        {isEdit ? (
          <Controller
            control={control}
            name="status"
            render={({ field, fieldState }) => (
              <Form.Item label="Статус" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select
                  {...field}
                  options={[
                    { value: 'ACTIVE', label: 'Активный' },
                    { value: 'BLOCKED', label: 'Заблокированный' },
                  ]}
                />
              </Form.Item>
            )}
          />
        ) : null}
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <Form.Item
              label={isEdit ? 'Новый временный пароль' : 'Временный пароль'}
              validateStatus={fieldState.error ? 'error' : undefined}
              help={fieldState.error?.message ?? (isEdit ? 'Оставьте пустым, если пароль менять не нужно.' : 'Минимум 8 символов. Этот пароль нужен сотруднику для первого входа.')}
            >
              <Space.Compact className="full-width">
                <Input.Password {...field} autoComplete="new-password" />
                <Button
                  type="default"
                  onClick={() => setValue('password', createTemporaryPassword(), { shouldDirty: true, shouldValidate: true })}
                >
                  Сгенерировать
                </Button>
              </Space.Compact>
            </Form.Item>
          )}
        />
      </Form>
    </Modal>
  );
}

type PermissionPreviewItem = {
  code: string;
  title: string;
  source: string;
  color?: string;
};

type PermissionPreviewData = {
  selectedRoles: RoleTemplate[];
  active: PermissionPreviewItem[];
  denied: PermissionPreviewItem[];
};

function PermissionPreview({ preview }: { preview: PermissionPreviewData }) {
  return (
    <div className="permission-preview">
      <Space direction="vertical" size={8} className="full-width">
        <Space direction="vertical" size={2}>
          <Typography.Text strong>Итоговые права сотрудника</Typography.Text>
          <Typography.Text type="secondary">
            {preview.selectedRoles.length
              ? `Роли: ${preview.selectedRoles.map((role) => role.title).join(', ')}`
              : 'Выберите роль, чтобы увидеть доступы.'}
          </Typography.Text>
        </Space>
        <div className="permission-preview-tags">
          {preview.active.length ? (
            preview.active.map((permission) => (
              <Tag key={permission.code} color={permission.color} title={`${permission.source}: ${permission.code}`}>
                {permission.title}
              </Tag>
            ))
          ) : (
            <Typography.Text type="secondary">Активных прав пока нет.</Typography.Text>
          )}
        </div>
        {preview.denied.length ? (
          <Space direction="vertical" size={4} className="full-width">
            <Typography.Text type="danger">Индивидуально запрещено</Typography.Text>
            <div className="permission-preview-tags">
              {preview.denied.map((permission) => (
                <Tag key={permission.code} color="red" title={`${permission.source}: ${permission.code}`}>
                  {permission.title}
                </Tag>
              ))}
            </div>
          </Space>
        ) : null}
      </Space>
    </div>
  );
}

function getDefaultValues(employee?: Employee | null): EmployeeFormInput {
  return {
    fullName: employee?.fullName ?? '',
    phone: nullToEmpty(employee?.user?.phone ?? employee?.phone),
    email: nullToEmpty(employee?.user?.email),
    position: nullToEmpty(employee?.position),
    defaultRoute: employee?.defaultRoute ?? '',
    restrictLoginToShifts: employee?.restrictLoginToShifts ?? false,
    password: '',
    status: (employee?.status ?? 'ACTIVE') as EmployeeStatus,
    roleCodes: employee?.roles.map((role) => role.code) ?? [],
    permissionGrants: employee?.permissionOverrides.filter((item) => item.effect === 'GRANT').map((item) => item.code) ?? [],
    permissionDenials: employee?.permissionOverrides.filter((item) => item.effect === 'DENY').map((item) => item.code) ?? [],
    warehouseIds: employee?.warehouses.map((warehouse) => warehouse.id) ?? [],
  };
}

export function toUpdateEmployeeInput(values: EmployeeFormValues): UpdateEmployeeInput {
  return {
    fullName: values.fullName,
    phone: values.phone,
    email: values.email,
    position: values.position,
    defaultRoute: values.defaultRoute || null,
    restrictLoginToShifts: values.restrictLoginToShifts,
    password: values.password,
    status: values.status,
    roleCodes: values.roleCodes,
    permissionGrants: values.permissionGrants,
    permissionDenials: values.permissionDenials,
    warehouseIds: values.warehouseIds,
  };
}

function getPermissionOptions(roles: RoleTemplate[]) {
  const permissions = new Map<string, string>();
  for (const role of roles) {
    for (const permission of role.permissions) {
      permissions.set(permission.code, permission.title);
    }
  }

  return [...permissions.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, title]) => ({ value: code, label: `${title} · ${code}` }));
}

function createTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function buildPermissionPreview(
  roles: RoleTemplate[],
  selectedRoleCodes: string[],
  permissionGrants: string[],
  permissionDenials: string[],
): PermissionPreviewData {
  const selectedRoleCodeSet = new Set(selectedRoleCodes);
  const selectedRoles = roles.filter((role) => selectedRoleCodeSet.has(role.code));
  const titleByCode = new Map<string, string>();
  const rolePermissions = new Set<string>();
  const grants = new Set(permissionGrants);
  const denials = new Set(permissionDenials);

  for (const role of roles) {
    for (const permission of role.permissions) {
      titleByCode.set(permission.code, permission.title);
    }
  }

  for (const role of selectedRoles) {
    for (const permission of role.permissions) {
      rolePermissions.add(permission.code);
    }
  }

  const activeCodes = new Set([...rolePermissions, ...grants]);
  for (const code of denials) {
    activeCodes.delete(code);
  }

  const active = [...activeCodes]
    .sort()
    .map((code) => ({
      code,
      title: titleByCode.get(code) ?? code,
      source: grants.has(code) && !rolePermissions.has(code) ? 'Индивидуально разрешено' : 'По роли',
      color: grants.has(code) && !rolePermissions.has(code) ? 'green' : undefined,
    }));
  const denied = [...denials]
    .sort()
    .map((code) => ({
      code,
      title: titleByCode.get(code) ?? code,
      source: 'Индивидуально запрещено',
      color: 'red',
    }));

  return { selectedRoles, active, denied };
}
