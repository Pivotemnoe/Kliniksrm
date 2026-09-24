import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Drawer, Input, Popconfirm, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { laboratoryOrderItemStatusLabels } from '../visits/types';
import type { LaboratoryOrderItem, LaboratoryOrderResultRowInput, LaboratoryTableChanges } from './types';
import { updateLaboratoryOrderResults } from './laboratory.api';

type ResultOrder = { id: string; items: LaboratoryOrderItem[] };
type ResultTableRow = LaboratoryOrderResultRowInput & {
  title: string;
  code: string | null;
  disabled: boolean;
  isNew?: boolean;
};

const BufferedLaboratoryInput = memo(function BufferedLaboratoryInput({
  value,
  disabled,
  ariaLabel,
  onDraftChange,
  onCommit,
  multiline = false,
}: {
  value: string;
  disabled: boolean;
  ariaLabel?: string;
  onDraftChange: (value: string) => void;
  onCommit: () => void;
  multiline?: boolean;
}) {
  const inputProps = {
    disabled, 'aria-label': ariaLabel,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onDraftChange(event.target.value),
  };
  return multiline ? <Input.TextArea {...inputProps} defaultValue={value} onBlur={onCommit} autoSize={{ minRows: 1, maxRows: 5 }} /> : <Input {...inputProps} defaultValue={value} onBlur={onCommit} />;
});

