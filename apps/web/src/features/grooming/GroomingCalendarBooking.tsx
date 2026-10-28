import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Form, Input, Select, Typography } from 'antd';
import { getErrorMessage } from '../../api/errors';
import { createOperationKey } from '../../shared/utils/operationKey';
import { Booking, Overview, Shift, day, groomingApi, groomingPrice, time } from './grooming.api';
import { durationLabel } from './GroomingServices';
const localInput = (stamp: string) => `${day(stamp)}T${time(stamp)}`;
const iso = (value: string) => new Date(`${value}:00+03:00`).toISOString();
export function GroomingCalendarBooking({ overview, actorId, initialShift, initialStart, initialServiceId, existing, done, onSchedule }: { overview: Overview; actorId: string; initialShift?: Shift; initialStart?: string; initialServiceId?: string; existing?: Booking; done: () => Promise<void>; onSchedule: () => void }) {
  const [form] = Form.useForm(), { message } = App.useApp(), [error, setError] = useState(''), [search, setSearch] = useState(''), [ownerId, setOwnerId] = useState(existing?.ownerId || ''), [attempt, setAttempt] = useState(createOperationKey);
  const start = Form.useWatch('startsAt', form), end = Form.useWatch('endsAt', form), periodId = Form.useWatch('workPeriodId', form), serviceId = Form.useWatch('serviceId', form), selectedDate = start?.slice(0, 10) || day(new Date());
  const lower = new Date(`${selectedDate}T00:00:00+03:00`), upper = new Date(+lower + 86400000);
  const shifts = useQuery({ queryKey: ['grooming', actorId, 'booking-periods', selectedDate], queryFn: () => groomingApi.shifts(lower.toISOString(), upper.toISOString()) });
  const periods = (shifts.data || []).filter(s => s.isActive && s.kind === 'WORK' && s.workplaceId);
  const knownPeriods = initialShift && !periods.some(p => p.id === initialShift.id) && Date.parse(initialShift.endsAt) > +lower && Date.parse(initialShift.startsAt) < +upper ? [initialShift, ...periods] : periods;
  const period = knownPeriods.find(s => s.id === periodId), clients = useQuery({ queryKey: ['grooming', actorId, 'calendar-client-search', search], queryFn: () => groomingApi.clients(search) });
  const owner = clients.data?.find(c => c.id === ownerId), services = overview.resources?.services.filter(s => s.isActive) || [], service = services.find(s => s.id === serviceId);
  useEffect(() => {
    const begins = existing?.startsAt || initialStart || new Date(`${day(new Date())}T12:00:00+03:00`).toISOString();
    const minutes = existing ? Math.max(30, Math.ceil((Date.parse(existing.endsAt) - Date.parse(existing.startsAt)) / 1800000) * 30) : initialShift ? Math.max(30, Math.min(60, Math.floor((Date.parse(initialShift.endsAt) - Date.parse(begins)) / 1800000) * 30)) : 60;
    form.setFieldsValue({ startsAt: localInput(begins), endsAt: localInput(new Date(Date.parse(begins) + minutes * 60000).toISOString()), durationMinutes: minutes, workPeriodId: initialShift?.id, animalId: existing?.animalId, serviceId: initialServiceId || (existing ? overview.rules.find(r => r.id === existing.ruleId)?.serviceId : undefined), notes: existing?.notes || '' });
  }, [form, initialShift, initialStart, initialServiceId, existing]);
  useEffect(() => {
    if (!periodId && knownPeriods.length === 1) form.setFieldValue('workPeriodId', knownPeriods[0].id);
    else if (!periodId && existing) { const same = knownPeriods.find(p => p.employeeId === existing.employeeId && p.workplaceId === existing.workplaceId); if (same) form.setFieldValue('workPeriodId', same.id); }
  }, [form, periodId, shifts.data, existing]);
  const save = useMutation({ mutationFn: async (values: Record<string, string | number>) => {
    if (!period) throw Error('Выберите смену грумера с местом в салоне');
    const minutes = (Date.parse(iso(String(values.endsAt))) - Date.parse(iso(String(values.startsAt)))) / 60000;
    if (minutes < 30 || minutes > 480 || minutes % 30) throw Error('Длительность должна быть от 30 минут до 8 часов с шагом полчаса');
    return groomingApi.save(existing ? `calendar/bookings/${existing.id}` : 'calendar/bookings', { clientKey: attempt, workPeriodId: period.id, workPeriodVersion: period.version, ownerId, animalId: values.animalId, serviceId: values.serviceId, startsAt: iso(String(values.startsAt)), durationMinutes: minutes, notes: values.notes || '', contactConsent: true, bookingConsent: true, ...(existing ? { version: existing.version } : {}) }, existing ? 'PATCH' : 'POST');
  }, onSuccess: async () => { message.success('Запись сохранена в календаре'); await done(); }, onError: e => setError(getErrorMessage(e)) });
  const change = (changed: Record<string, unknown>) => {
    setAttempt(createOperationKey()); setError('');
    if (changed.startsAt || changed.durationMinutes) { const begins = form.getFieldValue('startsAt'), minutes = form.getFieldValue('durationMinutes'); if (begins && minutes && Number.isFinite(Date.parse(`${begins}:00+03:00`))) form.setFieldValue('endsAt', localInput(new Date(Date.parse(iso(begins)) + minutes * 60000).toISOString())); }
    if (changed.endsAt) { const begins = form.getFieldValue('startsAt'), ends = form.getFieldValue('endsAt'); if (begins && ends) { const minutes = (Date.parse(`${ends}:00+03:00`) - Date.parse(`${begins}:00+03:00`)) / 60000; if (minutes >= 30 && minutes <= 480 && minutes % 30 === 0) form.setFieldValue('durationMinutes', minutes); } }
    if (changed.startsAt && period && (!String(changed.startsAt).startsWith(day(period.startsAt)) && !String(changed.startsAt).startsWith(day(period.endsAt)))) form.setFieldValue('workPeriodId', undefined);
  };
  return <Form form={form} name="grooming-calendar-booking" layout="vertical" onFinish={save.mutate} onValuesChange={change} disabled={save.isPending}>
    <Alert type="info" showIcon message="Любая услуга — на выбранный интервал" description="Грумер и место берутся из смены. Длительность этой записи можно менять с шагом полчаса; настройки услуги на сайте не изменятся." style={{ marginBottom: 16 }} />
    <div className="grooming-compose-grid"><Form.Item name="startsAt" label="Начало записи, МСК" trigger="onInput" rules={[{ required: true }]}><Input type="datetime-local" step={1800} /></Form.Item><Form.Item name="endsAt" label="Окончание записи, МСК" trigger="onInput" rules={[{ required: true }]}><Input type="datetime-local" step={1800} /></Form.Item></div>
    <Form.Item name="durationMinutes" label="Длительность этой записи" rules={[{ required: true }]}><Select options={Array.from({ length: 16 }, (_, n) => ({ value: (n + 1) * 30, label: durationLabel((n + 1) * 30) }))} /></Form.Item>
    <Form.Item name="workPeriodId" label="Грумер и место в расписании" rules={[{ required: true, message: 'Назначьте грумера на место и часы' }]}><Select loading={shifts.isLoading} options={knownPeriods.map(p => ({ value: p.id, label: `${p.employee.fullName} · ${p.workplace?.name || overview.resources?.workplaces.find(w => w.id === p.workplaceId)?.name || 'Место в салоне'} · ${time(p.startsAt)}–${time(p.endsAt)}` }))} /></Form.Item>
    {!shifts.isLoading && !knownPeriods.length && <Alert type="info" showIcon message="На эту дату нет смен с назначенным местом" description={<Button type="link" onClick={onSchedule}>Назначить грумера в календаре</Button>} style={{ marginBottom: 16 }} />}
    <Form.Item name="serviceId" label="Услуга" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={services.map(s => ({ value: s.id, label: `${s.title} · ${groomingPrice(s)}` }))} /></Form.Item>
    <Form.Item label="Владелец" required><Select aria-label="Владелец" showSearch filterOption={false} onSearch={setSearch} placeholder="Найдите владельца по имени или телефону" value={ownerId || undefined} onChange={id => { setOwnerId(id); form.setFieldValue('animalId', undefined); setAttempt(createOperationKey()); }} disabled={Boolean(existing)} options={[...(existing && !clients.data?.some(c => c.id === existing.ownerId) ? [{ value: existing.ownerId, label: existing.owner?.fullName || 'Владелец записи' }] : []), ...(clients.data || []).map(c => ({ value: c.id, label: `${c.fullName}${c.phone ? ' · ' + c.phone : ''}` }))]} /></Form.Item>
    <Form.Item name="animalId" label="Питомец" rules={[{ required: true }]}><Select disabled={Boolean(existing)} options={(owner?.animals || (existing ? [existing.animal] : [])).map(p => ({ value: p.id, label: p.nickname }))} /></Form.Item>
    <Form.Item name="notes" label="Пожелания"><Input.TextArea maxLength={2000} /></Form.Item>
    {service && <Typography.Paragraph>Цена по прайсу: {existing && overview.rules.find(r => r.id === existing.ruleId)?.serviceId === service.id ? groomingPrice(existing) : groomingPrice(service)}.</Typography.Paragraph>}
    {start && end && <Typography.Paragraph><strong>{start.slice(11)}–{end.slice(11)}</strong> · {period?.employee.fullName || 'Выберите грумера и место'} · {service?.title || 'Выберите услугу'}</Typography.Paragraph>}
    <Typography.Paragraph type="secondary">При сохранении CRM проверит весь интервал, занятость грумера и места. Подтверждая запись, администратор подтверждает согласованное время и возможность связи с владельцем.</Typography.Paragraph>
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <Button type="primary" htmlType="submit" loading={save.isPending} disabled={!ownerId || !period}>{existing ? 'Сохранить перенос' : 'Сохранить запись в календаре'}</Button>
  </Form>;
}
