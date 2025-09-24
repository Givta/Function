import { db, collections } from '../config/firebase';
import { IWallet, WalletModel, ITransaction, TransactionModel, IUser } from '../models';
import { v4 as uuidv4 } from 'uuid';

export interface WalletBalance {
  balance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalTipsSent: number;
  totalTipsReceived: number;
  totalReferralEarnings: number;
  availableBalance: number;
}

export interface TransactionResult {
  success: boolean;
  transactionId?: string;
  newBalance?: number;
  error?: string;
}

export class WalletService {
  /**
   * Create a new wallet for a user
   */
  static async createWallet(userId: string, currency: string = 'NGN'): Promise<IWallet> {
    const walletId = uuidv4();
    const walletData = WalletModel.createWalletData({
      id: walletId,
      userId,
      currency
    });

    await collections.wallets.doc(walletId).set(walletData);
    return walletData;
  }

  /**
   * Create wallet for existing user if they don't have one
   */
  static async ensureWalletExists(userId: string, currency: string = 'NGN'): Promise<IWallet> {
    let wallet = await this.getWalletByUserId(userId);
    if (!wallet) {
      wallet = await this.createWallet(userId, currency);
    }
    return wallet;
  }

  /**
   * Get wallet by user ID
   */
  static async getWalletByUserId(userId: string): Promise<IWallet | null> {
    const querySnapshot = await collections.wallets
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (querySnapshot.empty) return null;

    const doc = querySnapshot.docs[0];
    return { id: doc.id, ...doc.data() } as IWallet;
  }

