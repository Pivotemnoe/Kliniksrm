import { CheckCircleOutlined, ClockCircleOutlined, OrderedListOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Input, Select, Space, Tooltip } from 'antd';
import { useMemo } from 'react';
import { listMedicalPhrases, recordMedicalPhraseUsage } from '../medicalPhrases/medicalPhrases.api';
import { MedicalPhrase } from '../medicalPhrases/types';
import { formatDateTime } from '../../shared/utils/date';

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
  const diagnosis = diagnoses.map((item) => item?.trim()).find(Boolean);
  const phrasesQuery = useQuery({
    queryKey: ['medical-phrases', fieldKey, species ?? '', diagnosis ?? ''],
    queryFn: () =>
      listMedicalPhrases({
        field: fieldKey,
        species: species ?? undefined,
        diagnosis,
      }),
    enabled: Boolean(fieldKey),
    staleTime: 60_000,
  });
  const usageMutation = useMutation({
    mutationFn: recordMedicalPhraseUsage,
  });
  const snippetOptions = useMemo(
    () => buildSnippetOptions(phrasesQuery.data?.items ?? [], snippets),
    [phrasesQuery.data?.items, snippets],
  );

  function insert(text: string) {
    onChange(appendText(value, text));
  }

  function selectSnippet(selectedValue: string) {
    const option = snippetOptions.find((item) => item.value === selectedValue);

    if (!option) {
      return;
    }

    insert(option.text);

    if (option.phraseId) {
      usageMutation.mutate(option.phraseId);
    }
  }

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

  if (!key || seen.has(key)) {
    return;
  }

  seen.add(key);
  options.push(option);
}

function buildPhraseLabel(phrase: MedicalPhrase) {
  const sourceLabel = phrase.source === 'EMPLOYEE' ? 'Часто' : phrase.source === 'DIAGNOSIS_TEMPLATE' ? 'Диагноз' : phrase.category;
  const prefix = sourceLabel ? `${sourceLabel}: ` : '';
  return `${prefix}${phrase.title}`;
}

function appendText(current: string, insertion: string) {
  if (!current.trim()) {
    return insertion;
  }

  const separator = current.endsWith('\n') ? '' : '\n';
  return `${current}${separator}${insertion}`;
}
