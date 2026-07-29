import { EditOutlined, PlusOutlined, PrinterOutlined, SearchOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, AutoComplete, Button, Checkbox, Form, Input, InputNumber, Modal, Radio, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import JsBarcode from 'jsbarcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDate } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import {
  createProduct,
  createService,
  createSupplyInvoice,
  getStockResources,
  listProducts,
  listServices,
  listStockBatches,
  listSupplyInvoices,
  updateProduct,
  updateService,
} from './stock.api';
import { Product, ServiceItem, StockBatch, StockResources, SupplyInvoice } from './types';

const pageSize = 10;

export function StockPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'stock.manage');
  const [activeTab, setActiveTab] = useState(getStockTabFromPath(location.pathname));
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [productOpen, setProductOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);
  const [printingProduct, setPrintingProduct] = useState<Product | null>(null);
  const [supplyOpen, setSupplyOpen] = useState(false);
  const resourcesQuery = useQuery({ queryKey: ['stock', 'resources'], queryFn: getStockResources });

  useEffect(() => {
    setActiveTab(getStockTabFromPath(location.pathname));
  }, [location.pathname]);

  function handleSearch(value: string) {
    setSearch(value.trim());
    setOffset(0);
  }

  function handleTableChange(pagination: TablePaginationConfig) {
    const current = pagination.current ?? 1;
    const size = pagination.pageSize ?? pageSize;
    setOffset((current - 1) * size);
  }

  return (
    <div className="page">
      <PageHeader
        title="Склад"
        description="Товары, услуги, остатки и приёмка на склад."
        extra={
          canManage ? (
            <Space wrap>
              <Button icon={<PlusOutlined />} onClick={() => setProductOpen(true)}>
                Добавить товар
              </Button>
              <Button icon={<PlusOutlined />} onClick={() => setServiceOpen(true)}>
                Добавить услугу
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setSupplyOpen(true)}>
                Новая приёмка
              </Button>
            </Space>
          ) : null
        }
      />
      <div className="list-panel">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);
            setOffset(0);
            navigate(stockTabPaths[key] ?? '/stock');
          }}
          tabBarExtraContent={
            <Space wrap>
              <Input.Search
                allowClear
                enterButton={<SearchOutlined />}
                placeholder="Название, SKU или номер штрих-кода"
                className="search-input"
                onSearch={handleSearch}
              />
            </Space>
          }
          items={[
            {
              key: 'products',
              label: 'Товары',
              children: (
                <ProductsTable
                  search={search}
                  offset={offset}
                  canManage={canManage}
                  onEdit={(product) => {
                    setEditingProduct(product);
                    setProductOpen(true);
                  }}
                  onPrint={setPrintingProduct}
                  onTableChange={handleTableChange}
                />
              ),
            },
            {
              key: 'services',
              label: 'Услуги',
              children: (
                <ServicesTable
                  search={search}
                  offset={offset}
                  canManage={canManage}
                  onEdit={(service) => {
                    setEditingService(service);
                    setServiceOpen(true);
                  }}
                  onTableChange={handleTableChange}
                />
              ),
            },
            {
              key: 'batches',
              label: 'Остатки',
              children: <BatchesTable search={search} offset={offset} onTableChange={handleTableChange} />,
            },
            {
              key: 'invoices',
              label: 'Накладные',
              children: <InvoicesTable search={search} offset={offset} onTableChange={handleTableChange} />,
            },
          ]}
        />
      </div>
      <ProductModal
        open={productOpen}
        product={editingProduct}
        resources={resourcesQuery.data}
        onClose={() => {
          setProductOpen(false);
          setEditingProduct(null);
        }}
      />
      <ServiceModal
        open={serviceOpen}
        service={editingService}
        resources={resourcesQuery.data}
        onClose={() => {
          setServiceOpen(false);
          setEditingService(null);
        }}
      />
      <SupplyInvoiceModal
        open={supplyOpen}
        resources={resourcesQuery.data}
        onClose={() => setSupplyOpen(false)}
      />
      <PriceTagEditor product={printingProduct} organization={resourcesQuery.data?.organization ?? null} onClose={() => setPrintingProduct(null)} />
    </div>
  );
}

const stockTabPaths: Record<string, string> = {
  products: '/stock/goods',
  services: '/stock/services',
  batches: '/stock/supplies',
  invoices: '/stock/invoices',
};

function getStockTabFromPath(pathname: string) {
  if (pathname.startsWith('/stock/services')) {
    return 'services';
  }

  if (pathname.startsWith('/stock/supplies')) {
    return 'batches';
  }

  if (pathname.startsWith('/stock/invoices')) {
    return 'invoices';
  }

  return 'products';
}

