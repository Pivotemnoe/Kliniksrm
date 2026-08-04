import { EditOutlined, FileAddOutlined, StopOutlined } from '@ant-design/icons';
import { Button, Checkbox, Empty, Space, Tag, Tooltip, Typography } from 'antd';
import type { HospitalRecord } from './types';

export function HospitalSheet({
  records,
  timeZone,
  canManage,
  active,
  onEdit,
  onAmend,
  onComplete,
  onQuickComplete,
  onSkip,
  updatingRecordId,
}: {
  records: HospitalRecord[];
  timeZone: string;
  canManage: boolean;
  active: boolean;
  onEdit: (record: HospitalRecord) => void;
  onAmend: (record: HospitalRecord) => void;
  onComplete: (record: HospitalRecord) => void;
  onQuickComplete: (record: HospitalRecord) => void;
  onSkip: (record: HospitalRecord) => void;
  updatingRecordId?: string;
}) {
  const groups = groupHospitalRecords(records, timeZone);
  const temperatures = records
    .filter((record) => record.recordStatus !== 'PLANNED' && record.temperatureC !== null)
    .map((record) => ({ at: record.completedAt ?? record.recordedAt, value: Number(record.temperatureC) }))
    .filter((point) => Number.isFinite(point.value))
    .sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());

  if (!records.length) {
    return <Empty description="Лист стационара пока не заполнен" />;
  }

  return (
    <Space direction="vertical" size={18} className="full-width">
      <TemperatureChart points={temperatures} timeZone={timeZone} />
      <div className="hospital-sheet-days">
        {groups.map((group) => (
          <section className="hospital-sheet-day" key={group.key}>
            <header className="hospital-sheet-day-header">
              <div>
                <Typography.Title level={5} className="compact-title">{group.label}</Typography.Title>
                <Typography.Text type="secondary">{group.records.length} записей</Typography.Text>
              </div>
              <Space wrap size={6}>
                <Tag color="gold">Назначено {group.records.filter((record) => record.recordStatus === 'PLANNED').length}</Tag>
                <Tag color="green">Выполнено {group.records.filter((record) => record.recordStatus === 'COMPLETED').length}</Tag>
              </Space>
            </header>
            <div className="hospital-sheet-grid hospital-sheet-grid-head" aria-hidden="true">
              <div>Время</div>
              <div>Назначение / запись</div>
              <div>Выполнение / результат</div>
              <div>Исполнитель и действия</div>
            </div>
            {group.records.map((record) => (
              <article className={`hospital-sheet-grid hospital-sheet-row hospital-sheet-row-${record.recordStatus.toLowerCase()}`} key={record.id}>
                <div className="hospital-sheet-time">
                  <strong>{formatTime(record.recordedAt, timeZone)}</strong>
                  {record.completedAt && record.createdAsPlan ? (
                    <Typography.Text type="secondary">выполнено {formatTime(record.completedAt, timeZone)}</Typography.Text>
                  ) : null}
                </div>
                <div>
                  <Space wrap size={6}>
                    <Tag color={recordTypeColor[record.recordType]}>{recordTypeLabel[record.recordType]}</Tag>
                    <RecordStatusTag record={record} />
                  </Space>
                  <Typography.Paragraph strong className="hospital-sheet-title">{record.title}</Typography.Paragraph>
                  {record.treatmentPlan?.title ? <Typography.Text type="secondary">План: {record.treatmentPlan.title}</Typography.Text> : null}
                  {record.createdAsPlan ? <Typography.Text type="secondary">Назначено на {formatDateTime(record.recordedAt, timeZone)}</Typography.Text> : null}
                </div>
                <div>
                  {record.recordStatus === 'PLANNED' ? (
                    <Space direction="vertical" size={2}>
                      <Typography.Text type="secondary">Ожидает выполнения</Typography.Text>
                      {describePlannedPosting(record) ? <Typography.Text>{describePlannedPosting(record)}</Typography.Text> : null}
                    </Space>
                  ) : record.recordStatus === 'SKIPPED' ? (
                    <Typography.Text type="warning">Не выполнено{record.notes ? `: ${record.notes}` : ''}</Typography.Text>
                  ) : (
                    <RecordResult record={record} />
                  )}
                  {record.amendments?.length ? (
                    <div className="hospital-amendments">
                      {record.amendments.map((amendment) => (
                        <div className="hospital-amendment" key={amendment.id}>
                          <Typography.Text strong>Исправление {formatDateTime(amendment.recordedAt, timeZone)}</Typography.Text>
                          <Typography.Text type="secondary">Причина: {amendment.amendmentReason}</Typography.Text>
                          <RecordResult record={amendment} />
                          <Typography.Text type="secondary">{amendment.recordedBy?.fullName ?? 'Сотрудник'}</Typography.Text>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="hospital-sheet-actions">
                  <Typography.Text>{record.recordedBy?.fullName ?? 'Сотрудник не указан'}</Typography.Text>
                  {canManage ? (
                    <Space wrap size={4}>
                      {active && record.recordStatus === 'PLANNED' && record.canEditDirectly ? (
                        <>
                          <Checkbox
                            className="hospital-complete-checkbox"
                            checked={updatingRecordId === record.id}
                            disabled={updatingRecordId === record.id}
                            onChange={(event) => {
                              if (event.target.checked) onQuickComplete(record);
                            }}
                          >
                            Выполнено
                          </Checkbox>
                          <Button size="small" type="link" onClick={() => onComplete(record)}>Указать результат</Button>
                          <Button size="small" icon={<StopOutlined />} onClick={() => onSkip(record)}>Пропущено</Button>
                        </>
                      ) : null}
                      {active && record.canEditDirectly ? (
                        <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(record)}>Изменить</Button>
                      ) : (
                        <Tooltip title="Прошлые сутки и закрытые пребывания не переписываются">
                          <Button size="small" icon={<FileAddOutlined />} onClick={() => onAmend(record)}>Исправление</Button>
                        </Tooltip>
                      )}
                    </Space>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </Space>
  );
}

function RecordStatusTag({ record }: { record: HospitalRecord }) {
  const status = statusView[record.recordStatus];
  return <Tag color={status.color}>{record.createdAsPlan && record.recordStatus === 'COMPLETED' ? 'Назначение выполнено' : status.label}</Tag>;
}

function RecordResult({ record }: { record: HospitalRecord }) {
  return (
    <Space direction="vertical" size={2} className="full-width">
      {record.temperatureC !== null ? <Typography.Text strong>{record.temperatureC} °C</Typography.Text> : null}
      {record.value ? <Typography.Text>{record.value}</Typography.Text> : null}
      {record.notes ? <Typography.Text type="secondary">{record.notes}</Typography.Text> : null}
      {record.billItem ? (
        <Typography.Text type="secondary">
          {describeCompletedPosting(record)}
        </Typography.Text>
      ) : null}
    </Space>
  );
}

function describePlannedPosting(record: HospitalRecord) {
  if (record.plannedProductId) {
    const unit = record.plannedProduct?.writeOffUnit || record.plannedProduct?.stockUnit || 'ед.';
    return `При выполнении списать ${record.plannedStockQuantity ?? record.plannedQuantity ?? 1} ${unit}`;
  }
  if (record.plannedServiceId) {
    return `При выполнении начислить услугу: ${record.plannedQuantity ?? 1}`;
  }
  return '';
}

function describeCompletedPosting(record: HospitalRecord) {
  const item = record.billItem;
  if (!item) return '';
  if (item.productId) {
    const unit = item.product?.writeOffUnit || item.product?.stockUnit || 'ед.';
    return `Списано ${item.stockQuantity ?? item.quantity} ${unit}; начислено ${item.quantity} × ${item.unitPrice} ₽`;
  }
  return `${item.title}: ${item.quantity} × ${item.unitPrice} ₽`;
}

function TemperatureChart({ points, timeZone }: { points: Array<{ at: string; value: number }>; timeZone: string }) {
  if (!points.length) {
    return (
      <div className="hospital-temperature-empty">
        <Typography.Text strong>График температуры</Typography.Text>
        <Typography.Text type="secondary">Появится после первого выполненного измерения.</Typography.Text>
      </div>
    );
  }

  const width = 920;
  const height = 230;
  const padding = { left: 48, right: 24, top: 24, bottom: 42 };
  const values = points.map((point) => point.value);
  const min = Math.min(36, Math.floor(Math.min(...values) * 2) / 2);
  const max = Math.max(40, Math.ceil(Math.max(...values) * 2) / 2);
  const span = Math.max(max - min, 1);
  const x = (index: number) => padding.left + (points.length === 1 ? (width - padding.left - padding.right) / 2 : index * (width - padding.left - padding.right) / (points.length - 1));
  const y = (value: number) => padding.top + (max - value) * (height - padding.top - padding.bottom) / span;
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(point.value)}`).join(' ');
  const ticks = Array.from({ length: 5 }, (_, index) => min + (span * index) / 4);

  return (
    <div className="hospital-temperature-chart">
      <div className="hospital-temperature-chart-heading">
        <Typography.Text strong>Температура за всё пребывание</Typography.Text>
        <Typography.Text type="secondary">{points.length} измерений · {Math.min(...values).toFixed(1)}–{Math.max(...values).toFixed(1)} °C</Typography.Text>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="График температуры пациента">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} className="hospital-chart-grid" />
            <text x={padding.left - 8} y={y(tick) + 4} textAnchor="end" className="hospital-chart-label">{tick.toFixed(1)}</text>
          </g>
        ))}
        <path d={path} className="hospital-chart-line" />
        {points.map((point, index) => (
          <g key={`${point.at}-${index}`}>
            <circle cx={x(index)} cy={y(point.value)} r="5" className="hospital-chart-point" />
            <text x={x(index)} y={height - 19} textAnchor="middle" className="hospital-chart-label">{formatShortDateTime(point.at, timeZone)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function groupHospitalRecords(records: HospitalRecord[], timeZone: string) {
  const sorted = [...records].sort((left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime());
  const groups = new Map<string, HospitalRecord[]>();
  for (const record of sorted) {
    const key = dateKey(record.recordedAt, timeZone);
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    label: new Intl.DateTimeFormat('ru-RU', { timeZone, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(group[0].recordedAt)),
    records: group,
  }));
}

function dateKey(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatShortDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

const recordTypeLabel = {
  TEMPERATURE: 'Температура',
  MEDICATION: 'Препарат / инъекция',
  PROCEDURE: 'Процедура',
  OBSERVATION: 'Наблюдение',
  FEEDING: 'Кормление',
  CARE: 'Уход',
  OTHER: 'Другая запись',
} as const;

const recordTypeColor = {
  TEMPERATURE: 'volcano',
  MEDICATION: 'blue',
  PROCEDURE: 'purple',
  OBSERVATION: 'cyan',
  FEEDING: 'green',
  CARE: 'geekblue',
  OTHER: 'default',
} as const;

const statusView = {
  PLANNED: { label: 'Назначено', color: 'gold' },
  COMPLETED: { label: 'Выполнено', color: 'green' },
  SKIPPED: { label: 'Пропущено', color: 'default' },
  AMENDMENT: { label: 'Исправление', color: 'purple' },
} as const;
