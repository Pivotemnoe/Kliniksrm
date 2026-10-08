import { useState } from 'react';
import { Alert, App, Button, Input, Modal, Space, Typography } from 'antd';
import { buildDoctorAssistantDraft, type DoctorDraftContext } from './doctorAssistantDraft';
export function DoctorAssistantDraft({ context, disabled, onAccept }: { context: DoctorDraftContext; disabled: boolean; onAccept: (value: string) => void }) {
  const { message } = App.useApp();
  const [proposal, setProposal] = useState<ReturnType<typeof buildDoctorAssistantDraft>>();
  const [text, setText] = useState('');
  const current = buildDoctorAssistantDraft(context);
  const stale = Boolean(proposal && proposal.fingerprint !== current.fingerprint);
  const generate = () => { setProposal(current); setText(current.text); };
  const accept = () => {
    if (stale) { message.warning('Исходные данные изменились. Обновите черновик.'); return; }
    try { onAccept(text); setProposal(undefined); } catch (error) { message.error(error instanceof Error ? error.message : 'Не удалось принять черновик'); }
  };
  return <section className="doctor-assistant-draft" aria-label="Помощник врача">
    <Typography.Text strong>Помощник врача</Typography.Text>
    <Typography.Paragraph type="secondary">Подготовит черновик из сохранённого листа осмотра и текущего плана лечения. Проверьте формулировки перед добавлением.</Typography.Paragraph>
    <Button onClick={generate} disabled={disabled}>Подготовить текст для владельца</Button>
    <Modal title="Черновик текста владельцу" open={Boolean(proposal)} onCancel={() => setProposal(undefined)} footer={<Space><Button onClick={() => setProposal(undefined)}>Отклонить</Button>{stale ? <Button onClick={generate}>Обновить черновик</Button> : null}<Button type="primary" disabled={disabled || stale || !text.trim()} onClick={accept}>Добавить к рекомендациям</Button></Space>} width={760}>
      <Typography.Paragraph>Источник: текущий приём. Незаполненные сведения в текст не добавляются.</Typography.Paragraph>
      {proposal?.missing.length ? <Alert type="info" showIcon message={`Не указано: ${proposal.missing.join(', ')}`} /> : null}
      {stale ? <Alert type="warning" showIcon message="Исходные данные изменились после подготовки текста" /> : null}
      <Input.TextArea aria-label="Черновик текста владельцу" rows={12} value={text} onChange={event => setText(event.target.value)} maxLength={6000} />
      <Typography.Paragraph type="secondary">До принятия ничего не сохраняется и не отправляется. После принятия текст добавляется к рекомендациям и сохраняется обычным способом.</Typography.Paragraph>
    </Modal>
  </section>;
}
