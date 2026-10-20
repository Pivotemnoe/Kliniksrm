import { Button, Dropdown } from 'antd';
import { MoreOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import './module-ui.css';

export type ModuleAction = {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void | Promise<unknown>;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
};

/** The same actions remain available at every width; only their placement changes. */
export function ModuleActions({ primary, actions, label = 'Другие действия' }: {
  primary?: ReactNode;
  actions: ModuleAction[];
  label?: string;
}) {
  return <div className="module-actions">
    {primary && <div className="module-actions-primary">{primary}</div>}
    <div className="module-actions-desktop">{actions.map(action => <Button key={action.key}
      icon={action.icon} disabled={action.disabled} loading={action.loading} danger={action.danger}
      onClick={() => void action.onClick()}>{action.label}</Button>)}</div>
    {actions.length > 0 && <Dropdown trigger={['click']} menu={{ items: actions.map(action => ({
      key: action.key, label: action.label, icon: action.icon, danger: action.danger,
      disabled: action.disabled || action.loading, onClick: () => void action.onClick(),
    })) }}><Button className="module-actions-more" icon={<MoreOutlined />} aria-label={label}>Ещё</Button></Dropdown>}
  </div>;
}
