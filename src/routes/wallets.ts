import { Router } from 'express';
import { AuthMiddleware } from '../middleware/auth/AuthMiddleware';
import { WalletService } from '../services/WalletService';
import { collections } from '../config/firebase';

const router = Router();

// Apply authentication to all routes
router.use(AuthMiddleware.authenticate);

/**
 * Get wallet balance
 * GET /api/wallets/balance
 */
router.get('/balance', async (req, res) => {
  try {
    const userId = req.user!.id;
    const balance = await WalletService.getWalletBalance(userId);

    res.json({
      success: true,
      data: balance
    });
  } catch (error: any) {
    console.error('Get wallet balance error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get wallet balance'
    });
  }
});

/**
 * Get transaction history
 * GET /api/wallets/transactions
 */
router.get('/transactions', async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const transactions = await WalletService.getTransactionHistory(userId, limit, offset);

    // Get total count for pagination
    const allTransactionsQuery = await collections.transactions
      .where('userId', '==', userId)
      .get();
    const total = allTransactionsQuery.size;

    res.json({
      success: true,
      data: {
        transactions,
        total
      }
    });
  } catch (error: any) {
    console.error('Get transaction history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get transaction history'
    });
  }
});

/**
 * Get wallet statistics
 * GET /api/wallets/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user!.id;
    const stats = await WalletService.getWalletStatistics(userId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error('Get wallet stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get wallet statistics'
    });
  }
});

/**
 * Withdraw from wallet
 * POST /api/wallets/withdraw
 */
router.post('/withdraw', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { amount, accountNumber, bankCode, accountName, description } = req.body;

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

    const result = await WalletService.processWithdrawal(
      userId,
      amount,
      accountNumber,
      bankCode,
      accountName,
      description
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: 'Withdrawal initiated successfully',
      data: {
        transactionId: result.transactionId,
        newBalance: result.newBalance,
        amount,
        fee: Math.round(amount * 0.04),
        netAmount: amount - Math.round(amount * 0.04)
      }
    });
  } catch (error: any) {
    console.error('Wallet withdrawal error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate withdrawal'
    });
  }
});

/**
 * Get withdrawal limits and requirements
 * GET /api/wallets/withdrawal-limits
 */
router.get('/withdrawal-limits', async (req, res) => {
  try {
    const userId = req.user!.id;

    // Get recent transactions for daily limit calculation
    const recentTransactions = await WalletService.getTransactionHistory(userId, 100);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayWithdrawals = recentTransactions.filter(t =>
      t.createdAt >= today && t.type === 'withdrawal'
    );

    const todayTotal = todayWithdrawals.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const remainingDailyLimit = Math.max(0, 1000000 - todayTotal);

    const limits = {
      minimumAmount: 100,
      maximumAmount: 500000,
      dailyLimit: 1000000,
      remainingDailyLimit,
      feePercentage: 4,
      feeDescription: '4% processing fee'
    };

    res.json({
      success: true,
      data: limits
    });
  } catch (error: any) {
    console.error('Get withdrawal limits error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get withdrawal limits'
    });
  }
});

export default router;
