import { useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { apiBaseUrl } from '../../api/client';
import { getHealth, getMeta } from './system.api';

export function SystemStatus() {
  const healthQuery = useQuery({
    queryKey: ['system', 'health'],
    queryFn: getHealth,
    retry: false,
  });
  const metaQuery = useQuery({
    queryKey: ['system', 'meta'],
    queryFn: getMeta,
    retry: false,
  });

  if (healthQuery.isError || metaQuery.isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="CRM временно недоступна"
        description="Не удалось проверить соединение с системой. Повторите попытку или обратитесь к техническому специалисту."
      />
    );
  }

  return (
    <div className="system-status">
      <Space direction="vertical" size={10} className="full-width">
        <Space wrap>
          <Tag color={healthQuery.data?.status === 'ok' ? 'green' : 'default'}>
            {healthQuery.data?.status === 'ok' ? 'CRM работает' : 'CRM проверяется'}
          </Tag>
          <Tag color={healthQuery.data?.database === 'ok' ? 'green' : 'default'}>
            {healthQuery.data?.database === 'ok' ? 'База данных доступна' : 'База данных проверяется'}
          </Tag>
          {metaQuery.data?.version ? <Tag color="blue">Сборка {metaQuery.data.version}</Tag> : null}
        </Space>
        <details className="technical-details">
          <summary>Техническая информация</summary>
          <Space direction="vertical" size={4} className="technical-details-body">
            <Typography.Text type="secondary">Адрес API: {apiBaseUrl}</Typography.Text>
            {metaQuery.data?.revision ? <Typography.Text type="secondary">Версия кода: {metaQuery.data.revision.slice(0, 12)}</Typography.Text> : null}
            {metaQuery.data?.buildDate ? <Typography.Text type="secondary">Дата сборки: {metaQuery.data.buildDate}</Typography.Text> : null}
            {metaQuery.data?.imageSource ? <Typography.Text type="secondary">Источник сборки: {metaQuery.data.imageSource}</Typography.Text> : null}
            <Typography.Text type="secondary">Подключено модулей: {metaQuery.data?.modules.length ?? 0}</Typography.Text>
          </Space>
        </details>
      </Space>
    </div>
  );
}
