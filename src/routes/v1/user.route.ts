import express from 'express';
import auth from '../../middlewares/auth';
import validate from '../../middlewares/validate';
import { userValidation } from '../../validations';
import { userController } from '../../controllers';

const router = express.Router();

// Routes for the currently logged-in user
router
  .route('/me')
  .get(auth(), userController.getMe)
  .put(auth(), validate(userValidation.updateMe), userController.updateMe);

// Routes for purchase verification
router.route('/purchase-verification').post(auth(), userController.uploadPurchaseVerification);

router
  .route('/purchase-verification/status')
  .get(auth(), userController.getPurchaseVerificationStatus);

// Admin-only routes
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
