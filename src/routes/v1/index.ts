import express from 'express';
import authRoute from './auth.route';
import userRoute from './user.route';
import docsRoute from './docs.route';
import activityRoute from './activity.route'; // New
import leaderboardRoute from './leaderboard.route'; // New
import config from '../../config/config';

const router = express.Router();

const defaultRoutes = [
  {
    path: '/auth',
    route: authRoute
  },
  {
    path: '/user', // Corrected path from /users to /user to match spec
    route: userRoute
  },
  {
    path: '/activities', // New
    route: activityRoute
  },
  {
    path: '/leaderboard', // New
    route: leaderboardRoute
  }
];

const devRoutes = [
  // routes available only in development mode
  {
    path: '/docs',
    route: docsRoute
  }
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

/* istanbul ignore next */
if (config.env === 'development') {
  devRoutes.forEach((route) => {
    router.use(route.path, route.route);
  });
}

export default router;
