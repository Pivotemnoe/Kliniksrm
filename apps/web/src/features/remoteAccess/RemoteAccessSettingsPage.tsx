import { CopyOutlined, LaptopOutlined, LinkOutlined, SafetyCertificateOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Descriptions, Form, Input, InputNumber, Popconfirm, QRCode, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { ProgressiveTable } from '../../shared/ui/InfiniteTable';
import { formatDateTime } from '../../shared/utils/date';
import {
  createRemoteAccessInvitation,
  getRemoteAccessOverview,
  revokeAllRemoteAccessDevices,
  revokeRemoteAccessDevice,
  revokeRemoteAccessInvitation,
  updateRemoteAccessPolicy,
} from './remoteAccess.api';
import type { RemoteAccessInvitationResult, RemoteAccessOverview } from './types';

type InvitationForm = { employeeId: string; deviceName?: string };
type DeviceRow = RemoteAccessOverview['devices'][number];
type InvitationRow = RemoteAccessOverview['invitations'][number];

export function RemoteAccessSettingsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'remote_access.manage');
  const [form] = Form.useForm<InvitationForm>();
  const [freshInvitation, setFreshInvitation] = useState<RemoteAccessInvitationResult | null>(null);
  const overviewQuery = useQuery({ queryKey: ['remote-access'], queryFn: getRemoteAccessOverview });
  const overview = overviewQuery.data;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['remote-access'] });

  const policyMutation = useMutation({
    mutationFn: updateRemoteAccessPolicy,
    onSuccess: async () => { await refresh(); message.success('Настройки удалённого доступа сохранены'); },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const invitationMutation = useMutation({
    mutationFn: createRemoteAccessInvitation,
    onSuccess: async (result) => {
      setFreshInvitation(result);
      form.resetFields();
      await refresh();
      message.success('Одноразовая ссылка создана');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const revokeDeviceMutation = useMutation({
    mutationFn: revokeRemoteAccessDevice,
    onSuccess: async () => { await refresh(); message.success('Доступ устройства отозван'); },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const revokeInvitationMutation = useMutation({
    mutationFn: revokeRemoteAccessInvitation,
    onSuccess: async () => { await refresh(); message.success('Приглашение отменено'); },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const revokeAllMutation = useMutation({
    mutationFn: revokeAllRemoteAccessDevices,
    onSuccess: async (result) => { await refresh(); message.success(`Отключено устройств: ${result.count}`); },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const deviceColumns = useMemo<ColumnsType<DeviceRow>>(() => [
    {
      title: 'Устройство', key: 'device', render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Space><Typography.Text strong>{row.name}</Typography.Text>{row.current ? <Tag color="blue">Это устройство</Tag> : null}</Space>
          <Typography.Text type="secondary">{row.employee.fullName}{row.employee.position ? ` · ${row.employee.position}` : ''}</Typography.Text>
        </Space>
      ),
    },
    { title: 'Привязано', dataIndex: 'trustedAt', width: 165, render: formatDateTime },
    { title: 'Последний вход', dataIndex: 'lastSeenAt', width: 165, render: (value) => value ? formatDateTime(value) : 'Ещё не входили' },
    { title: 'Адрес', dataIndex: 'lastIpAddress', width: 145, render: (value) => value || '—' },
    { title: 'Статус', width: 125, render: (_, row) => row.revokedAt ? <Tag>Отключено</Tag> : <Tag color="green">Разрешено</Tag> },
    {
      title: '', width: 125, render: (_, row) => row.revokedAt ? null : (
        <Popconfirm title="Отключить это устройство?" description="Все его удалённые сеансы завершатся сразу." okText="Отключить" cancelText="Отмена" onConfirm={() => revokeDeviceMutation.mutate(row.id)}>
          <Button danger size="small" icon={<StopOutlined />} disabled={!canManage}>Отключить</Button>
        </Popconfirm>
      ),
    },
  ], [canManage, revokeDeviceMutation]);

  const invitationColumns = useMemo<ColumnsType<InvitationRow>>(() => [
    { title: 'Руководитель', key: 'employee', render: (_, row) => row.employee.fullName },
    { title: 'Устройство', dataIndex: 'deviceName', render: (value) => value || 'Будет названо при подключении' },
    { title: 'Создано', dataIndex: 'createdAt', width: 165, render: formatDateTime },
    { title: 'Действует до', dataIndex: 'expiresAt', width: 165, render: formatDateTime },
    {
      title: 'Статус', width: 140, render: (_, row) => {
        if (row.revokedAt) return <Tag>Отменено</Tag>;
        if (row.usedAt) return <Tag color="green">Использовано</Tag>;
        if (new Date(row.expiresAt).getTime() <= Date.now()) return <Tag>Истекло</Tag>;
        return <Tag color="blue">Ожидает</Tag>;
      },
    },
    {
      title: '', width: 110, render: (_, row) => row.usedAt || row.revokedAt || new Date(row.expiresAt).getTime() <= Date.now() ? null : (
        <Button danger size="small" onClick={() => revokeInvitationMutation.mutate(row.id)} disabled={!canManage}>Отменить</Button>
      ),
    },
  ], [canManage, revokeInvitationMutation]);

  return (
    <div className="page">
      <PageHeader title="Удалённый доступ" description="Защищённый вход директора и управляющего вне локальной сети клиники." />
      <Space direction="vertical" size={16} className="full-width">
        {overviewQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(overviewQuery.error)} /> : null}
        <Alert
          type={overview?.gateway.configured ? 'success' : 'warning'}
          showIcon
          message={overview?.gateway.configured ? 'Российский шлюз подготовлен' : 'Внешний шлюз пока не настроен'}
          description={overview?.gateway.configured
            ? `Вход руководителя будет выполняться через ${overview.gateway.publicUrl}. База и документы остаются на сервере клиники.`
            : 'CRM не открыта напрямую в интернет. До отдельного безопасного развёртывания можно подготовить интерфейс, но включение доступа заблокировано.'}
        />

        <Card title={<Space><SafetyCertificateOutlined />Защита доступа</Space>} loading={overviewQuery.isLoading}>
          <Descriptions bordered column={{ xs: 1, md: 2 }}>
            <Descriptions.Item label="Состояние">
              <Space><Switch checked={overview?.policy.enabled} disabled={!canManage || policyMutation.isPending} onChange={(enabled) => policyMutation.mutate({ enabled })} />{overview?.policy.enabled ? <Tag color="green">Включён</Tag> : <Tag>Выключен</Tag>}</Space>
            </Descriptions.Item>
            <Descriptions.Item label="Адрес входа">{overview?.gateway.publicUrl ? <Typography.Text copyable>{overview.gateway.publicUrl}</Typography.Text> : 'Будет задан при развёртывании'}</Descriptions.Item>
            <Descriptions.Item label="Привязка устройства">Одноразовая ссылка, затем личный пароль руководителя</Descriptions.Item>
            <Descriptions.Item label="Хранение данных">Только TECNO в клинике</Descriptions.Item>
            <Descriptions.Item label="Ссылка действует">
              <InputNumber min={5} max={30} value={overview?.policy.enrollmentTtlMinutes} disabled={!canManage} addonAfter="мин" onChange={(value) => value && policyMutation.mutate({ enrollmentTtlMinutes: value })} />
            </Descriptions.Item>
            <Descriptions.Item label="Бездействие до выхода">
              <InputNumber min={5} max={60} value={overview?.policy.idleTimeoutMinutes} disabled={!canManage} addonAfter="мин" onChange={(value) => value && policyMutation.mutate({ idleTimeoutMinutes: value })} />
            </Descriptions.Item>
          </Descriptions>
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            Новое устройство разрешается только из локальной CRM. Руководитель входит под своей учётной записью; общий пароль клиники не используется. Все входы и отзывы записываются в журнал аудита.
          </Typography.Paragraph>
        </Card>

        <Card title={<Space><LinkOutlined />Подключить устройство руководителя</Space>}>
          <Form<InvitationForm> form={form} layout="inline" onFinish={(values) => invitationMutation.mutate(values)}>
            <Form.Item name="employeeId" label="Руководитель" rules={[{ required: true, message: 'Выберите сотрудника' }]}>
              <Select
                style={{ width: 310 }}
                placeholder="Директор или управляющий"
                options={(overview?.eligibleEmployees ?? []).map((employee) => ({ value: employee.id, label: `${employee.fullName}${employee.position ? ` · ${employee.position}` : ''}` }))}
              />
            </Form.Item>
            <Form.Item name="deviceName" label="Название"><Input style={{ width: 230 }} placeholder="Например, iPhone директора" maxLength={120} /></Form.Item>
            <Form.Item><Button type="primary" htmlType="submit" disabled={!canManage || !overview?.policy.enabled || !overview?.gateway.configured} loading={invitationMutation.isPending}>Создать одноразовую ссылку</Button></Form.Item>
          </Form>
          {freshInvitation ? (
            <Alert
              style={{ marginTop: 16 }}
              type="success"
              showIcon
              message={`Ссылка для ${freshInvitation.employee.fullName}`}
              description={<Space align="start" size={18} wrap>
                <QRCode value={freshInvitation.enrollmentUrl} size={132} />
                <Space direction="vertical">
                  <Typography.Text>Откройте ссылку на устройстве руководителя до {formatDateTime(freshInvitation.expiresAt)}.</Typography.Text>
                  <Typography.Text copyable={{ text: freshInvitation.enrollmentUrl }} code>{freshInvitation.enrollmentUrl}</Typography.Text>
                  <Button icon={<CopyOutlined />} onClick={() => navigator.clipboard.writeText(freshInvitation.enrollmentUrl)}>Скопировать ссылку</Button>
                  <Typography.Text type="secondary">После обновления страницы ссылка больше не показывается. При необходимости создайте новую — предыдущая отменяется.</Typography.Text>
                </Space>
              </Space>}
            />
          ) : null}
        </Card>

        <Card
          title={<Space><LaptopOutlined />Доверенные устройства</Space>}
          extra={<Popconfirm title="Отключить все устройства?" description="Все удалённые сеансы завершатся. Локальная работа CRM продолжится." okText="Отключить все" cancelText="Отмена" onConfirm={() => revokeAllMutation.mutate()}><Button danger disabled={!canManage || !(overview?.devices.some((device) => !device.revokedAt))}>Отключить все</Button></Popconfirm>}
        >
          <ProgressiveTable rowKey="id" dataSource={overview?.devices ?? []} columns={deviceColumns} loading={overviewQuery.isLoading} scroll={{ x: 980 }} />
        </Card>

        <Card title="Последние приглашения">
          <ProgressiveTable rowKey="id" dataSource={overview?.invitations ?? []} columns={invitationColumns} loading={overviewQuery.isLoading} scroll={{ x: 850 }} />
        </Card>
      </Space>
    </div>
  );
}
