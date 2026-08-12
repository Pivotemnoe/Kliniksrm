import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Drawer, Form, Input, List, Popconfirm, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { formatMoney, toMoneyNumber } from '../../shared/utils/money';
import { getNetStockWriteOffQuantity } from '../../shared/utils/stockMovement';
import { formatServicePrice, getServiceDefaultPrice, getServicePriceHelp, validateServicePrice } from '../stock/service-pricing';
import { useVisitProductCatalogPicker, useVisitServiceCatalogPicker } from '../stock/useCatalogPicker';
import { Visit, VisitBillItem, VisitServiceLineInput } from './types';
import { addVisitService, addVisitServices, deleteVisitService, updateVisitService } from './visits.api';

const serviceLineSchema = z.object({
  lineType: z.enum(['PRODUCT', 'SERVICE', 'MANUAL']),
  productId: z.string().optional(),
  serviceId: z.string().optional(),
  title: z.string().trim().min(1, 'Введите услугу').max(500),
  quantity: requiredNumber(0.001, 999999),
  stockQuantity: optionalNumber(0.001, 999999),
  unitPrice: requiredNumber(0, 999999999),
  discount: requiredNumber(0, 999999999),
}).superRefine((value, context) => {
  if (value.lineType === 'PRODUCT' && !value.productId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['productId'], message: 'Выберите товар' });
  }

  if (value.lineType === 'PRODUCT' && !value.stockQuantity) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['stockQuantity'], message: 'Укажите, сколько списать со склада' });
  }

  if (value.lineType === 'SERVICE' && !value.serviceId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['serviceId'], message: 'Выберите услугу' });
  }
});

type ServiceLineValues = z.infer<typeof serviceLineSchema>;
type ServiceLineFormInput = z.input<typeof serviceLineSchema>;

type VisitServicesTabProps = {
  visit: Visit;
  canManage: boolean;
  locked: boolean;
};

