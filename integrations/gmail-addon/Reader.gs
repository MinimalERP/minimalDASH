/**
 * Gemini reads what was filed, in the background: `readQueue` runs every minute (set up once with `installReader`) and has up to
 * six minutes, where a Gmail button has thirty seconds.
 *
 * It reads the mail's text (from minimalDASH) and its PDFs and images (from Drive), and fills in:
 *   - the timeline line: one sentence saying what the mail says
 *   - the job: customer, contact, what is asked now, the due date
 *   - the parts: one per drawing number, from the title block (name, rev, material, finish, next assembly)
 * A value it cannot read is left empty; it never guesses.
 */

var DEFAULT_MODELS_ = 'gemini-3.6-flash,gemini-3.8-flash';
var MAX_FILES_ = 12;
var MAX_FILE_BYTES_ = 14 * 1024 * 1024; // all files together, per mail
var MAX_TRIES_ = 6;

/** Run once from the editor: reads the queue every minute. */
function installReader() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'readQueue') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('readQueue').timeBased().everyMinutes(1).create();
}

function queueReading_(item) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var queue = JSON.parse(props.getProperty('READ_QUEUE') || '[]').filter(function (q) { return q.eventId !== item.eventId; });
    item.fileIds = item.fileIds.slice(0, 20);
    item.tries = 0;
    queue.push(item);
    props.setProperty('READ_QUEUE', JSON.stringify(queue.slice(-20)));
  } finally {
    lock.releaseLock();
  }
}

function readQueue() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // the previous run is still reading
  try {
    var props = PropertiesService.getScriptProperties();
    var queue = JSON.parse(props.getProperty('READ_QUEUE') || '[]');
    if (!queue.length) return;
    var t0 = Date.now();
    var left = [];
    queue.forEach(function (item) {
      if (Date.now() - t0 > 4 * 60 * 1000) return left.push(item); // next minute
      try {
        read_(item);
      } catch (err) {
        item.tries++;
        console.error('reading ' + item.eventId + ' (try ' + item.tries + '): ' + err);
        if (err.busy && item.tries < MAX_TRIES_) return left.push(item);
        markUnread_(item, String(err.message || err));
      }
    });
    props.setProperty('READ_QUEUE', JSON.stringify(left));
  } finally {
    lock.releaseLock();
  }
}

function markUnread_(item, why) {
  try {
    var ev = rest_('get', 'job_events?id=eq.' + q_(item.eventId) + '&select=mail_subject')[0];
    if (ev) rest_('patch', 'job_events?id=eq.' + q_(item.eventId), { summary: (ev.mail_subject || 'Mail') + ' — not read by Gemini: ' + why.slice(0, 300) });
  } catch (e) {
    console.error(e);
  }
}

