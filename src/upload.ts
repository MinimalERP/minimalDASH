import { supabase } from './supabase';

/** The Gmail add-on's web app address (README, "Uploads from minimalDASH"). Without it a message can still be written, but files cannot be sent. */
export const UPLOAD_URL = (import.meta.env['VITE_UPLOAD_URL'] as string | undefined) || '';

export const VIA = ['WhatsApp', 'Phone call', 'Visit', 'Email (forwarded)', 'Other'] as const;

const MAX_BYTES = 40 * 1024 * 1024;

function base64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error(`Could not read ${file.name}`));
    r.readAsDataURL(file);
  });
}

/**
 * An enquiry or follow-up that did not come by mail: its text joins the job's timeline and its files go to the job's Drive folder
 * (through the add-on's web app), where Gemini reads both like a mail.
 */
export async function sendUpload(jobId: string, via: string, text: string, files: File[]): Promise<void> {
  if (!text.trim() && files.length === 0) return;
  if (files.reduce((n, f) => n + f.size, 0) > MAX_BYTES) throw new Error('The files are larger than 40 MB together.');

  if (!UPLOAD_URL) {
    if (files.length) throw new Error('Files cannot be sent yet: the upload address is not set up (see the add-on README).');
    const { error } = await supabase.from('job_events').insert({ job_id: jobId, who: 'customer', summary: text.trim().split('\n')[0]!.slice(0, 200), mail_from: via, body: text.trim() });
    if (error) throw new Error(error.message);
    return;
  }

  const { data } = await supabase.auth.getSession();
  const body = JSON.stringify({
    token: data.session?.access_token,
    jobId,
    via,
    text: text.trim(),
    files: await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, base64: await base64(f) }))),
  });
  // text/plain: a "simple" request, so the browser sends it to Apps Script without a CORS preflight it cannot answer
  const res = await fetch(UPLOAD_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
  const answer = (await res.json().catch(() => null)) as { ok: boolean; message?: string } | null;
  if (!answer?.ok) throw new Error(answer?.message ?? `The upload failed (${res.status}).`);
}
