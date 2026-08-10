export type AuthEmployee = {
  id: string;
  userId: string;
  fullName: string;
  phone: string | null;
  position: string | null;
  defaultRoute: string | null;
  restrictLoginToShifts: boolean;
  allowRemoteOutsideShift: boolean;
  mustChangePassword: boolean;
  status: string;
  roles: string[];
  permissions: string[];
};

export type AuthContext = {
  sessionId: string;
  userId: string;
  accessType: 'LOCAL' | 'REMOTE';
  remoteDeviceId: string | null;
  employee: AuthEmployee;
};

export type AuthenticatedRequest = {
  auth?: AuthContext;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  method?: string;
  originalUrl?: string;
  url?: string;
  socket?: {
    remoteAddress?: string;
  };
};

export type CookieResponse = {
  cookie: (
    name: string,
    value: string,
    options: {
      httpOnly: boolean;
      secure: boolean;
      sameSite: 'strict' | 'lax';
      path: string;
      maxAge?: number;
    },
  ) => void;
  clearCookie: (
    name: string,
    options: {
      httpOnly: boolean;
      secure: boolean;
      sameSite: 'strict' | 'lax';
      path: string;
    },
  ) => void;
};
