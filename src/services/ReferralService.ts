import { db, collections } from '../config/firebase';
import { IReferral, ReferralModel, IUser, ITransaction } from '../models';
import { WalletService } from './WalletService';
import { v4 as uuidv4 } from 'uuid';

export interface ReferralStats {
  totalEarnings: number;
  totalReferrals: number;
  levelStats: {
    level: number;
    count: number;
    earnings: number;
  }[];
  referralCode: string;
}

export interface ReferralResult {
  success: boolean;
  referralId?: string;
  bonusProcessed?: boolean;
  error?: string;
}

export class ReferralService {
  private static readonly REFERRAL_BONUSES = {
    1: 100,  // ₦100 for direct referral
    2: 50,   // ₦50 for level 2
    3: 25    // ₦25 for level 3
  };

  private static readonly MAX_REFERRAL_LEVELS = 3;
  private static readonly MIN_ACTIVE_DAYS = 30; // Days user must be active for level 3 bonus

  /**
   * Process a new referral when a user signs up
   */
  static async processReferral(referrerId: string, referredId: string, platform: 'whatsapp' | 'mobile_app' = 'mobile_app'): Promise<ReferralResult> {
    try {
      // Validate referrer exists
      const referrer = await this.getUserById(referrerId);
      if (!referrer) {
        throw new Error('Referrer not found');
      }

      // Check if referral already exists
      const existingReferral = await this.getReferralByUsers(referrerId, referredId);
      if (existingReferral) {
        return { success: false, error: 'Referral already exists' };
      }

      // Create level 1 referral
      const referralId = uuidv4();
      const referralData = ReferralModel.createReferralData({
        id: referralId,
        referrerId,
        referredId,
        level: 1,
        bonus: this.REFERRAL_BONUSES[1 as keyof typeof this.REFERRAL_BONUSES],
        status: 'pending',
        referralCode: referrer.referralCode,
        platform
      });

      await collections.referrals.doc(referralId).set(referralData);

      // Process level 1 bonus immediately
      const bonusResult = await WalletService.processReferralBonus(
        referrerId,
        referredId,
        1,
        this.REFERRAL_BONUSES[1]
      );

      if (bonusResult.success) {
        // Update referral status
        await collections.referrals.doc(referralId).update({
          status: 'completed',
          completedAt: new Date(),
          updatedAt: new Date(),
          'metadata.bonusTransactionId': bonusResult.transactionId
        });

        // Process higher level referrals
        await this.processHigherLevelReferrals(referrerId, referredId, platform);
      }

      return {
        success: true,
        referralId,
        bonusProcessed: bonusResult.success
      };
    } catch (error: any) {
      console.error('Process referral error:', error);
      return {
        success: false,
        error: error.message || 'Failed to process referral'
      };
    }
  }

  /**
   * Process higher level referrals (level 2 and 3)
   */
  private static async processHigherLevelReferrals(referrerId: string, referredId: string, platform: 'whatsapp' | 'mobile_app'): Promise<void> {
    try {
      // Get referrer's referrer (level 2)
      const referrer = await this.getUserById(referrerId);
      if (referrer?.referredBy) {
        // Create level 2 referral
        await this.createHigherLevelReferral(referrer.referredBy, referredId, 2, platform);

        // Get level 2 referrer's referrer (level 3)
        const level2Referrer = await this.getUserById(referrer.referredBy);
        if (level2Referrer?.referredBy) {
          // Check if level 2 referrer has been active for minimum days
          const isEligible = await this.checkLevel3Eligibility(level2Referrer.id);
          if (isEligible) {
            await this.createHigherLevelReferral(level2Referrer.referredBy, referredId, 3, platform);
          }
        }
      }
    } catch (error) {
      console.error('Process higher level referrals error:', error);
    }
  }

