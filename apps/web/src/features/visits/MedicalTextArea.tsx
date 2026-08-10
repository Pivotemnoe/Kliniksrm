import {
  BulbOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  OrderedListOutlined,
  PushpinFilled,
  PushpinOutlined,
  SaveOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Divider, Empty, Input, List, Popconfirm, Popover, Select, Space, Switch, Tag, Tooltip, Typography } from 'antd';
import { useMemo } from 'react';
import { getErrorMessage } from '../../api/errors';
import { formatDateTime } from '../../shared/utils/date';
import {
  actOnPersonalMedicalPhrase,
  listMedicalPhrases,
  recordMedicalPhraseUsage,
  removePersonalMedicalPhrase,
  savePersonalMedicalPhrase,
  updateMedicalPhraseAssistantSettings,
} from '../medicalPhrases/medicalPhrases.api';
import { MedicalPhrase, PersonalMedicalPhraseAction } from '../medicalPhrases/types';

type MedicalSnippet = {
  label: string;
  text: string;
};

type MedicalTextAreaProps = {
  value?: string;
  rows?: number;
  disabled?: boolean;
  placeholder?: string;
  snippets?: MedicalSnippet[];
  fieldKey?: string;
  species?: string | null;
  diagnoses?: Array<string | null | undefined>;
  onChange: (value: string) => void;
};

type SnippetOption = {
  value: string;
  label: string;
  text: string;
  phraseId?: string;
};

