import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Card, Col, Collapse, Descriptions, Drawer, Empty, Form, Input, Popconfirm, Row, Select, Space, Statistic, Switch, Table, Tabs, Tag, Typography } from 'antd';
import { MessageOutlined, PhoneOutlined, PlusOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, getErrorMessage } from '../../api/errors';
import { useCurrentEmployee } from '../../auth/useAuth';
import { hasPermission } from '../../auth/permissions';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/utils/date';
import { avitoApi, AvitoConversation, AvitoOverview, AvitoSettings, directionLabels, Direction, Outgoing, ReadyInquiry } from './avito.api';
import './avito.css';
import { AvitoListingEditor } from './AvitoListingEditor';
import { AvitoStatusPanel } from './AvitoStatusPanel';
import { ModuleActions } from '../../shared/ui/ModuleActions';
import { ModulePublicLink, avitoPublicUrl } from '../../shared/ui/ModulePublicLink';
import { createOperationKey } from '../../shared/utils/operationKey';
import { AvitoAccountListings } from './AvitoAccountListings';

const directions = Object.entries(directionLabels).filter(([value]) => value !== 'UNASSIGNED').map(([value, label]) => ({ value, label }));
const allDirections = [{ value: '', label: 'Все направления' }, ...directions, { value: 'UNASSIGNED', label: 'Без направления' }];
const modeLabels: Record<string, string> = { MANUAL: 'Ручной', SUGGEST: 'Подсказки', AUTO: 'Автоматический', BOT: 'Помощник', HUMAN: 'Сотрудник', PAUSED: 'Пауза' };
const statusLabels: Record<string, string> = { DRAFT: 'Черновик', PENDING: 'В очереди', SENDING: 'Отправляется', SENT: 'Отправлено', UNCERTAIN: 'Нужна сверка', CANCELLED: 'Отменено', FAILED: 'Ошибка' };
const purposeLabels: Record<string, string> = { CONTACT: 'Запрос контактов', SUBMITTED: 'Передача заявки', REPLY: 'Ответ', CRM_REPLY: 'Ответ по справочникам CRM' };
const key = createOperationKey;

export function AvitoPage() {
  const { data: auth } = useCurrentEmployee(); const navigate = useNavigate();
  const [tabParams, setTabParams] = useSearchParams();
  const director = Boolean(auth?.employee.roles.includes('director') && hasPermission(auth.employee, 'avito.manage'));
  const query = useQuery({ queryKey: ['avito', 'overview'], queryFn: avitoApi.overview, retry: (attempt, error) => !(error instanceof ApiError && error.status === 404) && attempt < 2 });
  const overview = query.data;
  const unavailable = query.error instanceof ApiError && query.error.status === 404;
  const defaultTab = director && overview?.mode === 'MANUAL' ? 'editor' : 'inbox';
  const requestedTab = tabParams.get('tab') || defaultTab;
  const activeTab = !director && ['editor', 'rules', 'test', 'connection'].includes(requestedTab) ? defaultTab : requestedTab;
  const selectTab = (tab: string) => setTabParams(previous => { previous.set('tab', tab); previous.delete('conversation'); return previous; }, { replace: true });
  return <div className="page avito-page">
    <PageHeader title="Авито" description="Объявления и обращения клиентов. Для каждого направления — свои тексты и правила." extra={<ModuleActions actions={[{ key: 'refresh', label: 'Обновить', icon: <ReloadOutlined />, onClick: () => query.refetch(), loading: query.isFetching }, ...(director && !unavailable ? [{ key: 'module', label: 'Подключение модуля', icon: <SettingOutlined />, onClick: () => navigate('/settings/modules') }] : [])]} />} />
    <ModulePublicLink label="Наше объявление на Авито" href={avitoPublicUrl} />
    {unavailable ? <Card><Empty description={<Space direction="vertical"><Typography.Text strong>Модуль Авито пока не подключён</Typography.Text><Typography.Text type="secondary">После подключения серверного модуля здесь появятся переписка, заявки и объявления.</Typography.Text></Space>} /></Card> : query.isError && <Alert type="error" showIcon message={getErrorMessage(query.error)} />}
    {overview && <>
      <AvitoStatusPanel overview={overview} modeLabel={modeLabels[overview.mode]} director={director} onOpen={selectTab} />
      <Tabs activeKey={activeTab} onChange={selectTab} items={[
        { key: 'inquiries', label: 'Готовые заявки', children: <ReadyInquiries overview={overview} canOperate={hasPermission(auth?.employee, 'avito.operate')} /> },
        { key: 'inbox', label: <Space><MessageOutlined />Переписка</Space>, children: <Inbox overview={overview} canOperate={hasPermission(auth?.employee, 'avito.operate')} /> },
        { key: 'metrics', label: <Space><PhoneOutlined />Звонки и эффективность</Space>, children: <CallMetrics overview={overview} canOperate={hasPermission(auth?.employee, 'avito.operate')} /> },
        ...(director && overview.settings ? [
          { key: 'editor', label: 'Объявления и черновики', children: <AvitoListingEditor overview={overview} /> },
          { key: 'rules', label: 'Направления и ответы', children: <RulesEditor overview={overview} /> },
          { key: 'test', label: 'Проверка сценариев', children: <Simulator overview={overview} /> },
          { key: 'connection', label: 'Подключение и возможности', children: <Connection overview={overview} /> },
        ] : []),
      ]} />
    </>}
  </div>;
}

