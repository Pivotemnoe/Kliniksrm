import { DeleteOutlined, EditOutlined, PlusOutlined, UndoOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Checkbox, Space, Table, Tag, Tabs, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { EmployeeShiftsPanel } from '../appointments/EmployeeShiftsPanel';
import { getSchedulingSettings } from '../scheduling/scheduling.api';
import { getDefaultRouteLabel } from '../../shared/routes/defaultRoutes';
import { PageHeader } from '../../shared/ui/PageHeader';
import { archiveEmployee, createEmployee, listEmployees, listRoles, restoreEmployee, updateEmployee } from './employees.api';
import { EmployeeFormDrawer, EmployeeFormValues, toUpdateEmployeeInput } from './EmployeeFormDrawer';
import { CreateEmployeeInput, Employee, RoleTemplate, UpdateEmployeeInput } from './types';

export function EmployeesPage() {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const currentEmployeeQuery = useCurrentEmployee();
  const employeesQuery = useQuery({ queryKey: ['employees'], queryFn: listEmployees });
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: listRoles });
  const [createOpen, setCreateOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const currentEmployee = currentEmployeeQuery.data?.employee;
  const isDirector = currentEmployee?.roles.includes('director') ?? false;
  const canManage =
    hasPermission(currentEmployee, 'employees.manage') && hasPermission(currentEmployee, 'roles.manage');
  const canManageShifts = hasPermission(currentEmployee, 'appointments.manage');
  const warehouseSettingsQuery = useQuery({
    queryKey: ['scheduling', 'settings', 'employee-warehouses'],
    queryFn: getSchedulingSettings,
    enabled: canManage,
  });
  const error = employeesQuery.error ?? rolesQuery.error ?? warehouseSettingsQuery.error;
  const activeEmployeesCount = employeesQuery.data?.filter((employee) => employee.status === 'ACTIVE').length;
  const warehouseOptions = useMemo(
    () =>
      warehouseSettingsQuery.data?.offices.flatMap((office) =>
        office.warehouses.map((warehouse) => ({ id: warehouse.id, name: warehouse.name, officeName: office.name })),
      ) ?? [],
    [warehouseSettingsQuery.data],
  );

  const createMutation = useMutation({
    mutationFn: (values: CreateEmployeeInput) => createEmployee(values),
    onSuccess: async (employee, values) => {
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
      setCreateOpen(false);
      message.success('Сотрудник создан');
      modal.success({
        title: 'Данные для входа сотрудника',
        content: (
          <Space direction="vertical" size={8}>
            <Typography.Text>
              Сотрудник: <Typography.Text strong>{employee.fullName}</Typography.Text>
            </Typography.Text>
            <Typography.Text>
              Логин: <Typography.Text code>{employee.user?.phone || employee.user?.email || values.phone || values.email}</Typography.Text>
            </Typography.Text>
            <Typography.Text>
              Временный пароль: <Typography.Text code>{values.password}</Typography.Text>
            </Typography.Text>
            {employee.restrictLoginToShifts ? (
              <Typography.Text type="warning">
                Вход разрешён только во время назначенной смены. Если смена не выставлена, сотрудник не сможет войти.
              </Typography.Text>
            ) : null}
          </Space>
        ),
        okText: 'Понятно',
      });
    },
    onError: (mutationError) => message.error(getErrorMessage(mutationError)),
  });
  const updateMutation = useMutation({
    mutationFn: ({ employeeId, values }: { employeeId: string; values: UpdateEmployeeInput }) => updateEmployee(employeeId, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      setEditingEmployee(null);
      message.success('Сотрудник сохранён');
    },
    onError: (mutationError) => message.error(getErrorMessage(mutationError)),
  });
  const archiveMutation = useMutation({
    mutationFn: archiveEmployee,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
      message.success('Сотрудник удалён из активных. История приёмов и документов сохранена');
    },
    onError: (mutationError) => message.error(getErrorMessage(mutationError)),
  });
  const restoreMutation = useMutation({
    mutationFn: restoreEmployee,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
      message.success('Сотрудник восстановлен');
    },
    onError: (mutationError) => message.error(getErrorMessage(mutationError)),
  });
  const visibleEmployees = useMemo(
    () => (employeesQuery.data ?? []).filter((employee) => showArchived || employee.status === 'ACTIVE'),
    [employeesQuery.data, showArchived],
  );

  const employeeColumns = useMemo<ColumnsType<Employee>>(() => {
    const columns: ColumnsType<Employee> = [
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        render: (value: Employee['status']) => (
          <Tag color={value === 'ACTIVE' ? 'green' : 'default'}>{value === 'ACTIVE' ? 'Активный' : 'Заблокированный'}</Tag>
        ),
      },
      { title: 'Сотрудник', dataIndex: 'fullName', key: 'fullName' },
      { title: 'Должность', dataIndex: 'position', key: 'position', render: (value: string | null) => value || '—' },
      {
        title: 'Стартовый раздел',
        dataIndex: 'defaultRoute',
        key: 'defaultRoute',
        render: (value: string | null) => getDefaultRouteLabel(value),
      },
      {
        title: 'Вход по сменам',
        dataIndex: 'restrictLoginToShifts',
        key: 'restrictLoginToShifts',
        width: 150,
        render: (value: boolean) => (value ? <Tag color="orange">Только в смену</Tag> : <Tag>Не ограничен</Tag>),
      },
      { title: 'Телефон', dataIndex: 'phone', key: 'phone', render: (value: string | null, record) => value || record.user?.phone || '—' },
      { title: 'Email', key: 'email', render: (_, record) => record.user?.email || '—' },
      {
        title: 'Роли',
        key: 'roles',
        render: (_, record) => (
          <Space wrap>
            {record.roles.map((role) => (
              <Tag key={role.code}>{role.title}</Tag>
            ))}
          </Space>
        ),
      },
      {
        title: 'Индивидуальные права',
        key: 'permissionOverrides',
        render: (_, record) =>
          record.permissionOverrides.length ? (
            <Space wrap>
              {record.permissionOverrides.map((permission) => (
                <Tag key={`${permission.effect}-${permission.code}`} color={permission.effect === 'GRANT' ? 'green' : 'red'}>
                  {permission.effect === 'GRANT' ? 'Разрешить' : 'Запретить'}: {permission.title}
                </Tag>
              ))}
            </Space>
          ) : (
            '—'
          ),
      },
      {
        title: 'Склады',
        key: 'warehouses',
        render: (_, record) =>
          record.warehouses.length ? (
            <Space wrap>
              {record.warehouses.map((warehouse) => (
                <Tag key={warehouse.id}>{warehouse.name}</Tag>
              ))}
            </Space>
          ) : (
            '—'
          ),
      },
    ];

    if (isDirector) {
      columns.splice(5, 0, {
        title: 'Удалённый просмотр',
        dataIndex: 'allowRemoteOutsideShift',
        key: 'allowRemoteOutsideShift',
        width: 170,
        render: (value: boolean) => (value ? <Tag color="blue">Вне смены разрешён</Tag> : <Tag>Только по общим правилам</Tag>),
      });
    }

    if (canManage) {
      columns.push({
        title: 'Действия',
        key: 'actions',
        width: 160,
        render: (_, record) => <Space wrap>
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditingEmployee(record)}>Редактировать</Button>
          {record.status === 'ACTIVE' ? (
            <Button size="small" danger icon={<DeleteOutlined />} disabled={record.id === currentEmployee?.id} onClick={() => modal.confirm({
              title: `Удалить сотрудника «${record.fullName}» из активных?`,
              content: 'Вход будет немедленно закрыт, будущие смены отключены. Старые приёмы, оплаты, назначения и документы останутся в истории.',
              okText: 'Удалить из активных',
              okButtonProps: { danger: true },
              cancelText: 'Отмена',
              onOk: () => archiveMutation.mutateAsync(record.id),
            })}>Удалить</Button>
          ) : (
            <Button size="small" icon={<UndoOutlined />} onClick={() => restoreMutation.mutate(record.id)}>Восстановить</Button>
          )}
        </Space>,
      });
    }

    return columns;
  }, [archiveMutation, canManage, currentEmployee?.id, isDirector, modal, restoreMutation]);

  function closeEmployeeForm() {
    setCreateOpen(false);
    setEditingEmployee(null);
    createMutation.reset();
    updateMutation.reset();
  }

  function handleEmployeeSubmit(values: EmployeeFormValues) {
    const normalizedValues = toUpdateEmployeeInput(values, isDirector);

    if (editingEmployee) {
      updateMutation.mutate({ employeeId: editingEmployee.id, values: normalizedValues });
      return;
    }

    if (!normalizedValues.password) {
      return;
    }

    createMutation.mutate({
      fullName: normalizedValues.fullName,
      phone: normalizedValues.phone,
      email: normalizedValues.email,
      position: normalizedValues.position,
      defaultRoute: normalizedValues.defaultRoute,
      restrictLoginToShifts: normalizedValues.restrictLoginToShifts,
      allowRemoteOutsideShift: normalizedValues.allowRemoteOutsideShift,
      password: normalizedValues.password,
      roleCodes: normalizedValues.roleCodes,
      permissionGrants: normalizedValues.permissionGrants,
      permissionDenials: normalizedValues.permissionDenials,
      warehouseIds: normalizedValues.warehouseIds,
    });
  }

  return (
    <div className="page">
      <PageHeader
        title={`Сотрудники${activeEmployeesCount !== undefined ? ` ${activeEmployeesCount}` : ''}`}
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!canManage || rolesQuery.isLoading || warehouseSettingsQuery.isLoading}
            onClick={() => {
              setEditingEmployee(null);
              setCreateOpen(true);
            }}
          >
            Добавить сотрудника
          </Button>
        }
      />
      {error ? <Alert type="error" showIcon message={getErrorMessage(error)} className="form-alert" /> : null}
      <div className="list-panel">
        <Tabs
          items={[
            {
              key: 'employees',
              label: 'Сотрудники',
              children: (
                <Space direction="vertical" className="full-width">
                <Checkbox checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)}>Показывать удалённых и заблокированных</Checkbox>
                <Table<Employee>
                  rowKey="id"
                  className="dense-table"
                  dataSource={visibleEmployees}
                  loading={employeesQuery.isLoading}
                  pagination={false}
                  columns={employeeColumns}
                />
                </Space>
              ),
            },
            {
              key: 'roles',
              label: 'Роли и доступы',
              children: <RolesMatrix roles={rolesQuery.data ?? []} loading={rolesQuery.isLoading} />,
            },
            {
              key: 'shifts',
              label: 'График смен',
              children: (
                <div className="list-panel-body">
                  <EmployeeShiftsPanel canManage={canManageShifts} />
                </div>
              ),
            },
          ]}
        />
      </div>
      <EmployeeFormDrawer
        open={createOpen || Boolean(editingEmployee)}
        title={editingEmployee ? 'Редактирование сотрудника' : 'Добавить сотрудника'}
        roles={rolesQuery.data ?? []}
        warehouses={warehouseOptions}
        initialEmployee={editingEmployee}
        onClose={closeEmployeeForm}
        onSubmit={handleEmployeeSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        canConfigureRemoteAccess={isDirector}
        submitError={editingEmployee ? updateMutation.error : createMutation.error}
      />
    </div>
  );
}

function RolesMatrix({ roles, loading }: { roles: RoleTemplate[]; loading: boolean }) {
  return (
    <Table<RoleTemplate>
      rowKey="code"
      className="dense-table"
      dataSource={roles}
      loading={loading}
      pagination={false}
      expandable={{
        expandedRowRender: (role) => (
          <div className="permission-list">
            {role.permissions.map((permission) => (
              <Tag key={permission.code}>{permission.title}</Tag>
            ))}
          </div>
        ),
      }}
      columns={[
        { title: 'Роль', dataIndex: 'title', key: 'title' },
        { title: 'Код', dataIndex: 'code', key: 'code' },
        {
          title: 'Описание',
          dataIndex: 'description',
          key: 'description',
          render: (value: string | null) => value || '—',
        },
        {
          title: 'Разрешения',
          key: 'permissions',
          render: (_, role) => <Typography.Text>{role.permissions.length}</Typography.Text>,
        },
      ]}
    />
  );
}
