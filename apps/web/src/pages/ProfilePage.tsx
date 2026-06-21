import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, App, Button, Card, Descriptions, Form, Input, Space, Tag, Typography } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../api/errors';
import { isDemoAuthMode } from '../app/config';
import { useChangePasswordMutation, useCurrentEmployee } from '../auth/useAuth';
import { getDefaultRouteLabel } from '../shared/routes/defaultRoutes';
import { PageHeader } from '../shared/ui/PageHeader';

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Введите текущий пароль').max(200),
    newPassword: z.string().min(8, 'Минимум 8 символов').max(200),
    confirmPassword: z.string().min(1, 'Повторите новый пароль').max(200),
  })
  .superRefine((values, context) => {
    if (values.newPassword !== values.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Пароли не совпадают',
      });
    }
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

const roleLabels: Record<string, string> = {
  director: 'Директор',
  administrator: 'Администратор',
  doctor: 'Врач',
  assistant: 'Ассистент',
  cashier: 'Кассир',
  stock: 'Склад',
};

export function ProfilePage() {
  const { message } = App.useApp();
  const { data } = useCurrentEmployee();
  const employee = data?.employee;
  const changePasswordMutation = useChangePasswordMutation();
  const { control, handleSubmit, reset } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    await changePasswordMutation.mutateAsync({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
    reset();
    message.success('Пароль изменён');
  });

  return (
    <div className="page">
      <PageHeader title="Профиль" description="Учётная запись сотрудника и безопасность входа." />
      <div className="profile-grid">
        <Card title="Сотрудник">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="ФИО">{employee?.fullName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Телефон">{employee?.phone ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Должность">{employee?.position ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Раздел после входа">{getDefaultRouteLabel(employee?.defaultRoute)}</Descriptions.Item>
            <Descriptions.Item label="Статус">{employee?.status === 'ACTIVE' ? 'Активный' : employee?.status ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Роли">
              <Space wrap>
                {employee?.roles.map((role) => <Tag key={role}>{roleLabels[role] ?? role}</Tag>) ?? '—'}
              </Space>
            </Descriptions.Item>
          </Descriptions>
        </Card>
        <Card title="Смена пароля">
          <Space direction="vertical" size={16} className="full-width">
            {isDemoAuthMode ? (
              <Alert type="info" showIcon message="В тестовом режиме пароль не меняется." />
            ) : (
              <Alert
                type="info"
                showIcon
                message="После смены пароля текущая сессия останется активной, остальные сессии этого сотрудника будут закрыты."
              />
            )}
            {changePasswordMutation.isError ? (
              <Alert type="error" showIcon message={getErrorMessage(changePasswordMutation.error)} />
            ) : null}
            <Form layout="vertical" onFinish={onSubmit}>
              <Controller
                control={control}
                name="currentPassword"
                render={({ field, fieldState }) => (
                  <Form.Item
                    label="Текущий пароль"
                    validateStatus={fieldState.error ? 'error' : undefined}
                    help={fieldState.error?.message}
                  >
                    <Input.Password autoComplete="current-password" {...field} />
                  </Form.Item>
                )}
              />
              <Controller
                control={control}
                name="newPassword"
                render={({ field, fieldState }) => (
                  <Form.Item
                    label="Новый пароль"
                    validateStatus={fieldState.error ? 'error' : undefined}
                    help={fieldState.error?.message}
                  >
                    <Input.Password autoComplete="new-password" {...field} />
                  </Form.Item>
                )}
              />
              <Controller
                control={control}
                name="confirmPassword"
                render={({ field, fieldState }) => (
                  <Form.Item
                    label="Повтор нового пароля"
                    validateStatus={fieldState.error ? 'error' : undefined}
                    help={fieldState.error?.message}
                  >
                    <Input.Password autoComplete="new-password" {...field} />
                  </Form.Item>
                )}
              />
              <Space>
                <Button type="primary" htmlType="submit" loading={changePasswordMutation.isPending} disabled={isDemoAuthMode}>
                  Сохранить пароль
                </Button>
                <Typography.Text type="secondary">Минимум 8 символов.</Typography.Text>
              </Space>
            </Form>
          </Space>
        </Card>
      </div>
    </div>
  );
}
