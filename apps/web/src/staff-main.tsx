import '@ant-design/v5-patch-for-react-19';
import 'antd/dist/reset.css';
import { createRoot } from 'react-dom/client';
import { App, ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from './app/queryClient';
import { crmTheme } from './shared/theme/crmTheme';
import { StaffApp } from './features/staffApp/StaffApp';
import './features/staffApp/staff-app.css';

createRoot(document.getElementById('root')!).render(
  <ConfigProvider locale={ruRU} theme={crmTheme}><App><QueryClientProvider client={queryClient}>
    <BrowserRouter basename="/staff"><StaffApp /></BrowserRouter>
  </QueryClientProvider></App></ConfigProvider>,
);
