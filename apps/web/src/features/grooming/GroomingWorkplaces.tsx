import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { App, Button, Card, Form, Input, Modal, Select, Space, Switch, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../../api/errors';
import { groomingApi, Overview } from './grooming.api';
type Workplace = NonNullable<Overview['resources']>['workplaces'][number];
export function GroomingWorkplaces({ overview, refresh }: { overview: Overview; refresh: () => Promise<unknown> }) {
  const [editing, setEditing] = useState<Workplace | 'new'>(), [address, setAddress] = useState(false);
  const [form] = Form.useForm(), [addressForm] = Form.useForm(), { message } = App.useApp();
  const places = overview.resources?.workplaces || [], locations = overview.resources?.locations || [];
  const setup = useMutation({ mutationFn: () => groomingApi.save('workplaces/setup', {}), onSuccess: refresh, onError: e => message.error(getErrorMessage(e)) });
  const save = useMutation({ mutationFn: (values: Record<string, unknown>) => groomingApi.save(editing && editing !== 'new' ? `workplaces/${editing.id}` : 'workplaces', { ...values, ...(editing && editing !== 'new' ? { version: editing.version } : {}) }, editing && editing !== 'new' ? 'PATCH' : 'POST'), onSuccess: async () => { setEditing(undefined); await refresh(); }, onError: e => message.error(getErrorMessage(e)) });
  const saveAddress = useMutation({ mutationFn: (values: Record<string, unknown>) => groomingApi.save(`locations/${locations[0].id}`, { ...values, timezone: 'Europe/Moscow', isActive: locations[0].isActive, version: locations[0].version }, 'PATCH'), onSuccess: async () => { setAddress(false); await refresh(); }, onError: e => message.error(getErrorMessage(e)) });
  const open = (value: Workplace | 'new') => { form.resetFields(); let number = places.length + 1; while (places.some(p => p.name === `Рабочее место ${number}`)) number++; form.setFieldsValue(value === 'new' ? { name: `Рабочее место ${number}`, locationId: locations[0]?.id, isActive: true } : value); setEditing(value); };
  return <Card title="Рабочие места" extra={Boolean(places.length) && <Button icon={<PlusOutlined />} onClick={() => open('new')}>Добавить рабочее место</Button>}>
    {!places.length ? <Space direction="vertical"><Typography.Paragraph>Подготовьте два рабочих места груминга. Затем можно добавить третье и следующие.</Typography.Paragraph><Button type="primary" onClick={() => setup.mutate()} loading={setup.isPending}>Создать рабочие места 1 и 2</Button></Space> : <Space direction="vertical" className="full-width" size={12}>{places.map(place => <Space key={place.id} wrap><strong>{place.name}</strong><Tag color={place.isActive ? 'green' : undefined}>{place.isActive ? 'Работает' : 'Выключено'}</Tag><Button size="small" onClick={() => open(place)}>Изменить место</Button></Space>)}<Space wrap><Typography.Text type="secondary">{locations[0]?.address || 'Адрес студии пока не указан'}</Typography.Text><Button size="small" type="link" onClick={() => { addressForm.setFieldsValue(locations[0]); setAddress(true); }}>Адрес студии</Button></Space></Space>}
    <Modal title={editing === 'new' ? 'Добавить рабочее место' : 'Рабочее место'} open={Boolean(editing)} footer={null} onCancel={() => setEditing(undefined)} destroyOnHidden><Form name="grooming-workplace" form={form} layout="vertical" onFinish={save.mutate}>
      <Form.Item name="name" label="Название рабочего места" rules={[{ required: true, min: 2 }]}><Input maxLength={120} /></Form.Item><Form.Item name="locationId" label="Студия" rules={[{ required: true }]} hidden={locations.length === 1}><Select options={locations.map(l => ({ value: l.id, label: l.name }))} /></Form.Item><Form.Item name="isActive" label="Доступно для записи" valuePropName="checked"><Switch /></Form.Item><Button type="primary" htmlType="submit" loading={save.isPending}>Сохранить рабочее место</Button>
    </Form></Modal>
    <Modal title="Студия груминга" open={address} footer={null} onCancel={() => setAddress(false)}><Form name="grooming-studio" form={addressForm} layout="vertical" onFinish={saveAddress.mutate}><Form.Item name="name" label="Название студии" rules={[{ required: true }]}><Input maxLength={120} /></Form.Item><Form.Item name="address" label="Адрес"><Input maxLength={300} /></Form.Item><Button type="primary" htmlType="submit" loading={saveAddress.isPending}>Сохранить адрес</Button></Form></Modal>
  </Card>;
}
