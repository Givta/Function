import { Router } from 'express';
import { AuthMiddleware } from '../middleware/auth/AuthMiddleware';
import { AuthService } from '../services/auth/AuthService';
import { UserModel } from '../models';
import { collections } from '../config/firebase';

const router = Router();

// Apply authentication to all routes
router.use(AuthMiddleware.authenticate);

/**
 * Get user profile
 * GET /api/users/profile
 */
router.get('/profile', async (req, res) => {
  try {
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
  } catch (error: any) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user profile'
    });
  }
});

/**
 * Update user profile
 * PUT /api/users/profile
 */
router.put('/profile', async (req, res) => {
  try {
    const userId = req.user!.id;
    const updates = req.body;

    // Validate allowed fields (users can update basic profile info)
    const allowedFields = ['displayName', 'phoneNumber', 'photoURL'];
    const filteredUpdates: any = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    }

    // Validate phone number if being updated
    if (updates.phoneNumber) {
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(updates.phoneNumber.trim())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid phone number format'
        });
      }

      // Check if phone number is already taken by another user
      const existingUser = await AuthService.getUserByPhoneNumber(updates.phoneNumber.trim());
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({
          success: false,
          error: 'Phone number already in use'
        });
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
  } catch (error: any) {
    console.error('Update user profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user profile'
    });
  }
});

/**
 * Update user profile (Frontend compatibility)
 * PUT /api/user/profile
 */
router.put('/user/profile', async (req, res) => {
  try {
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
  } catch (error: any) {
    console.error('Update user profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user profile'
    });
  }
});

/**
 * Get user preferences
 * GET /api/users/preferences
 */
router.get('/preferences', async (req, res) => {
  try {
    const userId = req.user!.id;

    const userDoc = await collections.users.doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = userDoc.data();
    const preferences = userData!.preferences || {
      notifications: true,
      language: 'en',
      currency: 'NGN',
      theme: 'light'
    };

    res.json({
      success: true,
      data: preferences
    });
  } catch (error: any) {
    console.error('Get user preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user preferences'
    });
  }
});

/**
 * Update user preferences
 * PUT /api/users/preferences
 */
router.put('/preferences', async (req, res) => {
  try {
    const userId = req.user!.id;
    const updates = req.body;

    // Validate allowed preference fields
    const allowedFields = ['notifications', 'language', 'currency', 'theme'];
    const filteredUpdates: any = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[`preferences.${field}`] = updates[field];
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid preference fields to update'
      });
    }

    // Validate specific fields
    if (updates.language && !['en', 'fr', 'es', 'pt'].includes(updates.language)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid language. Supported: en, fr, es, pt'
      });
    }

    if (updates.currency && !['NGN', 'USD', 'EUR', 'GBP'].includes(updates.currency)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid currency. Supported: NGN, USD, EUR, GBP'
      });
    }

    if (updates.theme && !['light', 'dark', 'system'].includes(updates.theme)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid theme. Supported: light, dark, system'
      });
    }

    // Add updated timestamp
    filteredUpdates.updatedAt = new Date();

    // Update user preferences
    await collections.users.doc(userId).update(filteredUpdates);

    // Get updated preferences
    const userDoc = await collections.users.doc(userId).get();
    const userData = userDoc.data();
    const preferences = userData!.preferences || {
      notifications: true,
      language: 'en',
      currency: 'NGN',
      theme: 'light'
    };

    res.json({
      success: true,
      data: preferences,
      message: 'Preferences updated successfully'
    });
  } catch (error: any) {
    console.error('Update user preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user preferences'
    });
  }
});

/**
 * Change username (requires password confirmation)
 * PUT /api/users/change-username
 */
router.put('/change-username', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { newUsername, password } = req.body;

    if (!newUsername || !password) {
      return res.status(400).json({
        success: false,
        error: 'New username and current password are required'
      });
    }

    // Validate username format
    if (newUsername.length < 3 || newUsername.length > 20) {
      return res.status(400).json({
        success: false,
        error: 'Username must be 3-20 characters long'
      });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) {
      return res.status(400).json({
        success: false,
        error: 'Username can only contain letters, numbers, and underscores'
      });
    }

    // Get current user
    const userDoc = await collections.users.doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = userDoc.data()!;

    // Verify password
    const isValidPassword = await AuthService.comparePassword(password, userData.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Incorrect password'
      });
    }

    // Check if username is already taken
    const existingUser = await AuthService.getUserByUsername(newUsername);
    if (existingUser && existingUser.id !== userId) {
      return res.status(400).json({
        success: false,
        error: 'Username already taken'
      });
    }

    // Update username
    await collections.users.doc(userId).update({
      username: newUsername,
      updatedAt: new Date()
    });

    res.json({
      success: true,
      message: 'Username updated successfully',
      data: { username: newUsername }
    });
  } catch (error: any) {
    console.error('Change username error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change username'
    });
  }
});

