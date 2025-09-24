import { Router } from 'express';
import { AuthMiddleware } from '../middleware/auth/AuthMiddleware';
import { NotificationService } from '../services/NotificationService';

const router = Router();

// Apply authentication to all routes
router.use(AuthMiddleware.authenticate);

/**
 * Get user notifications
 * GET /api/notifications
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;

    const notifications = await NotificationService.getUserNotifications(userId, limit, offset);

    res.json({
      success: true,
      data: notifications
    });
  } catch (error: any) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get notifications'
    });
  }
});

/**
 * Mark notification as read
 * PUT /api/notifications/:id/read
 */
router.put('/:id/read', async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user!.id;

    const result = await NotificationService.markAsRead(notificationId, userId);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error: any) {
    console.error('Mark notification read error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read'
    });
  }
});

/**
 * Mark all notifications as read
 * PUT /api/notifications/read-all
 */
router.put('/read-all', async (req, res) => {
  try {
    const userId = req.user!.id;

    const result = await NotificationService.markAllAsRead(userId);

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error: any) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notifications as read'
    });
  }
});

/**
 * Delete notification
 * DELETE /api/notifications/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user!.id;

    const result = await NotificationService.deleteNotification(notificationId, userId);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error: any) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete notification'
    });
  }
});

/**
 * Get notification statistics
 * GET /api/notifications/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user!.id;
    const stats = await NotificationService.getNotificationStats(userId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error('Get notification stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get notification statistics'
    });
  }
});

export default router;
