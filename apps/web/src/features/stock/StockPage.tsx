import { DeleteOutlined, DownOutlined, EditOutlined, EyeOutlined, PaperClipOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, AutoComplete, Button, Checkbox, Descriptions, Drawer, Dropdown, Form, Input, InputNumber, Modal, Radio, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import JsBarcode from 'jsbarcode';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDate } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { AttachmentsPanel } from '../files/AttachmentsPanel';
import { listSupplyFiles, uploadSupplyFile } from '../files/files.api';
import {
  createProduct,
  createService,
  createSupplyInvoice,
  deleteProduct,
  deleteService,
  getStockResources,
  getCatalogQuality,
  listProducts,
  listServices,
  listStockBatches,
  listSupplyInvoices,
  updateSupplyInvoice,
  updateProduct,
  updateService,
} from './stock.api';
import { Product, ServiceItem, StockBatch, StockResources, SupplyInvoice } from './types';
import { SupplyInvoiceImporter } from './SupplyInvoiceImporter';
import { SupplierModal } from './SupplierModal';

const pageSize = 10;

export function StockPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'stock.manage');
  const [activeTab, setActiveTab] = useState(getStockTabFromPath(location.pathname));
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const deferredSearchInput = useDeferredValue(searchInput);
  const [offset, setOffset] = useState(0);
  const [productOpen, setProductOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [printingProduct, setPrintingProduct] = useState<Product | null>(null);
  const [supplyOpen, setSupplyOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<SupplyInvoice | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<SupplyInvoice | null>(null);
  const resourcesQuery = useQuery({ queryKey: ['stock', 'resources'], queryFn: getStockResources });
  const catalogQualityQuery = useQuery({ queryKey: ['stock', 'catalog-quality'], queryFn: getCatalogQuality });
  const deleteProductMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: async (deleted) => {
      setSelectedProduct((current) => current?.id === deleted.id ? null : current);
      await queryClient.invalidateQueries({ queryKey: ['stock'] });
      message.success(`Товар «${deleted.title}» удалён из каталога`);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const deleteServiceMutation = useMutation({
    mutationFn: deleteService,
    onSuccess: async (deleted) => {
      setSelectedService((current) => current?.id === deleted.id ? null : current);
      await queryClient.invalidateQueries({ queryKey: ['stock'] });
      message.success(`Услуга «${deleted.title}» удалена из каталога`);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  useEffect(() => {
    setActiveTab(getStockTabFromPath(location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    const value = deferredSearchInput.trim();
    if (value.length > 0 && value.length < 3) return;
    setSearch(value);
    setOffset(0);
  }, [deferredSearchInput]);

  function handleTableChange(pagination: TablePaginationConfig) {
    const current = pagination.current ?? 1;
    const size = pagination.pageSize ?? pageSize;
    setOffset((current - 1) * size);
  }

  function confirmProductDeletion(product: Product) {
    modal.confirm({
      title: `Удалить товар «${product.title}»?`,
      content: 'Товар исчезнет из каталога и новых документов, но останется в старых счетах, приёмах и складской истории. При ненулевом остатке, черновике складского документа или невыполненном назначении удаление будет запрещено.',
      okText: 'Удалить',
      okButtonProps: { danger: true },
      cancelText: 'Отмена',
      onOk: () => deleteProductMutation.mutateAsync(product.id),
    });
  }

  function confirmServiceDeletion(service: ServiceItem) {
    modal.confirm({
      title: `Удалить услугу «${service.title}»?`,
      content: 'Услуга исчезнет из каталога и новых документов, но останется в старых счетах и приёмах. Если услуга указана в невыполненном назначении стационара, удаление будет запрещено.',
      okText: 'Удалить',
      okButtonProps: { danger: true },
      cancelText: 'Отмена',
      onOk: () => deleteServiceMutation.mutateAsync(service.id),
    });
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
              <SupplyInvoiceImporter resources={resourcesQuery.data} />
            </Space>
          ) : null
        }
      />
      {catalogQualityQuery.data && catalogQualityQuery.data.qualityPercent < 100 ? (
        <Alert
          type={catalogQualityQuery.data.qualityPercent >= 80 ? 'warning' : 'error'}
          showIcon
          className="form-alert"
          message={`Качество каталога: ${catalogQualityQuery.data.qualityPercent}%`}
          description={`Требуют проверки: без категории — ${catalogQualityQuery.data.counts.withoutCategory}, с нулевой ценой — ${catalogQualityQuery.data.counts.zeroPrice}, без единиц учёта — ${catalogQualityQuery.data.counts.missingUnits}, старых составных штрих-кодов — ${catalogQualityQuery.data.counts.legacyCompositeBarcode}, повторяющихся кодов — ${catalogQualityQuery.data.counts.duplicateBarcodeValues}.`}
        />
      ) : null}
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
              <Input
                allowClear
                value={searchInput}
                placeholder="Введите минимум 3 буквы, SKU или штрих-код"
                className="search-input"
                onChange={(event) => setSearchInput(event.target.value)}
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
                  onOpen={setSelectedProduct}
                  onEdit={(product) => {
                    setEditingProduct(product);
                    setProductOpen(true);
                  }}
                  onDelete={confirmProductDeletion}
                  onPrint={setPrintingProduct}
                  onAdjustStock={(product) => navigate(`/stock/operations?inventoryProductId=${encodeURIComponent(product.id)}`)}
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
                  onOpen={setSelectedService}
                  onEdit={(service) => {
                    setEditingService(service);
                    setServiceOpen(true);
                  }}
                  onDelete={confirmServiceDeletion}
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
              children: <InvoicesTable search={search} offset={offset} canManage={canManage} onOpen={setSelectedInvoice} onEdit={(invoice) => {
                setEditingInvoice(invoice);
                setSupplyOpen(true);
              }} onTableChange={handleTableChange} />,
            },
          ]}
        />
      </div>
      <ProductModal
        open={productOpen}
        product={editingProduct}
        resources={resourcesQuery.data}
        onAdjustStock={(product) => {
          setProductOpen(false);
          setEditingProduct(null);
          navigate(`/stock/operations?inventoryProductId=${encodeURIComponent(product.id)}`);
        }}
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
      <Drawer
        title={selectedProduct ? `Товар: ${selectedProduct.title}` : 'Товар'}
        open={Boolean(selectedProduct)}
        onClose={() => setSelectedProduct(null)}
        width={560}
        destroyOnHidden
        extra={selectedProduct && canManage ? (
          <Button icon={<EditOutlined />} onClick={() => {
            setEditingProduct(selectedProduct);
            setSelectedProduct(null);
            setProductOpen(true);
          }}>
            Изменить
          </Button>
        ) : null}
      >
        {selectedProduct ? (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Название">{selectedProduct.title}</Descriptions.Item>
            <Descriptions.Item label="Категория">{selectedProduct.category?.title ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Цена продажи">{formatMoney(selectedProduct.retailPrice)} / {selectedProduct.billingUnit || selectedProduct.writeOffUnit || selectedProduct.stockUnit || 'шт'}</Descriptions.Item>
            <Descriptions.Item label="Остаток">{selectedProduct.stockRest ?? 0} {selectedProduct.stockUnit ?? ''}</Descriptions.Item>
            <Descriptions.Item label="Артикул / SKU">{selectedProduct.sku || '—'}</Descriptions.Item>
            <Descriptions.Item label="Штрих-код">{selectedProduct.barcode || '—'}</Descriptions.Item>
            <Descriptions.Item label="Учёт и списание">{formatProductUnits(selectedProduct)}</Descriptions.Item>
            <Descriptions.Item label="Минимальный остаток">{selectedProduct.minStock ?? '—'} {selectedProduct.minStock === null ? '' : selectedProduct.stockUnit ?? ''}</Descriptions.Item>
            <Descriptions.Item label="Годен до">{formatDate(selectedProduct.defaultExpiresAt)}</Descriptions.Item>
            <Descriptions.Item label="НДС">{selectedProduct.vatRate === null ? 'Без НДС' : `${selectedProduct.vatRate}%`}</Descriptions.Item>
            <Descriptions.Item label="Дополнительная информация">{selectedProduct.description || '—'}</Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>
      <Drawer
        title={selectedService ? `Услуга: ${selectedService.title}` : 'Услуга'}
        open={Boolean(selectedService)}
        onClose={() => setSelectedService(null)}
        width={520}
        destroyOnHidden
        extra={selectedService && canManage ? (
          <Button icon={<EditOutlined />} onClick={() => {
            setEditingService(selectedService);
            setSelectedService(null);
            setServiceOpen(true);
          }}>
            Изменить
          </Button>
        ) : null}
      >
        {selectedService ? (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Название">{selectedService.title}</Descriptions.Item>
            <Descriptions.Item label="Категория">{selectedService.category?.title ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Цена">{formatMoney(selectedService.price)}</Descriptions.Item>
            <Descriptions.Item label="Тип цены">{selectedService.priceType === 'FLOATING' ? 'Плавающая' : 'Фиксированная'}</Descriptions.Item>
            <Descriptions.Item label="НДС">{selectedService.vatRate === null ? 'Без НДС' : `${selectedService.vatRate}%`}</Descriptions.Item>
            <Descriptions.Item label="Описание">{selectedService.description || '—'}</Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>
      <SupplyInvoiceModal
        open={supplyOpen}
        invoice={editingInvoice}
        resources={resourcesQuery.data}
        onClose={() => {
          setSupplyOpen(false);
          setEditingInvoice(null);
        }}
      />
      <Drawer
        title={selectedInvoice ? `Накладная ${selectedInvoice.number || 'без номера'}` : 'Накладная'}
        open={Boolean(selectedInvoice)}
        onClose={() => setSelectedInvoice(null)}
        width={760}
        destroyOnHidden
      >
        {selectedInvoice ? (
          <Space direction="vertical" size={16} className="full-width">
            {canManage ? (
              <Button icon={<EditOutlined />} onClick={() => {
                setEditingInvoice(selectedInvoice);
                setSelectedInvoice(null);
                setSupplyOpen(true);
              }}>
                Исправить накладную
              </Button>
            ) : null}
            <Typography.Text>
              {formatDate(selectedInvoice.suppliedAt)} · {selectedInvoice.supplier?.title ?? 'Поставщик не указан'} · {formatMoney(selectedInvoice.totalAmount)}
            </Typography.Text>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={selectedInvoice.items}
              columns={[
                { title: 'Товар', key: 'product', render: (_, item) => item.product?.title ?? '—' },
                { title: 'Количество', key: 'quantity', render: (_, item) => formatSupplyInvoiceQuantity(item) },
                { title: 'Цена по накладной', dataIndex: 'purchasePrice', key: 'purchasePrice', render: formatMoney },
                { title: 'Цена продажи', key: 'retailPrice', render: (_, item) => formatMoney(item.product?.retailPrice ?? 0) },
                { title: 'Серия', dataIndex: 'series', key: 'series', render: (value) => value || '—' },
              ]}
            />
            <AttachmentsPanel
              queryKey={['stock', 'supply-files', selectedInvoice.id]}
              listFiles={() => listSupplyFiles(selectedInvoice.id)}
              uploadFile={(file) => uploadSupplyFile(selectedInvoice.id, file)}
              canManage={canManage}
              title="Оригинал накладной и сопроводительные документы"
              description="Прикрепите PDF, фото или исходную таблицу поставщика. Файл хранится вместе с накладной и доступен по кнопке «Открыть»."
            />
          </Space>
        ) : null}
      </Drawer>
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
  onOpen,
  onEdit,
  onDelete,
  onPrint,
  onAdjustStock,
  onTableChange,
}: {
  search: string;
  offset: number;
  canManage: boolean;
  onOpen: (product: Product) => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onPrint: (product: Product) => void;
  onAdjustStock: (product: Product) => void;
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
        title: 'Цена продажи',
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
        width: 130,
        fixed: 'right',
        render: (_, record) => (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'open', icon: <EyeOutlined />, label: 'Открыть' },
                ...(canManage ? [
                  { key: 'edit', icon: <EditOutlined />, label: 'Изменить' },
                  { key: 'stock', icon: <PlusOutlined />, label: 'Изменить остаток' },
                ] : []),
                { key: 'print', icon: <PrinterOutlined />, label: 'Печать ценника' },
                ...(canManage ? [
                  { type: 'divider' as const },
                  { key: 'delete', danger: true, icon: <DeleteOutlined />, label: 'Удалить' },
                ] : []),
              ],
              onClick: ({ key }) => {
                if (key === 'open') onOpen(record);
                if (key === 'edit') onEdit(record);
                if (key === 'stock') onAdjustStock(record);
                if (key === 'print') onPrint(record);
                if (key === 'delete') onDelete(record);
              },
            }}
          >
            <Button size="small">Действия <DownOutlined /></Button>
          </Dropdown>
        ),
      },
    ],
    [canManage, onAdjustStock, onDelete, onEdit, onOpen, onPrint],
  );

  return <StockTable query={productsQuery} columns={columns} offset={offset} onTableChange={onTableChange} />;
}

function ServicesTable({
  search,
  offset,
  canManage,
  onOpen,
  onEdit,
  onDelete,
  onTableChange,
}: {
  search: string;
  offset: number;
  canManage: boolean;
  onOpen: (service: ServiceItem) => void;
  onEdit: (service: ServiceItem) => void;
  onDelete: (service: ServiceItem) => void;
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
      {
        title: '',
        key: 'actions',
        width: 130,
        fixed: 'right' as const,
        render: (_: unknown, record: ServiceItem) => (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'open', icon: <EyeOutlined />, label: 'Открыть' },
                ...(canManage ? [
                  { key: 'edit', icon: <EditOutlined />, label: 'Изменить' },
                  { type: 'divider' as const },
                  { key: 'delete', danger: true, icon: <DeleteOutlined />, label: 'Удалить' },
                ] : []),
              ],
              onClick: ({ key }) => {
                if (key === 'open') onOpen(record);
                if (key === 'edit') onEdit(record);
                if (key === 'delete') onDelete(record);
              },
            }}
          >
            <Button size="small">Действия <DownOutlined /></Button>
          </Dropdown>
        ),
      },
    ],
    [canManage, onDelete, onEdit, onOpen],
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
      { title: 'Приходная цена', dataIndex: 'purchasePrice', key: 'purchasePrice', render: formatMoney },
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
  canManage,
  onOpen,
  onEdit,
  onTableChange,
}: {
  search: string;
  offset: number;
  canManage: boolean;
  onOpen: (invoice: SupplyInvoice) => void;
  onEdit: (invoice: SupplyInvoice) => void;
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
      {
        title: '',
        key: 'actions',
        render: (_, record) => <Space size={6}>
          <Button size="small" icon={<PaperClipOutlined />} onClick={() => onOpen(record)}>Открыть</Button>
          {canManage ? <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(record)}>Исправить</Button> : null}
        </Space>,
      },
    ],
    [canManage, onEdit, onOpen],
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
    barcodesText: z.string().trim().refine(
      (value) => !value || value.split(/[;,\n]+/).map((item) => item.trim()).filter(Boolean).every((item) => /^\d{4,32}$/.test(item)),
      'Каждый дополнительный штрих-код должен содержать только цифры',
    ).optional(),
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
  onAdjustStock,
  onClose,
}: {
  open: boolean;
  product: Product | null;
  resources?: StockResources;
  onAdjustStock: (product: Product) => void;
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
      barcodesText: product?.barcodes?.filter((item) => !item.isPrimary).map((item) => item.value).join('\n') ?? '',
      generateBarcode: false,
      vatRate: product?.vatRate === null || product?.vatRate === undefined ? undefined : Number(product.vatRate),
      packageQuantity: product?.packageQuantity === null || product?.packageQuantity === undefined ? 1 : Number(product.packageQuantity),
      minStock: product?.minStock === null || product?.minStock === undefined ? 0 : Number(product.minStock),
      defaultExpiresAt: product?.defaultExpiresAt?.slice(0, 10) ?? '',
      description: product?.description ?? '',
    });
  }, [open, product, reset]);
  const mutation = useMutation({
    mutationFn: (values: ProductFormValues) => {
      const { barcodesText, ...productValues } = values;
      const barcodes = barcodesText?.split(/[;,\n]+/).map((item) => item.trim()).filter(Boolean) ?? [];
      return product
        ? updateProduct(product.id, {
            ...productValues,
            barcodes,
            defaultExpiresAt: values.defaultExpiresAt ? new Date(values.defaultExpiresAt).toISOString() : null,
          })
        : createProduct({
            ...productValues,
            barcodes,
            defaultExpiresAt: values.defaultExpiresAt ? new Date(values.defaultExpiresAt).toISOString() : undefined,
          });
    },
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
        {product ? (
          <Alert
            type="info"
            showIcon
            className="form-alert"
            message={`Текущий остаток: ${product.stockRest ?? 0} ${product.stockUnit ?? ''}`}
            description={(
              <Space direction="vertical" size={8}>
                <span>Остаток меняется отдельным документом, чтобы сохранялись история, сотрудник и дата корректировки.</span>
                <Button size="small" icon={<PlusOutlined />} onClick={() => onAdjustStock(product)}>
                  Провести инвентаризацию этого товара
                </Button>
              </Space>
            )}
          />
        ) : null}
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
          <FormText control={control} name="barcodesText" label="Дополнительные штрих-коды" textarea help="Если у товара несколько упаковок или кодов поставщика, вводите по одному номеру в строке. Все они будут находить один товар." />
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

const supplyLineSchema = z.object({
  id: z.string().optional(),
  productId: z.string().min(1, 'Выберите товар'),
  warehouseId: z.string().min(1, 'Выберите склад'),
  quantity: z.number().min(0.001, 'Введите количество'),
  receiptUnit: z.string().trim().min(1, 'Укажите единицу по накладной'),
  conversionFactor: z.number().min(0.001, 'Укажите пересчёт в складскую единицу'),
  purchasePrice: z.number().min(0.01, 'Введите цену по накладной'),
  retailPrice: z.number().min(0.01, 'Введите цену продажи'),
  discountAmount: z.number().min(0).optional(),
  expiresAt: z.string().optional(),
  series: z.string().trim().optional(),
  rack: z.string().trim().optional(),
  rackNumber: z.string().trim().optional(),
  shelfNumber: z.string().trim().optional(),
});

const supplySchema = z.object({
  supplierId: z.string().min(1, 'Выберите поставщика'),
  number: z.string().trim().optional(),
  suppliedAt: z.string().min(1, 'Укажите дату поставки'),
  items: z.array(supplyLineSchema).min(1, 'Добавьте хотя бы одну позицию'),
});

type SupplyFormValues = z.infer<typeof supplySchema>;

const receiptUnitOptions = [
  'шт', 'упак.', 'коробка', 'ящик', 'набор', 'флакон', 'ампула', 'доза',
  'бутылка', 'канистра', 'пакет', 'рулон', 'мл', 'л', 'г', 'кг', 'таблетка', 'капсула',
].map((unit) => ({ value: unit, label: unit }));

function SupplyInvoiceModal({ open, invoice, resources, onClose }: { open: boolean; invoice?: SupplyInvoice | null; resources?: StockResources; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [knownProducts, setKnownProducts] = useState<Record<string, Product>>({});
  const deferredProductSearch = useDeferredValue(productSearch);
  const normalizedProductSearch = deferredProductSearch.trim();
  const productsQuery = useQuery({
    queryKey: ['stock', 'products', 'supply-select', normalizedProductSearch],
    queryFn: () => listProducts({ search: normalizedProductSearch, limit: 50, offset: 0 }),
    enabled: open && normalizedProductSearch.length >= 3,
  });
  const defaultWarehouseId = resources?.warehouses[0]?.id ?? '';
  const { control, handleSubmit, reset, setValue } = useForm<SupplyFormValues>({
    resolver: zodResolver(supplySchema),
    defaultValues: getSupplyFormValues(invoice, defaultWarehouseId),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchedItems = useWatch({ control, name: 'items' }) ?? [];

  useEffect(() => {
    if (!open) return;
    reset(getSupplyFormValues(invoice, defaultWarehouseId));
    setProductSearch('');
    setKnownProducts(Object.fromEntries(
      (invoice?.items ?? []).flatMap((item) => item.product ? [[item.product.id, item.product] as const] : []),
    ));
  }, [defaultWarehouseId, invoice, open, reset]);

  useEffect(() => {
    if (!productsQuery.data?.items.length) return;
    setKnownProducts((current) => ({
      ...current,
      ...Object.fromEntries(productsQuery.data.items.map((product) => [product.id, product])),
    }));
  }, [productsQuery.data]);

  const productOptions = useMemo(
    () => Object.values(knownProducts)
      .sort((left, right) => left.title.localeCompare(right.title, 'ru'))
      .map((product) => ({ value: product.id, label: formatProductOption(product) })),
    [knownProducts],
  );

  const mutation = useMutation({
    mutationFn: (values: SupplyFormValues) => {
      const input = {
        supplierId: values.supplierId,
        number: values.number,
        suppliedAt: new Date(values.suppliedAt).toISOString(),
        items: values.items.map((item) => ({
          ...item,
          expiresAt: item.expiresAt ? new Date(item.expiresAt).toISOString() : undefined,
        })),
      };
      return invoice ? updateSupplyInvoice(invoice.id, input) : createSupplyInvoice(input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['stock'] });
      message.success(invoice ? 'Накладная исправлена, изменения остатка записаны в историю' : 'Приёмка проведена');
      reset();
      onClose();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  return (
    <>
    <Modal title={invoice ? `Исправление накладной ${invoice.number || 'без номера'}` : 'Новая поставка товара'} open={open} onCancel={onClose} onOk={handleSubmit((values) => mutation.mutate(values))} okText={invoice ? 'Сохранить исправления' : 'Провести приёмку'} confirmLoading={mutation.isPending} destroyOnHidden width={1120}>
      <Form layout="vertical" className="supply-form-compact">
        {invoice ? <Alert type="info" showIcon message="Исправление сохраняет историю движений" description="Уже использованное количество не уменьшается. Проведённые строки не удаляются: для возврата используйте складской документ «Возврат поставщику»." className="form-alert" /> : null}
        <div className="form-grid two-columns">
          <Controller
            control={control}
            name="supplierId"
            render={({ field, fieldState }) => (
              <Form.Item label="Поставщик" required validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message ?? 'Поставщик выбирается из справочника.'}>
                <Space.Compact className="full-width">
                  <Select {...field} showSearch optionFilterProp="label" options={resources?.suppliers.map((supplier) => ({ value: supplier.id, label: supplier.title })) ?? []} placeholder="Выберите поставщика" />
                  <Button icon={<PlusOutlined />} onClick={() => setSupplierOpen(true)}>Новый</Button>
                </Space.Compact>
              </Form.Item>
            )}
          />
          <FormText control={control} name="number" label="№ накладной" />
          <FormText control={control} name="suppliedAt" label="Дата поставки" type="date" />
        </div>
        <Typography.Title level={5}>Позиции накладной</Typography.Title>
        <Space direction="vertical" size={8} className="full-width">
          {fields.map((field, index) => {
            const existingLine = Boolean(watchedItems[index]?.id);
            const watchedLine = watchedItems[index];
            const selectedProduct = knownProducts[watchedLine?.productId ?? ''];
            const receiptUnit = watchedLine?.receiptUnit?.trim() || selectedProduct?.stockUnit?.trim() || '';
            const stockUnit = selectedProduct?.stockUnit?.trim() || receiptUnit || 'ед.';
            const conversionFactor = Number(watchedLine?.conversionFactor ?? 1);
            const stockQuantity = Number(watchedLine?.quantity ?? 0) * conversionFactor;
            return <div key={field.id} className="supply-line-card">
              <Space align="start" className="full-width" style={{ justifyContent: 'space-between' }}>
                <Typography.Text strong>Позиция {index + 1}</Typography.Text>
                <Button danger type="text" icon={<DeleteOutlined />} disabled={fields.length === 1 || existingLine} onClick={() => remove(index)}>
                  {existingLine ? 'Проведена' : 'Убрать'}
                </Button>
              </Space>
              <div className="supply-line-primary-grid">
                <Controller control={control} name={`items.${index}.productId`} render={({ field: productField, fieldState }) => (
                  <Form.Item label="Товар" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                    <Select
                      {...productField}
                      allowClear
                      showSearch
                      filterOption={false}
                      loading={productsQuery.isFetching}
                      onSearch={setProductSearch}
                      notFoundContent={normalizedProductSearch.length < 3 ? 'Введите минимум 3 символа' : 'Товар не найден'}
                      onChange={(value) => {
                        productField.onChange(value);
                        const product = value ? knownProducts[value] ?? productsQuery.data?.items.find((item) => item.id === value) : undefined;
                        setValue(`items.${index}.expiresAt`, product?.defaultExpiresAt?.slice(0, 10) ?? '');
                        setValue(`items.${index}.retailPrice`, Number(product?.retailPrice ?? 0), { shouldDirty: true, shouldValidate: false });
                        setValue(`items.${index}.receiptUnit`, product?.stockUnit?.trim() || 'шт', { shouldDirty: true, shouldValidate: false });
                        setValue(`items.${index}.conversionFactor`, 1, { shouldDirty: true, shouldValidate: false });
                      }}
                      options={productOptions}
                      placeholder="Введите название, SKU или штрих-код"
                    />
                  </Form.Item>
                )} />
                <Controller control={control} name={`items.${index}.warehouseId`} render={({ field: warehouseField, fieldState }) => (
                  <Form.Item label="Склад" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                    <Select {...warehouseField} options={resources?.warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name })) ?? []} />
                  </Form.Item>
                )} />
              </div>
              <div className="supply-line-values-grid">
                <FormNumber control={control} name={`items.${index}.quantity`} label={`Количество, ${receiptUnit || 'ед.'}`} step={1} required />
                <Controller
                  control={control}
                  name={`items.${index}.receiptUnit`}
                  render={({ field: unitField, fieldState }) => (
                    <Form.Item label="Единица по накладной" required validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                      <AutoComplete
                        {...unitField}
                        options={receiptUnitOptions}
                        placeholder="шт, флакон, л..."
                        filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
                        onChange={(value) => {
                          unitField.onChange(value);
                          setValue(
                            `items.${index}.conversionFactor`,
                            suggestConversionFactor(value, selectedProduct?.stockUnit),
                            { shouldDirty: true, shouldValidate: false },
                          );
                        }}
                      />
                    </Form.Item>
                  )}
                />
                <FormNumber
                  control={control}
                  name={`items.${index}.conversionFactor`}
                  label={`В 1 ${receiptUnit || 'ед.'}, ${stockUnit}`}
                  step={1}
                  required
                  disabled={Boolean(receiptUnit) && receiptUnit === stockUnit}
                />
                <Form.Item
                  label="Поступит на склад"
                  validateStatus={selectedProduct && !selectedProduct.stockUnit ? 'warning' : undefined}
                  help={selectedProduct && !selectedProduct.stockUnit
                    ? `В карточке нет единицы — после приёмки будет установлено «${stockUnit}».`
                    : undefined}
                >
                  <Input value={`${formatQuantity(stockQuantity)} ${stockUnit}`} disabled />
                </Form.Item>
              </div>
              <div className="supply-line-values-grid">
                <FormNumber control={control} name={`items.${index}.purchasePrice`} label={`Цена за 1 ${receiptUnit || 'ед.'} по накладной`} step={1} required />
                <FormNumber
                  control={control}
                  name={`items.${index}.retailPrice`}
                  label={`Цена продажи за 1 ${selectedProduct?.billingUnit || selectedProduct?.writeOffUnit || stockUnit}`}
                  step={1}
                  required
                />
                <FormNumber control={control} name={`items.${index}.discountAmount`} label="Скидка по позиции" />
                <FormText control={control} name={`items.${index}.expiresAt`} label="Годен до" type="date" />
              </div>
              <div className="supply-line-values-grid supply-line-meta-grid">
                <FormText control={control} name={`items.${index}.series`} label="Серия" />
                <FormText control={control} name={`items.${index}.rack`} label="Стеллаж" />
                <FormText control={control} name={`items.${index}.rackNumber`} label="Номер стеллажа" />
                <FormText control={control} name={`items.${index}.shelfNumber`} label="Полка" />
              </div>
              <Typography.Text type="secondary" className="supply-price-note">
                Цена продажи после проведения станет новой ценой выбранного товара во всей CRM.
              </Typography.Text>
            </div>;
          })}
          <Button icon={<PlusOutlined />} onClick={() => append(emptySupplyLine(defaultWarehouseId))}>Добавить позицию</Button>
          <Typography.Text strong>Итого: {formatMoney(watchedItems.reduce((total, item) => total + Number(item?.quantity ?? 0) * Number(item?.purchasePrice ?? 0) - Number(item?.discountAmount ?? 0), 0))}</Typography.Text>
        </Space>
      </Form>
    </Modal>
    <SupplierModal open={supplierOpen} onClose={() => setSupplierOpen(false)} onSaved={(supplier) => setValue('supplierId', supplier.id, { shouldValidate: true })} />
    </>
  );
}

function emptySupplyLine(warehouseId: string): SupplyFormValues['items'][number] {
  return { productId: '', warehouseId, quantity: 1, receiptUnit: '', conversionFactor: 1, purchasePrice: 0, retailPrice: 0, discountAmount: 0, expiresAt: '', series: '', rack: '', rackNumber: '', shelfNumber: '' };
}

function getSupplyFormValues(invoice: SupplyInvoice | null | undefined, warehouseId: string): SupplyFormValues {
  if (!invoice) {
    return { supplierId: '', number: '', suppliedAt: toDateInput(new Date()), items: [emptySupplyLine(warehouseId)] };
  }
  return {
    supplierId: invoice.supplierId ?? '',
    number: invoice.number ?? '',
    suppliedAt: invoice.suppliedAt.slice(0, 10),
    items: invoice.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      warehouseId: item.warehouseId,
      quantity: Number(item.receiptQuantity ?? item.quantity),
      receiptUnit: item.receiptUnit || item.product?.stockUnit || 'шт',
      conversionFactor: Number(item.conversionFactor ?? 1),
      purchasePrice: Number(item.purchasePrice),
      retailPrice: Number(item.product?.retailPrice ?? 0),
      discountAmount: Number(item.discountAmount),
      expiresAt: item.expiresAt?.slice(0, 10) ?? '',
      series: item.series ?? '',
      rack: item.stockBatch?.rack ?? '',
      rackNumber: item.stockBatch?.rackNumber ?? '',
      shelfNumber: item.stockBatch?.shelfNumber ?? '',
    })),
  };
}