function ProductsTable({
  search,
  offset,
  canManage,
  onEdit,
  onPrint,
  onTableChange,
}: {
  search: string;
  offset: number;
  canManage: boolean;
  onEdit: (product: Product) => void;
  onPrint: (product: Product) => void;
  onTableChange: (pagination: TablePaginationConfig) => void;
}) {
  const productsQuery = useQuery({
    queryKey: ['stock', 'products', { search, limit: pageSize, offset }],
    queryFn: () => listProducts({ search, limit: pageSize, offset }),
  });
  const columns = useMemo<ColumnsType<Product>>(
    () => [
      { title: 'Название', dataIndex: 'title', key: 'title' },
      { title: 'Категория', key: 'category', render: (_, record) => record.category?.title ?? '—' },
      { title: 'SKU', dataIndex: 'sku', key: 'sku', render: (value: string | null) => value || '—' },
      {
        title: 'Цена',
        dataIndex: 'retailPrice',
        key: 'retailPrice',
        render: (value, record) => `${formatMoney(value)} / ${record.billingUnit || record.writeOffUnit || record.stockUnit || 'шт'}`,
      },
      {
        title: 'Остаток',
        dataIndex: 'stockRest',
        key: 'stockRest',
        render: (value, record) => {
          const lowStock = isLowStock(record);

          return (
            <Space size={6}>
              <span>{value ?? 0} {record.stockUnit ?? ''}</span>
              {lowStock ? <Tag color="red">минимум</Tag> : null}
            </Space>
          );
        },
      },
      { title: 'Мин. остаток', dataIndex: 'minStock', key: 'minStock', render: (value, record) => (value === null || value === undefined ? '—' : `${value} ${record.stockUnit ?? ''}`) },
      {
        title: 'Учёт и списание',
        key: 'units',
        render: (_, record) => {
          const stockUnit = record.stockUnit || 'шт';
          const writeOffUnit = record.writeOffUnit || stockUnit;
          return stockUnit === writeOffUnit
            ? `Склад и списание: ${stockUnit}`
            : `Склад: ${stockUnit}; списание: 1 ${stockUnit} = ${record.packageQuantity || '?'} ${writeOffUnit}`;
        },
      },
      { title: 'Годен до', dataIndex: 'defaultExpiresAt', key: 'defaultExpiresAt', render: formatDate },
      { title: 'Штрих-код', dataIndex: 'barcode', key: 'barcode', render: (value: string | null) => value || '—' },
      { title: 'НДС', dataIndex: 'vatRate', key: 'vatRate', render: (value) => (value === null || value === undefined ? 'Без НДС' : `${value}%`) },
      {
        title: '',
        key: 'actions',
        width: 220,
        fixed: 'right',
        render: (_, record) => (
          <Space size={6} wrap>
            {canManage ? (
              <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(record)}>
                Изменить
              </Button>
            ) : null}
            <Button size="small" icon={<PrinterOutlined />} onClick={() => onPrint(record)}>
              Ценник
            </Button>
          </Space>
        ),
      },
    ],
    [canManage, onEdit, onPrint],
  );

  return <StockTable query={productsQuery} columns={columns} offset={offset} onTableChange={onTableChange} />;
}

function ServicesTable({
  search,
  offset,
  canManage,
  onEdit,
  onTableChange,
}: {
  search: string;
  offset: number;
  canManage: boolean;
  onEdit: (service: ServiceItem) => void;
  onTableChange: (pagination: TablePaginationConfig) => void;
}) {
  const servicesQuery = useQuery({
    queryKey: ['stock', 'services', { search, limit: pageSize, offset }],
    queryFn: () => listServices({ search, limit: pageSize, offset }),
  });
  const columns = useMemo<ColumnsType<ServiceItem>>(
    () => [
      { title: 'Название', dataIndex: 'title', key: 'title' },
      { title: 'Категория', key: 'category', render: (_, record) => record.category?.title ?? '—' },
      { title: 'Цена', dataIndex: 'price', key: 'price', render: formatMoney },
      { title: 'Тип цены', dataIndex: 'priceType', key: 'priceType', render: (value: string) => (value === 'FLOATING' ? 'Плавающая' : 'Фиксированная') },
      { title: 'НДС', dataIndex: 'vatRate', key: 'vatRate', render: (value) => (value === null || value === undefined ? 'Без НДС' : `${value}%`) },
      ...(canManage
        ? [{
            title: '',
            key: 'actions',
            width: 130,
            fixed: 'right' as const,
            render: (_: unknown, record: ServiceItem) => (
              <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(record)}>
                Изменить
              </Button>
            ),
          }]
        : []),
    ],
    [canManage, onEdit],
  );

  return <StockTable query={servicesQuery} columns={columns} offset={offset} onTableChange={onTableChange} />;
}