  /**
   * Create higher level referral
   */
  private static async createHigherLevelReferral(
    referrerId: string,
    referredId: string,
    level: number,
    platform: 'whatsapp' | 'mobile_app'
  ): Promise<void> {
    try {
      const referralId = uuidv4();
      const referralData = ReferralModel.createReferralData({
        id: referralId,
        referrerId,
        referredId,
        level,
        bonus: this.REFERRAL_BONUSES[level as keyof typeof this.REFERRAL_BONUSES],
        status: 'pending',
        referralCode: '', // Will be set by the referrer's code
        platform
      });

      await collections.referrals.doc(referralId).set(referralData);

      // Process bonus
      const bonusResult = await WalletService.processReferralBonus(
        referrerId,
        referredId,
        level,
        this.REFERRAL_BONUSES[level as keyof typeof this.REFERRAL_BONUSES]
      );

      if (bonusResult.success) {
        await collections.referrals.doc(referralId).update({
          status: 'completed',
          completedAt: new Date(),
          updatedAt: new Date(),
          'metadata.bonusTransactionId': bonusResult.transactionId
        });
      }
    } catch (error) {
      console.error(`Create level ${level} referral error:`, error);
    }
  }

  /**
   * Check if user is eligible for level 3 bonus
   */
  private static async checkLevel3Eligibility(userId: string): Promise<boolean> {
    try {
      const user = await this.getUserById(userId);
      if (!user) return false;

      // Check if user has been active for minimum days
      const minActiveDate = new Date();
      minActiveDate.setDate(minActiveDate.getDate() - this.MIN_ACTIVE_DAYS);

      return user.createdAt <= minActiveDate;
    } catch (error) {
      console.error('Check level 3 eligibility error:', error);
      return false;
    }
  }

  /**
   * Get referral statistics for a user
   */
  static async getReferralStats(userId: string): Promise<ReferralStats> {
    try {
      // Get all referrals by this user
      const querySnapshot = await collections.referrals
        .where('referrerId', '==', userId)
        .orderBy('createdAt', 'desc')
        .get();

      const referrals = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as IReferral[];

      // Calculate level stats
      const levelStats = [
        {
          level: 1,
          count: referrals.filter(r => r.level === 1).length,
          earnings: referrals
            .filter(r => r.level === 1 && r.status === 'completed')
            .reduce((sum, r) => sum + r.bonus, 0)
        },
        {
          level: 2,
          count: referrals.filter(r => r.level === 2).length,
          earnings: referrals
            .filter(r => r.level === 2 && r.status === 'completed')
            .reduce((sum, r) => sum + r.bonus, 0)
        },
        {
          level: 3,
          count: referrals.filter(r => r.level === 3).length,
          earnings: referrals
            .filter(r => r.level === 3 && r.status === 'completed')
            .reduce((sum, r) => sum + r.bonus, 0)
        }
      ];

      const totalEarnings = referrals
        .filter(r => r.status === 'completed')
        .reduce((sum, r) => sum + r.bonus, 0);

      // Get user referral code
      const user = await this.getUserById(userId);
      const referralCode = user?.referralCode || '';

      return {
        totalEarnings,
        totalReferrals: referrals.length,
        levelStats,
        referralCode
      };
    } catch (error: any) {
      console.error('Get referral stats error:', error);
      return {
        totalEarnings: 0,
        totalReferrals: 0,
        levelStats: [
          { level: 1, count: 0, earnings: 0 },
          { level: 2, count: 0, earnings: 0 },
          { level: 3, count: 0, earnings: 0 }
        ],
        referralCode: ''
      };
    }
  }

