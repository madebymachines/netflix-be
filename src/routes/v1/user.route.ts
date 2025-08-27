import express from 'express';
import auth from '../../middlewares/auth';
import validate from '../../middlewares/validate';
import { userValidation } from '../../validations';
import { userController } from '../../controllers';
import upload from '../../middlewares/upload'; // Impor middleware upload

const router = express.Router();

// Rute untuk pengguna yang sedang login
router
  .route('/me')
  .get(auth(), userController.getMe)
  // Gunakan middleware upload.single('profilePicture')
  .put(
    auth(),
    upload.single('profilePicture'),
    validate(userValidation.updateMe),
    userController.updateMe
  );

// Rute untuk verifikasi pembelian
// Gunakan middleware upload.single('receiptImage')
router
  .route('/purchase-verification')
  .post(
    auth(),
    upload.single('receiptImage'),
    validate(userValidation.uploadPurchaseVerification),
    userController.uploadPurchaseVerification
  );

router
  .route('/purchase-verification/status')
  .get(auth(), userController.getPurchaseVerificationStatus);

// Rute khusus admin
router
  .route('/')
  .post(auth('manageUsers'), validate(userValidation.createUser), userController.createUser)
  .get(auth('getUsers'), validate(userValidation.getUsers), userController.getUsers);

router
  .route('/:userId')
  .get(auth('getUsers'), validate(userValidation.getUser), userController.getUser)
  .patch(auth('manageUsers'), validate(userValidation.updateUser), userController.updateUser)
  .delete(auth('manageUsers'), validate(userValidation.deleteUser), userController.deleteUser);

export default router;