function BatchesTable({
  search,
  offset,
  onTableChange,
}: {
  search: string;
  offset: number;
  onTableChange: (pagination: TablePaginationConfig) => void;
}) {
  const batchesQuery = useQuery({
    queryKey: ['stock', 'batches', { search, limit: pageSize, offset }],
    queryFn: () => listStockBatches({ search, limit: pageSize, offset }),
  });
  const columns = useMemo<ColumnsType<StockBatch>>(
    () => [
      { title: 'Склад', key: 'warehouse', render: (_, record) => record.warehouse?.name ?? '—' },
      { title: 'Товар', key: 'product', render: (_, record) => record.product?.title ?? '—' },
      { title: 'Поставщик', key: 'supplier', render: (_, record) => record.supplier?.title ?? '—' },
      { title: 'Остаток', key: 'rest', render: (_, record) => `${record.rest} ${record.product?.stockUnit ?? ''}` },
      { title: 'Закупка', dataIndex: 'purchasePrice', key: 'purchasePrice', render: formatMoney },
      { title: 'Годен до', dataIndex: 'expiresAt', key: 'expiresAt', render: formatDate },
      { title: 'Серия', dataIndex: 'series', key: 'series', render: (value: string | null) => value || '—' },
      {
        title: 'Место',
        key: 'place',
        render: (_, record) => [record.rack, record.rackNumber, record.shelfNumber].filter(Boolean).join(' / ') || '—',
      },
    ],
    [],
  );

  return <StockTable query={batchesQuery} columns={columns} offset={offset} onTableChange={onTableChange} />;
}

function InvoicesTable({
  search,
  offset,
  onTableChange,
}: {
  search: string;
  offset: number;
  onTableChange: (pagination: TablePaginationConfig) => void;
}) {
  const invoicesQuery = useQuery({
    queryKey: ['stock', 'invoices', { search, limit: pageSize, offset }],
    queryFn: () => listSupplyInvoices({ search, limit: pageSize, offset }),
  });
  const columns = useMemo<ColumnsType<SupplyInvoice>>(
    () => [
      { title: 'Дата', dataIndex: 'suppliedAt', key: 'suppliedAt', render: formatDate },
      { title: '№ накладной', dataIndex: 'number', key: 'number', render: (value: string | null) => value || '—' },
      { title: 'Поставщик', key: 'supplier', render: (_, record) => record.supplier?.title ?? '—' },
      { title: 'Позиций', key: 'items', render: (_, record) => record.items.length },
      { title: 'Сумма', dataIndex: 'totalAmount', key: 'totalAmount', render: formatMoney },
    ],
    [],
  );

  return <StockTable query={invoicesQuery} columns={columns} offset={offset} onTableChange={onTableChange} />;
}

function StockTable<T extends { id: string }>({
  query,
  columns,
  offset,
  onTableChange,
}: {
  query: {
    data?: { items: T[]; total: number };
    isLoading: boolean;
    isError: boolean;
    error: unknown;
  };
  columns: ColumnsType<T>;
  offset: number;
  onTableChange: (pagination: TablePaginationConfig) => void;
}) {
  return (
    <div className="list-panel-body">
      {query.isError ? <Typography.Text type="danger">{getErrorMessage(query.error)}</Typography.Text> : null}
      <Table<T>
        rowKey="id"
        className="dense-table"
        columns={columns}
        dataSource={query.data?.items ?? []}
        loading={query.isLoading}
        scroll={{ x: 'max-content' }}
        pagination={{ current: offset / pageSize + 1, pageSize, total: query.data?.total ?? 0, showSizeChanger: false }}
        onChange={onTableChange}
      />
    </div>
  );
}

const productSchema = z
  .object({
    title: z.string().trim().min(2, 'Введите название'),
    categoryTitle: z.string().trim().optional(),
    sku: z.string().trim().optional(),
    retailPrice: z.number().min(0).optional(),
    stockUnit: z.string().trim().min(1, 'Выберите учётную единицу'),
    writeOffUnit: z.string().trim().min(1, 'Выберите единицу использования'),
    billingUnit: z.string().trim().min(1, 'Укажите, за что начисляется цена'),
    gtin: z.string().trim().optional(),
    barcode: z.string().trim().regex(/^\d{4,32}$/, 'Введите только цифры штрих-кода').or(z.literal('')).optional(),
    generateBarcode: z.boolean().optional(),
    vatRate: z.number().min(0).max(100).optional(),
    packageQuantity: z.number().min(0).optional(),
    minStock: z.number().min(0).optional(),
    defaultExpiresAt: z.string().optional(),
    description: z.string().trim().optional(),
  })
  .superRefine((value, context) => {
    if (value.stockUnit !== value.writeOffUnit && (!value.packageQuantity || value.packageQuantity <= 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['packageQuantity'],
        message: 'Укажите, сколько единиц использования содержится в одной учётной единице',
      });
    }
  });

type ProductFormValues = z.infer<typeof productSchema>;

const unitOptions = ['шт', 'упак.', 'флакон', 'ампула', 'мл', 'л', 'г', 'кг', 'доза', 'таблетка', 'капсула', 'набор', 'рулон'].map((unit) => ({ value: unit, label: unit }));
const billingUnitOptions = ['инъекция', 'процедура', 'доза', 'шт', 'мл', 'г', 'таблетка', 'капсула', 'упаковка', 'флакон'].map((unit) => ({ value: unit, label: unit }));
const defaultProductCategories = ['Лекарственные препараты', 'Вакцины', 'Расходные материалы', 'Корма', 'Зоотовары', 'Диагностика', 'Гигиена и уход', 'Средства обработки', 'Прочее'];
const defaultServiceCategories = ['Приём', 'Вакцинация', 'Процедуры и манипуляции', 'Хирургия', 'Диагностика', 'Лаборатория', 'Стационар', 'Визуальная диагностика', 'Груминг', 'Прочее'];

