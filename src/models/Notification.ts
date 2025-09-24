export interface INotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'transaction' | 'referral' | 'tip' | 'system' | 'promotion' | 'security';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  read: boolean;
  delivered: boolean;
  platform: 'whatsapp' | 'mobile_app' | 'email' | 'all';
  data?: {
    transactionId?: string;
    referralId?: string;
    tipId?: string;
    amount?: number;
    actionUrl?: string;
    deepLink?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  readAt?: Date;
  deliveredAt?: Date;
  expiresAt?: Date;
}

export class NotificationModel {
  static createNotificationData(data: Partial<INotification>): INotification {
    const now = new Date();
    return {
      id: data.id || '',
      userId: data.userId || '',
      title: data.title || '',
      message: data.message || '',
      type: data.type || 'system',
      priority: data.priority || 'medium',
      read: data.read || false,
      delivered: data.delivered || false,
      platform: data.platform || 'all',
      data: data.data,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      readAt: data.readAt,
      deliveredAt: data.deliveredAt,
      expiresAt: data.expiresAt
    };
  }

  static updateNotificationData(notification: INotification, updates: Partial<INotification>): INotification {
    const updated = {
      ...notification,
      ...updates,
      updatedAt: new Date()
    };

    // Auto-set timestamps when status changes
    if (updates.read && !notification.readAt) {
      updated.readAt = new Date();
    }
    if (updates.delivered && !notification.deliveredAt) {
      updated.deliveredAt = new Date();
    }

    return updated;
  }
}
