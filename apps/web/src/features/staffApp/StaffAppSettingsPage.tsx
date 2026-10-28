import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Empty, Input, Space, Spin, Switch, Typography } from 'antd';
import { getErrorMessage } from '../../api/errors';
import { mobileApi, type MobileEmployee, type MobileSettings } from './staffApp.api';

export function StaffAppSettingsPage() {
  const query = useQuery({ queryKey: ['staff-app-settings'], queryFn: mobileApi.settings });
  const [search, setSearch] = useState('');
  return <section><Typography.Title level={2}>Приложение сотрудников</Typography.Title>
    <Typography.Paragraph>Выберите, что сотрудник может делать с телефона. Записи сразу появляются в общем расписании CRM.</Typography.Paragraph>
    <Alert type="info" message="В клинике остаются действующие рабочие права. Эти настройки разрешают отдельные действия с телефона и не открывают финансовые отчёты." />
    <Space direction="vertical" size={16} style={{ width: '100%', marginTop: 16 }}>
      <Input.Search aria-label="Найти сотрудника" placeholder="Имя сотрудника" value={search} onChange={event => setSearch(event.target.value)} allowClear />
      {query.isPending ? <Spin /> : query.isError ? <Alert type="error" message={getErrorMessage(query.error)} action={<Button onClick={() => void query.refetch()}>Повторить</Button>} />
        : !query.data?.length ? <Empty description="Нет сотрудников для настройки" /> : query.data.filter(employee => employee.fullName.toLowerCase().includes(search.toLowerCase())).map(employee => <EmployeeSettings key={`${employee.id}:${employee.updatedAt}`} employee={employee} />)}
    </Space></section>;
}
function EmployeeSettings({ employee }: { employee: MobileEmployee }) {
  const { message } = App.useApp(), client = useQueryClient();
  const [settings, setSettings] = useState<MobileSettings>(employee.settings);
  const save = useMutation({ mutationFn: () => mobileApi.saveSettings(employee, settings), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['staff-app-settings'] }); await client.invalidateQueries({ queryKey: ['auth'] }); message.success('Возможности приложения сохранены'); }, onError: error => message.error(getErrorMessage(error)) });
  const labels: [keyof MobileSettings, string, boolean][] = [['enabled', 'Доступ к приложению', true],
    ['clinicBooking', 'Запись в клинику с телефона', employee.canClinicBook], ['groomingBooking', 'Создание и перенос своих записей грумера', employee.canGroomingBook], ['notifications', 'Уведомления', true]];
  return <Card title={employee.fullName} extra={<Typography.Text type="secondary">{employee.position || 'Сотрудник'}</Typography.Text>}>
    <Space direction="vertical" size={16} style={{ width: '100%' }}>{labels.filter(([, , available]) => available).map(([key, label]) => <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <span>{label}</span><Switch aria-label={`${label}: ${employee.fullName}`} checked={settings[key]} disabled={save.isPending} onChange={value => setSettings(current => ({ ...current, [key]: value }))} />
    </div>)}<Button type="primary" loading={save.isPending} disabled={JSON.stringify(settings) === JSON.stringify(employee.settings)} onClick={() => save.mutate()}>Сохранить</Button></Space>
  </Card>;
}
