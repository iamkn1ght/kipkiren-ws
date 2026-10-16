/**
 * Kipkiren WS - Gmail email relay (Google Apps Script).
 *
 * Why: Railway blocks outbound SMTP on non-Pro plans, so the API cannot talk
 * to smtp.gmail.com directly. The API instead POSTs each email over HTTPS to
 * this script (deployed as a web app under kipkiren.ws@gmail.com), and Google
 * sends it. Limit: ~100 recipients/day on a free Gmail account.
 *
 * Setup (script.google.com, signed in as kipkiren.ws@gmail.com):
 *   1. New project, paste this file, set SECRET below to a long random string.
 *   2. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 *   3. Authorize, copy the Web app URL (ends in /exec).
 * Railway (API service):
 *   EMAIL_API_URL = <web app URL>?key=<SECRET>
 *   EMAIL_API_KEY = gas            (any non-empty value; Apps Script cannot read headers)
 *   EMAIL_FROM    = Kipkiren WS <kipkiren.ws@gmail.com>
 *   EMAIL_REPLY_TO = studio@kipkiren.co.ke
 * Apps Script always answers HTTP 200, so errors are returned as {error}; the
 * API treats that as a failed send (services/email.ts).
 */
const SECRET = 'PASTE-YOUR-SECRET-HERE';

function doPost(e) {
  try {
    if (!e || !e.parameter || e.parameter.key !== SECRET) return out_({ error: 'unauthorized' });
    const m = JSON.parse(e.postData.contents);
    if (!m.to || !m.subject) return out_({ error: 'missing_to_or_subject' });
    const msg = { to: m.to, subject: m.subject, body: m.text || '', htmlBody: m.html || undefined, name: 'Kipkiren WS' };
    if (m.reply_to) msg.replyTo = m.reply_to;
    MailApp.sendEmail(msg);
    return out_({ id: 'gas-' + Date.now(), remaining_today: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return out_({ error: String(err && err.message ? err.message : err) });
  }
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