function ProductModal({
  open,
  product,
  resources,
  onClose,
}: {
  open: boolean;
  product: Product | null;
  resources?: StockResources;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { control, handleSubmit, reset, setValue } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { title: '', categoryTitle: '', sku: '', retailPrice: 0, stockUnit: 'шт', writeOffUnit: 'шт', billingUnit: 'шт' },
  });
  const stockUnit = useWatch({ control, name: 'stockUnit' });
  const writeOffUnit = useWatch({ control, name: 'writeOffUnit' });
  const billingUnit = useWatch({ control, name: 'billingUnit' });
  const categoryOptions = useMemo(
    () => buildCategoryOptions(defaultProductCategories, resources?.productCategories.map((category) => category.title) ?? []),
    [resources?.productCategories],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    reset({
      title: product?.title ?? '',
      categoryTitle: product?.category?.title ?? '',
      sku: product?.sku ?? '',
      retailPrice: Number(product?.retailPrice ?? 0),
      stockUnit: product?.stockUnit ?? 'шт',
      writeOffUnit: product?.writeOffUnit ?? product?.stockUnit ?? 'шт',
      billingUnit: product?.billingUnit ?? product?.writeOffUnit ?? product?.stockUnit ?? 'шт',
      gtin: product?.gtin ?? '',
      barcode: product?.barcode ?? '',
      generateBarcode: false,
      vatRate: product?.vatRate === null || product?.vatRate === undefined ? undefined : Number(product.vatRate),
      packageQuantity: product?.packageQuantity === null || product?.packageQuantity === undefined ? 1 : Number(product.packageQuantity),
      minStock: product?.minStock === null || product?.minStock === undefined ? 0 : Number(product.minStock),
      defaultExpiresAt: product?.defaultExpiresAt?.slice(0, 10) ?? '',
      description: product?.description ?? '',
    });
  }, [open, product, reset]);
  const mutation = useMutation({
    mutationFn: (values: ProductFormValues) =>
      product
        ? updateProduct(product.id, {
            ...values,
            defaultExpiresAt: values.defaultExpiresAt ? new Date(values.defaultExpiresAt).toISOString() : null,
          })
        : createProduct({
            ...values,
            defaultExpiresAt: values.defaultExpiresAt ? new Date(values.defaultExpiresAt).toISOString() : undefined,
          }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
      ]);
      message.success(product ? 'Товар обновлён' : 'Товар создан');
      reset();
      onClose();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  return (
    <Modal
      title={product ? `Редактирование: ${product.title}` : 'Добавление товара'}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit((values) => mutation.mutate(values))}
      okText={product ? 'Сохранить' : 'Добавить'}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      width={780}
    >
      <Form layout="vertical">
        <FormText control={control} name="title" label="Название" autoFocus />
        <Controller
          control={control}
          name="categoryTitle"
          render={({ field }) => (
            <Form.Item label="Категория" help="Выберите готовую категорию или введите новую — она сохранится автоматически.">
              <AutoComplete
                allowClear
                value={field.value || undefined}
                onChange={(value) => field.onChange(value)}
                options={categoryOptions}
                placeholder="Например, Лекарственные препараты"
                filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>
          )}
        />
        <div className="form-grid two-columns">
          <FormText control={control} name="sku" label="Артикул / SKU" />
          <FormNumber control={control} name="retailPrice" label={`Цена за 1 ${billingUnit || 'единицу начисления'}`} />
          <FormText control={control} name="barcode" label="Номер штрих-кода" help="Введите цифры, напечатанные под штрих-кодом на упаковке. Сканер не нужен: на ценнике будет создан настоящий штрих-код с этим номером." />
          <FormNumber control={control} name="vatRate" label="НДС, %" />
          <FormNumber control={control} name="minStock" label={`Минимальный остаток, ${stockUnit || 'ед.'}`} />
          <FormText control={control} name="defaultExpiresAt" label="Годен до" type="date" help="Дата подставится в следующую приёмку; фактический срок хранится отдельно для каждой партии." />
          <Controller
            control={control}
            name="stockUnit"
            render={({ field, fieldState }) => (
              <Form.Item label="Храним на складе в" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select
                  {...field}
                  options={unitOptions}
                  onChange={(value) => {
                    const previousStockUnit = stockUnit;
                    field.onChange(value);
                    if (!writeOffUnit || writeOffUnit === previousStockUnit) {
                      setValue('writeOffUnit', value, { shouldValidate: true });
                    }
                    if (!billingUnit || billingUnit === previousStockUnit) {
                      setValue('billingUnit', value, { shouldValidate: true });
                    }
                  }}
                />
              </Form.Item>
            )}
          />
          <FormSelect control={control} name="writeOffUnit" label="Списываем при использовании в" options={unitOptions} />
          <Controller
            control={control}
            name="billingUnit"
            render={({ field, fieldState }) => (
              <Form.Item label="Цена начисляется за" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message ?? 'Например: инъекция. Списать можно 0,5 мл, а начислить 1 инъекцию.'}>
                <AutoComplete {...field} options={billingUnitOptions} placeholder="Например, инъекция" />
              </Form.Item>
            )}
          />
        </div>
        <Button
          size="small"
          onClick={() => {
            setValue('stockUnit', 'мл', { shouldValidate: true });
            setValue('writeOffUnit', 'мл', { shouldValidate: true });
            setValue('billingUnit', 'инъекция', { shouldValidate: true });
            setValue('packageQuantity', 1, { shouldValidate: true });
          }}
        >
          Быстрая настройка: препарат в мл, цена за инъекцию
        </Button>
        {stockUnit !== writeOffUnit ? (
          <Alert
            type="info"
            showIcon
            message={`Списание будет пересчитано: 1 ${stockUnit || 'учётная единица'} = указанное ниже количество ${writeOffUnit || 'единиц использования'}.`}
          />
        ) : null}
        {stockUnit !== writeOffUnit ? (
          <FormNumber
            control={control}
            name="packageQuantity"
            label={`Сколько ${writeOffUnit || 'единиц использования'} в 1 ${stockUnit || 'учётной единице'}`}
            step={0.1}
            help="Например: во флаконе 100 мл — укажите 100."
          />
        ) : (
          <Alert type="success" showIcon message={`Склад и списание ведутся одинаково: в ${stockUnit || 'выбранных единицах'}.`} />
        )}
        <Controller
          control={control}
          name="generateBarcode"
          render={({ field }) => (
            <Form.Item>
              <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                Номера на упаковке нет — создать внутренний штрих-код EAN-13
              </Checkbox>
            </Form.Item>
          )}
        />
        <FormText control={control} name="description" label="Дополнительная информация" textarea />
      </Form>
    </Modal>
  );
}

