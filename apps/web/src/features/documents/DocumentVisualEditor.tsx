import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  FontSizeOutlined,
  InsertRowBelowOutlined,
  PlusOutlined,
  ScissorOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { Button, Card, Checkbox, Input, InputNumber, Segmented, Select, Space, Switch, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { DocumentVariablePalette } from './DocumentVariablePalette';
import {
  createPageBreakBlock,
  createSpacerBlock,
  createTableBlock,
  createTextBlock,
  DocumentLayout,
  DocumentLayoutBlock,
  DocumentTableBlock,
  DocumentTextBlock,
  documentLayoutPresets,
} from './documentLayout';

export function DocumentVisualEditor({
  value,
  title,
  disabled,
  renderText = (text) => text,
  onChange,
}: {
  value: DocumentLayout;
  title: string;
  disabled?: boolean;
  renderText?: (text: string) => string;
  onChange: (value: DocumentLayout) => void;
}) {
  const [selectedBlockId, setSelectedBlockId] = useState(value.blocks[0]?.id);
  useEffect(() => {
    if (!value.blocks.some((block) => block.id === selectedBlockId)) setSelectedBlockId(value.blocks[0]?.id);
  }, [selectedBlockId, value.blocks]);
  const selectedTextBlock = value.blocks.find(
    (block): block is DocumentTextBlock => block.id === selectedBlockId && block.type === 'text',
  );

  function updatePage(patch: Partial<DocumentLayout['page']>) {
    onChange({ ...value, page: { ...value.page, ...patch } });
  }

  function updateBlock(blockId: string, patch: Partial<DocumentLayoutBlock>) {
    onChange({
      ...value,
      blocks: value.blocks.map((block) =>
        block.id === blockId ? ({ ...block, ...patch } as DocumentLayoutBlock) : block,
      ),
    });
  }

  function addBlock(block: DocumentLayoutBlock) {
    onChange({ ...value, blocks: [...value.blocks, block] });
    setSelectedBlockId(block.id);
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= value.blocks.length) return;
    const blocks = [...value.blocks];
    [blocks[index], blocks[nextIndex]] = [blocks[nextIndex], blocks[index]];
    onChange({ ...value, blocks });
  }

  function removeBlock(blockId: string) {
    const blocks = value.blocks.filter((block) => block.id !== blockId);
    onChange({ ...value, blocks: blocks.length ? blocks : [createTextBlock()] });
  }

  function insertVariable(variable: string) {
    if (!selectedTextBlock) return;
    updateBlock(selectedTextBlock.id, {
      text: `${selectedTextBlock.text}${selectedTextBlock.text && !selectedTextBlock.text.endsWith(' ') ? ' ' : ''}{${variable}}`,
    });
  }

  function applyPreset(key: string) {
    const preset = documentLayoutPresets.find((item) => item.key === key);
    if (!preset) return;
    const layout = preset.layout();
    onChange(layout);
    setSelectedBlockId(layout.blocks[0]?.id);
  }

  return (
    <div className="document-visual-editor">
      <Card size="small" title="Страница A4" className="document-page-settings">
        <Space wrap align="center">
          <Select<string>
            placeholder="Готовая клиническая форма"
            style={{ minWidth: 240 }}
            disabled={disabled}
            options={documentLayoutPresets.map((preset) => ({ value: preset.key, label: preset.label }))}
            onSelect={applyPreset}
            value={undefined}
          />
          <NumberSetting label="Поля сверху" value={value.page.marginTop} disabled={disabled} onChange={(marginTop) => updatePage({ marginTop })} />
          <NumberSetting label="Поля по бокам" value={value.page.marginLeft} disabled={disabled} onChange={(side) => updatePage({ marginLeft: side, marginRight: side })} />
          <NumberSetting label="Размер текста" value={value.page.fontSize} min={8} max={18} disabled={disabled} onChange={(fontSize) => updatePage({ fontSize })} />
        </Space>
        <Space wrap className="document-page-toggles">
          <Checkbox checked={value.page.showClinicHeader} disabled={disabled} onChange={(event) => updatePage({ showClinicHeader: event.target.checked })}>Шапка клиники</Checkbox>
          <Checkbox checked={value.page.showVisitMeta} disabled={disabled} onChange={(event) => updatePage({ showVisitMeta: event.target.checked })}>Данные приёма</Checkbox>
          <Checkbox checked={value.page.showSignatures} disabled={disabled} onChange={(event) => updatePage({ showSignatures: event.target.checked })}>Подписи</Checkbox>
        </Space>
      </Card>

      <div className="document-visual-workspace">
        <div className="document-blocks-panel">
          <Space wrap className="document-block-toolbar">
            <Button icon={<FontSizeOutlined />} disabled={disabled} onClick={() => addBlock(createTextBlock())}>Текст</Button>
            <Button icon={<TableOutlined />} disabled={disabled} onClick={() => addBlock(createTableBlock())}>Таблица</Button>
            <Button icon={<InsertRowBelowOutlined />} disabled={disabled} onClick={() => addBlock(createSpacerBlock())}>Отступ</Button>
            <Button icon={<ScissorOutlined />} disabled={disabled} onClick={() => addBlock(createPageBreakBlock())}>Разрыв страницы</Button>
          </Space>
          {value.blocks.map((block, index) => (
            <Card
              key={block.id}
              size="small"
              className={`document-layout-block${block.id === selectedBlockId ? ' is-selected' : ''}`}
              onClick={() => setSelectedBlockId(block.id)}
              title={getBlockTitle(block, index)}
              extra={
                <Space size={2}>
                  <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={disabled || index === 0} onClick={(event) => { event.stopPropagation(); moveBlock(index, -1); }} />
                  <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={disabled || index === value.blocks.length - 1} onClick={(event) => { event.stopPropagation(); moveBlock(index, 1); }} />
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} disabled={disabled} onClick={(event) => { event.stopPropagation(); removeBlock(block.id); }} />
                </Space>
              }
            >
              <BlockEditor block={block} disabled={disabled} onChange={(patch) => updateBlock(block.id, patch)} />
            </Card>
          ))}
          <Card size="small" title="Поля документа">
            <Typography.Paragraph type="secondary">
              Выберите текстовый блок, затем вставьте нужное поле. Значение подставится при создании документа в приёме.
            </Typography.Paragraph>
            <DocumentVariablePalette onInsert={insertVariable} />
          </Card>
        </div>
        <DocumentA4Preview layout={value} title={title} renderText={renderText} />
      </div>
    </div>
  );
}