  /**
   * Get referral leaderboard
   */
  static async getReferralLeaderboard(limit: number = 50): Promise<Array<{
    userId: string;
    username?: string;
    totalReferrals: number;
    totalBonus: number;
  }>> {
    try {
      // This is a simplified version. In production, you might want to use aggregation queries
      // or maintain a separate leaderboard collection

      // Get all completed referrals
      const querySnapshot = await collections.referrals
        .where('status', '==', 'completed')
        .get();

      const referrals = querySnapshot.docs.map(doc => doc.data() as IReferral);

      // Group by referrer
      const leaderboardMap = new Map<string, { totalReferrals: number; totalBonus: number }>();

      referrals.forEach(referral => {
        const existing = leaderboardMap.get(referral.referrerId) || { totalReferrals: 0, totalBonus: 0 };
        leaderboardMap.set(referral.referrerId, {
          totalReferrals: existing.totalReferrals + 1,
          totalBonus: existing.totalBonus + referral.bonus
        });
      });

      // Convert to array and sort
      const leaderboard = Array.from(leaderboardMap.entries()).map(([userId, stats]) => ({
        userId,
        totalReferrals: stats.totalReferrals,
        totalBonus: stats.totalBonus,
        username: undefined as string | undefined
      }));

      leaderboard.sort((a, b) => b.totalReferrals - a.totalReferrals);

      // Get user details for top users
      const topUsers = leaderboard.slice(0, limit);
      for (const user of topUsers) {
        const userData = await this.getUserById(user.userId);
        user.username = userData?.username;
      }

      return topUsers;
    } catch (error: any) {
      console.error('Get referral leaderboard error:', error);
      return [];
    }
  }

  /**
   * Validate referral code
   */
  static async validateReferralCode(code: string): Promise<{ valid: boolean; user?: IUser }> {
    try {
      const user = await this.getUserByReferralCode(code);
      return {
        valid: !!user,
        user: user || undefined
      };
    } catch (error) {
      return { valid: false };
    }
  }

  /**
   * Generate unique referral code for user
   */
  static generateReferralCode(displayName: string): string {
    const prefix = displayName.replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return prefix + random;
  }

  /**
   * Get referral by users
   */
  private static async getReferralByUsers(referrerId: string, referredId: string): Promise<IReferral | null> {
    const querySnapshot = await collections.referrals
      .where('referrerId', '==', referrerId)
      .where('referredId', '==', referredId)
      .limit(1)
      .get();

    if (querySnapshot.empty) return null;

    const doc = querySnapshot.docs[0];
    return { id: doc.id, ...doc.data() } as IReferral;
  }

  /**
   * Get user by ID (helper method)
   */
  private static async getUserById(userId: string): Promise<IUser | null> {
    const doc = await collections.users.doc(userId).get();
    if (!doc.exists) return null;
    return doc.data() as IUser;
  }

  /**
   * Get user by referral code (helper method)
   */
  private static async getUserByReferralCode(referralCode: string): Promise<IUser | null> {
    const querySnapshot = await collections.users
      .where('referralCode', '==', referralCode)
      .limit(1)
      .get();

    if (querySnapshot.empty) return null;

    const doc = querySnapshot.docs[0];
    return { id: doc.id, ...doc.data() } as IUser;
  }

  /**
   * Process pending bonuses (for cron jobs)
   */
  static async processPendingBonuses(): Promise<{ processed: number; failed: number }> {
    try {
      const querySnapshot = await collections.referrals
        .where('status', '==', 'pending')
        .get();

      let processed = 0;
      let failed = 0;

      for (const doc of querySnapshot.docs) {
        try {
          const referral = { id: doc.id, ...doc.data() } as IReferral;

          const bonusResult = await WalletService.processReferralBonus(
            referral.referrerId,
            referral.referredId,
            referral.level,
            referral.bonus
          );

          if (bonusResult.success) {
            await collections.referrals.doc(referral.id).update({
              status: 'completed',
              completedAt: new Date(),
              updatedAt: new Date(),
              'metadata.bonusTransactionId': bonusResult.transactionId
            });
            processed++;
          } else {
            failed++;
          }
        } catch (error) {
          console.error('Process pending bonus error:', error);
          failed++;
        }
      }

      return { processed, failed };
    } catch (error: any) {
      console.error('Process pending bonuses error:', error);
      return { processed: 0, failed: 0 };
    }
  }
}
