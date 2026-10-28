import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Input, Popconfirm, QRCode, Select, Space, Table, Tag, Typography } from 'antd';
import { MobileOutlined } from '@ant-design/icons';
import { apiRequest } from '../../api/client';
import { getErrorMessage } from '../../api/errors';
import { at } from './grooming.api';
type Groomer = { id: string; employeeId: string; displayName: string; isActive: boolean; login: string; pushDevices: number };
type Phone = { id: string; employeeId: string; name: string; lastSeenAt?: string; revokedAt?: string; pushConnected: boolean };
type Overview = { available: boolean; groomers: Groomer[]; devices: Phone[] };
type Invitation = { enrollmentUrl: string; expiresAt: string; employee: { fullName: string } };
export function GroomingPhones({ actorId, selectedId }: { actorId: string; selectedId?: string }) {
  const { message } = App.useApp(), client = useQueryClient();
  const query = useQuery({ queryKey: ['grooming', actorId, 'phones'], queryFn: () => apiRequest<Overview>('/v1/grooming/phones'), refetchInterval: 15000 });
  const [selected, setSelected] = useState<string>(), [name, setName] = useState('Телефон грумера'), [invitation, setInvitation] = useState<Invitation>();
  useEffect(() => { setSelected(query.data?.groomers.find(g => g.id === selectedId)?.employeeId); setInvitation(undefined); }, [selectedId, query.data?.groomers.length]);
  const issue = useMutation({ mutationFn: () => apiRequest<Invitation>('/v1/grooming/phones/invitations', { method: 'POST', body: { employeeId: selected, deviceName: name } }), onSuccess: setInvitation, onError: e => message.error(getErrorMessage(e)) });
  const revoke = useMutation({ mutationFn: (id: string) => apiRequest(`/v1/grooming/phones/devices/${encodeURIComponent(id)}`, { method: 'DELETE' }), onSuccess: () => client.invalidateQueries({ queryKey: ['grooming', actorId, 'phones'] }), onError: e => message.error(getErrorMessage(e)) });
  return <Card title={<Space><MobileOutlined />Телефоны грумеров</Space>}><Space direction="vertical" size={16} className="full-width">
    <Typography.Paragraph>Выберите созданного грумера и подготовьте ссылку для его телефона. По ссылке он привяжет устройство, войдёт в свой кабинет, установит приложение и включит уведомления.</Typography.Paragraph>
    {query.isError && <Alert type="error" message={getErrorMessage(query.error)} />}
    {!query.isLoading && !query.data?.groomers.length && <Alert type="info" showIcon message="Сначала создайте грумера" description="В разделе «Грумеры и график» нажмите «Добавить грумера»." />}
    {query.data && !query.data.available && <Alert type="info" showIcon message="Подключение телефонов ещё не настроено" description="Нужны адрес защищённого доступа и включённая привязка устройств. Локальные записи и график уже доступны." />}
    <Select aria-label="Грумер для подключения телефона" placeholder="Выберите грумера" value={selected} onChange={value => { setSelected(value); setInvitation(undefined); }} options={query.data?.groomers.filter(g => g.isActive).map(g => ({ value: g.employeeId, label: `${g.displayName} · ${g.login}` }))} className="full-width" />
    <Input aria-label="Название телефона грумера" value={name} onChange={e => setName(e.target.value)} maxLength={120} />
    <Button type="primary" disabled={!selected || !query.data?.available || name.trim().length < 2} loading={issue.isPending} onClick={() => issue.mutate()}>Создать ссылку подключения</Button>
    {invitation && <Card size="small" title={`Телефон: ${invitation.employee.fullName}`}><Space direction="vertical" size={12} className="full-width"><QRCode value={invitation.enrollmentUrl} /><Typography.Text>Одноразовая ссылка действует до {at(invitation.expiresAt)}.</Typography.Text><Input.TextArea aria-label="Ссылка подключения телефона грумера" value={invitation.enrollmentUrl} readOnly autoSize /><Typography.Text copyable={{ text: invitation.enrollmentUrl }}>Скопировать ссылку для грумера</Typography.Text><Typography.Paragraph type="secondary">После привязки нужны личный логин и пароль грумера. Уведомления разрешаются на самом телефоне.</Typography.Paragraph></Space></Card>}
    <Table<Phone> rowKey="id" dataSource={query.data?.devices} scroll={{ x: 560 }} pagination={false} locale={{ emptyText: 'Телефоны ещё не подключены' }} columns={[{ title: 'Грумер', render: (_, d) => query.data?.groomers.find(g => g.employeeId === d.employeeId)?.displayName }, { title: 'Телефон', dataIndex: 'name' }, { title: 'Последний вход', dataIndex: 'lastSeenAt', render: v => v ? at(v) : 'Ещё не входил' }, { title: 'Доступ', render: (_, d) => <Tag color={d.revokedAt ? undefined : 'green'}>{d.revokedAt ? 'Отозван' : 'Подключён'}</Tag> }, { title: 'Оповещения', render: (_, d) => d.revokedAt ? '—' : d.pushConnected ? <Tag color="green">Подключены</Tag> : 'Включить на телефоне' }, { title: '', render: (_, d) => !d.revokedAt && <Popconfirm title="Отключить этот телефон грумера?" onConfirm={() => revoke.mutate(d.id)}><Button danger size="small">Отключить</Button></Popconfirm> }]} />
    <Typography.Paragraph type="secondary">Новая запись, уточнение длительности, перенос и отмена поступают назначенному грумеру. Его кабинет показывает собственное расписание и записи.</Typography.Paragraph>
  </Space></Card>;
}
