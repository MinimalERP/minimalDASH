import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));
const { byUrgency, daysSince, isLate } = await import('./jobs');
import type { Job } from './jobs';

const job = (over: Partial<Job>): Job => ({
  id: '1', title: 't', customer: '', contact: '', asked: '', whose_move: 'customer', move_since: '2026-09-20',
  due_date: null, status: 'open', drive_folder_url: null, gmail_thread_id: null, created_at: '', ...over,
});

describe('jobs', () => {
  const today = new Date(2026, 8, 25);

  it('counts whole days since a date, never negative', () => {
    expect(daysSince('2026-09-24', today)).toBe(1);
    expect(daysSince('2026-09-25', today)).toBe(0);
    expect(daysSince('2026-09-30', today)).toBe(0);
  });

  it('is late only after the due date has passed', () => {
    expect(isLate(job({ due_date: '2026-09-24' }), today)).toBe(true);
    expect(isLate(job({ due_date: '2026-09-25' }), today)).toBe(false);
    expect(isLate(job({}), today)).toBe(false);
  });

  it('puts our move first, longest waiting first; the rest by due date', () => {
    const list = [
      job({ id: 'c-late', due_date: '2026-10-01' }),
      job({ id: 'us-new', whose_move: 'us', move_since: '2026-09-24' }),
      job({ id: 'c-soon', due_date: '2026-09-28' }),
      job({ id: 'us-old', whose_move: 'us', move_since: '2026-09-18' }),
      job({ id: 'c-none' }),
    ].sort(byUrgency);
    expect(list.map((j) => j.id)).toEqual(['us-old', 'us-new', 'c-soon', 'c-late', 'c-none']);
  });
});
