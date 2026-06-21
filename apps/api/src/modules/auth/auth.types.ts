export type AuthEmployee = {
  id: string;
  userId: string;
  fullName: string;
  phone: string | null;
  position: string | null;
  defaultRoute: string | null;
  status: string;
  roles: string[];
  permissions: string[];
};

export type AuthContext = {
  sessionId: string;
  userId: string;
  employee: AuthEmployee;
};

export type AuthenticatedRequest = {
  auth?: AuthContext;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
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
