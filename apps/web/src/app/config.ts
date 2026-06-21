export const appConfig = {
  brandName: 'TemichevVet',
  logoUrl: '/brand/temichevvet-logo.jpg',
  authMode: import.meta.env.VITE_AUTH_MODE ?? 'protected',
  idleLogoutMinutes: Number(import.meta.env.VITE_IDLE_LOGOUT_MINUTES ?? 15),
};

export const isDemoAuthMode = appConfig.authMode === 'demo';
