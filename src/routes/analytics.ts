import { Router } from 'express';
import { AuthMiddleware } from '../middleware/auth/AuthMiddleware';
import { collections } from '../config/firebase';
import { ReferralService } from '../services/ReferralService';

const router = Router();

// Apply authentication to all routes
router.use(AuthMiddleware.authenticate);

/**
 * Get comprehensive user dashboard analytics
 * GET /api/analytics/dashboard
 */
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user!.id;

    // Get user profile
    const userDoc = await collections.users.doc(userId).get();
    const user = userDoc.data();

    // Get wallet balance
    const walletDoc = await collections.wallets.doc(userId).get();
    const wallet = walletDoc.data();

    // Get recent transactions (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const transactionsQuery = await collections.transactions
      .where('userId', '==', userId)
      .where('createdAt', '>=', thirtyDaysAgo)
      .orderBy('createdAt', 'desc')
      .get();

    const transactions = transactionsQuery.docs.map(doc => doc.data());

    // Calculate spending vs earning
    const spending = transactions
      .filter(t => ['tip_sent', 'withdrawal', 'fee'].includes(t.type))
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const earnings = transactions
      .filter(t => ['tip_received', 'deposit', 'referral_bonus'].includes(t.type))
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // Transaction categories
    const categories = transactions.reduce((acc, t) => {
      acc[t.type] = (acc[t.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Recent activity (last 10 transactions)
    const recentActivity = transactions.slice(0, 10).map(t => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      description: t.description,
      date: t.createdAt.toDate().toISOString(),
      status: t.status
    }));

    // Referral stats
    const referralStats = await ReferralService.getReferralStats(userId);

    // Goals and targets (mock data - could be user-set goals)
    const monthlyGoal = 50000; // ₦50,000 monthly target
    const monthlyProgress = earnings * 0.8; // Assuming 80% of earnings are towards goals

    const dashboard = {
      user: {
        name: user?.displayName || user?.username,
        username: user?.username,
        joinDate: user?.createdAt?.toDate().toISOString(),
        kycStatus: user?.kycStatus,
        referralCode: user?.referralCode
      },
      wallet: {
        balance: wallet?.balance || 0,
        currency: 'NGN'
      },
      summary: {
        thisMonth: {
          spending,
          earnings,
          transactions: transactions.length,
          netFlow: earnings - spending
        },
        categories,
        recentActivity
      },
      referrals: {
        totalReferrals: referralStats.totalReferrals,
        totalEarnings: referralStats.totalEarnings,
        levelBreakdown: referralStats.levelStats
      },
      goals: {
        monthlyTarget: monthlyGoal,
        currentProgress: monthlyProgress,
        percentageComplete: Math.min((monthlyProgress / monthlyGoal) * 100, 100)
      },
      insights: {
        topCategory: Object.entries(categories)
          .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none',
        avgTransaction: transactions.length > 0 ?
          transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0) / transactions.length : 0,
        mostActiveDay: 'Wednesday', // Could calculate from actual data
        savingsRate: earnings > 0 ? ((earnings - spending) / earnings) * 100 : 0
      }
    };

    res.json({
      success: true,
      data: dashboard
    });

  } catch (error: any) {
    console.error('Get dashboard analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard analytics'
    });
  }
});

/**
 * Get user analytics (legacy endpoint)
 * GET /api/analytics
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const period = req.query.period as string || '30d';

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get transactions for the period
    const transactionsQuery = await collections.transactions
      .where('userId', '==', userId)
      .where('createdAt', '>=', startDate)
      .get();

    const transactions = transactionsQuery.docs.map(doc => doc.data());

    // Calculate analytics
    let totalSpent = 0;
    let totalEarned = 0;
    const categoryCount: { [key: string]: { amount: number; count: number } } = {};

    transactions.forEach((transaction: any) => {
      if (transaction.type === 'tip_sent' || transaction.type === 'withdrawal' || transaction.type === 'fee') {
        totalSpent += transaction.amount;
      } else if (transaction.type === 'tip_received' || transaction.type === 'deposit' || transaction.type === 'referral_bonus') {
        totalEarned += transaction.amount;
      }

      // Categorize transactions
      const category = transaction.type;
      if (!categoryCount[category]) {
        categoryCount[category] = { amount: 0, count: 0 };
      }
      categoryCount[category].amount += transaction.amount;
      categoryCount[category].count += 1;
    });

    const topCategories = Object.entries(categoryCount)
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        count: data.count
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const analytics = {
      totalSpent,
      totalEarned,
      transactionCount: transactions.length,
      topCategories
    };

    res.json({
      success: true,
      data: analytics
    });

  } catch (error: any) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get analytics'
    });
  }
});

export default router;
