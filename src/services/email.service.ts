import nodemailer from 'nodemailer';
import config from '../config/config';
import logger from '../config/logger';
import path from 'path';

const transport = nodemailer.createTransport(config.email.smtp);
/* istanbul ignore next */
if (config.env !== 'test') {
  transport
    .verify()
    .then(() => logger.info('Connected to email server'))
    .catch(() =>
      logger.warn(
        'Unable to connect to email server. Make sure you have configured the SMTP options in .env'
      )
    );
}

// Helper untuk membuat template email HTML dasar
const createHtmlTemplate = (content: string, preheaderText: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Notification</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #111111;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';
        }
        .container {
            width: 100%;
            max-width: 600px;
            margin: 0 auto;
            padding: 40px 20px;
            color: #ffffff;
        }
        .logo {
            display: block;
            margin: 0 auto 40px auto;
            width: 200px;
        }
        .content-box {
            border: 1px solid #444444;
            border-radius: 12px;
            padding: 30px;
            text-align: left;
            line-height: 1.6;
        }
        p {
            margin: 0 0 1em 0;
            font-size: 16px;
        }
        .otp-box {
            border: 1px solid #444444;
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
            font-size: 40px;
            font-weight: bold;
            letter-spacing: 10px;
        }
        .link {
            color: #3498db;
            text-decoration: none;
            word-break: break-all;
        }
        .preheader {
            display: none !important;
            visibility: hidden;
            opacity: 0;
            color: transparent;
            height: 0;
            width: 0;
        }
    </style>
</head>
<body style="background-color: #111111; background-image: url('cid:background'); background-size: cover; background-position: center; background-repeat: no-repeat;">
    <!-- Preheader Text -->
    <span class="preheader">${preheaderText}</span>
    <div class="container">
        <img src="cid:logo" alt="Logo" class="logo" style="width: 200px;">
        <div class="content-box">
            ${content}
        </div>
    </div>
</body>
</html>
`;

/**
 * Send an email
 * @param {string} to
 * @param {string} subject
 * @param {string} html
 * @returns {Promise}
 */
const sendEmail = async (to: string, subject: string, html: string) => {
  const msg = {
    from: `"${config.email.fromName || 'Netflix Physical Asia'}" <${config.email.from}>`,
    to,
    subject,
    html,
    attachments: [
      {
        filename: 'logo.png',
        path: path.join(__dirname, '../assets/logo.png'),
        cid: 'logo'
      },
      {
        filename: 'bg-email.png',
        path: path.join(__dirname, '../assets/bg-email.png'),
        cid: 'background'
      }
    ]
  };
  if (config.email.mock) {
    logger.info(`MOCK EMAIL: To: ${to}, Subject: ${subject}`);
    return;
  }
  await transport.sendMail(msg);
};

/**
 * Send reset password email
 * @param {string} to
 * @param {string} name
 * @param {string} token
 * @returns {Promise}
 */
const sendResetPasswordEmail = async (to: string, name: string, token: string) => {
  const subject = 'Reset Your Password';
  const preheaderText = `Hi ${name}, We've received a request to reset the password for your account.`;
  const resetPasswordUrl = `${config.feUrl}/reset-password?token=${token}`;

  const content = `
    <p>Hi ${name},</p>
    <p>We've received a request to reset the password for your account.</p>
    <p>To reset your password, please click on the following link:</p>
    <p><a href="${resetPasswordUrl}" class="link">${resetPasswordUrl}</a></p>
    <p>This link is valid for 24 hours. If you don't reset your password within this time, you'll need to submit another request.</p>
    <p>If you did not request this reset, please ignore this email. Your password will remain unchanged.</p>
    <p>Thank you.</p>
  `;

  const html = createHtmlTemplate(content, preheaderText);
  await sendEmail(to, subject, html);
};

/**
 * Send verification email
 * @param {string} to
 * @param {string} token (OTP)
 * @returns {Promise}
 */
const sendVerificationEmail = async (to: string, token: string) => {
  const subject = 'Your One-Time Password (OTP)';
  const preheaderText = `Hello there, Please use the following One-Time Password (OTP) to complete your session.`;

  const content = `
    <p>Hello there,</p>
    <p>Please use the following One-Time Password (OTP) to complete your session. Do not share this code with anyone.</p>
    <div class="otp-box">${token.split('').join(' ')}</div>
    <p>This code is valid for the next ${config.jwt.verifyEmailExpirationMinutes} minutes.</p>
    <p>Thank you.</p>
  `;

  const html = createHtmlTemplate(content, preheaderText);
  await sendEmail(to, subject, html);
};

/**
 * Send purchase rejection email
 * @param {string} to
 * @param {string} name
 * @param {string} [reason]
 * @returns {Promise}
 */
const sendPurchaseRejectionEmail = async (to: string, name: string, reason?: string) => {
  const subject = 'Update on Your Purchase Verification';
  const preheaderText = `Hello there, We have reviewed the receipt/proof of purchase you previously submitted.`;

  const reasonMessage = reason
    ? `We apologize, but the document has not been verified for the following reason: ${reason}. Please log back into your account and re-upload with your valid receipt and ensure the image quality is clear.`
    : 'We apologize, but the document has not been verified. Please log back into your account and re-upload with your valid receipt and ensure the image quality is clear.';

  const content = `
    <p>Hello there,</p>
    <p>We have reviewed the receipt/proof of purchase for the 100 Plus Drink you previously submitted. ${reasonMessage}</p>
    <p>Thank you.</p>
  `;

  const html = createHtmlTemplate(content, preheaderText);
  await sendEmail(to, subject, html);
};

export default {
  transport,
  sendEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
  sendPurchaseRejectionEmail
};
