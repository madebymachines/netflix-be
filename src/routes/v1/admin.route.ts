import express from 'express';
import auth from '../../middlewares/auth';
import validate from '../../middlewares/validate';
import { adminValidation, userValidation } from '../../validations';
import { adminController } from '../../controllers';

const router = express.Router();

// Admin Authentication
router.post('/login', validate(adminValidation.adminLogin), adminController.adminLogin);

// User Management Routes (protected for admins)
router
  .route('/users')
  .post(auth('manageUsers'), validate(userValidation.createUser), adminController.createUser)
  .get(auth('getUsers'), validate(userValidation.getUsers), adminController.getUsers);

router
  .route('/users/:userId')
  .get(auth('getUsers'), validate(userValidation.getUser), adminController.getUser)
  .patch(auth('manageUsers'), validate(userValidation.updateUser), adminController.updateUser)
  .delete(auth('manageUsers'), validate(userValidation.deleteUser), adminController.deleteUser);

// Purchase Verification Management
router
  .route('/purchase-verifications')
  .get(
    auth('getUsers'),
    validate(userValidation.getPurchaseVerifications),
    adminController.getPurchaseVerifications
  );

router
  .route('/purchase-verifications/:verificationId/approve')
  .patch(
    auth('manageUsers'),
    validate(userValidation.approvePurchase),
    adminController.approvePurchase
  );

router
  .route('/purchase-verifications/:verificationId/reject')
  .patch(
    auth('manageUsers'),
    validate(userValidation.rejectPurchase),
    adminController.rejectPurchase
  );

export default router;
