import { EditOutlined, ExperimentOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Drawer, Form, Input, Select, Space, Switch, Table, Tabs, Tag, Typography } from 'antd';
import { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatMoney } from '../../shared/utils/money';
import {
  createLaboratoryProfile,
  createLaboratoryTest,
  getLaboratoryResources,
  listLaboratoryProfiles,
  listLaboratoryTests,
  updateLaboratoryProfile,
  updateLaboratoryTest,
} from './laboratory.api';
import { LaboratoryProfile, LaboratoryResources, LaboratoryTest } from './types';

const pageSize = 10;
const nullableText = z.string().trim().optional().transform((value) => value || undefined);
const testSchema = z.object({
  title: z.string().trim().min(1, 'Укажите название анализа').max(240),
  code: nullableText,
  groupName: nullableText,
  material: nullableText,
  method: nullableText,
  unit: nullableText,
  referenceRange: nullableText,
  species: z.array(z.string()).optional(),
  serviceId: nullableText,
  isActive: z.boolean().default(true),
  description: nullableText,
});
const profileSchema = z.object({
  title: z.string().trim().min(1, 'Укажите название профиля').max(240),
  code: nullableText,
  description: nullableText,
  species: z.array(z.string()).optional(),
  serviceId: nullableText,
  isActive: z.boolean().default(true),
  testIds: z.array(z.string()).optional(),
});

type TestFormInput = z.input<typeof testSchema>;
type TestFormValues = z.output<typeof testSchema>;
type ProfileFormInput = z.input<typeof profileSchema>;
type ProfileFormValues = z.output<typeof profileSchema>;

export function LaboratoryPage() {
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'laboratory.manage');
  const [activeTab, setActiveTab] = useState('tests');
  const [search, setSearch] = useState('');
  const [species, setSpecies] = useState<string | undefined>();
  const [offset, setOffset] = useState(0);
  const [editingTest, setEditingTest] = useState<LaboratoryTest | null>(null);
  const [editingProfile, setEditingProfile] = useState<LaboratoryProfile | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const resourcesQuery = useQuery({ queryKey: ['laboratory', 'resources'], queryFn: getLaboratoryResources });

  function handleSearch(value: string) {
    setSearch(value.trim());
    setOffset(0);
  }

  function handleTableChange(pagination: TablePaginationConfig) {
    const current = pagination.current ?? 1;
    const size = pagination.pageSize ?? pageSize;
    setOffset((current - 1) * size);
  }

  return (
    <div className="page">
      <PageHeader
        title="Лаборатории"
        description="Внутренние анализы, профили, единицы измерения, виды животных и связь с услугами."
        extra={
          canManage ? (
            <Space wrap>
              <Button icon={<PlusOutlined />} onClick={() => openTest(null)}>
                Добавить анализ
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openProfile(null)}>
                Добавить профиль
              </Button>
            </Space>
          ) : null
        }
      />
      <div className="list-panel">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);
            setOffset(0);
          }}
          tabBarExtraContent={
            <Space wrap>
              <Select
                allowClear
                placeholder="Вид животного"
                className="status-filter"
                value={species}
                onChange={(value) => {
                  setSpecies(value);
                  setOffset(0);
                }}
                options={resourcesQuery.data?.species.map((item) => ({ value: item.title, label: item.title })) ?? []}
              />
              <Input.Search allowClear enterButton={<SearchOutlined />} placeholder="Поиск" className="search-input" onSearch={handleSearch} />
            </Space>
          }
          items={[
            {
              key: 'tests',
              label: 'Анализы',
              children: (
                <TestsTable
                  search={search}
                  species={species}
                  offset={offset}
                  canManage={canManage}
                  onTableChange={handleTableChange}
                  onEdit={openTest}
                />
              ),
            },
            {
              key: 'profiles',
              label: 'Профили',
              children: (
                <ProfilesTable
                  search={search}
                  species={species}
                  offset={offset}
                  canManage={canManage}
                  onTableChange={handleTableChange}
                  onEdit={openProfile}
                />
              ),
            },
          ]}
        />
      </div>
      <TestDrawer
        open={testOpen}
        test={editingTest}
        resources={resourcesQuery.data}
        onClose={() => setTestOpen(false)}
      />
      <ProfileDrawer
        open={profileOpen}
        profile={editingProfile}
        resources={resourcesQuery.data}
        onClose={() => setProfileOpen(false)}
      />
    </div>
  );

  function openTest(test: LaboratoryTest | null) {
    setEditingTest(test);
    setTestOpen(true);
  }

  function openProfile(profile: LaboratoryProfile | null) {
    setEditingProfile(profile);
    setProfileOpen(true);
  }
}