  /**
   * Get wallet balance summary
   */
  static async getWalletBalance(userId: string): Promise<WalletBalance> {
    const wallet = await this.getWalletByUserId(userId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    return {
      balance: wallet.balance,
      totalDeposits: wallet.totalDeposits,
      totalWithdrawals: wallet.totalWithdrawals,
      totalTipsSent: wallet.totalTipsSent,
      totalTipsReceived: wallet.totalTipsReceived,
      totalReferralEarnings: wallet.totalReferralEarnings,
      availableBalance: wallet.balance
    };
  }

  /**
   * Credit wallet (add money)
   */
  static async creditWallet(
    userId: string,
    amount: number,
    description: string,
    reference?: string,
    metadata?: any
  ): Promise<TransactionResult> {
    try {
      const wallet = await this.getWalletByUserId(userId);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Update wallet balance
      const newBalance = wallet.balance + amount;
      const updatedWallet = WalletModel.updateWalletData(wallet, {
        balance: newBalance,
        totalDeposits: wallet.totalDeposits + amount,
        lastTransactionAt: new Date()
      });

      await collections.wallets.doc(wallet.id).update({
        balance: updatedWallet.balance,
        totalDeposits: updatedWallet.totalDeposits,
        lastTransactionAt: updatedWallet.lastTransactionAt,
        updatedAt: updatedWallet.updatedAt
      });

      // Create transaction record
      const transactionId = uuidv4();
      const transactionData = TransactionModel.createTransactionData({
        id: transactionId,
        userId,
        type: 'deposit',
        amount,
        description,
        status: 'completed',
        reference,
        currency: wallet.currency,
        fee: 0,
        netAmount: amount,
        metadata
      });

      await collections.transactions.doc(transactionId).set(transactionData);

      return {
        success: true,
        transactionId,
        newBalance
      };
    } catch (error: any) {
      console.error('Credit wallet error:', error);
      return {
        success: false,
        error: error.message || 'Failed to credit wallet'
      };
    }
  }

  /**
   * Debit wallet (subtract money)
   */
  static async debitWallet(
    userId: string,
    amount: number,
    description: string,
    fee: number = 0,
    reference?: string,
    metadata?: any
  ): Promise<TransactionResult> {
    try {
      const wallet = await this.getWalletByUserId(userId);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Check sufficient balance
      if (wallet.balance < amount) {
        throw new Error('Insufficient balance');
      }

      // Update wallet balance
      const newBalance = wallet.balance - amount;
      const updatedWallet = WalletModel.updateWalletData(wallet, {
        balance: newBalance,
        totalWithdrawals: wallet.totalWithdrawals + amount,
        lastTransactionAt: new Date()
      });

      await collections.wallets.doc(wallet.id).update({
        balance: updatedWallet.balance,
        totalWithdrawals: updatedWallet.totalWithdrawals,
        lastTransactionAt: updatedWallet.lastTransactionAt,
        updatedAt: updatedWallet.updatedAt
      });

      // Create transaction record
      const transactionId = uuidv4();
      const transactionData = TransactionModel.createTransactionData({
        id: transactionId,
        userId,
        type: 'withdrawal',
        amount: -amount,
        description,
        status: 'completed',
        reference,
        currency: wallet.currency,
        fee,
        netAmount: amount - fee,
        metadata
      });

      await collections.transactions.doc(transactionId).set(transactionData);

      return {
        success: true,
        transactionId,
        newBalance
      };
    } catch (error: any) {
      console.error('Debit wallet error:', error);
      return {
        success: false,
        error: error.message || 'Failed to debit wallet'
      };
    }
  }

  /**
   * Process tip between users
   */
  static async processTip(
    senderId: string,
    recipientId: string,
    amount: number,
    platform: 'whatsapp' | 'mobile_app',
    description?: string,
    isAnonymous: boolean = false
  ): Promise<TransactionResult> {
    try {
      // Validate sender and recipient
      if (senderId === recipientId) {
        throw new Error('Cannot tip yourself');
      }

      // Get sender wallet
      const senderWallet = await this.getWalletByUserId(senderId);
      if (!senderWallet) {
        throw new Error('Sender wallet not found');
      }

      // Get recipient wallet (create if doesn't exist)
      let recipientWallet = await this.getWalletByUserId(recipientId);
      if (!recipientWallet) {
        recipientWallet = await this.createWallet(recipientId, senderWallet.currency);
      }

      // Calculate fee based on platform
      const fee = platform === 'mobile_app'
        ? Math.round(amount * 0.02) // 2% for mobile app
        : Math.round(amount * 0.02); // 2% for WhatsApp

      const netAmount = amount - fee;

      // Check sender balance
      if (senderWallet.balance < amount) {
        throw new Error('Insufficient balance');
      }

      // Update sender wallet
      const senderNewBalance = senderWallet.balance - amount;
      const updatedSenderWallet = WalletModel.updateWalletData(senderWallet, {
        balance: senderNewBalance,
        totalTipsSent: senderWallet.totalTipsSent + amount,
        lastTransactionAt: new Date()
      });

      // Update recipient wallet
      const recipientNewBalance = recipientWallet.balance + netAmount;
      const updatedRecipientWallet = WalletModel.updateWalletData(recipientWallet, {
        balance: recipientNewBalance,
        totalTipsReceived: recipientWallet.totalTipsReceived + netAmount,
        lastTransactionAt: new Date()
      });

      // Save wallet updates
      await collections.wallets.doc(senderWallet.id).update({
        balance: updatedSenderWallet.balance,
        totalTipsSent: updatedSenderWallet.totalTipsSent,
        lastTransactionAt: updatedSenderWallet.lastTransactionAt,
        updatedAt: updatedSenderWallet.updatedAt
      });
      await collections.wallets.doc(recipientWallet.id).update({
        balance: updatedRecipientWallet.balance,
        totalTipsReceived: updatedRecipientWallet.totalTipsReceived,
        lastTransactionAt: updatedRecipientWallet.lastTransactionAt,
        updatedAt: updatedRecipientWallet.updatedAt
      });

      // Create tip record
      const tipId = uuidv4();
      const tipData = {
        id: tipId,
        senderId,
        recipientId,
        amount,
        description: description || `Tip received from ${isAnonymous ? 'Anonymous' : 'a user'}`,
        isAnonymous,
        status: 'completed' as const,
        currency: senderWallet.currency,
        fee,
        netAmount,
        platform,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: new Date()
      };

      await collections.tips.doc(tipId).set(tipData);

      // Create transaction records
      const senderTransactionId = uuidv4();
      const senderTransaction = TransactionModel.createTransactionData({
        id: senderTransactionId,
        userId: senderId,
        type: 'tip_sent',
        amount: -amount,
        description: `Tip sent to ${recipientId}`,
        status: 'completed',
        recipientId,
        currency: senderWallet.currency,
        fee,
        netAmount: -amount,
        metadata: {
          tipId,
          platform,
          isAnonymous
        }
      });

      const recipientTransactionId = uuidv4();
      const recipientTransaction = TransactionModel.createTransactionData({
        id: recipientTransactionId,
        userId: recipientId,
        type: 'tip_received',
        amount: netAmount,
        description: `Tip received from ${isAnonymous ? 'Anonymous' : senderId}`,
        status: 'completed',
        senderId,
        currency: recipientWallet.currency,
        fee: 0,
        netAmount,
        metadata: {
          tipId,
          platform,
          isAnonymous
        }
      });

      // Create fee transaction if applicable
      if (fee > 0) {
        const feeTransactionId = uuidv4();
        const feeTransaction = TransactionModel.createTransactionData({
          id: feeTransactionId,
          userId: senderId,
          type: 'fee',
          amount: -fee,
          description: 'Tip processing fee',
          status: 'completed',
          currency: senderWallet.currency,
          fee: 0,
          netAmount: -fee,
          metadata: {
            tipId,
            platform
          }
        });
        await collections.transactions.doc(feeTransactionId).set(feeTransaction);
      }

      await collections.transactions.doc(senderTransactionId).set(senderTransaction);
      await collections.transactions.doc(recipientTransactionId).set(recipientTransaction);

      return {
        success: true,
        transactionId: tipId,
        newBalance: senderNewBalance
      };
    } catch (error: any) {
      console.error('Process tip error:', error);
      return {
        success: false,
        error: error.message || 'Failed to process tip'
      };
    }
  }

  /**
   * Process referral bonus
   */
  static async processReferralBonus(
    referrerId: string,
    referredId: string,
    level: number,
    bonusAmount: number
  ): Promise<TransactionResult> {
    try {
      const wallet = await this.getWalletByUserId(referrerId);
      if (!wallet) {
        throw new Error('Referrer wallet not found');
      }

      // Update wallet balance
      const newBalance = wallet.balance + bonusAmount;
      const updatedWallet = WalletModel.updateWalletData(wallet, {
        balance: newBalance,
        totalReferralEarnings: wallet.totalReferralEarnings + bonusAmount,
        lastTransactionAt: new Date()
      });

      await collections.wallets.doc(wallet.id).update({
        balance: updatedWallet.balance,
        totalReferralEarnings: updatedWallet.totalReferralEarnings,
        lastTransactionAt: updatedWallet.lastTransactionAt,
        updatedAt: updatedWallet.updatedAt
      });

      // Create transaction record
      const transactionId = uuidv4();
      const transactionData = TransactionModel.createTransactionData({
        id: transactionId,
        userId: referrerId,
        type: 'referral_bonus',
        amount: bonusAmount,
        description: `Referral bonus for level ${level} referral`,
        status: 'completed',
        currency: wallet.currency,
        fee: 0,
        netAmount: bonusAmount,
        metadata: {
          referredId,
          level,
          referralDetails: {
            level,
            referrerId
          }
        }
      });

      await collections.transactions.doc(transactionId).set(transactionData);

      return {
        success: true,
        transactionId,
        newBalance
      };
    } catch (error: any) {
      console.error('Process referral bonus error:', error);
      return {
        success: false,
        error: error.message || 'Failed to process referral bonus'
      };
    }
  }

  /**
   * Get transaction history for a user
   */
  static async getTransactionHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<ITransaction[]> {
    const querySnapshot = await collections.transactions
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .offset(offset)
      .get();

    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as ITransaction[];
  }

  /**
   * Process withdrawal to bank account
   */
  static async processWithdrawal(
    userId: string,
    amount: number,
    accountNumber: string,
    bankCode: string,
    accountName: string,
    description?: string
  ): Promise<TransactionResult> {
    try {
      const wallet = await this.getWalletByUserId(userId);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Calculate withdrawal fee (2.3% as specified)
      const fee = Math.round(amount * 0.023);
      const netAmount = amount - fee;

      // Validate withdrawal limits
      const validation = this.validateTransactionLimits(amount, 'withdrawal');
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Check sufficient balance
      if (wallet.balance < amount) {
        throw new Error('Insufficient balance');
      }

      // Check daily withdrawal limits
      const recentTransactions = await this.getTransactionHistory(userId, 100);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayWithdrawals = recentTransactions.filter(t =>
        t.createdAt >= today && t.type === 'withdrawal'
      );

      const todayTotal = todayWithdrawals.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      if (todayTotal + amount > 1000000) { // ₦1M daily limit
        throw new Error('Daily withdrawal limit exceeded (₦1,000,000)');
      }

      // Validate bank account first
      const { PaystackService } = await import('./PaystackService');
      const accountValidation = await PaystackService.validateAccount(accountNumber, bankCode);
      if (!accountValidation.status) {
        throw new Error('Invalid bank account details');
      }

      // Verify account name matches
      if (accountValidation.data.account_name !== accountName) {
        throw new Error('Account name does not match the provided account number');
      }

      // Initiate bank transfer
      const transferResult = await PaystackService.initiateTransfer(
        netAmount,
        accountNumber,
        bankCode,
        accountName,
        description || 'Givta Wallet Withdrawal',
        `WD_${uuidv4()}`
      );

      if (!transferResult.status) {
        throw new Error(transferResult.message || 'Transfer initiation failed');
      }

      // Debit wallet immediately
      const newBalance = wallet.balance - amount;
      const updatedWallet = WalletModel.updateWalletData(wallet, {
        balance: newBalance,
        totalWithdrawals: wallet.totalWithdrawals + amount,
        lastTransactionAt: new Date()
      });

      await collections.wallets.doc(wallet.id).update({
        balance: updatedWallet.balance,
        totalWithdrawals: updatedWallet.totalWithdrawals,
        lastTransactionAt: updatedWallet.lastTransactionAt,
        updatedAt: updatedWallet.updatedAt
      });

      // Create transaction records
      const withdrawalTransactionId = uuidv4();
      const withdrawalTransaction = TransactionModel.createTransactionData({
        id: withdrawalTransactionId,
        userId,
        type: 'withdrawal',
        amount: -amount,
        description: `Withdrawal to ${accountName} (${accountNumber})`,
        status: 'pending', // Will be updated when transfer completes
        reference: transferResult.data.reference,
        currency: wallet.currency,
        fee,
        netAmount: -netAmount,
        metadata: {
          paystackReference: transferResult.data.reference,
          bankDetails: {
            accountNumber,
            bankCode,
            accountName
          }
        }
      });

      // Create fee transaction
      const feeTransactionId = uuidv4();
      const feeTransaction = TransactionModel.createTransactionData({
        id: feeTransactionId,
        userId,
        type: 'fee',
        amount: -fee,
        description: 'Withdrawal processing fee (2.3%)',
        status: 'completed',
        currency: wallet.currency,
        fee: 0,
        netAmount: -fee,
        metadata: {
          paystackReference: transferResult.data.reference
        }
      });

      await collections.transactions.doc(withdrawalTransactionId).set(withdrawalTransaction);
      await collections.transactions.doc(feeTransactionId).set(feeTransaction);

      // Send notification
      const { NotificationService } = await import('./NotificationService');
      await NotificationService.sendTransactionNotification(
        userId,
        'withdrawal',
        amount,
        'NGN',
        transferResult.data.reference
      );

      return {
        success: true,
        transactionId: withdrawalTransactionId,
        newBalance
      };

    } catch (error: any) {
      console.error('Process withdrawal error:', error);
      return {
        success: false,
        error: error.message || 'Failed to process withdrawal'
      };
    }
  }

  /**
   * Get wallet statistics
   */
  static async getWalletStatistics(userId: string): Promise<{
    totalTransactions: number;
    totalDeposits: number;
    totalWithdrawals: number;
    totalTipsSent: number;
    totalTipsReceived: number;
    totalReferralEarnings: number;
    averageTransactionAmount: number;
    largestTransaction: number;
    monthlyStats: {
      deposits: number;
      withdrawals: number;
      tips: number;
    };
  }> {
    try {
      const transactions = await this.getTransactionHistory(userId, 1000); // Get last 1000 transactions

      const stats = {
        totalTransactions: transactions.length,
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalTipsSent: 0,
        totalTipsReceived: 0,
        totalReferralEarnings: 0,
        averageTransactionAmount: 0,
        largestTransaction: 0,
        monthlyStats: {
          deposits: 0,
          withdrawals: 0,
          tips: 0
        }
      };

      const currentMonth = new Date();
      currentMonth.setDate(1);
      currentMonth.setHours(0, 0, 0, 0);

      transactions.forEach(transaction => {
        const absAmount = Math.abs(transaction.amount);

        // Track largest transaction
        if (absAmount > stats.largestTransaction) {
          stats.largestTransaction = absAmount;
        }

        // Categorize by type
        switch (transaction.type) {
          case 'deposit':
            stats.totalDeposits += absAmount;
            if (transaction.createdAt >= currentMonth) {
              stats.monthlyStats.deposits += absAmount;
            }
            break;
          case 'withdrawal':
            stats.totalWithdrawals += absAmount;
            if (transaction.createdAt >= currentMonth) {
              stats.monthlyStats.withdrawals += absAmount;
            }
            break;
          case 'tip_sent':
            stats.totalTipsSent += absAmount;
            if (transaction.createdAt >= currentMonth) {
              stats.monthlyStats.tips += absAmount;
            }
            break;
          case 'tip_received':
            stats.totalTipsReceived += absAmount;
            break;
          case 'referral_bonus':
            stats.totalReferralEarnings += absAmount;
            break;
        }
      });

      // Calculate average
      if (stats.totalTransactions > 0) {
        const totalAmount = stats.totalDeposits + stats.totalWithdrawals + stats.totalTipsSent + stats.totalTipsReceived + stats.totalReferralEarnings;
        stats.averageTransactionAmount = totalAmount / stats.totalTransactions;
      }

      return stats;

    } catch (error: any) {
      console.error('Get wallet statistics error:', error);
      return {
        totalTransactions: 0,
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalTipsSent: 0,
        totalTipsReceived: 0,
        totalReferralEarnings: 0,
        averageTransactionAmount: 0,
        largestTransaction: 0,
        monthlyStats: {
          deposits: 0,
          withdrawals: 0,
          tips: 0
        }
      };
    }
  }

  /**
   * Validate transaction limits
   */
  static validateTransactionLimits(
    amount: number,
    type: 'tip' | 'withdrawal' | 'deposit',
    userTransactions: ITransaction[] = []
  ): { valid: boolean; error?: string } {
    const limits = {
      tip: {
        minimum: 10,
        maximum: 50000,
        dailyLimit: 100000
      },
      withdrawal: {
        minimum: 100,
        maximum: 500000,
        dailyLimit: 1000000
      },
      deposit: {
        minimum: 100,
        maximum: 2000000,
        dailyLimit: 5000000
      }
    };

    const limit = limits[type];
    if (!limit) {
      return { valid: false, error: 'Invalid transaction type' };
    }

    if (amount < limit.minimum) {
      return { valid: false, error: `Minimum ${type} amount is ₦${limit.minimum.toLocaleString()}` };
    }

    if (amount > limit.maximum) {
      return { valid: false, error: `Maximum ${type} amount is ₦${limit.maximum.toLocaleString()}` };
    }

    // Check daily limits
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayTransactions = userTransactions.filter(t =>
      t.createdAt >= today && t.type === (type === 'tip' ? 'tip_sent' : type)
    );

    const todayTotal = todayTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

    if (todayTotal + amount > limit.dailyLimit) {
      return { valid: false, error: `Daily ${type} limit exceeded (₦${limit.dailyLimit.toLocaleString()})` };
    }

    return { valid: true };
  }
}
