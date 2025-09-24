import { Router } from 'express';
import { AuthMiddleware } from '../middleware/auth/AuthMiddleware';
import { WalletService } from '../services/WalletService';
import { collections } from '../config/firebase';

const router = Router();

// Apply authentication to all routes
router.use(AuthMiddleware.authenticate);

/**
 * Send a tip
 * POST /api/tips/send
 */
router.post('/send', async (req, res) => {
  try {
    const { recipientId, amount, message } = req.body;
    const senderId = req.user!.id;

    if (!recipientId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Recipient ID and amount are required'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than 0'
      });
    }

    const result = await WalletService.processTip(senderId, recipientId, amount, 'mobile_app', message || '');

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: 'Tip sent successfully',
      data: {
        transactionId: result.transactionId,
        newBalance: result.newBalance
      }
    });
  } catch (error: any) {
    console.error('Send tip error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send tip'
    });
  }
});

/**
 * Get tips sent by user
 * GET /api/tips/sent
 */
router.get('/sent', async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get tips sent by this user
    const querySnapshot = await collections.tips
      .where('senderId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .offset(offset)
      .get();

    const tips = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      success: true,
      data: tips
    });
  } catch (error: any) {
    console.error('Get tips sent error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sent tips'
    });
  }
});

/**
 * Get tips received by user
 * GET /api/tips/received
 */
router.get('/received', async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get tips received by this user
    const querySnapshot = await collections.tips
      .where('recipientId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .offset(offset)
      .get();

    const tips = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      success: true,
      data: tips
    });
  } catch (error: any) {
    console.error('Get tips received error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get received tips'
    });
  }
});

/**
 * Get tip statistics
 * GET /api/tips/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user!.id;

    // Get sent tips
    const sentTipsQuery = await collections.tips
      .where('senderId', '==', userId)
      .where('status', '==', 'completed')
      .get();

    // Get received tips
    const receivedTipsQuery = await collections.tips
      .where('recipientId', '==', userId)
      .where('status', '==', 'completed')
      .get();

    const sentTips = sentTipsQuery.docs.map(doc => doc.data());
    const receivedTips = receivedTipsQuery.docs.map(doc => doc.data());

    const stats = {
      totalTipsSent: sentTips.length,
      totalTipsReceived: receivedTips.length,
      totalAmountSent: sentTips.reduce((sum, tip) => sum + tip.amount, 0),
      totalAmountReceived: receivedTips.reduce((sum, tip) => sum + tip.netAmount, 0),
      totalFeesPaid: sentTips.reduce((sum, tip) => sum + tip.fee, 0),
      averageTipSent: sentTips.length > 0 ? sentTips.reduce((sum, tip) => sum + tip.amount, 0) / sentTips.length : 0,
      averageTipReceived: receivedTips.length > 0 ? receivedTips.reduce((sum, tip) => sum + tip.netAmount, 0) / receivedTips.length : 0,
      largestTipSent: sentTips.length > 0 ? Math.max(...sentTips.map(tip => tip.amount)) : 0,
      largestTipReceived: receivedTips.length > 0 ? Math.max(...receivedTips.map(tip => tip.netAmount)) : 0,
      monthlyStats: {
        sent: 0,
        received: 0
      }
    };

    // Calculate monthly stats
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    stats.monthlyStats.sent = sentTips.filter(tip =>
      tip.createdAt.toDate() >= currentMonth
    ).reduce((sum, tip) => sum + tip.amount, 0);

    stats.monthlyStats.received = receivedTips.filter(tip =>
      tip.createdAt.toDate() >= currentMonth
    ).reduce((sum, tip) => sum + tip.netAmount, 0);

    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error('Get tip stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tip statistics'
    });
  }
});

/**
 * Get user by tipping identifier (username, phone, or referral code)
 * GET /api/tip/:identifier
 */
