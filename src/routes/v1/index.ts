import express from 'express';
import authRoute from './auth.route';
import userRoute from './user.route';
import adminRoute from './admin.route'; // New
import docsRoute from './docs.route';
import activityRoute from './activity.route';
import leaderboardRoute from './leaderboard.route';
import config from '../../config/config';

const router = express.Router();

const defaultRoutes = [
  {
    path: '/auth',
    route: authRoute
  },
  {
    path: '/user',
    route: userRoute
  },
  {
    path: '/admin', // New
    route: adminRoute
  },
  {
    path: '/activities',
    route: activityRoute
  },
  {
    path: '/leaderboard',
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
