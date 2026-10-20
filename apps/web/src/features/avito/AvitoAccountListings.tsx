import { useState } from 'react';
import { InfiniteData, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { ExportOutlined, ReloadOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../../api/errors';
import { formatDateTime } from '../../shared/utils/date';
import { avitoApi, AvitoListing, AvitoListingInventory, AvitoSettings, directionLabels } from './avito.api';

const inventoryKey = ['avito', 'saved-listings'];
const statusLabels: Record<string, string> = { active: 'Опубликовано', old: 'Истёк срок размещения', removed: 'Снято с размещения', blocked: 'Заблокировано', rejected: 'Отклонено' };

export function useAvitoAccountListings() {
  return useInfiniteQuery({
    queryKey: inventoryKey,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const saved = await avitoApi.savedListings(pageParam);
      // The initial view is always local. Further pages are fetched only on request.
      return pageParam === 1 || saved.capturedAt ? saved : avitoApi.listings('all', pageParam);
    },
    getNextPageParam: page => page.nextPage ?? undefined,
    staleTime: 60000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function avitoListingUrl(raw: string | null) {
  try {
    const url = new URL(raw ?? '');
    return url.protocol === 'https:' && ['avito.ru', 'www.avito.ru'].includes(url.hostname) && !url.username && !url.password && (!url.port || url.port === '443') ? url.toString() : null;
  } catch { return null; }
}

type Props = {
  settings?: AvitoSettings;
  selectedId?: string;
  onChoose?: (listing: AvitoListing) => void;
  onOpenDraft?: (id: string) => void;
  drafts?: { id: string; sourceListingId: string | null }[];
};

export function AvitoAccountListings({ settings, selectedId, onChoose, onOpenDraft, drafts = [] }: Props) {
  const query = useAvitoAccountListings(); const client = useQueryClient();
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('');
  const refresh = useMutation({
    mutationFn: () => avitoApi.listings('all', 1),
    onSuccess: result => client.setQueryData<InfiniteData<AvitoListingInventory, number>>(inventoryKey, { pages: [result], pageParams: [1] }),
  });
  const pages = query.data?.pages ?? [];
  const items = [...new Map(pages.flatMap(page => page.items).map(item => [item.id, item])).values()];
  const filtered = items.filter(item => (!status || item.status === status) && `${item.title} ${item.id}`.toLocaleLowerCase('ru-RU').includes(search.trim().toLocaleLowerCase('ru-RU')));
  const capturedAt = pages[0]?.capturedAt;
  const refreshError = refresh.error ? getErrorMessage(refresh.error) : pages.find(page => page.refreshError)?.refreshError;
  return <Card title="Мои объявления Авито" extra={<Button icon={<ReloadOutlined />} loading={refresh.isPending} onClick={() => refresh.mutate()}>Обновить из Авито</Button>}>
    <Space direction="vertical" size={12} className="full-width">
      <Typography.Text type="secondary">{query.isLoading ? 'Открываем сохранённый список CRM…' : capturedAt ? `Список сохранён в CRM. Последнее обновление с Авито: ${formatDateTime(capturedAt)}.` : 'Список ещё не сохранён. Нажмите «Обновить из Авито», когда есть связь с интернетом.'} Черновики и загруженные в них фотографии хранятся на сервере клиники.</Typography.Text>
      {refreshError && <Alert type="warning" showIcon message="Не удалось обновить список из Авито" description={`${refreshError} Сохранённые объявления и черновики доступны для работы.`} />}
      {query.isError && <Alert type="error" showIcon message={getErrorMessage(query.error)} />}
      <Space wrap>
        <Input.Search aria-label="Найти объявление Авито" placeholder="Название или номер объявления" value={search} onChange={event => setSearch(event.target.value)} allowClear style={{ width: 300 }} />
        <Select aria-label="Статус объявления Авито" value={status} onChange={setStatus} style={{ width: 230 }} options={[{ value: '', label: 'Все состояния' }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))]} />
      </Space>
      <Table<AvitoListing> rowKey="id" dataSource={filtered} loading={query.isLoading} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 850 }} rowClassName={item => item.id === selectedId ? 'ant-table-row-selected' : ''} locale={{ emptyText: <Empty description={items.length ? 'По этому запросу объявлений нет' : 'Здесь появятся опубликованные и неактивные объявления вашего аккаунта'} /> }} columns={[
        { title: 'Объявление', key: 'listing', render: (_, item) => <Space direction="vertical" size={0}><Typography.Text strong>{item.title || 'Без названия'}</Typography.Text><Typography.Text type="secondary">№ {item.id}</Typography.Text></Space> },
        { title: 'Состояние в Авито', dataIndex: 'status', render: value => <Tag color={value === 'active' ? 'green' : 'default'}>{statusLabels[value] || value}</Tag> },
        { title: 'Помощник', key: 'bot', render: (_, item) => { const rule = settings?.listings.find(row => row.id === item.id); const enabled = rule?.enabled && settings?.profiles.some(profile => profile.direction === rule.direction && profile.enabled); return <Tag color={enabled ? 'blue' : 'default'}>{enabled ? directionLabels[rule!.direction] : 'Не подключён'}</Tag>; } },
        { title: 'Просмотр и подготовка', key: 'actions', render: (_, item) => { const url = avitoListingUrl(item.url); const existing = drafts.find(draft => draft.sourceListingId === item.id); return <Space wrap>{url && <Button icon={<ExportOutlined />} href={url} target="_blank" rel="noopener noreferrer">Открыть на Авито</Button>}{existing && onOpenDraft ? <Button onClick={() => onOpenDraft(existing.id)}>Открыть черновик</Button> : onChoose && <Button onClick={() => onChoose(item)}>Выбрать для черновика</Button>}</Space>; } },
      ]} />
      {query.hasNextPage && <Button loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>Ещё объявления</Button>}
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>Полный оригинал с текстом и фотографиями открывается кнопкой «Открыть на Авито». Подготовленные тексты и фотографии смотрите в черновике CRM — с ними можно работать без интернета.</Typography.Paragraph>
    </Space>
  </Card>;
}
