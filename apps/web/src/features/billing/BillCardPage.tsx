import {
  CheckCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  LeftOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Checkbox, Form, Input, InputNumber, Modal, Popconfirm, Radio, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDate, formatDateTime, fromDatetimeLocal, toDatetimeLocal } from '../../shared/utils/date';
import { formatMoney, toMoneyNumber } from '../../shared/utils/money';
import { getFinanceSettings } from '../finance/finance.api';
import { listProducts, listServices } from '../stock/stock.api';
import { formatServicePrice, getServiceDefaultPrice, getServicePriceHelp, getServicePriceRange, validateServicePrice } from '../stock/service-pricing';
import {
  addBillItem,
  cancelBill,
  createPayment,
  deleteBillItem,
  getBill,
  refundPayment,
  reopenBill,
  updateBill,
  updateBillItem,
} from './billing.api';
import {
  Bill,
  BillItem,
  BillItemMutationInput,
  Payment,
  PaymentType,
  billSourceLabels,
  paymentStatusColors,
  paymentStatusLabels,
  paymentTypeLabels,
} from './types';

export function BillCardPage() {
  const { billId } = useParams<{ billId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManageBills = hasPermission(auth?.employee, 'billing.manage');
  const canManagePayments = hasPermission(auth?.employee, 'payments.manage');
  const [dueAtOpen, setDueAtOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [paymentRequestKey, setPaymentRequestKey] = useState(() => (searchParams.get('pay') === '1' ? 1 : 0));
  const [activeTab, setActiveTab] = useState(() => (searchParams.get('pay') === '1' ? 'payments' : 'items'));
  const billQuery = useQuery({
    queryKey: ['bills', billId],
    queryFn: () => getBill(billId!),
    enabled: Boolean(billId),
  });
  const statusMutation = useMutation({
    mutationFn: (action: 'cancel' | 'reopen') => (action === 'cancel' ? cancelBill(billId!) : reopenBill(billId!)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bills', billId] }),
        queryClient.invalidateQueries({ queryKey: ['bills'] }),
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
      ]);
      message.success('Статус счёта обновлён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const updateBillMutation = useMutation({
    mutationFn: (values: UpdateBillFormValues) =>
      updateBill(billId!, {
        dueAt: values.dueAt ? toDueAtIso(values.dueAt) : null,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bills', billId] }),
        queryClient.invalidateQueries({ queryKey: ['bills'] }),
      ]);
      message.success('Срок оплаты сохранён');
      setDueAtOpen(false);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const bill = billQuery.data;
  const debt = bill ? Math.max(toMoneyNumber(bill.totalAmount) - toMoneyNumber(bill.paidAmount), 0) : 0;
  const isOverdue = Boolean(bill?.dueAt && debt > 0 && new Date(bill.dueAt) < new Date());
  const canEditItems = Boolean(canManageBills && bill && bill.status !== 'CANCELLED' && toMoneyNumber(bill.paidAmount) <= 0);
  const canPay = Boolean(canManagePayments && bill && bill.status !== 'CANCELLED' && debt > 0);

  if (billQuery.isError) {
    return (
      <div className="page">
        <PageHeader title="Счёт" />
        <Card>
          <Typography.Text type="danger">{getErrorMessage(billQuery.error)}</Typography.Text>
        </Card>
      </div>
    );
  }

  return (
    <div className="workbench">
      <aside className="context-panel">
        <div className="context-section">
          <div className="context-section-header">
            <button className="table-link" type="button" onClick={() => navigate('/bills')}>
              <LeftOutlined /> К счетам
            </button>
          </div>
          <div className="context-section-body context-grid">
            <ContextRow label="Создан" value={formatDateTime(bill?.createdAt)} />
            <ContextRow label="Срок оплаты" value={formatDate(bill?.dueAt)} />
            <ContextRow label="Источник" value={bill ? billSourceLabels[bill.source] : undefined} />
          </div>
        </div>
        <div className="context-section">
          <div className="context-section-header">
            <strong>Оплата</strong>
            {bill ? <Tag color={paymentStatusColors[bill.status]}>{paymentStatusLabels[bill.status]}</Tag> : null}
          </div>
          <div className="context-section-body">
            <div className="visit-sidebar-total">{bill ? formatMoney(bill.totalAmount) : '—'}</div>
            <Typography.Text type="secondary">
              Оплачено {bill ? formatMoney(bill.paidAmount) : '—'}
              {debt > 0 ? `, долг ${formatMoney(debt)}` : ''}
            </Typography.Text>
            {isOverdue ? <Tag color="red">Просрочен</Tag> : null}
            {canPay ? (
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => {
                  setActiveTab('payments');
                  setPaymentRequestKey((value) => value + 1);
                }}
              >
                Оплатить {formatMoney(debt)}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="context-section">
          <div className="context-section-header">
            <strong>Владелец</strong>
          </div>
          <div className="context-section-body">
            {bill?.owner ? (
              <Typography.Link onClick={() => navigate(`/owners/${bill.owner?.id}`)}>{bill.owner.fullName}</Typography.Link>
            ) : (
              '—'
            )}
          </div>
        </div>
        <div className="context-section">
          <div className="context-section-header">
            <strong>Пациент</strong>
          </div>
          <div className="context-section-body">
            {bill?.animal ? (
              <Typography.Link onClick={() => navigate(`/patients/${bill.animal?.id}`)}>{bill.animal.nickname}</Typography.Link>
            ) : (
              '—'
            )}
          </div>
        </div>
        {canManageBills && bill ? (
          <div className="context-section">
            <div className="context-section-body">
              <Space wrap>
                <Button icon={<PrinterOutlined />} onClick={() => setPrintOpen(true)}>
                  Печать
                </Button>
                <Button icon={<EditOutlined />} onClick={() => setDueAtOpen(true)}>
                  Срок оплаты
                </Button>
                {bill.status === 'CANCELLED' ? (
                  <Button icon={<ReloadOutlined />} loading={statusMutation.isPending} onClick={() => statusMutation.mutate('reopen')}>
                    Вернуть
                  </Button>
                ) : (
                  <Popconfirm
                    title="Отменить счёт?"
                    description="Отменить можно только счёт без оплат."
                    okText="Отменить счёт"
                    cancelText="Назад"
                    onConfirm={() => statusMutation.mutate('cancel')}
                  >
                    <Button danger icon={<CloseOutlined />} loading={statusMutation.isPending} disabled={toMoneyNumber(bill.paidAmount) > 0}>
                      Отменить
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            </div>
          </div>
        ) : null}
      </aside>
      <main className="work-area">
        <div className="work-surface">
          {bill ? (
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={[
                {
                  key: 'items',
                  label: 'Позиции',
                  children: <BillItemsTab bill={bill} canEdit={canEditItems} />,
                },
                {
                  key: 'payments',
                  label: 'Оплаты',
                  children: <BillPaymentsTab bill={bill} canPay={canPay} canRefund={canManagePayments && bill.status !== 'CANCELLED'} paymentRequestKey={paymentRequestKey} />,
                },
                {
                  key: 'profile',
                  label: 'Основное',
                  children: <BillProfile bill={bill} />,
                },
              ]}
            />
          ) : null}
        </div>
      </main>
      {bill ? (
        <>
          <BillDueAtModal
            open={dueAtOpen}
            bill={bill}
            loading={updateBillMutation.isPending}
            onClose={() => setDueAtOpen(false)}
            onSubmit={(values) => updateBillMutation.mutate(values)}
          />
          <BillPrintEditor open={printOpen} bill={bill} onClose={() => setPrintOpen(false)} />
        </>
      ) : null}
    </div>
  );
}

const updateBillSchema = z.object({
  dueAt: z.string().optional(),
});

type UpdateBillFormValues = z.infer<typeof updateBillSchema>;

function BillDueAtModal({
  open,
  bill,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  bill: Bill;
  loading: boolean;
  onClose: () => void;
  onSubmit: (values: UpdateBillFormValues) => void;
}) {
  const { control, handleSubmit, reset } = useForm<UpdateBillFormValues>({
    resolver: zodResolver(updateBillSchema),
    defaultValues: { dueAt: toDateInput(bill.dueAt) },
  });

  useEffect(() => {
    if (open) {
      reset({ dueAt: toDateInput(bill.dueAt) });
    }
  }, [bill.dueAt, open, reset]);

  return (
    <Modal
      title="Срок оплаты"
      open={open}
      okText="Сохранить"
      cancelText="Отмена"
      confirmLoading={loading}
      onCancel={onClose}
      onOk={handleSubmit(onSubmit)}
      destroyOnHidden
      width={420}
    >
      <Form layout="vertical">
        <Controller
          control={control}
          name="dueAt"
          render={({ field }) => (
            <Form.Item label="Оплатить до">
              <Input {...field} type="date" />
            </Form.Item>
          )}
        />
        <Typography.Text type="secondary">Если оставить поле пустым, срок оплаты будет снят.</Typography.Text>
      </Form>
    </Modal>
  );
}

function BillItemsTab({ bill, canEdit }: { bill: Bill; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BillItem | null>(null);
  const mutation = useMutation({
    mutationFn: (input: { item?: BillItem | null; values: BillItemMutationInput }) =>
      input.item ? updateBillItem(bill.id, input.item.id, input.values) : addBillItem(bill.id, input.values),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bills', bill.id] }),
        queryClient.invalidateQueries({ queryKey: ['bills'] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
      ]);
      message.success('Позиции счёта обновлены');
      setModalOpen(false);
      setEditingItem(null);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => deleteBillItem(bill.id, itemId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bills', bill.id] }),
        queryClient.invalidateQueries({ queryKey: ['bills'] }),
      ]);
      message.success('Позиция удалена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const columns = useMemo<ColumnsType<BillItem>>(
    () => [
      { title: 'Позиция', dataIndex: 'title', key: 'title' },
      {
        title: 'Начислено / списано',
        key: 'quantity',
        render: (_, record) => {
          if (!record.productId) {
            return String(record.quantity);
          }

          const billingUnit = record.product?.billingUnit || record.product?.writeOffUnit || record.product?.stockUnit || 'ед.';
          const writeOffUnit = record.product?.writeOffUnit || record.product?.stockUnit || 'ед.';
          return (
            <Space direction="vertical" size={0}>
              <span>{String(record.quantity)} {billingUnit}</span>
              <Typography.Text type="secondary">списано {String(record.stockQuantity ?? record.quantity)} {writeOffUnit}</Typography.Text>
            </Space>
          );
        },
      },
      { title: 'Цена за начисление', dataIndex: 'unitPrice', key: 'unitPrice', render: formatMoney },
      { title: 'Скидка', dataIndex: 'discount', key: 'discount', render: formatMoney },
      { title: 'Итого', dataIndex: 'totalAmount', key: 'totalAmount', render: formatMoney },
      {
        title: 'Склад',
        key: 'stock',
        render: (_, record) =>
          record.productId ? (
            <Typography.Text type={record.stockMovements?.length ? 'secondary' : 'danger'}>
              {record.stockMovements?.length ? 'Списано' : 'Нет движения'}
            </Typography.Text>
          ) : (
            '—'
          ),
      },
      {
        title: '',
        key: 'actions',
        width: 118,
        render: (_, record) =>
          canEdit ? (
            <Space>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => {
                  setEditingItem(record);
                  setModalOpen(true);
                }}
              />
              <Popconfirm
                title="Удалить позицию?"
                okText="Удалить"
                cancelText="Отмена"
                onConfirm={() => deleteMutation.mutate(record.id)}
              >
                <Button size="small" danger icon={<DeleteOutlined />} loading={deleteMutation.isPending} />
              </Popconfirm>
            </Space>
          ) : null,
      },
    ],
    [canEdit, deleteMutation],
  );

  return (
    <Space direction="vertical" size={16} className="full-width">
      <div className="toolbar-row">
        <Typography.Title level={4}>Позиции счёта</Typography.Title>
        {canEdit ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingItem(null);
              setModalOpen(true);
            }}
          >
            Добавить позицию
          </Button>
        ) : null}
      </div>
      {!canEdit && bill.status !== 'CANCELLED' && toMoneyNumber(bill.paidAmount) > 0 ? (
        <Typography.Text type="secondary">Позиции оплаченного счёта нельзя менять без возврата оплаты.</Typography.Text>
      ) : null}
      <Table<BillItem>
        rowKey="id"
        className="dense-table"
        columns={columns}
        dataSource={bill.items}
        pagination={false}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={4}>
                <strong>Итого</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4}>
                <strong>{formatMoney(bill.totalAmount)}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={5} />
              <Table.Summary.Cell index={6} />
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
      <BillItemModal
        open={modalOpen}
        item={editingItem}
        loading={mutation.isPending}
        onClose={() => {
          setModalOpen(false);
          setEditingItem(null);
        }}
        onSubmit={(values) => mutation.mutate({ item: editingItem, values })}
      />
    </Space>
  );
}

function BillPaymentsTab({ bill, canPay, canRefund, paymentRequestKey }: { bill: Bill; canPay: boolean; canRefund: boolean; paymentRequestKey: number }) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [payOpen, setPayOpen] = useState(false);
  const [refundPaymentRecord, setRefundPaymentRecord] = useState<Payment | null>(null);
  const debt = Math.max(toMoneyNumber(bill.totalAmount) - toMoneyNumber(bill.paidAmount), 0);

  useEffect(() => {
    if (paymentRequestKey > 0 && canPay) {
      setPayOpen(true);
    }
  }, [canPay, paymentRequestKey]);
  const payMutation = useMutation({
    mutationFn: (values: PaymentFormValues) =>
      createPayment(bill.id, {
        type: values.type,
        paymentMethodId: values.paymentMethodId || undefined,
        cashboxId: values.cashboxId || undefined,
        amount: values.amount,
        paidAt: fromDatetimeLocal(values.paidAt),
        comment: values.comment || undefined,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bills', bill.id] }),
        queryClient.invalidateQueries({ queryKey: ['bills'] }),
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        queryClient.invalidateQueries({ queryKey: ['owners', bill.ownerId] }),
        queryClient.invalidateQueries({ queryKey: ['owners'] }),
      ]);
      message.success('Оплата проведена');
      setPayOpen(false);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const refundMutation = useMutation({
    mutationFn: (values: RefundFormValues) =>
      refundPayment(bill.id, refundPaymentRecord!.id, { amount: values.amount, comment: values.comment || undefined }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bills', bill.id] }),
        queryClient.invalidateQueries({ queryKey: ['bills'] }),
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        queryClient.invalidateQueries({ queryKey: ['owners', bill.ownerId] }),
        queryClient.invalidateQueries({ queryKey: ['owners'] }),
      ]);
      message.success('Возврат проведён');
      setRefundPaymentRecord(null);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const columns = useMemo<ColumnsType<Payment>>(
    () => [
      { title: 'Дата', dataIndex: 'paidAt', key: 'paidAt', render: formatDateTime },
      {
        title: 'Способ',
        dataIndex: 'type',
        key: 'type',
        render: (value: PaymentType, record) => record.paymentMethod?.title ?? paymentTypeLabels[value],
      },
      { title: 'Касса', key: 'cashbox', render: (_, record) => record.cashbox?.title ?? '—' },
      {
        title: 'Сумма',
        dataIndex: 'amount',
        key: 'amount',
        render: (value: string) => (
          <Typography.Text type={toMoneyNumber(value) < 0 ? 'danger' : undefined}>{formatMoney(value)}</Typography.Text>
        ),
      },
      { title: 'Сотрудник', key: 'employee', render: (_, record) => record.employee?.fullName ?? '—' },
      { title: 'Комментарий', dataIndex: 'comment', key: 'comment', render: (value: string | null) => value || '—' },
      {
        title: '',
        key: 'actions',
        width: 110,
        render: (_, record) =>
          canRefund && toMoneyNumber(record.amount) > 0 ? (
            <Button size="small" icon={<RollbackOutlined />} onClick={() => setRefundPaymentRecord(record)}>
              Возврат
            </Button>
          ) : null,
      },
    ],
    [canRefund],
  );

  return (
    <Space direction="vertical" size={16} className="full-width">
      <div className="toolbar-row">
        <Typography.Title level={4}>Оплаты</Typography.Title>
        {canPay ? (
          <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => setPayOpen(true)}>
            Принять оплату
          </Button>
        ) : null}
      </div>
      <Space wrap>
        <Tag color="default">Сумма {formatMoney(bill.totalAmount)}</Tag>
        <Tag color="green">Оплачено {formatMoney(bill.paidAmount)}</Tag>
        {debt > 0 ? <Tag color="red">К оплате {formatMoney(debt)}</Tag> : null}
      </Space>
      <Table<Payment> rowKey="id" className="dense-table" columns={columns} dataSource={bill.payments} pagination={false} />
      <PaymentModal
        open={payOpen}
        debt={debt}
        ownerBalance={toMoneyNumber(bill.owner?.balance)}
        loading={payMutation.isPending}
        onClose={() => setPayOpen(false)}
        onSubmit={(values) => payMutation.mutate(values)}
      />
      <RefundModal
        payment={refundPaymentRecord}
        loading={refundMutation.isPending}
        onClose={() => setRefundPaymentRecord(null)}
        onSubmit={(values) => refundMutation.mutate(values)}
      />
    </Space>
  );
}

function BillProfile({ bill }: { bill: Bill }) {
  const navigate = useNavigate();

  return (
    <Space direction="vertical" size={14} className="full-width">
      <Card size="small" title="Связи">
        <Space direction="vertical">
          {bill.visit ? (
            <Typography.Link onClick={() => navigate(`/visits/${bill.visitId}`)}>
              Приём от {formatDateTime(bill.visit.startedAt)}
            </Typography.Link>
          ) : null}
          {bill.sale ? (
            <Typography.Link onClick={() => navigate('/sales')}>
              Продажа от {formatDateTime(bill.sale.createdAt)}
            </Typography.Link>
          ) : null}
          {!bill.visit && !bill.sale ? <Typography.Text>Ручной счёт без приёма и продажи.</Typography.Text> : null}
        </Space>
      </Card>
      <Card size="small" title="Системная информация">
        <div className="context-grid">
          <ContextRow label="Создан" value={formatDateTime(bill.createdAt)} />
          <ContextRow label="Срок оплаты" value={formatDate(bill.dueAt)} />
          <ContextRow label="Обновлён" value={formatDateTime(bill.updatedAt)} />
        </div>
      </Card>
    </Space>
  );
}

const itemFormSchema = z
  .object({
    lineType: z.enum(['MANUAL', 'SERVICE', 'PRODUCT']),
    serviceId: z.string().optional(),
    productId: z.string().optional(),
    title: z.string().trim().optional(),
    quantity: z.number().min(0.001, 'Введите количество'),
    stockQuantity: z.number().min(0.001, 'Укажите, сколько списать со склада').optional(),
    unitPrice: z.number().min(0, 'Введите цену'),
    discount: z.number().min(0, 'Введите скидку'),
  })
  .superRefine((value, ctx) => {
    if (value.lineType === 'SERVICE' && !value.serviceId) {
      ctx.addIssue({ code: 'custom', path: ['serviceId'], message: 'Выберите услугу' });
    }

    if (value.lineType === 'PRODUCT' && !value.productId) {
      ctx.addIssue({ code: 'custom', path: ['productId'], message: 'Выберите товар' });
    }

    if (value.lineType === 'PRODUCT' && !value.stockQuantity) {
      ctx.addIssue({ code: 'custom', path: ['stockQuantity'], message: 'Укажите, сколько списать со склада' });
    }

    if (value.lineType === 'MANUAL' && !value.title?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['title'], message: 'Введите название' });
    }
  });

type ItemFormValues = z.infer<typeof itemFormSchema>;

function BillItemModal({
  open,
  item,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  item: BillItem | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (values: BillItemMutationInput) => void;
}) {
  const { control, handleSubmit, reset, setValue, setError } = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: getItemDefaults(item),
  });
  const lineType = useWatch({ control, name: 'lineType' });
  const productId = useWatch({ control, name: 'productId' });
  const serviceId = useWatch({ control, name: 'serviceId' });
  const productsQuery = useQuery({
    queryKey: ['stock', 'products', 'bill-select'],
    queryFn: () => listProducts({ limit: 100, offset: 0 }),
    enabled: open,
  });
  const servicesQuery = useQuery({
    queryKey: ['stock', 'services', 'bill-select'],
    queryFn: () => listServices({ limit: 100, offset: 0 }),
    enabled: open,
  });
  const selectedProduct = productsQuery.data?.items.find((product) => product.id === productId);
  const selectedService = servicesQuery.data?.items.find((service) => service.id === serviceId) ?? item?.service ?? null;
  const selectedServiceRange = getServicePriceRange(selectedService);

  useEffect(() => {
    if (open) {
      reset(getItemDefaults(item));
    }
  }, [item, open, reset]);

  function submit(values: ItemFormValues) {
    if (values.lineType === 'SERVICE') {
      const priceError = validateServicePrice(selectedService, values.unitPrice);
      if (priceError) {
        setError('unitPrice', { message: priceError });
        return;
      }
    }
    if (item) {
      onSubmit({
        title: values.title,
        quantity: values.quantity,
        ...(values.lineType === 'PRODUCT' && values.stockQuantity ? { stockQuantity: values.stockQuantity } : {}),
        unitPrice: values.unitPrice,
        discount: values.discount,
      });
      return;
    }

    onSubmit({
      serviceId: values.lineType === 'SERVICE' ? values.serviceId : undefined,
      productId: values.lineType === 'PRODUCT' ? values.productId : undefined,
      title: values.title,
      quantity: values.quantity,
      ...(values.lineType === 'PRODUCT' && values.stockQuantity ? { stockQuantity: values.stockQuantity } : {}),
      unitPrice: values.unitPrice,
      discount: values.discount,
    });
  }

  return (
    <Modal
      title={item ? 'Редактирование позиции' : 'Добавить позицию'}
      open={open}
      okText={item ? 'Сохранить' : 'Добавить'}
      cancelText="Отмена"
      confirmLoading={loading}
      onCancel={onClose}
      onOk={handleSubmit(submit)}
      destroyOnHidden
      width={680}
    >
      <Form layout="vertical">
        <Controller
          control={control}
          name="lineType"
          render={({ field }) => (
            <Form.Item label="Тип позиции">
              <Select
                {...field}
                disabled={Boolean(item)}
                options={[
                  { value: 'MANUAL', label: 'Ручная позиция' },
                  { value: 'SERVICE', label: 'Услуга' },
                  { value: 'PRODUCT', label: 'Товар' },
                ]}
              />
            </Form.Item>
          )}
        />
        {lineType === 'SERVICE' ? (
          <Controller
            control={control}
            name="serviceId"
            render={({ field, fieldState }) => (
              <Form.Item label="Услуга" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select
                  {...field}
                  showSearch
                  loading={servicesQuery.isLoading}
                  disabled={Boolean(item)}
                  placeholder="Выберите услугу"
                  options={servicesQuery.data?.items.map((service) => ({ value: service.id, label: `${service.title} · ${formatServicePrice(service)}` })) ?? []}
                  onChange={(value) => {
                    field.onChange(value);
                    const service = servicesQuery.data?.items.find((item) => item.id === value);
                    setValue('title', service?.title ?? '');
                    setValue('unitPrice', getServiceDefaultPrice(service));
                  }}
                />
              </Form.Item>
            )}
          />
        ) : null}
        {lineType === 'PRODUCT' ? (
          <Controller
            control={control}
            name="productId"
            render={({ field, fieldState }) => (
              <Form.Item label="Товар" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select
                  {...field}
                  showSearch
                  loading={productsQuery.isLoading}
                  disabled={Boolean(item)}
                  placeholder="Выберите товар"
                  options={productsQuery.data?.items.map((product) => ({
                    value: product.id,
                    label: `${product.title} · ${product.writeOffUnit || product.stockUnit || 'шт'}`,
                  })) ?? []}
                  onChange={(value) => {
                    field.onChange(value);
                    const product = productsQuery.data?.items.find((item) => item.id === value);
                    setValue('title', product?.title ?? '');
                    setValue('unitPrice', toMoneyNumber(product?.retailPrice));
                    setValue('quantity', 1);
                    setValue('stockQuantity', 1);
                  }}
                />
              </Form.Item>
            )}
          />
        ) : null}
        {lineType === 'MANUAL' ? (
          <Controller
            control={control}
            name="title"
            render={({ field, fieldState }) => (
              <Form.Item label="Название позиции" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} />
              </Form.Item>
            )}
          />
        ) : null}
        {lineType === 'PRODUCT' && selectedProduct ? (
          <Alert
            type="info"
            showIcon
            message={`Склад и оплата считаются отдельно: фактический расход — в ${selectedProduct.writeOffUnit || selectedProduct.stockUnit || 'ед.'}, начисление — в ${selectedProduct.billingUnit || selectedProduct.writeOffUnit || selectedProduct.stockUnit || 'ед.'}.`}
          />
        ) : null}
        <div className="form-grid two-columns">
          {lineType === 'PRODUCT' ? (
            <MoneyNumber
              control={control}
              name="stockQuantity"
              label={`Списать со склада, ${selectedProduct?.writeOffUnit || selectedProduct?.stockUnit || item?.product?.writeOffUnit || item?.product?.stockUnit || 'ед.'}`}
              min={0.001}
              step={0.01}
            />
          ) : null}
          <MoneyNumber
            control={control}
            name="quantity"
            label={lineType === 'PRODUCT'
              ? `Начислить клиенту, ${selectedProduct?.billingUnit || selectedProduct?.writeOffUnit || selectedProduct?.stockUnit || item?.product?.billingUnit || item?.product?.writeOffUnit || item?.product?.stockUnit || 'ед.'}`
              : 'Количество'}
            min={0.001}
            step={0.01}
          />
          <MoneyNumber
            control={control}
            name="unitPrice"
            label={lineType === 'PRODUCT' ? 'Цена за 1 начисление' : 'Фактическая цена'}
            min={lineType === 'SERVICE' ? selectedServiceRange?.minimum ?? 0 : 0}
            max={lineType === 'SERVICE' ? selectedServiceRange?.maximum : undefined}
            help={lineType === 'SERVICE' ? getServicePriceHelp(selectedService) : undefined}
          />
          <MoneyNumber control={control} name="discount" label="Скидка" />
        </div>
      </Form>
    </Modal>
  );
}

