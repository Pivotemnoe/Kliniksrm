import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Form, Input, Select, Space, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { nullToEmpty, optionalString } from '../../shared/utils/forms';
import { animalStatusOptions } from '../animals/animalStatus';
import { updateAnimal } from '../animals/animals.api';
import { MedicalTextArea } from './MedicalTextArea';
import { VisitDiagnosesTab } from './VisitDiagnosesTab';
import { updateVisit, upsertVisitExam } from './visits.api';
import { Visit, VisitType, visitTypeLabels } from './types';

const examSchema = z.object({
  weightKg: optionalNumber(0, 300),
  temperatureC: optionalNumber(30, 45),
  visitType: z.enum(['PRIMARY', 'FOLLOW_UP', 'OPERATION', 'POST_OPERATION', 'VACCINATION']).optional(),
  purpose: optionalString(1000),
  anamnesis: optionalString(4000),
  examination: optionalString(4000),
  symptoms: optionalString(4000),
  manipulations: optionalString(4000),
  comment: optionalString(2000),
});

type ExamValues = z.infer<typeof examSchema>;
type ExamInput = z.input<typeof examSchema>;

type VisitExamTabProps = {
  visit: Visit;
  canManage: boolean;
  locked: boolean;
};

export function VisitExamTab({ visit, canManage, locked }: VisitExamTabProps) {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { control, getValues, handleSubmit, reset, watch } = useForm<ExamInput, unknown, ExamValues>({
    resolver: zodResolver(examSchema),
    defaultValues: getDefaultValues(visit),
  });
  const disabled = locked || !canManage;
  const draftKey = `temichevvet:visit-exam-draft:${visit.id}`;
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'local' | 'saving' | 'saved'>('idle');
  const mutation = useMutation({
    mutationFn: (request: { values: ExamValues; silent: boolean; snapshot: string }) => {
      const run = saveChainRef.current.then(async () => {
        const { visitType, ...examValues } = request.values;

        if (visitType && visitType !== visit.visitType) {
          await updateVisit(visit.id, { visitType });
        }

        const exam = await upsertVisitExam(visit.id, examValues);
        return { exam, visitType };
      });
      saveChainRef.current = run.then(() => undefined, () => undefined);
      return run;
    },
    onMutate: (request) => {
      if (request.silent) setAutoSaveState('saving');
    },
    onSuccess: async (result, request) => {
      queryClient.setQueryData<Visit>(['visits', visit.id], (current) => current ? {
        ...current,
        exam: result.exam,
        visitType: result.visitType ?? current.visitType,
      } : current);
      clearDraftIfCurrent(draftKey, request.snapshot);

      if (request.silent) {
        setAutoSaveState('saved');
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['visits', visit.id] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
        queryClient.invalidateQueries({ queryKey: ['animals', visit.animalId] }),
        queryClient.invalidateQueries({ queryKey: ['medical-phrases'] }),
      ]);
      setAutoSaveState('saved');
      message.success('Лист осмотра сохранён');
    },
    onError: () => setAutoSaveState('local'),
  });
  const statusMutation = useMutation({
    mutationFn: (status: string) => updateAnimal(visit.animalId, { status }),
    onSuccess: async (animal) => {
      queryClient.setQueryData<Visit>(['visits', visit.id], (current) => current ? {
        ...current,
        animal: { ...current.animal, status: animal.status },
      } : current);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['animals', visit.animalId] }),
        queryClient.invalidateQueries({ queryKey: ['animals'] }),
      ]);
    },
  });

  useEffect(() => {
    const serverValues = getDefaultValues(visit);
    const draft = readExamDraft(draftKey);
    const serverUpdatedAt = visit.exam?.updatedAt ? new Date(visit.exam.updatedAt).getTime() : 0;
    if (draft && draft.updatedAt > serverUpdatedAt && examSchema.safeParse(draft.values).success) {
      reset(draft.values);
      setAutoSaveState('local');
    } else {
      reset(serverValues);
    }
  // The form must only be rehydrated when another visit is opened.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit.id]);

  useEffect(() => {
    if (disabled) return;
    const subscription = watch((values) => {
      const snapshot = JSON.stringify(values);
      const snapshotValues = JSON.parse(snapshot) as ExamInput;
      writeExamDraft(draftKey, values);
      setAutoSaveState('local');
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        const parsed = examSchema.safeParse(snapshotValues);
        if (parsed.success) mutation.mutate({ values: parsed.data, silent: true, snapshot });
      }, 900);
    });

    return () => {
      subscription.unsubscribe();
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [disabled, draftKey, watch]);

  function submit(values: ExamValues) {
    const effectiveVisitType = values.visitType ?? visit.visitType;
    const diagnosisIssue = getPrimaryDiagnosisSaveIssue(effectiveVisitType, visit.diagnoses);

    if (diagnosisIssue) {
      modal.warning({
        title: diagnosisIssue,
        content: 'Добавьте диагноз и выберите его тип. После этого сохраните лист осмотра.',
        okText: 'Понятно',
      });
      return;
    }

    mutation.mutate({ values, silent: false, snapshot: JSON.stringify(getValues()) });
  }
  const species = visit.animal?.species ?? undefined;
  const diagnoses = visit.diagnoses.map((diagnosis) => diagnosis.title);

  return (
    <Form layout="vertical" disabled={disabled} className="visit-tab-form">
      {locked ? <Alert type="info" showIcon message="Редактирование закрыто: отменённый приём нельзя менять, завершённый доступен директору или в течение 60 минут после завершения." className="form-alert" /> : null}
      {mutation.isError ? <Alert type="error" showIcon message={getErrorMessage(mutation.error)} className="form-alert" /> : null}
      {statusMutation.isError ? <Alert type="error" showIcon message={getErrorMessage(statusMutation.error)} className="form-alert" /> : null}
      <div className="form-grid visit-exam-vitals-grid">
        <Controller
          control={control}
          name="weightKg"
          render={({ field, fieldState }) => (
            <Form.Item label="Вес, кг" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input inputMode="decimal" {...field} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="temperatureC"
          render={({ field, fieldState }) => (
            <Form.Item label="Температура, °C" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input inputMode="decimal" {...field} />
            </Form.Item>
          )}
        />
        <Form.Item label="Состояние">
          <Select
            value={visit.animal.status ?? undefined}
            loading={statusMutation.isPending}
            placeholder="Выберите состояние"
            options={animalStatusOptions.map(({ value, label }) => ({ value, label }))}
            onChange={(value) => statusMutation.mutate(value)}
          />
        </Form.Item>
        {visit.hospitalStay ? (
          <Form.Item label="Тип обращения">
            <Input value="Стационар" readOnly />
          </Form.Item>
        ) : (
          <Controller
            control={control}
            name="visitType"
            render={({ field }) => (
              <Form.Item label="Приём">
                <Select<VisitType>
                  {...field}
                  options={Object.entries(visitTypeLabels).map(([value, label]) => ({ value: value as VisitType, label }))}
                />
              </Form.Item>
            )}
          />
        )}
      </div>
      <Controller
        control={control}
        name="purpose"
        render={({ field, fieldState }) => (
          <Form.Item
            label="Причина обращения"
            extra="Кратко: с чем владелец обратился в клинику. Это поле отображается в истории болезни."
            validateStatus={fieldState.error ? 'error' : undefined}
            help={fieldState.error?.message}
          >
            <Input.TextArea rows={2} placeholder="Например: отказ от корма, хромота, вакцинация" {...field} />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name="anamnesis"
        render={({ field, fieldState }) => (
          <Form.Item label="Анамнез" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
            <MedicalTextArea
              rows={5}
              disabled={disabled}
              snippets={examSnippets.anamnesis}
              fieldKey="visit.exam.anamnesis"
              species={species}
              diagnoses={diagnoses}
              {...field}
            />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name="examination"
        render={({ field, fieldState }) => (
          <Form.Item label="Осмотр" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
            <MedicalTextArea
              rows={5}
              disabled={disabled}
              snippets={examSnippets.examination}
              fieldKey="visit.exam.examination"
              species={species}
              diagnoses={diagnoses}
              {...field}
            />
          </Form.Item>
        )}
      />
      <VisitDiagnosesTab visit={visit} canManage={canManage} locked={locked} compact showLockedAlert={false} />
      <Controller
        control={control}
        name="symptoms"
        render={({ field, fieldState }) => (
          <Form.Item label="Симптомы" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
            <MedicalTextArea
              rows={4}
              disabled={disabled}
              snippets={examSnippets.symptoms}
              fieldKey="visit.exam.symptoms"
              species={species}
              diagnoses={diagnoses}
              {...field}
            />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name="manipulations"
        render={({ field, fieldState }) => (
          <Form.Item label="Манипуляции" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
            <MedicalTextArea
              rows={10}
              disabled={disabled}
              snippets={examSnippets.manipulations}
              fieldKey="visit.exam.manipulations"
              species={species}
              diagnoses={diagnoses}
              {...field}
            />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name="comment"
        render={({ field, fieldState }) => (
          <Form.Item
            label="Внутренний комментарий клиники"
            extra="Видят только сотрудники в карточке приёма. Не выводится в личный кабинет владельца и не предназначен для печати."
            validateStatus={fieldState.error ? 'error' : undefined}
            help={fieldState.error?.message}
          >
            <MedicalTextArea
              rows={2}
              disabled={disabled}
              snippets={examSnippets.comment}
              fieldKey="visit.exam.comment"
              species={species}
              diagnoses={diagnoses}
              {...field}
            />
          </Form.Item>
        )}
      />
      <Space>
        <Button type="primary" loading={mutation.isPending} onClick={handleSubmit(submit)} disabled={disabled}>
          Сохранить осмотр
        </Button>
        <Button onClick={() => reset(getDefaultValues(visit))} disabled={disabled}>
          Сбросить
        </Button>
        <Typography.Text type="secondary">{autoSaveLabel(autoSaveState)}</Typography.Text>
      </Space>
    </Form>
  );
}

function getPrimaryDiagnosisSaveIssue(visitType: VisitType | null | undefined, diagnoses: Visit['diagnoses']) {
  if (visitType !== 'PRIMARY') {
    return null;
  }

  if (!diagnoses.length) {
    return 'Вы не указали ни одного диагноза';
  }

  if (diagnoses.some((diagnosis) => !diagnosis.diagnosisType?.trim())) {
    return 'Укажите тип для каждого диагноза';
  }

  return null;
}

const examSnippets = {
  anamnesis: [
    { label: 'Со слов владельца', text: 'Со слов владельца: ' },
    { label: 'Профилактический приём', text: 'Профилактический осмотр без активных жалоб.' },
    { label: 'Аппетит сохранён', text: 'Аппетит сохранён. Вода в обычном объёме. Рвоты и диареи не отмечалось.' },
    { label: 'Вакцинация', text: 'Вакцинация по возрасту. Дегельминтизация по графику.' },
  ],
  examination: [
    {
      label: 'Общее без особенностей',
      text: 'Общее состояние удовлетворительное. Слизистые розовые. Дыхание без хрипов. Живот мягкий, безболезненный.',
    },
    { label: 'Кожа и шерсть', text: 'Кожа без выраженных повреждений. Шерстный покров удовлетворительный.' },
  ],
  symptoms: [
    { label: 'Активность снижена', text: 'Активность снижена.' },
    { label: 'Температура повышена', text: 'Гипертермия.' },
  ],
  manipulations: [
    { label: 'Клинический осмотр', text: 'Проведён клинический осмотр.' },
    { label: 'Обработка', text: 'Проведена обработка поражённой области.' },
  ],
  comment: [
    { label: 'Внутреннее наблюдение', text: 'Внутреннее наблюдение: ' },
    { label: 'Уточнить у владельца', text: 'Уточнить у владельца дополнительные сведения.' },
  ],
};

function getDefaultValues(visit: Visit): ExamInput {
  return {
    weightKg: nullToEmpty(visit.exam?.weightKg ? String(visit.exam.weightKg) : undefined),
    temperatureC: nullToEmpty(visit.exam?.temperatureC ? String(visit.exam.temperatureC) : undefined),
    visitType: visit.hospitalStay ? undefined : visit.visitType ?? 'PRIMARY',
    purpose: nullToEmpty(visit.exam?.purpose),
    anamnesis: nullToEmpty(visit.exam?.anamnesis),
    examination: nullToEmpty(visit.exam?.examination),
    symptoms: nullToEmpty(visit.exam?.symptoms),
    manipulations: nullToEmpty(visit.exam?.manipulations),
    comment: nullToEmpty(visit.exam?.comment),
  };
}

function optionalNumber(min: number, max: number) {
  return z
    .string()
    .trim()
    .transform((value, context) => {
      if (!value) {
        return undefined;
      }

      const parsed = Number(value.replace(',', '.'));

      if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Введите число от ${min} до ${max}` });
        return z.NEVER;
      }

      return parsed;
    });
}

function autoSaveLabel(state: 'idle' | 'local' | 'saving' | 'saved') {
  if (state === 'saving') return 'Сохраняется…';
  if (state === 'saved') return 'Сохранено автоматически';
  if (state === 'local') return 'Черновик сохранён на этом компьютере';
  return 'Автосохранение включено';
}

function writeExamDraft(key: string, values: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify({ updatedAt: Date.now(), values }));
  } catch {
    // Server autosave remains available when browser storage is unavailable.
  }
}

function readExamDraft(key: string): { updatedAt: number; values: ExamInput } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { updatedAt?: unknown; values?: unknown };
    if (typeof parsed.updatedAt !== 'number' || !parsed.values || typeof parsed.values !== 'object') return null;
    return { updatedAt: parsed.updatedAt, values: parsed.values as ExamInput };
  } catch {
    return null;
  }
}

function clearDraftIfCurrent(key: string, snapshot: string) {
  const draft = readExamDraft(key);
  if (draft && JSON.stringify(draft.values) === snapshot) {
    try {
      localStorage.removeItem(key);
    } catch {
      // A saved CRM copy already exists; an inaccessible local draft is harmless.
    }
  }
}