function BlockEditor({
  block,
  disabled,
  onChange,
}: {
  block: DocumentLayoutBlock;
  disabled?: boolean;
  onChange: (patch: Partial<DocumentLayoutBlock>) => void;
}) {
  if (block.type === 'text') {
    return (
      <Space direction="vertical" className="full-width" size={8}>
        <Input.TextArea value={block.text} disabled={disabled} autoSize={{ minRows: 2, maxRows: 10 }} placeholder="Текст блока" onChange={(event) => onChange({ text: event.target.value })} />
        <Space wrap>
          <InputNumber min={8} max={28} value={block.fontSize} disabled={disabled} addonAfter="pt" onChange={(fontSize) => onChange({ fontSize: Number(fontSize ?? 11) })} />
          <Switch checked={block.bold} disabled={disabled} checkedChildren="Жирный" unCheckedChildren="Обычный" onChange={(bold) => onChange({ bold })} />
          <Switch checked={block.italic} disabled={disabled} checkedChildren="Курсив" unCheckedChildren="Прямой" onChange={(italic) => onChange({ italic })} />
          <Segmented
            value={block.align}
            disabled={disabled}
            options={[
              { value: 'left', label: 'Слева' },
              { value: 'center', label: 'Центр' },
              { value: 'right', label: 'Справа' },
              { value: 'justify', label: 'По ширине' },
            ]}
            onChange={(align) => onChange({ align: align as DocumentTextBlock['align'] })}
          />
        </Space>
      </Space>
    );
  }
  if (block.type === 'table') {
    return (
      <Space direction="vertical" className="full-width" size={8}>
        <Typography.Text type="secondary">
          Нажмите нужную ячейку и введите значение. Результат сразу появится в печатном бланке справа.
        </Typography.Text>
        <DocumentTableGridEditor
          block={block}
          disabled={disabled}
          onChange={(rows) => onChange({ rows } as Partial<DocumentTableBlock>)}
        />
        <Checkbox checked={block.headerRows > 0} disabled={disabled} onChange={(event) => onChange({ headerRows: event.target.checked ? 1 : 0 } as Partial<DocumentTableBlock>)}>Первая строка — заголовок</Checkbox>
      </Space>
    );
  }
  if (block.type === 'spacer') {
    return <InputNumber min={4} max={120} value={block.height} disabled={disabled} addonAfter="pt" onChange={(height) => onChange({ height: Number(height ?? 16) })} />;
  }
  return <Typography.Text type="secondary">Следующий блок начнётся с новой страницы A4.</Typography.Text>;
}

