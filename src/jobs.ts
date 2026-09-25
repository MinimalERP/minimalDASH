import { supabase } from './supabase';

export type Move = 'us' | 'customer' | 'vendor';
export type Who = 'customer' | 'us' | 'vendor' | 'note';

export interface Job {
  id: string;
  title: string;
  customer: string;
  contact: string;
  asked: string;
  whose_move: Move;
  move_since: string; // yyyy-mm-dd
  due_date: string | null;
  status: 'open' | 'won' | 'lost' | 'closed';
  drive_folder_url: string | null;
  gmail_thread_id: string | null;
  created_at: string;
}

export interface Part {
  id: string;
  job_id: string;
  drawing_no: string;
  name: string;
  rev: string;
  material: string;
  finish: string;
  next_assy: string;
  qty: string;
  drive_file_url: string | null;
}

export interface JobEvent {
  id: string;
  job_id: string;
  at: string;
  who: Who;
  summary: string;
  gmail_message_id: string | null;
  mail_from: string;
  mail_to: string;
  mail_subject: string;
  body: string; // the mail's own text; the quoted earlier mails are cut off
  files: string[];
  file_links: { name: string; url: string }[]; // saved in Drive by the Gmail add-on
}

export const MOVE_LABEL: Record<Move, string> = { us: 'OUR MOVE', customer: 'Waiting for customer', vendor: 'Waiting for vendor' };
export const WHO_LABEL: Record<Who, string> = { customer: 'Customer', us: 'Us', vendor: 'Vendor', note: 'Note' };

/** Whole days from `since` (yyyy-mm-dd) to `today`; never negative. */
export function daysSince(since: string, today: Date = new Date()): number {
  const [y, m, d] = since.split('-').map(Number);
  const start = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((now - start) / 86_400_000));
}

/** Our move first, the longest-waiting first within it; then everything else by due date. */
export function byUrgency(a: Job, b: Job): number {
  const rank = (j: Job) => (j.whose_move === 'us' ? 0 : 1);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (a.whose_move === 'us') return a.move_since.localeCompare(b.move_since);
  return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
}

export function isLate(job: Job, today: Date = new Date()): boolean {
  if (!job.due_date) return false;
  return daysSince(job.due_date, today) > 0;
}

/** Gmail addressed by mailbox, not by position: /u/0/ is whichever Google account happens to be first in the browser. */
function gmailBase(mailbox: string): string {
  return `https://mail.google.com/mail/u/${encodeURIComponent(mailbox)}/`;
}

export function gmailThreadUrl(mailbox: string, threadId: string): string {
  return `${gmailBase(mailbox)}#all/${threadId}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "25-Sep" */
export function shortDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}`;
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function loadOpenJobs(): Promise<Job[]> {
  return check(await supabase.from('jobs').select('*').eq('status', 'open')).sort(byUrgency);
}

export async function loadJob(id: string): Promise<{ job: Job; parts: Part[]; events: JobEvent[] }> {
  const [job, parts, events] = await Promise.all([
    supabase.from('jobs').select('*').eq('id', id).single(),
    supabase.from('parts').select('*').eq('job_id', id).order('drawing_no'),
    supabase.from('job_events').select('*').eq('job_id', id).order('at'),
  ]);
  return { job: check<Job>(job), parts: check<Part[]>(parts), events: check<JobEvent[]>(events) };
}

export async function addNote(jobId: string, summary: string): Promise<void> {
  check(await supabase.from('job_events').insert({ job_id: jobId, who: 'note', summary }));
}

export async function setMove(jobId: string, whose_move: Move): Promise<void> {
  check(await supabase.from('jobs').update({ whose_move, move_since: new Date().toISOString().slice(0, 10) }).eq('id', jobId));
}
