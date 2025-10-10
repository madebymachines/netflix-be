import httpStatus from 'http-status';
import path from 'path';
import fs from 'fs/promises';
import catchAsync from '../utils/catchAsync';
import { voucherService } from '../services';

const generateTestVoucher = catchAsync(async (req, res) => {
  // Ambil username dari query parameter
  const { username } = req.query as { username: string };

  // Panggil service yang sudah ada untuk membuat gambar voucher
  const voucherBuffer = await voucherService.generateVoucher(username);

  // Tentukan path ke direktori temporary
  const tempDir = path.join(process.cwd(), 'temp_vouchers');

  // Buat direktori jika belum ada
  await fs.mkdir(tempDir, { recursive: true });

  // Buat nama file yang unik untuk menghindari penimpaan file
  const sanitizedUsername = username.replace(/[^a-zA-Z0-9]/g, '_'); // Ganti karakter non-alfanumerik
  const fileName = `voucher_${sanitizedUsername}_${Date.now()}.png`;
  const filePath = path.join(tempDir, fileName);

  // Tulis buffer gambar ke dalam file
  await fs.writeFile(filePath, voucherBuffer);

  // Kirim respons sukses beserta path ke file yang baru dibuat
  res.status(httpStatus.OK).send({
    message: 'Test voucher generated successfully.',
    note: 'File saved locally on the server.',
    filePath: filePath // Path absolut di server
  });
});

export default {
  generateTestVoucher
};
