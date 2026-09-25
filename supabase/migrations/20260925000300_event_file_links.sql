-- The files a mail brought, as saved in Google Drive by the Gmail add-on: [{ "name": "mo-sh-024.pdf", "url": "https://drive.google.com/..." }].
-- `files` (names only) stays for entries made before the add-on.
alter table public.job_events add column file_links jsonb not null default '[]'
  check (jsonb_typeof(file_links) = 'array');

-- The mail itself, so a job can be read in full without opening Gmail: who sent it, its subject, and its new text (the quoted
-- history of earlier mails is cut off: those are their own entries).
alter table public.job_events
  add column mail_from text not null default '' check (length(mail_from) <= 300),
  add column mail_to text not null default '' check (length(mail_to) <= 2000),
  add column mail_subject text not null default '' check (length(mail_subject) <= 500),
  add column body text not null default '' check (length(body) <= 100000);
