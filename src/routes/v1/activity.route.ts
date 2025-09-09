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
    upload.single('submissionImage'),
    validate(activityValidation.saveActivity),
    activityController.saveActivity
  )
  .get(
    auth(),
    validate(activityValidation.getActivityHistory),
    activityController.getActivityHistory
  );

export default router;
