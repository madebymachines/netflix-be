import express from 'express';
import auth from '../../middlewares/auth';
import validate from '../../middlewares/validate';
import leaderboardController from '../../controllers/leaderboard.controller';
import leaderboardValidation from '../../validations/leaderboard.validation';

const router = express.Router();

// Public leaderboard
router.get(
  '/',
  validate(leaderboardValidation.getLeaderboard),
  leaderboardController.getLeaderboard
);

// Authenticated user's rank
router.get(
  '/me',
  auth(),
  validate(leaderboardValidation.getMyRank),
  leaderboardController.getMyRank
);

export default router;
