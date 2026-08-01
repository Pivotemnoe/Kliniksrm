import { LaptopOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd';
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { enrollRemoteAccessDevice } from './remoteAccess.api';

type EnrollmentForm = { code: string; deviceName?: string };

export function RemoteAccessEnrollmentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCode = useMemo(() => searchParams.get('code') ?? '', [searchParams]);
  const mutation = useMutation({
    mutationFn: enrollRemoteAccessDevice,
    onSuccess: () => navigate('/login?remote=paired', { replace: true }),
  });

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <Space direction="vertical" size={18} className="full-width">
          <Space><SafetyCertificateOutlined style={{ fontSize: 28 }} /><div><Typography.Title level={3} style={{ margin: 0 }}>Подключение руководителя</Typography.Title><Typography.Text type="secondary">Удалённый доступ TemichevVet</Typography.Text></div></Space>
          <Alert type="info" showIcon message="Одноразовая привязка устройства" description="После привязки потребуется личный логин и пароль директора или управляющего. Данные клиники на этом устройстве не сохраняются." />
          {mutation.isError ? <Alert type="error" showIcon message={getErrorMessage(mutation.error)} /> : null}
          <Form<EnrollmentForm> layout="vertical" initialValues={{ code: initialCode }} onFinish={(values) => mutation.mutate(values)}>
            <Form.Item name="code" label="Код подключения" rules={[{ required: true, min: 20, message: 'Откройте полную ссылку или вставьте код' }]}><Input.Password autoComplete="one-time-code" /></Form.Item>
            <Form.Item name="deviceName" label="Название устройства"><Input prefix={<LaptopOutlined />} placeholder="Например, телефон директора" maxLength={120} /></Form.Item>
            <Button type="primary" htmlType="submit" block loading={mutation.isPending}>Привязать устройство</Button>
          </Form>
          <Typography.Text type="secondary">Если ссылка истекла, директор должен создать новую внутри локальной CRM.</Typography.Text>
        </Space>
      </Card>
    </div>
  );
}
