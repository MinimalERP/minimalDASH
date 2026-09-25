import { Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { sendUpload } from './upload';
import { emptyUpload, UploadFields } from './UploadFields';
import { addNote, daysSince, gmailThreadUrl, loadJob, MOVE_LABEL, setMove, shortDate, WHO_LABEL, type Job, type JobEvent, type Move, type Part } from './jobs';

/** One job: what's asked, whose move, the parts, and the timeline. Esc goes back, Alt+N writes a note, Alt+U adds a WhatsApp message or files. */
export function JobView({ id, mailbox, notice, onBack }: { id: string; mailbox: string; notice?: string | undefined; onBack: () => void }) {
  const [data, setData] = useState<{ job: Job; parts: Part[]; events: JobEvent[] } | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [upload, setUpload] = useState(emptyUpload);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(notice ?? null);
  const uploadRef = useRef<HTMLTextAreaElement>(null);

  const reload = () => loadJob(id).then(setData, (e: Error) => setError(e.message));
  useEffect(() => {
    reload();
  }, [id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (document.activeElement === noteRef.current && note) return;
        if (uploadOpen) return setUploadOpen(false);
        onBack();
      } else if (e.altKey && e.key.toLowerCase() === 'n') {
        noteRef.current?.focus();
      } else if (e.altKey && e.key.toLowerCase() === 'u') {
        setUploadOpen(true);
        setTimeout(() => uploadRef.current?.focus());
      } else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, note, uploadOpen]);

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

  async function sendIt(e: Event) {
    e.preventDefault();
    setUploading(true);
    setProblem(null);
    try {
      await sendUpload(id, upload.via, upload.text, upload.files);
      setUpload(emptyUpload());
      setUploadOpen(false);
      await reload();
    } catch (err) {
      setProblem((err as Error).message);
    }
    setUploading(false);
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
  if (data === undefined) return <p class="muted">Loading…</p>;
  if (data === null)
    return (
      <p>
        This job no longer exists.{' '}
        <a href="#" onClick={(e) => (e.preventDefault(), onBack())}>
          Back to Jobs
        </a>
      </p>
    );
  const { job, parts, events } = data;

  return (
    <>
      <p class="hint">
        <a href="#" onClick={(e) => (e.preventDefault(), onBack())}>
          ← Jobs
        </a>{' '}
        <kbd>Esc</kbd>
      </p>
      {problem && (
        <p class="message error" role="alert">
          {problem}
        </p>
      )}
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
                    <div>{ev.gmail_message_id ? 'From' : 'Came by'}: {ev.mail_from}</div>
                    {ev.mail_to && <div>To: {ev.mail_to}</div>}
                    {ev.mail_subject && <div>Subject: {ev.mail_subject}</div>}
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

      {uploadOpen ? (
        <form class="add-upload" onSubmit={sendIt}>
          <h2>Add a WhatsApp message, a call or files</h2>
          <UploadFields value={upload} onChange={setUpload} textRef={uploadRef} />
          <button class="button primary" type="submit" disabled={uploading}>
            {uploading ? 'Sending…' : 'Add to this job'}
          </button>{' '}
          <button class="button" type="button" onClick={() => setUploadOpen(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <p>
          <button class="button" type="button" onClick={() => (setUploadOpen(true), setTimeout(() => uploadRef.current?.focus()))}>
            Add WhatsApp / call / files
          </button>{' '}
          <kbd>Alt</kbd>+<kbd>U</kbd>
        </p>
      )}
    </>
  );
}
