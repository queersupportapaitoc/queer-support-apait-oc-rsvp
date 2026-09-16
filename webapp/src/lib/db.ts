import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { required } from './secrets';
export function db() {
  return createClient(
    required('SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
      },
    },
  );
}
export function checked<T>({
  data,
  error,
}: {
  data: T;
  error: unknown;
}): NonNullable<T> {
  if (error) throw error;
  return data as NonNullable<T>;
}
export async function allRows<T>(
  table: string,
  order: string,
  filter?: { column: string; value: string },
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = db()
      .from(table)
      .select('*')
      .order(order)
      .order('id')
      .range(offset, offset + 499);
    if (filter) query = query.eq(filter.column, filter.value);
    const batch = checked(await query) as T[];
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
}
