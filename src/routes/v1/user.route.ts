import express from 'express';
import auth from '../../middlewares/auth';
import validate from '../../middlewares/validate';
import { userValidation } from '../../validations';
import { userController } from '../../controllers';
import upload from '../../middlewares/upload';

const router = express.Router();

router
  .route('/me')
  .get(auth(), userController.getMe)
  .put(auth(), validate(userValidation.updateMe), userController.updateMe);

router
  .route('/me/profile-picture')
  .post(
    auth(),
    upload.single('profilePicture'),
    validate(userValidation.updateProfilePicture),
    userController.updateProfilePicture
  )
  .delete(auth(), userController.deleteProfilePicture);

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

export default router;
