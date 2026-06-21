import { useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { apiBaseUrl } from '../../api/client';
import { getErrorMessage } from '../../api/errors';
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
        message="Backend недоступен"
        description={getErrorMessage(healthQuery.error ?? metaQuery.error)}
      />
    );
  }

  return (
    <div className="system-status">
      <Space direction="vertical" size={8}>
        <Typography.Text type="secondary">API base URL: {apiBaseUrl}</Typography.Text>
        <Space wrap>
          <Tag color={healthQuery.data?.status === 'ok' ? 'green' : 'default'}>API {healthQuery.data?.status ?? '...'}</Tag>
          <Tag color={healthQuery.data?.database === 'ok' ? 'green' : 'default'}>
            DB {healthQuery.data?.database ?? '...'}
          </Tag>
          <Tag color="blue">{metaQuery.data?.version ? `v${metaQuery.data.version}` : 'meta ...'}</Tag>
          <Tag>{metaQuery.data?.modules.length ?? 0} модулей</Tag>
        </Space>
      </Space>
    </div>
  );
}