function TestsTable({
  search,
  species,
  offset,
  canManage,
  onTableChange,
  onEdit,
}: {
  search: string;
  species?: string;
  offset: number;
  canManage: boolean;
  onTableChange: (pagination: TablePaginationConfig) => void;
  onEdit: (test: LaboratoryTest) => void;
}) {
  const query = useQuery({
    queryKey: ['laboratory', 'tests', { search, species, limit: pageSize, offset }],
    queryFn: () => listLaboratoryTests({ search, species, limit: pageSize, offset }),
  });
  const columns = useMemo<ColumnsType<LaboratoryTest>>(
    () => [
      { title: 'Анализ', dataIndex: 'title', key: 'title', render: (value, item) => <TitleCell title={value} code={item.code} /> },
      { title: 'Группа', dataIndex: 'groupName', key: 'groupName', width: 150, render: fallback },
      { title: 'Материал', dataIndex: 'material', key: 'material', width: 140, render: fallback },
      { title: 'Метод', dataIndex: 'method', key: 'method', width: 140, render: fallback },
      { title: 'Ед.', dataIndex: 'unit', key: 'unit', width: 90, render: fallback },
      { title: 'Референс', dataIndex: 'referenceRange', key: 'referenceRange', width: 150, render: fallback },
      { title: 'Виды', dataIndex: 'species', key: 'species', width: 180, render: renderSpecies },
      { title: 'Услуга', key: 'service', render: (_, item) => item.service ? `${item.service.title} · ${formatMoney(item.service.price)}` : '—' },
      { title: 'Статус', dataIndex: 'isActive', key: 'isActive', width: 110, render: activeTag },
      {
        title: '',
        key: 'actions',
        width: 110,
        render: (_, item) =>
          canManage ? (
            <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(item)}>
              Открыть
            </Button>
          ) : null,
      },
    ],
    [canManage, onEdit],
  );

  return (
    <div className="list-panel-body">
      {query.isError ? <Alert type="error" showIcon message={getErrorMessage(query.error)} className="form-alert" /> : null}
      <Table<LaboratoryTest>
        rowKey="id"
        columns={columns}
        dataSource={query.data?.items ?? []}
        loading={query.isLoading}
        pagination={{ current: offset / pageSize + 1, pageSize, total: query.data?.total ?? 0, showSizeChanger: false }}
        onChange={onTableChange}
        className="dense-table"
        scroll={{ x: 1180 }}
      />
    </div>
  );
}

function ProfilesTable({
  search,
  species,
  offset,
  canManage,
  onTableChange,
  onEdit,
}: {
  search: string;
  species?: string;
  offset: number;
  canManage: boolean;
  onTableChange: (pagination: TablePaginationConfig) => void;
  onEdit: (profile: LaboratoryProfile) => void;
}) {
  const query = useQuery({
    queryKey: ['laboratory', 'profiles', { search, species, limit: pageSize, offset }],
    queryFn: () => listLaboratoryProfiles({ search, species, limit: pageSize, offset }),
  });
  const columns = useMemo<ColumnsType<LaboratoryProfile>>(
    () => [
      { title: 'Профиль', dataIndex: 'title', key: 'title', render: (value, item) => <TitleCell title={value} code={item.code} /> },
      { title: 'Виды', dataIndex: 'species', key: 'species', width: 180, render: renderSpecies },
      { title: 'Анализы', key: 'tests', render: (_, item) => item.tests.map((link) => link.test.title).join(', ') || '—' },
      { title: 'Услуга', key: 'service', render: (_, item) => item.service ? `${item.service.title} · ${formatMoney(item.service.price)}` : '—' },
      { title: 'Статус', dataIndex: 'isActive', key: 'isActive', width: 110, render: activeTag },
      {
        title: '',
        key: 'actions',
        width: 110,
        render: (_, item) =>
          canManage ? (
            <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(item)}>
              Открыть
            </Button>
          ) : null,
      },
    ],
    [canManage, onEdit],
  );

  return (
    <div className="list-panel-body">
      {query.isError ? <Alert type="error" showIcon message={getErrorMessage(query.error)} className="form-alert" /> : null}
      <Table<LaboratoryProfile>
        rowKey="id"
        columns={columns}
        dataSource={query.data?.items ?? []}
        loading={query.isLoading}
        pagination={{ current: offset / pageSize + 1, pageSize, total: query.data?.total ?? 0, showSizeChanger: false }}
        onChange={onTableChange}
        className="dense-table"
        scroll={{ x: 980 }}
      />
    </div>
  );
}