const serviceSchema = z.object({
  title: z.string().trim().min(2, 'Введите название'),
  categoryTitle: z.string().trim().optional(),
  price: z.number().min(0).optional(),
  priceType: z.string().optional(),
  vatRate: z.number().min(0).max(100).optional(),
  description: z.string().trim().optional(),
});

type ServiceFormValues = z.infer<typeof serviceSchema>;

function ServiceModal({
  open,
  service,
  resources,
  onClose,
}: {
  open: boolean;
  service: ServiceItem | null;
  resources?: StockResources;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { control, handleSubmit, reset } = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues: { title: '', categoryTitle: '', price: 0, priceType: 'FIXED', description: '' },
  });
  const categoryOptions = useMemo(
    () => buildCategoryOptions(defaultServiceCategories, resources?.serviceCategories.map((category) => category.title) ?? []),
    [resources?.serviceCategories],
  );
  useEffect(() => {
    if (!open) {
      return;
    }

    reset({
      title: service?.title ?? '',
      categoryTitle: service?.category?.title ?? '',
      price: Number(service?.price ?? 0),
      priceType: service?.priceType ?? 'FIXED',
      vatRate: service?.vatRate === null || service?.vatRate === undefined ? undefined : Number(service.vatRate),
      description: service?.description ?? '',
    });
  }, [open, reset, service]);
  const mutation = useMutation({
    mutationFn: (values: ServiceFormValues) => (service ? updateService(service.id, values) : createService(values)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['stock'] });
      message.success(service ? 'Услуга обновлена' : 'Услуга создана');
      reset();
      onClose();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  return (
    <Modal
      title={service ? `Редактирование: ${service.title}` : 'Добавить услугу'}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit((values) => mutation.mutate(values))}
      okText={service ? 'Сохранить' : 'Добавить'}
      confirmLoading={mutation.isPending}
      destroyOnHidden
    >
      <Form layout="vertical">
        <FormText control={control} name="title" label="Название" autoFocus />
        <Controller
          control={control}
          name="categoryTitle"
          render={({ field }) => (
            <Form.Item label="Категория" help="Выберите готовую категорию или введите новую — она сохранится автоматически.">
              <AutoComplete
                allowClear
                value={field.value || undefined}
                onChange={(value) => field.onChange(value)}
                options={categoryOptions}
                placeholder="Например, Процедуры и манипуляции"
                filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>
          )}
        />
        <div className="form-grid two-columns">
          <FormNumber control={control} name="price" label="Цена" />
          <FormNumber control={control} name="vatRate" label="НДС, %" />
          <Controller
            control={control}
            name="priceType"
            render={({ field }) => (
              <Form.Item label="Тип цены">
                <Select
                  {...field}
                  options={[
                    { value: 'FIXED', label: 'Фиксированная цена' },
                    { value: 'FLOATING', label: 'Плавающая цена' },
                  ]}
                />
              </Form.Item>
            )}
          />
        </div>
        <FormText control={control} name="description" label="Описание" textarea />
      </Form>
    </Modal>
  );
}

