/**
 * minimalDASH for Gmail: talking to minimalDASH (Supabase).
 *
 * The add-on signs in as you (the owner), so what it files is yours and only yours. Settings live in this script's properties
 * (Project Settings › Script properties), never in the code:
 *
 *   SUPABASE_URL        https://cqtffnqaffebnzzoazdo.supabase.co
 *   SUPABASE_ANON_KEY   the project's public anon key
 *   DASH_EMAIL          your minimalDASH sign-in (info@micro-components.com)
 *   DASH_PASSWORD       the add-on password (see README)
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

/** One call to minimalDASH's tables (PostgREST). Returns the parsed rows; throws with a readable sentence on failure. */
function rest_(method, path, body) {
  var res = UrlFetchApp.fetch(prop_('SUPABASE_URL', true) + '/rest/v1/' + path, {
    method: method,
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token_(), apikey: prop_('SUPABASE_ANON_KEY', true), Prefer: 'return=representation' },
    payload: body === undefined ? undefined : JSON.stringify(body),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code === 401) CacheService.getScriptCache().remove('dash-token');
  if (code >= 300) throw new Error('minimalDASH answered ' + code + ': ' + res.getContentText().slice(0, 300));
  var text = res.getContentText();
  return text ? JSON.parse(text) : null;
}

function q_(v) {
  return encodeURIComponent(v);
}

function jobUrl_(jobId) {
  return SITE_ + '#job/' + jobId;
}

function openJobs_() {
  return rest_('get', 'jobs?status=eq.open&select=id,title,customer&order=created_at.desc&limit=50');
}

function jobForThread_(threadId) {
  return rest_('get', 'jobs?gmail_thread_id=eq.' + q_(threadId) + '&select=*')[0] || null;
}

function getJob_(jobId) {
  return rest_('get', 'jobs?id=eq.' + q_(jobId) + '&select=*')[0] || null;
}

function eventForMessage_(messageId) {
  if (!messageId) return null;
  return rest_('get', 'job_events?gmail_message_id=eq.' + q_(messageId) + '&select=id,job_id,file_links,jobs(title)')[0] || null;
}
