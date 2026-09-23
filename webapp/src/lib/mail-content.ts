import type { Event, Registration } from './types';
import { eventTime, TIME_ZONE } from './time';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

export function mailContent(
  event: Event,
  row: Pick<Registration, 'status' | 'seats'>,
  kind: string,
  link: string,
) {
  const heading =
    kind === 'opening'
      ? 'A spot is available — claim your RSVP'
      : kind === 'updated'
        ? 'Your event details have changed'
        : row.status === 'confirmed'
          ? 'Your RSVP is confirmed'
          : row.status === 'waitlisted'
            ? 'You’re on the waitlist'
            : 'Your response has been received';
  const explanation =
    kind === 'opening'
      ? `There is currently room for your party. Open the link below and choose “Claim ${row.seats === 2 ? 'two spots' : 'my spot'}”. Openings are first come, first served and are not reserved by this email.`
      : row.status === 'confirmed'
        ? `You have ${row.seats === 2 ? 'two confirmed places' : 'a confirmed place'} at ${event.title}.`
        : row.status === 'waitlisted'
          ? `Your party of ${row.seats} is on the waitlist. We’ll email when there’s room to claim a place. You are not confirmed until you claim an opening.`
          : 'You told us you can’t make it. No seat has been reserved.';
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'long',
  }).format(new Date(event.starts_at));
  const reminders =
    row.status === 'confirmed' && kind !== 'opening'
      ? `~ Thanks for RSVPing for Queer Support ~

Looking forward to seeing you on ${weekday}! Here are a few reminders and things to keep in mind:

• As a security precaution, I will be locking the door once everyone who has RSVPd arrives, so please try your best to be on time.

• If you anticipate you will be late, let me know. I can let you in through the back to minimize disruptions to the group.

• Seats are limited, so if you change your mind or something comes up and you can no longer make it to group, call, text, or email me as soon as possible so I can open your seat for someone else. You can also remove your RSVP using the link below.`
      : '';
  const signature = `Rene Snow (She/Her)
Health Educator/Peer Support Specialist
APAIT, a Division of Special Service for Groups

Phone: (714) 636 1349 ext: 204
Mobile: (213) 434 2948
email: renes@apaitssg.org`;
  const reminderParts = reminders.split('\n\n');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background-color:#f5f1f8;color:#30263b;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f5f1f8"><tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="max-width:600px;border:1px solid #e6ddec;border-radius:12px;">
<tr><td height="6" bgcolor="#e66a35" style="font-size:0;line-height:0;border-radius:12px 12px 0 0;">&nbsp;</td></tr>
<tr><td style="padding:28px 24px 20px;">
<p style="margin:0 0 14px;font-size:11px;line-height:16px;letter-spacing:2px;font-weight:bold;color:#80518d;">QUEER SUPPORT &nbsp;·&nbsp; APAIT</p>
<h1 style="margin:0 0 12px;font-size:27px;line-height:33px;color:#432752;">${escapeHtml(heading)}</h1>
<p style="margin:0;font-size:15px;line-height:23px;">${escapeHtml(explanation)}</p>
</td></tr>
<tr><td style="padding:0 24px 22px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f5f1f8" style="border-radius:8px;"><tr><td style="padding:16px 18px;font-size:14px;line-height:22px;">
<p style="margin:0 0 5px;font-weight:bold;color:#432752;">${escapeHtml(event.title)}</p>
<p style="margin:0;">${escapeHtml(eventTime(event.starts_at))}</p>
<p style="margin:0;white-space:pre-line;">${escapeHtml(event.location)}</p>
</td></tr></table>
</td></tr>
${
  reminders
    ? `<tr><td style="padding:0 24px 8px;">
<h2 style="margin:0 0 12px;font-size:18px;line-height:25px;color:#432752;">${escapeHtml(reminderParts[0])}</h2>
<p style="margin:0 0 14px;font-size:15px;line-height:23px;">${escapeHtml(reminderParts[1])}</p>
<ul style="margin:0;padding:0 0 0 20px;font-size:14px;line-height:22px;">${reminderParts
        .slice(2)
        .map(
          (part) =>
            `<li style="margin:0 0 12px;padding-left:3px;">${escapeHtml(part.replace(/^• /, ''))}</li>`,
        )
        .join('')}</ul>
</td></tr>`
    : ''
}
<tr><td style="padding:0 24px 24px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#653777" style="border-radius:6px;text-align:center;mso-padding-alt:14px 22px;">
<a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 22px;font-size:14px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;">${kind === 'opening' ? 'View opening &amp; manage RSVP' : 'Manage or remove your RSVP'}</a>
</td></tr></table>
<p style="margin:10px 0 0;font-size:12px;line-height:18px;color:#74657c;">Opening this link won’t remove your RSVP. You can review it first.</p>
</td></tr>
<tr><td style="padding:20px 24px 24px;border-top:1px solid #eee6f1;font-size:13px;line-height:20px;">
<p style="margin:0 0 4px;color:#8a3988;"><strong style="font-size:16px;">Rene Snow</strong> (She/Her)</p>
<p style="margin:0 0 12px;"><strong>Health Educator/Peer Support Specialist</strong><br>APAIT, a Division of Special Service for Groups</p>
<p style="margin:0;">Phone: <a href="tel:+17146361349;ext=204" style="color:#653777;">(714) 636 1349 ext: 204</a><br>Mobile: <a href="tel:+12134342948" style="color:#653777;">(213) 434 2948</a><br>email: <a href="mailto:renes@apaitssg.org" style="color:#653777;">renes@apaitssg.org</a></p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
  return {
    subject: `${event.title}: ${heading}`,
    replyTo: 'renes@apaitssg.org',
    html,
    text:
      [
        heading,
        explanation,
        `${event.title}\n${eventTime(event.starts_at)}\n${event.location}`,
        reminders,
        signature,
        `Manage or remove your RSVP:\n${link}`,
      ]
        .filter(Boolean)
        .join('\n\n') + '\n',
  };
}
