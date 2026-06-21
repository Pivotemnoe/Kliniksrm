export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

export type ListQuery = {
  search?: string;
  limit?: number;
  offset?: number;
};
