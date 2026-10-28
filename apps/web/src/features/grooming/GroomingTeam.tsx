import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Alert, App, Button, Card, Checkbox, Empty, Form, Input, Modal, Space, Switch, Tag, Typography } from 'antd';
import { MobileOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { GroomingWorkplaces } from './GroomingWorkplaces';
import { getErrorMessage } from '../../api/errors';
import { Overview, Specialist, groomingApi, speciesLabels } from './grooming.api';

const options = Object.entries(speciesLabels).map(([value, label]) => ({ value, label }));
export function GroomingTeam({ overview, actorId, refresh, onPhone, onSchedule }: { overview: Overview; actorId: string; refresh: () => Promise<unknown>; onPhone: (id?: string) => void; onSchedule?: (employeeId: string) => void }) {
  const { message } = App.useApp(), navigate = useNavigate();
  const [profile, setProfile] = useState<Specialist | 'new'>();
  const [form] = Form.useForm();
  const [created, setCreated] = useState<{ displayName: string; login: string }>();
  const save = useMutation({ mutationFn: (values: Record<string, unknown>) => groomingApi.save(profile && profile !== 'new' ? `specialists/${profile.id}` : 'specialists', { ...values, ...(profile && profile !== 'new' ? { version: profile.version } : {}) }, profile && profile !== 'new' ? 'PATCH' : 'POST'),
    onSuccess: async result => { if (profile === 'new') setCreated(result as { displayName: string; login: string }); setProfile(undefined); form.resetFields(); await refresh(); }, onError: e => message.error(getErrorMessage(e)) });
  const openProfile = (value: Specialist | 'new') => { form.resetFields(); form.setFieldsValue(value === 'new' ? { species: ['DOG', 'CAT'] } : { displayName: value.displayName, species: value.species, maxUserId: value.maxUserId || '', isActive: value.isActive }); setProfile(value); };
  return <Space direction="vertical" size={20} className="full-width">
    <Card title="Команда груминга" extra={overview.canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => openProfile('new')}>Добавить грумера</Button>}>
      <Typography.Paragraph type="secondary">Создайте отдельный профиль грумера, затем в календаре назначьте место и рабочие часы. При записи выбирается любая услуга и её длительность. Телефон подключается к личному кабинету грумера.</Typography.Paragraph>
      {created && <Alert type="success" showIcon closable onClose={() => setCreated(undefined)} message={`${created.displayName}: учётная запись создана`} description={`Логин: ${created.login}. Передайте грумеру заданный временный пароль и подключите его телефон.`} />}
      {!overview.specialists.length ? <Empty description="Грумеры пока не созданы" /> : <div className="grooming-specialists">{overview.specialists.map(s => <Card key={s.id} size="small" title={s.displayName} extra={<Tag color={s.isActive ? 'green' : undefined}>{s.isActive ? 'Принимает записи' : 'Запись выключена'}</Tag>}><p>{s.species.map(v => speciesLabels[v]).join(' · ')}</p><Typography.Paragraph type="secondary">{overview.setup?.groomers?.find(g => g.specialistId === s.id)?.nextShift?.workplaceName || 'Место в салоне назначается в смене.'}</Typography.Paragraph><Space wrap><Button onClick={() => onSchedule ? onSchedule(s.employeeId) : navigate(`/grooming/calendar?groomer=${s.employeeId}&schedule=1`)}>Назначить место и часы</Button>{overview.canManage && <><Button onClick={() => openProfile(s)}>Настроить грумера</Button><Button icon={<MobileOutlined />} onClick={() => onPhone(s.id)}>Подключить телефон</Button></>}</Space></Card>)}</div>}
    </Card>
    {overview.canManage && <GroomingWorkplaces overview={overview} refresh={refresh} />}
    <Modal title={profile === 'new' ? 'Добавить грумера' : 'Настроить грумера'} open={Boolean(profile)} footer={null} onCancel={() => { setProfile(undefined); form.resetFields(); }} destroyOnHidden>
      <Form name="grooming-team-profile" form={form} layout="vertical" onFinish={save.mutate} autoComplete="off">
        {profile === 'new' ? <><Form.Item name="fullName" label="ФИО грумера" rules={[{ required: true, min: 2 }]}><Input maxLength={120} /></Form.Item><Form.Item name="phone" label="Телефон для входа"><Input type="tel" placeholder="+7…" /></Form.Item><Form.Item name="email" label="Email для входа" rules={[{ type: 'email' }]}><Input type="email" /></Form.Item><Typography.Paragraph type="secondary">Для входа нужен телефон или email.</Typography.Paragraph><Form.Item name="password" label="Временный пароль" rules={[{ required: true, min: 8 }]}><Input.Password autoComplete="new-password" /></Form.Item><Typography.Paragraph type="secondary">При первом входе грумер установит свой пароль.</Typography.Paragraph></> : <Form.Item name="displayName" label="Имя грумера" rules={[{ required: true }]}><Input maxLength={120} /></Form.Item>}
        <Form.Item name="species" label="Работает с" rules={[{ required: true }]}><Checkbox.Group options={options} /></Form.Item>
        <Form.Item name="maxUserId" label="MAX user_id для уведомлений"><Input /></Form.Item>
        {profile !== 'new' && <Form.Item name="isActive" label="Принимает записи" valuePropName="checked"><Switch /></Form.Item>}
        <Button type="primary" htmlType="submit" loading={save.isPending}>{profile === 'new' ? 'Создать грумера' : 'Сохранить'}</Button>
      </Form>
    </Modal>
  </Space>;
}
