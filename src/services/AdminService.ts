import { db, collections } from '../config/firebase';
import { IUser, ITransaction, IWallet, IReferral, INotification } from '../models';
import { KYCService } from './KYCService';
import { ReferralService } from './ReferralService';
import { NotificationService } from './NotificationService';
import { WalletService } from './WalletService';

export interface AdminStats {
  users: {
    total: number;
    active: number;
    verified: number;
    kycPending: number;
    newToday: number;
  };
  transactions: {
    total: number;
    today: number;
    volume: number;
    fees: number;
  };
  wallets: {
    totalBalance: number;
    activeWallets: number;
  };
  referrals: {
    total: number;
    totalBonus: number;
    leaderboard: Array<{
      userId: string;
      username?: string;
      totalReferrals: number;
      totalBonus: number;
    }>;
  };
  kyc: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    completionRate: number;
  };
}

export interface SystemHealth {
  status: 'healthy' | 'warning' | 'critical';
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  database: {
    status: 'connected' | 'disconnected';
    responseTime: number;
  };
  services: {
    whatsapp: 'connected' | 'disconnected';
    notifications: 'operational' | 'degraded';
    payments: 'operational' | 'degraded';
  };
}

export class AdminService {
  /**
   * Get comprehensive admin statistics
   */
  static async getAdminStats(): Promise<AdminStats> {
    try {
      // Get user statistics
      const usersQuery = await collections.users.get();
      const users = usersQuery.docs.map(doc => doc.data() as IUser);

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const userStats = {
        total: users.length,
        active: users.filter(u => u.isActive).length,
        verified: users.filter(u => u.kycStatus === 'verified').length,
        kycPending: users.filter(u => u.kycStatus === 'pending').length,
        newToday: users.filter(u => u.createdAt >= today).length
      };

      // Get transaction statistics
      const transactionsQuery = await collections.transactions.get();
      const transactions = transactionsQuery.docs.map(doc => doc.data() as ITransaction);

      const todayTransactions = transactions.filter(t => t.createdAt >= today);

      const transactionStats = {
        total: transactions.length,
        today: todayTransactions.length,
        volume: transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0),
        fees: transactions
          .filter(t => t.type === 'fee')
          .reduce((sum, t) => sum + Math.abs(t.amount), 0)
      };

      // Get wallet statistics
      const walletsQuery = await collections.wallets.get();
      const wallets = walletsQuery.docs.map(doc => doc.data() as IWallet);

      const walletStats = {
        totalBalance: wallets.reduce((sum, w) => sum + w.balance, 0),
        activeWallets: wallets.filter(w => w.isActive).length
      };

      // Get referral statistics
      const referralLeaderboard = await ReferralService.getReferralLeaderboard(10);

      const referralStats = {
        total: referralLeaderboard.reduce((sum, r) => sum + r.totalReferrals, 0),
        totalBonus: referralLeaderboard.reduce((sum, r) => sum + r.totalBonus, 0),
        leaderboard: referralLeaderboard
      };

      // Get KYC statistics
      const kycStats = await KYCService.getKYCStatistics();

      return {
        users: userStats,
        transactions: transactionStats,
        wallets: walletStats,
        referrals: referralStats,
        kyc: kycStats
      };
    } catch (error: any) {
      console.error('Get admin stats error:', error);
      throw new Error('Failed to get admin statistics');
    }
  }

  /**
   * Get system health status
   */
  static async getSystemHealth(): Promise<SystemHealth> {
    try {
      const startTime = process.hrtime.bigint();
      // Simple database health check
      await collections.users.limit(1).get();
      const endTime = process.hrtime.bigint();
      const responseTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds

      // Memory usage
      const memUsage = process.memoryUsage();
      const memory = {
        used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
      };

      // Determine overall status
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (memory.percentage > 90 || responseTime > 5000) {
        status = 'critical';
      } else if (memory.percentage > 75 || responseTime > 1000) {
        status = 'warning';
      }

      return {
        status,
        uptime: Math.floor(process.uptime()),
        memory,
        database: {
          status: 'connected',
          responseTime: Math.round(responseTime)
        },
        services: {
          whatsapp: 'connected', // TODO: Check actual WhatsApp connection
          notifications: 'operational',
          payments: 'operational' // TODO: Check payment gateway status
        }
      };
    } catch (error) {
      return {
        status: 'critical',
        uptime: Math.floor(process.uptime()),
        memory: {
          used: 0,
          total: 0,
          percentage: 0
        },
        database: {
          status: 'disconnected',
          responseTime: 0
        },
        services: {
          whatsapp: 'disconnected',
          notifications: 'degraded',
          payments: 'degraded'
        }
      };
    }
  }

  /**
   * Get all users with pagination
   */
  static async getUsers(
    limit: number = 50,
    offset: number = 0,
    filters?: {
      kycStatus?: string;
      isActive?: boolean;
      search?: string;
    }
  ): Promise<{ users: IUser[]; total: number }> {
    try {
      let query = collections.users.orderBy('createdAt', 'desc');

      // Apply filters
      if (filters?.kycStatus) {
        query = query.where('kycStatus', '==', filters.kycStatus);
      }

      if (filters?.isActive !== undefined) {
        query = query.where('isActive', '==', filters.isActive);
      }

      // Get total count (simplified)
      const totalQuery = await query.get();
      const total = totalQuery.docs.length;

      // Apply pagination
      const paginatedQuery = await query.limit(limit).offset(offset).get();
      const users = paginatedQuery.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as IUser[];

      // Apply search filter (client-side for simplicity)
      let filteredUsers = users;
      if (filters?.search) {
        const searchTerm = filters.search.toLowerCase();
        filteredUsers = users.filter(user =>
          user.username?.toLowerCase().includes(searchTerm) ||
          user.email?.toLowerCase().includes(searchTerm) ||
          user.phoneNumber?.includes(searchTerm)
        );
      }

      return {
        users: filteredUsers,
        total
      };
    } catch (error: any) {
      console.error('Get users error:', error);
      return { users: [], total: 0 };
    }
  }

  /**
   * Get user details with full information
   */
  static async getUserDetails(userId: string): Promise<{
    user: IUser;
    wallet?: IWallet;
    transactions: ITransaction[];
    referrals: IReferral[];
    notifications: INotification[];
  } | null> {
    try {
      // Get user
      const user = await this.getUserById(userId);
      if (!user) return null;

      // Get wallet
      const wallet = await WalletService.getWalletByUserId(userId);

      // Get recent transactions
      const transactions = await WalletService.getTransactionHistory(userId, 20);

      // Get referrals - Note: recentReferrals no longer exists in the new interface
      // We'll get referrals from the database directly
      const referralsQuery = await collections.referrals
        .where('referrerId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

      const referrals = referralsQuery.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as IReferral[];

      // Get recent notifications
      const notifications = await NotificationService.getUserNotifications(userId, 10);

      return {
        user,
        wallet: wallet || undefined,
        transactions,
        referrals,
        notifications
      };
    } catch (error: any) {
      console.error('Get user details error:', error);
      return null;
    }
  }

  /**
   * Update user status (activate/deactivate)
   */
  static async updateUserStatus(userId: string, isActive: boolean, reason?: string): Promise<boolean> {
    try {
      await collections.users.doc(userId).update({
        isActive,
        updatedAt: new Date()
      });

      // Send notification
      const title = isActive ? 'Account Activated' : 'Account Deactivated';
      const message = isActive
        ? 'Your account has been activated. You can now use all features.'
        : `Your account has been deactivated. Reason: ${reason || 'Contact support for more information.'}`;

      await NotificationService.sendSystemNotification(
        userId,
        title,
        message,
        isActive ? 'medium' : 'urgent'
      );

      return true;
    } catch (error) {
      console.error('Update user status error:', error);
      return false;
    }
  }

  /**
   * Get transaction analytics
   */
  static async getTransactionAnalytics(days: number = 30): Promise<{
    dailyVolume: Array<{ date: string; volume: number; count: number }>;
    topUsers: Array<{ userId: string; username?: string; volume: number }>;
    typeBreakdown: Record<string, number>;
  }> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const querySnapshot = await collections.transactions
        .where('createdAt', '>=', startDate)
        .get();

      const transactions = querySnapshot.docs.map(doc => doc.data() as ITransaction);

      // Daily volume
      const dailyVolume: Record<string, { volume: number; count: number }> = {};
      transactions.forEach(t => {
        const date = t.createdAt.toISOString().split('T')[0];
        if (!dailyVolume[date]) {
          dailyVolume[date] = { volume: 0, count: 0 };
        }
        dailyVolume[date].volume += Math.abs(t.amount);
        dailyVolume[date].count += 1;
      });

      const dailyVolumeArray = Object.entries(dailyVolume).map(([date, data]) => ({
        date,
        volume: data.volume,
        count: data.count
      }));

      // Top users by volume
      const userVolume: Record<string, number> = {};
      transactions.forEach(t => {
        userVolume[t.userId] = (userVolume[t.userId] || 0) + Math.abs(t.amount);
      });

      const topUsers = Object.entries(userVolume)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(async ([userId, volume]) => {
          const user = await this.getUserById(userId);
          return {
            userId,
            username: user?.username,
            volume
          };
        });

      // Type breakdown
      const typeBreakdown: Record<string, number> = {};
      transactions.forEach(t => {
        typeBreakdown[t.type] = (typeBreakdown[t.type] || 0) + 1;
      });

      return {
        dailyVolume: dailyVolumeArray,
        topUsers: await Promise.all(topUsers),
        typeBreakdown
      };
    } catch (error: any) {
      console.error('Get transaction analytics error:', error);
      return {
        dailyVolume: [],
        topUsers: [],
        typeBreakdown: {}
      };
    }
  }

  /**
   * Send bulk notifications to users
   */
  static async sendBulkNotification(
    userIds: string[],
    title: string,
    message: string,
    type: INotification['type'] = 'system'
  ): Promise<{ success: number; failed: number }> {
    return NotificationService.sendBulkNotification(userIds, title, message, type);
  }

  /**
   * Export user data (GDPR compliance)
   */
  static async exportUserData(userId: string): Promise<any> {
    try {
      const userDetails = await this.getUserDetails(userId);
      if (!userDetails) return null;

      return {
        user: userDetails.user,
        wallet: userDetails.wallet,
        transactions: userDetails.transactions,
        referrals: userDetails.referrals,
        notifications: userDetails.notifications,
        exportDate: new Date().toISOString()
      };
    } catch (error) {
      console.error('Export user data error:', error);
      return null;
    }
  }

  /**
   * Delete user data (GDPR compliance)
   */
  static async deleteUserData(userId: string): Promise<boolean> {
    try {
      // This is a simplified version. In production, implement proper data deletion
      // with backups, audit trails, and legal compliance

      // Mark user as inactive
      await this.updateUserStatus(userId, false, 'Account deleted by user');

      // Anonymize personal data
      await collections.users.doc(userId).update({
        displayName: 'Deleted User',
        email: null,
        phoneNumber: null,
        deletedAt: new Date(),
        updatedAt: new Date()
      });

      console.log(`User ${userId} data marked for deletion`);
      return true;
    } catch (error) {
      console.error('Delete user data error:', error);
      return false;
    }
  }

  /**
   * Get user by ID (helper method)
   */
  private static async getUserById(userId: string): Promise<IUser | null> {
    const doc = await collections.users.doc(userId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as IUser;
  }
}
