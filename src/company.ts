import { supabase } from './supabase';

/**
 * minimalDASH works inside one of your minimalERP companies (the jobs are stored with the books). It is the one your sign-in belongs
 * to; with several, the first by name.
 */
let current: { id: string; name: string } | null = null;

export function companyId(): string {
  if (!current) throw new Error('No company chosen yet');
  return current.id;
}

export async function loadCompany(userId: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase.from('company_members').select('company_id, companies(name)').eq('user_id', userId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as { company_id: string; companies: { name: string } | null }[];
  const first = rows.map((r) => ({ id: r.company_id, name: r.companies?.name ?? '' })).sort((a, b) => a.name.localeCompare(b.name))[0];
  current = first ?? null;
  return current;
}

/** Every change goes through the ERP's `dash` function, which checks your permission in the company. */
export async function dash<T = Record<string, unknown>>(op: string, payload: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke('dash', { body: { companyId: companyId(), op, payload } });
  if (error) throw new Error(error.message);
  const answer = data as { ok: boolean; value?: T; issues?: { message: string }[] };
  if (!answer.ok) throw new Error(answer.issues?.map((i) => i.message).join('; ') || 'Not saved');
  return answer.value as T;
}
