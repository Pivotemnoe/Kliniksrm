import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, Modal, Select, Typography } from 'antd';
import { getErrorMessage } from '../../api/errors';
import { createOperationKey } from '../../shared/utils/operationKey';
import { hotelApi } from './petHotel.api';
import type { HotelClient, HotelClientRegistration as RegistrationResult } from './petHotel.api';

export function HotelClientRegistration({ owner, onClose, onCreated }: {
  owner?: HotelClient;
  onClose: () => void;
  onCreated: (result: RegistrationResult) => void;
}) {
  const [attempt] = useState(createOperationKey), [form] = Form.useForm();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) => hotelApi.save<RegistrationResult>(
      owner ? `clients/${encodeURIComponent(owner.id)}/animals` : 'clients',
      { ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '' && value !== undefined)), clientKey: attempt },
    ),
    onSuccess: async result => {
      await queryClient.invalidateQueries({ queryKey: ['pet-hotel'], predicate: query => query.queryKey.includes('clients') });
      onCreated(result);
      onClose();
    },
  });
  return <Modal open title={owner ? 'Новый питомец владельца' : 'Новый владелец и питомец'} onCancel={() => { if (!save.isPending) onClose(); }} footer={null} destroyOnHidden width={620}>
    <Form form={form} name="hotel-client-registration" layout="vertical" initialValues={{ species: 'CAT', sex: 'UNKNOWN' }} onFinish={save.mutate} disabled={save.isPending}>
      {owner ? <Typography.Paragraph><strong>Владелец:</strong> {owner.fullName}{owner.phone ? ` · ${owner.phone}` : ''}</Typography.Paragraph> : <>
        <Form.Item name="fullName" label="ФИО владельца" rules={[{ required: true, min: 2, whitespace: true, message: 'Укажите имя владельца' }]}><Input maxLength={200} autoComplete="name" /></Form.Item>
        <div className="hotel-form-grid">
          <Form.Item name="phone" label="Телефон владельца"><Input type="tel" placeholder="+7…" maxLength={32} autoComplete="tel" /></Form.Item>
          <Form.Item name="email" label="Email владельца" rules={[{ type: 'email', message: 'Проверьте email' }]}><Input type="email" maxLength={200} /></Form.Item>
        </div>
        <Form.Item name="address" label="Адрес владельца"><Input maxLength={500} /></Form.Item>
      </>}
      <div className="hotel-form-grid">
        <Form.Item name="nickname" label="Кличка питомца" rules={[{ required: true, whitespace: true, message: 'Укажите кличку питомца' }]}><Input maxLength={120} /></Form.Item>
        <Form.Item name="species" label="Вид питомца" rules={[{ required: true }]}><Select options={[{ value: 'CAT', label: 'Кошка' }, { value: 'DOG', label: 'Собака' }]} /></Form.Item>
        <Form.Item name="breed" label="Порода"><Input maxLength={120} /></Form.Item>
        <Form.Item name="sex" label="Пол"><Select options={[{ value: 'UNKNOWN', label: 'Не указан' }, { value: 'MALE', label: 'Самец' }, { value: 'FEMALE', label: 'Самка' }]} /></Form.Item>
        <Form.Item name="birthDate" label="Дата рождения"><Input type="date" /></Form.Item>
      </div>
      {save.isError && <Alert type="error" showIcon message={getErrorMessage(save.error)} style={{ marginBottom: 16 }} />}
      <Button type="primary" htmlType="submit" loading={save.isPending}>{owner ? 'Добавить питомца в бронь' : 'Создать и выбрать для брони'}</Button>
    </Form>
  </Modal>;
}
