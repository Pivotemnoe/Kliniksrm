import { PlusOutlined, PrinterOutlined, SearchOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
            <Input.Search
              allowClear
              enterButton={<SearchOutlined />}
              placeholder="Поиск"
              className="search-input"
              onSearch={handleSearch}
            />
          }
          items={[
            {
              key: 'products',
              label: 'Товары',
              children: <ProductsTable search={search} offset={offset} onTableChange={handleTableChange} />,
            },
            {
              key: 'services',
              label: 'Услуги',
              children: <ServicesTable search={search} offset={offset} onTableChange={handleTableChange} />,
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
        resources={resourcesQuery.data}
        onClose={() => setProductOpen(false)}
      />
      <ServiceModal
        open={serviceOpen}
        resources={resourcesQuery.data}
        onClose={() => setServiceOpen(false)}
      />
      <SupplyInvoiceModal
        open={supplyOpen}
        resources={resourcesQuery.data}
        onClose={() => setSupplyOpen(false)}
      />
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
  onTableChange,
}: {
  search: string;
  offset: number;
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
      { title: 'Цена', dataIndex: 'retailPrice', key: 'retailPrice', render: formatMoney },
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
      { title: 'GTIN', dataIndex: 'gtin', key: 'gtin', render: (value: string | null) => value || '—' },
      { title: 'Штрих-код', dataIndex: 'barcode', key: 'barcode', render: (value: string | null) => value || '—' },
      { title: 'НДС', dataIndex: 'vatRate', key: 'vatRate', render: (value) => (value === null || value === undefined ? 'Без НДС' : `${value}%`) },
      {
        title: '',
        key: 'actions',
        width: 120,
        render: (_, record) => (
          <Button size="small" icon={<PrinterOutlined />} onClick={() => printProductPriceTag(record)}>
            Ценник
          </Button>
        ),
      },
    ],
    [],
  );

  return <StockTable query={productsQuery} columns={columns} offset={offset} onTableChange={onTableChange} />;
}

function ServicesTable({
  search,
  offset,
  onTableChange,
}: {
  search: string;
  offset: number;
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
    ],
    [],
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
        pagination={{ current: offset / pageSize + 1, pageSize, total: query.data?.total ?? 0, showSizeChanger: false }}
        onChange={onTableChange}
      />
    </div>
  );
}

const productSchema = z.object({
  title: z.string().trim().min(2, 'Введите название'),
  categoryTitle: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  retailPrice: z.number().min(0).optional(),
  stockUnit: z.string().trim().optional(),
  writeOffUnit: z.string().trim().optional(),
  gtin: z.string().trim().optional(),
  barcode: z.string().trim().optional(),
  vatRate: z.number().min(0).max(100).optional(),
  packageQuantity: z.number().min(0).optional(),
  minStock: z.number().min(0).optional(),
  shelfLifeDays: z.number().min(0).optional(),
  description: z.string().trim().optional(),
});

type ProductFormValues = z.infer<typeof productSchema>;