const supplySchema = z.object({
  supplierTitle: z.string().trim().optional(),
  number: z.string().trim().optional(),
  suppliedAt: z.string().optional(),
  productId: z.string().min(1, 'Выберите товар'),
  warehouseId: z.string().optional(),
  quantity: z.number().min(0.001, 'Введите количество'),
  purchasePrice: z.number().min(0, 'Введите закупочную цену'),
  discountAmount: z.number().min(0).optional(),
  expiresAt: z.string().optional(),
  series: z.string().trim().optional(),
  rack: z.string().trim().optional(),
  rackNumber: z.string().trim().optional(),
  shelfNumber: z.string().trim().optional(),
});

type SupplyFormValues = z.infer<typeof supplySchema>;

function SupplyInvoiceModal({ open, resources, onClose }: { open: boolean; resources?: StockResources; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const productsQuery = useQuery({
    queryKey: ['stock', 'products', 'supply-select'],
    queryFn: () => listProducts({ limit: 100, offset: 0 }),
    enabled: open,
  });
  const { control, handleSubmit, reset, setValue } = useForm<SupplyFormValues>({
    resolver: zodResolver(supplySchema),
    defaultValues: {
      supplierTitle: '',
      number: '',
      suppliedAt: toDateInput(new Date()),
      productId: '',
      warehouseId: resources?.warehouses[0]?.id,
      quantity: 1,
      purchasePrice: 0,
      discountAmount: 0,
      expiresAt: '',
      series: '',
      rack: '',
      rackNumber: '',
      shelfNumber: '',
    },
  });
  const mutation = useMutation({
    mutationFn: (values: SupplyFormValues) =>
      createSupplyInvoice({
        supplierTitle: values.supplierTitle,
        number: values.number,
        suppliedAt: values.suppliedAt ? new Date(values.suppliedAt).toISOString() : undefined,
        items: [
          {
            productId: values.productId,
            warehouseId: values.warehouseId,
            quantity: values.quantity,
            purchasePrice: values.purchasePrice,
            discountAmount: values.discountAmount,
            expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : undefined,
            series: values.series,
            rack: values.rack,
            rackNumber: values.rackNumber,
            shelfNumber: values.shelfNumber,
          },
        ],
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['stock'] });
      message.success('Приёмка проведена');
      reset();
      onClose();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  return (
    <Modal title="Новая поставка товара" open={open} onCancel={onClose} onOk={handleSubmit((values) => mutation.mutate(values))} confirmLoading={mutation.isPending} destroyOnHidden width={720}>
      <Form layout="vertical">
        <div className="form-grid two-columns">
          <Controller
            control={control}
            name="supplierTitle"
            render={({ field }) => (
              <Form.Item label="Поставщик">
                <Select
                  showSearch
                  allowClear
                  value={field.value || undefined}
                  onChange={(value) => field.onChange(value)}
                  onSearch={(value) => field.onChange(value)}
                  options={resources?.suppliers.map((supplier) => ({ value: supplier.title, label: supplier.title })) ?? []}
                  placeholder="Введите поставщика"
                />
              </Form.Item>
            )}
          />
          <FormText control={control} name="number" label="№ накладной" />
          <FormText control={control} name="suppliedAt" label="Дата поставки" type="date" />
          <Controller
            control={control}
            name="warehouseId"
            render={({ field }) => (
              <Form.Item label="Склад">
                <Select {...field} options={resources?.warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name })) ?? []} />
              </Form.Item>
            )}
          />
        </div>
        <Controller
          control={control}
          name="productId"
          render={({ field, fieldState }) => (
            <Form.Item label="Товар" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Select
                {...field}
                showSearch
                loading={productsQuery.isLoading}
                onChange={(value) => {
                  field.onChange(value);
                  const product = productsQuery.data?.items.find((item) => item.id === value);
                  setValue('expiresAt', product?.defaultExpiresAt?.slice(0, 10) ?? '');
                }}
                options={productsQuery.data?.items.map((product) => ({ value: product.id, label: product.title })) ?? []}
                placeholder="Выберите товар"
              />
            </Form.Item>
          )}
        />
        <div className="form-grid two-columns">
          <FormNumber control={control} name="quantity" label="Количество" step={0.01} />
          <FormNumber control={control} name="purchasePrice" label="Закупочная цена" />
          <FormNumber control={control} name="discountAmount" label="Скидка" />
          <FormText control={control} name="expiresAt" label="Срок годности" type="date" />
          <FormText control={control} name="series" label="Серия" />
          <FormText control={control} name="rack" label="Стеллаж" />
          <FormText control={control} name="rackNumber" label="Номер стеллажа" />
          <FormText control={control} name="shelfNumber" label="Полка" />
        </div>
      </Form>
    </Modal>
  );
}

