import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));
const { nameProblem, sortProjects } = await import('./projects');
import type { Project } from './projects';

const p = (id: string, name: string): Project => ({ id, name, kind: 'recurring', created_at: '', updated_at: '' });

describe('projects', () => {
  it('are listed by name as a person reads them: case aside, numbers in order', () => {
    expect(sortProjects([p('1', 'job 10'), p('2', 'Job 2'), p('3', 'acme')]).map((x) => x.name)).toEqual(['acme', 'Job 2', 'job 10']);
  });

  it('need a name of their own', () => {
    const all = [p('1', 'Honeywell monthly')];
    expect(nameProblem('  ', all)).toBe('Give the project a name');
    expect(nameProblem('honeywell MONTHLY ', all)).toBe('There is already a project called honeywell MONTHLY');
    expect(nameProblem('Honeywell monthly', all, '1')).toBeUndefined(); // renaming to its own name
    expect(nameProblem('x'.repeat(121), all)).toBe('A name is at most 120 characters');
    expect(nameProblem('Fixture for Acme', all)).toBeUndefined();
  });
});
