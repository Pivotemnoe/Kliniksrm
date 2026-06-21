import { CheckCircleOutlined, EditOutlined, PlusOutlined, PushpinOutlined, StopOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Checkbox, Drawer, Form, Input, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/utils/date';
import { listRoles } from '../employees/employees.api';
import { RoleTemplate } from '../employees/types';
import { archiveNewsPost, createNewsPost, listNewsPosts, markNewsPostRead, updateNewsPost } from './news.api';
import { NewsPost, NewsPostInput, NewsPriority, newsPriorityColors, newsPriorityLabels } from './types';

const pageSize = 10;
const priorityOptions = Object.entries(newsPriorityLabels).map(([value, label]) => ({ value, label }));

const newsSchema = z.object({
  title: z.string().trim().min(2, 'Укажите заголовок').max(200),
  body: z.string().trim().min(1, 'Введите текст новости').max(5000),
  priority: z.enum(['INFO', 'IMPORTANT', 'CRITICAL']),
  isPinned: z.boolean(),
  audienceRoleCodes: z.array(z.string()).default([]),
});

type NewsFormValues = z.output<typeof newsSchema>;
type NewsFormInput = z.input<typeof newsSchema>;

export function NewsPage() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'news.manage');
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState<NewsPriority | undefined>();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [offset, setOffset] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<NewsPost | null>(null);
  const newsQuery = useQuery({
    queryKey: ['news', { search, priority, unreadOnly, includeArchived, limit: pageSize, offset }],
    queryFn: () => listNewsPosts({ search, priority, unreadOnly, includeArchived, limit: pageSize, offset }),
  });
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: listRoles, enabled: canManage });
  const saveMutation = useMutation({
    mutationFn: (values: NewsPostInput) => (editingPost ? updateNewsPost(editingPost.id, values) : createNewsPost(values)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['news'] });
      message.success(editingPost ? 'Новость сохранена' : 'Новость опубликована');
      closeDrawer();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const archiveMutation = useMutation({
    mutationFn: (post: NewsPost) => archiveNewsPost(post.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['news'] });
      message.success('Новость отправлена в архив');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const readMutation = useMutation({
    mutationFn: (post: NewsPost) => markNewsPostRead(post.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['news'] });
      message.success('Новость отмечена как прочитанная');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const columns = useMemo<ColumnsType<NewsPost>>(
    () => [
      {
        title: 'Новость',
        key: 'title',
        render: (_, post) => (
          <Space direction="vertical" size={4}>
            <Space wrap>
              {post.isPinned ? <Tag icon={<PushpinOutlined />} color="green">Закреплена</Tag> : null}
              <Tag color={newsPriorityColors[post.priority]}>{newsPriorityLabels[post.priority]}</Tag>
              {post.isRead ? <Tag>Прочитана</Tag> : <Tag color="blue">Новая</Tag>}
              {post.archivedAt ? <Tag>Архив</Tag> : null}
            </Space>
            <Typography.Text strong>{post.title}</Typography.Text>
            <Typography.Paragraph className="news-post-body">{post.body}</Typography.Paragraph>
          </Space>
        ),
      },
      {
        title: 'Для ролей',
        key: 'audience',
        width: 190,
        render: (_, post) => formatAudience(post.audienceRoleCodes, rolesQuery.data ?? []),
      },
      {
        title: 'Автор / дата',
        key: 'meta',
        width: 230,
        render: (_, post) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{post.createdBy?.fullName ?? 'Система'}</Typography.Text>
            <Typography.Text type="secondary">{formatDateTime(post.publishedAt)}</Typography.Text>
          </Space>
        ),
      },
      {
        title: '',
        key: 'actions',
        width: 260,
        render: (_, post) => (
          <Space wrap>
            {!post.isRead && !post.archivedAt ? (
              <Button size="small" icon={<CheckCircleOutlined />} loading={readMutation.isPending} onClick={() => readMutation.mutate(post)}>
                Прочитано
              </Button>
            ) : null}
            {canManage ? (
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(post)}>
                Открыть
              </Button>
            ) : null}
            {canManage && !post.archivedAt ? (
              <Button size="small" icon={<StopOutlined />} loading={archiveMutation.isPending} onClick={() => archiveMutation.mutate(post)}>
                В архив
              </Button>
            ) : null}
          </Space>
        ),
      },
    ],
    [archiveMutation, canManage, readMutation, rolesQuery.data],
  );

  function handleTableChange(pagination: TablePaginationConfig) {
    const current = pagination.current ?? 1;
    const size = pagination.pageSize ?? pageSize;
    setOffset((current - 1) * size);
  }

  function openCreate() {
    setEditingPost(null);
    setDrawerOpen(true);
  }

  function openEdit(post: NewsPost) {
    setEditingPost(post);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingPost(null);
    saveMutation.reset();
  }

  return (
    <div className="page">
      <PageHeader
        title="Новости"
        description="Внутренние объявления клиники, обновления регламентов и важные сообщения сотрудникам."
        extra={
          canManage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Опубликовать
            </Button>
          ) : null
        }
      />
      <div className="list-panel">
        <div className="list-panel-header">
          <Space wrap>
            <Input.Search
              allowClear
              className="search-input"
              placeholder="Поиск по новостям"
              onSearch={(value) => {
                setSearch(value);
                setOffset(0);
              }}
            />
            <Select
              allowClear
              className="status-filter"
              placeholder="Важность"
              value={priority}
              options={priorityOptions}
              onChange={(value) => {
                setPriority(value);
                setOffset(0);
              }}
            />
            <Checkbox
              checked={unreadOnly}
              onChange={(event) => {
                setUnreadOnly(event.target.checked);
                setOffset(0);
              }}
            >
              Только непрочитанные
            </Checkbox>
            {canManage ? (
              <Checkbox
                checked={includeArchived}
                onChange={(event) => {
                  setIncludeArchived(event.target.checked);
                  setOffset(0);
                }}
              >
                Показывать архив
              </Checkbox>
            ) : null}
          </Space>
        </div>
        <div className="list-panel-body">
          {newsQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(newsQuery.error)} className="form-alert" /> : null}
          <Table<NewsPost>
            rowKey="id"
            className="dense-table"
            columns={columns}
            dataSource={newsQuery.data?.items ?? []}
            loading={newsQuery.isLoading}
            pagination={{
              current: offset / pageSize + 1,
              pageSize,
              total: newsQuery.data?.total ?? 0,
              showSizeChanger: false,
            }}
            onChange={handleTableChange}
            onRow={(post) => ({ onDoubleClick: () => canManage && openEdit(post) })}
          />
        </div>
      </div>
      <NewsDrawer
        open={drawerOpen}
        post={editingPost}
        roles={rolesQuery.data ?? []}
        loading={saveMutation.isPending}
        submitError={saveMutation.error}
        onClose={closeDrawer}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
    </div>
  );
}

