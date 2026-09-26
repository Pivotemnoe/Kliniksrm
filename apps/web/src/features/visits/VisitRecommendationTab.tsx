import { useEffect, useRef, useState } from 'react';
import { enqueueRecommendationSave, readRecommendationDraft, writeRecommendationDraft, clearRecommendationDraft } from './recommendationDraft';
import { PrinterOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Space, Typography } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { nullToEmpty, optionalString } from '../../shared/utils/forms';
import type { OrganizationPrintProfile } from '../organization/types';
import { MedicalTextArea } from './MedicalTextArea';
import { Visit, VisitRecommendationInput } from './types';
import { printVisitRecommendation } from './visitPrint';
import { upsertVisitRecommendation } from './visits.api';

const recommendationSchema = z.object({
  treatmentPlan: optionalString(6000),
  careNotes: optionalString(6000),
});

type RecommendationValues = z.infer<typeof recommendationSchema>;
type RecommendationInput = z.input<typeof recommendationSchema>;

type VisitRecommendationTabProps = {
  visit: Visit;
  canManage: boolean;
  locked: boolean;
  organization?: OrganizationPrintProfile | null;
  onDraftChange?: (values: VisitRecommendationInput) => void;
};

export function VisitRecommendationTab({ visit, canManage, locked, organization, onDraftChange }: VisitRecommendationTabProps) {
  const queryClient = useQueryClient();
  const { control, getValues, handleSubmit, reset } = useForm<RecommendationInput, unknown, RecommendationValues>({
    resolver: zodResolver(recommendationSchema),
    defaultValues: getDefaultValues(visit),
  });
  const disabled = locked || !canManage;
  const draftKey = `temichevvet:visit-recommendation-draft:${visit.id}`;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(0);
  const [saveState, setSaveState] = useState('Автосохранение включено');
  const mutation = useMutation({
    networkMode: 'always',
    mutationFn: (request: { values: VisitRecommendationInput; snapshot: string }) =>
      enqueueRecommendationSave(visit.id, () => upsertVisitRecommendation(visit.id, request.values)),
    onMutate: () => { pending.current += 1; setSaveState('Сохраняется…'); },
    onSuccess: (recommendation, request) => {
      queryClient.setQueryData<Visit>(['visits', visit.id], current => current ? { ...current, recommendation } : current);
      clearRecommendationDraft(draftKey, request.snapshot);
      setSaveState(JSON.stringify(getValues()) === request.snapshot ? 'Сохранено автоматически' : 'Есть несохранённые изменения');
      void queryClient.invalidateQueries({ queryKey: ['medical-phrases'] });
    },
    onError: () => setSaveState(readRecommendationDraft(draftKey) ? 'Черновик сохранён на этом компьютере' : 'Не удалось сохранить. Не закрывайте приём'),
    onSettled: () => { pending.current -= 1; },
  });

  function save(values: VisitRecommendationInput) {
    if (disabled) return;
    const parsed = recommendationSchema.safeParse(values);
    if (!parsed.success) return;
    mutation.mutate({ values: { treatmentPlan: parsed.data.treatmentPlan ?? '', careNotes: parsed.data.careNotes ?? '' }, snapshot: JSON.stringify(values) });
  }

  useEffect(() => {
    const draft = readRecommendationDraft(draftKey);
    // A pending draft may predate a late response for an older edit; keep it until its own save succeeds.
    const values = draft && recommendationSchema.safeParse(draft.values).success
      ? draft.values : getDefaultValues(visit);
    reset(values);
    onDraftChange?.(values);
    if (draft && values !== draft.values) clearRecommendationDraft(draftKey, JSON.stringify(draft.values));
    if (!disabled && draft && values === draft.values) save(values);
    // Only opening another visit rehydrates the form; background responses never replace typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit.id]);

  useEffect(() => {
    if (disabled) return;
    const retry = () => {
      if (pending.current || timer.current) return;
      const draft = readRecommendationDraft(draftKey);
      if (draft) save(draft.values);
    };
    const interval = window.setInterval(retry, 15_000);
    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', retry);
      window.removeEventListener('focus', retry);
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        const draft = readRecommendationDraft(draftKey);
        if (draft) save(draft.values);
      }
    };
  }, [disabled, draftKey]);
  const species = visit.animal?.species ?? undefined;
  const diagnoses = visit.diagnoses.map((diagnosis) => diagnosis.title);

  function submit() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    save(getValues());
  }

  function updateDraft(field: keyof VisitRecommendationInput, value: string) {
    const values = { ...getValues(), [field]: value };
    onDraftChange?.(values);
    setSaveState(writeRecommendationDraft(draftKey, values) ? 'Черновик сохранён на этом компьютере' : 'Есть несохранённые изменения');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; save(values); }, 900);
  }

  function resetToSaved() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const draft = readRecommendationDraft(draftKey);
    if (draft) clearRecommendationDraft(draftKey, JSON.stringify(draft.values));
    const values = getDefaultValues(queryClient.getQueryData<Visit>(['visits', visit.id]) ?? visit);
    reset(values);
    setSaveState('Автосохранение включено');
    onDraftChange?.(values);
  }

  return (
    <Form layout="vertical" className="visit-tab-form">
      {locked ? <Alert type="info" showIcon message="Редактирование закрыто: отменённый приём нельзя менять, завершённый доступен директору или в течение 60 минут после завершения." className="form-alert" /> : null}
      {mutation.isError ? <Alert type="error" showIcon message={getErrorMessage(mutation.error)} className="form-alert" /> : null}

      <Controller
        control={control}
        name="treatmentPlan"
        render={({ field, fieldState }) => (
          <Form.Item label="План лечения" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
            <MedicalTextArea
              rows={7}
              disabled={disabled}
              snippets={recommendationSnippets.treatmentPlan}
              fieldKey="visit.recommendation.treatmentPlan"
              species={species}
              diagnoses={diagnoses}
              {...field}
              onChange={(value) => {
                field.onChange(value);
                updateDraft('treatmentPlan', value);
              }}
            />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name="careNotes"
        render={({ field, fieldState }) => (
          <Form.Item label="Рекомендации владельцу" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
            <MedicalTextArea
              rows={7}
              disabled={disabled}
              snippets={recommendationSnippets.careNotes}
              fieldKey="visit.recommendation.careNotes"
              species={species}
              diagnoses={diagnoses}
              {...field}
              onChange={(value) => {
                field.onChange(value);
                updateDraft('careNotes', value);
              }}
            />
          </Form.Item>
        )}
      />
      <Typography.Paragraph type="secondary" role="status">{saveState}</Typography.Paragraph>
      <Space>
        <Button type="primary" loading={mutation.isPending} onClick={handleSubmit(submit)} disabled={disabled}>
          Сохранить рекомендации
        </Button>
        <Button onClick={resetToSaved} disabled={disabled || mutation.isPending}>
          Сбросить
        </Button>
        <Button icon={<PrinterOutlined />} onClick={() => printVisitRecommendation(visit, getValues(), organization)}>
          Печать назначений
        </Button>
      </Space>
    </Form>
  );
}

const recommendationSnippets = {
  treatmentPlan: [
    { label: 'Контроль 3 дня', text: 'Контроль состояния через 3 дня.' },
    { label: 'Повторный приём', text: 'Повторный приём по динамике или при ухудшении состояния.' },
    { label: 'Диета', text: 'Диетотерапия согласно назначению.' },
  ],
  careNotes: [
    { label: 'Вода и покой', text: 'Обеспечить доступ к воде и щадящий режим.' },
    { label: 'При ухудшении', text: 'При рвоте, отказе от корма, вялости или ухудшении состояния связаться с клиникой.' },
    { label: 'Выполнять назначения', text: 'Соблюдать назначения врача и не отменять препараты без согласования.' },
  ],
};

function getDefaultValues(visit: Visit): RecommendationInput {
  return {
    treatmentPlan: nullToEmpty(visit.recommendation?.treatmentPlan),
    careNotes: nullToEmpty(visit.recommendation?.careNotes),
  };
}
