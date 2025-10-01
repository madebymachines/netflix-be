import multer from 'multer';
import ApiError from '../utils/ApiError';
import httpStatus from 'http-status';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    // Hanya terima *sementara*; validasi signature dilakukan di controller
    if (!file.mimetype.startsWith('image/')) {
      return cb(new ApiError(httpStatus.BAD_REQUEST, 'Hanya file gambar yang diizinkan!'));
    }
    cb(null, true);
  }
});

export default upload;
