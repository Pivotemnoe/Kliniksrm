import { App, Button, Form, Input, Modal, Select, Space } from 'antd';
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { InputNumber } from '../../shared/ui/DecimalInputNumber';
import { getErrorMessage } from '../../api/errors';
import { animalStatusOptions } from '../animals/animalStatus';
import { updateHospitalStay } from './hospital.api';
import type { HospitalStay } from './types';

export function HospitalSummaryEditor({ stay, notesOnly = false, onSaved }: { stay: HospitalStay; notesOnly?: boolean; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const { message, modal } = App.useApp();
  useEffect(() => { if (!open) form.resetFields(); }, [open, form]);
  const mutation = useMutation({ mutationFn: (input: Parameters<typeof updateHospitalStay>[1]) => updateHospitalStay(stay.id, input), onSuccess: async () => { await onSaved(); setOpen(false); message.success('Сохранено'); }, onError: (error) => message.error(getErrorMessage(error)) });
  async function save() {
    const values = await form.validateFields();
    if (values.animalStatus === 'Погиб') {
      modal.confirm({ title: 'Завершить стационар в связи с гибелью животного?', content: 'Невыполненные назначения будут отменены. Выполненное лечение и дни содержания сохранятся в отдельном счёте.', okText: 'Завершить стационар', cancelText: 'Назад', onOk: () => mutation.mutateAsync(values) });
    } else mutation.mutate(values);
  }
  return <>
    <Button onClick={() => { form.setFieldsValue({ depositAmount: Number(stay.depositAmount), diagnosis: stay.diagnosis ?? '', animalStatus: stay.animal?.status, internalNotes: stay.internalNotes ?? '' }); setOpen(true); }}>{notesOnly ? 'Комментарий для клиники' : 'Изменить данные стационара'}</Button>
    <Modal title={notesOnly ? 'Комментарий для клиники' : 'Данные стационара'} open={open} onCancel={() => setOpen(false)} footer={<Space><Button onClick={() => setOpen(false)}>Назад</Button><Button disabled={stay.status !== 'ACTIVE'} type="primary" loading={mutation.isPending} onClick={() => void save()}>Сохранить</Button></Space>}>
      <Form disabled={stay.status !== 'ACTIVE'} form={form} layout="vertical" preserve={false}>
        {notesOnly ? <Form.Item name="internalNotes" label="Комментарий для клиники" help="Внутренняя запись. Не включается в документы и кабинет владельца."><Input.TextArea rows={7} maxLength={20000} /></Form.Item> : <>
          <Form.Item name="depositAmount" label="Задаток, ₽" help="Информационное поле. Оплату счёта не проводит." rules={[{ required: true }]}><InputNumber min={0} max={999999999} precision={2} className="full-width" /></Form.Item>
          <Form.Item name="animalStatus" label="Состояние"><Select options={animalStatusOptions} /></Form.Item>
          <Form.Item name="diagnosis" label="Диагноз стационара" help="Редактируется отдельно от диагноза первичного приёма."><Input.TextArea rows={3} maxLength={10000} /></Form.Item>
        </>}
      </Form>
    </Modal>
  </>;
}