function ReadyInquiries({ overview, canOperate }: { overview: AvitoOverview; canOperate: boolean }) {
  const [direction, setDirection] = useState(''); const [cursor, setCursor] = useState<string>(); const [params, setParams] = useSearchParams();
  const selected = params.get('conversation') ?? undefined;
  const query = useQuery({ queryKey: ['avito', 'inquiries', direction, cursor], queryFn: () => avitoApi.inquiries(direction, cursor), refetchInterval: 15000 });
  const select = (id?: string) => setParams(previous => { if (id) previous.set('conversation', id); else previous.delete('conversation'); return previous; }, { replace: true });
  return <Space direction="vertical" size={16} className="full-width">
    <Alert type="info" showIcon message="Заявки для администратора" description="Здесь только сохранённые заявки с именем владельца, телефоном, сутью обращения и номером, оставленным клиентом для связи. Врач и время не назначены. Неполные обращения и вопросы, требующие человека, доступны в переписке." />
    <Space wrap><Select aria-label="Направление готовых заявок" options={[{ value: '', label: 'Все направления' }, ...directions]} value={direction} style={{ width: 230 }} onChange={value => { setDirection(value); setCursor(undefined); }} /><Button icon={<ReloadOutlined />} onClick={() => query.refetch()}>Обновить</Button></Space>
    {query.isError && <Alert type="error" message={getErrorMessage(query.error)} />}
    <Table<ReadyInquiry> rowKey="id" dataSource={query.data?.items} loading={query.isLoading} pagination={false} scroll={{ x: 1050 }} locale={{ emptyText: <Empty description="Готовых заявок пока нет" /> }} columns={[
      { title: 'Владелец и контакт', key: 'owner', render: (_, row) => <Space direction="vertical" size={2}><Button type="link" className="avito-row-link" onClick={() => select(row.conversationId)}><strong>{row.contactName}</strong></Button><Typography.Text copyable>{row.phone}</Typography.Text></Space> },
      { title: 'Источник и направление', key: 'source', render: (_, row) => <Space direction="vertical" size={2}><Tag color="blue">Авито · {directionLabels[row.direction]}</Tag><span>{row.conversation.listingTitle || row.conversation.listingId}</span></Space> },
      { title: 'Суть обращения', dataIndex: 'summary', width: 260 },
      { title: 'Контакт для связи', dataIndex: 'contactRecordedAt', render: (value, row) => <Space direction="vertical" size={2}><Tag color="green">{row.contactBasis === 'CLIENT_PROVIDED_PHONE' ? 'Клиент оставил номер' : 'Подтверждено ранее'}</Tag><span>{formatDateTime(value)}</span></Space> },
      { title: 'Статус', dataIndex: 'status', render: value => ({ NEW: 'Новая', IN_REVIEW: 'В работе', RESOLVED: 'Обработана', CANCELLED: 'Отменена' } as Record<string, string>)[value] || value },
      { title: 'Поступила', dataIndex: 'createdAt', render: formatDateTime },
    ]} />
    <Space><Button disabled={!cursor} onClick={() => setCursor(undefined)}>К началу</Button><Button disabled={!query.data?.nextCursor} onClick={() => setCursor(query.data?.nextCursor ?? undefined)}>Следующие заявки</Button></Space>
    <Drawer open={Boolean(selected)} width="min(920px, 100vw)" title="Заявка из Авито" onClose={() => select()} destroyOnHidden>{selected && <Conversation id={selected} overview={overview} canOperate={canOperate} />}</Drawer>
  </Space>;
}

function Inbox({ overview, canOperate }: { overview: AvitoOverview; canOperate: boolean }) {
  const [direction, setDirection] = useState(''); const [cursor, setCursor] = useState<string>(); const [params, setParams] = useSearchParams(); const selected = params.get('conversation') ?? undefined;
  const setSelected = (id: string | undefined) => setParams(previous => { if (id) previous.set('conversation', id); else previous.delete('conversation'); return previous; }, { replace: true });
  const query = useQuery({ queryKey: ['avito', 'conversations', direction, cursor], queryFn: () => avitoApi.conversations(direction, cursor), refetchInterval: 15000 });
  return <>
    <Space wrap className="avito-toolbar"><Select aria-label="Направление обращений" options={allDirections} value={direction} style={{ width: 230 }} onChange={v => { setDirection(v); setCursor(undefined); }} /><Button icon={<ReloadOutlined />} onClick={() => query.refetch()}>Обновить</Button></Space>
    {query.isError && <Alert type="error" message={getErrorMessage(query.error)} />}
    <Table<AvitoConversation> rowKey="id" dataSource={query.data?.items} loading={query.isLoading} pagination={false} scroll={{ x: 850 }} locale={{ emptyText: <Empty description="Обращения появятся после подключения Авито и загрузки переписки" /> }} columns={[
      { title: 'Клиент и объявление', key: 'client', render: (_, c) => <Button type="link" className="avito-row-link" onClick={() => setSelected(c.id)}><strong>{c.customerName || 'Клиент Авито'}</strong><span>{c.listingTitle || `Объявление ${c.listingId || 'не определено'}`}</span></Button> },
      { title: 'Направление', dataIndex: 'direction', render: value => directionLabels[value] || value },
      { title: 'Обработка', key: 'state', render: (_, c) => <Space direction="vertical" size={2}><Tag>{modeLabels[c.mode]}</Tag>{c.needsAttention && <Tag color="orange">Нужен сотрудник</Tag>}{c.requestId && <Tag color="blue">Заявка в CRM</Tag>}</Space> },
      { title: 'Последнее сообщение', key: 'text', render: (_, c) => <Typography.Text ellipsis style={{ maxWidth: 240 }}>{c.messages[0]?.text || (c.messages[0] ? 'Вложение' : '—')}</Typography.Text> },
      { title: 'Время', dataIndex: 'lastMessageAt', render: value => value ? formatDateTime(value) : '—' },
    ]} />
    <Space className="avito-toolbar"><Button disabled={!cursor} onClick={() => setCursor(undefined)}>К началу</Button><Button disabled={!query.data?.nextCursor} onClick={() => setCursor(query.data?.nextCursor ?? undefined)}>Следующие обращения</Button></Space>
    <Drawer open={Boolean(selected)} width="min(920px, 100vw)" title="Диалог Авито" onClose={() => setSelected(undefined)} destroyOnHidden>{selected && <Conversation id={selected} overview={overview} canOperate={canOperate} />}</Drawer>
  </>;
}

