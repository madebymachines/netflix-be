import nodemailer from 'nodemailer';
import config from '../config/config';
import logger from '../config/logger';
import path from 'path';
import fs from 'fs/promises';

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

const createHtmlTemplate = (
  content: string,
  preheaderText: string,
  logoUrl: string,
  backgroundUrl: string
) => `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="x-apple-disable-message-reformatting">
    <title>Notification</title>
    <!--[if mso]>
    <noscript>
    <xml>
        <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
    </xml>
    </noscript>
    <![endif]-->
    <style>
        html, body {
            margin: 0 auto !important;
            padding: 0 !important;
            height: 100% !important;
            width: 100% !important;
            background: #000000;
        }
        .container {
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
            background-color: rgba(0, 0, 0, 0.5); /* Semi-transparent background for better readability */
        }
        p {
            margin: 0 0 1em 0;
            font-size: 16px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #ffffff;
        }
        .otp-box {
            border: 1px solid #444444;
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
            font-size: 24px;
            font-weight: bold;
            letter-spacing: 1px;
        }
        .link {
            color: #3498db;
            text-decoration: none;
            word-break: break-all;
        }
        .button {
            display: inline-block;
            background-color: #3498db;
            color: #ffffff;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
        }
        .preheader {
            display: none !important;
            visibility: hidden;
            opacity: 0;
            color: transparent;
            height: 0;
            width: 0;
        }
        .voucher-image {
            max-width: 100%;
            height: auto;
            margin-top: 20px;
            border-radius: 8px;
        }
        .tnc-image {
            max-width: 100%;
            height: auto;
            margin-top: 8px;
        }
    </style>
</head>
<body width="100%" style="margin: 0; padding: 0 !important; mso-line-height-rule: exactly; background-color: #000000;">
    <span class="preheader">${preheaderText}</span>

    <!--[if gte mso 9]>
    <v:background xmlns:v="urn:schemas-microsoft-com:vml" fill="t">
        <v:fill type="tile" src="${backgroundUrl}" color="#000000"/>
    </v:background>
    <![endif]-->

    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td
                valign="top"
                style="background: #000000 url('${backgroundUrl}'); background-position: center center !important; background-size: cover !important;"
            >
                <!--[if gte mso 9]>
                <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="600" align="center">
                <tr>
                <td>
                <![endif]-->

                <div class="container">
                    <img src="${logoUrl}" alt="Logo" class="logo" style="width: 200px;">
                    <div class="content-box">
                        ${content}
                    </div>
                </div>

                <!--[if gte mso 9]>
                </td>
                </tr>
                </table>
                <![endif]-->
            </td>
        </tr>
    </table>
</body>
</html>
`;

/**
 * Send an email
 * @param {string} to
 * @param {string} subject
 * @param {string} htmlContent - The main content of the email, not the full template
 * @param {string} preheaderText
 * @param {Array<object>} attachments - Lampiran file
 * @returns {Promise}
 */
