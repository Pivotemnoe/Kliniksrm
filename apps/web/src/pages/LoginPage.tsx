import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { appConfig } from '../app/config';
import { getErrorMessage } from '../api/errors';
import { logout } from '../auth/auth.api';
import { authQueryKey, useCurrentEmployee, useLoginMutation } from '../auth/useAuth';
import { getEmployeeDefaultRoute } from '../shared/routes/defaultRoutes';

const loginSchema = z.object({
  login: z.string().min(2, 'Введите телефон или email'),
  password: z.string().min(1, 'Введите пароль'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

type LocationState = {
  from?: {
    pathname?: string;
  };
  reason?: 'idle';
};

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const state = location.state as LocationState | null;
  const searchParams = new URLSearchParams(location.search);
  const forceLogin = searchParams.get('force') === '1';
  const separateLogin = searchParams.get('separate') === '1';
  const [isClearingSession, setIsClearingSession] = useState(forceLogin);
  const { data, isLoading } = useCurrentEmployee();
  const loginMutation = useLoginMutation();
  const { control, handleSubmit } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      login: '',
      password: '',
    },
  });

  useEffect(() => {
    if (!forceLogin) {
      return;
    }

    let active = true;
    logout()
      .catch(() => undefined)
      .finally(() => {
        queryClient.removeQueries({ queryKey: authQueryKey });
        if (active) {
          setIsClearingSession(false);
        }
      });

    return () => {
      active = false;
    };
  }, [forceLogin, queryClient]);

  if (!forceLogin && !isLoading && data?.employee) {
    return <Navigate to={state?.from?.pathname ?? getEmployeeDefaultRoute(data.employee)} replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    const result = await loginMutation.mutateAsync(values);
    navigate(state?.from?.pathname ?? getEmployeeDefaultRoute(result.employee), { replace: true });
  });

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="login-copy">
          <img src={appConfig.logoUrl} alt={`${appConfig.brandName} logo`} className="login-logo" />
          <Typography.Text>Внутренняя CRM ветеринарной клиники</Typography.Text>
        </div>
        <Card className="login-card">
          <Form layout="vertical" onFinish={onSubmit}>
            <Controller
              control={control}
              name="login"
              render={({ field, fieldState }) => (
                <Form.Item
                  label="Телефон или email"
                  validateStatus={fieldState.error ? 'error' : undefined}
                  help={fieldState.error?.message}
                >
                  <Input autoComplete="username" size="large" {...field} />
                </Form.Item>
              )}
            />
            <Controller
              control={control}
              name="password"
              render={({ field, fieldState }) => (
                <Form.Item
                  label="Пароль"
                  validateStatus={fieldState.error ? 'error' : undefined}
                  help={fieldState.error?.message}
                >
                  <Input.Password autoComplete="current-password" size="large" {...field} />
                </Form.Item>
              )}
            />
            {state?.reason === 'idle' ? (
              <Alert
                type="warning"
                showIcon
                message="Сессия завершена из-за бездействия"
                className="form-alert"
              />
            ) : null}
            {separateLogin ? (
              <Alert
                type="info"
                showIcon
                message="Отдельное окно для другого сотрудника"
                description="Войдите под своим телефоном и паролем. Основная вкладка другого сотрудника останется открытой."
                className="form-alert"
              />
            ) : null}
            {loginMutation.isError ? (
              <Alert type="error" showIcon message={getErrorMessage(loginMutation.error)} className="form-alert" />
            ) : null}
            <Button type="primary" htmlType="submit" size="large" block loading={loginMutation.isPending || isClearingSession}>
              Войти
            </Button>
          </Form>
        </Card>
      </section>
    </main>
  );
}
