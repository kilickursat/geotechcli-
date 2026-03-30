// ---------------------------------------------------------------------------
// Supabase Client — lightweight REST client for geotechCLI
//
// Uses Supabase PostgREST API directly to avoid pulling in the full
// @supabase/supabase-js SDK (which adds ~200KB to the bundle).
// Only needs: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
// ---------------------------------------------------------------------------

export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

interface QueryOptions {
  table: string;
  select?: string;
  filters?: Array<{ column: string; op: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'neq' | 'is'; value: string }>;
  order?: { column: string; ascending?: boolean };
  limit?: number;
  single?: boolean;
}

function buildConfig(): SupabaseConfig {
  const url = process.env.SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!url || !key) {
    throw new Error(
      'Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.',
    );
  }

  return { url, serviceRoleKey: key };
}

// ---------------------------------------------------------------------------
// Core HTTP methods
// ---------------------------------------------------------------------------

async function supabaseRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  config: SupabaseConfig,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ data: T | null; error: string | null }> {
  const url = `${config.url}/rest/v1/${path}`;

  const reqHeaders: Record<string, string> = {
    'apikey': config.serviceRoleKey,
    'Authorization': `Bearer ${config.serviceRoleKey}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'return=representation' : method === 'PATCH' ? 'return=representation' : 'return=minimal',
    ...headers,
  };

  try {
    const res = await fetch(url, {
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      return { data: null, error: `Supabase ${res.status}: ${errText.slice(0, 200)}` };
    }

    if (res.status === 204 || method === 'DELETE') {
      return { data: null, error: null };
    }

    const data = await res.json();
    return { data: data as T, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { data: null, error: `Supabase request failed: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Query builder
// ---------------------------------------------------------------------------

function buildQueryString(opts: QueryOptions): string {
  const params = new URLSearchParams();

  if (opts.select) {
    params.set('select', opts.select);
  }

  if (opts.filters) {
    for (const f of opts.filters) {
      params.set(f.column, `${f.op}.${f.value}`);
    }
  }

  if (opts.order) {
    params.set('order', `${opts.order.column}.${opts.order.ascending ? 'asc' : 'desc'}`);
  }

  if (opts.limit) {
    params.set('limit', String(opts.limit));
  }

  const qs = params.toString();
  return `${opts.table}${qs ? `?${qs}` : ''}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function dbQuery<T>(opts: QueryOptions): Promise<{ data: T | null; error: string | null }> {
  const config = buildConfig();
  const path = buildQueryString(opts);
  const headers: Record<string, string> = {};

  if (opts.single) {
    headers['Accept'] = 'application/vnd.pgrst.object+json';
  }

  return supabaseRequest<T>('GET', path, config, undefined, headers);
}

export async function dbInsert<T>(table: string, row: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const config = buildConfig();
  return supabaseRequest<T>('POST', table, config, row);
}

export async function dbUpdate<T>(
  table: string,
  filters: Array<{ column: string; op: 'eq'; value: string }>,
  updates: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  const config = buildConfig();
  const params = new URLSearchParams();
  for (const f of filters) {
    params.set(f.column, `${f.op}.${f.value}`);
  }
  const path = `${table}?${params.toString()}`;
  return supabaseRequest<T>('PATCH', path, config, updates);
}

export async function dbDelete<T>(
  table: string,
  filters: Array<{ column: string; op: 'eq'; value: string }>,
): Promise<{ data: T | null; error: string | null }> {
  const config = buildConfig();
  const params = new URLSearchParams();
  for (const f of filters) {
    params.set(f.column, `${f.op}.${f.value}`);
  }
  const path = `${table}?${params.toString()}`;
  return supabaseRequest<T>('DELETE', path, config);
}

export async function dbUpsert<T>(table: string, row: Record<string, unknown>, onConflict: string): Promise<{ data: T | null; error: string | null }> {
  const config = buildConfig();
  return supabaseRequest<T>('POST', table, config, row, {
    'Prefer': 'resolution=merge-duplicates,return=representation',
  });
}

export async function dbRpc<T>(fnName: string, args: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const config = buildConfig();
  const url = `${config.url}/rest/v1/rpc/${fnName}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': config.serviceRoleKey,
        'Authorization': `Bearer ${config.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { data: null, error: `RPC ${fnName} failed (${res.status}): ${errText.slice(0, 200)}` };
    }

    const data = await res.json();
    return { data: data as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Health check — verifies Supabase connection works.
 */
export async function dbHealthCheck(): Promise<boolean> {
  try {
    const config = buildConfig();
    const res = await fetch(`${config.url}/rest/v1/`, {
      headers: {
        'apikey': config.serviceRoleKey,
        'Authorization': `Bearer ${config.serviceRoleKey}`,
      },
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
