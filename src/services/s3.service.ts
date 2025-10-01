import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/config';
import logger from '../config/logger';

const s3Client = new S3Client({
  region: config.aws.s3.region,
  credentials: {
    accessKeyId: config.aws.s3.accessKeyId,
    secretAccessKey: config.aws.s3.secretAccessKey
  }
});

const baseFolder = config.aws.s3.baseFolder ? `${config.aws.s3.baseFolder}/` : '';

async function uploadPrivateFile(
  fileBuffer: Buffer,
  ext: string,
  contentType: string,
  subFolder: string
) {
  const key = `${baseFolder}${subFolder}/${uuidv4()}.${ext}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: config.aws.s3.bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
      // Simpan PRIVATE (default). Jangan ACL public-read.
      // Server-side encryption opsional:
      ServerSideEncryption: 'AES256',
      // Tagging bisa dipakai untuk workflow AV (pending-scan=true)
      Tagging: 'scan=pending'
    })
  );

  // jangan return URL publik
  return { key };
}

async function deleteByUrl(fileUrl?: string | null) {
  if (!fileUrl) return;
  try {
    const key = new URL(fileUrl).pathname.substring(1);
    if (!key) return;
    await s3Client.send(new DeleteObjectCommand({ Bucket: config.aws.s3.bucketName, Key: key }));
    logger.info(`Deleted S3 object: ${key}`);
  } catch (e) {
    logger.error('Delete S3 failed', e);
  }
}

// Presigned URL (mis. 10 menit)
async function getPresignedUrl(key: string, expiresInSec = 600) {
  const cmd = new GetObjectCommand({ Bucket: config.aws.s3.bucketName, Key: key });
  return getSignedUrl(s3Client, cmd, { expiresIn: expiresInSec });
}

export default { uploadPrivateFile, deleteByUrl, getPresignedUrl };
