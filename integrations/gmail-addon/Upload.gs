/**
 * Uploads from minimalDASH: an enquiry that came by WhatsApp, a call, a visit… Deployed as a web app (see README), so the site can
 * send it files: they are saved in the job's Drive folder like a mail's, the message joins the timeline, and Gemini reads both.
 *
 * Anyone can reach the address, so every request must carry a minimalDASH sign-in: it is checked with Supabase, and only the owner
 * (DASH_EMAIL) is accepted.
 *
 * Request (POST, text/plain so the browser sends it without a preflight):
 *   { token, jobId, via: 'WhatsApp', text: '…', files: [{ name, type, base64 }] }
 */

var MAX_UPLOAD_BYTES_ = 40 * 1024 * 1024;

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    checkSignIn_(req.token);
    var job = getJob_(req.jobId);
    if (!job) return answer_({ ok: false, message: 'That job is gone.' });

    var total = 0;
    var blobs = (req.files || []).map(function (f) {
      var bytes = Utilities.base64Decode(f.base64);
      total += bytes.length;
      return Utilities.newBlob(bytes, f.type || 'application/octet-stream', String(f.name || 'file').split(/[\\/]/).pop());
    });
    if (total > MAX_UPLOAD_BYTES_) return answer_({ ok: false, message: 'The files are larger than 40 MB together.' });

    var via = String(req.via || 'Upload').slice(0, 40);
    var now = new Date();
    var saved = saveBlobs_(job, blobs, Utilities.formatDate(now, 'Asia/Kolkata', 'yyyy-MM-dd HHmm') + ' ' + via);
    if (saved.folderUrl !== job.drive_folder_url) rest_('patch', 'jobs?id=eq.' + q_(job.id), { drive_folder_url: saved.folderUrl });

    var text = String(req.text || '').slice(0, MAX_TEXT_);
    var event = rest_('post', 'job_events', {
      job_id: job.id,
      at: now.toISOString(),
      who: 'customer',
      summary: text ? text.split('\n')[0].slice(0, 200) : via + ': ' + saved.links.length + ' file(s)',
      mail_from: via,
      body: text,
      file_links: saved.links,
    })[0];
    rest_('patch', 'jobs?id=eq.' + q_(job.id), { whose_move: 'us', move_since: ymd_(now) });
    if (text || saved.readableIds.length) queueReading_({ eventId: event.id, jobId: job.id, fileIds: saved.readableIds, newJob: !job.customer });

    return answer_({ ok: true, eventId: event.id, files: saved.links.length });
  } catch (err) {
    console.error(err);
    return answer_({ ok: false, message: String(err.message || err) });
  }
}

/** The request's sign-in must be the owner's, checked with Supabase itself. */
function checkSignIn_(token) {
  if (!token) throw new Error('Not signed in.');
  var res = UrlFetchApp.fetch(prop_('SUPABASE_URL', true) + '/auth/v1/user', {
    headers: { apikey: prop_('SUPABASE_ANON_KEY', true), Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('Your minimalDASH sign-in has expired: reload the page.');
  var email = String(JSON.parse(res.getContentText()).email || '').toLowerCase();
  if (email !== prop_('DASH_EMAIL', true).toLowerCase()) throw new Error('This minimalDASH account may not upload here.');
}

function answer_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