const sendEmail = async (
  to: string | string[],
  subject: string,
  htmlContent: string,
  preheaderText: string,
  attachments: any[] = []
) => {
  const LOGO_URL =
    'https://res.cloudinary.com/dpemrylwq/image/upload/v1760606407/netflix-100/logo_zzes2x.png';
  const BACKGROUND_URL =
    'https://res.cloudinary.com/dpemrylwq/image/upload/v1760606407/netflix-100/bg-email_cuwcza.png';

  const fullHtml = createHtmlTemplate(htmlContent, preheaderText, LOGO_URL, BACKGROUND_URL);

  const msg = {
    from: `"${config.email.fromName || 'Netflix Physical Asia'}" <${config.email.from}>`,
    to,
    subject,
    html: fullHtml,
    attachments: attachments
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
const sendResetPasswordOtpEmail = async (to: string, name: string, otp: string) => {
  const subject = 'Your Password Reset OTP';
  const preheaderText = `Hi ${name}, use the OTP below to reset your password.`;
  const content = `
    <p>Hi ${name},</p>
    <p>Please use the following One-Time Password (OTP) to reset your password. Do not share this code with anyone.</p>
    <div class="otp-box">${otp.split('').join(' ')}</div>
    <p>This code is valid for the next 10 minutes.</p>
    <p>If you did not request this, you can ignore this email.</p>
  `;
  await sendEmail(to, subject, content, preheaderText);
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

  await sendEmail(to, subject, content, preheaderText);
};

/**
 * Send purchase approval email
 * @param {string} to
 * @param {string} name
 * @param {Buffer} [voucherBuffer] - Buffer gambar voucher opsional
 * @returns {Promise}
 */
const sendPurchaseApprovalEmail = async (to: string, name: string, voucherBuffer?: Buffer) => {
  const subject = 'Congrats! You’ve Got 3 Days Gym Pass: Your Purchase Has Been Verified';
  const preheaderText = `Hi ${name}, great news! Your purchase verification has been successfully approved.`;

  let voucherBlock = '';
  const cidAttachments = [];

  if (voucherBuffer) {
    cidAttachments.push({
      filename: 'voucher.png',
      content: voucherBuffer,
      cid: 'voucherImage'
    });

    try {
      const tncBuffer = await fs.readFile(path.join(__dirname, '../assets/voucher-tnc.png'));
      cidAttachments.push({
        filename: 'voucher-tnc.png',
        content: tncBuffer,
        cid: 'voucherTncImage'
      });
      voucherBlock = `
        <img src="cid:voucherImage" alt="Your Gym Pass Voucher" class="voucher-image">
        <img src="cid:voucherTncImage" alt="Voucher Terms and Conditions" class="tnc-image">
      `;
    } catch (error) {
      logger.error('Could not read voucher-tnc.png asset. T&C image will be skipped.', error);
      voucherBlock = `<img src="cid:voucherImage" alt="Your Gym Pass Voucher" class="voucher-image">`;
    }
  }

  const content = `
    <p>Hi ${name},</p>
    <p>Great news! We have reviewed the receipt/proof of purchase you submitted, and we're happy to inform you that it has been <strong>approved</strong>.</p>
    <p>You can now fully participate in all activities and start earning points.</p>
    <p>Thank you for your participation!</p>
    ${voucherBlock}
  `;

  await sendEmail(to, subject, content, preheaderText, cidAttachments);
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
  await sendEmail(to, subject, content, preheaderText);
};

/**
 * Send export ready email
 * @param {string} to
 * @param {string} name
 * @param {string} downloadUrl
 * @returns {Promise}
 */
const sendExportReadyEmail = async (to: string, name: string, downloadUrl: string) => {
  const subject = 'Your Data Export is Ready';
  const preheaderText = `Hi ${name}, the data export you requested is complete and ready for download.`;

  const content = `
    <p>Hi ${name},</p>
    <p>The data export you requested is complete. You can download the file using the button below.</p>
    <p style="text-align: center; margin: 30px 0;">
      <a href="${downloadUrl}" class="button">Download File</a>
    </p>
    <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
    <p><a href="${downloadUrl}" class="link">${downloadUrl}</a></p>
    <p>Thank you.</p>
  `;
  await sendEmail(to, subject, content, preheaderText);
};

/**
 * Send weekly winner report email with CSV attachment
 * @param to - Array of recipient emails
 * @param weekNumber - The week number for the report
 * @param csvBuffer - The CSV file content as a Buffer
 * @returns {Promise}
 */
const sendWinnerReportEmail = async (to: string[], weekNumber: number, csvBuffer: Buffer) => {
  const subject = `Weekly Winners Report - Week ${weekNumber}`;
  const preheaderText = `Attached is the weekly winners report for week ${weekNumber}.`;
  const content = `
    <p>Hello Team,</p>
    <p>Please find the attached CSV file for the weekly winners of week ${weekNumber}.</p>
    <p>Thank you.</p>
  `;

  const attachments = [
    {
      filename: `weekly_winners_week_${weekNumber}.csv`,
      content: csvBuffer,
      contentType: 'text/csv'
    }
  ];

  await sendEmail(to, subject, content, preheaderText, attachments);
};

export default {
  transport,
  sendEmail,
  sendResetPasswordOtpEmail,
  sendVerificationEmail,
  sendPurchaseApprovalEmail,
  sendPurchaseRejectionEmail,
  sendExportReadyEmail,
  sendWinnerReportEmail
};