export function MedicalTextArea({
  value = '',
  rows = 4,
  disabled,
  placeholder,
  snippets = [],
  fieldKey,
  species,
  diagnoses = [],
  onChange,
}: MedicalTextAreaProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const diagnosis = diagnoses.map((item) => item?.trim()).find(Boolean);
  const phraseQueryKey = ['medical-phrases', fieldKey, species ?? '', diagnosis ?? ''] as const;
  const phrasesQuery = useQuery({
    queryKey: phraseQueryKey,
    queryFn: () =>
      listMedicalPhrases({
        field: fieldKey,
        species: species ?? undefined,
        diagnosis,
      }),
    enabled: Boolean(fieldKey),
    staleTime: 60_000,
  });
  const usageMutation = useMutation({ mutationFn: recordMedicalPhraseUsage });
  const assistantSettingsMutation = useMutation({
    mutationFn: updateMedicalPhraseAssistantSettings,
    onSuccess: async (settings) => {
      await queryClient.invalidateQueries({ queryKey: ['medical-phrases'] });
      message.success(settings.enabled ? 'Личный помощник включён' : 'Личный помощник выключен');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const savePersonalMutation = useMutation({
    mutationFn: () =>
      savePersonalMedicalPhrase({
        field: fieldKey!,
        title: buildPersonalPhraseTitle(value),
        text: value.trim(),
        species: species?.trim() || undefined,
        diagnosis,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['medical-phrases'] });
      message.success('Текст сохранён как личная фраза');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const personalActionMutation = useMutation({
    mutationFn: ({ phraseId, action }: { phraseId: string; action: PersonalMedicalPhraseAction }) =>
      actOnPersonalMedicalPhrase(phraseId, action),
    onSuccess: async (_, input) => {
      await queryClient.invalidateQueries({ queryKey: ['medical-phrases'] });
      const resultLabel: Record<PersonalMedicalPhraseAction, string> = {
        ACCEPT: 'Предложение принято',
        REJECT: 'Фраза больше не будет предлагаться',
        PIN: 'Фраза закреплена',
        UNPIN: 'Фраза откреплена',
      };
      message.success(resultLabel[input.action]);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const removePersonalMutation = useMutation({
    mutationFn: removePersonalMedicalPhrase,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['medical-phrases'] });
      message.success('Личная фраза удалена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const phrases = phrasesQuery.data?.items ?? [];
  const assistantEnabled = phrasesQuery.data?.assistantEnabled ?? true;
  const snippetOptions = useMemo(() => buildSnippetOptions(phrases, snippets), [phrases, snippets]);

  function insert(text: string, phraseId?: string) {
    onChange(appendText(value, text));
    if (phraseId) usageMutation.mutate(phraseId);
  }

  function selectSnippet(selectedValue: string) {
    const option = snippetOptions.find((item) => item.value === selectedValue);
    if (option) insert(option.text, option.phraseId);
  }

  const assistantContent = fieldKey ? (
    <div className="medical-assistant-popover">
      <div className="medical-assistant-heading">
        <div>
          <Typography.Text strong>Личный помощник врача</Typography.Text>
          <div>
            <Typography.Text type="secondary">
              Предлагает текст только после двух повторов. Решение всегда принимает врач.
            </Typography.Text>
          </div>
        </div>
        <Switch
          checked={assistantEnabled}
          loading={assistantSettingsMutation.isPending}
          onChange={(checked) => assistantSettingsMutation.mutate(checked)}
          checkedChildren="Вкл."
          unCheckedChildren="Выкл."
        />
      </div>
      <Button
        block
        icon={<SaveOutlined />}
        disabled={disabled || !assistantEnabled || value.trim().length < 2 || value.trim().length > 4000}
        loading={savePersonalMutation.isPending}
        onClick={() => savePersonalMutation.mutate()}
      >
        Сохранить текущий текст как личную фразу
      </Button>
      <Divider plain>Фразы для этого поля</Divider>
      {phrases.length ? (
        <List<MedicalPhrase>
          size="small"
          dataSource={phrases}
          renderItem={(phrase) => (
            <List.Item
              className="medical-assistant-item"
              actions={buildPhraseActions({
                phrase,
                disabled: Boolean(disabled),
                insert: () => insert(phrase.text, phrase.id),
                act: (action) => personalActionMutation.mutate({ phraseId: phrase.id, action }),
                remove: () => removePersonalMutation.mutate(phrase.id),
                pending: personalActionMutation.isPending || removePersonalMutation.isPending,
              })}
            >
              <List.Item.Meta
                title={
                  <Space size={4} wrap>
                    {phrase.isPinned ? <PushpinFilled className="medical-assistant-pin" /> : null}
                    <Typography.Text strong>{phrase.title}</Typography.Text>
                    <PhraseTag phrase={phrase} />
                  </Space>
                }
                description={<Typography.Paragraph ellipsis={{ rows: 3 }} className="medical-assistant-text">{phrase.text}</Typography.Paragraph>}
              />
            </List.Item>
          )}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={assistantEnabled ? 'Подходящих фраз пока нет' : 'Личный помощник выключен'} />
      )}
    </div>
  ) : null;

  return (
    <div className="medical-text-editor">
      <div className="medical-text-toolbar">
        <Space size={6} wrap>
          <Tooltip title="Добавить пункт списка">
            <Button size="small" icon={<UnorderedListOutlined />} disabled={disabled} onClick={() => insert('- ')} />
          </Tooltip>
          <Tooltip title="Добавить нумерованный пункт">
            <Button size="small" icon={<OrderedListOutlined />} disabled={disabled} onClick={() => insert('1. ')} />
          </Tooltip>
          <Tooltip title="Добавить дату и время">
            <Button size="small" icon={<ClockCircleOutlined />} disabled={disabled} onClick={() => insert(formatDateTime(new Date().toISOString()))} />
          </Tooltip>
          <Tooltip title="Добавить отметку нормы">
            <Button size="small" icon={<CheckCircleOutlined />} disabled={disabled} onClick={() => insert('Без особенностей.')} />
          </Tooltip>
          {assistantContent ? (
            <Popover trigger="click" placement="bottomLeft" content={assistantContent} overlayClassName="medical-assistant-overlay">
              <Button size="small" icon={<BulbOutlined />} disabled={disabled} loading={phrasesQuery.isLoading}>
                Помощник
                {phrases.some((phrase) => phrase.isSuggested) ? <span className="medical-assistant-dot" /> : null}
              </Button>
            </Popover>
          ) : null}
        </Space>
        {snippetOptions.length ? (
          <Select<string>
            size="small"
            allowClear
            disabled={disabled}
            className="medical-snippet-select"
            placeholder="Быстрая фраза"
            options={snippetOptions.map((snippet) => ({ value: snippet.value, label: snippet.label }))}
            onSelect={selectSnippet}
            value={undefined}
          />
        ) : null}
      </div>
      <Input.TextArea
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function buildPhraseActions(input: {
  phrase: MedicalPhrase;
  disabled: boolean;
  insert: () => void;
  act: (action: PersonalMedicalPhraseAction) => void;
  remove: () => void;
  pending: boolean;
}) {
  const actions = [
    <Button key="insert" size="small" type="link" disabled={input.disabled} onClick={input.insert}>
      Вставить
    </Button>,
  ];

  if (input.phrase.source !== 'EMPLOYEE') return actions;
  if (input.phrase.isSuggested) {
    actions.push(
      <Tooltip key="accept" title="Сохранить предложение в личных фразах">
        <Button size="small" type="text" icon={<CheckOutlined />} loading={input.pending} onClick={() => input.act('ACCEPT')} />
      </Tooltip>,
      <Tooltip key="reject" title="Больше не предлагать эту фразу">
        <Button size="small" type="text" danger icon={<CloseOutlined />} loading={input.pending} onClick={() => input.act('REJECT')} />
      </Tooltip>,
    );
    return actions;
  }

  actions.push(
    <Tooltip key="pin" title={input.phrase.isPinned ? 'Открепить' : 'Закрепить наверху'}>
      <Button
        size="small"
        type="text"
        icon={input.phrase.isPinned ? <PushpinFilled /> : <PushpinOutlined />}
        loading={input.pending}
        onClick={() => input.act(input.phrase.isPinned ? 'UNPIN' : 'PIN')}
      />
    </Tooltip>,
    <Popconfirm key="delete" title="Удалить личную фразу?" okText="Удалить" cancelText="Отмена" onConfirm={input.remove}>
      <Button size="small" type="text" danger icon={<DeleteOutlined />} loading={input.pending} />
    </Popconfirm>,
  );
  return actions;
}

function PhraseTag({ phrase }: { phrase: MedicalPhrase }) {
  if (phrase.isSuggested) return <Tag color="orange">Предложение</Tag>;
  if (phrase.source === 'EMPLOYEE') return <Tag color="blue">Личная</Tag>;
  if (phrase.source === 'DIAGNOSIS_TEMPLATE') return <Tag color="purple">По диагнозу</Tag>;
  return <Tag>Общая</Tag>;
}

function buildSnippetOptions(phrases: MedicalPhrase[], snippets: MedicalSnippet[]) {
  const seen = new Set<string>();
  const options: SnippetOption[] = [];

  for (const phrase of phrases) {
    addOption(options, seen, {
      value: `phrase:${phrase.id}`,
      label: buildPhraseLabel(phrase),
      text: phrase.text,
      phraseId: phrase.id,
    });
  }

  for (const [index, snippet] of snippets.entries()) {
    addOption(options, seen, {
      value: `local:${index}`,
      label: snippet.label,
      text: snippet.text,
    });
  }

  return options;
}

function addOption(options: SnippetOption[], seen: Set<string>, option: SnippetOption) {
  const key = option.text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
  if (!key || seen.has(key)) return;
  seen.add(key);
  options.push(option);
}

function buildPhraseLabel(phrase: MedicalPhrase) {
  const sourceLabel = phrase.source === 'EMPLOYEE' ? (phrase.isSuggested ? 'Предложение' : 'Личная') : phrase.source === 'DIAGNOSIS_TEMPLATE' ? 'Диагноз' : phrase.category;
  const prefix = sourceLabel ? `${sourceLabel}: ` : '';
  return `${prefix}${phrase.title}`;
}

function buildPersonalPhraseTitle(text: string) {
  const normalized = text.trim().replace(/\s+/g, ' ');
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

function appendText(current: string, insertion: string) {
  if (!current.trim()) return insertion;
  const separator = current.endsWith('\n') ? '' : '\n';
  return `${current}${separator}${insertion}`;
}
