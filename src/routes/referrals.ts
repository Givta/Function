import { Router } from 'express';
import { ReferralService } from '../services/ReferralService';
import { AuthMiddleware } from '../middleware/auth/AuthMiddleware';
import { collections } from '../config/firebase';
import { IReferral } from '../models';

const router = Router();

/**
 * Validate referral code
 * GET /api/referrals/validate/:code
 */
router.get('/validate/:code', async (req, res) => {
  try {
    const { code } = req.params;

    if (!code || code.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Referral code is required'
      });
    }

    // Try both uppercase and original case
    let result = await ReferralService.validateReferralCode(code.trim().toUpperCase());
    if (!result.valid) {
      result = await ReferralService.validateReferralCode(code.trim());
    }

    res.json({
      success: true,
      valid: result.valid,
      user: result.user ? {
        id: result.user.id,
        username: result.user.username,
        referralCode: result.user.referralCode
      } : null
    });

  } catch (error: any) {
    console.error('Validate referral code error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate referral code'
    });
  }
});

/**
 * Get referral statistics (Authenticated)
 * GET /api/referrals/stats
 */
router.get('/stats', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const stats = await ReferralService.getReferralStats(userId);

    res.json({
      success: true,
      data: stats
    });

  } catch (error: any) {
    console.error('Get referral stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get referral statistics'
    });
  }
});

/**
 * Get referral leaderboard
 * GET /api/referrals/leaderboard
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const leaderboard = await ReferralService.getReferralLeaderboard(limit);

    res.json({
      success: true,
      data: leaderboard
    });

  } catch (error: any) {
    console.error('Get referral leaderboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get referral leaderboard'
    });
  }
});

/**
 * Get user's referrals list (Authenticated)
 * GET /api/referrals
 */
router.get('/', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get all referrals by this user
    const querySnapshot = await collections.referrals
      .where('referrerId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .offset(offset)
      .get();

    const referrals = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as IReferral[];

    // Get referred user details
    const referralsWithUserDetails = await Promise.all(
      referrals.map(async (referral) => {
        const referredUser = await ReferralService['getUserById'](referral.referredId);
        return {
          id: referral.id,
          referrerId: referral.referrerId,
          referredId: referral.referredId,
          level: referral.level,
          bonus: referral.bonus,
          status: referral.status,
          createdAt: referral.createdAt,
          referredUserName: referredUser?.username || 'Unknown User',
          referredUserEmail: referredUser?.email || ''
        };
      })
    );

    res.json({
      success: true,
      data: referralsWithUserDetails
    });

  } catch (error: any) {
    console.error('Get referrals error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get referrals'
    });
  }
});

/**
 * Get referral code (Authenticated)
 * GET /api/referrals/code
 */
router.get('/code', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const stats = await ReferralService.getReferralStats(userId);

    res.json({
      success: true,
      data: {
        referralCode: stats.referralCode,
        totalReferrals: stats.totalReferrals,
        totalBonusEarned: stats.totalEarnings
      }
    });

  } catch (error: any) {
    console.error('Get referral code error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get referral code'
    });
  }
});

/**
 * Get referral history (Authenticated)
 * GET /api/referrals/history
 */
router.get('/history', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get all referrals by this user
    const querySnapshot = await collections.referrals
      .where('referrerId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .offset(offset)
      .get();

    const referrals = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as IReferral[];

    // Get referred user details and format as activities
    const activities = await Promise.all(
      referrals.map(async (referral) => {
        const referredUser = await ReferralService['getUserById'](referral.referredId);
        return {
          id: referral.id,
          type: 'referral',
          userId: referral.referredId,
          userName: referredUser?.username || 'Unknown User',
          bonus: referral.bonus,
          level: referral.level,
          date: referral.createdAt,
          status: referral.status
        };
      })
    );

    // Get total count
    const allReferralsQuery = await collections.referrals
      .where('referrerId', '==', userId)
      .get();
    const total = allReferralsQuery.size;

    res.json({
      success: true,
      data: {
        activities,
        total
      }
    });

  } catch (error: any) {
    console.error('Get referral history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get referral history'
    });
  }
});

/**
 * Get referral support/FAQ
 * GET /api/referrals/support
 */
router.get('/support', async (req, res) => {
  try {
    const support = {
      faq: [
        {
          question: 'How does the referral system work?',
          answer: 'Share your referral code with friends. When they sign up and make their first transaction, you earn bonuses based on the referral levels.'
        },
        {
          question: 'What are the bonus levels?',
          answer: 'Level 1: ₦100 when friend registers. Level 2: ₦50 when friend makes first transaction. Level 3: ₦25 when friend becomes active. And more levels up to 6!'
        },
        {
          question: 'How do I withdraw my referral earnings?',
          answer: 'Once you have earnings above ₦1000, you can withdraw them to your bank account through the app.'
        }
      ],
      contact: {
        email: 'support@givta.com',
        whatsapp: '+2341234567890',
        hours: 'Mon-Fri 9AM-6PM WAT'
      },
      videoTutorials: [
        {
          title: 'How to Share Your Referral Code',
          url: 'https://givta.com/tutorial/referral-code',
          duration: '2:30'
        },
        {
          title: 'Understanding Referral Bonuses',
          url: 'https://givta.com/tutorial/referral-bonuses',
          duration: '3:15'
        }
      ]
    };

    res.json({
      success: true,
      data: support
    });

  } catch (error: any) {
    console.error('Get referral support error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get referral support'
    });
  }
});

/**
 * Generate referral QR code
 * GET /api/referrals/qr
 */
router.get('/qr', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const size = req.query.size as string || '200x200';

    const stats = await ReferralService.getReferralStats(userId);
    const referralUrl = `https://givta.com/refer/${stats.referralCode}`;

    // Generate QR code data (simplified - in production use a QR library)
    const qrData = `REFERRAL:${stats.referralCode}`;

    res.json({
      success: true,
      data: {
        referralUrl,
        referralCode: stats.referralCode,
        qrData,
        size
      }
    });

  } catch (error: any) {
    console.error('Generate referral QR error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate referral QR code'
    });
  }
});

/**
 * Withdraw referral earnings
 * POST /api/referrals/current/withdraw
 */
router.post('/current/withdraw', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { amount, accountNumber, bankCode, accountName } = req.body;

    if (!amount || !accountNumber || !bankCode || !accountName) {
      return res.status(400).json({
        success: false,
        error: 'Amount, account number, bank code, and account name are required'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than 0'
      });
    }

    // Get user's referral stats
    const stats = await ReferralService.getReferralStats(userId);

    if (stats.totalEarnings < amount) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient referral earnings'
      });
    }

    // TODO: Implement actual withdrawal logic with Paystack
    // For now, just return success
    const withdrawalId = `REF_WD_${Date.now()}_${userId.slice(-6)}`;
    const fee = Math.max(amount * 0.02, 50); // 2% fee, minimum ₦50
    const netAmount = amount - fee;

    res.json({
      success: true,
      message: 'Referral withdrawal initiated successfully',
      data: {
        withdrawalId,
        netAmount,
        fee,
        amount
      }
    });

  } catch (error: any) {
    console.error('Withdraw referral earnings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to withdraw referral earnings'
    });
  }
});

export default router;
