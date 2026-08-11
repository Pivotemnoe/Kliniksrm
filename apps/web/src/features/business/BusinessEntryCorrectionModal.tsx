import { useMutation } from '@tanstack/react-query';
import { Alert, App, Form, Input, InputNumber, Modal, Select, Space } from 'antd';
import { useEffect } from 'react';
import { getErrorMessage } from '../../api/errors';
import { correctBusinessEntry } from './business.api';
import { BusinessEntry, BusinessEntryCorrectionInput, BusinessResources } from './types';

type CorrectionForm = BusinessEntryCorrectionInput;

export function BusinessEntryCorrectionModal({ entry, resources, onClose, onSaved }: {
  entry: BusinessEntry | null;
  resources?: BusinessResources;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<CorrectionForm>();
  const selectedCategoryId = Form.useWatch('categoryId', form);
  const selectedCategory = resources?.categories.find((item) => item.id === selectedCategoryId);
  const categories = resources?.categories.filter((item) => {
    if (!entry || item.type !== entry.type) return false;
    return entry.source === 'PAYROLL_PAYOUT' ? item.code === 'payroll' : item.code !== 'payroll';
  }) ?? [];

  useEffect(() => {
    if (!entry) return;
    form.setFieldsValue({
      categoryId: entry.categoryId,
      amount: Number(entry.amount),
      cashboxId: entry.cashboxId ?? undefined,
      paymentMethodId: entry.paymentMethodId ?? undefined,
      counterparty: entry.counterparty ?? undefined,
      documentNumber: entry.documentNumber ?? undefined,
      comment: entry.comment ?? undefined,
      reason: '',
    });
  }, [entry, form]);

  const mutation = useMutation({
    mutationFn: (values: CorrectionForm) => correctBusinessEntry(entry!.id, values),
    onSuccess: async () => {
      await onSaved();
      message.success('Исправление сохранено; исходная операция осталась в аудите');
      onClose();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  return (
    <Modal
      open={Boolean(entry)}
      title="Исправить финансовую операцию"
      okText="Сохранить исправление"
      cancelText="Отмена"
      confirmLoading={mutation.isPending}
      onCancel={onClose}
      onOk={() => form.submit()}
      destroyOnHidden
      width={720}
    >
      <Alert
        type="info"
        showIcon
        message="Исходная запись не удаляется"
        description="CRM отменит исходную операцию, создаст связанную исправленную запись и сохранит причину и обе суммы в аудите. Если день уже отправлен или утверждён, директорское исправление вернёт его в черновик для повторной проверки."
        style={{ marginBottom: 16 }}
      />
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <Space wrap align="start" style={{ width: '100%' }}>
          <Form.Item name="categoryId" label="Статья" rules={[{ required: true, message: 'Выберите статью' }]} style={{ minWidth: 300, flex: 1 }}>
            <Select showSearch optionFilterProp="label" options={categories.map((item) => ({ value: item.id, label: item.title }))} />
          </Form.Item>
          <Form.Item name="amount" label="Сумма" rules={[{ required: true, message: 'Укажите сумму' }]}>
            <InputNumber min={0.01} precision={2} addonAfter="₽" style={{ width: 190 }} />
          </Form.Item>
        </Space>
        <Space wrap align="start">
          <Form.Item
            name="counterparty"
            label={selectedCategory?.code === 'daily_salary' ? 'Сотрудник / получатель' : 'Получатель / источник'}
            rules={selectedCategory?.code === 'daily_salary' ? [{ required: true, min: 2, message: 'Укажите, кому выдана зарплата' }] : undefined}
          >
            <Input style={{ width: 280 }} />
          </Form.Item>
          <Form.Item name="documentNumber" label="Номер документа"><Input style={{ width: 220 }} /></Form.Item>
        </Space>
        <Space wrap align="start">
          <Form.Item name="cashboxId" label="Касса">
            <Select allowClear style={{ width: 260 }} options={resources?.cashboxes.filter((item) => !entry?.officeId || !item.officeId || item.officeId === entry.officeId).map((item) => ({ value: item.id, label: item.title }))} />
          </Form.Item>
          <Form.Item name="paymentMethodId" label="Способ оплаты">
            <Select allowClear style={{ width: 260 }} options={resources?.paymentMethods.map((item) => ({ value: item.id, label: item.title }))} />
          </Form.Item>
        </Space>
        <Form.Item name="comment" label="Комментарий / назначение расхода"><Input.TextArea rows={2} maxLength={1000} /></Form.Item>
        <Form.Item name="reason" label="Причина исправления" rules={[{ required: true, min: 2, message: 'Укажите причину исправления' }]}>
          <Input.TextArea rows={3} maxLength={500} placeholder="Что было указано неверно" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