function DocumentTableGridEditor({
  block,
  disabled,
  onChange,
}: {
  block: DocumentTableBlock;
  disabled?: boolean;
  onChange: (rows: string[][]) => void;
}) {
  const columnCount = Math.max(1, ...block.rows.map((row) => row.length));
  const rows = normalizeTableRows(block.rows, columnCount);

  function updateCell(rowIndex: number, columnIndex: number, value: string) {
    onChange(rows.map((row, currentRowIndex) =>
      currentRowIndex === rowIndex
        ? row.map((cell, currentColumnIndex) => currentColumnIndex === columnIndex ? value : cell)
        : row,
    ));
  }

  function addRow() {
    if (rows.length >= 60) return;
    onChange([...rows, Array.from({ length: columnCount }, () => '')]);
  }

  function removeRow(rowIndex: number) {
    if (rows.length <= 1) return;
    onChange(rows.filter((_, currentRowIndex) => currentRowIndex !== rowIndex));
  }

  function addColumn() {
    if (columnCount >= 6) return;
    onChange(rows.map((row) => [...row, '']));
  }

  function removeLastColumn() {
    if (columnCount <= 1) return;
    onChange(rows.map((row) => row.slice(0, -1)));
  }

  return (
    <div className="document-table-grid-editor">
      <div className="document-table-grid-scroll">
        <table style={{ minWidth: `${columnCount * 160 + 44}px` }}>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={rowIndex < block.headerRows ? 'is-header' : undefined}>
                {row.map((cell, columnIndex) => (
                  <td key={columnIndex}>
                    <Input
                      size="small"
                      value={cell}
                      disabled={disabled}
                      aria-label={`Строка ${rowIndex + 1}, столбец ${columnIndex + 1}`}
                      placeholder={rowIndex < block.headerRows ? 'Заголовок' : 'Введите значение'}
                      onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)}
                    />
                  </td>
                ))}
                <td className="document-table-row-action">
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    title={`Удалить строку ${rowIndex + 1}`}
                    disabled={disabled || rows.length <= 1}
                    onClick={() => removeRow(rowIndex)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Space wrap size={6}>
        <Button size="small" icon={<PlusOutlined />} disabled={disabled || rows.length >= 60} onClick={addRow}>
          Добавить строку
        </Button>
        <Button size="small" disabled={disabled || columnCount >= 6} onClick={addColumn}>
          Добавить столбец
        </Button>
        <Button size="small" danger disabled={disabled || columnCount <= 1} onClick={removeLastColumn}>
          Убрать последний столбец
        </Button>
      </Space>
    </div>
  );
}

function DocumentA4Preview({ layout, title, renderText }: { layout: DocumentLayout; title: string; renderText: (text: string) => string }) {
  const pages = useMemo(() => splitIntoPreviewPages(layout.blocks), [layout.blocks]);
  return (
    <div className="document-a4-preview-column">
      <Typography.Text strong>Предпросмотр A4</Typography.Text>
      {pages.map((blocks, pageIndex) => (
        <div key={pageIndex} className="document-a4-page">
          {pageIndex === 0 && layout.page.showClinicHeader ? <div className="document-a4-clinic"><strong>Логотип и название клиники</strong><span>Документ ветеринарной клиники</span></div> : null}
          {pageIndex === 0 ? <h2>{title || 'Без названия'}</h2> : null}
          {pageIndex === 0 && layout.page.showVisitMeta ? <div className="document-a4-meta">Дата приёма · Врач · Владелец · Пациент</div> : null}
          {blocks.map((block) => <PreviewBlock key={block.id} block={block} renderText={renderText} />)}
          {pageIndex === pages.length - 1 && layout.page.showSignatures ? <div className="document-a4-signatures"><span>Подпись владельца</span><span>Подпись врача</span></div> : null}
          <small>Страница {pageIndex + 1} из {pages.length}</small>
        </div>
      ))}
    </div>
  );
}

function PreviewBlock({ block, renderText }: { block: DocumentLayoutBlock; renderText: (text: string) => string }) {
  if (block.type === 'text') return <div style={{ fontSize: `${block.fontSize}px`, fontWeight: block.bold ? 700 : 400, fontStyle: block.italic ? 'italic' : 'normal', textAlign: block.align, whiteSpace: 'pre-wrap' }}>{renderText(block.text) || ' '}</div>;
  if (block.type === 'spacer') return <div style={{ height: `${Math.max(4, block.height / 2)}px` }} />;
  if (block.type === 'table') return <table><tbody>{block.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => index < block.headerRows ? <th key={cellIndex}>{renderText(cell)}</th> : <td key={cellIndex}>{renderText(cell)}</td>)}</tr>)}</tbody></table>;
  return null;
}

function NumberSetting({ label, value, min = 24, max = 96, disabled, onChange }: { label: string; value: number; min?: number; max?: number; disabled?: boolean; onChange: (value: number) => void }) {
  return <Space size={4}><Typography.Text type="secondary">{label}</Typography.Text><InputNumber min={min} max={max} value={value} disabled={disabled} onChange={(next) => onChange(Number(next ?? value))} /></Space>;
}

function getBlockTitle(block: DocumentLayoutBlock, index: number) {
  const label = block.type === 'text' ? 'Текст' : block.type === 'table' ? 'Таблица' : block.type === 'spacer' ? 'Отступ' : 'Разрыв страницы';
  return `${index + 1}. ${label}`;
}

function normalizeTableRows(rows: string[][], width: number) {
  const sourceRows = rows.length ? rows : [[]];
  return sourceRows
    .map((row) => [...row, ...Array.from({ length: Math.max(0, width - row.length) }, () => '')].slice(0, 6))
    .slice(0, 60);
}

function splitIntoPreviewPages(blocks: DocumentLayoutBlock[]) {
  const pages: DocumentLayoutBlock[][] = [[]];
  blocks.forEach((block) => {
    if (block.type === 'pageBreak') pages.push([]);
    else pages[pages.length - 1].push(block);
  });
  return pages;
}
