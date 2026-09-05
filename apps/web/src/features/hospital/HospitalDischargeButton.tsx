import { CheckOutlined } from '@ant-design/icons';
import { Alert, Button, Modal, Typography } from 'antd';
import type { ButtonProps } from 'antd';
import { useEffect, useState } from 'react';

const dischargeDelaySeconds = 5;

export function HospitalDischargeButton({ onConfirm, size }: {
  onConfirm: () => Promise<unknown>;
  size?: ButtonProps['size'];
}) {
  const [open, setOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(dischargeDelaySeconds);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || secondsLeft <= 0) return;
    const timer = window.setTimeout(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearTimeout(timer);
  }, [open, secondsLeft]);

  function showConfirmation() {
    setSecondsLeft(dischargeDelaySeconds);
    setOpen(true);
  }

  async function confirmDischarge() {
    if (secondsLeft > 0 || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button danger size={size} icon={<CheckOutlined />} onClick={showConfirmation}>Выписать</Button>
      <Modal
        title="Точно выписать пациента из стационара?"
        open={open}
        okText={secondsLeft > 0 ? `Подтвердить через ${secondsLeft} с` : 'Да, выписать пациента'}
        cancelText="Оставить в стационаре"
        okButtonProps={{ danger: true, disabled: secondsLeft > 0 }}
        confirmLoading={submitting}
        closable={!submitting}
        maskClosable={!submitting}
        onCancel={() => { if (!submitting) setOpen(false); }}
        onOk={confirmDischarge}
        destroyOnHidden
      >
        <Alert
          type="warning"
          showIcon
          message="Выписка завершит текущее пребывание"
          description="Проверьте пациента, назначения и выполненные действия. Итоговые начисления будут перенесены в счёт."
        />
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          Кнопка подтверждения станет доступна через 5 секунд.
        </Typography.Paragraph>
      </Modal>
    </>
  );
}
