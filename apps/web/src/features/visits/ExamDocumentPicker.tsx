import { FileTextOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Empty, Input, Modal, Select, Space, Typography } from 'antd';
import { useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { listDocumentTemplates } from '../documents/documents.api';
import { documentFragments } from './examDocumentFragments';

export function ExamDocumentPicker({ value, disabled, onInsert }: { value: string; disabled: boolean; onInsert: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string>();
  const [selected, setSelected] = useState<number[]>([]);
  const [text, setText] = useState('');
  const templates = useQuery({ queryKey: ['document-templates'], queryFn: listDocumentTemplates, enabled: open });
  const template = templates.data?.find(item => item.id === templateId);
  const fragments = template ? documentFragments(template) : [];
  const combined = [value.trimEnd(), text.trim()].filter(Boolean).join('\n\n');
  const tooLong = combined.length > 4000;
  return <>
    <Button size="small" icon={<FileTextOutlined />} disabled={disabled} onClick={() => { setOpen(true); setTemplateId(undefined); setSelected([]); setText(''); }}>Открыть документ</Button>
    <Modal title="Документы для манипуляций" open={open} width={760} onCancel={() => setOpen(false)}
      okText="Добавить в манипуляции" cancelText="Отмена"
      okButtonProps={{ disabled: disabled || !text.trim() || tooLong }}
      onOk={() => { if (!disabled && text.trim() && !tooLong) { onInsert(combined); setOpen(false); } }}>
      <Space direction="vertical" className="full-width" size={12}>
        <Select aria-label="Документ для манипуляций" className="full-width" showSearch optionFilterProp="label"
          placeholder="Найти документ или схему лечения" loading={templates.isLoading} value={templateId}
          options={(templates.data ?? []).map(item => ({ value: item.id, label: [item.category?.title, item.title].filter(Boolean).join(' · ') }))}
          onChange={id => { setTemplateId(id); setSelected([]); setText(''); }} />
        {templates.isError ? <Alert type="error" message={getErrorMessage(templates.error)} action={<Button onClick={() => void templates.refetch()}>Повторить</Button>} /> : null}
        {template ? <>
          <Typography.Text type="secondary">Выберите нужные строки документа. Перед добавлением проверьте текст, дозировки и незаполненные поля.</Typography.Text>
          {fragments.length ? <div style={{ maxHeight: '28vh', overflow: 'auto' }}>
            {fragments.map((fragment, index) => <div key={index} style={{ padding: '6px 0' }}><Checkbox checked={selected.includes(index)} onChange={event => {
              const next = event.target.checked ? [...selected, index].sort((a,b) => a-b) : selected.filter(item => item !== index);
              setSelected(next); setText(next.map(item => fragments[item]).join('\n\n'));
            }}><span style={{ whiteSpace: 'pre-wrap' }}>{fragment}</span></Checkbox></div>)}
          </div> : <Empty description="В документе нет текста для вставки" />}
          <Input.TextArea aria-label="Текст для добавления в манипуляции" value={text} onChange={event => setText(event.target.value)} rows={5} />
          {tooLong ? <Alert type="warning" message="Текст вместе с уже заполненными манипуляциями превышает 4000 символов. Выберите меньше строк или сократите текст." /> : null}
        </> : null}
      </Space>
    </Modal>
  </>;
}
