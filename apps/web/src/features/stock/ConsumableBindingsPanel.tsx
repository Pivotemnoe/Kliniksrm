import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Collapse, Form, Input, Modal, Select, Space, Tabs, Tag, Typography } from 'antd';
import { useDeferredValue, useEffect, useState } from 'react';
import { apiRequest } from '../../api/client';
import { getErrorMessage } from '../../api/errors';
import { InputNumber } from '../../shared/ui/DecimalInputNumber';
import { InfiniteTable, ProgressiveTable, useInfiniteListQuery } from '../../shared/ui/InfiniteTable';
import { listProducts, listServices } from './stock.api';
import { Product, ServiceItem } from './types';
import { SyringeRuleSettings } from './SyringeRuleSettings';

type Kind = 'SERVICE' | 'PRODUCT';
type Source = (Product | ServiceItem) & { consumableRules?: Array<{ rule: { id: string; code: string; title: string; inputKind: string } }> };
type Amount = { productId: string; quantity: number };
type BindingInput = { targetKind: Kind; targetIds: string[]; items: Amount[]; mode: 'MERGE' | 'REPLACE'; previewToken?: string };
type Preview = { previewToken: string; changes: Array<{ id: string; title: string; before: Array<Amount & { title: string; unit: string }>; after: Array<Amount & { title: string; unit: string }>; sharedSets: string[] }> };
type MaterialSet = { id: string; title: string; updatedAt: string; options: Array<Amount & { product: Product }>; services: Array<{ serviceId: string; service: ServiceItem }>; products: Array<{ productId: string; product: Product }> };
const endpoint = '/v1/stock';

