import { CalendarOutlined, SendOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Alert, App, Button, Card, Form, Input, Space, Typography } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { appConfig } from '../../app/config';
import { RussianPhoneInput } from '../../shared/ui/RussianPhoneInput';
import { fromDatetimeLocal } from '../../shared/utils/date';
import { AnimalCatalogFields } from '../animals/AnimalCatalogFields';
import { createOnlineRequest } from './onlineRequests.api';
import { CreateOnlineRequestInput } from './types';

const publicRequestSchema = z.object({
  ownerName: z.string().trim().min(2, 'Укажите имя владельца').max(200),
  phone: z.string().trim().min(5, 'Укажите телефон').max(32),
  email: z.string().trim().email('Некорректный email').or(z.literal('')).optional(),
  animalNickname: z.string().trim().min(1, 'Укажите кличку').max(160),
  animalSpecies: z.string().trim().min(1, 'Выберите вид').max(120),
  animalBreed: z.string().trim().max(160).optional(),
  preferredAt: z.string().optional(),
  comment: z.string().trim().max(1000, 'До 1000 символов').optional(),
});

type PublicRequestFormValues = z.infer<typeof publicRequestSchema>;

export function PublicOnlineRequestPage() {
  const { message } = App.useApp();
  const form = useForm<PublicRequestFormValues>({
    resolver: zodResolver(publicRequestSchema),
    defaultValues: {
      ownerName: '',
      phone: '',
      email: '',
      animalNickname: '',
      animalSpecies: '',
      animalBreed: '',
      preferredAt: '',
      comment: '',
    },
  });
  const createMutation = useMutation({
    mutationFn: (values: CreateOnlineRequestInput) => createOnlineRequest(values),
    onSuccess: () => {
      form.reset();
      message.success('Заявка отправлена в клинику');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  function submit(values: PublicRequestFormValues) {
    createMutation.mutate({
      ownerName: values.ownerName,
      phone: values.phone,
      email: values.email || null,
      animalNickname: values.animalNickname,
      animalSpecies: values.animalSpecies,
      animalBreed: values.animalBreed || null,
      preferredAt: values.preferredAt ? fromDatetimeLocal(values.preferredAt) : null,
      comment: values.comment || null,
      source: 'PUBLIC_FORM',
    });
  }

  return (
    <main className="public-online-screen">
      <section className="public-online-shell">
        <div className="public-online-copy">
          <img src={appConfig.logoUrl} alt={`${appConfig.brandName} logo`} className="public-online-logo" />
          <Space direction="vertical" size={4}>
            <Typography.Title level={1}>Онлайн-запись</Typography.Title>
            <Typography.Text type="secondary">
              Оставьте заявку, администратор клиники свяжется с вами и подтвердит время приёма.
            </Typography.Text>
          </Space>
        </div>
        <Card className="public-online-card">
          {createMutation.isSuccess ? (
            <Alert
              type="success"
              showIcon
              className="form-alert"
              message="Заявка отправлена"
              description="Мы увидим её в CRM и свяжемся с вами для подтверждения записи."
            />
          ) : null}
          {createMutation.error ? <Alert type="error" showIcon message={getErrorMessage(createMutation.error)} className="form-alert" /> : null}
          <Form layout="vertical" onFinish={form.handleSubmit(submit)}>
            <div className="form-grid two-columns">
              <Controller
                control={form.control}
                name="ownerName"
                render={({ field, fieldState }) => (
                  <Form.Item label="Ваше имя" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                    <Input {...field} autoComplete="name" />
                  </Form.Item>
                )}
              />
              <Controller
                control={form.control}
                name="phone"
                render={({ field, fieldState }) => (
                  <Form.Item label="Телефон" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                    <RussianPhoneInput {...field} autoComplete="tel" />
                  </Form.Item>
                )}
              />
              <Controller
                control={form.control}
                name="email"
                render={({ field, fieldState }) => (
                  <Form.Item label="Email" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                    <Input {...field} autoComplete="email" />
                  </Form.Item>
                )}
              />
              <Controller
                control={form.control}
                name="preferredAt"
                render={({ field }) => (
                  <Form.Item label="Желаемая дата">
                    <Input {...field} type="datetime-local" />
                  </Form.Item>
                )}
              />
              <Controller
                control={form.control}
                name="animalNickname"
                render={({ field, fieldState }) => (
                  <Form.Item label="Кличка питомца" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                    <Input {...field} />
                  </Form.Item>
                )}
              />
              <AnimalCatalogFields control={form.control} setValue={form.setValue} speciesName="animalSpecies" breedName="animalBreed" />
            </div>
            <Controller
              control={form.control}
              name="comment"
              render={({ field }) => (
                <Form.Item label="Комментарий">
                  <Input.TextArea {...field} rows={4} placeholder="Причина обращения, симптомы, удобное время для звонка" />
                </Form.Item>
              )}
            />
            <Button type="primary" htmlType="submit" size="large" icon={<SendOutlined />} loading={createMutation.isPending}>
              Отправить заявку
            </Button>
          </Form>
          <div className="public-online-footer">
            <CalendarOutlined />
            <Typography.Text type="secondary">Запись считается подтверждённой только после ответа администратора.</Typography.Text>
          </div>
        </Card>
      </section>
    </main>
  );
}
