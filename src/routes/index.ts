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

// Profile endpoints (direct access)
router.get('/profile', async (req, res) => {
  // Import and use the profile handler from user routes
  const { collections } = await import('../config/firebase');
  const { AuthMiddleware } = await import('../middleware/auth/AuthMiddleware');

  // Check authentication
  await new Promise((resolve, reject) => {
    AuthMiddleware.authenticate(req, res, (err) => {
      if (err) reject(err);
      else resolve(undefined);
    });
  });

  const userId = req.user!.id;

  const userDoc = await collections.users.doc(userId).get();
  if (!userDoc.exists) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  const userData = userDoc.data();
  const profile = {
    id: userDoc.id,
    email: userData!.email,
    displayName: userData!.displayName,
    phoneNumber: userData!.phoneNumber,
    photoURL: userData!.photoURL,
    createdAt: userData!.createdAt,
    updatedAt: userData!.updatedAt,
    isActive: userData!.isActive,
    emailVerified: userData!.emailVerified,
    kycStatus: userData!.kycStatus,
    referralCode: userData!.referralCode
  };

  res.json({
    success: true,
    data: profile
  });
});

router.put('/profile', async (req, res) => {
  // Import and use the profile update handler from user routes
  const { collections } = await import('../config/firebase');
  const { AuthMiddleware } = await import('../middleware/auth/AuthMiddleware');

  // Check authentication
  await new Promise((resolve, reject) => {
    AuthMiddleware.authenticate(req, res, (err) => {
      if (err) reject(err);
      else resolve(undefined);
    });
  });

  const userId = req.user!.id;
  const updates = req.body;

  // Validate allowed fields
  const allowedFields = ['displayName', 'phoneNumber', 'photoURL'];
  const filteredUpdates: any = {};

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      filteredUpdates[field] = updates[field];
    }
  }

  if (Object.keys(filteredUpdates).length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No valid fields to update'
    });
  }

  // Add updated timestamp
  filteredUpdates.updatedAt = new Date();

  // Update user profile
  await collections.users.doc(userId).update(filteredUpdates);

  // Get updated profile
  const userDoc = await collections.users.doc(userId).get();
  const userData = userDoc.data();

  const profile = {
    id: userDoc.id,
    email: userData!.email,
    displayName: userData!.displayName,
    phoneNumber: userData!.phoneNumber,
    photoURL: userData!.photoURL,
    createdAt: userData!.createdAt,
    updatedAt: userData!.updatedAt,
    isActive: userData!.isActive,
    emailVerified: userData!.emailVerified,
    kycStatus: userData!.kycStatus,
    referralCode: userData!.referralCode
  };

  res.json({
    success: true,
    data: profile,
    message: 'Profile updated successfully'
  });
});

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
