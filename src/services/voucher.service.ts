import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import logger from '../config/logger';

// Path ke file template voucher Anda di dalam direktori 'assets'
const VOUCHER_TEMPLATE_PATH = path.join(__dirname, '../assets/voucher-template.png');

/**
 * Menghasilkan gambar voucher dengan nama pengguna dinamis di atasnya.
 * @param username Nama pengguna yang akan ditempelkan di voucher.
 * @returns {Promise<Buffer>} Buffer dari gambar voucher yang sudah jadi (dalam format PNG).
 */
export const generateVoucher = async (username: string): Promise<Buffer> => {
  try {
    // Membaca file template voucher
    const templateBuffer = await fs.readFile(VOUCHER_TEMPLATE_PATH);

    // Dapatkan dimensi gambar template terlebih dahulu
    const metadata = await sharp(templateBuffer).metadata();
    const width = metadata.width;
    const height = metadata.height;

    if (!width || !height) {
      throw new Error('Could not read voucher template dimensions.');
    }

    // Membuat SVG dengan dimensi yang SAMA PERSIS seperti gambar template.
    // Teks diposisikan secara absolut di dalam SVG ini.
    // Nilai 'y' mungkin perlu sedikit disesuaikan untuk alignment vertikal yang sempurna.
    const svgText = `
      <svg width="${width}" height="${height}">
        <text
          x="110"
          y="172"
          font-size="40"
          font-family="calibri"
          fill="#000000"
          font-weight="bold"
        >
          ${username}
        </text>
      </svg>
    `;
    const svgBuffer = Buffer.from(svgText);

    // Menggunakan Sharp untuk menempelkan (composite) SVG di atas template.
    const finalVoucherBuffer = await sharp(templateBuffer)
      .composite([
        {
          input: svgBuffer,
          top: 0,
          left: 0
        }
      ])
      .png() // Mengonversi output akhir ke format PNG
      .toBuffer();

    return finalVoucherBuffer;
  } catch (error) {
    logger.error('Failed to generate voucher image:', error);
    // Jika gagal, lempar error agar proses di atasnya bisa menanganinya
    throw new Error('Could not generate voucher image.');
  }
};

// --- PERUBAHAN DIMULAI DI SINI ---
// Ekspor sebagai objek default agar konsisten
export default {
  generateVoucher
};
// --- PERUBAHAN SELESAI ---
