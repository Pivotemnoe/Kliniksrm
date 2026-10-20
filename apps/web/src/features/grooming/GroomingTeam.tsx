import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Card, Checkbox, Empty, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { MobileOutlined, PlusOutlined } from '@ant-design/icons';
import { GroomingWorkplaces } from './GroomingWorkplaces';
import { getErrorMessage } from '../../api/errors';
import { Overview, Shift, Specialist, at, day, groomingApi, speciesLabels, time } from './grooming.api';

const options = Object.entries(speciesLabels).map(([value, label]) => ({ value, label }));
const inputDate = (value: string) => `${day(value)}T${time(value)}`;
export function GroomingTeam({ overview, actorId, refresh, onPhone }: { overview: Overview; actorId: string; refresh: () => Promise<unknown>; onPhone: (id?: string) => void }) {
  const { message } = App.useApp();
  const [profile, setProfile] = useState<Specialist | 'new'>(), [shift, setShift] = useState<Shift | 'new'>();
  const [form] = Form.useForm(), [shiftForm] = Form.useForm();
  const [month, setMonth] = useState(day(new Date()).slice(0, 7));
  const [created, setCreated] = useState<{ displayName: string; login: string }>();
  const locationId = Form.useWatch('locationId', shiftForm);
  const nextMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1, 12);
  const shifts = useQuery({ queryKey: ['grooming', actorId, 'team-shifts', month], queryFn: () => groomingApi.shifts(`${month}-01T00:00:00+03:00`, `${day(nextMonth)}T00:00:00+03:00`) });
  const save = useMutation({ mutationFn: (values: Record<string, unknown>) => groomingApi.save(profile && profile !== 'new' ? `specialists/${profile.id}` : 'specialists', { ...values, ...(profile && profile !== 'new' ? { version: profile.version } : {}) }, profile && profile !== 'new' ? 'PATCH' : 'POST'),
    onSuccess: async result => { if (profile === 'new') setCreated(result as { displayName: string; login: string }); setProfile(undefined); form.resetFields(); await refresh(); }, onError: e => message.error(getErrorMessage(e)) });
  const saveShift = useMutation({ mutationFn: (values: Record<string, string | boolean>) => groomingApi.save(shift && shift !== 'new' ? `shifts/${shift.id}` : 'shifts', { ...values, startsAt: `${values.startsAt}:00+03:00`, endsAt: `${values.endsAt}:00+03:00`, ...(shift && shift !== 'new' ? { version: shift.version } : {}) }, shift && shift !== 'new' ? 'PATCH' : 'POST'),
    onSuccess: async () => { setShift(undefined); await refresh(); }, onError: e => message.error(getErrorMessage(e)) });
  const openProfile = (value: Specialist | 'new') => { form.resetFields(); form.setFieldsValue(value === 'new' ? { species: ['DOG', 'CAT'] } : { displayName: value.displayName, species: value.species, maxUserId: value.maxUserId || '', isActive: value.isActive }); setProfile(value); };
  const openShift = (value: Shift | 'new') => { shiftForm.resetFields(); shiftForm.setFieldsValue(value === 'new' ? { locationId: overview.resources?.locations[0]?.id, employeeId: overview.specialists.length === 1 ? overview.specialists[0].employeeId : undefined, workplaceId: overview.resources?.workplaces[0]?.id, kind: 'WORK', comment: '', isActive: true } : { ...value, startsAt: inputDate(value.startsAt), endsAt: inputDate(value.endsAt) }); setShift(value); };
  return <Space direction="vertical" size={20} className="full-width">
    <Card title="Команда груминга" extra={overview.canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => openProfile('new')}>Добавить грумера</Button>}>
      <Typography.Paragraph type="secondary">Создайте грумеру отдельный вход. Его кабинет содержит собственные записи, расписание и оповещения.</Typography.Paragraph>
      {created && <Alert type="success" showIcon closable onClose={() => setCreated(undefined)} message={`${created.displayName}: учётная запись создана`} description={`Логин: ${created.login}. Передайте грумеру заданный временный пароль и подключите его телефон.`} />}
      {!overview.specialists.length ? <Empty description="Грумеры пока не созданы" /> : <div className="grooming-specialists">{overview.specialists.map(s => <Card key={s.id} size="small" title={s.displayName} extra={<Tag color={s.isActive ? 'green' : undefined}>{s.isActive ? 'Принимает записи' : 'Запись выключена'}</Tag>}><p>{s.species.map(v => speciesLabels[v]).join(' · ')}</p><Space wrap>{overview.canManage && <><Button onClick={() => openProfile(s)}>Настроить грумера</Button><Button icon={<MobileOutlined />} onClick={() => onPhone(s.id)}>Подключить телефон</Button></>}</Space></Card>)}</div>}
    </Card>
    {overview.canManage && <GroomingWorkplaces overview={overview} refresh={refresh} />}
    <Card title="График грумеров" extra={overview.canSchedule && <Button onClick={() => openShift('new')} disabled={!overview.specialists.length || !overview.resources?.workplaces.length}>Добавить смену или перерыв</Button>}>
      <Space wrap><span>Месяц</span><Input type="month" aria-label="Месяц графика грумеров" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value); }} /></Space>
      <Typography.Paragraph type="secondary">Укажите грумера, рабочее место и часы. Календарь показывает месяц; в нём можно составить график сразу на несколько дней. Время МСК.</Typography.Paragraph>
      {shifts.isError && <Alert type="error" message={getErrorMessage(shifts.error)} />}
      <Table<Shift> rowKey="id" dataSource={shifts.data} scroll={{ x: 700 }} columns={[{ title: 'Грумер', render: (_, s) => s.employee.fullName }, { title: 'Рабочее место', render: (_, s) => overview.resources?.workplaces.find(w => w.id === s.workplaceId)?.name || 'Любое место студии' }, { title: 'Начало', dataIndex: 'startsAt', render: at }, { title: 'Окончание', dataIndex: 'endsAt', render: at }, { title: 'Интервал', dataIndex: 'kind', render: v => v === 'WORK' ? 'Рабочая смена' : 'Перерыв / выходной' }, ...(overview.canSchedule ? [{ title: '', render: (_: unknown, s: Shift) => <Button onClick={() => openShift(s)}>Изменить</Button> }] : [])]} />
    </Card>
    <Modal title={profile === 'new' ? 'Добавить грумера' : 'Настроить грумера'} open={Boolean(profile)} footer={null} onCancel={() => { setProfile(undefined); form.resetFields(); }} destroyOnHidden>
      <Form name="grooming-team-profile" form={form} layout="vertical" onFinish={save.mutate} autoComplete="off">
        {profile === 'new' ? <><Form.Item name="fullName" label="ФИО грумера" rules={[{ required: true, min: 2 }]}><Input maxLength={120} /></Form.Item><Form.Item name="phone" label="Телефон для входа"><Input type="tel" placeholder="+7…" /></Form.Item><Form.Item name="email" label="Email для входа" rules={[{ type: 'email' }]}><Input type="email" /></Form.Item><Typography.Paragraph type="secondary">Для входа нужен телефон или email.</Typography.Paragraph><Form.Item name="password" label="Временный пароль" rules={[{ required: true, min: 8 }]}><Input.Password autoComplete="new-password" /></Form.Item><Typography.Paragraph type="secondary">При первом входе грумер установит свой пароль.</Typography.Paragraph></> : <Form.Item name="displayName" label="Имя грумера" rules={[{ required: true }]}><Input maxLength={120} /></Form.Item>}
        <Form.Item name="species" label="Работает с" rules={[{ required: true }]}><Checkbox.Group options={options} /></Form.Item>
        <Form.Item name="maxUserId" label="MAX user_id для уведомлений"><Input /></Form.Item>
        {profile !== 'new' && <Form.Item name="isActive" label="Принимает записи" valuePropName="checked"><Switch /></Form.Item>}
        <Button type="primary" htmlType="submit" loading={save.isPending}>{profile === 'new' ? 'Создать грумера' : 'Сохранить'}</Button>
      </Form>
    </Modal>
    <Modal title="Смена грумера · МСК" open={Boolean(shift)} footer={null} onCancel={() => setShift(undefined)} destroyOnHidden><Form name="grooming-team-shift" form={shiftForm} layout="vertical" onFinish={saveShift.mutate}>
      <Form.Item name="employeeId" label="Грумер" rules={[{ required: true }]}><Select options={overview.specialists.map(s => ({ value: s.employeeId, label: s.displayName }))} /></Form.Item>
      <Form.Item name="locationId" label="Студия" rules={[{ required: true }]} hidden={overview.resources?.locations.length === 1}><Select options={overview.resources?.locations.map(l => ({ value: l.id, label: l.name }))} /></Form.Item>
      <Form.Item name="workplaceId" label="Рабочее место" rules={[{ required: true }]}><Select options={overview.resources?.workplaces.filter(w => w.locationId === locationId && w.isActive).map(w => ({ value: w.id, label: w.name }))} /></Form.Item>
      <Form.Item name="kind" label="Интервал" rules={[{ required: true }]}><Select options={[{ value: 'WORK', label: 'Рабочая смена' }, { value: 'BLOCK', label: 'Перерыв или выходной' }]} /></Form.Item>
      <Form.Item name="startsAt" trigger="onInput" label="Начало" rules={[{ required: true }]}><Input type="datetime-local" /></Form.Item><Form.Item name="endsAt" trigger="onInput" label="Окончание" rules={[{ required: true }]}><Input type="datetime-local" /></Form.Item>
      <Form.Item name="comment" label="Примечание"><Input /></Form.Item><Form.Item name="isActive" label="Интервал действует" valuePropName="checked"><Switch /></Form.Item><Button type="primary" htmlType="submit" loading={saveShift.isPending}>Сохранить смену</Button>
    </Form></Modal>
  </Space>;
}
