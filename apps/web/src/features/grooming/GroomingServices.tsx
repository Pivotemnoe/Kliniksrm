import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Alert, App, Button, Card, Checkbox, Drawer, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { createOperationKey } from '../../shared/utils/operationKey';
import { day, groomingApi, groomingPrice, GroomingServiceRow, Overview, SlotPreview, time } from './grooming.api';
export const durationLabel = (minutes: number) => minutes < 60 ? `${minutes} мин` : `${Math.floor(minutes / 60)} ч${minutes % 60 ? ` ${minutes % 60} мин` : ''}`;
const durationOptions = Array.from({ length: 14 }, (_, n) => ({ value: (n + 3) * 30, label: durationLabel((n + 3) * 30) }));
export function GroomingServices({ overview, refresh }: { overview: Overview; refresh: () => Promise<unknown> }) {
  const { message, modal } = App.useApp(), route = useLocation(), focusGroomer = new URLSearchParams(route.search).get('groomer');
  const [form] = Form.useForm(), [priceForm] = Form.useForm(), [previewForm] = Form.useForm();
  const [editing, setEditing] = useState<GroomingServiceRow>(), [price, setPrice] = useState<GroomingServiceRow | 'new'>(), [preview, setPreview] = useState<GroomingServiceRow>(), [result, setResult] = useState<SlotPreview>();
  const [attempt, setAttempt] = useState(createOperationKey), [search, setSearch] = useState(''), [kind, setKind] = useState('ALL');
  const duration = Form.useWatch('durationMinutes', form), priceType = Form.useWatch('priceType', priceForm) || 'FIXED';
  const all = overview.resources?.services || [], groomers = overview.specialists.filter(s => s.isActive && s.employee?.accountScope !== 'CLINIC');
  const rulesFor = (serviceId: string) => overview.rules.filter(r => r.serviceId === serviceId);
  const eligible = (service: GroomingServiceRow) => groomers.filter(g => !service.catalogData?.species || service.catalogData.species === 'ANY' || g.species.includes(service.catalogData.species));
  const bookable = (s: GroomingServiceRow) => s.isActive && !['QUOTE', 'PERCENT'].includes(s.priceType || 'FIXED') && s.catalogData?.category !== 'SUPPLEMENT';
  const imported = useMutation({ mutationFn: () => groomingApi.save('services/import-prices', { clientKey: createOperationKey() }) as Promise<{ created: number; preserved: number }>, onSuccess: async r => { await refresh(); message.success(`Добавлено услуг: ${r.created}. Существующие цены сохранены.`); }, onError: e => message.error(getErrorMessage(e)) });
  const save = useMutation({ mutationFn: (values: Record<string, unknown>) => groomingApi.save(`services/${editing!.id}/booking`, { ...values, clientKey: attempt, version: editing!.version }), onSuccess: async () => { setEditing(undefined); await refresh(); message.success('Длительность и грумеры сохранены. Время и место берутся из их смен.'); }, onError: e => message.error(getErrorMessage(e)) });
  const check = useMutation({ mutationFn: (values: Record<string, unknown>) => groomingApi.previewSlots({ ...values, serviceId: preview!.id }), onSuccess: setResult, onError: e => message.error(getErrorMessage(e)) });
  const priceSave = useMutation({ mutationFn: (values: Record<string, unknown>) => groomingApi.save(price && price !== 'new' ? `services/${price.id}` : 'services', { ...values, price: ['QUOTE', 'UP_TO'].includes(String(values.priceType)) ? 0 : values.price, ...(price && price !== 'new' ? { version: price.version } : {}) }, price && price !== 'new' ? 'PATCH' : 'POST'), onSuccess: async () => { setPrice(undefined); await refresh(); message.success('Цена сохранена'); }, onError: e => message.error(getErrorMessage(e)) });
  const configure = (service: GroomingServiceRow) => {
    const rules = rulesFor(service.id), people = eligible(service), durations = [...new Set(rules.filter(r => r.isActive).map(r => r.durationMinutes))];
    form.resetFields(); form.setFieldsValue({ durationMinutes: durations.length === 1 ? Math.max(90, Math.ceil(durations[0] / 30) * 30) : 90, specialistIds: focusGroomer && people.some(g => g.id === focusGroomer) ? [focusGroomer] : [...new Set(rules.map(r => r.specialistId))].filter(id => people.some(g => g.id === id)).length ? [...new Set(rules.map(r => r.specialistId))].filter(id => people.some(g => g.id === id)) : people.length === 1 ? [people[0].id] : [], isActive: rules.length ? rules.some(r => r.isActive) : true });
    setAttempt(createOperationKey()); setEditing(service);
  };
  const openPrice = (value: GroomingServiceRow | 'new') => { priceForm.resetFields(); priceForm.setFieldsValue(value === 'new' ? { isActive: true, priceType: 'FIXED' } : { ...value, price: Number(value.price), maximumPrice: value.maximumPrice == null ? undefined : Number(value.maximumPrice) }); setPrice(value); };
  const openPreview = (service: GroomingServiceRow) => {
    const assigned = new Set(rulesFor(service.id).filter(r => r.isActive).map(r => r.specialistId));
    const first = overview.setup?.groomers?.find(g => assigned.has(g.specialistId) && g.nextShift);
    previewForm.resetFields(); previewForm.setFieldsValue({ date: first?.nextShift ? day(first.nextShift.startsAt) : day(new Date()), specialistId: focusGroomer && assigned.has(focusGroomer) ? focusGroomer : undefined }); setResult(undefined); setPreview(service);
  };
  const visible = all.filter(s => (kind === 'ALL' || s.catalogData?.species === kind) && s.title.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')));
  return <Space direction="vertical" size={20} className="full-width">
    <Alert type="info" showIcon message="Ручная запись делается в календаре" description="В календаре выбирайте любую услугу и любой свободный интервал с шагом полчаса. Предварительно настраивать длительность услуги не нужно. Ниже — прайс и необязательные настройки самостоятельной записи на сайте." />
    <Space wrap><Button onClick={() => openPrice('new')}>Добавить свою услугу</Button><Button icon={<DownloadOutlined />} loading={imported.isPending} onClick={() => modal.confirm({ title: 'Добавить услуги из прайса сайта?', content: 'Добавим отсутствующие услуги. Ваши цены, длительность, грумеры и записи сохранятся.', okText: 'Добавить из прайса', cancelText: 'Отмена', onOk: () => imported.mutateAsync() })}>Добавить из прайса сайта</Button></Space>
    <Card title="Прайс и самостоятельная запись на сайте" extra={<Tag>{all.length} услуг</Tag>}>
      <Space wrap style={{ marginBottom: 16 }}><Input.Search aria-label="Найти услугу груминга" placeholder="Название услуги или порода" value={search} onChange={e => setSearch(e.target.value)} /><Select aria-label="Вид питомца в прайсе" value={kind} onChange={setKind} options={[{ value: 'ALL', label: 'Все услуги' }, { value: 'DOG', label: 'Собаки' }, { value: 'CAT', label: 'Кошки' }, { value: 'ANY', label: 'Отдельные процедуры' }]} /></Space>
      <Table<GroomingServiceRow> rowKey="id" dataSource={visible} pagination={{ pageSize: 10, showSizeChanger: true }} scroll={{ x: 900 }} columns={[
        { title: 'Услуга', dataIndex: 'title', width: 260 }, { title: 'Цена', render: (_, s) => <Space direction="vertical" size={0}>{groomingPrice(s)}<Button type="link" size="small" onClick={() => openPrice(s)}>Изменить цену</Button></Space> },
        { title: 'Длительность на сайте', render: (_, s) => { const d = [...new Set(rulesFor(s.id).filter(r => r.isActive).map(r => Math.max(90, Math.ceil(r.durationMinutes / 30) * 30)))]; return d.length ? d.map(durationLabel).join(' / ') : 'Не задана'; } },
        { title: 'Грумеры для сайта', render: (_, s) => { const ids = new Set(rulesFor(s.id).filter(r => r.isActive).map(r => r.specialistId)); return overview.specialists.filter(g => ids.has(g.id)).map(g => g.displayName).join(', ') || 'Выберите грумера'; } },
        { title: 'Запись', render: (_, s) => <Tag color={bookable(s) && rulesFor(s.id).some(r => r.isActive) ? 'green' : undefined}>{!bookable(s) ? s.priceType === 'QUOTE' ? 'Уточните цену' : 'Отдельно не записывается' : rulesFor(s.id).some(r => r.isActive) ? 'Настроена' : 'Не настроена'}</Tag> },
        { title: 'Действия', render: (_, s) => <Space direction="vertical" size={4}><Button onClick={() => configure(s)} disabled={!bookable(s)} aria-label={`Настроить запись: ${s.title}`}>Настроить запись на сайте</Button><Button size="small" type="link" disabled={!rulesFor(s.id).some(r => r.isActive)} onClick={() => openPreview(s)} aria-label={`Проверить слоты: ${s.title}`}>Проверить слоты</Button></Space> },
      ]} locale={{ emptyText: 'Добавьте услугу из прайса сайта или создайте свою' }} />
    </Card>
    <Drawer title="Запись на услугу через сайт" width="min(580px,100vw)" open={Boolean(editing)} onClose={() => setEditing(undefined)} destroyOnHidden>
      {editing && <><Typography.Title level={4}>{editing.title}</Typography.Title><Typography.Paragraph>{groomingPrice(editing)}</Typography.Paragraph>
        {!eligible(editing).length && <Alert type="info" showIcon message="Сначала добавьте грумера для этого вида питомцев" description={<Link to="/grooming/specialists">Открыть «Грумеры и места»</Link>} />}
        <Form form={form} name="grooming-simple-service" layout="vertical" onFinish={save.mutate} onValuesChange={() => setAttempt(createOperationKey())}>
          <Form.Item name="durationMinutes" label="Первоначальная бронь на сайте" rules={[{ required: true, message: 'Выберите длительность' }]}><Select placeholder="От 1 ч 30 мин" options={durationOptions} /></Form.Item>
          <Space style={{ marginBottom: 20 }}><Button aria-label="Уменьшить длительность на 30 минут" disabled={!duration || duration <= 90} onClick={() => { form.setFieldValue('durationMinutes', duration - 30); setAttempt(createOperationKey()); }}>− 30 мин</Button><Button aria-label="Увеличить длительность на 30 минут" disabled={duration >= 480} onClick={() => { form.setFieldValue('durationMinutes', (duration || 60) + 30); setAttempt(createOperationKey()); }}>+ 30 мин</Button><Typography.Text>{duration ? durationLabel(duration) : 'Выберите время'}</Typography.Text></Space>
          <Form.Item name="specialistIds" label="Какие грумеры выполняют эту услугу" rules={[{ required: true, type: 'array', min: 1, message: 'Выберите хотя бы одного грумера' }]}><Checkbox.Group options={eligible(editing).map(g => ({ value: g.id, label: g.displayName }))} /></Form.Item>
          <Typography.Paragraph type="secondary">Место в салоне здесь выбирать не нужно: оно берётся из смены выбранного грумера. Сайт резервирует минимум полтора часа. После оценки питомца администратор или назначенный грумер может уточнить длительность с шагом полчаса. Начало записи предлагается каждые 30 минут. Дополнительное время между записями не добавляется.</Typography.Paragraph>
          <Form.Item name="isActive" label="Разрешить запись на услугу" valuePropName="checked"><Switch /></Form.Item>
          <Button type="primary" htmlType="submit" loading={save.isPending} disabled={!eligible(editing).length}>Сохранить длительность и грумеров</Button>
        </Form></>}
    </Drawer>
    <Drawer title="Проверить связь и свободные слоты" width="min(650px,100vw)" open={Boolean(preview)} onClose={() => setPreview(undefined)} destroyOnHidden>
      {preview && <><Typography.Title level={4}>{preview.title}</Typography.Title><Typography.Paragraph>Проверка показывает фактическое время из графика. Клиент и тестовая запись для неё не нужны.</Typography.Paragraph><Form name="grooming-slot-check" form={previewForm} layout="vertical" onFinish={check.mutate} onValuesChange={() => setResult(undefined)}>
        <Form.Item name="specialistId" label="Грумер"><Select allowClear placeholder="Все назначенные грумеры" options={overview.specialists.filter(g => rulesFor(preview.id).some(r => r.specialistId === g.id && r.isActive)).map(g => ({ value: g.id, label: g.displayName }))} /></Form.Item>
        <Form.Item name="date" label="Дата" trigger="onInput" rules={[{ required: true }]}><Input type="date" /></Form.Item><Button type="primary" htmlType="submit" loading={check.isPending}>Проверить связь и показать слоты</Button>
      </Form>{result && <><Alert style={{ marginTop: 16 }} type={result.offers.length ? 'success' : 'info'} showIcon message={result.offers.length ? `Свободных слотов: ${result.offers.length}` : 'На эту дату свободного времени нет'} description={result.notice} /><div className="grooming-slot-check-grid">{result.offers.map((slot, i) => <Card size="small" key={`${slot.startsAt}-${slot.specialistId}-${slot.workplaceId}-${i}`}><strong>{time(slot.startsAt)}–{time(slot.endsAt)}</strong><div>{slot.specialistName}</div><small>{slot.workplaceName} · {durationLabel(slot.durationMinutes)}</small></Card>)}</div></>}</>}
    </Drawer>
    <Modal open={Boolean(price)} title="Цена услуги" footer={null} onCancel={() => setPrice(undefined)}><Form name="grooming-service-price" form={priceForm} layout="vertical" onFinish={priceSave.mutate}>
      <Form.Item name="title" label="Название" rules={[{ required: true }]}><Input maxLength={180} /></Form.Item><Form.Item name="priceType" label="Как указывается цена" rules={[{ required: true }]}><Select options={[{ value: 'FIXED', label: 'Фиксированная' }, { value: 'RANGE', label: 'Диапазон' }, { value: 'UP_TO', label: 'До указанной суммы' }, { value: 'QUOTE', label: 'Уточнить перед записью' }, { value: 'PERCENT', label: 'Процентная доплата' }]} /></Form.Item>
      {!['QUOTE', 'UP_TO'].includes(priceType) && <Form.Item name="price" label={priceType === 'PERCENT' ? 'Доплата, %' : priceType === 'RANGE' ? 'От, ₽' : 'Стоимость, ₽'} rules={[{ required: true }]}><InputNumber min={0} max={1000000} /></Form.Item>}{['RANGE', 'UP_TO'].includes(priceType) && <Form.Item name="maximumPrice" label="До, ₽" rules={[{ required: true }]}><InputNumber min={0} max={1000000} /></Form.Item>}
      <Form.Item name="isActive" label="Показывать услугу" valuePropName="checked"><Switch /></Form.Item><Typography.Paragraph type="secondary">Уже подтверждённые записи сохранят прежнюю цену.</Typography.Paragraph><Button type="primary" htmlType="submit" loading={priceSave.isPending}>Сохранить цену</Button>
    </Form></Modal>
  </Space>;
}
