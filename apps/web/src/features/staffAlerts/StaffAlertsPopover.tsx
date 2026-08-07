import { BellOutlined, CheckOutlined, ExclamationCircleOutlined, InfoCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Badge, Button, Empty, Popover, Spin, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { formatDateTime } from '../../shared/utils/date';
import { listStaffAlerts, markAllStaffAlertsRead, markStaffAlertRead } from './staffAlerts.api';
import { StaffAlertItem } from './types';

export function StaffAlertsPopover() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const alertsQuery = useQuery({
    queryKey: ['staff-alerts'],
    queryFn: listStaffAlerts,
    refetchInterval: 30_000,
  });
  const markReadMutation = useMutation({
    mutationFn: markStaffAlertRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff-alerts'] }),
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const markAllMutation = useMutation({
    mutationFn: markAllStaffAlertsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff-alerts'] }),
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const unreadItems = (alertsQuery.data?.items ?? []).filter((item) => item.unread);

  const content = (
    <div className="staff-alerts-popover">
      <div className="staff-alerts-header">
        <div>
          <Typography.Text strong>Непросмотренные оповещения</Typography.Text>
          <Typography.Text type="secondary" className="staff-alerts-subtitle">
            Выберите нужное — откроется соответствующая запись или раздел.
          </Typography.Text>
        </div>
        {unreadItems.length ? (
          <Button
            type="link"
            size="small"
            icon={<CheckOutlined />}
            loading={markAllMutation.isPending}
            onClick={() => markAllMutation.mutate()}
          >
            Просмотрено всё
          </Button>
        ) : null}
      </div>
      {alertsQuery.isLoading ? (
        <div className="staff-alerts-loading"><Spin size="small" /></div>
      ) : unreadItems.length ? (
        <div className="staff-alerts-list">
          {unreadItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className="staff-alert-item"
              onClick={async () => {
                await markReadMutation.mutateAsync(item.key);
                setOpen(false);
                navigate(item.href);
              }}
            >
              <span className={`staff-alert-icon staff-alert-icon-${item.severity}`}>{getAlertIcon(item)}</span>
              <span className="staff-alert-copy">
                <span className="staff-alert-title-row">
                  <Typography.Text strong>{item.title}</Typography.Text>
                  {item.count > 1 ? <Tag>{item.count}</Tag> : null}
                </span>
                <Typography.Text type="secondary">{item.description}</Typography.Text>
                <Typography.Text type="secondary" className="staff-alert-time">{formatDateTime(item.occurredAt)}</Typography.Text>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Новых оповещений нет" />
      )}
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) void alertsQuery.refetch();
      }}
    >
      <Badge count={alertsQuery.data?.unreadTotal || undefined} size="small" overflowCount={99}>
        <Button type="text" shape="circle" icon={<BellOutlined />} aria-label="Непросмотренные оповещения" />
      </Badge>
    </Popover>
  );
}

function getAlertIcon(item: StaffAlertItem) {
  if (item.severity === 'error') return <ExclamationCircleOutlined />;
  if (item.severity === 'warning') return <WarningOutlined />;
  return <InfoCircleOutlined />;
}
