import { Alert, Form, Input, Modal, Select, Typography } from 'antd';
import { useEffect } from 'react';
import { Animal, AnimalArchiveInput, AnimalArchiveReason } from './types';

type AnimalArchiveModalProps = {
  open: boolean;
  animal: Animal | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (input: AnimalArchiveInput) => void;
};

export function AnimalArchiveModal({ open, animal, loading, onCancel, onConfirm }: AnimalArchiveModalProps) {
  const [form] = Form.useForm<AnimalArchiveInput>();
  const reason = Form.useWatch('reason', form);

  useEffect(() => {
    if (open) {
      form.setFieldsValue({ reason: 'ERRONEOUS', comment: '' });
    }
  }, [form, open]);

  return (
    <Modal
      title={`Убрать пациента «${animal?.nickname ?? ''}» из активных`}
      open={open}
      okText="Переместить в архив"
      cancelText="Отмена"
      okButtonProps={{ danger: true }}
      confirmLoading={loading}
      destroyOnHidden
      onCancel={onCancel}
      onOk={() => form.submit()}
    >
      <Alert
        type="info"
        showIcon
        message="Медицинская и финансовая история сохранится"
        description="Пациент исчезнет из выбора для новых очередей, записей и приёмов. Прошлые приёмы, счета, стационар, документы и аудит останутся доступны. Карточку можно восстановить."
        style={{ marginBottom: 16 }}
      />
      <Form form={form} layout="vertical" onFinish={onConfirm}>
        <Form.Item
          name="reason"
          label="Причина"
          rules={[{ required: true, message: 'Выберите причину' }]}
        >
          <Select options={animalArchiveReasonOptions} />
        </Form.Item>
        <Form.Item
          name="comment"
          label={reason === 'OTHER' ? 'Комментарий' : 'Комментарий (необязательно)'}
          rules={reason === 'OTHER' ? [{ required: true, whitespace: true, message: 'Укажите причину' }] : undefined}
        >
          <Input.TextArea maxLength={1000} showCount rows={3} placeholder="Что произошло или почему карточка лишняя" />
        </Form.Item>
      </Form>
      <Typography.Text type="secondary">
        Если есть незавершённый приём, активный стационар, очередь или действующая запись, CRM сначала попросит завершить либо отменить её.
      </Typography.Text>
    </Modal>
  );
}

export const animalArchiveReasonLabels: Record<AnimalArchiveReason, string> = {
  DECEASED: 'Животное умерло',
  ERRONEOUS: 'Карточка создана ошибочно',
  OTHER: 'Другая причина',
};

const animalArchiveReasonOptions = Object.entries(animalArchiveReasonLabels).map(([value, label]) => ({ value, label }));
