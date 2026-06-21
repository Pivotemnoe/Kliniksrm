import { SaveOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Form, Input, Space, Table, Tabs, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { getOrganizationSettings, updateOrganizationSettings } from './organization.api';
import { OrganizationOffice } from './types';

const organizationSchema = z.object({
  displayName: z.string().trim().min(2, 'Укажите название').max(160),
  legalName: z.string().trim().max(240, 'Слишком длинное название').optional(),
  orgType: z.string().trim().max(80, 'Слишком длинное значение').optional(),
  inn: z.string().trim().max(12, 'Слишком длинный ИНН').optional(),
  kpp: z.string().trim().max(12, 'Слишком длинный КПП').optional(),
  legalAddress: z.string().trim().max(500, 'Слишком длинный адрес').optional(),
  postalAddress: z.string().trim().max(500, 'Слишком длинный адрес').optional(),
  bankName: z.string().trim().max(240, 'Слишком длинное название банка').optional(),
  bik: z.string().trim().max(20, 'Слишком длинный БИК').optional(),
  account: z.string().trim().max(40, 'Слишком длинный счёт').optional(),
  corrAccount: z.string().trim().max(40, 'Слишком длинный счёт').optional(),
});

type OrganizationFormValues = z.infer<typeof organizationSchema>;

const organizationRoutes: Record<string, string> = {
  profile: '/settings/organization/profile',
  details: '/settings/organization/details',
};

export function OrganizationSettingsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'settings.manage');
  const organizationQuery = useQuery({ queryKey: ['organization'], queryFn: getOrganizationSettings });
  const organization = organizationQuery.data;
  const activeTab = location.pathname.endsWith('/details') ? 'details' : 'profile';
  const { control, handleSubmit, reset } = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationSchema),
    defaultValues: getEmptyOrganizationForm(),
  });

  useEffect(() => {
    if (!organization) {
      return;
    }

    reset({
      displayName: organization.displayName,
      legalName: organization.legalName ?? '',
      orgType: organization.orgType ?? '',
      inn: organization.inn ?? '',
      kpp: organization.kpp ?? '',
      legalAddress: organization.legalAddress ?? '',
      postalAddress: organization.postalAddress ?? '',
      bankName: organization.bankName ?? '',
      bik: organization.bik ?? '',
      account: organization.account ?? '',
      corrAccount: organization.corrAccount ?? '',
    });
  }, [organization, reset]);

  const saveMutation = useMutation({
    mutationFn: (values: OrganizationFormValues) => updateOrganizationSettings(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['organization'] });
      message.success('Организация сохранена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  return (
    <div className="page">
      <PageHeader title="Организация" description="Профиль клиники и юридические реквизиты для документов, счетов и печати." />
      {organizationQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(organizationQuery.error)} className="form-alert" /> : null}
      <div className="list-panel">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => navigate(organizationRoutes[key] ?? '/settings/organization')}
          items={[
            {
              key: 'profile',
              label: 'Профиль',
              children: (
                <div className="list-panel-body">
                  <Form layout="vertical">
                    <div className="form-grid two-columns">
                      <Controller
                        control={control}
                        name="displayName"
                        render={({ field, fieldState }) => (
                          <Form.Item label="Название в CRM" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                            <Input {...field} disabled={!canManage || organizationQuery.isLoading} />
                          </Form.Item>
                        )}
                      />
                      <Controller
                        control={control}
                        name="orgType"
                        render={({ field, fieldState }) => (
                          <Form.Item label="Тип организации" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                            <Input {...field} disabled={!canManage || organizationQuery.isLoading} placeholder="Например, клиника" />
                          </Form.Item>
                        )}
                      />
                      <Controller
                        control={control}
                        name="legalName"
                        render={({ field, fieldState }) => (
                          <Form.Item label="Юридическое название" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                            <Input {...field} disabled={!canManage || organizationQuery.isLoading} />
                          </Form.Item>
                        )}
                      />
                      <Controller
                        control={control}
                        name="legalAddress"
                        render={({ field, fieldState }) => (
                          <Form.Item label="Юридический адрес" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                            <Input {...field} disabled={!canManage || organizationQuery.isLoading} />
                          </Form.Item>
                        )}
                      />
                    </div>
                    <OrganizationOffices offices={organization?.offices ?? []} />
                    <SaveButton canManage={canManage} loading={saveMutation.isPending} onClick={handleSubmit((values) => saveMutation.mutate(values))} />
                  </Form>
                </div>
              ),
            },
            {
              key: 'details',
              label: 'Реквизиты',
              children: (
                <div className="list-panel-body">
                  <Form layout="vertical">
                    <div className="form-grid two-columns">
                      <Controller
                        control={control}
                        name="inn"
                        render={({ field, fieldState }) => (
                          <Form.Item label="ИНН" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                            <Input {...field} disabled={!canManage || organizationQuery.isLoading} />
                          </Form.Item>
                        )}
                      />
                      <Controller
                        control={control}
                        name="kpp"
                        render={({ field, fieldState }) => (
                          <Form.Item label="КПП" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                            <Input {...field} disabled={!canManage || organizationQuery.isLoading} />
                          </Form.Item>
                        )}
                      />
                      <Controller
                        control={control}
                        name="bankName"
                        render={({ field, fieldState }) => (
                          <Form.Item label="Банк" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                            <Input {...field} disabled={!canManage || organizationQuery.isLoading} />
                          </Form.Item>
                        )}
                      />
                      <Controller
                        control={control}
                        name="bik"
                        render={({ field, fieldState }) => (
                          <Form.Item label="БИК" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                            <Input {...field} disabled={!canManage || organizationQuery.isLoading} />
                          </Form.Item>
                        )}
                      />
                      <Controller
                        control={control}
                        name="account"
                        render={({ field, fieldState }) => (
                          <Form.Item label="Расчётный счёт" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                            <Input {...field} disabled={!canManage || organizationQuery.isLoading} />
                          </Form.Item>
                        )}
                      />
                      <Controller
                        control={control}
                        name="corrAccount"
                        render={({ field, fieldState }) => (
                          <Form.Item label="Корреспондентский счёт" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                            <Input {...field} disabled={!canManage || organizationQuery.isLoading} />
                          </Form.Item>
                        )}
                      />
                      <Controller
                        control={control}
                        name="postalAddress"
                        render={({ field, fieldState }) => (
                          <Form.Item label="Почтовый адрес" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                            <Input {...field} disabled={!canManage || organizationQuery.isLoading} />
                          </Form.Item>
                        )}
                      />
                    </div>
                    <SaveButton canManage={canManage} loading={saveMutation.isPending} onClick={handleSubmit((values) => saveMutation.mutate(values))} />
                  </Form>
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

function OrganizationOffices({ offices }: { offices: OrganizationOffice[] }) {
  const columns = useMemo<ColumnsType<OrganizationOffice>>(
    () => [
      {
        title: 'Филиал',
        dataIndex: 'name',
        key: 'name',
        render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
      },
      {
        title: 'Телефон',
        dataIndex: 'phone',
        key: 'phone',
        width: 180,
        render: (value: string | null) => value || '—',
      },
      {
        title: 'Адрес',
        dataIndex: 'address',
        key: 'address',
        render: (value: string | null) => value || '—',
      },
      {
        title: '',
        key: 'status',
        width: 120,
        render: () => <Tag>Филиал</Tag>,
      },
    ],
    [],
  );

  return (
    <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 16 }}>
      <Typography.Text strong>Филиалы</Typography.Text>
      <Table<OrganizationOffice>
        rowKey="id"
        className="dense-table"
        columns={columns}
        dataSource={offices}
        pagination={false}
        locale={{ emptyText: 'Филиалы ещё не добавлены' }}
      />
    </Space>
  );
}

function SaveButton({ canManage, loading, onClick }: { canManage: boolean; loading: boolean; onClick: () => void }) {
  if (!canManage) {
    return null;
  }

  return (
    <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={onClick}>
      Сохранить
    </Button>
  );
}

function getEmptyOrganizationForm(): OrganizationFormValues {
  return {
    displayName: '',
    legalName: '',
    orgType: '',
    inn: '',
    kpp: '',
    legalAddress: '',
    postalAddress: '',
    bankName: '',
    bik: '',
    account: '',
    corrAccount: '',
  };
}