function ProductModal({ open, resources, onClose }: { open: boolean; resources?: StockResources; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { control, handleSubmit, reset } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { title: '', categoryTitle: '', sku: '', retailPrice: 0, stockUnit: 'шт', writeOffUnit: 'шт' },
  });
  const mutation = useMutation({
    mutationFn: createProduct,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
      ]);
      message.success('Товар создан');
      reset();
      onClose();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  return (
    <Modal title="Добавление товара" open={open} onCancel={onClose} onOk={handleSubmit((values) => mutation.mutate(values))} confirmLoading={mutation.isPending} destroyOnHidden>
      <Form layout="vertical">
        <FormText control={control} name="title" label="Название" autoFocus />
        <Controller
          control={control}
          name="categoryTitle"
          render={({ field }) => (
            <Form.Item label="Категория">
              <Select
                showSearch
                allowClear
                value={field.value || undefined}
                onChange={(value) => field.onChange(value)}
                onSearch={(value) => field.onChange(value)}
                options={resources?.productCategories.map((category) => ({ value: category.title, label: category.title })) ?? []}
                placeholder="Выберите или введите категорию"
              />
            </Form.Item>
          )}
        />
        <div className="form-grid two-columns">
          <FormText control={control} name="sku" label="Артикул / SKU" />
          <FormNumber control={control} name="retailPrice" label="Цена" />
          <FormText control={control} name="gtin" label="GTIN" />
          <FormText control={control} name="barcode" label="Штрих-код" />
          <FormNumber control={control} name="vatRate" label="НДС, %" />
          <FormNumber control={control} name="packageQuantity" label="Количество в упаковке" />
          <FormNumber control={control} name="minStock" label="Минимальный остаток" />
          <FormNumber control={control} name="shelfLifeDays" label="Срок хранения, дней" />
          <FormText control={control} name="stockUnit" label="Единица на складе" />
          <FormText control={control} name="writeOffUnit" label="Единица списания" />
        </div>
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

function ServiceModal({ open, resources, onClose }: { open: boolean; resources?: StockResources; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { control, handleSubmit, reset } = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues: { title: '', categoryTitle: '', price: 0, priceType: 'FIXED', description: '' },
  });
  const mutation = useMutation({
    mutationFn: createService,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['stock'] });
      message.success('Услуга создана');
      reset();
      onClose();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  return (
    <Modal title="Добавить услугу" open={open} onCancel={onClose} onOk={handleSubmit((values) => mutation.mutate(values))} confirmLoading={mutation.isPending} destroyOnHidden>
      <Form layout="vertical">
        <FormText control={control} name="title" label="Название" autoFocus />
        <Controller
          control={control}
          name="categoryTitle"
          render={({ field }) => (
            <Form.Item label="Категория">
              <Select
                showSearch
                allowClear
                value={field.value || undefined}
                onChange={(value) => field.onChange(value)}
                onSearch={(value) => field.onChange(value)}
                options={resources?.serviceCategories.map((category) => ({ value: category.title, label: category.title })) ?? []}
                placeholder="Выберите или введите категорию"
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
  const { control, handleSubmit, reset } = useForm<SupplyFormValues>({
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
}: {
  control: any;
  name: string;
  label: string;
  textarea?: boolean;
  autoFocus?: boolean;
  type?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item label={label} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
          {textarea ? <Input.TextArea rows={3} {...field} /> : <Input {...field} type={type} autoFocus={autoFocus} />}
        </Form.Item>
      )}
    />
  );
}

function FormNumber({ control, name, label, step = 0.01 }: { control: any; name: string; label: string; step?: number }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item label={label} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
          <InputNumber className="full-width" min={0} step={step} value={field.value} onChange={(value) => field.onChange(value ?? 0)} />
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

function printProductPriceTag(product: Product) {
  const printWindow = window.open('', '_blank', 'width=720,height=520');

  if (!printWindow) {
    return;
  }

  const code = product.barcode || product.gtin || product.sku || product.id;
  const metaRows = [
    product.sku ? `Артикул: ${product.sku}` : null,
    product.gtin ? `GTIN: ${product.gtin}` : null,
    product.barcode ? `Штрих-код: ${product.barcode}` : null,
    product.category?.title ? `Категория: ${product.category.title}` : null,
    product.vatRate !== null && product.vatRate !== undefined ? `НДС: ${product.vatRate}%` : 'Без НДС',
  ].filter(Boolean);

  printWindow.document.write(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Ценник ${escapeHtml(product.title)}</title>
  <style>
    @page { size: 58mm 40mm; margin: 4mm; }
    body { margin: 0; color: #111827; font: 12px/1.35 Arial, sans-serif; }
    .label { width: 50mm; min-height: 32mm; display: grid; gap: 2mm; align-content: start; }
    .title { font-size: 13px; font-weight: 700; }
    .price { font-size: 22px; font-weight: 800; }
    .meta { color: #4b5563; font-size: 9px; }
    .code { padding-top: 1mm; border-top: 1px solid #d1d5db; font-family: monospace; font-size: 10px; letter-spacing: 1px; }
  </style>
</head>
<body>
  <div class="label">
    <div class="title">${escapeHtml(product.title)}</div>
    <div class="price">${escapeHtml(formatMoney(product.retailPrice))}</div>
    <div class="meta">${metaRows.map((row) => `<div>${escapeHtml(String(row))}</div>`).join('')}</div>
    <div class="code">${escapeHtml(code)}</div>
  </div>
  <script>window.print();</script>
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