function Conversation({ id, overview, canOperate }: { id: string; overview: AvitoOverview; canOperate: boolean }) {
  const { message } = App.useApp(); const client = useQueryClient(); const navigate = useNavigate();
  const [text, setText] = useState(''); const [draft, setDraft] = useState<Outgoing>(); const [requestKey, setRequestKey] = useState(key);
  const query = useQuery({ queryKey: ['avito', 'conversation', id], queryFn: () => avitoApi.conversation(id), refetchInterval: 10000 }); const c = query.data;
  const refresh = async () => { await client.invalidateQueries({ queryKey: ['avito'] }); };
  const mode = useMutation({ mutationFn: (value: string) => avitoApi.mode(id, c!.version, value), onSuccess: refresh, onError: e => message.error(getErrorMessage(e)) });
  const send = useMutation({ mutationFn: () => avitoApi.reply(id, { clientKey: requestKey, text, version: c!.version, ...(draft ? { draftId: draft.id } : {}) }), onSuccess: async () => { setText(''); setDraft(undefined); setRequestKey(key()); await refresh(); message.success('Ответ поставлен в очередь. Результат доставки появится ниже.'); }, onError: e => message.error(getErrorMessage(e)) });
  const reconcile = useMutation({ mutationFn: avitoApi.reconcile, onSuccess: async r => { await refresh(); if (r.message) message.info(r.message); }, onError: e => message.error(getErrorMessage(e)) });
  const inquiryStatus = useMutation({ mutationFn: ({ id: inquiryId, status }: { id: string; status: string }) => avitoApi.inquiryStatus(inquiryId, status), onSuccess: refresh, onError: e => message.error(getErrorMessage(e)) });
  const newCycle = useMutation({ mutationFn: () => avitoApi.newCycle(id, c!.version), onSuccess: refresh, onError: e => message.error(getErrorMessage(e)) });
  if (!c) return query.isError ? <Alert type="error" message={getErrorMessage(query.error)} /> : null;
  const activeDrafts = c.outbox?.filter(o => o.status === 'DRAFT') ?? [];
  return <Space direction="vertical" size={16} className="full-width">
    <Descriptions column={1} size="small"><Descriptions.Item label="Направление">{directionLabels[c.direction]}</Descriptions.Item><Descriptions.Item label="Объявление">{c.listingTitle} · ID {c.listingId || 'не определён'}</Descriptions.Item><Descriptions.Item label="Управление">{modeLabels[c.mode]}{c.needsAttention && ' · требуется сотрудник'}</Descriptions.Item></Descriptions>
    <Space wrap><Button disabled={!canOperate || !overview.installation.enabled || mode.isPending} onClick={() => mode.mutate('HUMAN')}>Взять диалог</Button><Button disabled={!canOperate || !overview.installation.enabled || c.stage === 'TRANSFERRED' || mode.isPending} onClick={() => mode.mutate('BOT')}>Вернуть помощнику</Button><Button disabled={!canOperate || !overview.installation.enabled || mode.isPending} onClick={() => mode.mutate('PAUSED')}>Пауза</Button>{c.stage === 'TRANSFERRED' && <Popconfirm title="Начать новое обращение в этом диалоге?" description="Контакты и разрешение на связь для новой заявки собираются заново. Текущее обращение должно быть обработано." onConfirm={() => newCycle.mutate()}><Button disabled={!canOperate || !overview.installation.enabled} loading={newCycle.isPending}>Новое обращение</Button></Popconfirm>}</Space>
    <Typography.Text type="secondary">При ручном ответе помощник останавливается. Уже начатую отправку площадка может завершить.</Typography.Text>
    <div className="avito-thread">{c.messages.map(m => <div key={m.id} className={`avito-bubble ${m.direction === 'OUT' ? 'avito-out' : ''}`}><Typography.Text type="secondary">{m.direction === 'OUT' ? 'Ответ клиники' : 'Клиент'} · {formatDateTime(m.occurredAt)}</Typography.Text><div>{m.text || `Вложение: ${m.type}. Откройте оригинальный диалог для просмотра.`}</div></div>)}{!c.messages.length && <Empty description="Пока нет сообщений" />}</div>
    {c.inquiries.map(i => <Alert key={i.id} type="success" showIcon message={`Заявка: ${directionLabels[i.direction]}`} description={<Space direction="vertical"><span>{i.contactName} · {i.phone}</span><span>{i.summary}</span><Tag>{({ NEW: 'Новая', IN_REVIEW: 'В работе', RESOLVED: 'Обработана', CANCELLED: 'Отменена' } as Record<string, string>)[i.status]}</Tag>{i.requestId && <Button onClick={() => navigate(`/online-requests?request=${encodeURIComponent(i.requestId!)}`)}>Открыть очередь записи клиники</Button>}{i.direction !== 'CLINIC' && <span>Обращение сохранено в очереди своего направления. Операционная запись подтверждается сотрудником.</span>}{['NEW', 'IN_REVIEW'].includes(i.status) && <Space wrap><Button size="small" disabled={!canOperate} onClick={() => inquiryStatus.mutate({ id: i.id, status: 'IN_REVIEW' })}>В работу</Button><Button size="small" disabled={!canOperate} onClick={() => inquiryStatus.mutate({ id: i.id, status: 'RESOLVED' })}>Обращение обработано</Button></Space>}</Space>} />)}
    {activeDrafts.map(o => <Card key={o.id} size="small" title={`Подсказка: ${purposeLabels[o.purpose] || 'Ответ'}`} extra={<Button size="small" onClick={() => { setText(o.text); setDraft(o); setRequestKey(key()); }}>Использовать</Button>}><Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{o.text}</Typography.Paragraph></Card>)}
    <Input.TextArea aria-label="Ответ клиенту" placeholder="Ответ сотрудника или выбранная подсказка" autoSize={{ minRows: 3, maxRows: 10 }} maxLength={4000} value={text} onChange={e => setText(e.target.value)} />
    <Button type="primary" disabled={!canOperate || !text.trim() || !overview.installation.enabled || !overview.runtime.liveSendEnabled} loading={send.isPending} onClick={() => send.mutate()}>Поставить ответ в очередь</Button>
    <Collapse items={[{ key: 'outbox', label: 'Доставка и отменённые черновики', children: <Space direction="vertical" className="full-width">{c.outbox?.map(o => <Card size="small" key={o.id}><Space wrap><Tag color={o.status === 'SENT' ? 'green' : o.status === 'UNCERTAIN' ? 'orange' : 'default'}>{statusLabels[o.status] || o.status}</Tag><Typography.Text type="secondary">{formatDateTime(o.createdAt)}</Typography.Text>{o.status === 'UNCERTAIN' && <Button size="small" disabled={!canOperate} loading={reconcile.isPending} onClick={() => reconcile.mutate(o.id)}>Сверить с Авито</Button>}</Space><div className="avito-outbox-text">{o.text}</div>{o.error && <Typography.Text type="secondary">{o.error}</Typography.Text>}</Card>)}</Space> }]} />
  </Space>;
}

