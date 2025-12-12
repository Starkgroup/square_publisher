import nodemailer from 'nodemailer';
import config from '../config/index.js';

let transporter = null;

/**
 * Initialize nodemailer transporter
 */
function getTransporter() {
  if (transporter) {
    return transporter;
  }

  if (!config.email.host || !config.email.user) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.port === 465,
    auth: {
      user: config.email.user,
      pass: config.email.password,
    },
    tls: {
      rejectUnauthorized: config.email.useTls,
    },
    connectionTimeout: config.email.timeout * 1000,
  });

  return transporter;
}

/**
 * Send magic link email
 * @param {object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.link - Magic link URL
 * @param {number} options.expiresInMinutes - Link expiration time
 * @returns {Promise<boolean>} True if sent successfully
 */
export async function sendMagicLinkEmail({ to, link, expiresInMinutes }) {
  const transport = getTransporter();

  if (!transport) {
    console.warn('Email not configured, magic link:', link);
    return false;
  }

  const fromName = config.email.fromName;
  const fromEmail = config.email.user;

  const subject = 'Your login link';
  const text = `
Hello,

You requested a login link. Click the link below to sign in:

${link}

This link will expire in ${expiresInMinutes} minutes.

If you did not request this link, you can safely ignore this email.

Best regards,
${fromName}
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; }
    .footer { margin-top: 30px; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Login Link</h2>
    <p>Hello,</p>
    <p>You requested a login link. Click the button below to sign in:</p>
    <p style="margin: 30px 0;">
      <a href="${link}" class="button">Sign In</a>
    </p>
    <p>Or copy this link:</p>
    <p style="word-break: break-all; color: #2563eb;">${link}</p>
    <p>This link will expire in <strong>${expiresInMinutes} minutes</strong>.</p>
    <div class="footer">
      <p>If you did not request this link, you can safely ignore this email.</p>
      <p>Best regards,<br>${fromName}</p>
    </div>
  </div>
</body>
</html>
`.trim();

  try {
    await transport.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text,
      html,
    });
    return true;
  } catch (err) {
    console.error('Failed to send magic link email:', err.message);
    return false;
  }
}

/**
 * Send moderation rejection email to admin
 * @param {object} options
 * @param {string} options.postId - Post ID
 * @param {string} options.postText - Post text (truncated)
 * @param {string} options.userEmail - User who submitted the post
 * @param {string} options.reason - Rejection reason from LLM
 * @returns {Promise<boolean>} True if sent successfully
 */
export async function sendModerationRejectionEmail({ postId, postText, userEmail, reason }) {
  const transport = getTransporter();

  if (!transport) {
    console.warn('Email not configured, moderation rejection not sent for post:', postId);
    return false;
  }

  const fromName = config.email.fromName;
  const fromEmail = config.email.user;
  const adminEmail = config.auth?.adminUser || fromEmail;

  const subject = `[Moderation] Post #${postId} abgelehnt`;
  const truncatedText = postText.length > 500 ? postText.slice(0, 500) + '...' : postText;

  const text = `
Automatische Moderation hat einen Post abgelehnt.

Post ID: #${postId}
Benutzer: ${userEmail}
Grund: ${reason}

Post-Text:
${truncatedText}

---
Square Publisher - Automatische Moderation
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .alert { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .alert-title { color: #dc2626; font-weight: 600; margin: 0 0 8px 0; }
    .meta { background: #f3f4f6; padding: 12px; border-radius: 6px; margin: 16px 0; }
    .meta-row { display: flex; margin-bottom: 4px; }
    .meta-label { font-weight: 500; width: 80px; }
    .post-text { background: #fff; border: 1px solid #e5e7eb; padding: 12px; border-radius: 6px; white-space: pre-wrap; }
    .footer { margin-top: 30px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="alert">
      <h2 class="alert-title">⚠️ Post abgelehnt</h2>
      <p style="margin: 0;">Die automatische Moderation hat einen Post als ungeeignet markiert.</p>
    </div>
    
    <div class="meta">
      <div class="meta-row"><span class="meta-label">Post ID:</span> #${postId}</div>
      <div class="meta-row"><span class="meta-label">Benutzer:</span> ${userEmail}</div>
      <div class="meta-row"><span class="meta-label">Grund:</span> ${reason}</div>
    </div>
    
    <h3>Post-Text:</h3>
    <div class="post-text">${truncatedText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    
    <div class="footer">
      <p>Square Publisher - Automatische Moderation</p>
    </div>
  </div>
</body>
</html>
`.trim();

  try {
    await transport.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: adminEmail,
      subject,
      text,
      html,
    });
    return true;
  } catch (err) {
    console.error('Failed to send moderation rejection email:', err.message);
    return false;
  }
}

/**
 * Verify email configuration is working
 * @returns {Promise<boolean>}
 */
export async function verifyEmailConfig() {
  const transport = getTransporter();
  if (!transport) {
    return false;
  }

  try {
    await transport.verify();
    return true;
  } catch (err) {
    console.error('Email configuration verification failed:', err.message);
    return false;
  }
}