const paymentFormSchema = z.object({
  type: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'DEPOSIT', 'OTHER']),
  paymentMethodId: z.string().optional(),
  cashboxId: z.string().optional(),
  amount: z.number().min(0.01, 'Введите сумму'),
  paidAt: z.string().optional(),
  comment: z.string().trim().optional(),
});

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

function PaymentModal({
  open,
  debt,
  ownerBalance,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  debt: number;
  ownerBalance: number;
  loading: boolean;
  onClose: () => void;
  onSubmit: (values: PaymentFormValues) => void;
}) {
  const { control, handleSubmit, reset, setValue } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: getPaymentDefaults(debt),
  });
  const financeQuery = useQuery({ queryKey: ['finance', 'settings'], queryFn: getFinanceSettings, enabled: open });
  const activePaymentMethods = financeQuery.data?.paymentMethods.filter((method) => method.isActive) ?? [];
  const activeCashboxes = financeQuery.data?.cashboxes.filter((cashbox) => cashbox.isActive) ?? [];
  const paymentMethodId = useWatch({ control, name: 'paymentMethodId' });
  const paymentType = useWatch({ control, name: 'type' });
  const amount = useWatch({ control, name: 'amount' });
  const isDepositOverBalance = paymentType === 'DEPOSIT' && Number(amount ?? 0) > ownerBalance;

  useEffect(() => {
    if (open) {
      reset(getPaymentDefaults(debt));
    }
  }, [debt, open, reset]);

  useEffect(() => {
    const method = activePaymentMethods.find((item) => item.id === paymentMethodId);
    if (method) {
      setValue('type', method.type);
    }
  }, [activePaymentMethods, paymentMethodId, setValue]);

  return (
    <Modal
      title="Принять оплату"
      open={open}
      okText="Провести"
      cancelText="Отмена"
      confirmLoading={loading}
      onCancel={onClose}
      onOk={handleSubmit(onSubmit)}
      okButtonProps={{ disabled: isDepositOverBalance }}
      destroyOnHidden
      width={560}
    >
      <Form layout="vertical">
        <Controller
          control={control}
          name="paymentMethodId"
          render={({ field }) => (
            <Form.Item label="Способ оплаты">
              <Select
                {...field}
                allowClear
                loading={financeQuery.isLoading}
                placeholder="Выберите способ оплаты"
                options={activePaymentMethods.map((method) => ({ value: method.id, label: method.title }))}
                onChange={(value) => field.onChange(value ?? '')}
              />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <Form.Item label="Тип оплаты">
              <Select {...field} disabled={Boolean(paymentMethodId)} options={Object.entries(paymentTypeLabels).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          )}
        />
        {paymentType === 'DEPOSIT' ? (
          <Alert
            type={isDepositOverBalance ? 'error' : 'info'}
            showIcon
            message={`Доступно на депозите: ${formatMoney(ownerBalance)}`}
            description={isDepositOverBalance ? 'Сумма оплаты больше баланса владельца.' : 'После проведения оплаты сумма спишется с баланса владельца.'}
          />
        ) : null}
        <Controller
          control={control}
          name="cashboxId"
          render={({ field }) => (
            <Form.Item label="Касса">
              <Select
                {...field}
                allowClear
                loading={financeQuery.isLoading}
                placeholder="Без кассы"
                options={activeCashboxes.map((cashbox) => ({
                  value: cashbox.id,
                  label: cashbox.office?.name ? `${cashbox.title} · ${cashbox.office.name}` : cashbox.title,
                }))}
                onChange={(value) => field.onChange(value ?? '')}
              />
            </Form.Item>
          )}
        />
        <MoneyNumber control={control} name="amount" label="Сумма" min={0.01} />
        <Controller
          control={control}
          name="paidAt"
          render={({ field }) => (
            <Form.Item label="Дата и время">
              <Input {...field} type="datetime-local" />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="comment"
          render={({ field }) => (
            <Form.Item label="Комментарий">
              <Input.TextArea {...field} rows={3} />
            </Form.Item>
          )}
        />
      </Form>
    </Modal>
  );
}

function getPaymentDefaults(debt: number): PaymentFormValues {
  return {
    type: 'CARD',
    paymentMethodId: '',
    cashboxId: '',
    amount: debt,
    paidAt: toDatetimeLocal(new Date().toISOString()),
    comment: '',
  };
}

const refundFormSchema = z.object({
  amount: z.number().min(0.01, 'Введите сумму'),
  comment: z.string().trim().optional(),
});

type RefundFormValues = z.infer<typeof refundFormSchema>;

function RefundModal({
  payment,
  loading,
  onClose,
  onSubmit,
}: {
  payment: Payment | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (values: RefundFormValues) => void;
}) {
  const { control, handleSubmit, reset } = useForm<RefundFormValues>({
    resolver: zodResolver(refundFormSchema),
    defaultValues: { amount: toMoneyNumber(payment?.amount), comment: '' },
  });

  useEffect(() => {
    if (payment) {
      reset({ amount: toMoneyNumber(payment.amount), comment: '' });
    }
  }, [payment, reset]);

  return (
    <Modal
      title="Возврат оплаты"
      open={Boolean(payment)}
      okText="Провести возврат"
      cancelText="Отмена"
      confirmLoading={loading}
      onCancel={onClose}
      onOk={handleSubmit(onSubmit)}
      destroyOnHidden
      width={520}
    >
      <Form layout="vertical">
        <Typography.Paragraph>
          Исходная оплата: {payment ? formatMoney(payment.amount) : '—'} · {payment ? paymentTypeLabels[payment.type] : ''}
        </Typography.Paragraph>
        <MoneyNumber control={control} name="amount" label="Сумма возврата" min={0.01} />
        <Controller
          control={control}
          name="comment"
          render={({ field }) => (
            <Form.Item label="Причина">
              <Input.TextArea {...field} rows={3} />
            </Form.Item>
          )}
        />
      </Form>
    </Modal>
  );
}

function MoneyNumber({
  control,
  name,
  label,
  min = 0,
  max,
  step = 0.01,
  help,
}: {
  control: any;
  name: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item label={label} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message ?? help}>
          <InputNumber className="full-width" min={min} max={max} step={step} value={field.value} onChange={(value) => field.onChange(value ?? min)} />
        </Form.Item>
      )}
    />
  );
}

