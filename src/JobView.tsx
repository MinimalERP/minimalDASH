import { Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { addNote, daysSince, gmailThreadUrl, loadJob, MOVE_LABEL, setMove, shortDate, WHO_LABEL, type Job, type JobEvent, type Move, type Part } from './jobs';

/** One job: what's asked, whose move, the parts, and the timeline. Esc goes back, Alt+N writes a note. */
export function JobView({ id, mailbox, onBack }: { id: string; mailbox: string; onBack: () => void }) {
  const [data, setData] = useState<{ job: Job; parts: Part[]; events: JobEvent[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const reload = () => loadJob(id).then(setData, (e: Error) => setError(e.message));
  useEffect(() => {
    reload();
  }, [id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (document.activeElement === noteRef.current && note) return;
        onBack();
      } else if (e.altKey && e.key.toLowerCase() === 'n') {
        noteRef.current?.focus();
      } else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, note]);

  async function save(e: Event) {
    e.preventDefault();
    if (!note.trim()) return;
    try {
      await addNote(id, note.trim());
      setNote('');
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function changeMove(move: Move) {
    try {
      await setMove(id, move);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (error) return <p class="message error">{error}</p>;
  if (!data) return <p class="muted">Loading…</p>;
  const { job, parts, events } = data;

  return (
    <>
      <p class="hint">
        <a href="#" onClick={(e) => (e.preventDefault(), onBack())}>
          ← Jobs
        </a>{' '}
        <kbd>Esc</kbd>
      </p>
      <section class="job-head">
        <h1>{job.title}</h1>
        <div class="muted">
          {job.customer}
          {job.contact && ` (${job.contact})`}
        </div>
        {job.asked && (
          <p class="asked">
            <strong>Asked:</strong> {job.asked}
          </p>
        )}
        <div class="facts">
          <label>
            <span class={`move ${job.whose_move}`}>{MOVE_LABEL[job.whose_move]}</span>
            <span class="muted"> since {shortDate(job.move_since)} ({daysSince(job.move_since)}d) </span>
            <select class="field" aria-label="Whose move" value={job.whose_move} onChange={(e) => changeMove(e.currentTarget.value as Move)}>
              <option value="us">Our move</option>
              <option value="customer">Waiting for customer</option>
              <option value="vendor">Waiting for vendor</option>
            </select>
          </label>
          {job.due_date && <span>Due {shortDate(job.due_date)}</span>}
          {job.drive_folder_url && (
            <a href={job.drive_folder_url} target="_blank" rel="noreferrer">
              Drive folder ↗
            </a>
          )}
          {job.gmail_thread_id && (
            <a href={gmailThreadUrl(mailbox, job.gmail_thread_id)} target="_blank" rel="noreferrer">
              Gmail thread ↗
            </a>
          )}
        </div>
      </section>

      <h2>Parts ({parts.length})</h2>
      {parts.length === 0 ? (
        <p class="muted">No drawings yet.</p>
      ) : (
        <div class="scroll-x">
          <table class="grid">
            <thead>
              <tr>
                <th>Drawing</th>
                <th>Name</th>
                <th>Rev</th>
                <th>Material</th>
                <th>Finish</th>
                <th>Next assy</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.id}>
                  <td class="mono">
                    {p.drive_file_url ? (
                      <a href={p.drive_file_url} target="_blank" rel="noreferrer">
                        {p.drawing_no}
                      </a>
                    ) : (
                      p.drawing_no
                    )}
                  </td>
                  <td>{p.name}</td>
                  <td class="mono">{p.rev}</td>
                  <td>{p.material}</td>
                  <td class="wrap">{p.finish}</td>
                  <td class="mono">{p.next_assy}</td>
                  <td class="mono">{p.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Timeline</h2>
      <ol class="timeline">
        {events.map((ev) => (
          <li key={ev.id}>
            <span class="when">{shortDate(ev.at)}</span>
            <span class={`by ${ev.who}`}>{WHO_LABEL[ev.who]}</span>
            <span>
              {ev.body ? (
                <details class="mail">
                  <summary>{ev.summary}</summary>
                  <div class="mail-head">
                    <div>From: {ev.mail_from}</div>
                    {ev.mail_to && <div>To: {ev.mail_to}</div>}
                    <div>Subject: {ev.mail_subject}</div>
                  </div>
                  <div class="mail-body">{ev.body}</div>
                </details>
              ) : (
                ev.summary
              )}
              {ev.file_links.length > 0 ? (
                <div class="files">
                  {ev.file_links.map((f, i) => (
                    <Fragment key={f.url}>
                      {i > 0 && ' · '}
                      <a href={f.url} target="_blank" rel="noreferrer">
                        {f.name}
                      </a>
                    </Fragment>
                  ))}
                </div>
              ) : (
                ev.files.length > 0 && <div class="files">{ev.files.join(' · ')}</div>
              )}
            </span>
          </li>
        ))}
      </ol>
      <form class="note-form" onSubmit={save}>
        <textarea
          ref={noteRef}
          class="field"
          placeholder="Note: a call, a promise, a reminder (Alt+N)"
          value={note}
          onInput={(e) => setNote(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.ctrlKey && save(e)}
        />
        <button class="button primary" type="submit">
          Add note
        </button>
      </form>
      <p class="hint">
        <kbd>Ctrl</kbd>+<kbd>Enter</kbd> saves the note
      </p>
    </>
  );
}
