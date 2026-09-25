/**
 * Filing a mail's attachments in Google Drive:
 *
 *   minimalDASH / <Customer> / <Job> / 2026-09-24 1757 Customer / mo-sh-005.pdf …
 *
 * One folder per mail, so every revision a customer sends stays side by side with the date it came. Zips are unzipped into it (the
 * zip itself is still in Gmail). Small inline images (logos, signatures) are skipped.
 */

var READABLE_TYPES_ = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
var MIN_INLINE_IMAGE_BYTES_ = 30 * 1024;

function mailFiles_(message) {
  return message.getAttachments({ includeInlineImages: true }).filter(function (a) {
    var image = /^image\//.test(a.getContentType());
    return !image || a.getSize() >= MIN_INLINE_IMAGE_BYTES_;
  });
}

function isZip_(blob) {
  return /zip/.test(blob.getContentType() || '') || /\.zip$/i.test(blob.getName() || '');
}

/** Saves the mail's files; returns the job folder's address, a link per file, and the ids of the files Gemini can read. */
function saveToDrive_(job, message, fromUs) {
  var jobFolder = jobFolder_(job);
  var result = { folderUrl: jobFolder.getUrl(), links: [], readableIds: [] };
  var files = mailFiles_(message);
  if (!files.length) return result;

  var name = Utilities.formatDate(message.getDate(), 'Asia/Kolkata', 'yyyy-MM-dd HHmm') + (fromUs ? ' Us' : ' Customer');
  var mailFolder = childFolder_(jobFolder, name);
  files.forEach(function (a) {
    var blob = a.copyBlob();
    if (isZip_(blob)) {
      blob.setContentType('application/zip');
      Utilities.unzip(blob).forEach(function (inner) {
        var innerName = String(inner.getName() || '').split('/').pop();
        if (!innerName || inner.getBytes().length === 0) return; // a folder entry
        inner.setName(innerName);
        keep_(mailFolder, inner, result);
      });
    } else {
      keep_(mailFolder, blob, result);
    }
  });
  return result;
}

function keep_(folder, blob, result) {
  var existing = folder.getFilesByName(blob.getName()); // the same mail added again: the file is already there
  var file = existing.hasNext() ? existing.next() : folder.createFile(blob);
  result.links.push({ name: file.getName(), url: file.getUrl() });
  if (READABLE_TYPES_.indexOf(file.getMimeType()) >= 0) result.readableIds.push(file.getId());
}

function jobFolder_(job) {
  var id = /folders\/([\w-]+)/.exec(job.drive_folder_url || '');
  if (id) {
    try {
      var f = DriveApp.getFolderById(id[1]);
      if (!f.isTrashed()) return f;
    } catch (e) {
      /* deleted: make a new one */
    }
  }
  return childFolder_(childFolder_(rootFolder_(), job.customer || 'No customer yet'), job.title);
}

function rootFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DRIVE_ROOT_ID');
  if (id) {
    try {
      var f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (e) {
      /* deleted: make a new one */
    }
  }
  var root = DriveApp.createFolder('minimalDASH');
  props.setProperty('DRIVE_ROOT_ID', root.getId());
  return root;
}

function childFolder_(parent, name) {
  var clean = String(name).replace(/[\/\\]/g, '-').trim().slice(0, 120) || 'Untitled';
  var found = parent.getFoldersByName(clean);
  return found.hasNext() ? found.next() : parent.createFolder(clean);
}