function getItemDefaults(item: BillItem | null): ItemFormValues {
  return {
    lineType: item?.serviceId ? 'SERVICE' : item?.productId ? 'PRODUCT' : 'MANUAL',
    serviceId: item?.serviceId ?? undefined,
    productId: item?.productId ?? undefined,
    title: item?.title ?? '',
    quantity: toMoneyNumber(item?.quantity) || 1,
    stockQuantity: item?.productId ? (toMoneyNumber(item.stockQuantity ?? item.quantity) || 1) : undefined,
    unitPrice: toMoneyNumber(item?.unitPrice),
    discount: toMoneyNumber(item?.discount),
  };
}

function ContextRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="context-row">
      <span>{label}</span>
      <span>{value || '—'}</span>
    </div>
  );
}

function toDateInput(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 10);
}

function toDueAtIso(value: string | undefined) {
  return value ? new Date(`${value}T23:59:59`).toISOString() : null;
}

type BillPrintSettings = {
  paper: 'A4' | 'RECEIPT_80' | 'RECEIPT_58';
  showCustomer: boolean;
  showPayments: boolean;
};

function BillPrintEditor({ open, bill, onClose }: { open: boolean; bill: Bill; onClose: () => void }) {
  const [settings, setSettings] = useState<BillPrintSettings>({ paper: 'A4', showCustomer: true, showPayments: true });

  useEffect(() => {
    if (open) {
      setSettings({ paper: 'A4', showCustomer: true, showPayments: true });
    }
  }, [open]);

  const debt = Math.max(toMoneyNumber(bill.totalAmount) - toMoneyNumber(bill.paidAmount), 0);

  return (
    <Modal
      title="Редактор печати счёта / чека"
      open={open}
      onCancel={onClose}
      width={820}
      footer={[
        <Button key="cancel" onClick={onClose}>Отмена</Button>,
        <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={() => printBillDocument(bill, settings)}>
          Открыть печать
        </Button>,
      ]}
    >
      <Alert type="info" showIcon message="Выберите бумагу и состав документа. Печать не начнётся, пока вы не подтвердите её в системном окне." />
      <Form layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item label="Формат бумаги">
          <Radio.Group
            value={settings.paper}
            onChange={(event) => setSettings((current) => ({ ...current, paper: event.target.value }))}
            options={[
              { value: 'A4', label: 'A4 — счёт' },
              { value: 'RECEIPT_80', label: 'Лента 80 мм' },
              { value: 'RECEIPT_58', label: 'Лента 58 мм' },
            ]}
          />
        </Form.Item>
        <Space wrap>
          <Checkbox checked={settings.showCustomer} onChange={(event) => setSettings((current) => ({ ...current, showCustomer: event.target.checked }))}>
            Владелец и пациент
          </Checkbox>
          <Checkbox checked={settings.showPayments} onChange={(event) => setSettings((current) => ({ ...current, showPayments: event.target.checked }))}>
            История оплат
          </Checkbox>
        </Space>
      </Form>
      <div style={{ marginTop: 18, background: '#eef2f7', padding: 20, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: settings.paper === 'A4' ? 560 : settings.paper === 'RECEIPT_80' ? 300 : 220, background: '#fff', padding: 18, border: '1px solid #cbd5e1' }}>
          <strong>Счёт от {formatDate(bill.createdAt)}</strong>
          <div style={{ color: '#64748b', marginBottom: 12 }}>{formatDateTime(bill.createdAt)}</div>
          {settings.showCustomer ? <div>{bill.owner?.fullName ?? 'Розничный покупатель'} · {bill.animal?.nickname ?? 'без пациента'}</div> : null}
          <div style={{ borderTop: '1px solid #cbd5e1', marginTop: 12, paddingTop: 8 }}>
            {bill.items.slice(0, 4).map((item) => <div key={item.id}>{item.title} × {String(item.quantity)}</div>)}
            {bill.items.length > 4 ? <div>…ещё {bill.items.length - 4}</div> : null}
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 12 }}>К оплате {formatMoney(debt)}</div>
        </div>
      </div>
    </Modal>
  );
}

