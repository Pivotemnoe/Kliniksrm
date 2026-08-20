import { DeleteOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Checkbox, Form, InputNumber, Radio, Select, Space, Table, Typography } from 'antd';
import JsBarcode from 'jsbarcode';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

export type PrintableCatalogItem = {
  key: string;
  sourceId: string;
  kind: 'STORE_PRODUCT' | 'PRODUCT' | 'SERVICE';
  kindTitle: string;
  title: string;
  categoryTitle?: string | null;
  sku?: string | null;
  barcode?: string | null;
  priceText: string;
  vatRate?: string | number | null;
};

export type CatalogPrintLine = { item: PrintableCatalogItem; copies: number };

export type LabelOrganization = { displayName: string; legalName: string | null } | null;

type PrintSettings = {
  paper: 'LABEL_58_40' | 'A4';
  showOrganization: boolean;
  showLegalName: boolean;
  showCategory: boolean;
  showBarcode: boolean;
  showVat: boolean;
};

export function CatalogLabelPrinter({
  lines,
  onChange,
  organization,
  queryKey,
  loadItems,
  isolationMessage,
}: {
  lines: CatalogPrintLine[];
  onChange: (lines: CatalogPrintLine[]) => void;
  organization: LabelOrganization;
  queryKey: string;
  loadItems: (search: string) => Promise<PrintableCatalogItem[]>;
  isolationMessage?: string;
}) {
  const { message } = App.useApp();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [selectedKey, setSelectedKey] = useState<string>();
  const [settings, setSettings] = useState<PrintSettings>({
    paper: 'LABEL_58_40',
    showOrganization: true,
    showLegalName: true,
    showCategory: true,
    showBarcode: true,
    showVat: true,
  });
  const itemsQuery = useQuery({
    queryKey: ['catalog-label-printer', queryKey, deferredSearch],
    queryFn: () => loadItems(deferredSearch),
  });
  const availableItems = useMemo(() => {
    const items = [...lines.map((line) => line.item), ...(itemsQuery.data ?? [])];
    return [...new Map(items.map((item) => [item.key, item])).values()];
  }, [itemsQuery.data, lines]);
  const printItems = useMemo(() => lines.flatMap((line) => Array.from({ length: line.copies }, () => line.item)), [lines]);

  function addSelected() {
    const item = availableItems.find((candidate) => candidate.key === selectedKey);
    if (!item) return;
    const existing = lines.find((line) => line.item.key === item.key);
    onChange(existing
      ? lines.map((line) => line.item.key === item.key ? { ...line, copies: line.copies + 1 } : line)
      : [...lines, { item, copies: 1 }]);
    setSelectedKey(undefined);
    setSearch('');
  }

  function openPrint() {
    if (!printItems.length) {
      message.warning('Добавьте хотя бы одну позицию');
      return;
    }
    if (printCatalogLabels(printItems, organization, settings)) return;
    message.error('Браузер заблокировал окно печати. Разрешите всплывающие окна для CRM.');
  }

  return (
    <Space direction="vertical" size={18} className="full-width">
      {isolationMessage ? <Alert type="info" showIcon message={isolationMessage} /> : null}
      <div className="toolbar-row">
        <Select
          showSearch
          allowClear
          filterOption={false}
          value={selectedKey}
          searchValue={search}
          onSearch={setSearch}
          onChange={setSelectedKey}
          loading={itemsQuery.isLoading}
          placeholder="Найдите позицию по названию, артикулу или штрих-коду"
          style={{ minWidth: 360, flex: 1 }}
          options={availableItems.map((item) => ({ value: item.key, label: `${item.kindTitle}: ${item.title} · ${item.priceText}${item.barcode ? ` · ${item.barcode}` : ''}` }))}
        />
        <Button type="primary" icon={<PlusOutlined />} disabled={!selectedKey} onClick={addSelected}>Добавить в печать</Button>
      </div>

      <Table
        rowKey={(line) => line.item.key}
        size="small"
        pagination={false}
        scroll={{ x: 780 }}
        dataSource={lines}
        locale={{ emptyText: 'Добавьте позиции, для которых нужно напечатать ценники или этикетки' }}
        columns={[
          { title: 'Тип', key: 'kind', width: 105, render: (_, line) => line.item.kindTitle },
          { title: 'Название', key: 'title', render: (_, line) => line.item.title },
          { title: 'Категория', key: 'category', render: (_, line) => line.item.categoryTitle || '—' },
          { title: 'Цена', key: 'price', render: (_, line) => line.item.priceText },
          { title: 'Штрих-код', key: 'barcode', render: (_, line) => line.item.barcode || '—' },
          {
            title: 'Количество', key: 'copies', width: 145, render: (_, line) => (
              <InputNumber min={1} max={300} value={line.copies} onChange={(value) => onChange(lines.map((candidate) => candidate.item.key === line.item.key ? { ...candidate, copies: value ?? 1 } : candidate))} />
            ),
          },
          { title: '', key: 'delete', width: 54, render: (_, line) => <Button danger type="text" icon={<DeleteOutlined />} aria-label={`Убрать ${line.item.title}`} onClick={() => onChange(lines.filter((candidate) => candidate.item.key !== line.item.key))} /> },
        ]}
      />

      <div className="form-grid two-columns">
        <Form.Item label="Бумага">
          <Radio.Group value={settings.paper} onChange={(event) => setSettings((current) => ({ ...current, paper: event.target.value }))} options={[
            { value: 'LABEL_58_40', label: 'Этикетка 58 × 40 мм' },
            { value: 'A4', label: 'Лист A4 (сетка)' },
          ]} />
        </Form.Item>
        <Form.Item label="Всего к печати"><Typography.Text strong>{printItems.length} шт.</Typography.Text></Form.Item>
      </div>
      <Space wrap>
        <Checkbox checked={settings.showOrganization} disabled={!organization?.displayName} onChange={(event) => setSettings((current) => ({ ...current, showOrganization: event.target.checked }))}>Название</Checkbox>
        <Checkbox checked={settings.showLegalName} disabled={!organization?.legalName} onChange={(event) => setSettings((current) => ({ ...current, showLegalName: event.target.checked }))}>Юридическое наименование</Checkbox>
        <Checkbox checked={settings.showCategory} onChange={(event) => setSettings((current) => ({ ...current, showCategory: event.target.checked }))}>Категория</Checkbox>
        <Checkbox checked={settings.showBarcode} onChange={(event) => setSettings((current) => ({ ...current, showBarcode: event.target.checked }))}>Штрих-код</Checkbox>
        <Checkbox checked={settings.showVat} onChange={(event) => setSettings((current) => ({ ...current, showVat: event.target.checked }))}>НДС</Checkbox>
      </Space>

      <div style={{ background: '#eef2f7', padding: 20, maxHeight: 520, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {printItems.map((item, index) => <LabelPreview key={`${item.key}-${index}`} item={item} organization={organization} settings={settings} />)}
        </div>
      </div>
      <Space wrap>
        <Button type="primary" size="large" icon={<PrinterOutlined />} disabled={!printItems.length} onClick={openPrint}>Открыть печать</Button>
        {lines.length ? <Button onClick={() => onChange([])}>Очистить список</Button> : null}
      </Space>
    </Space>
  );
}

function LabelPreview({ item, organization, settings }: { item: PrintableCatalogItem; organization: LabelOrganization; settings: PrintSettings }) {
  return (
    <div style={{ width: 260, minHeight: 180, background: '#fff', border: '1px solid #cbd5e1', padding: 14, display: 'grid', alignContent: 'start', gap: 5 }}>
      {settings.showOrganization && organization?.displayName ? <strong style={{ fontSize: 13 }}>{organization.displayName}</strong> : null}
      {settings.showLegalName && organization?.legalName ? <small style={{ color: '#475569' }}>{organization.legalName}</small> : null}
      <strong>{item.title}</strong>
      <span style={{ fontSize: 26, fontWeight: 800 }}>{item.priceText}</span>
      {settings.showCategory && item.categoryTitle ? <Typography.Text type="secondary">{item.categoryTitle}</Typography.Text> : null}
      {settings.showVat ? <small>{item.vatRate !== null && item.vatRate !== undefined ? `НДС ${item.vatRate}%` : 'Без НДС'}</small> : null}
      {settings.showBarcode && item.barcode ? <BarcodeGraphic value={item.barcode} /> : null}
    </div>
  );
}

function printCatalogLabels(items: PrintableCatalogItem[], organization: LabelOrganization, settings: PrintSettings) {
  const printWindow = window.open('', '_blank', 'width=900,height=680');
  if (!printWindow) return false;
  const labels = items.map((item) => {
    const barcodeSvg = settings.showBarcode && item.barcode ? renderBarcodeSvg(item.barcode) : '';
    const metaRows = [item.sku ? `Артикул: ${item.sku}` : null, settings.showCategory && item.categoryTitle ? `Категория: ${item.categoryTitle}` : null, settings.showVat ? (item.vatRate !== null && item.vatRate !== undefined ? `НДС: ${item.vatRate}%` : 'Без НДС') : null].filter(Boolean);
    return `<div class="label">
      ${settings.showOrganization && organization?.displayName ? `<div class="organization">${escapeHtml(organization.displayName)}</div>` : ''}
      ${settings.showLegalName && organization?.legalName ? `<div class="legal">${escapeHtml(organization.legalName)}</div>` : ''}
      <div class="title">${escapeHtml(item.title)}</div><div class="price">${escapeHtml(item.priceText)}</div>
      <div class="meta">${metaRows.map((row) => `<div>${escapeHtml(String(row))}</div>`).join('')}</div>
      ${barcodeSvg ? `<div class="barcode">${barcodeSvg}</div>` : ''}
    </div>`;
  }).join('');
  const pageCss = settings.paper === 'A4'
    ? '@page { size: A4 portrait; margin: 12mm; } .sheet { display: grid; grid-template-columns: repeat(3, 58mm); gap: 5mm; align-content: start; } .label { break-inside: avoid; border: 1px dashed #9ca3af; }'
    : '@page { size: 58mm 40mm; margin: 0; } .sheet { display: block; } .label { break-after: page; } .label:last-child { break-after: auto; }';
  printWindow.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8" /><title>Ценники и этикетки</title><style>
    ${pageCss} body { margin: 0; color: #111827; font: 12px/1.35 Arial, sans-serif; }
    .label { box-sizing: border-box; width: 58mm; height: 40mm; padding: 2.5mm 3mm; display: grid; gap: 0.7mm; align-content: start; overflow: hidden; }
    .organization { font-size: 9px; font-weight: 700; } .legal { color: #4b5563; font-size: 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .title { font-size: 11px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .price { font-size: 18px; font-weight: 800; }
    .meta { color: #4b5563; font-size: 7px; display: flex; gap: 2mm; } .barcode { border-top: 1px solid #d1d5db; padding-top: 0.5mm; line-height: 0; } .barcode svg { width: 100%; height: 11mm; }
  </style></head><body><div class="sheet">${labels}</div><script>window.onload = () => window.print();</script></body></html>`);
  printWindow.document.close();
  return true;
}

function BarcodeGraphic({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, value, { format: getBarcodeFormat(value), width: 1.35, height: 38, margin: 0, displayValue: true, fontSize: 11, background: '#fff', lineColor: '#111827' });
  }, [value]);
  return <svg ref={ref} role="img" aria-label={`Штрих-код ${value}`} style={{ width: '100%', height: 56 }} />;
}

function renderBarcodeSvg(value: string) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, value, { format: getBarcodeFormat(value), width: 1.25, height: 34, margin: 0, displayValue: true, fontSize: 10, background: '#fff', lineColor: '#111827' });
  return svg.outerHTML;
}

function getBarcodeFormat(value: string): 'EAN13' | 'CODE128' { return isValidEan13(value) ? 'EAN13' : 'CODE128'; }
function isValidEan13(value: string) {
  if (!/^\d{13}$/.test(value)) return false;
  const body = value.slice(0, 12);
  const sum = [...body].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === Number(value[12]);
}
function escapeHtml(value: string) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
