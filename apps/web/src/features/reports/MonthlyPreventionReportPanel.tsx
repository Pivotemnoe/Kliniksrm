import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Checkbox, Collapse, Form, Input, Modal, Select, Space, Switch, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { ProgressiveTable } from '../../shared/ui/InfiniteTable';
import { InputNumber as DecimalInputNumber } from '../../shared/ui/DecimalInputNumber';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { listVaccinations, updateVaccination } from '../animals/animals.api';
import { downloadPreventionReport, generatePreventionReport, getPreventionReport, getPreventionSettings, listPreventionReports, savePreventionSettings } from './prevention.api';
import { preventionDiseaseOptions, PreventionProfile, PreventionReport, PreventionReportRow, PreventionSettings, reportStageOptions, VaccinationReportDetails } from './prevention.types';

export function MonthlyPreventionReportPanel() {
  const client = useQueryClient(); const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'settings.manage'); const canCorrect = hasPermission(auth?.employee, 'animals.manage');
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth() - 1, 1)).toISOString().slice(0, 7); });
  const [selectedId, setSelectedId] = useState<string>(); const [editingSettings, setEditingSettings] = useState(false); const [editingRow, setEditingRow] = useState<PreventionReportRow>();
  const [downloadError, setDownloadError] = useState<unknown>();
  const settings = useQuery({ queryKey: ['prevention-settings'], queryFn: getPreventionSettings });
  const list = useQuery({ queryKey: ['prevention-reports'], queryFn: listPreventionReports });
  const selected = useQuery({ queryKey: ['prevention-report', selectedId], queryFn: () => getPreventionReport(selectedId!), enabled: Boolean(selectedId) });
  const generate = useMutation({ mutationFn: (regenerate: boolean) => generatePreventionReport(month, regenerate), onSuccess: report => { setSelectedId(report.id); client.setQueryData(['prevention-report', report.id], report); void client.invalidateQueries({ queryKey: ['prevention-reports'] }); void client.invalidateQueries({ queryKey: ['staff-alerts'] }); } });
  const report = selected.data; const snapshot = report?.snapshot;
  const download = async (id: string) => { try { setDownloadError(undefined); await downloadPreventionReport(id); } catch (error) { setDownloadError(error); } };
  return <Card title="Ежемесячный пакет профилактических отчётов" extra={canManage && <Button onClick={() => setEditingSettings(true)}>Настройки</Button>}>
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Typography.Paragraph style={{ margin: 0 }}>Сводка профилактики и заболеваний, реестр привитых животных и акты по препаратам. Автоматически — 1-го числа в {settings.data?.time ?? '09:00'} ({settings.data?.timezone ?? 'Europe/Moscow'}) за предыдущий месяц. {settings.data?.enabled === false ? 'Автоматическое формирование отключено.' : 'После простоя сервера пропущенный отчёт за прошлый месяц сформируется при запуске.'}</Typography.Paragraph>
      <Space wrap><Input aria-label="Месяц профилактического отчёта" type="month" value={month} onChange={e => setMonth(e.target.value)} />
        {canManage && <Button type="primary" loading={generate.isPending} disabled={!month} onClick={() => generate.mutate(false)}>Сформировать пакет</Button>}
        {canManage && <Button disabled={!list.data?.some(r => r.month === month)} loading={generate.isPending} onClick={() => Modal.confirm({ title: 'Сформировать новую версию?', content: 'Предыдущая версия сохранится. В новую войдут уточнённые данные CRM.', okText: 'Сформировать', cancelText: 'Отмена', onOk: () => generate.mutateAsync(true) })}>Обновить пакет за месяц</Button>}
        <Button onClick={() => void list.refetch()}>Обновить список</Button></Space>
      {[settings.error, list.error, selected.error, generate.error, downloadError].filter(Boolean).map((error, i) => <Alert key={i} type="error" showIcon message={getErrorMessage(error)} />)}
      <ProgressiveTable rowKey="id" size="small" loading={list.isLoading} dataSource={list.data ?? []} chunkSize={6} locale={{ emptyText: 'Сформированных пакетов пока нет' }} columns={[
        { title: 'Месяц', dataIndex: 'month' }, { title: 'Версия', dataIndex: 'revision' }, { title: 'Состояние', render: (_, row: PreventionReport) => statusTag(row.status) },
        { title: 'Сформирован', render: (_, row) => new Date(row.createdAt).toLocaleString('ru-RU') },
        { title: 'Действия', render: (_, row) => <Space><Button size="small" onClick={() => setSelectedId(row.id)}>Проверить</Button><Button size="small" onClick={() => void download(row.id)}>Word</Button></Space> },
      ]} />
      {snapshot && <>
        <Typography.Title level={4}>Пакет за {report.month}, версия {report.revision} {statusTag(report.status)}</Typography.Title>
        {snapshot.warnings.length > 0 ? <Alert type="warning" showIcon message={`Замечаний для проверки: ${snapshot.warnings.length}`} description="Неизвестные значения в Word оставлены пустыми. Уточните записи и сформируйте новую версию пакета." /> : <Alert type="success" showIcon message="Обязательные данные заполнены. Проверьте пакет перед подписью." />}
        {snapshot.warnings.filter(warning => !warning.vaccinationId).map(warning => <Alert key={warning.message} type="warning" message={warning.message} />)}
        <Collapse items={[{ key: 'summary', label: 'Сводка профилактики и заболеваний', children: <Space direction="vertical" style={{ width: '100%' }}>{snapshot.summary.map(group => <ProgressiveTable key={group.title} caption={group.title} size="small" rowKey={r => r.code + r.stage} dataSource={group.rows} columns={[{ title: 'Мероприятие', dataIndex: 'title' }, { title: 'Голов', dataIndex: 'count', render: value => value === null ? 'Уточнить' : value }]} />)}<Typography.Text>Первично больных: {snapshot.illness.total}; собак: {snapshot.illness.dogs}; кошек: {snapshot.illness.cats}.</Typography.Text></Space> }]} />
        <ProgressiveTable rowKey="id" size="small" scroll={{ x: 900 }} dataSource={snapshot.rows} chunkSize={10} columns={[
          { title: 'Пациент / владелец', render: (_, row: PreventionReportRow) => <><Link to={`/animals/${row.animalId}`}>{row.animal.nickname}</Link><br />{row.animal.owner.fullName}</> },
          { title: 'Вакцина', dataIndex: 'vaccineName' }, { title: 'Дата', render: (_, row) => new Date(row.vaccinatedAt).toLocaleDateString('ru-RU') },
          { title: 'Проверка', render: (_, row) => snapshot.warnings.filter(w => w.vaccinationId === row.id).map(w => <div key={w.message}>{w.message}</div>) },
          { title: 'Данные для отчёта', render: (_, row) => canCorrect ? <Button onClick={() => setEditingRow(row)}>Уточнить</Button> : 'В карточке пациента' },
        ]} />
      </>}
    </Space>
    {editingSettings && settings.data && <SettingsEditor settings={settings.data} onClose={() => setEditingSettings(false)} />}
    {editingRow && <ReportDetailsEditor row={editingRow} onClose={() => setEditingRow(undefined)} />}
  </Card>;
}
function statusTag(status: string) { return <Tag color={status === 'READY' ? 'green' : 'orange'}>{status === 'READY' ? 'Подготовлен' : 'Требуется проверка'}</Tag>; }
function ReportDetailsEditor({ row, onClose }: { row: PreventionReportRow; onClose: () => void }) {
  const [form] = Form.useForm(); const [saved, setSaved] = useState(false);
  const source = useQuery({ queryKey: ['vaccinations', row.animalId, 'report-edit'], queryFn: () => listVaccinations(row.animalId), staleTime: 0 });
  const current = source.data?.find(item => item.id === row.id);
  useEffect(() => { if (current) form.setFieldsValue({ ...current.reportDetails, vaccineSeries: current.vaccineSeries, stage: current.reportDetails?.stage ?? 'AUTO' }); }, [current, form]);
  const mutation = useMutation({ mutationFn: async () => { const values = await form.validateFields(); const { stage, vaccineSeries, ...rest } = values; return updateVaccination(row.animalId, row.id, { title: current?.title ?? row.title, vaccineSeries: vaccineSeries || null, reportDetails: { ...rest, ...(stage === 'AUTO' ? {} : { stage }) } as VaccinationReportDetails }); }, onSuccess: () => setSaved(true) });
  return <Modal open title={`Данные вакцинации: ${row.animal.nickname}`} onCancel={onClose} onOk={() => saved ? onClose() : mutation.mutate()} okText={saved ? 'Готово' : 'Сохранить данные'} okButtonProps={{ disabled: !saved && (!current || source.isFetching) }} confirmLoading={mutation.isPending}>
    {saved ? <Alert type="success" message="Данные сохранены в карточке. Сформируйте новую версию пакета, чтобы обновить Word." /> : <Form form={form} layout="vertical" initialValues={{ ...row.reportDetails, stage: row.reportDetails?.stage ?? 'AUTO' }}>
      <Form.Item name="vaccineSeries" label="Серия вакцины" rules={[{ max: 120 }]}><Input /></Form.Item>
      <Form.Item name="stage" label="Этап вакцинации"><Select options={reportStageOptions} /></Form.Item>
      <Form.Item name="diseases" label="Инфекции (пусто — по настройкам вакцины)"><Select mode="multiple" options={preventionDiseaseOptions} /></Form.Item>
      <Form.Item name="doseText" label="Фактически введённая доза" rules={[{ max: 100 }]}><Input /></Form.Item>
      <Form.Item name="administrationRoute" label="Способ введения" rules={[{ max: 100 }]}><Input /></Form.Item>
      <Form.Item name="syringesAndNeedles" label="Фактически использованные шприцы и иглы" rules={[{ max: 200 }]}><Input /></Form.Item>
      <Form.Item name="manufacturer" label="Производитель (пусто — по настройкам)" rules={[{ max: 250 }]}><Input /></Form.Item>
      <Form.Item name="usedDoses" label="Использовано доз"><DecimalInputNumber min={0.001} max={100000} /></Form.Item>
      <Form.Item name="consumedDoses" label="Израсходовано доз"><DecimalInputNumber min={0.001} max={100000} /></Form.Item>
    </Form>}{(mutation.error || source.error) && <Alert type="error" message={getErrorMessage(mutation.error || source.error)} />}
  </Modal>;
}
function SettingsEditor({ settings, onClose }: { settings: PreventionSettings; onClose: () => void }) {
  const [form] = Form.useForm(); const client = useQueryClient(); const [profiles, setProfiles] = useState(settings.profiles); const [profileIndex, setProfileIndex] = useState<number>();
  const mutation = useMutation({ mutationFn: async () => savePreventionSettings({ ...await form.validateFields(), profiles }), onSuccess: value => { client.setQueryData(['prevention-settings'], value); onClose(); } });
  return <Modal open width={850} title="Месячный профилактический отчёт" onCancel={onClose} onOk={() => mutation.mutate()} okText="Сохранить" confirmLoading={mutation.isPending}>
    <Form form={form} layout="vertical" initialValues={settings}>
      <Form.Item name="enabled" label="Формировать автоматически 1-го числа" valuePropName="checked"><Switch /></Form.Item>
      <Space align="start"><Form.Item name="time" label="Время" rules={[{ required: true }]}><Input type="time" /></Form.Item><Form.Item name="timezone" label="Часовой пояс" rules={[{ required: true, max: 80 }]}><Input /></Form.Item></Space>
      <Form.Item name="signatories" label="ФИО подписантов"><Select mode="tags" tokenSeparators={[';']} /></Form.Item>
    </Form>
    <Typography.Paragraph>Составы вакцин используются только для подсчёта отчёта. Фактические дозы и способ введения берутся из записи вакцинации.</Typography.Paragraph>
    <ProgressiveTable rowKey="title" size="small" dataSource={profiles} chunkSize={6} columns={[{ title: 'Вакцина', dataIndex: 'title' }, { title: 'Варианты названия', render: (_, row) => row.aliases.join('; ') }, { title: '', render: (_, row) => <Button onClick={() => setProfileIndex(profiles.indexOf(row))}>Изменить</Button> }]} />
    <Button onClick={() => setProfileIndex(profiles.length)}>Добавить вакцину</Button>
    {mutation.error && <Alert type="error" message={getErrorMessage(mutation.error)} />}
    {profileIndex !== undefined && <ProfileEditor profile={profiles[profileIndex]} onClose={() => setProfileIndex(undefined)} onSave={profile => { setProfiles(current => profileIndex === current.length ? [...current, profile] : current.map((item, i) => i === profileIndex ? profile : item)); setProfileIndex(undefined); }} />}
  </Modal>;
}
function ProfileEditor({ profile, onSave, onClose }: { profile?: PreventionProfile; onSave: (profile: PreventionProfile) => void; onClose: () => void }) {
  const [form] = Form.useForm();
  return <Modal open title="Состав вакцины для отчёта" onCancel={onClose} onOk={() => void form.validateFields().then(onSave)} okText="Применить">
    <Form form={form} layout="vertical" initialValues={profile ?? { aliases: [], diseases: [] }}>
      <Form.Item name="title" label="Название" rules={[{ required: true, min: 2, max: 200 }]}><Input /></Form.Item>
      <Form.Item name="aliases" label="Варианты названия в CRM"><Select mode="tags" tokenSeparators={[';']} /></Form.Item>
      <Form.Item name="diseases" label="Инфекции" rules={[{ required: true }]}><Checkbox.Group options={preventionDiseaseOptions} /></Form.Item>
      <Form.Item name="manufacturer" label="Производитель" rules={[{ max: 250 }]}><Input /></Form.Item>
      <Form.Item name="source" label="Источник сведений о составе" rules={[{ max: 500 }]}><Input /></Form.Item>
      <Form.Item name="reviewVariant" valuePropName="checked"><Checkbox>Точный вариант вакцины требует проверки</Checkbox></Form.Item>
    </Form>
  </Modal>;
}
