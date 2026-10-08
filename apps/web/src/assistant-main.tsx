import '@ant-design/v5-patch-for-react-19';
import 'antd/dist/reset.css';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App, ConfigProvider, Typography } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { ClinicChat } from './features/clinicAssistant/ClinicAssistantPreviewPage';
import './assistant.css';

const nonce = document.querySelector<HTMLMetaElement>('meta[name="clinic-csp-nonce"]')?.content;
const cache = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true, retry: false } } });
createRoot(document.getElementById('root')!).render(
  <ConfigProvider locale={ruRU} csp={{ nonce }} theme={{ token: { colorPrimary: '#2563eb', borderRadius: 8 } }}>
    <App><QueryClientProvider client={cache}>
      <main className="clinic-assistant-page">
        <Typography.Title level={1}>Чат клиники</Typography.Title>
        <Typography.Paragraph>Темичев Vet</Typography.Paragraph>
        <ClinicChat />
        <nav className="clinic-assistant-navigation"><a href="/portal">Личный кабинет</a></nav>
      </main>
    </QueryClientProvider></App>
  </ConfigProvider>,
);
