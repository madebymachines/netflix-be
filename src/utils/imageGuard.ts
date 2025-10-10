import fileType from 'file-type';
import sharp from 'sharp';
import ApiError from '../utils/ApiError';
import httpStatus from 'http-status';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Validasi magic-bytes lalu re-encode untuk sanitasi.
 * Mengembalikan { bufferBersih, mimeFinal, extFinal }
 */
export async function sanitizeImageOrThrow(buf: Buffer) {
  // Untuk file-type v16, gunakan fromBuffer
  const sig = await fileType.fromBuffer(buf);

  if (!sig || !ALLOWED_MIME.has(sig.mime)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Image type not supported.');
  }

  // batas dimensi untuk mencegah decompression bomb
  const img = sharp(buf, { limitInputPixels: 4096 * 4096 });
  let pipeline = img.rotate(); // auto-orient

  let mimeFinal = sig.mime;
  let extFinal = sig.ext;

  // Re-encode sesuai mime terdeteksi (atau paksa ke webp jika mau)
  if (sig.mime === 'image/jpeg') pipeline = pipeline.jpeg({ quality: 85 });
  else if (sig.mime === 'image/png') pipeline = pipeline.png({ compressionLevel: 9 });
  else if (sig.mime === 'image/webp') pipeline = pipeline.webp({ quality: 85 });
  else {
    // fallback paksa ke webp
    pipeline = pipeline.webp({ quality: 85 });
    mimeFinal = 'image/webp';
    extFinal = 'webp';
  }

  const bufferBersih = await pipeline.toBuffer();
  return { bufferBersih, mimeFinal, extFinal };
}
