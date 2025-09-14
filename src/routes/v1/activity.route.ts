import express from 'express';
import auth from '../../middlewares/auth';
import validate from '../../middlewares/validate';
import activityController from '../../controllers/activity.controller';
import activityValidation from '../../validations/activity.validation';
import upload from '../../middlewares/upload';

const router = express.Router();

router
  .route('/')
  .post(
    auth(),
    // activityLimiter, // Rate limiter dinonaktifkan untuk sementara
    upload.single('submissionImage'),
    validate(activityValidation.saveActivity),
    activityController.saveActivity
  )
  .get(
    auth(),
    validate(activityValidation.getActivityHistory),
    activityController.getActivityHistory
  );

router
  .route('/stats/weekly-workout')
  .get(
    auth(),
    validate(activityValidation.getWeeklyWorkoutStats),
    activityController.getWeeklyWorkoutStats
  );

export default router;