export function ConsumableBindingsPanel({ canManage, initialTab }: { canManage: boolean; initialTab?: string }) {
  return <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    <Alert type="info" showIcon message="Расходники списываются автоматически" description="Норма — на 1 единицу услуги или товара. Повторно клиенту не начисляются." />
    <Collapse size="small" items={[{ key: 'help', label: 'Как работают нормы и единицы', children: <Typography.Paragraph style={{ margin: 0 }}>Изменение настроек не пересчитывает выполненные операции. Для панели исследований привязывайте диск к услуге панели, а не к каждому показателю. Количество задаётся в единицах списания товара; пересчёт упаковки настраивается в его карточке. Общий набор меняется сразу у всех подключённых позиций для новых выполнений.</Typography.Paragraph> }]} />
    <Tabs defaultActiveKey={initialTab ?? 'services'} destroyOnHidden items={[
      { key: 'services', label: 'К услугам', children: <BindingSources key="service" kind="SERVICE" canManage={canManage} /> },
      { key: 'products', label: 'К товарам', children: <BindingSources key="product" kind="PRODUCT" canManage={canManage} /> },
      { key: 'sets', label: 'Общие наборы', children: <MaterialSets canManage={canManage} /> },
      { key: 'syringes', label: 'Шприцы по объёму', children: <SyringeRuleSettings canManage={canManage} /> },
    ]} />
  </Space>;
}
function BindingSources({ kind, canManage }: { kind: Kind; canManage: boolean }) {
  const [search, setSearch] = useState(''); const deferred = useDeferredValue(search.trim());
  const [editing, setEditing] = useState<Source[] | null>(null);
  const query = useInfiniteListQuery<Source>({ queryKey: ['stock', 'binding-sources', kind, deferred], queryFn: async ({ limit, offset }) => kind === 'SERVICE' ? listServices({ search: deferred || undefined, limit, offset }) : listProducts({ search: deferred || undefined, limit, offset }) });
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Space wrap><Input allowClear aria-label="Поиск привязок" value={search} onChange={e => setSearch(e.target.value)} placeholder={kind === 'SERVICE' ? 'Найти услугу во всём каталоге' : 'Найти товар во всём каталоге'} style={{ width: 320, maxWidth: '100%' }} />{canManage && <Button type="primary" onClick={() => setEditing([])}>Настроить для нескольких</Button>}</Space>
    <InfiniteTable<Source> rowKey="id" query={query} scroll={{ x: 760 }} columns={[
      { title: kind === 'SERVICE' ? 'Услуга' : 'Основной товар', dataIndex: 'title', width: 260 },
      { title: 'Прямые расходники на 1 единицу', render: (_, row) => row.linkedProducts?.length ? row.linkedProducts.map(link => <div key={link.id}>{link.product.title}: {link.minDoseMl != null ? `по объёму (${link.minDoseMl}–${link.maxDoseMl} мл)` : `${link.quantity} ${link.product.writeOffUnit ?? link.product.stockUnit ?? ''}`}</div>) : 'Не настроены' },
      { title: 'Общие правила', render: (_, row) => row.consumableRules?.length ? row.consumableRules.map(link => <Tag key={link.rule.id}>{link.rule.title}</Tag>) : '—' },
      ...(canManage ? [{ title: 'Действие', width: 130, render: (_: unknown, row: Source) => <Button onClick={() => setEditing([row])}>Настроить</Button> }] : []),
    ]} />
    {editing && <BindingEditor kind={kind} initial={editing} onClose={() => setEditing(null)} />}
  </Space>;
}
function CatalogPicker({ id, kind, value = [], onChange, initial = [], materials = false }: { id?: string; kind: Kind; value?: string[]; onChange?: (ids: string[]) => void; initial?: Source[]; materials?: boolean }) {
  const [search, setSearch] = useState(''); const deferred = useDeferredValue(search.trim());
  const [cache, setCache] = useState<Map<string, Source>>(() => new Map(initial.map(row => [row.id, row])));
  const query = useQuery({ queryKey: ['stock', 'binding-picker', kind, deferred], queryFn: async () => kind === 'SERVICE' ? listServices({ search: deferred || undefined, limit: 50 }) : listProducts({ search: deferred || undefined, limit: 50 }) });
  useEffect(() => { if (query.data) setCache(previous => new Map([...previous, ...query.data.items.map(row => [row.id, row] as [string, Source])])); }, [query.data]);
  const rows = query.data?.items ?? [];
  return <><Select id={id} aria-label={materials ? 'Расходный товар' : kind === 'SERVICE' ? 'Выбор услуг' : 'Выбор основных товаров'} mode="multiple" showSearch filterOption={false} onSearch={setSearch} value={value} onChange={onChange} loading={query.isFetching} labelRender={({ value, label }) => cache.get(String(value))?.title ?? label ?? String(value)} maxTagCount="responsive" style={{ width: '100%' }} placeholder={kind === 'SERVICE' ? 'Найдите и выберите услуги' : 'Найдите и выберите товары'} options={rows.map(row => ({ value: row.id, label: row.title + (materials && 'stockUnit' in row ? ` · ${row.writeOffUnit ?? row.stockUnit ?? 'единица не задана'}` : '') }))} />{query.error && <Typography.Text type="danger">{getErrorMessage(query.error)}</Typography.Text>}</>;
}
function AmountsEditor({ initialProducts = [] }: { initialProducts?: Product[] }) {
  return <Form.List name="items">{(fields, { add, remove }) => <Space direction="vertical" style={{ width: '100%' }}>
    {fields.map(field => <Card key={field.key} size="small">
      <Form.Item name={[field.name, 'productId']} label="Расходный товар" rules={[{ required: true, message: 'Выберите товар' }]}><SingleMaterial initial={initialProducts} /></Form.Item>
      <Space wrap align="start"><Form.Item name={[field.name, 'quantity']} label="Количество на 1 единицу" rules={[{ required: true, message: 'Укажите норму' }]}><InputNumber min={0.001} max={999999} precision={3} step={0.1} /></Form.Item><Button danger onClick={() => remove(field.name)}>Убрать</Button></Space>
    </Card>)}
    <Button onClick={() => add({ quantity: 1 })} disabled={fields.length >= 20}>Добавить расходник</Button>
    <Typography.Text type="secondary">Указывайте количество в единицах списания товара: шт., мл, тест. Если набор рассчитан на несколько тестов, настройте пересчёт упаковки в карточке товара.</Typography.Text>
  </Space>}</Form.List>;
}
function SingleMaterial({ id, value, onChange, initial }: { id?: string; value?: string; onChange?: (id: string) => void; initial: Product[] }) {
  return <CatalogPicker id={id} kind="PRODUCT" materials value={value ? [value] : []} initial={initial} onChange={ids => onChange?.(ids.at(-1) ?? '')} />;
}
function BindingEditor({ kind, initial, onClose }: { kind: Kind; initial: Source[]; onClose: () => void }) {
  const [form] = Form.useForm<BindingInput>(); const client = useQueryClient(); const { message } = App.useApp();
  const [review, setReview] = useState<{ input: BindingInput; data: Preview }>();
  const preview = useMutation({ mutationFn: (input: BindingInput) => apiRequest<Preview>(endpoint + '/consumable-bindings/preview', { method: 'POST', body: input }), onSuccess: (data, input) => setReview({ data, input }) });
  const apply = useMutation({ mutationFn: () => apiRequest(endpoint + '/consumable-bindings', { method: 'PATCH', body: { ...review!.input, previewToken: review!.data.previewToken } }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['stock'] }); message.success('Привязки сохранены для новых выполнений'); onClose(); } });
  const materials = initial.flatMap(row => row.linkedProducts?.map(link => link.product) ?? []);
  const amounts = initial[0]?.linkedProducts?.filter(link => link.minDoseMl == null).map(link => ({ productId: link.productId, quantity: Number(link.quantity) })) ?? [];
  const describe = (rows: Preview['changes'][0]['after']) => rows.length ? rows.map(row => `${row.title}: ${row.quantity} ${row.unit ?? ''}`).join('; ') : 'Нет прямых расходников';
  return <Modal open width={900} title={review ? 'Проверьте изменения привязок' : 'Привязка расходников'} onCancel={onClose} footer={review ? <Space><Button onClick={() => { setReview(undefined); apply.reset(); }}>Назад к настройке</Button><Button type="primary" loading={apply.isPending} onClick={() => apply.mutate()}>Применить к {review.data.changes.length} позициям</Button></Space> : <Space><Button onClick={onClose}>Отмена</Button><Button type="primary" loading={preview.isPending} onClick={() => form.submit()}>Проверить изменения</Button></Space>}>
    {[preview.error, apply.error].filter(Boolean).map((error, i) => <Alert key={i} type="error" showIcon message={getErrorMessage(error)} />)}
    {review ? <><Alert type="info" message="Выполненные списания сохранят свои нормы. Общие наборы и шприцы по объёму не меняются." /><ProgressiveTable rowKey="id" size="small" scroll={{ x: 760 }} dataSource={review.data.changes} columns={[{ title: 'Позиция', dataIndex: 'title' }, { title: 'Было', render: (_, row) => describe(row.before) }, { title: 'Станет', render: (_, row) => describe(row.after) }, { title: 'Сохраняются общие правила', render: (_, row) => row.sharedSets.join(', ') || '—' }]} /></> : <Form form={form} layout="vertical" initialValues={{ targetIds: initial.map(row => row.id), mode: initial.length ? 'REPLACE' : 'MERGE', items: amounts }} onFinish={input => preview.mutate({ ...input, targetKind: kind })}>
      <Form.Item name="targetIds" label={kind === 'SERVICE' ? 'Услуги' : 'Основные товары'} rules={[{ required: true, type: 'array', min: 1, max: 100, message: 'Выберите от 1 до 100 позиций' }]}><CatalogPicker kind={kind} initial={initial} /></Form.Item>
      <Form.Item name="mode" label="Как применить"><Select options={[{ value: 'MERGE', label: 'Добавить расходники и заменить нормы совпадающих товаров' }, { value: 'REPLACE', label: 'Заменить весь прямой состав выбранных позиций' }]} /></Form.Item>
      <AmountsEditor initialProducts={materials} />
    </Form>}
  </Modal>;
}
function MaterialSets({ canManage }: { canManage: boolean }) {
  const client = useQueryClient(); const { modal, message } = App.useApp(); const [editing, setEditing] = useState<MaterialSet | 'new'>();
  const query = useQuery({ queryKey: ['stock', 'consumable-sets'], queryFn: () => apiRequest<MaterialSet[]>(endpoint + '/consumable-sets') });
  const archive = useMutation({ mutationFn: (set: MaterialSet) => apiRequest(endpoint + `/consumable-sets/${set.id}/archive`, { method: 'POST', body: { expectedUpdatedAt: set.updatedAt } }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['stock'] }); message.success('Набор отключён для новых выполнений'); } });
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Typography.Paragraph>Настройте состав один раз и подключите к нескольким услугам или товарам. Совпадающие прямые привязки заменяются набором; остальные расходники сохраняются. Шприцы по объёму настраиваются в отдельной вкладке.</Typography.Paragraph>
    {canManage && <Button type="primary" onClick={() => setEditing('new')}>Создать общий набор</Button>}
    {[query.error, archive.error].filter(Boolean).map((error, i) => <Alert key={i} type="error" message={getErrorMessage(error)} />)}
    <ProgressiveTable rowKey="id" scroll={{ x: 760 }} loading={query.isLoading} dataSource={query.data ?? []} columns={[
      { title: 'Набор', dataIndex: 'title' }, { title: 'Состав на 1 единицу', render: (_, set) => set.options.map(item => <div key={item.productId}>{item.product.title}: {item.quantity} {item.product.writeOffUnit ?? item.product.stockUnit}</div>) },
      { title: 'Применяется к', render: (_, set) => [...set.services.map(link => link.service.title), ...set.products.map(link => link.product.title)].join('; ') || 'Пока не подключён' },
      ...(canManage ? [{ title: 'Действия', render: (_: unknown, set: MaterialSet) => <Space wrap><Button onClick={() => setEditing(set)}>Изменить</Button><Button danger onClick={() => modal.confirm({ title: `Отключить набор «${set.title}»?`, content: `Для новых выполнений перестанет применяться к ${set.services.length} услугам и ${set.products.length} товарам. Старые списания сохранятся.`, okText: 'Отключить', cancelText: 'Отмена', onOk: () => archive.mutateAsync(set) })}>Отключить</Button></Space> }] : []),
    ]} />
    {editing && <SetEditor initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)} />}
  </Space>;
}
function SetEditor({ initial, onClose }: { initial?: MaterialSet; onClose: () => void }) {
  const [form] = Form.useForm(); const client = useQueryClient(); const { message } = App.useApp();
  const save = useMutation({ mutationFn: (input: unknown) => apiRequest(endpoint + '/consumable-sets' + (initial ? '/' + initial.id : ''), { method: initial ? 'PATCH' : 'POST', body: input }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['stock'] }); message.success('Общий набор сохранён'); onClose(); } });
  return <Modal open width={760} title={initial ? `Общий набор: ${initial.title}` : 'Новый общий набор'} onCancel={onClose} onOk={() => form.submit()} okText="Сохранить набор" confirmLoading={save.isPending}>
    <Alert type="info" showIcon message="Состав изменится у всех выбранных услуг и товаров для новых выполнений. Уже выполненные списания останутся прежними." />
    {save.error && <Alert type="error" showIcon message={getErrorMessage(save.error)} />}
    <Form form={form} layout="vertical" initialValues={{ title: initial?.title ?? '', items: initial?.options.map(item => ({ productId: item.productId, quantity: Number(item.quantity) })) ?? [{ quantity: 1 }], serviceIds: initial?.services.map(link => link.serviceId) ?? [], productIds: initial?.products.map(link => link.productId) ?? [] }} onFinish={input => save.mutate({ ...input, ...(initial ? { expectedUpdatedAt: initial.updatedAt } : {}) })}>
      <Form.Item name="title" label="Название набора" rules={[{ required: true, min: 2, max: 160 }]}><Input placeholder="Например, расходники для исследования на анализаторе" /></Form.Item>
      <Form.Item name="serviceIds" label="Подключить к услугам"><CatalogPicker kind="SERVICE" initial={initial?.services.map(link => link.service)} /></Form.Item>
      <Form.Item name="productIds" label="Подключить к основным товарам"><CatalogPicker kind="PRODUCT" initial={initial?.products.map(link => link.product)} /></Form.Item>
      <AmountsEditor initialProducts={initial?.options.map(item => item.product)} />
    </Form>
  </Modal>;
}
