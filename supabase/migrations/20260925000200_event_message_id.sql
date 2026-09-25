-- A timeline entry keeps the mail's Message-ID, not a ready-made Gmail link: the app builds the link for the signed-in mailbox
-- (a /u/0/ link opens whichever Google account happens to be first in the browser).
alter table public.job_events rename column gmail_link to gmail_message_id;
update public.job_events
   set gmail_message_id = replace(replace(substring(gmail_message_id from 'rfc822msgid%3A(.*)$'), '%40', '@'), '%2B', '+')
 where gmail_message_id like 'https://mail.google.com/%';
