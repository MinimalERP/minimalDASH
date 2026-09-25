/**
 * minimalDASH for Gmail: talking to minimalDASH, whose jobs live in minimalERP's database.
 *
 * The add-on signs in as the ERP's add-on user (erp-bot, role `automation`: it may file jobs, mails and readings, and can post no
 * voucher). It reads the dash_* tables (RLS) and changes them only through the ERP's `dash` function, which checks permission.
 * Settings live in this script's properties (Project Settings › Script properties), never in the code:
 *
 *   SUPABASE_URL        https://iifxhhnwhglhyxroqiqa.supabase.co   (minimalERP's project)
 *   SUPABASE_ANON_KEY   the project's public anon key
 *   DASH_EMAIL          the add-on user's sign-in (erp-bot@micro-components.com)
 *   DASH_PASSWORD       its password (the same as ERP_PASSWORD in the MinimalERP add-on)
 *   COMPANY_ID          optional: only if that user belongs to more than one company
 *   GEMINI_API_KEY      from https://aistudio.google.com/apikey
 *   GEMINI_MODEL        optional: models to try in order, comma-separated
 *   OUR_DOMAIN          optional: mail from this domain is "Us" (default micro-components.com)
 */

var SITE_ = 'https://minimalerp.github.io/minimalDASH/';

function prop_(name, required) {
  var v = PropertiesService.getScriptProperties().getProperty(name);
  if (required && !v) throw new Error('minimalDASH is not set up: script property ' + name + ' is missing');
  return v || '';
}

/** A minimalDASH access token, kept for 50 minutes (they last an hour). */
function token_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('dash-token');
  if (cached) return cached;
  var res = UrlFetchApp.fetch(prop_('SUPABASE_URL', true) + '/auth/v1/token?grant_type=password', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: prop_('SUPABASE_ANON_KEY', true) },
    payload: JSON.stringify({ email: prop_('DASH_EMAIL', true), password: prop_('DASH_PASSWORD', true) }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('Could not sign in to minimalDASH (' + res.getResponseCode() + '): check DASH_EMAIL and DASH_PASSWORD');
  var token = JSON.parse(res.getContentText()).access_token;
  cache.put('dash-token', token, 50 * 60);
  return token;
}

/** Reads rows (PostgREST, through RLS). `token` is someone else's sign-in (an upload from the site); by default the add-on's own. */
function get_(path, token) {
  var res = UrlFetchApp.fetch(prop_('SUPABASE_URL', true) + '/rest/v1/' + path, {
    headers: { Authorization: 'Bearer ' + (token || token_()), apikey: prop_('SUPABASE_ANON_KEY', true) },
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code === 401 && !token) CacheService.getScriptCache().remove('dash-token');
  if (code >= 300) throw new Error('minimalDASH answered ' + code + ': ' + res.getContentText().slice(0, 300));
  return JSON.parse(res.getContentText());
}

/** One change through the ERP's `dash` function (see dash_apply there for the operations). Returns the row as it now is. */
function dash_(op, payload, token) {
  var res = UrlFetchApp.fetch(prop_('SUPABASE_URL', true) + '/functions/v1/dash', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + (token || token_()), apikey: prop_('SUPABASE_ANON_KEY', true) },
    payload: JSON.stringify({ companyId: companyId_(), op: op, payload: payload }),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code === 401 && !token) CacheService.getScriptCache().remove('dash-token');
  var answer;
  try {
    answer = JSON.parse(res.getContentText());
  } catch (e) {
    throw new Error('minimalDASH did not answer properly (' + code + ')');
  }
  if (!answer.ok) throw new Error((answer.issues || []).map(function (i) { return i.message; }).join('; ') || 'Not saved (' + code + ')');
  return answer.value;
}

/** The company the jobs belong to: COMPANY_ID, or the one company the add-on's user is a member of. */
function companyId_() {
  var id = prop_('COMPANY_ID', false);
  if (id) return id;
  var cache = CacheService.getScriptCache();
  id = cache.get('company-id');
  if (id) return id;
  var rows = get_('company_members?select=company_id');
  if (rows.length !== 1) throw new Error(rows.length ? 'The add-on user is in several companies: set COMPANY_ID' : 'The add-on user is in no company');
  cache.put('company-id', rows[0].company_id, 6 * 60 * 60);
  return rows[0].company_id;
}

function q_(v) {
  return encodeURIComponent(v);
}

function jobUrl_(jobId) {
  return SITE_ + '#job/' + jobId;
}

function openJobs_() {
  return get_('dash_jobs?company_id=eq.' + q_(companyId_()) + '&status=eq.open&select=id,title,customer&order=created_at.desc&limit=50');
}

function jobForThread_(threadId) {
  return get_('dash_jobs?company_id=eq.' + q_(companyId_()) + '&gmail_thread_id=eq.' + q_(threadId) + '&select=*')[0] || null;
}

/** With `token` (an upload from the site): found only if that person may see it. */
function getJob_(jobId, token) {
  return get_('dash_jobs?id=eq.' + q_(jobId) + '&select=*', token)[0] || null;
}

function eventForMessage_(messageId) {
  if (!messageId) return null;
  var ev = get_('dash_events?company_id=eq.' + q_(companyId_()) + '&gmail_message_id=eq.' + q_(messageId) + '&select=id,job_id,dash_jobs(title)')[0];
  return ev ? { id: ev.id, job_id: ev.job_id, jobs: ev.dash_jobs } : null;
}
