import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Checkbox, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { paymentTypeLabels } from '../billing/types';
import { getOrganizationSettings, updateOrganizationSettings } from '../organization/organization.api';
import {
  createCashbox,
  createPaymentMethod,
  getFinanceSettings,
  updateCashbox,
  updatePaymentMethod,
} from './finance.api';
import { Cashbox, CashboxInput, PaymentMethod, PaymentMethodInput } from './types';

const paymentMethodSchema = z.object({
  title: z.string().trim().min(2, 'Укажите название').max(160),
  type: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'DEPOSIT', 'OTHER']),
  isActive: z.boolean(),
  sortOrder: z.number().min(0).max(100000),
});

const cashboxSchema = z.object({
  officeId: z.string().optional(),
  title: z.string().trim().min(2, 'Укажите название').max(160),
  fiscalNumber: z.string().trim().max(120).optional(),
  isActive: z.boolean(),
});

const financePolicySchema = z.object({
  defaultBillDueDays: z.number().min(0, 'Минимум 0').max(365, 'Максимум 365'),
});

type PaymentMethodFormValues = z.infer<typeof paymentMethodSchema>;
type CashboxFormValues = z.infer<typeof cashboxSchema>;
type FinancePolicyFormValues = z.infer<typeof financePolicySchema>;