function TestDrawer({ open, test, resources, onClose }: { open: boolean; test: LaboratoryTest | null; resources?: LaboratoryResources; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const form = useForm<TestFormInput, unknown, TestFormValues>({ resolver: zodResolver(testSchema), defaultValues: getTestDefaults(test) });
  const mutation = useMutation({
    mutationFn: (values: TestFormValues) => test ? updateLaboratoryTest(test.id, values) : createLaboratoryTest(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['laboratory', 'tests'] });
      await queryClient.invalidateQueries({ queryKey: ['laboratory', 'profiles'] });
      message.success(test ? 'Анализ обновлён' : 'Анализ создан');
      onClose();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  useEffect(() => {
    form.reset(getTestDefaults(test));
  }, [form, test, open]);

  return (
    <Drawer title={test ? 'Анализ' : 'Новый анализ'} open={open} onClose={onClose} width={620} destroyOnHidden>
      <Form layout="vertical" onFinish={form.handleSubmit((values) => mutation.mutate(values))}>
        <FormInput control={form.control} name="title" label="Название" />
        <Space className="form-grid-two" align="start">
          <FormInput control={form.control} name="code" label="Код" />
          <FormInput control={form.control} name="groupName" label="Группа" />
        </Space>
        <Space className="form-grid-two" align="start">
          <FormInput control={form.control} name="material" label="Биоматериал" />
          <FormInput control={form.control} name="method" label="Метод" />
        </Space>
        <Space className="form-grid-two" align="start">
          <FormInput control={form.control} name="unit" label="Единица измерения" />
          <FormInput control={form.control} name="referenceRange" label="Референс" />
        </Space>
        <SpeciesSelect control={form.control} resources={resources} />
        <ServiceSelect control={form.control} resources={resources} />
        <FormInput control={form.control} name="description" label="Описание" textarea />
        <ActiveSwitch control={form.control} />
        <Button type="primary" htmlType="submit" loading={mutation.isPending}>
          Сохранить
        </Button>
      </Form>
    </Drawer>
  );
}

function ProfileDrawer({ open, profile, resources, onClose }: { open: boolean; profile: LaboratoryProfile | null; resources?: LaboratoryResources; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const testsQuery = useQuery({ queryKey: ['laboratory', 'tests', 'select'], queryFn: () => listLaboratoryTests({ limit: 300, offset: 0, isActive: true }) });
  const form = useForm<ProfileFormInput, unknown, ProfileFormValues>({ resolver: zodResolver(profileSchema), defaultValues: getProfileDefaults(profile) });
  const mutation = useMutation({
    mutationFn: (values: ProfileFormValues) => profile ? updateLaboratoryProfile(profile.id, values) : createLaboratoryProfile(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['laboratory', 'profiles'] });
      message.success(profile ? 'Профиль обновлён' : 'Профиль создан');
      onClose();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  useEffect(() => {
    form.reset(getProfileDefaults(profile));
  }, [form, profile, open]);

  return (
    <Drawer title={profile ? 'Профиль анализов' : 'Новый профиль анализов'} open={open} onClose={onClose} width={620} destroyOnHidden>
      <Form layout="vertical" onFinish={form.handleSubmit((values) => mutation.mutate(values))}>
        <FormInput control={form.control} name="title" label="Название" />
        <FormInput control={form.control} name="code" label="Код" />
        <SpeciesSelect control={form.control} resources={resources} />
        <ServiceSelect control={form.control} resources={resources} />
        <Controller
          control={form.control}
          name="testIds"
          render={({ field, fieldState }) => (
            <Form.Item label="Анализы в профиле" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Select
                {...field}
                mode="multiple"
                showSearch
                optionFilterProp="label"
                options={testsQuery.data?.items.map((item) => ({ value: item.id, label: item.code ? `${item.title} · ${item.code}` : item.title })) ?? []}
              />
            </Form.Item>
          )}
        />
        <FormInput control={form.control} name="description" label="Описание" textarea />
        <ActiveSwitch control={form.control} />
        <Button type="primary" htmlType="submit" loading={mutation.isPending}>
          Сохранить
        </Button>
      </Form>
    </Drawer>
  );
}

function TitleCell({ title, code }: { title: string; code?: string | null }) {
  return (
    <Space direction="vertical" size={0}>
      <Typography.Text strong>{title}</Typography.Text>
      {code ? <Typography.Text type="secondary">{code}</Typography.Text> : null}
    </Space>
  );
}

function FormInput({ control, name, label, textarea }: { control: any; name: string; label: string; textarea?: boolean }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item label={label} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
          {textarea ? <Input.TextArea {...field} rows={3} /> : <Input {...field} />}
        </Form.Item>
      )}
    />
  );
}

function SpeciesSelect({ control, resources }: { control: any; resources?: LaboratoryResources }) {
  return (
    <Controller
      control={control}
      name="species"
      render={({ field, fieldState }) => (
        <Form.Item label="Виды животных" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
          <Select
            {...field}
            mode="tags"
            placeholder="Все виды"
            options={resources?.species.map((item) => ({ value: item.title, label: item.title })) ?? []}
          />
        </Form.Item>
      )}
    />
  );
}

function ServiceSelect({ control, resources }: { control: any; resources?: LaboratoryResources }) {
  return (
    <Controller
      control={control}
      name="serviceId"
      render={({ field, fieldState }) => (
        <Form.Item label="Связанная услуга" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
          <Select
            {...field}
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Не связана"
            options={resources?.services.map((item) => ({ value: item.id, label: `${item.title} · ${formatMoney(item.price)}` })) ?? []}
          />
        </Form.Item>
      )}
    />
  );
}

function ActiveSwitch({ control }: { control: any }) {
  return (
    <Controller
      control={control}
      name="isActive"
      render={({ field }) => (
        <Form.Item label="Активен">
          <Switch checked={field.value} onChange={field.onChange} />
        </Form.Item>
      )}
    />
  );
}

function getTestDefaults(test: LaboratoryTest | null): TestFormInput {
  return {
    title: test?.title ?? '',
    code: test?.code ?? '',
    groupName: test?.groupName ?? '',
    material: test?.material ?? '',
    method: test?.method ?? '',
    unit: test?.unit ?? '',
    referenceRange: test?.referenceRange ?? '',
    species: test?.species ?? [],
    serviceId: test?.serviceId ?? '',
    isActive: test?.isActive ?? true,
    description: test?.description ?? '',
  };
}

function getProfileDefaults(profile: LaboratoryProfile | null): ProfileFormInput {
  return {
    title: profile?.title ?? '',
    code: profile?.code ?? '',
    description: profile?.description ?? '',
    species: profile?.species ?? [],
    serviceId: profile?.serviceId ?? '',
    isActive: profile?.isActive ?? true,
    testIds: profile?.tests.map((link) => link.testId) ?? [],
  };
}

function renderSpecies(values: string[]) {
  return values.length ? (
    <Space wrap size={4}>
      {values.map((value) => (
        <Tag key={value}>{value}</Tag>
      ))}
    </Space>
  ) : (
    'Все'
  );
}

function activeTag(value: boolean) {
  return value ? <Tag color="green">Активен</Tag> : <Tag>Выключен</Tag>;
}

function fallback(value?: string | null) {
  return value || '—';
}
