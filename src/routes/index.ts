import { Router } from 'express';
import authRoutes from './auth';
import whatsappRoutes from './whatsapp';
import paymentRoutes from './payments';
import kycRoutes from './kyc';
import adminRoutes from './admin';
import twoFactorRoutes from './twofactor';
import referralRoutes from './referrals';
import userRoutes from './users';
import walletRoutes from './wallets';
import tipRoutes from './tips';
import notificationRoutes from './notifications';
import analyticsRoutes from './analytics';

const router = Router();

// Mount route modules
router.use('/auth', authRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/payments', paymentRoutes);
router.use('/kyc', kycRoutes);
router.use('/admin', adminRoutes);
router.use('/twofactor', twoFactorRoutes);
router.use('/referrals', referralRoutes);
router.use('/users', userRoutes);
router.use('/wallets', walletRoutes);
router.use('/tips', tipRoutes);
router.use('/notifications', notificationRoutes);
router.use('/analytics', analyticsRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  console.log('Health check endpoint called');
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API info endpoint
router.get('/', (req, res) => {
  console.log('API root endpoint called');
  res.json({
    success: true,
    message: 'Givta API',
    version: '1.0.0',
    documentation: '/api/docs', // TODO: Add API documentation
    endpoints: {
      auth: '/auth',
      users: '/users',
      wallets: '/wallets',
      tips: '/tips',
      referrals: '/referrals',
      notifications: '/notifications'
    }
  });
});

export default router;
