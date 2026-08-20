import { DeleteOutlined, DownOutlined, EditOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Dropdown, Space, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { InfiniteTable, useInfiniteListQuery } from '../../shared/ui/InfiniteTable';
import { LiveSearchInput } from '../../shared/ui/LiveSearchInput';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatMoney } from '../../shared/utils/money';
import { StoreLabelPrinter, toStorePrintableItem, type StorePrintLine } from './StoreLabelPrinter';
import { StoreProductImporter } from './StoreProductImporter';
import { StoreProductModal } from './StoreProductModal';
import { deleteStoreProduct, getStoreResources, listStoreProducts } from './store.api';
import type { StoreProduct } from './types';

export function StorePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'store.manage');
  const activeTab = location.pathname.startsWith('/store/labels') ? 'labels' : 'products';
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<StoreProduct | null>(null);
  const [printLines, setPrintLines] = useState<StorePrintLine[]>([]);
  const resourcesQuery = useQuery({ queryKey: ['store', 'resources'], queryFn: getStoreResources });
  const productsQuery = useInfiniteListQuery({
    queryKey: ['store', 'products', { search }],
    queryFn: ({ limit, offset }) => listStoreProducts({ search: search || undefined, limit, offset }),
    enabled: activeTab === 'products',
  });
  const deleteMutation = useMutation({
    mutationFn: deleteStoreProduct,
    onSuccess: async (deleted) => {
      await queryClient.invalidateQueries({ queryKey: ['store', 'products'] });
      setPrintLines((lines) => lines.filter((line) => line.item.sourceId !== deleted.id));
      message.success(`Товар «${deleted.title}» удалён из магазина`);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  async function refreshProducts() {
    await queryClient.invalidateQueries({ queryKey: ['store', 'products'] });
  }

  function openPrint(product: StoreProduct) {
    const item = toStorePrintableItem(product);
    setPrintLines((lines) => lines.some((line) => line.item.key === item.key) ? lines : [...lines, { item, copies: 1 }]);
    navigate('/store/labels');
  }

  function confirmDelete(product: StoreProduct) {
    modal.confirm({
      title: `Удалить товар «${product.title}» из магазина?`,
      content: 'Удаление касается только отдельного каталога магазина и не изменяет данные клиники.',
      okText: 'Удалить',
      okButtonProps: { danger: true },
      cancelText: 'Отмена',
      onOk: () => deleteMutation.mutateAsync(product.id),
    });
  }

  return (
    <div className="page store-page">
      <PageHeader
        title="Магазин"
        description="Отдельный каталог магазина. Он не участвует в товарах, услугах, складе и финансах клиники."
        extra={canManage && activeTab === 'products' ? (
          <Space wrap>
            <Button icon={<PlusOutlined />} type="primary" onClick={() => {
              setEditingProduct(null);
              setModalOpen(true);
            }}>Добавить товар</Button>
            <StoreProductImporter onSaved={refreshProducts} />
          </Space>
        ) : null}
      />
      <div className="list-panel">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => navigate(key === 'labels' ? '/store/labels' : '/store/products')}
          items={[
            {
              key: 'products',
              label: 'Товары магазина',
              children: (
                <Space direction="vertical" size={14} className="full-width">
                  <div className="list-panel-header">
                    <LiveSearchInput allowClear placeholder="Название, категория, артикул или штрих-код" className="search-input" onSearch={(value) => setSearch(value.trim())} />
                  </div>
                  <StoreProductsTable query={productsQuery} canManage={canManage} onEdit={(product) => {
                    setEditingProduct(product);
                    setModalOpen(true);
                  }} onDelete={confirmDelete} onPrint={openPrint} />
                </Space>
              ),
            },
            {
              key: 'labels',
              label: 'Печать ценников и этикеток',
              children: <StoreLabelPrinter lines={printLines} onChange={setPrintLines} resources={resourcesQuery.data} />,
            },
          ]}
        />
      </div>
      <StoreProductModal open={modalOpen} product={editingProduct} onClose={() => {
        setModalOpen(false);
        setEditingProduct(null);
      }} onSaved={refreshProducts} />
    </div>
  );
}

function StoreProductsTable({ query, canManage, onEdit, onDelete, onPrint }: {
  query: ReturnType<typeof useInfiniteListQuery<StoreProduct>>;
  canManage: boolean;
  onEdit: (product: StoreProduct) => void;
  onDelete: (product: StoreProduct) => void;
  onPrint: (product: StoreProduct) => void;
}) {
  const columns = useMemo<ColumnsType<StoreProduct>>(() => [
    { title: 'Название', dataIndex: 'title', key: 'title' },
    { title: 'Категория', dataIndex: 'categoryTitle', key: 'category', render: (value) => value || '—' },
    { title: 'Цена', key: 'price', render: (_, product) => `${formatMoney(product.retailPrice)} / ${product.unit || 'шт'}` },
    { title: 'Артикул', dataIndex: 'sku', key: 'sku', render: (value) => value || '—' },
    { title: 'Штрих-код', dataIndex: 'barcode', key: 'barcode', render: (value) => value || <Tag>Нет</Tag> },
    { title: 'НДС', dataIndex: 'vatRate', key: 'vat', render: (value) => value === null ? 'Без НДС' : `${value}%` },
    {
      title: '', key: 'actions', width: 130, fixed: 'right', render: (_, product) => (
        <Dropdown trigger={['click']} menu={{
          items: [
            { key: 'print', icon: <PrinterOutlined />, label: 'Добавить в печать' },
            ...(canManage ? [
              { key: 'edit', icon: <EditOutlined />, label: 'Изменить' },
              { type: 'divider' as const },
              { key: 'delete', danger: true, icon: <DeleteOutlined />, label: 'Удалить' },
            ] : []),
          ],
          onClick: ({ key }) => {
            if (key === 'print') onPrint(product);
            if (key === 'edit') onEdit(product);
            if (key === 'delete') onDelete(product);
          },
        }}><Button size="small">Действия <DownOutlined /></Button></Dropdown>
      ),
    },
  ], [canManage, onDelete, onEdit, onPrint]);

  return (
    <>
      {query.isError ? <Typography.Text type="danger">{getErrorMessage(query.error)}</Typography.Text> : null}
      <InfiniteTable<StoreProduct> query={query} errorText={query.isError ? getErrorMessage(query.error) : undefined} rowKey="id" className="dense-table" scroll={{ x: 900 }} columns={columns} />
    </>
  );
}
