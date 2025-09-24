import { db, collections } from '../config/firebase';
import { INotification, NotificationModel, IUser } from '../models';
import { v4 as uuidv4 } from 'uuid';

// Email service (using SendGrid)
class EmailService {
  private static sgMail: any = null;

  static async initialize() {
    if (!this.sgMail) {
      try {
        const sgMail = (await import('@sendgrid/mail')).default;
        sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');
        this.sgMail = sgMail;
        console.log('📧 SendGrid email service initialized');
      } catch (error: any) {
        console.warn('❌ SendGrid initialization failed:', error.message);
        console.warn('📧 Email notifications will be disabled');
        this.sgMail = null;
      }
    }
    return this.sgMail;
  }

  static async sendEmail(to: string, subject: string, html: string, text?: string) {
    try {
      const sgMail = await this.initialize();
      if (!sgMail) {
        console.log('📧 Email service not available, skipping email notification');
        return false;
      }

      const msg = {
        to,
        from: {
          email: process.env.FROM_EMAIL || 'noreply@givta.com',
          name: 'Givta'
        },
        subject,
        html,
        text: text || this.stripHtml(html)
      };

      const result = await sgMail.send(msg);
      console.log('📧 Email sent successfully:', result[0]?.statusCode);
      return true;
    } catch (error: any) {
      console.error('❌ Email send error:', error.message);
      return false;
    }
  }

  private static stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  // Send transaction email with HTML template
  static async sendTransactionEmail(
    to: string,
    transactionType: string,
    amount: number,
    currency: string,
    reference?: string
  ) {
    const subject = `Givta - ${transactionType.charAt(0).toUpperCase() + transactionType.slice(1)} Confirmation`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin: 0; font-size: 24px;">Givta</h1>
            <p style="color: #666; margin: 5px 0;">Your Digital Wallet</p>
          </div>

          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #28a745; margin: 0 0 15px 0;">${transactionType.charAt(0).toUpperCase() + transactionType.slice(1)} Successful! 🎉</h2>
            <p style="margin: 0; color: #666; font-size: 16px;">Your transaction has been processed successfully.</p>
          </div>

          <div style="margin: 30px 0;">
            <div style="display: inline-block; width: 100%; max-width: 300px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; font-weight: bold;">Amount:</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: #28a745;">${currency} ${amount.toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; font-weight: bold;">Type:</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right;">${transactionType.charAt(0).toUpperCase() + transactionType.slice(1)}</td>
                </tr>
                ${reference ? `
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; font-weight: bold;">Reference:</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right; font-family: monospace;">${reference}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 10px 0; font-weight: bold;">Date:</td>
                  <td style="padding: 10px 0; text-align: right;">${new Date().toLocaleDateString()}</td>
                </tr>
              </table>
            </div>
          </div>

          <div style="background-color: #e9ecef; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #666; font-size: 14px;">
              <strong>Need help?</strong> Contact our support team at support@givta.com or visit our help center.
            </p>
          </div>

          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="margin: 0; color: #999; font-size: 12px;">
              This is an automated message from Givta. Please do not reply to this email.
            </p>
            <p style="margin: 5px 0 0 0; color: #999; font-size: 12px;">
              © ${new Date().getFullYear()} Givta. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    `;

    return this.sendEmail(to, subject, html);
  }
}

export interface NotificationResult {
  success: boolean;
  notificationId?: string;
  error?: string;
}

export interface NotificationStats {
  total: number;
  unread: number;
  byType: Record<string, number>;
}

export class NotificationService {
  /**
   * Create and send a notification
   */
  static async createNotification(
    userId: string,
    title: string,
    message: string,
    type: INotification['type'],
    priority: INotification['priority'] = 'medium',
    platform: INotification['platform'] = 'all',
    data?: INotification['data']
  ): Promise<NotificationResult> {
    try {
      const notificationId = uuidv4();
      const notificationData = NotificationModel.createNotificationData({
        id: notificationId,
        userId,
        title,
        message,
        type,
        priority,
        platform,
        data
      });

      await collections.notifications.doc(notificationId).set(notificationData);

      // Send real-time notification if needed
      await this.sendRealTimeNotification(userId, notificationData);

      return {
        success: true,
        notificationId
      };
    } catch (error: any) {
      console.error('Create notification error:', error);
      return {
        success: false,
        error: error.message || 'Failed to create notification'
      };
    }
  }