export function VisitServicesTab({ visit, canManage, locked }: VisitServicesTabProps) {
  const queryClient = useQueryClient();
  const [editingLine, setEditingLine] = useState<VisitBillItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const billFinanciallyLocked = Boolean(
    visit.bill && (visit.bill.status === 'CANCELLED' || toMoneyNumber(visit.bill.paidAmount) > 0),
  );
  const visitCancelled = visit.status === 'CANCELLED';
  const disabled = locked || !canManage || billFinanciallyLocked || visitCancelled;
  const items = visit.bill?.items ?? [];
  const saveMutation = useMutation<unknown, unknown, VisitServiceLineInput[]>({
    mutationFn: async (values) => {
      if (editingLine) return updateVisitService(visit.id, editingLine.id, values[0]);
      return values.length === 1 ? addVisitService(visit.id, values[0]) : addVisitServices(visit.id, values);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['visits', visit.id] });
      await queryClient.invalidateQueries({ queryKey: ['visits'] });
      setDrawerOpen(false);
      setEditingLine(null);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (billItemId: string) => deleteVisitService(visit.id, billItemId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['visits', visit.id] });
      await queryClient.invalidateQueries({ queryKey: ['visits'] });
    },
  });
  const columns = useMemo<ColumnsType<VisitBillItem>>(
    () => [
      { title: 'Позиция', dataIndex: 'title', key: 'title' },
      {
        title: 'Тип',
        key: 'type',
        width: 120,
        render: (_, record) => record.productId ? <Tag color="green">Товар</Tag> : record.serviceId ? <Tag color="blue">Услуга</Tag> : <Tag>Ручная</Tag>,
      },
      {
        title: 'Начислено / списано',
        key: 'quantity',
        render: (_, record) => {
          const billedQuantity = Number(record.quantity).toLocaleString('ru-RU');
          if (!record.productId) {
            return billedQuantity;
          }

          const billingUnit = record.product?.billingUnit || record.product?.writeOffUnit || record.product?.stockUnit || 'ед.';
          const writeOffUnit = record.product?.writeOffUnit || record.product?.stockUnit || 'ед.';
          const stockQuantity = Number(record.stockQuantity ?? record.quantity).toLocaleString('ru-RU');
          const writtenOffQuantity = getNetStockWriteOffQuantity(record.stockMovements);
          return (
            <Space direction="vertical" size={0}>
              <span>{billedQuantity} {billingUnit}</span>
              <Typography.Text type="secondary">
                {writtenOffQuantity > 0
                  ? `списано после оплаты: ${writtenOffQuantity.toLocaleString('ru-RU')} ${writeOffUnit}`
                  : `будет списано при полной оплате: ${stockQuantity} ${writeOffUnit}`}
              </Typography.Text>
            </Space>
          );
        },
      },
      { title: 'Цена за начисление', dataIndex: 'unitPrice', key: 'unitPrice', render: formatMoney },
      { title: 'Скидка', dataIndex: 'discount', key: 'discount', render: formatMoney },
      { title: 'Сумма', dataIndex: 'totalAmount', key: 'totalAmount', render: formatMoney },
      {
        title: 'Склад',
        key: 'stock',
        render: (_, record) => {
          const writtenOffQuantity = getNetStockWriteOffQuantity(record.stockMovements);
          return record.productId ? (
            <Typography.Text type={writtenOffQuantity > 0 ? 'secondary' : 'danger'}>
              {writtenOffQuantity > 0 ? 'Списано после оплаты' : 'Ожидает полной оплаты'}
            </Typography.Text>
          ) : (
            '—'
          );
        },
      },
      {
        title: '',
        key: 'actions',
        width: 150,
        render: (_, record) =>
          disabled ? null : (
            <Space>
              <Button
                icon={<EditOutlined />}
                onClick={() => {
                  setEditingLine(record);
                  setDrawerOpen(true);
                }}
              />
              <Popconfirm title="Удалить услугу?" okText="Удалить" cancelText="Отмена" onConfirm={() => deleteMutation.mutate(record.id)}>
                <Button danger icon={<DeleteOutlined />} loading={deleteMutation.isPending} />
              </Popconfirm>
            </Space>
          ),
      },
    ],
    [deleteMutation, disabled],
  );

  return (
    <Space direction="vertical" size={16} className="full-width">
      {locked ? <Alert type="info" showIcon message="Редактирование закрыто: отменённый приём нельзя менять, завершённый доступен директору или в течение 30 минут после завершения." /> : null}
      {visitCancelled ? (
        <Alert type="warning" showIcon message="Финансовые позиции отменённого приёма защищены. Директор должен сначала нажать «Вернуть в работу» и указать причину." />
      ) : null}
      {billFinanciallyLocked ? (
        <Alert
          type="warning"
          showIcon
          message="Финансовые позиции защищены: сначала откройте отменённый счёт заново или оформите возврат оплаты. Клиническую часть директор может исправлять отдельно — с записью в аудите."
        />
      ) : null}
      {saveMutation.isError ? <Typography.Text type="danger">{getErrorMessage(saveMutation.error)}</Typography.Text> : null}
      {deleteMutation.isError ? <Typography.Text type="danger">{getErrorMessage(deleteMutation.error)}</Typography.Text> : null}
      <div className="toolbar-row">
        <Space size={24} wrap>
          <Typography.Text type="secondary">Товары и услуги приёма</Typography.Text>
          <Statistic title="Сумма приёма" value={toMoneyNumber(visit.totalAmount)} precision={2} suffix="₽" />
        </Space>
        {!disabled ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingLine(null);
              setDrawerOpen(true);
            }}
          >
            Добавить позицию
          </Button>
        ) : null}
      </div>
      <Table<VisitBillItem> rowKey="id" columns={columns} dataSource={items} pagination={false} />
      <ServiceLineDrawer
        open={drawerOpen}
        line={editingLine}
        isSubmitting={saveMutation.isPending}
        submitError={saveMutation.error}
        onClose={() => setDrawerOpen(false)}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
    </Space>
  );
}

