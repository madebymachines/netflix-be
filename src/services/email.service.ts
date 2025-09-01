import nodemailer from 'nodemailer';
import config from '../config/config';
import logger from '../config/logger';

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

/**
 * Send an email
 * @param {string} to
 * @param {string} subject
 * @param {string} text
 * @returns {Promise}
 */
const sendEmail = async (to: string, subject: string, text: string) => {
  const msg = { from: config.email.from, to, subject, text };
  if (config.email.mock) {
    logger.info(`MOCK EMAIL: To: ${to}, Subject: ${subject}, Text: ${text}`);
    return;
  }
  await transport.sendMail(msg);
};

/**
 * Send reset password email
 * @param {string} to
 * @param {string} token
 * @returns {Promise}
 */
const sendResetPasswordEmail = async (to: string, token: string) => {
  const subject = 'Reset password';
  const resetPasswordUrl = `${config.feUrl}/reset-password?token=${token}`;
  const text = `Dear user,
To reset your password, click on this link: ${resetPasswordUrl}
If you did not request any password resets, then ignore this email.`;
  await sendEmail(to, subject, text);
};

/**
 * Send verification email
 * @param {string} to
 * @param {string} token
 * @returns {Promise}
 */
const sendVerificationEmail = async (to: string, token: string) => {
  const subject = 'Email Verification';
  const text = `Dear user,
Your One-Time Password (OTP) for email verification is: ${token}
This OTP is valid for ${config.jwt.verifyEmailExpirationMinutes} minutes.
If you did not request this, please ignore this email.`;
  await sendEmail(to, subject, text);
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
  const reasonText = reason
    ? `Reason for rejection: ${reason}`
    : 'Our team has reviewed your submission and, unfortunately, it could not be approved at this time.';
  const text = `Hi ${name},\n\nWe're writing to inform you about the status of your recent purchase verification submission.\n\n${reasonText}\n\nYou may try submitting your verification again with the correct details.\n\nThank you,\nThe Team`;
  await sendEmail(to, subject, text);
};

export default {
  transport,
  sendEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
  sendPurchaseRejectionEmail
};
