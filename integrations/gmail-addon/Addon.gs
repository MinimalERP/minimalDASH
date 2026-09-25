/**
 * The Gmail side panel. Nothing is read until you press a button, and then only the mail that is open (the add-on can read the
 * current message only, never the mailbox).
 *
 * A button does the quick part at once (Gmail allows it about 30 seconds): the mail's text goes to minimalDASH, every attachment is
 * saved in the job's Drive folder (zips unzipped), and the mail joins the job's timeline. Gemini then reads the mail and its drawings
 * in the background (`readQueue`, every minute) and fills in the summary, what is asked, and the parts.
 */

var MAX_TEXT_ = 100000;

/** Contextual trigger: a mail was opened. */
function onGmailMessageOpen(e) {
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  var message = GmailApp.getMessageById(e.gmail.messageId);
  var files = mailFiles_(message);
  var section = CardService.newCardSection();

  section.addWidget(
    CardService.newDecoratedText()
      .setTopLabel(isOurs_(message.getFrom()) ? 'From us' : 'From ' + nameOf_(message.getFrom()))
      .setText(files.length ? files.length + ' file(s): ' + files.map(function (f) { return f.getName(); }).join(', ') : 'No attachments')
      .setWrapText(true),
  );

  var already = eventForMessage_(messageIdOf_(message));
  if (already) {
    section.addWidget(
      CardService.newTextParagraph().setText('<font color="#5f6368">Already in job “' + escape_(already.jobs.title) + '”. Adding it again refreshes its text, files and reading.</font>'),
    );
  }

  var threadJob = jobForThread_(e.gmail.threadId);
  if (threadJob) {
    section.addWidget(CardService.newTextParagraph().setText('This conversation is job <b>' + escape_(threadJob.title) + '</b>.'));
    section.addWidget(
      CardService.newTextButton()
        .setText('Add to this job')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(CardService.newAction().setFunctionName('onAddToJob').setParameters({ jobId: threadJob.id })),
    );
    section.addWidget(CardService.newTextButton().setText('Open job in minimalDASH').setOpenLink(CardService.newOpenLink().setUrl(jobUrl_(threadJob.id))));
  } else {
    section.addWidget(
      CardService.newTextButton()
        .setText('New job')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(CardService.newAction().setFunctionName('onNewJob')),
    );
    var jobs = openJobs_();
    if (jobs.length) {
      var pick = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setFieldName('job').setTitle('Or add to a job');
      jobs.forEach(function (j, i) {
        pick.addItem(j.title + (j.customer ? ' · ' + j.customer : ''), j.id, i === 0);
      });
      section.addWidget(pick);
      section.addWidget(CardService.newTextButton().setText('Add to chosen job').setOnClickAction(CardService.newAction().setFunctionName('onAddToJob')));
    }
  }

  return CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('minimalDASH')).addSection(section).build();
}

function onNewJob(e) {
  return fileMail_(e, null);
}

function onAddToJob(e) {
  var jobId = e.parameters.jobId || (e.formInput && e.formInput.job);
  if (!jobId) return notify_('Choose a job first.');
  return fileMail_(e, jobId);
}