function ServiceLineDrawer({
  open,
  line,
  isSubmitting,
  submitError,
  onClose,
  onSubmit,
}: {
  open: boolean;
  line: VisitBillItem | null;
  isSubmitting?: boolean;
  submitError?: unknown;
  onClose: () => void;
  onSubmit: (values: VisitServiceLineInput[]) => void;
}) {
  const { control, handleSubmit, reset, setError } = useForm<ServiceLineFormInput, unknown, ServiceLineValues>({
    resolver: zodResolver(serviceLineSchema),
    defaultValues: getDefaultValues(line),
  });
  const isEdit = Boolean(line);
  const [pendingLines, setPendingLines] = useState<VisitServiceLineInput[]>([]);
  const lineType = useWatch({ control, name: 'lineType' });
  const productId = useWatch({ control, name: 'productId' });
  const serviceId = useWatch({ control, name: 'serviceId' });
  const quantity = useWatch({ control, name: 'quantity' });
  const stockQuantity = useWatch({ control, name: 'stockQuantity' });
  const unitPrice = useWatch({ control, name: 'unitPrice' });
  const discount = useWatch({ control, name: 'discount' });
  const calculatedTotal = Math.max(toMoneyNumber(quantity) * toMoneyNumber(unitPrice) - toMoneyNumber(discount), 0);
  const productsQuery = useVisitProductCatalogPicker(open && !isEdit);
  const servicesQuery = useVisitServiceCatalogPicker(open && !isEdit);
  const selectedProduct = productsQuery.items.find((product) => product.id === productId);
  const activeProduct = selectedProduct ?? line?.product ?? null;
  const selectedService = servicesQuery.items.find((service) => service.id === serviceId);
  const activeService = selectedService ?? line?.service ?? null;

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      reset(getDefaultValues(line));
      setPendingLines([]);
    }
  }

  function buildLine(values: ServiceLineValues) {
    if (values.lineType === 'SERVICE') {
      const priceError = validateServicePrice(activeService, values.unitPrice);
      if (priceError) {
        setError('unitPrice', { message: priceError });
        return null;
      }
    }
    return {
      ...(!line && values.lineType === 'PRODUCT' ? { productId: values.productId } : {}),
      ...(!line && values.lineType === 'SERVICE' ? { serviceId: values.serviceId } : {}),
      title: values.title,
      quantity: values.quantity,
      ...(values.lineType === 'PRODUCT' && values.stockQuantity ? { stockQuantity: values.stockQuantity } : {}),
      unitPrice: values.unitPrice,
      discount: values.discount,
    } satisfies VisitServiceLineInput;
  }

  function submit(values: ServiceLineValues) {
    const currentLine = buildLine(values);
    if (!currentLine) return;
    onSubmit([currentLine]);
  }

  function stageLine(values: ServiceLineValues) {
    const currentLine = buildLine(values);
    if (!currentLine) return;
    setPendingLines((current) => [...current, currentLine]);
    reset({ ...getDefaultValues(null), lineType: values.lineType });
  }

  return (
    <Drawer
      title={line ? 'Редактировать позицию' : 'Добавить позицию'}
      width={560}
      open={open}
      onClose={onClose}
      afterOpenChange={handleOpenChange}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>Отмена</Button>
          <Button
            type="primary"
            loading={isSubmitting}
            onClick={pendingLines.length ? () => onSubmit(pendingLines) : handleSubmit(submit)}
          >
            {pendingLines.length ? `Сохранить подготовленные: ${pendingLines.length}` : 'Сохранить'}
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        {submitError ? <Alert type="error" showIcon message={getErrorMessage(submitError)} className="form-alert" /> : null}
        {productsQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(productsQuery.error)} className="form-alert" /> : null}
        {servicesQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(servicesQuery.error)} className="form-alert" /> : null}
        <Controller
          control={control}
          name="lineType"
          render={({ field }) => (
            <Form.Item label="Тип позиции">
              <Select
                {...field}
                disabled={isEdit}
                options={[
                  { value: 'SERVICE', label: 'Услуга' },
                  { value: 'PRODUCT', label: 'Товар' },
                  { value: 'MANUAL', label: 'Ручная строка' },
                ]}
              />
            </Form.Item>
          )}
        />
        {lineType === 'PRODUCT' ? (
          <Controller
            control={control}
            name="productId"
            render={({ field, fieldState }) => (
              <Form.Item label="Товар" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select
                  {...field}
                  showSearch
                  filterOption={false}
                  disabled={isEdit}
                  loading={productsQuery.isLoading}
                  onSearch={productsQuery.onSearch}
                  notFoundContent={productsQuery.isFetching ? 'Идёт поиск…' : 'Товар не найден во всём каталоге'}
                  options={productsQuery.items.map((product) => ({
                    value: product.id,
                    label: `${product.title} · ${product.writeOffUnit || product.stockUnit || 'шт'}`,
                  }))}
                  placeholder="Начните вводить название, SKU или штрих-код"
                  onChange={(value) => {
                    field.onChange(value);
                    const product = productsQuery.items.find((item) => item.id === value);
                    if (product) {
                      reset({
                        ...getDefaultValues(line),
                        lineType: 'PRODUCT',
                        productId: product.id,
                        title: product.title,
                        unitPrice: String(product.retailPrice),
                        quantity: '1',
                        stockQuantity: stockQuantity || '1',
                        discount: discount || '0',
                      });
                    }
                  }}
                />
              </Form.Item>
            )}
          />
        ) : null}
        {lineType === 'SERVICE' ? (
          <Controller
            control={control}
            name="serviceId"
            render={({ field, fieldState }) => (
              <Form.Item label="Услуга" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select
                  {...field}
                  showSearch
                  filterOption={false}
                  disabled={isEdit}
                  loading={servicesQuery.isLoading}
                  onSearch={servicesQuery.onSearch}
                  notFoundContent={servicesQuery.isFetching ? 'Идёт поиск…' : 'Услуга не найдена во всём каталоге'}
                  options={servicesQuery.items.map((service) => ({ value: service.id, label: `${service.title} · ${formatServicePrice(service)}` }))}
                  placeholder="Начните вводить название услуги"
                  onChange={(value) => {
                    field.onChange(value);
                    const service = servicesQuery.items.find((item) => item.id === value);
                    if (service) {
                      reset({
                        ...getDefaultValues(line),
                        lineType: 'SERVICE',
                        serviceId: service.id,
                        title: service.title,
                        unitPrice: String(getServiceDefaultPrice(service)),
                        quantity: quantity || '1',
                        discount: discount || '0',
                      });
                    }
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
                <Input {...field} autoFocus />
              </Form.Item>
            )}
          />
        ) : null}
        {lineType === 'PRODUCT' && activeProduct ? (
          <Alert
            type="info"
            showIcon
            message={`Склад и оплата считаются отдельно: ${stockQuantity || 0} ${activeProduct.writeOffUnit || activeProduct.stockUnit || 'ед.'} спишется только после полной оплаты счёта; клиенту начислится ${quantity || 0} ${activeProduct.billingUnit || activeProduct.writeOffUnit || activeProduct.stockUnit || 'ед.'}.`}
          />
        ) : null}
        <div className="form-grid two-columns">
          {lineType === 'PRODUCT' ? (
            <Controller
              control={control}
              name="stockQuantity"
              render={({ field, fieldState }) => (
                <Form.Item
                  label={`Списать со склада, ${activeProduct?.writeOffUnit || activeProduct?.stockUnit || 'ед.'}`}
                  validateStatus={fieldState.error ? 'error' : undefined}
                  help={fieldState.error?.message ?? 'Фактически использованный объём: например, 0,5 мл.'}
                >
                  <Input inputMode="decimal" placeholder="Например, 0,5" {...field} />
                </Form.Item>
              )}
            />
          ) : null}
          <Controller
            control={control}
            name="quantity"
            render={({ field, fieldState }) => (
              <Form.Item
                label={lineType === 'PRODUCT'
                  ? `Начислить клиенту, ${activeProduct?.billingUnit || activeProduct?.writeOffUnit || activeProduct?.stockUnit || 'ед.'}`
                  : 'Количество'}
                validateStatus={fieldState.error ? 'error' : undefined}
                help={fieldState.error?.message ?? (lineType === 'PRODUCT' ? 'Обычно 1 инъекция, даже если списано меньше 1 мл.' : undefined)}
              >
                <Input inputMode="decimal" placeholder="Например 0,1 или 0,01" {...field} />
              </Form.Item>
            )}
          />
          <Controller
          control={control}
          name="unitPrice"
          render={({ field, fieldState }) => (
              <Form.Item
                label={lineType === 'PRODUCT' ? `Цена за 1 ${activeProduct?.billingUnit || 'начисление'}` : 'Фактическая цена'}
                validateStatus={fieldState.error ? 'error' : undefined}
                help={fieldState.error?.message ?? (lineType === 'SERVICE' ? getServicePriceHelp(activeService) : undefined)}
              >
                <Input inputMode="decimal" {...field} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="discount"
            render={({ field, fieldState }) => (
              <Form.Item label="Скидка" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input inputMode="decimal" {...field} />
              </Form.Item>
            )}
          />
          <Form.Item label="Сумма строки">
            <Input value={formatMoney(calculatedTotal)} readOnly />
          </Form.Item>
        </div>
        {!isEdit ? (
          <Button
            block
            type="dashed"
            icon={<PlusOutlined />}
            onClick={handleSubmit(stageLine)}
          >
            Добавить позицию в общий список
          </Button>
        ) : null}
        {pendingLines.length ? (
          <List
            header={<Typography.Text strong>Подготовлено к сохранению: {pendingLines.length}</Typography.Text>}
            dataSource={pendingLines}
            renderItem={(item, index) => (
              <List.Item
                actions={[
                  <Button
                    key="remove"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => setPendingLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  />,
                ]}
              >
                <List.Item.Meta
                  title={item.title}
                  description={`${Number(item.quantity ?? 1).toLocaleString('ru-RU')} × ${formatMoney(item.unitPrice ?? 0)}`}
                />
              </List.Item>
            )}
          />
        ) : null}
      </Form>
    </Drawer>
  );
}

function getDefaultValues(line: VisitBillItem | null): ServiceLineFormInput {
  return {
    lineType: line?.productId ? 'PRODUCT' : line?.serviceId ? 'SERVICE' : 'MANUAL',
    productId: line?.productId ?? undefined,
    serviceId: line?.serviceId ?? undefined,
    title: line?.title ?? '',
    quantity: line ? String(line.quantity) : '1',
    stockQuantity: line?.productId ? String(line.stockQuantity ?? line.quantity) : undefined,
    unitPrice: line ? String(line.unitPrice) : '0',
    discount: line ? String(line.discount) : '0',
  };
}

function requiredNumber(min: number, max: number) {
  return z
    .string()
    .trim()
    .transform((value, context) => {
      const parsed = Number(value.replace(',', '.'));

      if (!value || !Number.isFinite(parsed) || parsed < min || parsed > max) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Введите число от ${min} до ${max}` });
        return z.NEVER;
      }

      return parsed;
    });
}

function optionalNumber(min: number, max: number) {
  return z
    .string()
    .optional()
    .transform((value, context) => {
      if (!value?.trim()) {
        return undefined;
      }

      const parsed = Number(value.replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Введите число от ${min} до ${max}` });
        return z.NEVER;
      }

      return parsed;
    });
}
