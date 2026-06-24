import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Space, Table, Tag, Tabs, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { getSchedulingSettings } from '../scheduling/scheduling.api';
import { getDefaultRouteLabel } from '../../shared/routes/defaultRoutes';
import { PageHeader } from '../../shared/ui/PageHeader';
import { createEmployee, listEmployees, listRoles, updateEmployee } from './employees.api';
import { EmployeeFormDrawer, EmployeeFormValues, toUpdateEmployeeInput } from './EmployeeFormDrawer';
import { CreateEmployeeInput, Employee, RoleTemplate, UpdateEmployeeInput } from './types';

export function EmployeesPage() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const currentEmployeeQuery = useCurrentEmployee();
  const employeesQuery = useQuery({ queryKey: ['employees'], queryFn: listEmployees });
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: listRoles });
  const [createOpen, setCreateOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const currentEmployee = currentEmployeeQuery.data?.employee;
  const canManage =
    hasPermission(currentEmployee, 'employees.manage') && hasPermission(currentEmployee, 'roles.manage');
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
      setCreateOpen(false);
      message.success('Сотрудник создан');
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

    if (canManage) {
      columns.push({
        title: 'Действия',
        key: 'actions',
        width: 160,
        render: (_, record) => (
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditingEmployee(record)}>
            Редактировать
          </Button>
        ),
      });
    }

    return columns;
  }, [canManage]);

  function closeEmployeeForm() {
    setCreateOpen(false);
    setEditingEmployee(null);
    createMutation.reset();
    updateMutation.reset();
  }

  function handleEmployeeSubmit(values: EmployeeFormValues) {
    const normalizedValues = toUpdateEmployeeInput(values);

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
                <Table<Employee>
                  rowKey="id"
                  className="dense-table"
                  dataSource={employeesQuery.data ?? []}
                  loading={employeesQuery.isLoading}
                  pagination={false}
                  columns={employeeColumns}
                />
              ),
            },
            {
              key: 'roles',
              label: 'Роли и доступы',
              children: <RolesMatrix roles={rolesQuery.data ?? []} loading={rolesQuery.isLoading} />,
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