export function FinanceSettingsPage() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'settings.manage');
  const settingsQuery = useQuery({ queryKey: ['finance', 'settings'], queryFn: getFinanceSettings });
  const organizationQuery = useQuery({ queryKey: ['organization'], queryFn: getOrganizationSettings });
  const [methodModalOpen, setMethodModalOpen] = useState(false);
  const [cashboxModalOpen, setCashboxModalOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [editingCashbox, setEditingCashbox] = useState<Cashbox | null>(null);
  const methodForm = useForm<PaymentMethodFormValues>({
    resolver: zodResolver(paymentMethodSchema),
    defaultValues: getMethodDefaults(null),
  });
  const cashboxForm = useForm<CashboxFormValues>({
    resolver: zodResolver(cashboxSchema),
    defaultValues: getCashboxDefaults(null),
  });
  const policyForm = useForm<FinancePolicyFormValues>({
    resolver: zodResolver(financePolicySchema),
    defaultValues: { defaultBillDueDays: 0 },
  });

  useEffect(() => {
    if (organizationQuery.data) {
      policyForm.reset({ defaultBillDueDays: organizationQuery.data.defaultBillDueDays ?? 0 });
    }
  }, [organizationQuery.data, policyForm]);

  const methodMutation = useMutation({
    mutationFn: (values: PaymentMethodInput) =>
      editingMethod ? updatePaymentMethod(editingMethod.id, values) : createPaymentMethod(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['finance', 'settings'] });
      message.success(editingMethod ? 'Способ оплаты сохранён' : 'Способ оплаты создан');
      closeMethodModal();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const cashboxMutation = useMutation({
    mutationFn: (values: CashboxInput) => (editingCashbox ? updateCashbox(editingCashbox.id, values) : createCashbox(values)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['finance', 'settings'] });
      message.success(editingCashbox ? 'Касса сохранена' : 'Касса создана');
      closeCashboxModal();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const policyMutation = useMutation({
    mutationFn: (values: FinancePolicyFormValues) =>
      updateOrganizationSettings({
        defaultBillDueDays: values.defaultBillDueDays > 0 ? values.defaultBillDueDays : null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['organization'] });
      message.success('Сроки счетов сохранены');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const methodColumns = useMemo<ColumnsType<PaymentMethod>>(
    () => [
      { title: 'Название', dataIndex: 'title', key: 'title', render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
      { title: 'Тип', dataIndex: 'type', key: 'type', width: 180, render: (value: PaymentMethod['type']) => paymentTypeLabels[value] },
      { title: 'Порядок', dataIndex: 'sortOrder', key: 'sortOrder', width: 110 },
      { title: 'Статус', dataIndex: 'isActive', key: 'isActive', width: 120, render: (value: boolean) => (value ? <Tag color="green">Активен</Tag> : <Tag>Выключен</Tag>) },
      {
        title: '',
        key: 'actions',
        width: 130,
        render: (_, method) =>
          canManage ? (
            <Button size="small" icon={<EditOutlined />} onClick={() => openMethod(method)}>
              Открыть
            </Button>
          ) : null,
      },
    ],
    [canManage],
  );
  const cashboxColumns = useMemo<ColumnsType<Cashbox>>(
    () => [
      { title: 'Касса', dataIndex: 'title', key: 'title', render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
      { title: 'Филиал', key: 'office', render: (_, cashbox) => cashbox.office?.name ?? 'Без филиала' },
      { title: 'Фискальный номер', dataIndex: 'fiscalNumber', key: 'fiscalNumber', render: (value: string | null) => value || '—' },
      { title: 'Статус', dataIndex: 'isActive', key: 'isActive', width: 120, render: (value: boolean) => (value ? <Tag color="green">Активна</Tag> : <Tag>Выключена</Tag>) },
      {
        title: '',
        key: 'actions',
        width: 130,
        render: (_, cashbox) =>
          canManage ? (
            <Button size="small" icon={<EditOutlined />} onClick={() => openCashbox(cashbox)}>
              Открыть
            </Button>
          ) : null,
      },
    ],
    [canManage],
  );

  function openMethod(method: PaymentMethod | null) {
    setEditingMethod(method);
    methodForm.reset(getMethodDefaults(method));
    setMethodModalOpen(true);
  }

  function closeMethodModal() {
    setMethodModalOpen(false);
    setEditingMethod(null);
    methodForm.reset(getMethodDefaults(null));
  }

  function openCashbox(cashbox: Cashbox | null) {
    setEditingCashbox(cashbox);
    cashboxForm.reset(getCashboxDefaults(cashbox));
    setCashboxModalOpen(true);
  }

  function closeCashboxModal() {
    setCashboxModalOpen(false);
    setEditingCashbox(null);
    cashboxForm.reset(getCashboxDefaults(null));
  }

  return (
    <div className="page">
      <PageHeader
        title="Финансы"
        description="Способы оплаты и кассы, которые используются при приёме оплат."
        extra={
          canManage ? (
            <Space wrap>
              <Button icon={<PlusOutlined />} onClick={() => openCashbox(null)}>
                Новая касса
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openMethod(null)}>
                Новый способ оплаты
              </Button>
            </Space>
          ) : null
        }
      />
      <Tabs
        items={[
          {
            key: 'methods',
            label: 'Способы оплаты',
            children: (
              <div className="list-panel">
                <div className="list-panel-body">
                  {settingsQuery.isError ? <Typography.Text type="danger">{getErrorMessage(settingsQuery.error)}</Typography.Text> : null}
                  <Table<PaymentMethod>
                    rowKey="id"
                    className="dense-table"
                    columns={methodColumns}
                    dataSource={settingsQuery.data?.paymentMethods ?? []}
                    loading={settingsQuery.isLoading}
                    pagination={false}
                    onRow={(method) => ({ onDoubleClick: () => canManage && openMethod(method) })}
                  />
                </div>
              </div>
            ),
          },
          {
            key: 'cashboxes',
            label: 'Кассы',
            children: (
              <div className="list-panel">
                <div className="list-panel-body">
                  <Table<Cashbox>
                    rowKey="id"
                    className="dense-table"
                    columns={cashboxColumns}
                    dataSource={settingsQuery.data?.cashboxes ?? []}
                    loading={settingsQuery.isLoading}
                    pagination={false}
                    onRow={(cashbox) => ({ onDoubleClick: () => canManage && openCashbox(cashbox) })}
                  />
                </div>
              </div>
            ),
          },
          {
            key: 'policy',
            label: 'Сроки счетов',
            children: (
              <div className="list-panel">
                <div className="list-panel-body">
                  <Space direction="vertical" size={16} className="full-width">
                    {organizationQuery.isError ? <Typography.Text type="danger">{getErrorMessage(organizationQuery.error)}</Typography.Text> : null}
                    <Alert
                      type="info"
                      showIcon
                      message="Срок по умолчанию применяется к новым счетам из приёма, продажи, стационара и ручного счёта. Уже созданные счета меняются в карточке счёта."
                    />
                    <Form layout="vertical" onFinish={policyForm.handleSubmit((values) => policyMutation.mutate(values))}>
                      <Controller
                        control={policyForm.control}
                        name="defaultBillDueDays"
                        render={({ field, fieldState }) => (
                          <Form.Item
                            label="Оплатить новый счёт в течение"
                            validateStatus={fieldState.error ? 'error' : undefined}
                            help={fieldState.error?.message ?? '0 дней — срок по умолчанию не ставится.'}
                          >
                            <InputNumber
                              min={0}
                              max={365}
                              addonAfter="дней"
                              style={{ width: 220 }}
                              value={field.value}
                              disabled={!canManage || organizationQuery.isLoading}
                              onChange={(value) => field.onChange(value ?? 0)}
                            />
                          </Form.Item>
                        )}
                      />
                      <Button
                        type="primary"
                        htmlType="submit"
                        loading={policyMutation.isPending}
                        disabled={!canManage || organizationQuery.isLoading}
                      >
                        Сохранить
                      </Button>
                    </Form>
                  </Space>
                </div>
              </div>
            ),
          },
        ]}
      />
      <Modal
        title={editingMethod ? 'Редактирование способа оплаты' : 'Новый способ оплаты'}
        open={methodModalOpen}
        onCancel={closeMethodModal}
        destroyOnHidden
        footer={
          <Space>
            <Button onClick={closeMethodModal}>Отмена</Button>
            <Button type="primary" loading={methodMutation.isPending} onClick={methodForm.handleSubmit((values) => methodMutation.mutate(values))}>
              Сохранить
            </Button>
          </Space>
        }
      >
        <Form layout="vertical">
          <Controller
            control={methodForm.control}
            name="title"
            render={({ field, fieldState }) => (
              <Form.Item label="Название" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} autoFocus />
              </Form.Item>
            )}
          />
          <div className="form-grid two-columns">
            <Controller
              control={methodForm.control}
              name="type"
              render={({ field }) => (
                <Form.Item label="Тип">
                  <Select {...field} options={Object.entries(paymentTypeLabels).map(([value, label]) => ({ value, label }))} />
                </Form.Item>
              )}
            />
            <Controller
              control={methodForm.control}
              name="sortOrder"
              render={({ field }) => (
                <Form.Item label="Порядок">
                  <InputNumber {...field} min={0} style={{ width: '100%' }} />
                </Form.Item>
              )}
            />
          </div>
          <Controller
            control={methodForm.control}
            name="isActive"
            render={({ field }) => (
              <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                Активен
              </Checkbox>
            )}
          />
        </Form>
      </Modal>
      <Modal
        title={editingCashbox ? 'Редактирование кассы' : 'Новая касса'}
        open={cashboxModalOpen}
        onCancel={closeCashboxModal}
        destroyOnHidden
        footer={
          <Space>
            <Button onClick={closeCashboxModal}>Отмена</Button>
            <Button type="primary" loading={cashboxMutation.isPending} onClick={cashboxForm.handleSubmit((values) => cashboxMutation.mutate(values))}>
              Сохранить
            </Button>
          </Space>
        }
      >
        <Form layout="vertical">
          <Controller
            control={cashboxForm.control}
            name="officeId"
            render={({ field }) => (
              <Form.Item label="Филиал">
                <Select
                  {...field}
                  allowClear
                  placeholder="Без филиала"
                  options={settingsQuery.data?.offices.map((office) => ({ value: office.id, label: office.name }))}
                  onChange={(value) => field.onChange(value ?? '')}
                />
              </Form.Item>
            )}
          />
          <Controller
            control={cashboxForm.control}
            name="title"
            render={({ field, fieldState }) => (
              <Form.Item label="Название" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} autoFocus />
              </Form.Item>
            )}
          />
          <Controller
            control={cashboxForm.control}
            name="fiscalNumber"
            render={({ field, fieldState }) => (
              <Form.Item label="Фискальный номер" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} />
              </Form.Item>
            )}
          />
          <Controller
            control={cashboxForm.control}
            name="isActive"
            render={({ field }) => (
              <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                Активна
              </Checkbox>
            )}
          />
        </Form>
      </Modal>
    </div>
  );
}

function getMethodDefaults(method: PaymentMethod | null): PaymentMethodFormValues {
  return {
    title: method?.title ?? '',
    type: method?.type ?? 'CARD',
    isActive: method?.isActive ?? true,
    sortOrder: method?.sortOrder ?? 0,
  };
}

function getCashboxDefaults(cashbox: Cashbox | null): CashboxFormValues {
  return {
    officeId: cashbox?.officeId ?? '',
    title: cashbox?.title ?? '',
    fiscalNumber: cashbox?.fiscalNumber ?? '',
    isActive: cashbox?.isActive ?? true,
  };
}
