import type { ThemeConfig } from 'antd';

/** Accepted CRM theme, shared by the clinical shell and separate module cabinets. */
export const crmTheme: ThemeConfig = {
  token: {
    colorPrimary: '#0868df',
    colorText: '#10294d',
    colorTextSecondary: '#586e8a',
    colorBgLayout: '#f4f8fd',
    borderRadius: 10,
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  components: { Layout: { bodyBg: '#f4f8fd', headerBg: '#ffffff', siderBg: '#0b2548' } },
};