function CallMetrics({ overview, canOperate }: { overview: AvitoOverview; canOperate: boolean }) {
  const { message } = App.useApp(); const client = useQueryClient(); const [direction, setDirection] = useState(''); const [form] = Form.useForm(); const [requestKey, setRequestKey] = useState(key);
  const query = useQuery({ queryKey: ['avito', 'metrics', direction], queryFn: () => avitoApi.metrics(direction), refetchInterval: 30000 });
  const call = useMutation({ mutationFn: (v: { direction: Direction; occurredAt: string; missed: boolean; note?: string }) => avitoApi.call({ ...v, clientKey: requestKey, occurredAt: new Date(v.occurredAt).toISOString() }), onSuccess: async () => { setRequestKey(key()); form.resetFields(); await client.invalidateQueries({ queryKey: ['avito', 'metrics'] }); message.success('Звонок учтён как отдельное обращение'); }, onError: e => message.error(getErrorMessage(e)) });
  const m = query.data;
  return <Space direction="vertical" size={16} className="full-width">
    <Select aria-label="Направление статистики" options={allDirections.filter(o => o.value !== 'UNASSIGNED')} value={direction} onChange={setDirection} style={{ width: 230 }} />
    {query.isError && <Alert type="error" message={getErrorMessage(query.error)} />}
    <Row gutter={[16, 16]}>{[['Диалоги', m?.conversations], ['Звонки', m?.calls], ['Заявки', m?.inquiries], ['Подтверждённые записи клиники', m?.confirmedClinicAppointments], ['Ожидают сотрудника', m?.attention]].map(([title, value]) => <Col xs={24} sm={12} lg={8} key={String(title)}><Card><Statistic title={title} value={value ?? '—'} /></Card></Col>)}</Row>
    <Typography.Paragraph type="secondary">Показатели за всё время. Диалог, звонок, заявка и подтверждённая запись считаются отдельно; сумма диалогов и звонков не означает число уникальных людей.</Typography.Paragraph>
    <Card title="Был звонок с Авито"><Form form={form} layout="vertical" initialValues={{ direction: 'CLINIC', missed: false }} onFinish={values => call.mutate(values)}>
      <Row gutter={16}><Col xs={24} md={8}><Form.Item name="direction" label="Направление" rules={[{ required: true }]}><Select options={directions} /></Form.Item></Col><Col xs={24} md={8}><Form.Item name="occurredAt" label="Когда звонили" rules={[{ required: true, message: 'Укажите время звонка' }]}><Input type="datetime-local" /></Form.Item></Col><Col xs={24} md={8}><Form.Item name="missed" label="Пропущенный звонок" valuePropName="checked"><Switch /></Form.Item></Col></Row>
      <Form.Item name="note" label="Примечание"><Input maxLength={1000} placeholder="Например, запрос на первичный приём" /></Form.Item><Button type="primary" htmlType="submit" disabled={!canOperate || !overview.installation.enabled} loading={call.isPending}>Учесть звонок</Button>
    </Form></Card>
    <Table rowKey="id" dataSource={m?.recentCalls} pagination={false} scroll={{ x: 650 }} columns={[{ title: 'Время', dataIndex: 'occurredAt', render: formatDateTime }, { title: 'Направление', dataIndex: 'direction', render: d => directionLabels[d] }, { title: 'Звонок', dataIndex: 'missed', render: v => v ? 'Пропущен' : 'Принят' }, { title: 'Примечание', dataIndex: 'note' }]} />
  </Space>;
}