router.get('/tip/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;

    if (!identifier) {
      return res.status(400).json({
        success: false,
        error: 'Identifier is required'
      });
    }

    // Try to find user by different identifiers
    let userDoc = null;
    let userData = null;

    // Try by username
    const usernameQuery = await collections.users
      .where('username', '==', identifier.toLowerCase())
      .limit(1)
      .get();

    if (!usernameQuery.empty) {
      userDoc = usernameQuery.docs[0];
      userData = userDoc.data();
    } else {
      // Try by phone number
      const phoneQuery = await collections.users
        .where('phoneNumber', '==', identifier)
        .limit(1)
        .get();

      if (!phoneQuery.empty) {
        userDoc = phoneQuery.docs[0];
        userData = userDoc.data();
      } else {
        // Try by referral code
        const referralQuery = await collections.users
          .where('referralCode', '==', identifier.toUpperCase())
          .limit(1)
          .get();

        if (!referralQuery.empty) {
          userDoc = referralQuery.docs[0];
          userData = userDoc.data();
        }
      }
    }

    if (!userDoc || !userData) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get wallet balance
    const walletDoc = await collections.wallets.doc(userDoc.id).get();
    const walletData = walletDoc.data();

    const result = {
      userId: userDoc.id,
      name: userData.displayName || userData.email || 'Anonymous User',
      walletBalance: walletData?.balance || 0
    };

    res.json({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error('Get user by tipping identifier error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to find user'
    });
  }
});

/**
 * Generate tip link
 * POST /api/tips/generate-link
 */
router.post('/generate-link', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { amount, message, expiresIn } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid amount is required'
      });
    }

    // Get user details
    const userDoc = await collections.users.doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = userDoc.data()!;

    // Generate unique tip link ID
    const tipLinkId = `TL_${Date.now()}_${userId.slice(-6)}`;

    // Calculate expiration (default 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (expiresIn || 7));

    // Create tip link record
    const tipLinkData = {
      id: tipLinkId,
      creatorId: userId,
      amount,
      message: message || '',
      status: 'active',
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 0,
      totalReceived: 0
    };

    await collections.tipLinks.doc(tipLinkId).set(tipLinkData);

    // Generate shareable URL
    const baseUrl = process.env.FRONTEND_URL || 'https://givta.com';
    const shareableUrl = `${baseUrl}/tip/${tipLinkId}`;

    res.json({
      success: true,
      message: 'Tip link generated successfully',
      data: {
        tipLinkId,
        shareableUrl,
        amount,
        message,
        expiresAt: expiresAt.toISOString(),
        creator: {
          name: userData.displayName || userData.username || 'Anonymous',
          username: userData.username
        }
      }
    });

  } catch (error: any) {
    console.error('Generate tip link error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate tip link'
    });
  }
});

/**
 * Get tip link details (public endpoint)
 * GET /api/tips/link/:tipLinkId
 */
router.get('/link/:tipLinkId', async (req, res) => {
  try {
    const { tipLinkId } = req.params;

    const tipLinkDoc = await collections.tipLinks.doc(tipLinkId).get();
    if (!tipLinkDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Tip link not found'
      });
    }

    const tipLinkData = tipLinkDoc.data()!;

    // Check if expired
    if (tipLinkData.expiresAt.toDate() < new Date()) {
      return res.status(410).json({
        success: false,
        error: 'Tip link has expired'
      });
    }

    // Check if active
    if (tipLinkData.status !== 'active') {
      return res.status(410).json({
        success: false,
        error: 'Tip link is no longer active'
      });
    }

    // Get creator details
    const creatorDoc = await collections.users.doc(tipLinkData.creatorId).get();
    const creatorData = creatorDoc.data();

    res.json({
      success: true,
      data: {
        tipLinkId,
        amount: tipLinkData.amount,
        message: tipLinkData.message,
        expiresAt: tipLinkData.expiresAt.toDate().toISOString(),
        usageCount: tipLinkData.usageCount,
        totalReceived: tipLinkData.totalReceived,
        creator: {
          name: creatorData?.displayName || creatorData?.username || 'Anonymous',
          username: creatorData?.username
        }
      }
    });

  } catch (error: any) {
    console.error('Get tip link error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tip link'
    });
  }
});

/**
 * Send tip via link (for external tippers)
 * POST /api/tips/link/:tipLinkId/send
 */
