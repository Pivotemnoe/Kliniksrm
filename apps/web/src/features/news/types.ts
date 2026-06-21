export type NewsPriority = 'INFO' | 'IMPORTANT' | 'CRITICAL';

export type NewsPost = {
  id: string;
  title: string;
  body: string;
  priority: NewsPriority;
  isPinned: boolean;
  audienceRoleCodes: string[];
  createdBy: {
    id: string;
    fullName: string;
    position: string | null;
  } | null;
  publishedAt: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  readAt: string | null;
  isRead: boolean;
};

export type ListNewsQuery = {
  search?: string;
  priority?: NewsPriority;
  unreadOnly?: boolean;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
};

export type NewsPostInput = {
  title: string;
  body: string;
  priority?: NewsPriority;
  isPinned?: boolean;
  audienceRoleCodes?: string[];
};

export const newsPriorityLabels: Record<NewsPriority, string> = {
  INFO: 'Обычная',
  IMPORTANT: 'Важная',
  CRITICAL: 'Срочная',
};

export const newsPriorityColors: Record<NewsPriority, string> = {
  INFO: 'blue',
  IMPORTANT: 'gold',
  CRITICAL: 'red',
};