function printBillDocument(bill: Bill, settings: BillPrintSettings) {
  const printWindow = window.open('', '_blank', 'width=980,height=760');

  if (!printWindow) {
    return;
  }

  const debt = Math.max(toMoneyNumber(bill.totalAmount) - toMoneyNumber(bill.paidAmount), 0);
  const overdue = Boolean(bill.dueAt && debt > 0 && new Date(bill.dueAt) < new Date());
  const itemRows = bill.items
    .map(
      (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.title)}</td>
          <td class="num">${escapeHtml(String(item.quantity))}</td>
          <td class="num">${escapeHtml(formatMoney(item.unitPrice))}</td>
          <td class="num">${escapeHtml(formatMoney(item.discount))}</td>
          <td class="num">${escapeHtml(formatMoney(item.totalAmount))}</td>
        </tr>
      `,
    )
    .join('');
  const paymentRows = bill.payments.length
    ? bill.payments
        .map(
          (payment) => `
            <tr>
              <td>${escapeHtml(formatDateTime(payment.paidAt))}</td>
              <td>${escapeHtml(payment.paymentMethod?.title ?? paymentTypeLabels[payment.type])}</td>
              <td>${escapeHtml(payment.cashbox?.title ?? '—')}</td>
              <td class="num">${escapeHtml(formatMoney(payment.amount))}</td>
            </tr>
          `,
        )
        .join('')
    : '<tr><td colspan="4">Оплат пока нет</td></tr>';
  const receiptItems = bill.items
    .map((item) => `<div class="receipt-item"><span>${escapeHtml(item.title)} × ${escapeHtml(String(item.quantity))}</span><strong>${escapeHtml(formatMoney(item.totalAmount))}</strong></div>`)
    .join('');
  const isReceipt = settings.paper !== 'A4';
  const pageWidth = settings.paper === 'RECEIPT_58' ? '58mm' : '80mm';
  const pageCss = isReceipt
    ? `@page { size: ${pageWidth} auto; margin: 4mm; } body { width: calc(${pageWidth} - 8mm); margin: 0; font-size: 11px; }`
    : '@page { size: A4 portrait; margin: 14mm; } body { margin: 0; font-size: 14px; }';

  printWindow.document.write(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Счёт от ${escapeHtml(formatDate(bill.createdAt))}</title>
  <style>
    ${pageCss}
    body { color: #111827; font-family: Arial, sans-serif; line-height: 1.4; }
    h1 { margin: 0 0 4px; font-size: 24px; }
    h2 { margin: 24px 0 10px; font-size: 16px; }
    .meta { margin-bottom: 18px; color: #6b7280; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; margin: 18px 0; }
    .label { color: #6b7280; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { padding: 8px 9px; border: 1px solid #d1d5db; vertical-align: top; }
    th { background: #f3f4f6; text-align: left; }
    .num { text-align: right; white-space: nowrap; }
    .totals { margin-top: 18px; margin-left: auto; width: 320px; }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
    .total { font-size: 18px; font-weight: 700; }
    .receipt-items { display: grid; gap: 6px; margin-top: 10px; }
    .receipt-item { display: flex; gap: 8px; justify-content: space-between; border-bottom: 1px dotted #9ca3af; padding-bottom: 4px; }
    ${isReceipt ? 'h1 { font-size: 17px; } h2 { font-size: 13px; margin-top: 14px; } .grid { grid-template-columns: 1fr; } .totals { width: 100%; }' : ''}
  </style>
</head>
<body>
  <h1>Счёт / накладная</h1>
  <div class="meta">${escapeHtml(formatDateTime(bill.createdAt))} · ${escapeHtml(billSourceLabels[bill.source])} · ${escapeHtml(paymentStatusLabels[bill.status])}</div>

  ${settings.showCustomer ? `<div class="grid">
    <div>
      <div class="label">Владелец</div>
      <div>${escapeHtml(bill.owner?.fullName ?? 'Розничный покупатель')}</div>
    </div>
    <div>
      <div class="label">Телефон</div>
      <div>${escapeHtml(bill.owner?.phone ?? bill.owner?.extraPhone ?? '—')}</div>
    </div>
    <div>
      <div class="label">Пациент</div>
      <div>${escapeHtml(bill.animal?.nickname ?? '—')}</div>
    </div>
    <div>
      <div class="label">Источник</div>
      <div>${escapeHtml(bill.visit ? `Приём от ${formatDateTime(bill.visit.startedAt)}` : bill.sale ? `Продажа от ${formatDateTime(bill.sale.createdAt)}` : 'Ручной счёт')}</div>
    </div>
    <div>
      <div class="label">Срок оплаты</div>
      <div>${escapeHtml(formatDate(bill.dueAt))}${overdue ? ' · Просрочен' : ''}</div>
    </div>
  </div>` : ''}

  <h2>Позиции</h2>
  ${isReceipt ? `<div class="receipt-items">${receiptItems || 'Позиции не добавлены'}</div>` : `<table>
    <thead>
      <tr>
        <th>№</th>
        <th>Позиция</th>
        <th class="num">Кол-во</th>
        <th class="num">Цена</th>
        <th class="num">Скидка</th>
        <th class="num">Итого</th>
      </tr>
    </thead>
    <tbody>${itemRows || '<tr><td colspan="6">Позиции не добавлены</td></tr>'}</tbody>
  </table>`}

  <div class="totals">
    <div><span>Сумма</span><strong>${escapeHtml(formatMoney(bill.totalAmount))}</strong></div>
    <div><span>Оплачено</span><strong>${escapeHtml(formatMoney(bill.paidAmount))}</strong></div>
    <div><span>Долг</span><strong>${escapeHtml(formatMoney(debt))}</strong></div>
    <div class="total"><span>К оплате</span><span>${escapeHtml(formatMoney(debt))}</span></div>
  </div>

  ${settings.showPayments ? `<h2>Оплаты</h2>
  <table>
    <thead>
      <tr>
        <th>Дата</th>
        <th>Способ</th>
        <th>Касса</th>
        <th class="num">Сумма</th>
      </tr>
    </thead>
    <tbody>${paymentRows}</tbody>
  </table>` : ''}
  <script>window.onload = () => window.print();</script>
</body>
</html>`);
  printWindow.document.close();
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
