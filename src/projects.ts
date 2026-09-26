import { supabase } from './supabase';

/**
 * Projects: minimalDASH's own work, for the owner alone and across all their minimalERP companies (ERP migration
 * 20261014000100_dash_projects.sql). Everything here is disposable: deleting a project never touches the books.
 */
export type ProjectKind = 'recurring' | 'one_time';

export interface Project {
  id: string;
  name: string;
  kind: ProjectKind;
  created_at: string;
  updated_at: string;
}

export const KIND_LABEL: Record<ProjectKind, string> = { recurring: 'Recurring', one_time: 'One-time' };

/** Whether this sign-in owns a minimalERP company: minimalDASH is the owner's alone. */
export async function ownsACompany(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('company_members').select('company_id').eq('user_id', userId).eq('role', 'owner').limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export async function loadProjects(): Promise<Project[]> {
  const { data, error } = await supabase.from('dash_projects').select('id, name, kind, created_at, updated_at');
  if (error) throw new Error(error.message);
  return sortProjects((data ?? []) as Project[]);
}

/** By name, as a person reads a list (case and accents aside, numbers in order: "Job 2" before "Job 10"). */
export function sortProjects(projects: readonly Project[]): Project[] {
  return [...projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
}

/** What is wrong with a name before asking the server (which checks again, and refuses one already used). */
export function nameProblem(name: string, others: readonly Project[], self?: string): string | undefined {
  const n = name.trim();
  if (n === '') return 'Give the project a name';
  if (n.length > 120) return 'A name is at most 120 characters';
  if (others.some((p) => p.id !== self && p.name.trim().toLowerCase() === n.toLowerCase())) return `There is already a project called ${n}`;
  return undefined;
}

/** Every change goes through the ERP's `dash` function (no company: projects are the owner's own). */
async function change<T>(op: string, payload: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke('dash', { body: { op, payload } });
  if (error) throw new Error(error.message);
  const answer = data as { ok: boolean; value?: T; issues?: { message: string }[] };
  if (!answer.ok) throw new Error(answer.issues?.map((i) => i.message).join('; ') || 'Not saved');
  return answer.value as T;
}

export const createProject = (name: string, kind: ProjectKind) => change<Project>('project.create', { name: name.trim(), kind });
export const renameProject = (id: string, name: string) => change<Project>('project.rename', { id, name: name.trim() });
export const setProjectKind = (id: string, kind: ProjectKind) => change<Project>('project.kind', { id, kind });
export const deleteProject = (id: string) => change<{ id: string; deleted: true }>('project.delete', { id });
