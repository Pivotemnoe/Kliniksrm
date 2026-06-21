import { Typography } from 'antd';
import { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  description?: string;
  extra?: ReactNode;
};

export function PageHeader({ title, description, extra }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <Typography.Title level={2}>{title}</Typography.Title>
        {description ? <Typography.Text type="secondary">{description}</Typography.Text> : null}
      </div>
      {extra}
    </div>
  );
}