  /**
   * Send real-time notification (Push Notification via FCM)
   */
  private static async sendRealTimeNotification(userId: string, notification: INotification): Promise<void> {
    try {
      // Get user device token
      const userDoc = await collections.users.doc(userId).get();
      const userData = userDoc.data();

      if (!userData?.deviceToken) {
        console.log(`📱 No device token found for user ${userId}`);
        return;
      }

      // Send push notification via Firebase Admin SDK
      const { getMessaging } = await import('firebase-admin/messaging');
      const messaging = getMessaging();

      const message = {
        token: userData.deviceToken,
        notification: {
          title: notification.title,
          body: notification.message,
        },
        data: {
          type: notification.type,
          priority: notification.priority,
          userId: userId,
          notificationId: notification.id,
          // Convert all data values to strings for FCM
          ...(notification.data && Object.fromEntries(
            Object.entries(notification.data).map(([key, value]) => [
              key,
              typeof value === 'string' ? value : String(value)
            ])
          ))
        },
        android: {
          priority: (notification.priority === 'urgent' ? 'high' : 'normal') as 'high' | 'normal',
          notification: {
            sound: 'default',
            channelId: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await messaging.send(message);
      console.log(`📢 Push notification sent successfully: ${response}`);

    } catch (error: any) {
      console.error('Send push notification error:', error);

      // If token is invalid, remove it
      if (error.code === 'messaging/registration-token-not-registered' ||
          error.code === 'messaging/invalid-registration-token') {
        console.log(`📱 Removing invalid device token for user ${userId}`);
        try {
          await collections.users.doc(userId).update({
            deviceToken: null,
            deviceRegisteredAt: null,
            updatedAt: new Date()
          });
        } catch (updateError) {
          console.error('Error removing invalid token:', updateError);
        }
      }
    }
  }

  /**
   * Get user notifications
   */
  static async getUserNotifications(
    userId: string,
    limit: number = 50,
    offset: number = 0,
    includeRead: boolean = true
  ): Promise<INotification[]> {
    try {
      let query = collections.notifications
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .offset(offset);

      if (!includeRead) {
        query = query.where('read', '==', false);
      }

      const querySnapshot = await query.get();

      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as INotification[];
    } catch (error: any) {
      console.error('Get user notifications error:', error);
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId: string, userId: string): Promise<NotificationResult> {
    try {
      const notificationRef = collections.notifications.doc(notificationId);
      const doc = await notificationRef.get();

      if (!doc.exists) {
        return { success: false, error: 'Notification not found' };
      }

      const notification = { id: doc.id, ...doc.data() } as INotification;

      // Verify ownership
      if (notification.userId !== userId) {
        return { success: false, error: 'Unauthorized' };
      }

      if (notification.read) {
        return { success: true, notificationId };
      }

      const updatedNotification = NotificationModel.updateNotificationData(notification, {
        read: true
      });

      await notificationRef.update({
        read: updatedNotification.read,
        readAt: updatedNotification.readAt,
        updatedAt: updatedNotification.updatedAt
      });

      return { success: true, notificationId };
    } catch (error: any) {
      console.error('Mark as read error:', error);
      return {
        success: false,
        error: error.message || 'Failed to mark notification as read'
      };
    }
  }

  /**
   * Mark all user notifications as read
   */
  static async markAllAsRead(userId: string): Promise<NotificationResult> {
    try {
      const querySnapshot = await collections.notifications
        .where('userId', '==', userId)
        .where('read', '==', false)
        .get();

      const batch = db.batch();
      const now = new Date();

      querySnapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          read: true,
          readAt: now,
          updatedAt: now
        });
      });

      await batch.commit();

      return { success: true };
    } catch (error: any) {
      console.error('Mark all as read error:', error);
      return {
        success: false,
        error: error.message || 'Failed to mark all notifications as read'
      };
    }
  }

  /**
   * Delete notification
   */
  static async deleteNotification(notificationId: string, userId: string): Promise<NotificationResult> {
    try {
      const notificationRef = collections.notifications.doc(notificationId);
      const doc = await notificationRef.get();

      if (!doc.exists) {
        return { success: false, error: 'Notification not found' };
      }

      const notification = { id: doc.id, ...doc.data() } as INotification;

      // Verify ownership
      if (notification.userId !== userId) {
        return { success: false, error: 'Unauthorized' };
      }

      await notificationRef.delete();

      return { success: true, notificationId };
    } catch (error: any) {
      console.error('Delete notification error:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete notification'
      };
    }
  }

  /**
   * Get notification statistics
   */
  static async getNotificationStats(userId: string): Promise<NotificationStats> {
    try {
      const querySnapshot = await collections.notifications
        .where('userId', '==', userId)
        .get();

      const notifications = querySnapshot.docs.map(doc => doc.data() as INotification);

      const stats: NotificationStats = {
        total: notifications.length,
        unread: notifications.filter(n => !n.read).length,
        byType: {}
      };

      // Count by type
      notifications.forEach(notification => {
        stats.byType[notification.type] = (stats.byType[notification.type] || 0) + 1;
      });

      return stats;
    } catch (error: any) {
      console.error('Get notification stats error:', error);
      return {
        total: 0,
        unread: 0,
        byType: {}
      };
    }
  }