export function LaboratoryResultsTableDrawer({
  order,
  patientName,
  canManage,
  onClose,
  saveResults,
}: {
  order: ResultOrder | null;
  patientName: string;
  canManage: boolean;
  onClose: () => void;
  saveResults?: (orderId: string, items: LaboratoryOrderResultRowInput[], changes?: LaboratoryTableChanges) => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [rows, setRows] = useState<ResultTableRow[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const rowsRef = useRef<ResultTableRow[]>([]);
  const rowIndexesRef = useRef(new Map<string, number>());
  const mutation = useMutation({
    mutationFn: (payload: { items: LaboratoryOrderResultRowInput[]; changes: LaboratoryTableChanges }) => (saveResults ?? updateLaboratoryOrderResults)(order!.id, payload.items, payload.changes),
    onSuccess: () => {
      onClose();
      message.success('Таблица результатов сохранена');
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['laboratory', 'orders'] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  useEffect(() => {
    const nextRows = order?.items.filter(item => item.status !== 'CANCELLED').map((item) => ({
      itemId: item.id,
      title: item.title,
      code: item.code,
      status: item.status,
      resultValue: item.resultValue ?? '',
      resultText: item.resultText ?? '',
      unit: item.unit ?? '',
      referenceRange: item.referenceRange ?? '',
      comment: item.comment ?? '',
      disabled: item.status === 'CANCELLED',
    })) ?? [];
    rowsRef.current = nextRows;
    rowIndexesRef.current = new Map(nextRows.map((row, index) => [row.itemId, index]));
    setRows(nextRows);
    setRemovedIds([]);
    mutation.reset();
  }, [order]);

  const updateDraftRow = useCallback((itemId: string, patch: Partial<ResultTableRow>) => {
    const index = rowIndexesRef.current.get(itemId);
    if (index === undefined) return;
    rowsRef.current[index] = { ...rowsRef.current[index], ...patch };
  }, []);

  const commitDraftRow = useCallback((itemId: string, completeFromResult = false) => {
    const index = rowIndexesRef.current.get(itemId);
    if (index === undefined) return;
    const draft = rowsRef.current[index];
    const next = completeFromResult && draft.resultValue?.trim() && draft.status === 'ORDERED'
      ? { ...draft, status: 'COMPLETED' as const }
      : draft;
    rowsRef.current[index] = next;
    setRows((current) => current.map((row) => (row.itemId === itemId ? next : row)));
  }, []);

  const updateRow = useCallback((itemId: string, patch: Partial<ResultTableRow>) => {
    updateDraftRow(itemId, patch);
    commitDraftRow(itemId);
  }, [commitDraftRow, updateDraftRow]);

  function addRow() {
    // getRandomValues also works on the clinic's HTTP/LAN origin.
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    const itemId = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    const row: ResultTableRow = { itemId, title: '', code: '', status: 'ORDERED', resultValue: '', resultText: '', unit: '', referenceRange: '', comment: '', disabled: false, isNew: true };
    rowsRef.current = [...rowsRef.current, row];
    rowIndexesRef.current.set(itemId, rowsRef.current.length - 1);
    setRows([...rowsRef.current]);
  }

  function saveTable() {
    const active = rowsRef.current.filter(row => !removedIds.includes(row.itemId));
    if (!active.length) { message.error('Оставьте хотя бы один показатель'); return; }
    if (active.some(row => row.isNew && !row.title.trim())) { message.error('Укажите название нового показателя'); return; }
    const items: LaboratoryOrderResultRowInput[] = [];
    const addedItems: NonNullable<LaboratoryTableChanges['addedItems']> = [];
    for (const { title, code, disabled: _disabled, isNew, ...row } of active) {
      if (isNew) addedItems.push({ ...row, title: title.trim(), code }); else items.push(row);
    }
    mutation.mutate({ items, changes: { addedItems, removedItemIds: removedIds.filter(id => !rowsRef.current.find(row => row.itemId === id)?.isNew) } });
  }

  const columns = useMemo<ColumnsType<ResultTableRow>>(() => [
    {
      title: 'Показатель',
      key: 'indicator',
      width: 220,
      shouldCellUpdate: (row, previous) => row.title !== previous.title || row.code !== previous.code || row.disabled !== previous.disabled,
      render: (_, row) => row.isNew ? <Space direction="vertical" size={2}>
        <BufferedLaboratoryInput value={row.title} disabled={!canManage || mutation.isPending} ariaLabel="Название нового показателя" onDraftChange={title => updateDraftRow(row.itemId, { title })} onCommit={() => commitDraftRow(row.itemId)} />
        <BufferedLaboratoryInput value={row.code ?? ''} disabled={!canManage || mutation.isPending} ariaLabel="Код нового показателя" onDraftChange={code => updateDraftRow(row.itemId, { code })} onCommit={() => commitDraftRow(row.itemId)} />
      </Space> : <Space direction="vertical" size={0}><Typography.Text strong>{row.title}</Typography.Text>{row.code ? <Typography.Text type="secondary">{row.code}</Typography.Text> : null}</Space>,
    },
    {
      title: 'Значение', dataIndex: 'resultValue', key: 'resultValue', width: 250,
      shouldCellUpdate: (row, previous) => row.resultValue !== previous.resultValue || row.status !== previous.status || row.disabled !== previous.disabled,
      render: (value, row) => <BufferedLaboratoryInput value={value ?? ''} disabled={row.disabled} multiline ariaLabel={`Значение ${row.title}`} onDraftChange={(resultValue) => updateDraftRow(row.itemId, { resultValue })} onCommit={() => commitDraftRow(row.itemId, true)} />,
    },
    { title: 'Ед.', dataIndex: 'unit', key: 'unit', width: 80, shouldCellUpdate: (row, previous) => row.unit !== previous.unit || row.disabled !== previous.disabled, render: (value, row) => <BufferedLaboratoryInput value={value ?? ''} disabled={row.disabled} onDraftChange={(unit) => updateDraftRow(row.itemId, { unit })} onCommit={() => commitDraftRow(row.itemId)} /> },
    { title: 'Референс', dataIndex: 'referenceRange', key: 'referenceRange', width: 160, shouldCellUpdate: (row, previous) => row.referenceRange !== previous.referenceRange || row.disabled !== previous.disabled, render: (value, row) => <BufferedLaboratoryInput value={value ?? ''} disabled={row.disabled} onDraftChange={(referenceRange) => updateDraftRow(row.itemId, { referenceRange })} onCommit={() => commitDraftRow(row.itemId)} /> },
    { title: 'Комментарий', dataIndex: 'comment', key: 'comment', width: 210, shouldCellUpdate: (row, previous) => row.comment !== previous.comment || row.disabled !== previous.disabled, render: (value, row) => <BufferedLaboratoryInput value={value ?? ''} disabled={row.disabled} onDraftChange={(comment) => updateDraftRow(row.itemId, { comment })} onCommit={() => commitDraftRow(row.itemId)} /> },
    {
      title: 'Статус', dataIndex: 'status', key: 'status', width: 155,
      shouldCellUpdate: (row, previous) => row.status !== previous.status || row.disabled !== previous.disabled,
      render: (value, row) => <Select value={value} disabled={row.disabled} className="full-width" onChange={(status) => updateRow(row.itemId, { status })} options={Object.entries(laboratoryOrderItemStatusLabels).filter(([status]) => status !== 'CANCELLED').map(([status, label]) => ({ value: status, label }))} />,
    },
    ...(canManage ? [{ title: '', key: 'remove', width: 100, render: (_: unknown, row: ResultTableRow) => <Popconfirm title="Убрать показатель из этого анализа?" description="Изменение применится при сохранении таблицы. Прежние данные останутся в истории." onConfirm={() => setRemovedIds(ids => [...ids, row.itemId])} okText="Убрать" cancelText="Оставить"><Button danger size="small" disabled={mutation.isPending}>Удалить</Button></Popconfirm> }] : []),
  ], [commitDraftRow, updateDraftRow, updateRow, canManage, mutation.isPending]);

  return (
    <Drawer
      title={order ? `Результаты: ${patientName}` : 'Таблица результатов'}
      open={Boolean(order)}
      onClose={onClose}
      width="min(1280px, 96vw)"
      destroyOnHidden
      extra={<Button type="primary" loading={mutation.isPending} disabled={!canManage} onClick={saveTable}>Сохранить всю таблицу</Button>}
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>Введите результаты в таблицу и сохраните её целиком.</Typography.Paragraph>
      {mutation.isError ? <Alert type="error" showIcon message={getErrorMessage(mutation.error)} className="form-alert" /> : null}
      {canManage ? <Space className="form-alert"><Button onClick={addRow} disabled={mutation.isPending || rows.length - removedIds.length >= 100}>Добавить показатель</Button>{removedIds.length ? <Button onClick={() => setRemovedIds([])} disabled={mutation.isPending}>Вернуть удалённые ({removedIds.length})</Button> : null}</Space> : null}
      <Table<ResultTableRow> size="small" rowKey="itemId" columns={columns} dataSource={rows.filter(row => !removedIds.includes(row.itemId)).map(row => ({ ...row, disabled: row.disabled || !canManage || mutation.isPending }))} pagination={false} className="dense-table laboratory-result-grid laboratory-compact-table" scroll={{ x: 1175, y: 'calc(100vh - 230px)' }} />
    </Drawer>
  );
}
