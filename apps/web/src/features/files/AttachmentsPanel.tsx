import { DeleteOutlined, DownloadOutlined, PaperClipOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, List, Popconfirm, Space, Typography, Upload } from 'antd';
import { getErrorMessage } from '../../api/errors';
import { deleteAttachment, downloadAttachment } from './files.api';
import { FileAttachment } from './types';

export function AttachmentsPanel({
  queryKey,
  listFiles,
  uploadFile,
  canManage,
  title = 'Прикреплённые файлы',
  description = 'PDF, JPG, PNG, WEBP, DOCX, XLSX, XLS или CSV, не более 15 МБ.',
}: {
  queryKey: readonly unknown[];
  listFiles: () => Promise<FileAttachment[]>;
  uploadFile: (file: File) => Promise<FileAttachment>;
  canManage: boolean;
  title?: string;
  description?: string;
}) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const filesQuery = useQuery({ queryKey, queryFn: listFiles });
  const uploadMutation = useMutation({
    mutationFn: uploadFile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      message.success('Файл сохранён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteAttachment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      message.success('Файл удалён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const downloadMutation = useMutation({
    mutationFn: downloadAttachment,
    onError: (error) => message.error(getErrorMessage(error)),
  });

  return (
    <div>
      <Space direction="vertical" size={4} className="full-width">
        <Typography.Text strong><PaperClipOutlined /> {title}</Typography.Text>
        <Typography.Text type="secondary">{description}</Typography.Text>
        {filesQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(filesQuery.error)} /> : null}
        <List<FileAttachment>
          size="small"
          loading={filesQuery.isLoading}
          dataSource={filesQuery.data ?? []}
          locale={{ emptyText: 'Файлы ещё не прикреплены' }}
          renderItem={(file) => (
            <List.Item
              actions={[
                <Button key="download" type="link" size="small" icon={<DownloadOutlined />} loading={downloadMutation.isPending} onClick={() => downloadMutation.mutate(file)}>
                  Скачать
                </Button>,
                canManage ? (
                  <Popconfirm key="delete" title="Удалить этот файл?" okText="Удалить" cancelText="Отмена" onConfirm={() => deleteMutation.mutate(file.id)}>
                    <Button danger type="link" size="small" icon={<DeleteOutlined />} loading={deleteMutation.isPending}>Удалить</Button>
                  </Popconfirm>
                ) : null,
              ].filter(Boolean)}
            >
              <List.Item.Meta
                title={file.originalName}
                description={`${formatFileSize(file.sizeBytes)} · ${file.uploadedBy?.fullName ?? 'Сотрудник'} · ${new Date(file.createdAt).toLocaleString('ru-RU')}`}
              />
            </List.Item>
          )}
        />
        {canManage ? (
          <Upload
            accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,.xls,.csv"
            maxCount={1}
            showUploadList={false}
            customRequest={({ file, onSuccess, onError }) => {
              uploadMutation.mutate(file as File, {
                onSuccess: (result) => onSuccess?.(result),
                onError: (error) => onError?.(error as Error),
              });
            }}
          >
            <Button icon={<UploadOutlined />} loading={uploadMutation.isPending}>Прикрепить файл</Button>
          </Upload>
        ) : null}
      </Space>
    </div>
  );
}

function formatFileSize(value: number | null) {
  if (value === null) return 'размер не указан';
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}
