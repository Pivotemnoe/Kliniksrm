import '@ant-design/v5-patch-for-react-19';
import 'antd/dist/reset.css';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles.css';

dayjs.locale('ru');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
