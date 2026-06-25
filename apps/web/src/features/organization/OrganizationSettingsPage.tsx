import { EditOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Form, Input, Modal, Space, Table, Tabs, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { createClinicOffice, updateClinicOffice } from '../scheduling/scheduling.api';
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

const officeSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название филиала').max(160, 'Слишком длинное название'),
  phone: z.string().trim().max(40, 'Слишком длинный телефон').optional(),
  timezone: z.string().trim().min(1, 'Укажите часовой пояс').max(80, 'Слишком длинный часовой пояс'),
  address: z.string().trim().max(500, 'Слишком длинный адрес').optional(),
});

type OfficeFormValues = z.infer<typeof officeSchema>;

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
  const [officeModalOpen, setOfficeModalOpen] = useState(false);
  const [editingOffice, setEditingOffice] = useState<OrganizationOffice | null>(null);
  const { control, handleSubmit, reset } = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationSchema),
    defaultValues: getEmptyOrganizationForm(),
  });
  const {
    control: officeControl,
    handleSubmit: handleOfficeSubmit,
    reset: resetOffice,
  } = useForm<OfficeFormValues>({
    resolver: zodResolver(officeSchema),
    defaultValues: getEmptyOfficeForm(),
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
  const createOfficeMutation = useMutation({
    mutationFn: (values: OfficeFormValues) => createClinicOffice(normalizeOfficeForm(values)),
    onSuccess: async () => {
      await invalidateOfficeData(queryClient);
      setOfficeModalOpen(false);
      message.success('Филиал добавлен');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const updateOfficeMutation = useMutation({
    mutationFn: ({ officeId, values }: { officeId: string; values: OfficeFormValues }) =>
      updateClinicOffice(officeId, normalizeOfficeForm(values)),
    onSuccess: async () => {
      await invalidateOfficeData(queryClient);
      setOfficeModalOpen(false);
      setEditingOffice(null);
      message.success('Филиал сохранён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const officeSaving = createOfficeMutation.isPending || updateOfficeMutation.isPending;

  function openCreateOffice() {
    setEditingOffice(null);
    resetOffice(getEmptyOfficeForm());
    setOfficeModalOpen(true);
  }

  function openEditOffice(office: OrganizationOffice) {
    setEditingOffice(office);
    resetOffice({
      name: office.name,
      phone: office.phone ?? '',
      timezone: office.timezone || 'Europe/Moscow',
      address: office.address ?? '',
    });
    setOfficeModalOpen(true);
  }

  function closeOfficeModal() {
    if (officeSaving) {
      return;
    }

    setOfficeModalOpen(false);
    setEditingOffice(null);
  }

  function submitOffice(values: OfficeFormValues) {
    if (editingOffice) {
      updateOfficeMutation.mutate({ officeId: editingOffice.id, values });
      return;
    }

    createOfficeMutation.mutate(values);
  }

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
                    <OrganizationOffices offices={organization?.offices ?? []} canManage={canManage} onCreate={openCreateOffice} onEdit={openEditOffice} />
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
      <Modal
        title={editingOffice ? 'Редактировать филиал' : 'Добавить филиал'}
        open={officeModalOpen}
        okText={editingOffice ? 'Сохранить' : 'Добавить'}
        cancelText="Отмена"
        confirmLoading={officeSaving}
        onCancel={closeOfficeModal}
        onOk={handleOfficeSubmit(submitOffice)}
        destroyOnHidden
      >
        <Form layout="vertical">
          <Controller
            control={officeControl}
            name="name"
            render={({ field, fieldState }) => (
              <Form.Item label="Название филиала" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} autoFocus />
              </Form.Item>
            )}
          />
          <Controller
            control={officeControl}
            name="phone"
            render={({ field, fieldState }) => (
              <Form.Item label="Телефон" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} />
              </Form.Item>
            )}
          />
          <Controller
            control={officeControl}
            name="address"
            render={({ field, fieldState }) => (
              <Form.Item label="Адрес" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} />
              </Form.Item>
            )}
          />
          <Controller
            control={officeControl}
            name="timezone"
            render={({ field, fieldState }) => (
              <Form.Item label="Часовой пояс" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} />
              </Form.Item>
            )}
          />
        </Form>
      </Modal>
    </div>
  );
}

function OrganizationOffices({
  offices,
  canManage,
  onCreate,
  onEdit,
}: {
  offices: OrganizationOffice[];
  canManage: boolean;
  onCreate: () => void;
  onEdit: (office: OrganizationOffice) => void;
}) {
  const columns = useMemo<ColumnsType<OrganizationOffice>>(
    () => {
      const baseColumns: ColumnsType<OrganizationOffice> = [
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
      ];

      if (canManage) {
        baseColumns.push({
          title: '',
          key: 'actions',
          width: 160,
          render: (_, record) => (
            <Button icon={<EditOutlined />} onClick={() => onEdit(record)}>
              Редактировать
            </Button>
          ),
        });
      }

      return baseColumns;
    },
    [canManage, onEdit],
  );

  return (
    <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 16 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Text strong>Филиалы</Typography.Text>
        {canManage ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            Добавить филиал
          </Button>
        ) : null}
      </Space>
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

async function invalidateOfficeData(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['organization'] }),
    queryClient.invalidateQueries({ queryKey: ['scheduling', 'settings'] }),
    queryClient.invalidateQueries({ queryKey: ['scheduling', 'resources'] }),
  ]);
}

function normalizeOfficeForm(values: OfficeFormValues) {
  return {
    name: values.name.trim(),
    phone: values.phone?.trim() ?? '',
    timezone: values.timezone.trim() || 'Europe/Moscow',
    address: values.address?.trim() ?? '',
  };
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

function getEmptyOfficeForm(): OfficeFormValues {
  return {
    name: '',
    phone: '',
    timezone: 'Europe/Moscow',
    address: '',
  };
}
