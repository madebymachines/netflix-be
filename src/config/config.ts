import dotenv from 'dotenv';
import path from 'path';
import Joi from 'joi';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const envVarsSchema = Joi.object()
  .keys({
    APP_ENV: Joi.string().valid('production', 'development', 'test').required(),
    PORT: Joi.number().default(3000),
    CORS_ORIGIN: Joi.string().required().description('URL for CORS'),
    FE_URL: Joi.string().required().description('URL for Frontend App'),
    JWT_SECRET: Joi.string().required().description('JWT secret key'),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number()
      .default(30)
      .description('minutes after which access tokens expire'),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number()
      .default(30)
      .description('days after which refresh tokens expire'),
    JWT_RESET_PASSWORD_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description('minutes after which reset password token expires'),
    JWT_VERIFY_EMAIL_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description('minutes after which verify email token expires'),
    SMTP_HOST: Joi.string().description('server that will send the emails'),
    SMTP_PORT: Joi.number().description('port to connect to the email server'),
    SMTP_USERNAME: Joi.string().description('username for email server'),
    SMTP_PASSWORD: Joi.string().description('password for email server'),
    EMAIL_FROM: Joi.string().description('the from field in the emails sent by the app'),
    EMAIL_FROM_NAME: Joi.string().description('the from name in the emails sent by the app'),
    MOCK_EMAIL: Joi.boolean().default(false).description('mock email for development'),
    // Konfigurasi AWS S3
    AWS_S3_BUCKET_NAME: Joi.string().required().description('AWS S3 bucket name'),
    AWS_S3_REGION: Joi.string().required().description('AWS S3 region'),
    AWS_ACCESS_KEY_ID: Joi.string().required().description('AWS access key ID'),
    AWS_SECRET_ACCESS_KEY: Joi.string().required().description('AWS secret access key'),
    AWS_S3_BASE_FOLDER: Joi.string().default('').description('Base folder in S3 bucket')
  })
  .unknown();

const { value: envVars, error } = envVarsSchema
  .prefs({ errors: { label: 'key' } })
  .validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export default {
  env: envVars.APP_ENV,
  port: envVars.PORT,
  feUrl: envVars.FE_URL,
  cors: {
    origin: envVars.CORS_ORIGIN === '*' ? true : envVars.CORS_ORIGIN
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
    refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
    resetPasswordExpirationMinutes: envVars.JWT_RESET_PASSWORD_EXPIRATION_MINUTES,
    verifyEmailExpirationMinutes: envVars.JWT_VERIFY_EMAIL_EXPIRATION_MINUTES
  },
  email: {
    smtp: {
      host: envVars.SMTP_HOST,
      port: envVars.SMTP_PORT,
      auth: {
        user: envVars.SMTP_USERNAME,
        pass: envVars.SMTP_PASSWORD
      }
    },
    from: envVars.EMAIL_FROM,
    fromName: envVars.EMAIL_FROM_NAME,
    mock: envVars.MOCK_EMAIL
  },
  aws: {
    s3: {
      bucketName: envVars.AWS_S3_BUCKET_NAME,
      region: envVars.AWS_S3_REGION,
      accessKeyId: envVars.AWS_ACCESS_KEY_ID,
      secretAccessKey: envVars.AWS_SECRET_ACCESS_KEY,
      baseFolder: envVars.AWS_S3_BASE_FOLDER
    }
  }
};