const templateLabels: Record<keyof AvitoSettings['templates'], string> = { contact: 'Общий запрос контактов', contactName: 'Если нужно имя', contactPhone: 'Если нужен телефон', submitted: 'Заявка сохранена', medical: 'Граница медицинского вопроса', urgent: 'Срочная связь', unknown: 'Нет утверждённого ответа' };
function RulesEditor({ overview }: { overview: AvitoOverview }) {
  const { message } = App.useApp(); const client = useQueryClient();
  const [draft, setDraft] = useState<AvitoSettings>(structuredClone(overview.settings!)); const [version, setVersion] = useState(overview.settingsVersion); const [dirty, setDirty] = useState(false); const [direction, setDirection] = useState<Direction>('CLINIC');
  useEffect(() => { if (!dirty) { setDraft(structuredClone(overview.settings!)); setVersion(overview.settingsVersion); } }, [overview.settingsVersion, overview.settings, dirty]);
  useEffect(() => { if (!dirty) return; const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', protect); return () => window.removeEventListener('beforeunload', protect); }, [dirty]);
  const edit = (v: AvitoSettings) => { setDraft(v); setDirty(true); };
  const profile = draft.profiles.find(p => p.direction === direction)!;
  const patchProfile = (patch: Partial<typeof profile>) => edit({ ...draft, profiles: draft.profiles.map(p => p.direction === direction ? { ...p, ...patch } : p) });
  const nightTariff = draft.nightTariff ?? { enabled: false, startsAt: '20:00', endsAt: '08:00', multiplier: 2 };
  const patchNightTariff = (patch: Partial<typeof nightTariff>) => edit({ ...draft, nightTariff: { ...nightTariff, ...patch } });
  const save = useMutation({ mutationFn: () => avitoApi.settings(version, draft), onSuccess: async () => { setDirty(false); await client.invalidateQueries({ queryKey: ['avito'] }); message.success('Правила сохранены новой версией'); }, onError: e => message.error(getErrorMessage(e)) });
  const revisions = useQuery({ queryKey: ['avito', 'revisions'], queryFn: avitoApi.revisions });
  const restore = useMutation({ mutationFn: (v: number) => avitoApi.restore(v, overview.settingsVersion), onSuccess: async () => { setDirty(false); await client.invalidateQueries({ queryKey: ['avito'] }); message.success('Версия восстановлена в режиме подсказок'); }, onError: e => message.error(getErrorMessage(e)) });
  return <Space direction="vertical" size={16} className="full-width">
    <Alert type="info" showIcon message="Объявление выбирает направление" description="Привязка задаётся директором. Цена, промпт и ответы другого направления не используются. Неизвестное объявление передаётся сотруднику." />
    <Card title="Режим работы"><Select aria-label="Режим работы помощника" value={draft.mode} onChange={mode => edit({ ...draft, mode })} options={[{ value: 'MANUAL', label: 'Ручной — отвечает сотрудник' }, { value: 'SUGGEST', label: 'Подсказки — сотрудник проверяет и отправляет' }, { value: 'AUTO', label: 'Автоматический — разрешённые сценарии', disabled: !overview.runtime.liveSendEnabled }]} className="full-width" /></Card>
    {draft.clinicProgrammeTable && <Card title="Диспансеризация — утверждённая таблица">
      <Typography.Paragraph>Цены и варианты из таблицы владельца. Обычная цена и цена со скидкой сохраняются отдельно.</Typography.Paragraph>
      <Space wrap><Switch aria-label="Скидка на диспансеризацию доступна всем" checked={draft.clinicProgrammeTable.discountAvailableToAll} onChange={discountAvailableToAll => edit({ ...draft, clinicProgrammeTable: { ...draft.clinicProgrammeTable!, discountAvailableToAll } })} /><Typography.Text>Скидка доступна всем</Typography.Text></Space>
      <Table rowKey={row => `${row.species}-${row.programme}-${row.laboratory}`} size="small" pagination={false} scroll={{ x: 640 }} dataSource={draft.clinicProgrammeTable.prices} columns={[
        { title: 'Вариант', render: (_, row) => `${row.species === 'CAT' ? 'Кошка' : 'Собака'} · ${row.programme === 'STANDARD' ? 'стандартная' : 'расширенная'} · ${row.laboratory === 'CLINIC' ? 'клиника' : 'Инвитро'}` },
        ...(['regularPrice', 'discountedPrice'] as const).map(field => ({ title: field === 'regularPrice' ? 'Обычная цена, ₽' : 'Со скидкой, ₽', key: field, render: (_: unknown, row: NonNullable<AvitoSettings['clinicProgrammeTable']>['prices'][number], index: number) => <Input type="number" min={1} aria-label={`${field === 'regularPrice' ? 'Обычная цена' : 'Цена со скидкой'} ${index + 1}`} value={row[field]} onChange={event => edit({ ...draft, clinicProgrammeTable: { ...draft.clinicProgrammeTable!, prices: draft.clinicProgrammeTable!.prices.map((value, i) => i === index ? { ...value, [field]: Number(event.target.value) } : value) } })} /> }))
      ]} />
    </Card>}
    <Card title="График администратора и ночная связь">
      <Form layout="vertical"><Row gutter={16}>
        <Col xs={24} sm={8}><Form.Item label="Администратор начинает работу"><Input aria-label="Начало работы администратора" type="time" value={draft.administratorSchedule.opensAt} onChange={e => edit({ ...draft, administratorSchedule: { ...draft.administratorSchedule, opensAt: e.target.value } })} /></Form.Item></Col>
        <Col xs={24} sm={8}><Form.Item label="Администратор заканчивает работу"><Input aria-label="Конец работы администратора" type="time" value={draft.administratorSchedule.closesAt} onChange={e => edit({ ...draft, administratorSchedule: { ...draft.administratorSchedule, closesAt: e.target.value } })} /></Form.Item></Col>
        <Col xs={24} sm={8}><Form.Item label="Часовой пояс"><Input aria-label="Часовой пояс администратора" value={draft.administratorSchedule.timezone} onChange={e => edit({ ...draft, administratorSchedule: { ...draft.administratorSchedule, timezone: e.target.value } })} /></Form.Item></Col>
      </Row><Form.Item label="Основной номер для связи с клиникой"><Select aria-label="Филиал для ночной связи" allowClear placeholder="Номер из CRM; при нескольких номерах выберите филиал" value={draft.administratorSchedule.officeId} options={overview.nightContact?.offices.map(office => ({ value: office.id, label: `${office.name} · ${office.phone || 'номер не заполнен'}` }))} onChange={officeId => edit({ ...draft, administratorSchedule: { ...draft.administratorSchedule, officeId } })} /></Form.Item></Form>
      <Alert type={overview.nightContact?.phone ? 'info' : 'warning'} showIcon message={overview.nightContact?.phone ? `Номер в сообщении: ${overview.nightContact.phone}` : 'Нужен проверенный основной номер клиники в CRM'} description="В остальное время бот сообщает о ночном режиме и одном дежурном враче, предлагает позвонить самостоятельно и пишет номер прямо в ответе. Заявку сохраняет до рабочего времени администратора." />
    </Card>
    <Card title="Ночной тариф клиники">
      <Space wrap><Switch aria-label="Предупреждение о ночном тарифе" checked={nightTariff.enabled} onChange={enabled => patchNightTariff({ enabled })} /><Typography.Text>Сообщать о двойном ночном тарифе</Typography.Text></Space>
      <Form layout="vertical"><Row gutter={16}>
        <Col xs={24} sm={12}><Form.Item label="Начало ночного тарифа"><Input aria-label="Начало ночного тарифа" type="time" value={nightTariff.startsAt} onChange={e => patchNightTariff({ startsAt: e.target.value })} /></Form.Item></Col>
        <Col xs={24} sm={12}><Form.Item label="Конец ночного тарифа"><Input aria-label="Конец ночного тарифа" type="time" value={nightTariff.endsAt} onChange={e => patchNightTariff({ endsAt: e.target.value })} /></Form.Item></Col>
      </Row></Form>
      <Typography.Paragraph type="secondary">Бот называет цены из CRM, а для диспансеризации — из утверждённой таблицы выше. Часы двойного ночного тарифа сообщает отдельно, без пересчёта сумм. Этот период задаётся независимо от графика администратора.</Typography.Paragraph>
    </Card>
    <Card title="Отдельные правила направлений">
      <Space wrap className="avito-toolbar"><Select aria-label="Редактируемое направление" value={direction} options={directions} onChange={setDirection} style={{ width: 230 }} /><Switch checked={profile.enabled} onChange={enabled => patchProfile({ enabled })} /><Typography.Text>Обработка направления разрешена</Typography.Text></Space>
      <Form layout="vertical"><Form.Item label="Общий промпт направления"><Input.TextArea aria-label="Общий промпт направления" rows={12} value={profile.prompt} maxLength={12000} onChange={e => patchProfile({ prompt: e.target.value })} /></Form.Item></Form>
      <Typography.Paragraph type="secondary">ИИ через существующее подключение клиники помогает распознавать свободные формулировки и выбирать тему ответа. Факты, контакты и подтверждение заявки контролирует сервер. Цены диспансеризации берутся из утверждённой таблицы, остальные цены и графики — из CRM. Модель не выбирает врача и время. В проверке сценариев можно отдельно включить ИИ.</Typography.Paragraph>
      {direction === 'CLINIC' && <Alert className="avito-notice" type="info" showIcon message="Цены — из CRM и утверждённой таблицы" description="Диспансеризация использует таблицу владельца: обычная цена и цена со скидкой хранятся отдельно. Остальные услуги и цены читаются из CRM, часы работы, адреса и телефоны — из карточек филиалов. Ответ повторно проверяется перед отправкой. Медицинские вопросы решает врач; вне графика администратора бот предлагает позвонить дежурному врачу." />}
      <Typography.Title level={5}>Дополнительные утверждённые ответы: {profile.title}</Typography.Title>
      {profile.knowledge.map((entry, i) => <Card key={entry.id} size="small" className="avito-knowledge" extra={<Button danger size="small" onClick={() => patchProfile({ knowledge: profile.knowledge.filter(e => e.id !== entry.id) })}>Удалить ответ</Button>}>
        <Form layout="vertical"><Form.Item label="Тема"><Input value={entry.title} maxLength={160} onChange={e => patchProfile({ knowledge: profile.knowledge.map((v, n) => n === i ? { ...v, title: e.target.value } : v) })} /></Form.Item>
          <Form.Item label="Ключевые фразы"><Select mode="tags" value={entry.keywords} tokenSeparators={[',']} onChange={keywords => patchProfile({ knowledge: profile.knowledge.map((v, n) => n === i ? { ...v, keywords } : v) })} placeholder="Например: как оставить заявку" /></Form.Item>
          <Form.Item label="Подтверждённый ответ"><Input.TextArea rows={3} value={entry.answer} maxLength={2500} onChange={e => patchProfile({ knowledge: profile.knowledge.map((v, n) => n === i ? { ...v, answer: e.target.value } : v) })} /></Form.Item>
        </Form>
      </Card>)}
      <Button icon={<PlusOutlined />} onClick={() => patchProfile({ knowledge: [...profile.knowledge, { id: key(), title: '', keywords: [], answer: '' }] })}>Добавить утверждённый ответ</Button>
    </Card>
    <Card title="Привязка объявлений">
      {draft.listings.map((listing, i) => <div className="avito-listing-rule" key={i}><Input aria-label="ID объявления" placeholder="ID объявления" value={listing.id} maxLength={20} onChange={e => edit({ ...draft, listings: draft.listings.map((v, n) => n === i ? { ...v, id: e.target.value } : v) })} /><Input aria-label="Название объявления" placeholder="Название" value={listing.title} onChange={e => edit({ ...draft, listings: draft.listings.map((v, n) => n === i ? { ...v, title: e.target.value } : v) })} /><Select aria-label="Направление объявления" value={listing.direction} options={directions} onChange={d => edit({ ...draft, listings: draft.listings.map((v, n) => n === i ? { ...v, direction: d } : v) })} /><Switch checked={listing.enabled} aria-label="Обрабатывать объявление" onChange={enabled => edit({ ...draft, listings: draft.listings.map((v, n) => n === i ? { ...v, enabled } : v) })} /><Button danger onClick={() => edit({ ...draft, listings: draft.listings.filter((_, n) => n !== i) })}>Убрать</Button></div>)}
      <Button icon={<PlusOutlined />} onClick={() => edit({ ...draft, listings: [...draft.listings, { id: '', title: '', direction, enabled: true }] })}>Добавить объявление</Button>
    </Card>
    <Card title="Карточки услуг: что говорить по каждому объявлению">
      <Typography.Paragraph>Общий промпт задаёт стиль и правила. Карточка добавляет контекст услуги, первый ответ, один уточняющий вопрос и запрос к прайсу CRM. У опубликованного и неактивного объявления сохраняются те же правила; подключение карточки не публикует объявление.</Typography.Paragraph>
      <Collapse items={draft.listings.map((listing, i) => ({ key: `${listing.id}-${i}`, label: `${listing.title || 'Новое объявление'} · ${directionLabels[listing.direction]} · ${listing.id}${listing.enabled ? '' : ' · Обработка отключена'}`, children: <ListingCardEditor listing={listing} onChange={patch => edit({ ...draft, listings: draft.listings.map((value, n) => n === i ? { ...value, ...patch } : value) })} /> }))} />
    </Card>
    <Collapse items={[{ key: 'templates', label: 'Шаблоны передачи и границы ответов', children: <Form layout="vertical">{(Object.keys(templateLabels) as (keyof AvitoSettings['templates'])[]).map(name => <Form.Item key={name} label={templateLabels[name]}><Input.TextArea rows={3} maxLength={2000} value={draft.templates[name]} onChange={e => edit({ ...draft, templates: { ...draft.templates, [name]: e.target.value } })} /></Form.Item>)}</Form> }]} />
    {dirty && version !== overview.settingsVersion && <Alert type="warning" message="Сохранена другая версия правил. Сначала обновите данные; изменения не будут перезаписаны молча." />}
    <Space><Button type="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Сохранить правила</Button><Typography.Text type="secondary">Версия {version}{dirty ? ' · есть несохранённые изменения' : ''}</Typography.Text></Space>
    <Collapse items={[{ key: 'history', label: 'История версий и восстановление', children: <Table rowKey="id" size="small" dataSource={revisions.data} pagination={false} columns={[{ title: 'Версия', dataIndex: 'version' }, { title: 'Сохранена', dataIndex: 'createdAt', render: formatDateTime }, { title: '', key: 'restore', render: (_, r) => <Popconfirm title={`Восстановить версию ${r.version}?`} description="Она сохранится новой версией в режиме подсказок." onConfirm={() => restore.mutate(r.version)}><Button disabled={dirty || r.version === overview.settingsVersion} loading={restore.isPending}>Восстановить</Button></Popconfirm> }]} /> }]} />
  </Space>;
}

function ListingCardEditor({ listing, onChange }: { listing: AvitoSettings['listings'][number]; onChange: (patch: Partial<AvitoSettings['listings'][number]>) => void }) {
  return <Form layout="vertical">
    {!listing.enabled && <Alert type="info" showIcon message="Обработка этого объявления отключена. Бот не отвечает и не собирает заявку; переписку продолжает сотрудник." style={{ marginBottom: 16 }} />}
    <Form.Item label="Первый ответ клиенту"><Input.TextArea aria-label="Первый ответ клиенту" rows={3} maxLength={500} value={listing.greeting || ''} onChange={e => onChange({ greeting: e.target.value })} /></Form.Item>
    <Form.Item label="Один вопрос перед оформлением заявки"><Input.TextArea aria-label="Один вопрос перед оформлением заявки" rows={2} maxLength={300} value={listing.intakeQuestion || ''} onChange={e => onChange({ intakeQuestion: e.target.value })} /></Form.Item>
    <Form.Item label="Поиск услуги в CRM при вопросе «Сколько стоит?»"><Input aria-label="Поиск услуги в CRM" maxLength={160} value={listing.crmQuery || ''} onChange={e => onChange({ crmQuery: e.target.value })} /></Form.Item>
    <Form.Item label="Контекст и границы ответа по услуге"><Input.TextArea aria-label="Контекст и границы ответа по услуге" rows={5} maxLength={1500} value={listing.prompt || ''} onChange={e => onChange({ prompt: e.target.value })} /></Form.Item>
  </Form>;
}

function Simulator({ overview }: { overview: AvitoOverview }) {
  const { message } = App.useApp(); const [state, setState] = useState<Record<string, unknown>>({}); const [at, setAt] = useState(''); const [useAi, setUseAi] = useState(false);
  const simulation = useMutation({ mutationFn: (v: { listingId: string; text: string }) => avitoApi.simulate({ ...v, contact: state, ...(at ? { at: new Date(at).toISOString() } : {}), ...(useAi ? { useAi: true, clientKey: key() } : {}) }), onSuccess: r => setState(r.decision.contact), onError: e => message.error(getErrorMessage(e)) });
  const result = simulation.data?.decision;
  return <Space direction="vertical" size={16} className="full-width"><Alert type="info" showIcon message="Проверка сохранённых сценариев без отправки и создания заявок" description="Проверьте направление, медицинский вопрос, сбор контактов и передачу сотруднику. По умолчанию работают правила и справочники CRM. Для свободных формулировок можно включить ИИ через подключение клиники; вызовы учитываются в отдельном лимите Авито." />
    <Space><Switch aria-label="Проверять с ИИ клиники" checked={useAi} disabled={!overview.runtime.languageModelConfigured} onChange={value => { setUseAi(value); simulation.reset(); }} /><Typography.Text>Проверять с ИИ клиники</Typography.Text></Space>
    <Card><Form.Item label="Время для проверки дневного и ночного ответа"><Input aria-label="Тестовое время" type="datetime-local" value={at} onChange={e => { setAt(e.target.value); setState({}); simulation.reset(); }} /></Form.Item><Form layout="vertical" onFinish={v => simulation.mutate(v)}><Form.Item name="listingId" label="Объявление" rules={[{ required: true }]}><Select onChange={() => setState({})} options={overview.settings?.listings.map(l => ({ value: l.id, label: `${l.title} · ${directionLabels[l.direction]}` }))} /></Form.Item><Form.Item name="text" label="Сообщение клиента" rules={[{ required: true }]}><Input.TextArea rows={4} maxLength={4000} /></Form.Item><Space><Button type="primary" htmlType="submit" loading={simulation.isPending}>Проверить</Button><Button onClick={() => { setState({}); simulation.reset(); }}>Начать заново</Button></Space></Form></Card>
    {result && <Card title="Ожидаемое действие"><Space wrap><Tag>{result.direction ? directionLabels[result.direction] : 'Без направления'}</Tag>{result.handoff && <Tag color="orange">Нужен сотрудник</Tag>}{result.createInquiry && <Tag color="blue">После сохранения будет создана заявка</Tag>}{simulation.data?.modelStatus && <Tag>{({ USED: 'ИИ распознал обращение', RULES_SUFFICIENT: 'Достаточно правил', NOT_REQUESTED: 'Проверка без ИИ', UNAVAILABLE: 'ИИ недоступен — использованы правила' } as Record<string, string>)[simulation.data.modelStatus]}</Tag>}</Space><Typography.Paragraph className="avito-outbox-text">{result.text || 'Автоматического ответа не будет.'}</Typography.Paragraph><Typography.Text type="secondary">Причина: {result.reason}</Typography.Text>{result.prompt && <Collapse items={[{ key: 'prompt', label: 'Собранный промпт направления', children: <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{result.prompt}</Typography.Paragraph> }]} />}</Card>}

  </Space>;
}

function Connection({ overview }: { overview: AvitoOverview }) {
  const { message } = App.useApp(); const client = useQueryClient(); const [nextOffset, setNextOffset] = useState<number | null>(0);
  const check = useMutation({ mutationFn: avitoApi.check, onSuccess: async () => { await client.invalidateQueries({ queryKey: ['avito'] }); message.success('Профиль и чтение чатов проверены'); }, onError: e => message.error(getErrorMessage(e)) });
  const sync = useMutation({ mutationFn: () => avitoApi.sync(nextOffset ?? 0), onSuccess: async r => { setNextOffset(r.nextOffset); await client.invalidateQueries({ queryKey: ['avito'] }); message.success(`Проверено диалогов: ${r.chats}. Новых сообщений: ${r.imported}.`); }, onError: e => message.error(getErrorMessage(e)) });
  const c = overview.connection;
  return <Space direction="vertical" size={16} className="full-width"><Card title="Доступ к Авито"><Descriptions column={1}><Descriptions.Item label="Серверное хранилище ключей">{c.credentialsConfigured ? 'Подключено' : 'Ещё не подключено'}</Descriptions.Item><Descriptions.Item label="Профиль">{c.accountName || 'Не проверен'}{c.accountId ? ` · ID ${c.accountId}` : ''}</Descriptions.Item><Descriptions.Item label="Последняя проверка">{c.checkedAt ? formatDateTime(c.checkedAt) : 'Не выполнялась'}</Descriptions.Item><Descriptions.Item label="Получение событий">{overview.runtime.ingestionEnabled ? 'Разрешено на сервере' : 'Не включено'}</Descriptions.Item><Descriptions.Item label="Реальная отправка">{overview.runtime.liveSendEnabled ? 'Разрешена на сервере' : 'Не включена'}</Descriptions.Item></Descriptions>
      {c.error && <Alert type="error" showIcon message={c.error} />}
      <Space wrap><Button loading={check.isPending} disabled={!c.credentialsConfigured} onClick={() => check.mutate()}>Проверить профиль и чаты</Button><Button loading={sync.isPending} disabled={!c.accountId || !overview.installation.enabled} onClick={() => sync.mutate()}>{nextOffset ? 'Загрузить следующие диалоги' : 'Загрузить переписку'}</Button></Space>
      {c.lastSyncAt && <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>Последняя загрузка переписки: {formatDateTime(c.lastSyncAt)}</Typography.Paragraph>}
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>Ключи вводятся и хранятся на сервере. Их значения не доступны в браузере. Старые диалоги загружаются для сотрудника и не запускают ответы задним числом.</Typography.Paragraph>
    </Card>
    <AvitoAccountListings settings={overview.settings} />
    <Card title="Функции модуля и расширения"><Table rowKey="key" dataSource={overview.capabilities} pagination={false} scroll={{ x: 650 }} columns={[{ title: 'Функция', dataIndex: 'title' }, { title: 'Готовность', dataIndex: 'status', render: s => <Tag color={s === 'IMPLEMENTED' ? 'green' : 'default'}>{s === 'IMPLEMENTED' ? 'В этом блоке' : 'Следующее расширение'}</Tag> }, { title: 'Условие', dataIndex: 'activation' }]} /></Card>
  </Space>;
}
