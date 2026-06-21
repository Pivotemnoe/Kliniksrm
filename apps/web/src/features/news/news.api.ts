import { apiRequest } from '../../api/client';
import { PaginatedResponse } from '../../shared/types/api';
import { buildQuery } from '../../shared/utils/query';
import { ListNewsQuery, NewsPost, NewsPostInput } from './types';

export function listNewsPosts(query: ListNewsQuery = {}) {
  return apiRequest<PaginatedResponse<NewsPost>>(`/v1/news${buildQuery(query)}`);
}

export function createNewsPost(input: NewsPostInput) {
  return apiRequest<NewsPost>('/v1/news', { method: 'POST', body: input });
}

export function updateNewsPost(postId: string, input: Partial<NewsPostInput>) {
  return apiRequest<NewsPost>(`/v1/news/${postId}`, { method: 'PATCH', body: input });
}

export function archiveNewsPost(postId: string) {
  return apiRequest<NewsPost>(`/v1/news/${postId}/archive`, { method: 'POST' });
}

export function markNewsPostRead(postId: string) {
  return apiRequest<{ ok: boolean; readAt: string }>(`/v1/news/${postId}/read`, { method: 'POST' });
}
