import express from 'express';
import auth from '../../middlewares/auth';
import validate from '../../middlewares/validate';
import {
  adminValidation,
  userValidation,
  activityValidation,
  exportValidation
} from '../../validations';
import { adminController } from '../../controllers';

const router = express.Router();

// Admin Authentication
router.post('/login', validate(adminValidation.adminLogin), adminController.adminLogin);
router.post('/logout', adminController.logout);
router.post('/refresh-tokens', adminController.refreshTokens);

// Get current admin profile
router.get('/me', auth(), adminController.getMe);

// Export Data
router.post(
  '/export',
  auth('manageUsers'),
  validate(exportValidation.requestExport),
  adminController.requestExport
);

// Dashboard Stats
router.get('/stats', auth('getUsers'), adminController.getDashboardStats);
router.get('/stats/user-growth', auth('getUsers'), adminController.getUserGrowthChartData);

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

// User Details Route
router
  .route('/users/:userId/details')
  .get(auth('getUsers'), validate(userValidation.getUser), adminController.getUserDetails);

// User Activity History Route (Paginated)
router
  .route('/users/:userId/activity-history')
  .get(
    auth('getUsers'),
    validate(userValidation.getUserActivityHistory),
    adminController.getUserActivityHistory
  );

// Ban/Unban Routes
router
  .route('/users/:userId/ban')
  .patch(auth('manageUsers'), validate(userValidation.banUser), adminController.banUser);

router
  .route('/users/:userId/unban')
  .patch(auth('manageUsers'), validate(userValidation.unbanUser), adminController.unbanUser);

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

// Activity Submission Management
router
  .route('/activity-submissions')
  .get(
    auth('getUsers'),
    validate(activityValidation.getActivitySubmissions),
    adminController.getActivitySubmissions
  );

router
  .route('/activity-submissions/:activityId/approve')
  .patch(
    auth('manageUsers'),
    validate(activityValidation.approveActivitySubmission),
    adminController.approveActivitySubmission
  );

router
  .route('/activity-submissions/:activityId/reject')
  .patch(
    auth('manageUsers'),
    validate(activityValidation.rejectActivitySubmission),
    adminController.rejectActivitySubmission
  );

// Registration Settings
router
  .route('/settings/registration')
  .get(auth('manageUsers'), adminController.getRegistrationSettings)
  .put(
    auth('manageUsers'),
    validate(adminValidation.updateRegistrationSettings),
    adminController.updateRegistrationSettings
  );

export default router;