/**
 * Change email (requires password confirmation)
 * PUT /api/users/change-email
 */
router.put('/change-email', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { newEmail, password } = req.body;

    if (!newEmail || !password) {
      return res.status(400).json({
        success: false,
        error: 'New email and current password are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Get current user
    const userDoc = await collections.users.doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = userDoc.data()!;

    // Verify password
    const isValidPassword = await AuthService.comparePassword(password, userData.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Incorrect password'
      });
    }

    // Check if email is already taken
    const existingUser = await AuthService.getUserByEmail(newEmail);
    if (existingUser && existingUser.id !== userId) {
      return res.status(400).json({
        success: false,
        error: 'Email already in use'
      });
    }

    // Update email (mark as unverified)
    await collections.users.doc(userId).update({
      email: newEmail,
      emailVerified: false,
      updatedAt: new Date()
    });

    // TODO: Send email verification

    res.json({
      success: true,
      message: 'Email updated successfully. Please verify your new email address.',
      data: {
        email: newEmail,
        emailVerified: false
      }
    });
  } catch (error: any) {
    console.error('Change email error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change email'
    });
  }
});

/**
 * Change password
 * PUT /api/users/change-password
 */
router.put('/change-password', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters long'
      });
    }

    // Get current user
    const userDoc = await collections.users.doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = userDoc.data()!;

    // Verify current password
    const isValidPassword = await AuthService.comparePassword(currentPassword, userData.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Hash new password
    const newPasswordHash = await UserModel.hashPassword(newPassword);

    // Update password
    await collections.users.doc(userId).update({
      passwordHash: newPasswordHash,
      updatedAt: new Date()
    });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error: any) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  }
});

/**
 * Deactivate account
 * PUT /api/users/deactivate
 */
router.put('/deactivate', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { password, reason } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Password is required to deactivate account'
      });
    }

    // Get current user
    const userDoc = await collections.users.doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = userDoc.data()!;

    // Verify password
    const isValidPassword = await AuthService.comparePassword(password, userData.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Incorrect password'
      });
    }

    // Deactivate account
    await collections.users.doc(userId).update({
      isActive: false,
      deactivatedAt: new Date(),
      deactivationReason: reason || 'User requested deactivation',
      updatedAt: new Date()
    });

    res.json({
      success: true,
      message: 'Account deactivated successfully'
    });
  } catch (error: any) {
    console.error('Deactivate account error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate account'
    });
  }
});

/**
 * Reactivate account (Admin only)
 * PUT /api/users/:userId/reactivate
 */
router.put('/:userId/reactivate', AuthMiddleware.authenticate, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const userDoc = await collections.users.doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Reactivate account
    await collections.users.doc(userId).update({
      isActive: true,
      reactivatedAt: new Date(),
      updatedAt: new Date()
    });

    res.json({
      success: true,
      message: 'Account reactivated successfully'
    });
  } catch (error: any) {
    console.error('Reactivate account error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reactivate account'
    });
  }
});

/**
 * Get user statistics (Admin only)
 * GET /api/users/stats
 */
router.get('/stats', AuthMiddleware.authenticate, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const usersSnapshot = await collections.users.get();
    const users = usersSnapshot.docs.map(doc => doc.data());

    const stats = {
      total: users.length,
      active: users.filter(u => u.isActive).length,
      inactive: users.filter(u => !u.isActive).length,
      verified: users.filter(u => u.emailVerified).length,
      kycVerified: users.filter(u => u.kycStatus === 'verified').length,
      kycPending: users.filter(u => u.kycStatus === 'pending').length,
      kycRejected: users.filter(u => u.kycStatus === 'rejected').length
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user statistics'
    });
  }
});

export default router;
