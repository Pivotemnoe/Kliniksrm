import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, Select, Space } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { nullToEmpty, optionalString } from '../../shared/utils/forms';
import { MedicalTextArea } from './MedicalTextArea';
import { VisitDiagnosesTab } from './VisitDiagnosesTab';
import { updateVisit, upsertVisitExam } from './visits.api';
import { Visit, VisitType, visitTypeLabels } from './types';

const examSchema = z.object({
  weightKg: optionalNumber(0, 300),
  temperatureC: optionalNumber(30, 45),
  visitType: z.enum(['PRIMARY', 'FOLLOW_UP']),
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
  const { control, handleSubmit, reset } = useForm<ExamInput, unknown, ExamValues>({
    resolver: zodResolver(examSchema),
    defaultValues: getDefaultValues(visit),
  });
  const mutation = useMutation({
    mutationFn: async (values: ExamValues) => {
      const { visitType, ...examValues } = values;

      if (visitType !== visit.visitType) {
        await updateVisit(visit.id, { visitType });
      }

      return upsertVisitExam(visit.id, { ...examValues, purpose: '' });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['visits', visit.id] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
        queryClient.invalidateQueries({ queryKey: ['animals', visit.animalId] }),
        queryClient.invalidateQueries({ queryKey: ['medical-phrases'] }),
      ]);
    },
  });
  const disabled = locked || !canManage;
  const species = visit.animal?.species ?? undefined;
  const diagnoses = visit.diagnoses.map((diagnosis) => diagnosis.title);

  function submit(values: ExamValues) {
    mutation.mutate(values);
  }

  return (
    <Form layout="vertical" disabled={disabled} className="visit-tab-form">
      {locked ? <Alert type="info" showIcon message="Редактирование закрыто: отменённый приём нельзя менять, завершённый доступен директору или в течение 30 минут после завершения." className="form-alert" /> : null}
      {mutation.isError ? <Alert type="error" showIcon message={getErrorMessage(mutation.error)} className="form-alert" /> : null}
      {mutation.isSuccess ? <Alert type="success" showIcon message="Лист осмотра сохранён" className="form-alert" /> : null}
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
        <Controller
          control={control}
          name="visitType"
          render={({ field }) => (
            <Form.Item label="Прием">
              <Select<VisitType>
                {...field}
                options={Object.entries(visitTypeLabels).map(([value, label]) => ({ value: value as VisitType, label }))}
              />
            </Form.Item>
          )}
        />
      </div>
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
              rows={6}
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
              rows={3}
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
              rows={3}
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
      </Space>
    </Form>
  );
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
    visitType: visit.visitType ?? 'PRIMARY',
    anamnesis: mergeText(visit.exam?.purpose, visit.exam?.anamnesis),
    examination: nullToEmpty(visit.exam?.examination),
    symptoms: nullToEmpty(visit.exam?.symptoms),
    manipulations: nullToEmpty(visit.exam?.manipulations),
    comment: nullToEmpty(visit.exam?.comment),
  };
}

function mergeText(...values: Array<string | null | undefined>) {
  return values
    .map((value) => value?.trim())
    .filter(Boolean)
    .join('\n');
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
