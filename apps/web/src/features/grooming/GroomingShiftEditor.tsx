import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Form, Input, Modal, Select, Switch } from 'antd';
import { getErrorMessage } from '../../api/errors';
import { Overview, Shift, day, groomingApi, time } from './grooming.api';

type Selection = { shift: Shift; pause?: boolean };
const localInput = (stamp: string) => `${day(stamp)}T${time(stamp)}`;
export function GroomingShiftEditor({ selection, overview, onClose }: { selection?: Selection; overview: Overview; onClose: () => void }) {
  return <Modal title={selection?.pause ? 'Перерыв грумера' : 'Изменить рабочие часы'} open={Boolean(selection)} onCancel={onClose} footer={null} destroyOnHidden width={600}>
    {selection && <ShiftForm selection={selection} overview={overview} onClose={onClose} />}
  </Modal>;
}
function ShiftForm({ selection: { shift, pause }, overview, onClose }: { selection: Selection; overview: Overview; onClose: () => void }) {
  const [form] = Form.useForm(), { message } = App.useApp(), client = useQueryClient(), [error, setError] = useState('');
  const locationId = Form.useWatch('locationId', form), kind = Form.useWatch('kind', form);
  const save = useMutation({ mutationFn: (values: Record<string, string | boolean>) => groomingApi.save(pause ? 'shifts' : `shifts/${shift.id}`, {
    ...values, employeeId: shift.employeeId, workplaceId: values.workplaceId || undefined,
    startsAt: `${values.startsAt}:00+03:00`, endsAt: `${values.endsAt}:00+03:00`,
    ...(!pause ? { version: shift.version } : {}),
  }, pause ? 'POST' : 'PATCH'), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['grooming'] }); message.success(pause ? 'Перерыв добавлен в календарь' : 'Рабочие часы сохранены'); onClose(); }, onError: e => setError(getErrorMessage(e)) });
  return <Form form={form} name="grooming-calendar-shift" layout="vertical" onFinish={save.mutate} onValuesChange={() => setError('')} initialValues={{ locationId: shift.locationId, workplaceId: shift.workplaceId, kind: pause ? 'BLOCK' : shift.kind, startsAt: localInput(shift.startsAt), endsAt: localInput(pause ? new Date(Math.min(Date.parse(shift.endsAt), Date.parse(shift.startsAt) + 1800000)).toISOString() : shift.endsAt), isActive: true, comment: pause ? '' : shift.comment || '' }}>
    <Alert type="info" showIcon message={shift.employee.fullName} description={pause ? 'Укажите время перерыва. CRM проверит, нет ли на этот интервал записей.' : 'Изменения не должны оставлять существующие записи без грумера и места.'} style={{ marginBottom: 16 }} />
    <Form.Item name="locationId" label="Студия" hidden={overview.resources?.locations.length === 1} rules={[{ required: true }]}><Select onChange={() => form.setFieldValue('workplaceId', undefined)} options={overview.resources?.locations.filter(l => l.isActive).map(l => ({ value: l.id, label: l.name }))} /></Form.Item>
    <Form.Item name="workplaceId" label="Место в салоне" rules={[{ required: kind === 'WORK' }]}><Select allowClear={kind === 'BLOCK'} placeholder="Всё расписание грумера" options={overview.resources?.workplaces.filter(w => w.locationId === locationId && w.isActive).map(w => ({ value: w.id, label: w.name }))} /></Form.Item>
    <Form.Item name="kind" hidden><Input /></Form.Item>
    <div className="grooming-compose-grid"><Form.Item name="startsAt" label="Начало, МСК" trigger="onInput" rules={[{ required: true }]}><Input type="datetime-local" step={1800} /></Form.Item><Form.Item name="endsAt" label="Окончание, МСК" trigger="onInput" rules={[{ required: true }]}><Input type="datetime-local" step={1800} /></Form.Item></div>
    <Form.Item name="comment" label="Примечание"><Input maxLength={500} /></Form.Item>
    {!pause && <Form.Item name="isActive" label={shift.kind === 'BLOCK' ? 'Перерыв действует' : 'Смена действует'} valuePropName="checked"><Switch /></Form.Item>}
    {pause && <Form.Item name="isActive" hidden valuePropName="checked"><Switch /></Form.Item>}
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <Button type="primary" htmlType="submit" loading={save.isPending}>Сохранить в календаре</Button>
  </Form>;
}
