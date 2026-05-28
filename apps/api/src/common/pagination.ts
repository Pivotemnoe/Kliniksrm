export type PaginationQuery = {
  limit?: string;
  offset?: string;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function parsePagination(query: PaginationQuery) {
  const limit = clampNumber(Number(query.limit ?? DEFAULT_LIMIT), 1, MAX_LIMIT, DEFAULT_LIMIT);
  const offset = clampNumber(Number(query.offset ?? 0), 0, Number.MAX_SAFE_INTEGER, 0);

  return { limit, offset };
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}