function fileMail_(e, jobId) {
  try {
    GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
    var message = GmailApp.getMessageById(e.gmail.messageId);
    var threadId = e.gmail.threadId;
    var messageId = messageIdOf_(message);
    var fromUs = isOurs_(message.getFrom());
    var at = message.getDate();

    var job;
    if (jobId) {
      job = getJob_(jobId);
      if (!job) return notify_('That job is gone: open the mail again.');
      if (!job.gmail_thread_id && !jobForThread_(threadId)) job = rest_('patch', 'jobs?id=eq.' + q_(job.id), { gmail_thread_id: threadId })[0];
    } else {
      job = jobForThread_(threadId); // pressed twice: the same job, not a second one
      if (!job) {
        job = rest_('post', 'jobs', {
          title: cleanSubject_(message.getSubject()) || 'New job',
          customer: fromUs ? '' : customerOf_(message.getFrom()),
          contact: fromUs ? '' : nameOf_(message.getFrom()),
          whose_move: fromUs ? 'customer' : 'us',
          move_since: ymd_(at),
          gmail_thread_id: threadId,
        })[0];
      }
    }

    var saved = saveToDrive_(job, message, fromUs);
    if (saved.folderUrl !== job.drive_folder_url) rest_('patch', 'jobs?id=eq.' + q_(job.id), { drive_folder_url: saved.folderUrl });

    var entry = {
      job_id: job.id,
      at: at.toISOString(),
      who: fromUs ? 'us' : 'customer',
      mail_from: message.getFrom().slice(0, 300),
      mail_to: [message.getTo(), message.getCc()].filter(String).join(', ').slice(0, 2000),
      mail_subject: message.getSubject().slice(0, 500),
      body: newText_(message.getPlainBody()).slice(0, MAX_TEXT_),
      gmail_message_id: messageId,
      file_links: saved.links,
    };
    var existing = rest_('get', 'job_events?job_id=eq.' + q_(job.id) + '&gmail_message_id=eq.' + q_(messageId) + '&select=id');
    var event = existing.length
      ? rest_('patch', 'job_events?id=eq.' + q_(existing[0].id), entry)[0]
      : rest_('post', 'job_events', Object.assign({ summary: entry.mail_subject || '(no subject)' }, entry))[0];

    // the newest mail decides whose move it is: theirs → ours; ours → we wait for them
    var later = rest_('get', 'job_events?job_id=eq.' + q_(job.id) + '&who=in.(us,customer)&at=gt.' + q_(entry.at) + '&select=id&limit=1');
    if (!later.length) rest_('patch', 'jobs?id=eq.' + q_(job.id), { whose_move: fromUs ? 'customer' : 'us', move_since: ymd_(at) });

    queueReading_({ eventId: event.id, jobId: job.id, fileIds: saved.readableIds, newJob: !jobId });

    return resultCard_('Filed in “' + job.title + '”', [
      saved.links.length ? saved.links.length + ' file(s) saved in Drive.' : 'No files in this mail.',
      'Gemini reads it within a minute or two and fills in the summary and the parts.',
    ], job.id);
  } catch (err) {
    console.error(err);
    return resultCard_('Not filed', [String(err.message || err)], null, true);
  }
}

// ---- reading the mail ----

function messageIdOf_(message) {
  return String(message.getHeader('Message-ID') || '').replace(/^<|>$/g, '').trim();
}

function isOurs_(from) {
  return emailOf_(from).split('@')[1] === (prop_('OUR_DOMAIN', false) || 'micro-components.com').toLowerCase();
}

function emailOf_(from) {
  var m = /<([^>]+)>/.exec(from);
  return (m ? m[1] : from).trim().toLowerCase();
}

/** "Mohammed, Gaffar" <…> → "Gaffar Mohammed" */
function nameOf_(from) {
  var name = String(from).replace(/<[^>]*>/, '').replace(/"/g, '').trim();
  var parts = name.split(',');
  if (parts.length === 2) name = parts[1].trim() + ' ' + parts[0].trim();
  return name || emailOf_(from);
}

/** gaffar@honeywell.com → "Honeywell". Gemini corrects it from the mail's signature or drawings. */
function customerOf_(from) {
  var domain = emailOf_(from).split('@')[1] || '';
  var name = domain.split('.')[0];
  if (['gmail', 'yahoo', 'outlook', 'hotmail', 'rediffmail'].indexOf(name) >= 0) return nameOf_(from);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** "RE: [External] Re: Fuel BF localization" → "Fuel BF localization" */
function cleanSubject_(subject) {
  var s = String(subject || '');
  var before;
  do {
    before = s;
    s = s.replace(/^\s*((re|fw|fwd|aw|wg)\s*:|\[[^\]]*\])\s*/i, '');
  } while (s !== before);
  return s.trim().slice(0, 200);
}

/** The mail's own text: the quoted earlier mails below it are cut off (each of those is its own entry). */
function newText_(body) {
  var lines = String(body || '').replace(/\r/g, '').split('\n');
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    var next = lines[i + 1] || '';
    if (/^\s*>/.test(l)) break;
    if (/^\s*On .{5,120}wrote:\s*$/.test(l) || (/^\s*On .{5,120}/.test(l) && /^\s*.{0,80}wrote:\s*$/.test(next))) break;
    if (/^\s*From:\s/.test(l) && out.length > 0) break;
    if (/^-{2,}\s*Original Message/i.test(l)) break;
    out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function ymd_(d) {
  return Utilities.formatDate(d, 'Asia/Kolkata', 'yyyy-MM-dd');
}

// ---- cards ----

function resultCard_(title, lines, jobId, failed) {
  var section = CardService.newCardSection();
  lines.forEach(function (l) {
    section.addWidget(CardService.newTextParagraph().setText(failed ? '<font color="#b3261e">' + escape_(l) + '</font>' : escape_(l)));
  });
  if (jobId) section.addWidget(CardService.newTextButton().setText('Open job in minimalDASH').setOpenLink(CardService.newOpenLink().setUrl(jobUrl_(jobId))));
  var card = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle(title)).addSection(section).build();
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(card)).build();
}

function notify_(text) {
  return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(text)).build();
}

function escape_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
