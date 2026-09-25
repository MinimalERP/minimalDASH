# minimalDASH for Gmail

A panel in Gmail. Open a customer's mail and press:

- **New job**: the mail becomes a job in minimalDASH.
- **Add to this job** / **Add to chosen job**: a follow-up mail (a new revision, a reminder, your own reply) joins its job.

One press does this at once:
- The mail's full text goes into the job's timeline in minimalDASH. You never need to open Gmail to read it.
- Every attachment is saved in Google Drive, zips unzipped: `minimalDASH / <Customer> / <Job> / <date time> Customer /`.
  Each mail gets its own folder, so revisions stay side by side.
- Whose move it is follows the newest mail: a mail from the customer means **our move**, and a mail from us means **waiting for customer**.

Within a minute or two, Gemini then reads the mail and its drawings in the background. It fills in:
- a one-line summary
- what the customer is asking for now
- the customer and contact person
- the parts: one per drawing number, with name, rev, material, finish and next assembly

A value it cannot read clearly is left empty, never guessed.

Nothing watches your mailbox. A mail reaches minimalDASH only when you press a button, and the add-on can read only the mail that is open.

## One-time setup (about 15 minutes)

Do all of this signed in to Google as **info@micro-components.com**.

### 1. Gemini key
Go to <https://aistudio.google.com/apikey> and create an API key (free). You can use the same key as MinimalERP.

> On Google's free tier, what is sent (mails and drawings) may be used by Google to improve its products. A paid key changes
> only the key, not the code.

### 2. The Apps Script project
1. Go to <https://script.google.com> › **New project**, and name it *minimalDASH*.
2. **Project Settings** (gear icon) › tick **Show "appsscript.json" manifest file in editor**.
3. In the editor:
   - replace the content of `appsscript.json` with this folder's `appsscript.json`
   - delete `Code.gs`
   - add four script files with the same names and content: `Dash.gs`, `Addon.gs`, `Drive.gs`, `Reader.gs` (**+** › Script)
4. **Project Settings › Script properties**: add each line of `C:\Users\padek\minimalDASH-samples\addon-settings.txt`. Put your own
   minimalDASH password (the one you sign in with) in `DASH_PASSWORD`, and your Gemini key in `GEMINI_API_KEY`.
   - Optional: `GEMINI_MODEL`, a comma-separated list of models to try in order, if the default ones are not available to your key.

### 3. Start the background reader (once)
In the editor, choose the function **installReader** in the toolbar and click **Run**. Google asks you to allow the permissions: allow them.
From then on, `readQueue` runs every minute and returns at once when there is nothing to read.

### 4. Put the panel in Gmail
**Deploy › Test deployments › Google Workspace add-on › Install**. Reload Gmail and open any mail: the minimalDASH icon appears in the
right-hand panel. The first time, Gmail asks you to allow the permissions.

### 5. Uploads from minimalDASH (WhatsApp, calls, visits)
With this, **New job** in minimalDASH and **Add WhatsApp / call / files** on a job can send files. Without it you can still write
the message, but files can't be sent.

1. In the same Apps Script project: **Deploy › New deployment**, type **Web app**, *Execute as: Me*, *Who has access: Anyone*.
2. Copy the address ending in `/exec` and send it to be set as the site's `UPLOAD_URL` repository variable.

Anyone can reach the address, but it accepts only a request carrying your minimalDASH sign-in, checked with Supabase. Files are saved in
the job's Drive folder (`<date time> WhatsApp` and so on), and Gemini reads them like a mail's.

After you change the code later, update this deployment with **Deploy › Manage deployments › Edit › Version: New version**, so the
same address runs the new code.

## What it may do (the permissions it asks for)
- `gmail.addons.current.message.readonly`: read the mail you have open, only when you use the panel. It cannot read your mailbox.
- `drive`: create the `minimalDASH` folder and save the attachments in it.
- `script.external_request`: talk to minimalDASH and to Gemini.
- `script.scriptapp`: run the background reader every minute.

It cannot send, change or delete mail.

## If something is wrong
- **Not filed / could not sign in**: check `DASH_EMAIL` and `DASH_PASSWORD` in Script properties.
- **"not read by Gemini: …" in the timeline**: the reason follows. For a model name error, set `GEMINI_MODEL`.
  When Gemini is busy, the reader tries again for a few minutes by itself. To read a mail again, press **Add to this job** again.
- **Executions** (the ▶ list in Apps Script) shows each run and any error.