function FormText({
  control,
  name,
  label,
  textarea,
  autoFocus,
  type,
  help,
}: {
  control: any;
  name: string;
  label: string;
  textarea?: boolean;
  autoFocus?: boolean;
  type?: string;
  help?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item label={label} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message ?? help}>
          {textarea ? <Input.TextArea rows={3} {...field} /> : <Input {...field} type={type} autoFocus={autoFocus} />}
        </Form.Item>
      )}
    />
  );
}

function FormNumber({
  control,
  name,
  label,
  step = 0.01,
  help,
}: {
  control: any;
  name: string;
  label: string;
  step?: number;
  help?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item label={label} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message ?? help}>
          <InputNumber className="full-width" min={0} step={step} value={field.value} onChange={(value) => field.onChange(value ?? 0)} />
        </Form.Item>
      )}
    />
  );
}

function FormSelect({ control, name, label, options }: { control: any; name: string; label: string; options: Array<{ value: string; label: string }> }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item label={label} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
          <Select {...field} showSearch options={options} />
        </Form.Item>
      )}
    />
  );
}

function toDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isLowStock(product: Product) {
  if (product.stockRest === undefined || product.minStock === null || product.minStock === undefined) {
    return false;
  }

  return Number(product.stockRest) <= Number(product.minStock);
}

type PriceTagSettings = {
  paper: 'LABEL_58_40' | 'A4';
  copies: number;
  showClinic: boolean;
  showLegalName: boolean;
  showCategory: boolean;
  showBarcode: boolean;
  showVat: boolean;
};

type PriceTagOrganization = StockResources['organization'];

function PriceTagEditor({ product, organization, onClose }: { product: Product | null; organization: PriceTagOrganization; onClose: () => void }) {
  const [settings, setSettings] = useState<PriceTagSettings>({
    paper: 'LABEL_58_40',
    copies: 1,
    showClinic: true,
    showLegalName: true,
    showCategory: true,
    showBarcode: true,
    showVat: true,
  });

  useEffect(() => {
    if (product) {
      setSettings({ paper: 'LABEL_58_40', copies: 1, showClinic: true, showLegalName: true, showCategory: true, showBarcode: true, showVat: true });
    }
  }, [product]);

  if (!product) {
    return null;
  }

  const barcode = product.barcode || product.gtin;

  return (
    <Modal
      title="Редактор печати ценника"
      open
      onCancel={onClose}
      width={820}
      footer={[
        <Button key="cancel" onClick={onClose}>Отмена</Button>,
        <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={() => printProductPriceTags(product, organization, settings)}>
          Открыть печать
        </Button>,
      ]}
    >
      <Alert
        type="info"
        showIcon
        message="Сначала проверьте макет ниже. Системное окно печати откроется только после нажатия «Открыть печать»."
      />
      <div className="form-grid two-columns" style={{ marginTop: 16 }}>
        <Form.Item label="Бумага">
          <Radio.Group
            value={settings.paper}
            onChange={(event) => setSettings((current) => ({ ...current, paper: event.target.value }))}
            options={[
              { value: 'LABEL_58_40', label: 'Этикетка 58 × 40 мм' },
              { value: 'A4', label: 'Лист A4 (сетка)' },
            ]}
          />
        </Form.Item>
        <Form.Item label="Количество ценников">
          <InputNumber
            min={1}
            max={60}
            value={settings.copies}
            onChange={(value) => setSettings((current) => ({ ...current, copies: value ?? 1 }))}
          />
        </Form.Item>
      </div>
      <Space wrap style={{ marginBottom: 16 }}>
        <Checkbox checked={settings.showClinic} disabled={!organization?.displayName} onChange={(event) => setSettings((current) => ({ ...current, showClinic: event.target.checked }))}>
          Название клиники
        </Checkbox>
        <Checkbox checked={settings.showLegalName} disabled={!organization?.legalName} onChange={(event) => setSettings((current) => ({ ...current, showLegalName: event.target.checked }))}>
          Юридическое наименование
        </Checkbox>
        <Checkbox checked={settings.showCategory} onChange={(event) => setSettings((current) => ({ ...current, showCategory: event.target.checked }))}>
          Категория
        </Checkbox>
        <Checkbox checked={settings.showBarcode} disabled={!barcode} onChange={(event) => setSettings((current) => ({ ...current, showBarcode: event.target.checked }))}>
          Штрих-код
        </Checkbox>
        <Checkbox checked={settings.showVat} onChange={(event) => setSettings((current) => ({ ...current, showVat: event.target.checked }))}>
          НДС
        </Checkbox>
      </Space>
      <div style={{ background: '#eef2f7', padding: 24, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 260, minHeight: 180, background: '#fff', border: '1px solid #cbd5e1', padding: 14, display: 'grid', alignContent: 'start', gap: 5 }}>
          {settings.showClinic && organization?.displayName ? <strong style={{ fontSize: 13 }}>{organization.displayName}</strong> : null}
          {settings.showLegalName && organization?.legalName ? <small style={{ color: '#475569' }}>{organization.legalName}</small> : null}
          <strong>{product.title}</strong>
          <span style={{ fontSize: 26, fontWeight: 800 }}>{formatMoney(product.retailPrice)}</span>
          {settings.showCategory && product.category?.title ? <Typography.Text type="secondary">{product.category.title}</Typography.Text> : null}
          {settings.showVat ? <small>{product.vatRate !== null && product.vatRate !== undefined ? `НДС ${product.vatRate}%` : 'Без НДС'}</small> : null}
          {settings.showBarcode && barcode ? <BarcodeGraphic value={barcode} /> : null}
        </div>
      </div>
    </Modal>
  );
}