  /**
   * Send transaction notification
   */
  static async sendTransactionNotification(
    userId: string,
    transactionType: 'deposit' | 'withdrawal' | 'tip_sent' | 'tip_received' | 'referral_bonus',
    amount: number,
    currency: string = 'NGN',
    reference?: string
  ): Promise<NotificationResult> {
    const titles = {
      deposit: '💰 Deposit Successful',
      withdrawal: '💸 Withdrawal Processed',
      tip_sent: '🎯 Tip Sent',
      tip_received: '🎁 Tip Received',
      referral_bonus: '🎊 Referral Bonus Earned'
    };

    const messages = {
      deposit: `Your deposit of ${currency} ${amount.toLocaleString()} has been credited to your wallet.`,
      withdrawal: `Your withdrawal of ${currency} ${amount.toLocaleString()} has been processed.`,
      tip_sent: `You sent a tip of ${currency} ${amount.toLocaleString()}.`,
      tip_received: `You received a tip of ${currency} ${amount.toLocaleString()}!`,
      referral_bonus: `Congratulations! You earned ${currency} ${amount.toLocaleString()} as a referral bonus.`
    };

    return this.createNotification(
      userId,
      titles[transactionType],
      messages[transactionType],
      'transaction',
      'medium',
      'all',
      {
        amount,
        transactionId: reference
      }
    );
  }

  /**
   * Send tip notification
   */
  static async sendTipNotification(
    userId: string,
    tipperName: string,
    amount: number,
    currency: string = 'NGN',
    isAnonymous: boolean = false
  ): Promise<NotificationResult> {
    const title = '🎁 You Received a Tip!';
    const sender = isAnonymous ? 'Someone' : tipperName;
    const message = `${sender} sent you a tip of ${currency} ${amount.toLocaleString()}!`;

    return this.createNotification(
      userId,
      title,
      message,
      'tip',
      'high',
      'all',
      { amount }
    );
  }

  /**
   * Send referral notification
   */
  static async sendReferralNotification(
    userId: string,
    referredName: string,
    bonusAmount: number,
    level: number,
    currency: string = 'NGN'
  ): Promise<NotificationResult> {
    const title = '🎊 Referral Bonus Earned!';
    const message = `Congratulations! ${referredName} joined using your referral. You earned ${currency} ${bonusAmount.toLocaleString()} (Level ${level} bonus)!`;

    return this.createNotification(
      userId,
      title,
      message,
      'referral',
      'medium',
      'all',
      {
        amount: bonusAmount,
        referralId: `level_${level}`
      }
    );
  }

  /**
   * Send system notification
   */
  static async sendSystemNotification(
    userId: string,
    title: string,
    message: string,
    priority: INotification['priority'] = 'medium'
  ): Promise<NotificationResult> {
    return this.createNotification(
      userId,
      title,
      message,
      'system',
      priority,
      'all'
    );
  }

  /**
   * Send promotional notification
   */
  static async sendPromotionalNotification(
    userIds: string[],
    title: string,
    message: string,
    data?: INotification['data']
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    for (const userId of userIds) {
      const result = await this.createNotification(
        userId,
        title,
        message,
        'promotion',
        'low',
        'all',
        data
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Send security notification
   */
  static async sendSecurityNotification(
    userId: string,
    event: string,
    details?: string
  ): Promise<NotificationResult> {
    const title = '🔒 Security Alert';
    const message = `Security event: ${event}${details ? ` - ${details}` : ''}`;

    return this.createNotification(
      userId,
      title,
      message,
      'security',
      'urgent',
      'all'
    );
  }

  /**
   * Clean up old notifications (for cron jobs)
   */
  static async cleanupOldNotifications(daysOld: number = 90): Promise<{ deleted: number }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const querySnapshot = await collections.notifications
        .where('read', '==', true)
        .where('createdAt', '<', cutoffDate)
        .get();

      const batch = db.batch();
      querySnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      return { deleted: querySnapshot.docs.length };
    } catch (error: any) {
      console.error('Cleanup old notifications error:', error);
      return { deleted: 0 };
    }
  }

  /**
   * Send bulk notifications (for admin)
   */
  static async sendBulkNotification(
    userIds: string[],
    title: string,
    message: string,
    type: INotification['type'] = 'system',
    priority: INotification['priority'] = 'medium'
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const userId of userIds) {
      try {
        await this.createNotification(userId, title, message, type, priority);
        success++;
      } catch (error) {
        console.error(`Failed to send notification to ${userId}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }
}
