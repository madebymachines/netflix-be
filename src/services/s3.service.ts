import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import config from '../config/config';
import logger from '../config/logger';

const s3Client = new S3Client({
  region: config.aws.s3.region,
  credentials: {
    accessKeyId: config.aws.s3.accessKeyId,
    secretAccessKey: config.aws.s3.secretAccessKey
  }
});

/**
 * Mengunggah file ke S3.
 * @param {Buffer} fileBuffer - Buffer file.
 * @param {string} originalName - Nama asli file.
 * @param {string} mimetype - Tipe MIME file.
 * @param {string} subFolder - Sub-folder di dalam bucket (misalnya, 'profile-pictures', 'receipts').
 * @returns {Promise<string>} URL file.
 */
const uploadFile = async (
  fileBuffer: Buffer,
  originalName: string,
  mimetype: string,
  subFolder: string // Diubah nama parameter dari 'folder' menjadi 'subFolder' agar lebih jelas
): Promise<string> => {
  // Ambil folder utama dari konfigurasi, jika tidak ada, gunakan string kosong.
  const baseFolder = config.aws.s3.baseFolder ? `${config.aws.s3.baseFolder}/` : '';

  // Gabungkan folder utama, sub-folder, dan nama file unik.
  const key = `${baseFolder}${subFolder}/${Date.now()}_${originalName.replace(/\s/g, '_')}`;

  const uploadParams = {
    Bucket: config.aws.s3.bucketName,
    Key: key,
    Body: fileBuffer,
    ContentType: mimetype
  };

  await s3Client.send(new PutObjectCommand(uploadParams));

  return `https://${config.aws.s3.bucketName}.s3.${config.aws.s3.region}.amazonaws.com/${key}`;
};

/**
 * Menghapus file dari S3 berdasarkan URL-nya.
 * @param {string | null | undefined} fileUrl - URL lengkap file yang akan dihapus.
 * @returns {Promise<void>}
 */
const deleteFileByUrl = async (fileUrl: string | null | undefined): Promise<void> => {
  if (!fileUrl) {
    logger.info('Tidak ada URL file yang diberikan untuk dihapus.');
    return;
  }

  try {
    const key = new URL(fileUrl).pathname.substring(1);
    if (!key) {
      logger.warn(`Tidak dapat mengekstrak key dari URL: ${fileUrl}`);
      return;
    }

    const deleteParams = {
      Bucket: config.aws.s3.bucketName,
      Key: key
    };

    await s3Client.send(new DeleteObjectCommand(deleteParams));
    logger.info(`Berhasil menghapus file dari S3: ${key}`);
  } catch (error) {
    logger.error(`Gagal menghapus file dari S3 dengan URL ${fileUrl}:`, error);
  }
};

export default {
  uploadFile,
  deleteFileByUrl
};
