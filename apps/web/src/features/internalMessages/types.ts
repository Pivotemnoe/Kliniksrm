export type InternalMessageEmployee = {
  id: string;
  fullName: string;
  position: string | null;
  status: 'ACTIVE' | 'BLOCKED';
  roles: Array<{ role: { code: string; title: string } }>;
};

export type InternalMessage = {
  id: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  sender: InternalMessageEmployee;
  recipient: InternalMessageEmployee;
};

export type InternalMessageConversation = {
  employee: InternalMessageEmployee;
  lastMessage: InternalMessage;
  unreadCount: number;
};

export type InternalMessageConversationsResponse = {
  items: InternalMessageConversation[];
  totalUnread: number;
};

export type InternalMessageThreadResponse = {
  items: InternalMessage[];
  limit: number;
};