function NewsDrawer({
  open,
  post,
  roles,
  loading,
  submitError,
  onClose,
  onSubmit,
}: {
  open: boolean;
  post: NewsPost | null;
  roles: RoleTemplate[];
  loading: boolean;
  submitError?: unknown;
  onClose: () => void;
  onSubmit: (values: NewsFormValues) => void;
}) {
  const { control, handleSubmit, reset } = useForm<NewsFormInput, unknown, NewsFormValues>({
    resolver: zodResolver(newsSchema),
    defaultValues: getNewsDefaults(null),
  });

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      reset(getNewsDefaults(post));
    }
  }

  return (
    <Drawer
      title={post ? 'Редактирование новости' : 'Новая новость'}
      width={680}
      open={open}
      onClose={onClose}
      afterOpenChange={handleOpenChange}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>Отмена</Button>
          <Button type="primary" loading={loading} onClick={handleSubmit(onSubmit)}>
            {post ? 'Сохранить' : 'Опубликовать'}
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        {submitError ? <Alert type="error" showIcon message={getErrorMessage(submitError)} className="form-alert" /> : null}
        <Controller
          control={control}
          name="title"
          render={({ field, fieldState }) => (
            <Form.Item label="Заголовок" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input {...field} autoFocus />
            </Form.Item>
          )}
        />
        <div className="form-grid two-columns">
          <Controller
            control={control}
            name="priority"
            render={({ field }) => (
              <Form.Item label="Важность">
                <Select {...field} options={priorityOptions} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="audienceRoleCodes"
            render={({ field }) => (
              <Form.Item label="Для ролей">
                <Select
                  {...field}
                  mode="multiple"
                  placeholder="Все сотрудники"
                  options={roles.map((role) => ({ value: role.code, label: role.title }))}
                />
              </Form.Item>
            )}
          />
        </div>
        <Controller
          control={control}
          name="body"
          render={({ field, fieldState }) => (
            <Form.Item label="Текст" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input.TextArea {...field} rows={10} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="isPinned"
          render={({ field }) => (
            <Space>
              <Switch checked={field.value} onChange={field.onChange} />
              <Typography.Text>Закрепить сверху</Typography.Text>
            </Space>
          )}
        />
      </Form>
    </Drawer>
  );
}

function getNewsDefaults(post: NewsPost | null): NewsFormInput {
  return {
    title: post?.title ?? '',
    body: post?.body ?? '',
    priority: post?.priority ?? 'INFO',
    isPinned: post?.isPinned ?? false,
    audienceRoleCodes: post?.audienceRoleCodes ?? [],
  };
}

function formatAudience(roleCodes: string[], roles: RoleTemplate[]) {
  if (!roleCodes.length) {
    return <Tag>Все сотрудники</Tag>;
  }

  return (
    <Space wrap>
      {roleCodes.map((code) => (
        <Tag key={code}>{roles.find((role) => role.code === code)?.title ?? code}</Tag>
      ))}
    </Space>
  );
}
