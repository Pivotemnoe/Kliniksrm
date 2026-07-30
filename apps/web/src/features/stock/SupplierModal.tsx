import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Form, Input, Modal } from 'antd';
import { useEffect } from 'react';
import { getErrorMessage } from '../../api/errors';
import { createSupplier, updateSupplier } from './stock.api';
import { Supplier, SupplierMutationInput } from './types';

type SupplierFormValues = {
  title: string;
  phone?: string;
  email?: string;
  inn?: string;
  comment?: string;
};

export function SupplierModal({
  open,
  supplier,
  onClose,
  onSaved,
}: {
  open: boolean;
  supplier?: Supplier | null;
  onClose: () => void;
  onSaved?: (supplier: Supplier) => void;
}) {
  const [form] = Form.useForm<SupplierFormValues>();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const mutation = useMutation({
    mutationFn: (values: SupplierMutationInput) =>
      supplier ? updateSupplier(supplier.id, values) : createSupplier(values),
    onSuccess: async (savedSupplier) => {
      await queryClient.invalidateQueries({ queryKey: ['stock'] });
      message.success(supplier ? 'Поставщик сохранён' : 'Поставщик добавлен');
      form.resetFields();
      onSaved?.(savedSupplier);
      onClose();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      title: supplier?.title ?? '',
      phone: supplier?.phone ?? '',
      email: supplier?.email ?? '',
      inn: supplier?.inn ?? '',
      comment: supplier?.comment ?? '',
    });
  }, [form, open, supplier]);

  return (
    <Modal
      open={open}
      title={supplier ? 'Редактирование поставщика' : 'Новый поставщик'}
      okText={supplier ? 'Сохранить' : 'Добавить'}
      cancelText="Отмена"
      confirmLoading={mutation.isPending}
      onCancel={onClose}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => mutation.mutate(cleanSupplierInput(values))}
      >
        {mutation.error ? <Alert type="error" showIcon message={getErrorMessage(mutation.error)} /> : null}
        <Form.Item name="title" label="Название поставщика" rules={[{ required: true, message: 'Укажите название' }, { min: 2 }]}>
          <Input autoFocus placeholder="Например, ООО ВетФарм" />
        </Form.Item>
        <div className="form-grid two-columns">
          <Form.Item name="phone" label="Телефон"><Input /></Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Проверьте email' }]}><Input /></Form.Item>
          <Form.Item name="inn" label="ИНН"><Input maxLength={20} /></Form.Item>
        </div>
        <Form.Item name="comment" label="Комментарий"><Input.TextArea rows={3} /></Form.Item>
      </Form>
    </Modal>
  );
}

function cleanSupplierInput(values: SupplierFormValues): SupplierMutationInput {
  return {
    title: values.title.trim(),
    phone: values.phone?.trim() || undefined,
    email: values.email?.trim() || undefined,
    inn: values.inn?.trim() || undefined,
    comment: values.comment?.trim() || undefined,
  };
}
