import { useEffect, useState } from 'preact/hooks';
import { createJob } from './jobs';
import { sendUpload } from './upload';
import { emptyUpload, UploadFields } from './UploadFields';

/** A job that did not start with a mail: WhatsApp, a call, a visit. Esc goes back. */
export function NewJob({ onCreated, onBack }: { onCreated: (id: string, problem?: string) => void; onBack: () => void }) {
  const [title, setTitle] = useState('');
  const [customer, setCustomer] = useState('');
  const [contact, setContact] = useState('');
  const [upload, setUpload] = useState(emptyUpload);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, busy]);

  async function save(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    let id: string | null = null;
    try {
      id = await createJob({ title: title.trim(), customer: customer.trim(), contact: contact.trim() });
      await sendUpload(id, upload.via, upload.text, upload.files);
      onCreated(id);
    } catch (err) {
      setBusy(false);
      // the job exists even when its files did not go: open it, where they can be added again
      if (id) onCreated(id, `The job is made, but the upload failed: ${(err as Error).message}`);
      else setError((err as Error).message);
    }
  }

  return (
    <form class="new-job" onSubmit={save}>
      <p class="hint">
        <a href="#" onClick={(e) => (e.preventDefault(), onBack())}>
          ← Jobs
        </a>{' '}
        <kbd>Esc</kbd>
      </p>
      <h1>New job</h1>
      <div class="form-grid">
        <label>
          Job
          <input class="field" required autoFocus placeholder="e.g. Fuel BF localization" value={title} onInput={(e) => setTitle(e.currentTarget.value)} />
        </label>
        <label>
          Customer
          <input class="field" placeholder="e.g. Honeywell" value={customer} onInput={(e) => setCustomer(e.currentTarget.value)} />
        </label>
        <label>
          Contact
          <input class="field" placeholder="who sent it" value={contact} onInput={(e) => setContact(e.currentTarget.value)} />
        </label>
      </div>
      <UploadFields value={upload} onChange={setUpload} />
      <p class="message error" role="status">
        {error}
      </p>
      <button class="button primary" type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create job'}
      </button>
      <p class="hint">Gemini reads the message and the drawings within a minute or two and fills in the summary and the parts.</p>
    </form>
  );
}

