import multer from 'multer';
import ApiError from '../utils/ApiError';
import httpStatus from 'http-status';

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image')) {
      cb(null, true);
    } else {
      cb(new ApiError(httpStatus.BAD_REQUEST, 'Hanya file gambar yang diizinkan!'));
    }
  },
  limits: {
    fileSize: 1024 * 1024 * 5 // Batas ukuran file 5MB
  }
});

export default upload;