router.post('/link/:tipLinkId/send', async (req, res) => {
  try {
    const { tipLinkId } = req.params;
    const { amount, tipperName, tipperEmail, paymentMethod } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid tip amount is required'
      });
    }

    // Get tip link
    const tipLinkDoc = await collections.tipLinks.doc(tipLinkId).get();
    if (!tipLinkDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Tip link not found'
      });
    }

    const tipLinkData = tipLinkDoc.data()!;

    // Check if expired
    if (tipLinkData.expiresAt.toDate() < new Date()) {
      return res.status(410).json({
        success: false,
        error: 'Tip link has expired'
      });
    }

    // Check if active
    if (tipLinkData.status !== 'active') {
      return res.status(410).json({
        success: false,
        error: 'Tip link is no longer active'
      });
    }

    // For fixed amount links, ensure amount matches
    if (tipLinkData.amount > 0 && amount !== tipLinkData.amount) {
      return res.status(400).json({
        success: false,
        error: `Tip amount must be exactly ₦${tipLinkData.amount}`
      });
    }

    // Calculate platform fee (2.5% for anonymous tips)
    const fee = Math.round(amount * 0.025);
    const netAmount = amount - fee;

    // Credit creator's wallet with net amount (after fee deduction)
    const result = await WalletService.creditWallet(
      tipLinkData.creatorId,
      netAmount,
      `Tip received via link from ${tipperName || 'Anonymous'}`,
      `TIP_LINK_${tipLinkId}_${Date.now()}`
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    // Update tip link stats (track gross amount received)
    await collections.tipLinks.doc(tipLinkId).update({
      usageCount: tipLinkData.usageCount + 1,
      totalReceived: tipLinkData.totalReceived + amount,
      updatedAt: new Date()
    });

    // Create tip record
    const tipId = `TIP_LINK_${Date.now()}_${tipLinkId.slice(-6)}`;
    const tipData = {
      id: tipId,
      senderId: null, // Anonymous/external tipper
      recipientId: tipLinkData.creatorId,
      amount,
      description: `Tip via link: ${tipLinkData.message || 'No message'}`,
      isAnonymous: true,
      status: 'completed',
      currency: 'NGN',
      fee, // 2% platform fee
      netAmount,
      platform: 'external',
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: new Date(),
      tipperInfo: {
        name: tipperName,
        email: tipperEmail,
        paymentMethod
      }
    };

    await collections.tips.doc(tipId).set(tipData);

    res.json({
      success: true,
      message: 'Tip sent successfully via link',
      data: {
        tipId,
        amount,
        fee,
        netAmount,
        tipLinkId,
        creatorReceived: netAmount
      }
    });

  } catch (error: any) {
    console.error('Send tip via link error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send tip via link'
    });
  }
});

/**
 * Get user's tip links
 * GET /api/tips/links
 */
router.get('/links', async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const querySnapshot = await collections.tipLinks
      .where('creatorId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .offset(offset)
      .get();

    const tipLinks = querySnapshot.docs.map(doc => {
      const data = doc.data();
      const baseUrl = process.env.FRONTEND_URL || 'https://givta.com';
      return {
        id: doc.id,
        ...data,
        shareableUrl: `${baseUrl}/tip/${doc.id}`,
        expiresAt: data.expiresAt.toDate().toISOString(),
        createdAt: data.createdAt.toDate().toISOString(),
        updatedAt: data.updatedAt.toDate().toISOString()
      };
    });

    res.json({
      success: true,
      data: tipLinks
    });

  } catch (error: any) {
    console.error('Get tip links error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tip links'
    });
  }
});

/**
 * Deactivate tip link
 * PUT /api/tips/link/:tipLinkId/deactivate
 */
router.put('/link/:tipLinkId/deactivate', async (req, res) => {
  try {
    const { tipLinkId } = req.params;
    const userId = req.user!.id;

    const tipLinkDoc = await collections.tipLinks.doc(tipLinkId).get();
    if (!tipLinkDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Tip link not found'
      });
    }

    const tipLinkData = tipLinkDoc.data()!;
    if (tipLinkData.creatorId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to modify this tip link'
      });
    }

    await collections.tipLinks.doc(tipLinkId).update({
      status: 'inactive',
      updatedAt: new Date()
    });

    res.json({
      success: true,
      message: 'Tip link deactivated successfully'
    });

  } catch (error: any) {
    console.error('Deactivate tip link error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate tip link'
    });
  }
});

/**
 * Withdraw from wallet (Legacy endpoint - use /api/wallets/withdraw instead)
 * POST /api/wallet/:userId/withdraw
 */
router.post('/wallet/:userId/withdraw', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, accountNumber, bankCode, accountName, description } = req.body;

    // Verify user owns this wallet
    if (userId !== req.user!.id) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to withdraw from this wallet'
      });
    }

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

    // Use the proper withdrawal service
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
        withdrawalId: result.transactionId,
        netAmount: amount - Math.round(amount * 0.04),
        fee: Math.round(amount * 0.04),
        amount,
        newBalance: result.newBalance
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

export default router;
