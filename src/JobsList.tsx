import { useEffect, useRef, useState } from 'preact/hooks';
import { daysSince, isLate, loadOpenJobs, MOVE_LABEL, shortDate, type Job } from './jobs';

/** Open jobs, our move first. ↑/↓ moves, Enter opens. */
export function JobsList({ onOpen }: { onOpen: (id: string) => void }) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    loadOpenJobs().then(setJobs, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!jobs?.length || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, jobs.length - 1));
      else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
      else if (e.key === 'Enter' && jobs[active]) onOpen(jobs[active].id);
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jobs, active, onOpen]);

  useEffect(() => {
    tableRef.current?.querySelector('tr.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (error) return <p class="message error">{error}</p>;
  if (!jobs) return <p class="muted">Loading…</p>;

  const ours = jobs.filter((j) => j.whose_move === 'us').length;
  return (
    <>
      <h1>Jobs</h1>
      <p class="hint">
        {jobs.length} open · <span class={ours ? 'late' : ''}>{ours} waiting on us</span> · <kbd>↑</kbd> <kbd>↓</kbd> move, <kbd>Enter</kbd> opens
      </p>
      {jobs.length === 0 ? (
        <p class="muted">No open jobs yet. They arrive from Gmail with the “New job” button.</p>
      ) : (
        <div class="scroll-x">
          <table class="grid" ref={tableRef}>
            <thead>
              <tr>
                <th>Job</th>
                <th>Customer</th>
                <th>Whose move</th>
                <th>Asked</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j, i) => (
                <tr key={j.id} class={i === active ? 'active' : ''} onClick={() => onOpen(j.id)}>
                  <td>{j.title}</td>
                  <td>{j.customer}</td>
                  <td>
                    <span class={`move ${j.whose_move}`}>{MOVE_LABEL[j.whose_move]}</span>{' '}
                    <span class="muted">{daysSince(j.move_since)}d</span>
                  </td>
                  <td class="wrap">{j.asked}</td>
                  <td class={isLate(j) ? 'late mono' : 'mono'}>{j.due_date ? shortDate(j.due_date) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