function formatProductOption(product: Product) {
  const code = product.sku || product.barcode || product.gtin;
  return code ? `${product.title} · ${code}` : product.title;
}

function suggestConversionFactor(receiptUnit: string, stockUnit?: string | null) {
  const receipt = normalizeUnit(receiptUnit);
  const stock = normalizeUnit(stockUnit ?? '');
  if (!receipt || !stock || receipt === stock) return 1;
  if ((receipt === 'л' || receipt === 'литр') && (stock === 'мл' || stock === 'миллилитр')) return 1000;
  if ((receipt === 'кг' || receipt === 'килограмм') && (stock === 'г' || stock === 'грамм')) return 1000;
  if ((receipt === 'мл' || receipt === 'миллилитр') && (stock === 'л' || stock === 'литр')) return 0.001;
  if ((receipt === 'г' || receipt === 'грамм') && (stock === 'кг' || stock === 'килограмм')) return 0.001;
  return 1;
}

function normalizeUnit(value: string) {
  return value.trim().toLocaleLowerCase('ru-RU').replace(/\.$/, '');
}

function formatQuantity(value: number) {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(value);
}

function formatSupplyInvoiceQuantity(item: SupplyInvoice['items'][number]) {
  const receiptQuantity = Number(item.receiptQuantity ?? item.quantity);
  const receiptUnit = item.receiptUnit || item.product?.stockUnit || 'ед.';
  const stockQuantity = Number(item.quantity);
  const stockUnit = item.product?.stockUnit || receiptUnit;
  const converted = receiptUnit !== stockUnit || Number(item.conversionFactor ?? 1) !== 1;
  return converted
    ? `${formatQuantity(receiptQuantity)} ${receiptUnit} → ${formatQuantity(stockQuantity)} ${stockUnit}`
    : `${formatQuantity(receiptQuantity)} ${receiptUnit}`;
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
  step = 1,
  help,
  required = false,
  disabled = false,
}: {
  control: any;
  name: string;
  label: string;
  step?: number;
  help?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item label={label} required={required} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message ?? help}>
          <InputNumber
            className="full-width"
            min={0}
            step={step}
            disabled={disabled}
            value={field.value}
            onBlur={field.onBlur}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(value) => field.onChange(value ?? undefined)}
          />
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

function formatProductUnits(product: Product) {
  const stockUnit = product.stockUnit || 'шт';
  const writeOffUnit = product.writeOffUnit || stockUnit;
  if (stockUnit === writeOffUnit) {
    return `Склад и списание: ${stockUnit}`;
  }
  return `Склад: ${stockUnit}; списание: 1 ${stockUnit} = ${product.packageQuantity || '?'} ${writeOffUnit}`;
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
