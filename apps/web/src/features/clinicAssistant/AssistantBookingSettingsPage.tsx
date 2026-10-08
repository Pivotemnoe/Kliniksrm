import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Form, Select, Space, Switch, Tag, Typography } from 'antd';
import { InputNumber } from '../../shared/ui/DecimalInputNumber';
import { ProgressiveTable } from '../../shared/ui/InfiniteTable';
import { apiRequest } from '../../api/client';
import { useCurrentEmployee } from '../../auth/useAuth';
import { hasPermission } from '../../auth/permissions';
import { PageHeader } from '../../shared/ui/PageHeader';
type RuleInput = { officeId: string; serviceId: string; employeeId: string; roomId: string; isActive: boolean; durationMinutes: number; stepMinutes: number; minimumLeadMinutes: number; maximumDaysAhead: number };
type Rule = RuleInput & { id: string; office: { name: string }; service: { title: string }; employee: { fullName: string }; room: { name: string } };
type Resources = { offices: { id: string; name: string }[]; services: { id: string; title: string }[]; employees: { id: string; fullName: string }[]; rooms: { id: string; name: string; officeId: string }[] };
type Readiness = { enabled: boolean; totalRules: number; activeRules: number; eligibleRules: number; rulesWithShifts: number };
const defaults = { isActive: false, durationMinutes: 30, stepMinutes: 15, minimumLeadMinutes: 30, maximumDaysAhead: 14 };
export function AssistantBookingSettingsPage() {
  const { message } = App.useApp(), cache = useQueryClient(), { data: auth } = useCurrentEmployee();
  const canRead = hasPermission(auth?.employee, 'settings.read'), canManage = hasPermission(auth?.employee, 'settings.manage');
  const [form] = Form.useForm<RuleInput>(); const [editing, setEditing] = useState<string>();
  const officeId = Form.useWatch('officeId', form);
  const rules = useQuery({ queryKey: ['assistant-booking-rules'], queryFn: () => apiRequest<Rule[]>('/v1/assistant-booking/rules'), enabled: canRead });
  const resources = useQuery({ queryKey: ['assistant-booking-resources'], queryFn: () => apiRequest<Resources>('/v1/assistant-booking/resources'), enabled: canRead });
  const readiness = useQuery({ queryKey: ['assistant-booking-readiness'], queryFn: () => apiRequest<Readiness>('/v1/assistant-booking/readiness'), enabled: canRead });
  const save = useMutation({ mutationFn: (input: RuleInput) => apiRequest<Rule>(`/v1/assistant-booking/rules${editing ? `/${editing}` : ''}`, { method: editing ? 'PUT' : 'POST', body: input }), onSuccess: () => {
    void cache.invalidateQueries({ queryKey: ['assistant-booking-rules'] }); void cache.invalidateQueries({ queryKey: ['assistant-booking-readiness'] }); setEditing(undefined); form.resetFields(); message.success('Правило записи сохранено');
  }, onError: e => message.error(e.message) });
  const disable = useMutation({ mutationFn: (id: string) => apiRequest(`/v1/assistant-booking/rules/${id}/disable`, { method: 'POST' }), onSuccess: () => { void cache.invalidateQueries({ queryKey: ['assistant-booking-rules'] }); void cache.invalidateQueries({ queryKey: ['assistant-booking-readiness'] }); message.success('Самостоятельная запись по правилу отключена'); }, onError: e => message.error(e.message) });
  if (!canRead) return <Alert type="warning" message="Нет доступа к настройкам записи" />;
  return <div className="page">
    <PageHeader title="Запись из чата" description="Разрешённые услуги, врачи и кабинеты для самостоятельной записи владельцев." />
    <Alert showIcon type="info" message="Время проверяется по расписанию CRM" description="Ассистент учитывает смены врача, часы и перерывы филиала, занятые кабинеты. Новое правило выключено, пока вы его не включите." />
    {readiness.data ? <Alert showIcon type={readiness.data.enabled && readiness.data.rulesWithShifts ? 'success' : 'warning'}
      message={!readiness.data.enabled ? 'Самостоятельная запись выключена' : !readiness.data.eligibleRules ? 'Для самостоятельной записи нужно включить правило' : !readiness.data.rulesWithShifts ? 'У выбранных врачей нет будущих смен' : `Доступны ${readiness.data.eligibleRules} правил записи`}
      description={!readiness.data.enabled ? 'Заявки принимает администратор.' : !readiness.data.eligibleRules ? 'Выберите услугу, врача, кабинет и длительность приёма ниже. Пока правила не включены, заявки принимает администратор.' : !readiness.data.rulesWithShifts ? 'Добавьте смены врачей в расписании CRM. Пока смен нет, заявки принимает администратор.' : 'Свободное время будет предложено в пределах смен и с учётом уже созданных записей.'} /> : null}
    {rules.isError || resources.isError || readiness.isError ? <Alert type="error" message={rules.error?.message || resources.error?.message || readiness.error?.message} /> : null}
    <Card title={editing ? 'Изменить правило' : 'Новое правило'}>
      <Form form={form} layout="vertical" initialValues={defaults} disabled={!canManage || save.isPending} onFinish={values => save.mutate(values)}>
        <Form.Item name="officeId" label="Филиал" rules={[{ required: true }]}><Select aria-label="Филиал правила записи" showSearch optionFilterProp="label" options={resources.data?.offices.map(x => ({ value: x.id, label: x.name }))} onChange={() => form.setFieldValue('roomId', undefined)} /></Form.Item>
        <Form.Item name="serviceId" label="Опубликованная услуга" rules={[{ required: true }]}><Select aria-label="Услуга правила записи" showSearch optionFilterProp="label" options={resources.data?.services.map(x => ({ value: x.id, label: x.title }))} /></Form.Item>
        <Form.Item name="employeeId" label="Врач" rules={[{ required: true }]}><Select aria-label="Врач правила записи" showSearch optionFilterProp="label" options={resources.data?.employees.map(x => ({ value: x.id, label: x.fullName }))} /></Form.Item>
        <Form.Item name="roomId" label="Кабинет" rules={[{ required: true }]}><Select aria-label="Кабинет правила записи" options={resources.data?.rooms.filter(x => x.officeId === officeId).map(x => ({ value: x.id, label: x.name }))} /></Form.Item>
        <Space wrap align="start">
          <Form.Item name="durationMinutes" label="Длительность приёма, минут" rules={[{ required: true }]}><InputNumber aria-label="Длительность приёма" min={5} max={240} step={5} /></Form.Item>
          <Form.Item name="stepMinutes" label="Шаг времени, минут" rules={[{ required: true }]}><InputNumber aria-label="Шаг времени" min={5} max={60} step={5} /></Form.Item>
          <Form.Item name="minimumLeadMinutes" label="До приёма не менее, минут" rules={[{ required: true }]}><InputNumber aria-label="Минимальное время до приёма" min={0} max={10080} /></Form.Item>
          <Form.Item name="maximumDaysAhead" label="Запись вперёд, дней" rules={[{ required: true }]}><InputNumber aria-label="Горизонт записи" min={1} max={60} /></Form.Item>
        </Space>
        <Form.Item name="isActive" label="Разрешить самостоятельную запись" valuePropName="checked"><Switch aria-label="Разрешить самостоятельную запись" /></Form.Item>
        <Space><Button type="primary" htmlType="submit" loading={save.isPending}>Сохранить правило</Button>{editing ? <Button onClick={() => { setEditing(undefined); form.resetFields(); }}>Отмена изменения</Button> : null}</Space>
      </Form>
    </Card>
    <ProgressiveTable<Rule> rowKey="id" loading={rules.isLoading} dataSource={rules.data ?? []} scroll={{ x: 800 }} columns={[
      { title: 'Услуга', render: (_, row) => <><Typography.Text strong>{row.service.title}</Typography.Text><div>{row.office.name}</div></> },
      { title: 'Врач и кабинет', render: (_, row) => <>{row.employee.fullName}<div>{row.room.name}</div></> },
      { title: 'Время', render: (_, row) => `${row.durationMinutes} мин · шаг ${row.stepMinutes} мин · ${row.maximumDaysAhead} дней` },
      { title: 'Запись', render: (_, row) => <Tag color={row.isActive ? 'green' : 'default'}>{row.isActive ? 'Разрешена' : 'Выключена'}</Tag> },
      { title: 'Действия', render: (_, row) => canManage ? <Space><Button onClick={() => { setEditing(row.id); form.setFieldsValue(row); }}>Изменить</Button><Button disabled={!row.isActive} loading={disable.isPending && disable.variables === row.id} onClick={() => disable.mutate(row.id)}>Выключить</Button></Space> : null },
    ]} />
  </div>;
}
