import {
  CheckCircleOutlined,
  CloudUploadOutlined,
  CustomerServiceOutlined,
  DownloadOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Checkbox, Descriptions, Form, Input, Select, Space, Table, Tabs, Tag, Typography, Upload } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/utils/date';
import {
  acceptNewServer,
  createSupportRequest,
  exportSafeDiagnostics,
  getSupportOverview,
  importAcceptanceReport,
  importOfflineLicense,
  updateSupportRequest,
} from './support.api';
import { ServerAcceptance, SupportRequest, SupportRequestPriority, SupportRequestStatus } from './types';

type RequestForm = { subject: string; message: string; priority: SupportRequestPriority; contact?: string; includeDiagnostics: boolean };

export function SupportPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { data: auth } = useCurrentEmployee();
  const [requestForm] = Form.useForm<RequestForm>();
  const [licenseText, setLicenseText] = useState('');
  const [licenseConfirmation, setLicenseConfirmation] = useState('');
  const overviewQuery = useQuery({ queryKey: ['support'], queryFn: getSupportOverview });
  const overview = overviewQuery.data;
  const canManageSupport = hasPermission(auth?.employee, 'support.manage');
  const canManageLicense = hasPermission(auth?.employee, 'license.manage');
  const canAccept = hasPermission(auth?.employee, 'acceptance.manage');

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['support'] });
  const requestMutation = useMutation({
    mutationFn: (values: RequestForm) => createSupportRequest({ ...values, diagnosticConsent: values.includeDiagnostics }),
    onSuccess: async () => { requestForm.resetFields(); await refresh(); message.success('Обращение сохранено в журнале поддержки'); },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const licenseMutation = useMutation({
    mutationFn: () => importOfflineLicense(licenseText, licenseConfirmation),
    onSuccess: async () => { setLicenseText(''); setLicenseConfirmation(''); await refresh(); message.success('Лицензия проверена и установлена'); },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  async function downloadDiagnostics() {
    const result = await exportSafeDiagnostics();
    downloadJson(result.fileName, result);
    message.success(`Диагностический пакет сохранён. SHA-256: ${result.sha256.slice(0, 12)}…`);
  }

  function confirmDiagnostics() {
    modal.confirm({
      title: 'Скачать безопасную диагностику?',
      content: 'В пакет не входят ФИО, телефоны, адреса, тексты приёмов и сообщений. Действие будет записано в журнал аудита.',
      okText: 'Скачать пакет', cancelText: 'Отмена',
      onOk: downloadDiagnostics,
    });
  }

  const requestColumns = useMemo<ColumnsType<SupportRequest>>(() => [
    { title: 'Дата', dataIndex: 'createdAt', width: 165, render: formatDateTime },
    { title: 'Тема', key: 'subject', render: (_, row) => <Space direction="vertical" size={0}><Typography.Text strong>{row.subject}</Typography.Text><Typography.Text type="secondary">{row.message}</Typography.Text></Space> },
    { title: 'Важность', dataIndex: 'priority', width: 125, render: (value) => <Tag color={value === 'CRITICAL' ? 'red' : value === 'HIGH' ? 'orange' : 'default'}>{priorityLabels[value as SupportRequestPriority]}</Tag> },
    { title: 'Статус', dataIndex: 'status', width: 180, render: (value: SupportRequestStatus, row) => canManageSupport ? <Select value={value} options={statusOptions} onChange={async (status) => { try { await updateSupportRequest(row.id, { status }); await refresh(); } catch (error) { message.error(getErrorMessage(error)); } }} /> : <Tag>{statusLabels[value]}</Tag> },
    { title: 'Диагностика', dataIndex: 'diagnosticsIncluded', width: 130, render: (value) => value ? <Tag color="blue">Приложена</Tag> : 'Нет' },
  ], [canManageSupport, message]);

  const acceptanceColumns = useMemo<ColumnsType<ServerAcceptance>>(() => [
    { title: 'Дата', dataIndex: 'createdAt', width: 165, render: formatDateTime },
    { title: 'Выпуск', dataIndex: 'releaseVersion', width: 150 },
    { title: 'Архив', key: 'archive', render: (_, row) => <Space direction="vertical" size={0}><Typography.Text>{row.archiveName}</Typography.Text><Typography.Text code>{row.archiveSha256.slice(0, 16)}…</Typography.Text></Space> },
    { title: 'Проверка', dataIndex: 'status', width: 155, render: (value) => <Tag color={value === 'ACCEPTED' ? 'green' : value === 'VERIFIED' ? 'blue' : 'default'}>{acceptanceLabels[value as keyof typeof acceptanceLabels]}</Tag> },
    { title: 'Действие', width: 175, render: (_, row) => row.status === 'VERIFIED' && canAccept ? <Button type="primary" onClick={() => modal.confirm({ title: 'Принять новый сервер?', content: 'Подтвердите это только после открытия реальных карточек на новом компьютере. Старый сервер и его Docker volumes не удаляются.', okText: 'Принять сервер', cancelText: 'Отмена', onOk: async () => { await acceptNewServer(row.id, 'Реальные карточки проверены директором'); await refresh(); message.success('Новый сервер принят. Старый остаётся резервной копией.'); } })}>Принять сервер</Button> : null },
  ], [canAccept, message, modal]);

  return (
    <div className="page">
      <PageHeader title="Поддержка и лицензия" description="Обращения, безопасная диагностика, защита установки и финальная приёмка нового сервера." />
      {overviewQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(overviewQuery.error)} className="form-alert" /> : null}
      <Tabs items={[
        { key: 'support', label: 'Поддержка', children: <Space direction="vertical" size={16} className="full-width">
          <Card title={<Space><CustomerServiceOutlined />Новое обращение</Space>}>
            <Alert type="info" showIcon message="Обращение сохраняется в журнале клиники" description="Если настроен адрес поддержки, после сохранения откройте канал поддержки и передайте номер обращения или безопасный диагностический файл." className="form-alert" />
            <Form<RequestForm> form={requestForm} layout="vertical" initialValues={{ priority: 'NORMAL', includeDiagnostics: false }} onFinish={(values) => requestMutation.mutate(values)}>
              <Form.Item name="subject" label="Тема" rules={[{ required: true, min: 3 }]}><Input maxLength={180} /></Form.Item>
              <Form.Item name="message" label="Что произошло" rules={[{ required: true, min: 5 }]}><Input.TextArea rows={4} maxLength={5000} showCount /></Form.Item>
              <Space wrap align="start">
                <Form.Item name="priority" label="Важность"><Select options={priorityOptions} style={{ width: 180 }} /></Form.Item>
                <Form.Item name="contact" label="Как связаться"><Input placeholder="Телефон или email ответственного" style={{ width: 300 }} /></Form.Item>
              </Space>
              <Form.Item name="includeDiagnostics" valuePropName="checked"><Checkbox>Приложить безопасную диагностику без персональных и медицинских данных</Checkbox></Form.Item>
              <Space wrap>
                <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={requestMutation.isPending} disabled={!canManageSupport}>Сохранить обращение</Button>
                <Button icon={<DownloadOutlined />} onClick={confirmDiagnostics} disabled={!canManageSupport}>Скачать диагностику отдельно</Button>
                {overview?.supportContact.url ? <Button href={overview.supportContact.url} target="_blank">Открыть поддержку</Button> : null}
                {overview?.supportContact.email ? <Button href={`mailto:${overview.supportContact.email}`}>Написать по email</Button> : null}
              </Space>
            </Form>
          </Card>
          <Card title="Журнал обращений"><Table rowKey="id" dataSource={overview?.requests ?? []} columns={requestColumns} loading={overviewQuery.isLoading} scroll={{ x: 1000 }} pagination={{ pageSize: 10 }} /></Card>
        </Space> },
        { key: 'license', label: 'Лицензия', children: <Space direction="vertical" size={16} className="full-width">
          <Card title={<Space><SafetyCertificateOutlined />Защита установки</Space>}>
            <Alert type={overview?.license.status === 'VALID' ? 'success' : overview?.license.status === 'COMPATIBILITY' ? 'info' : 'warning'} showIcon message={overview?.license.message ?? 'Проверяем лицензию'} description={overview?.license.mode === 'compatibility' ? 'Существующая клиника не блокируется. Для коммерческих установок обязательная проверка включается только после выдачи лицензии.' : undefined} className="form-alert" />
            <Descriptions bordered column={{ xs: 1, md: 2 }}>
              <Descriptions.Item label="Клиника">{overview?.license.customer ?? 'Текущая установка'}</Descriptions.Item>
              <Descriptions.Item label="Срок действия">{overview?.license.validUntil ? formatDateTime(overview.license.validUntil) : 'Без выданной лицензии'}</Descriptions.Item>
              <Descriptions.Item label="Код установки"><Typography.Text copyable>{overview?.installation.installationId ?? '—'}</Typography.Text></Descriptions.Item>
              <Descriptions.Item label="Сервер"><Typography.Text copyable>{overview?.installation.serverFingerprint ?? 'Определится на Windows-сервере'}</Typography.Text></Descriptions.Item>
            </Descriptions>
            <Alert type="info" showIcon icon={<LockOutlined />} message="Директор редактирует данные и настройки клиники, но не программный код" description="Клинические настройки доступны через интерфейс. Исходный код, ключ подписи и механизм выдачи лицензий в CRM не публикуются." style={{ marginTop: 14 }} />
          </Card>
          <Card title="Установить офлайн-лицензию">
            <Space direction="vertical" size={12} className="full-width">
              <Upload accept="application/json,.json" maxCount={1} showUploadList={false} beforeUpload={async (file) => { setLicenseText(await file.text()); message.success('Файл лицензии выбран'); return false; }}><Button icon={<CloudUploadOutlined />}>Выбрать файл лицензии</Button></Upload>
              <Input value={licenseConfirmation} onChange={(event) => setLicenseConfirmation(event.target.value)} placeholder="Введите код установки для подтверждения" />
              <Button type="primary" onClick={() => licenseMutation.mutate()} loading={licenseMutation.isPending} disabled={!canManageLicense || !licenseText || !licenseConfirmation}>Проверить и установить</Button>
            </Space>
          </Card>
        </Space> },
        { key: 'acceptance', label: 'Переезд и приёмка', children: <Space direction="vertical" size={16} className="full-width">
          <Card title="Безопасная последовательность">
            <Descriptions bordered column={{ xs: 1, md: 2 }}>
              <Descriptions.Item label="1">Зафиксировать выпуск и SHA-256 образов</Descriptions.Item><Descriptions.Item label="2">Создать полный архив на старом Windows-сервере</Descriptions.Item>
              <Descriptions.Item label="3">Проверить SHA-256 архива</Descriptions.Item><Descriptions.Item label="4">Восстановить только в пустую базу нового сервера</Descriptions.Item>
              <Descriptions.Item label="5">Сверить записи и файлы автоматически</Descriptions.Item><Descriptions.Item label="6">Открыть реальные карточки и принять директором</Descriptions.Item>
            </Descriptions>
            <Alert type="warning" showIcon message="Старый компьютер и Docker volumes не удалять" description="Они остаются выключенной резервной копией до завершения приёмки и отдельного решения директора." style={{ marginTop: 14 }} />
          </Card>
          <Card title="Загрузить отчёт нового сервера">
            <Upload accept="application/json,.json" maxCount={1} showUploadList={false} beforeUpload={async (file) => { try { const report = JSON.parse(await file.text()) as Record<string, unknown>; await importAcceptanceReport(report); await refresh(); message.success('Отчёт проверен: количества базы и файлов совпадают'); } catch (error) { message.error(getErrorMessage(error)); } return false; }} disabled={!canAccept}>
              <Button icon={<CloudUploadOutlined />} disabled={!canAccept}>Выбрать transfer-restore-report.json</Button>
            </Upload>
          </Card>
          <Card title={<Space><CheckCircleOutlined />Журнал приёмки</Space>}><Table rowKey="id" dataSource={overview?.acceptances ?? []} columns={acceptanceColumns} loading={overviewQuery.isLoading} scroll={{ x: 900 }} pagination={false} /></Card>
        </Space> },
      ]} />
    </div>
  );
}

const priorityLabels: Record<SupportRequestPriority, string> = { NORMAL: 'Обычная', HIGH: 'Высокая', CRITICAL: 'Критическая' };
const priorityOptions = Object.entries(priorityLabels).map(([value, label]) => ({ value, label }));
const statusLabels: Record<SupportRequestStatus, string> = { NEW: 'Новое', IN_PROGRESS: 'В работе', WAITING_CLINIC: 'Нужен ответ клиники', RESOLVED: 'Решено', CLOSED: 'Закрыто' };
const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));
const acceptanceLabels = { PREPARED: 'Подготовлен', VERIFIED: 'Сверка пройдена', ACCEPTED: 'Принят', REJECTED: 'Отклонён' } as const;
function downloadJson(fileName: string, value: unknown) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = fileName; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url); }
