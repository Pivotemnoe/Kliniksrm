import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Alert, App, Button, Form, Modal, Select, Typography } from 'antd';
import { getErrorMessage } from '../../api/errors';
import { createOperationKey } from '../../shared/utils/operationKey';
import { Booking, at, groomingApi, groomingPrice } from './grooming.api';
import { durationLabel } from './GroomingServices';

export function GroomingBookingDuration({ booking, onClose, refresh }: { booking?: Booking; onClose: () => void; refresh: () => Promise<unknown> }) {
  return <Modal open={Boolean(booking)} title="Уточнить длительность записи" footer={null} onCancel={onClose} destroyOnHidden width={540}>
    {booking && <DurationForm booking={booking} done={async () => { await refresh(); onClose(); }} />}
  </Modal>;
}
function DurationForm({ booking, done }: { booking: Booking; done: () => Promise<void> }) {
  const [form] = Form.useForm(), { message } = App.useApp(), [attempt, setAttempt] = useState(createOperationKey), [error, setError] = useState('');
  const minutes = Form.useWatch('durationMinutes', form) || Math.max(30, Math.ceil((Date.parse(booking.endsAt) - Date.parse(booking.startsAt)) / 1800000) * 30);
  const mutation = useMutation({ mutationFn: (values: { durationMinutes: number }) => groomingApi.save(`bookings/${booking.id}/duration`, { ...values, version: booking.version, clientKey: attempt }, 'PATCH'), onSuccess: async () => { message.success('Длительность уточнена, календарь и оповещения обновлены'); await done(); }, onError: e => setError(getErrorMessage(e)) });
  return <Form name="grooming-booking-duration" form={form} layout="vertical" initialValues={{ durationMinutes: minutes }} onFinish={mutation.mutate} onValuesChange={() => { setError(''); setAttempt(createOperationKey()); }}>
    <Typography.Paragraph><strong>{booking.animal.nickname} · {booking.serviceTitle}</strong><br />{booking.employee.fullName} · {booking.workplace.name}<br />Начало: {at(booking.startsAt)} МСК · {groomingPrice(booking)}</Typography.Paragraph>
    <Form.Item name="durationMinutes" label="Длительность записи" rules={[{ required: true }]}><Select options={Array.from({ length: 16 }, (_, n) => ({ value: (n + 1) * 30, label: durationLabel((n + 1) * 30) }))} /></Form.Item>
    <Typography.Paragraph>Окончание: <strong>{at(new Date(Date.parse(booking.startsAt) + minutes * 60000).toISOString())} МСК</strong></Typography.Paragraph>
    <Alert type="info" showIcon message="Продление проверяется по расписанию" description="CRM проверит рабочие часы, перерывы и соседние записи. Уточнение появится в кабинетах и оповещениях участников записи." style={{ marginBottom: 16 }} />
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <Button type="primary" htmlType="submit" loading={mutation.isPending}>Сохранить длительность</Button>
  </Form>;
}