function read_(item) {
  var ev = rest_('get', 'job_events?id=eq.' + q_(item.eventId) + '&select=*,jobs(*)')[0];
  if (!ev) return; // deleted meanwhile
  var job = ev.jobs;

  var parts = [{ text: prompt_(job, ev) }];
  var total = 0;
  var count = 0;
  item.fileIds
    .map(function (id) {
      try {
        return DriveApp.getFileById(id);
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean)
    .sort(function (a, b) { return (a.getMimeType() === 'application/pdf' ? 0 : 1) - (b.getMimeType() === 'application/pdf' ? 0 : 1); })
    .forEach(function (f) {
      if (count >= MAX_FILES_ || total + f.getSize() > MAX_FILE_BYTES_) return;
      count++;
      total += f.getSize();
      parts.push({ text: 'File: ' + f.getName() });
      parts.push({ inline_data: { mime_type: f.getMimeType(), data: Utilities.base64Encode(f.getBlob().getBytes()) } });
    });

  var r = gemini_(parts);

  rest_('patch', 'job_events?id=eq.' + q_(ev.id), { summary: (r.summary || ev.mail_subject || 'Mail').slice(0, 2000) });

  var jobChange = {};
  if (r.customer && (item.newJob || !job.customer)) jobChange.customer = r.customer.slice(0, 200);
  if (r.contact && !job.contact) jobChange.contact = r.contact.slice(0, 200);
  if (r.asked && ev.who === 'customer') jobChange.asked = r.asked.slice(0, 1000);
  if (/^\d{4}-\d{2}-\d{2}$/.test(r.dueDate || '')) jobChange.due_date = r.dueDate;
  if (Object.keys(jobChange).length) rest_('patch', 'jobs?id=eq.' + q_(job.id), jobChange);

  savePartsRead_(job.id, r.parts || [], ev.file_links || []);
}

function key_(drawingNo) {
  return String(drawingNo || '').toUpperCase().replace(/[\s_]+/g, '-');
}

/** A part already in the job keeps what it has unless the new drawing says something (a new rev, a material); new drawing numbers are added. */
function savePartsRead_(jobId, read, links) {
  var existing = rest_('get', 'parts?job_id=eq.' + q_(jobId) + '&select=*');
  read.forEach(function (p) {
    var k = key_(p.drawingNo);
    if (!k) return;
    var fields = { name: p.name, rev: p.rev, material: p.material, finish: p.finish, next_assy: p.nextAssy, qty: p.qty };
    Object.keys(fields).forEach(function (f) {
      fields[f] = String(fields[f] || '').trim().slice(0, 500);
      if (!fields[f]) delete fields[f];
    });
    var file = links
      .filter(function (l) { return key_(l.name).indexOf(k) >= 0; })
      .sort(function (a, b) { return (/\.pdf$/i.test(a.name) ? 0 : 1) - (/\.pdf$/i.test(b.name) ? 0 : 1); })[0];
    if (file) fields.drive_file_url = file.url;
    var same = existing.filter(function (e) { return key_(e.drawing_no) === k; })[0];
    if (same) {
      if (Object.keys(fields).length) rest_('patch', 'parts?id=eq.' + q_(same.id), fields);
    } else {
      fields.job_id = jobId;
      fields.drawing_no = String(p.drawingNo).trim().toUpperCase().slice(0, 100);
      existing.push(rest_('post', 'parts', fields)[0]);
    }
  });
}

function prompt_(job, ev) {
  return [
    'You read mails for Micro Components, an Indian company that supplies machined components (CNC, VMC, turning), rubber, glass,',
    'surface treatment and other engineering services to customers, made through its network of vendors. Mails from',
    '@' + (prop_('OUR_DOMAIN', false) || 'micro-components.com') + ' are ours; the others are from the customer.',
    '',
    'Job: ' + job.title + (job.customer ? ' (customer ' + job.customer + ')' : ''),
    'This mail is from ' + (ev.who === 'us' ? 'US' : 'THE CUSTOMER') + '.',
    'From: ' + ev.mail_from,
    'To: ' + ev.mail_to,
    'Subject: ' + ev.mail_subject,
    '',
    ev.body || '(no text)',
    '',
    'The attached files follow (drawings, sketches, specifications). Answer in the JSON shape given:',
    '- summary: ONE short sentence (max 25 words) of what this mail says or asks, with the key numbers (prices, quantities, dates).',
    '- asked: if the mail is from the customer, what they want from us now, in one line; else empty.',
    '- customer: the customer company name as written in the mail signature or drawing title block; empty if not written.',
    '- contact: the customer person who wrote, as "First Last"; empty if the mail is ours.',
    '- dueDate: a date the customer needs it by, as YYYY-MM-DD, only if written; else empty.',
    '- parts: one per distinct drawing number in the attached drawings (title block): drawingNo, name, rev, material, finish',
    '  (plating / coating / heat treatment / surface treatment from the notes), nextAssy, qty (only if the mail states a quantity).',
    '  Specifications and standards documents are not parts.',
    'Write only what is written. When a value is not clearly written, leave it empty: never guess.',
  ].join('\n');
}

var SCHEMA_ = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    asked: { type: 'STRING' },
    customer: { type: 'STRING' },
    contact: { type: 'STRING' },
    dueDate: { type: 'STRING' },
    parts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          drawingNo: { type: 'STRING' },
          name: { type: 'STRING' },
          rev: { type: 'STRING' },
          material: { type: 'STRING' },
          finish: { type: 'STRING' },
          nextAssy: { type: 'STRING' },
          qty: { type: 'STRING' },
        },
        required: ['drawingNo'],
      },
    },
  },
  required: ['summary', 'parts'],
};

/** Tries each model in GEMINI_MODEL in turn. Busy or out of free quota everywhere: throws `busy`, so the queue tries again later. */
function gemini_(parts) {
  var models = (prop_('GEMINI_MODEL', false) || DEFAULT_MODELS_).split(',').map(function (m) { return m.trim(); }).filter(String);
  var body = JSON.stringify({
    contents: [{ role: 'user', parts: parts }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA_ },
  });
  var last = '';
  for (var i = 0; i < models.length; i++) {
    var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(models[i]) + ':generateContent', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': prop_('GEMINI_API_KEY', true) },
      payload: body,
      muteHttpExceptions: true,
    });
    var code = res.getResponseCode();
    if (code === 200) {
      var out = JSON.parse(res.getContentText());
      var text = (((out.candidates || [])[0] || {}).content || { parts: [] }).parts.map(function (p) { return p.text || ''; }).join('');
      return JSON.parse(text);
    }
    last = models[i] + ' ' + code + ': ' + res.getContentText().slice(0, 200);
    if (code === 429 || code >= 500) continue;
    throw new Error('Gemini refused (' + last + '). Check GEMINI_API_KEY and GEMINI_MODEL.');
  }
  var busy = new Error('Gemini is busy (' + last + ')');
  busy.busy = true;
  throw busy;
}
