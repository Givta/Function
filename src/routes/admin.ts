import { Router } from 'express';
import { AdminService } from '../services/AdminService';
import { AuthMiddleware } from '../middleware/auth/AuthMiddleware';
import { collections } from '../config/firebase';

const router = Router();

// Apply admin authentication to all routes
router.use(AuthMiddleware.authenticate);
router.use(AuthMiddleware.requireAdmin);

/**
 * Get admin dashboard statistics
 * GET /api/admin/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await AdminService.getAdminStats();

    res.json({
      success: true,
      data: stats
    });

  } catch (error: any) {
    console.error('Get admin stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get admin statistics'
    });
  }
});

/**
 * Get system health status
 * GET /api/admin/health
 */
router.get('/health', async (req, res) => {
  try {
    const health = await AdminService.getSystemHealth();

    res.json({
      success: true,
      data: health
    });

  } catch (error: any) {
    console.error('Get system health error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get system health'
    });
  }
});

/**
 * Get users list with pagination and filters
 * GET /api/admin/users
 */
router.get('/users', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const filters = {
      kycStatus: req.query.kycStatus as string,
      isActive: req.query.isActive ? req.query.isActive === 'true' : undefined,
      search: req.query.search as string
    };

    const result = await AdminService.getUsers(limit, offset, filters);

    res.json({
      success: true,
      data: result.users,
      pagination: {
        total: result.total,
        limit,
        offset,
        hasMore: result.users.length === limit
      }
    });

  } catch (error: any) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get users'
    });
  }
});

/**
 * Get detailed user information
 * GET /api/admin/users/:userId
 */
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const userDetails = await AdminService.getUserDetails(userId);

    if (!userDetails) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: userDetails
    });

  } catch (error: any) {
    console.error('Get user details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user details'
    });
  }
});

/**
 * Update user status (activate/deactivate)
 * PUT /api/admin/users/:userId/status
 */
router.put('/users/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive, reason } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'isActive must be a boolean'
      });
    }

    const success = await AdminService.updateUserStatus(userId, isActive, reason);

    if (!success) {
      return res.status(400).json({
        success: false,
        error: 'Failed to update user status'
      });
    }

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`
    });

  } catch (error: any) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user status'
    });
  }
});

/**
 * Get transaction analytics
 * GET /api/admin/analytics/transactions
 */
router.get('/analytics/transactions', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const analytics = await AdminService.getTransactionAnalytics(days);

    res.json({
      success: true,
      data: analytics
    });

  } catch (error: any) {
    console.error('Get transaction analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get transaction analytics'
    });
  }
});

/**
 * Send bulk notification to users
 * POST /api/admin/notifications/bulk
 */
router.post('/notifications/bulk', async (req, res) => {
  try {
    const { userIds, title, message, type } = req.body;

    if (!Array.isArray(userIds) || !title || !message) {
      return res.status(400).json({
        success: false,
        error: 'userIds (array), title, and message are required'
      });
    }

    const result = await AdminService.sendBulkNotification(userIds, title, message, type);

    res.json({
      success: true,
      data: result,
      message: `Notification sent to ${result.success} users, ${result.failed} failed`
    });

  } catch (error: any) {
    console.error('Send bulk notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send bulk notification'
    });
  }
});

/**
 * Export user data (GDPR compliance)
 * GET /api/admin/users/:userId/export
 */
router.get('/users/:userId/export', async (req, res) => {
  try {
    const { userId } = req.params;
    const userData = await AdminService.exportUserData(userId);

    if (!userData) {
      return res.status(404).json({
        success: false,
        error: 'User not found or export failed'
      });
    }

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=user_${userId}_export.json`);

    res.json(userData);

  } catch (error: any) {
    console.error('Export user data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export user data'
    });
  }
});

/**
 * Delete user data (GDPR compliance)
 * DELETE /api/admin/users/:userId
 */
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const success = await AdminService.deleteUserData(userId);

    if (!success) {
      return res.status(400).json({
        success: false,
        error: 'Failed to delete user data'
      });
    }

    res.json({
      success: true,
      message: 'User data deletion initiated successfully'
    });

  } catch (error: any) {
    console.error('Delete user data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete user data'
    });
  }
});

/**
 * Check if current user is admin
 * GET /api/admin/check-admin
 */
router.get('/check-admin', async (req, res) => {
  try {
    const userId = req.user!.id;

    // Get user details
    const userDoc = await collections.users.doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = userDoc.data() as any;

    // Check if user has admin privileges
    const isAdmin = userData.userType === 'admin' || userData.userType === 'super_admin';

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin privileges required.'
      });
    }

    res.json({
      success: true,
      isAdmin: true,
      userType: userData.userType,
      userId: userId
    });

  } catch (error: any) {
    console.error('Check admin error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify admin status'
    });
  }
});

/**
 * Get system logs (simplified version)
 * GET /api/admin/logs
 */
router.get('/logs', async (req, res) => {
  try {
    // This is a simplified version. In production, integrate with proper logging service
    const limit = parseInt(req.query.limit as string) || 100;

    // Mock logs for demonstration
    const logs = [
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'System started successfully',
        service: 'givta-backend'
      },
      {
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        level: 'info',
        message: 'WhatsApp bot connected',
        service: 'whatsapp-service'
      },
      {
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        level: 'warn',
        message: 'High memory usage detected',
        service: 'system-monitor'
      }
    ].slice(0, limit);

    res.json({
      success: true,
      data: logs
    });

  } catch (error: any) {
    console.error('Get logs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get system logs'
    });
  }
});

/**
 * Get configuration settings (read-only for security)
 * GET /api/admin/config
 */
router.get('/config', async (req, res) => {
  try {
    // Return safe configuration information only
    const config = {
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      firebase: {
        projectId: process.env.FIREBASE_PROJECT_ID ? 'configured' : 'not configured'
      },
      whatsapp: {
        status: 'configured' // Don't expose actual credentials
      },
      payments: {
        paystack: process.env.PAYSTACK_SECRET_KEY ? 'configured' : 'not configured'
      }
    };

    res.json({
      success: true,
      data: config
    });

  } catch (error: any) {
    console.error('Get config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get configuration'
    });
  }
});

export default router;