function printProductPriceTags(product: Product, organization: PriceTagOrganization, settings: PriceTagSettings) {
  const printWindow = window.open('', '_blank', 'width=720,height=520');

  if (!printWindow) {
    return;
  }

  const barcode = product.barcode || product.gtin;
  const barcodeSvg = settings.showBarcode && barcode ? renderBarcodeSvg(barcode) : '';
  const metaRows = [
    product.sku ? `Артикул: ${product.sku}` : null,
    settings.showCategory && product.category?.title ? `Категория: ${product.category.title}` : null,
    settings.showVat ? (product.vatRate !== null && product.vatRate !== undefined ? `НДС: ${product.vatRate}%` : 'Без НДС') : null,
  ].filter(Boolean);
  const label = `<div class="label">
    ${settings.showClinic && organization?.displayName ? `<div class="clinic">${escapeHtml(organization.displayName)}</div>` : ''}
    ${settings.showLegalName && organization?.legalName ? `<div class="legal">${escapeHtml(organization.legalName)}</div>` : ''}
    <div class="title">${escapeHtml(product.title)}</div>
    <div class="price">${escapeHtml(formatMoney(product.retailPrice))}</div>
    <div class="meta">${metaRows.map((row) => `<div>${escapeHtml(String(row))}</div>`).join('')}</div>
    ${barcodeSvg ? `<div class="barcode">${barcodeSvg}</div>` : ''}
  </div>`;
  const labels = Array.from({ length: settings.copies }, () => label).join('');
  const pageCss = settings.paper === 'A4'
    ? '@page { size: A4 portrait; margin: 12mm; } .sheet { display: grid; grid-template-columns: repeat(3, 58mm); gap: 5mm; align-content: start; } .label { break-inside: avoid; border: 1px dashed #9ca3af; }'
    : '@page { size: 58mm 40mm; margin: 0; } .sheet { display: block; } .label { break-after: page; } .label:last-child { break-after: auto; }';

  printWindow.document.write(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Ценник ${escapeHtml(product.title)}</title>
  <style>
    ${pageCss}
    body { margin: 0; color: #111827; font: 12px/1.35 Arial, sans-serif; }
    .label { box-sizing: border-box; width: 58mm; height: 40mm; padding: 2.5mm 3mm; display: grid; gap: 0.7mm; align-content: start; overflow: hidden; }
    .clinic { font-size: 9px; font-weight: 700; }
    .legal { color: #4b5563; font-size: 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .title { font-size: 11px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .price { font-size: 18px; font-weight: 800; }
    .meta { color: #4b5563; font-size: 7px; display: flex; gap: 2mm; }
    .barcode { border-top: 1px solid #d1d5db; padding-top: 0.5mm; line-height: 0; }
    .barcode svg { width: 100%; height: 11mm; }
  </style>
</head>
<body>
  <div class="sheet">${labels}</div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`);
  printWindow.document.close();
}

function BarcodeGraphic({ value }: { value: string }) {
  const barcodeRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!barcodeRef.current) {
      return;
    }

    JsBarcode(barcodeRef.current, value, {
      format: getBarcodeFormat(value),
      width: 1.35,
      height: 38,
      margin: 0,
      displayValue: true,
      fontSize: 11,
      background: '#ffffff',
      lineColor: '#111827',
    });
  }, [value]);

  return <svg ref={barcodeRef} role="img" aria-label={`Штрих-код ${value}`} style={{ width: '100%', height: 56 }} />;
}

function renderBarcodeSvg(value: string) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, value, {
    format: getBarcodeFormat(value),
    width: 1.25,
    height: 34,
    margin: 0,
    displayValue: true,
    fontSize: 10,
    background: '#ffffff',
    lineColor: '#111827',
  });

  return svg.outerHTML;
}

function getBarcodeFormat(value: string): 'EAN13' | 'CODE128' {
  return isValidEan13(value) ? 'EAN13' : 'CODE128';
}

function isValidEan13(value: string) {
  if (!/^\d{13}$/.test(value)) {
    return false;
  }

  const body = value.slice(0, 12);
  const sum = [...body].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === Number(value[12]);
}

function buildCategoryOptions(defaults: string[], saved: string[]) {
  return [...new Set([...defaults, ...saved].map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'ru'))
    .map((value) => ({ value, label: value }));
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
