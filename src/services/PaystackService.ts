import axios from 'axios';
import { collections } from '../config/firebase';
import { v4 as uuidv4 } from 'uuid';

export interface PaystackPaymentData {
  amount: number;
  email: string;
  reference?: string;
  callback_url?: string;
  metadata?: any;
}

export interface PaystackResponse {
  status: boolean;
  message: string;
  data?: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export interface PaystackWebhookData {
  event: string;
  data: {
    id: number;
    reference: string;
    amount: number;
    currency: string;
    status: string;
    paid_at: string;
    customer: {
      email: string;
    };
    metadata?: any;
  };
}

export class PaystackService {
  private static readonly BASE_URL = 'https://api.paystack.co';
  private static readonly SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';

  /**
   * Initialize a payment
   */
  static async initializePayment(paymentData: PaystackPaymentData): Promise<PaystackResponse> {
    try {
      const reference = paymentData.reference || `givta_${uuidv4()}`;

      const payload = {
        amount: paymentData.amount * 100, // Convert to kobo
        email: paymentData.email,
        reference,
        callback_url: paymentData.callback_url,
        metadata: {
          ...paymentData.metadata,
          idempotency_key: `init_${reference}_${Date.now()}`, // Add idempotency for duplicate prevention
          timestamp: new Date().toISOString()
        },
        channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer']
      };

      console.log('Initializing Paystack payment:', {
        reference,
        amount: payload.amount,
        email: payload.email,
        channels: payload.channels.length
      });

      const response = await axios.post(
        `${this.BASE_URL}/transaction/initialize`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.SECRET_KEY}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': payload.metadata.idempotency_key // Prevent duplicate requests
          },
        }
      );

      console.log('Paystack payment initialized successfully:', reference);

      return {
        status: response.data.status,
        message: response.data.message,
        data: response.data.data
      };
    } catch (error: any) {
      console.error('Paystack initialization error:', {
        message: error.response?.data?.message || error.message,
        status: error.response?.status,
        reference: paymentData.reference
      });

      return {
        status: false,
        message: error.response?.data?.message || 'Payment initialization failed'
      };
    }
  }

  /**
   * Verify a payment
   */
  static async verifyPayment(reference: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.BASE_URL}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${this.SECRET_KEY}`,
          },
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Paystack verification error:', error.response?.data || error.message);
      throw new Error('Payment verification failed');
    }
  }

  /**
   * Handle Paystack webhook
   */
  static async handleWebhook(webhookData: PaystackWebhookData): Promise<void> {
    try {
      const { event, data } = webhookData;

      console.log('Paystack webhook received:', {
        event,
        reference: data.reference,
        amount: data.amount,
        currency: data.currency,
        status: data.status,
        customer: data.customer.email
      });

      // Validate webhook data
      if (!data.reference || !data.amount || !data.currency) {
        throw new Error('Invalid webhook data: missing required fields');
      }

      // Check for duplicate webhook processing
      const existingLog = await collections.webhookLogs
        .where('reference', '==', data.reference)
        .where('event', '==', event)
        .where('processed', '==', true)
        .limit(1)
        .get();

      if (!existingLog.empty) {
        console.log('Webhook already processed:', data.reference, event);
        return;
      }

      // Log webhook receipt
      await collections.webhookLogs.doc().set({
        reference: data.reference,
        event,
        amount: data.amount,
        currency: data.currency,
        status: data.status,
        customerEmail: data.customer.email,
        receivedAt: new Date(),
        processed: false,
        metadata: data
      });

      if (event === 'charge.success') {
        await this.processSuccessfulPayment(data);
      } else if (event === 'charge.failed') {
        await this.processFailedPayment(data);
      } else {
        console.log('Unhandled webhook event:', event);
      }

      // Mark as processed
      await collections.webhookLogs
        .where('reference', '==', data.reference)
        .where('event', '==', event)
        .where('processed', '==', false)
        .limit(1)
        .get()
        .then((snapshot: any) => {
          if (!snapshot.empty) {
            snapshot.docs[0].ref.update({
              processed: true,
              processedAt: new Date()
            });
          }
        });

    } catch (error: any) {
      console.error('Webhook processing error:', {
        error: error.message,
        reference: webhookData.data?.reference,
        event: webhookData.event
      });
      throw error;
    }
  }

  /**
   * Process successful payment
   */
  private static async processSuccessfulPayment(paymentData: PaystackWebhookData['data']): Promise<void> {
    try {
      const { reference, amount, customer } = paymentData;

      // Find transaction by reference
      const transactionQuery = await collections.transactions
        .where('reference', '==', reference)
        .limit(1)
        .get();

      if (transactionQuery.empty) {
        console.warn('Transaction not found for reference:', reference);
        return;
      }

      const transactionDoc = transactionQuery.docs[0];
      const transactionData = transactionDoc.data();
      const transaction = {
        id: transactionDoc.id,
        userId: transactionData.userId,
        ...transactionData
      };

      // Update transaction status
      await collections.transactions.doc(transaction.id).update({
        status: 'completed',
        updatedAt: new Date()
      });

      // Credit user wallet
      const { WalletService } = await import('./WalletService');
      await WalletService.creditWallet(
        transaction.userId,
        amount / 100, // Convert from kobo to naira
        'Wallet funding via Paystack',
        reference
      );

      // Send notification
      const { NotificationService } = await import('./NotificationService');
      await NotificationService.sendTransactionNotification(
        transaction.userId,
        'deposit',
        amount / 100,
        'NGN',
        reference
      );

      console.log('Payment processed successfully:', reference);

    } catch (error: any) {
      console.error('Process successful payment error:', error);
      throw error;
    }
  }

  /**
   * Process failed payment
   */
  private static async processFailedPayment(paymentData: PaystackWebhookData['data']): Promise<void> {
    try {
      const { reference } = paymentData;

      // Find and update transaction
      const transactionQuery = await collections.transactions
        .where('reference', '==', reference)
        .limit(1)
        .get();

      if (!transactionQuery.empty) {
        const transactionDoc = transactionQuery.docs[0];
        await collections.transactions.doc(transactionDoc.id).update({
          status: 'failed',
          updatedAt: new Date()
        });
      }

      console.log('Payment marked as failed:', reference);

    } catch (error: any) {
      console.error('Process failed payment error:', error);
      throw error;
    }
  }

  /**
   * Create payment link for WhatsApp
   */
  static async createPaymentLink(userId: string, amount: number): Promise<{
    success: boolean;
    paymentUrl?: string;
    reference?: string;
    error?: string;
  }> {
    try {
      // Get user details
      const userDoc = await collections.users.doc(userId).get();
      if (!userDoc.exists) {
        return { success: false, error: 'User not found' };
      }

      const user = userDoc.data();

      // Initialize payment
      const paymentResult = await this.initializePayment({
        amount,
        email: user!.email,
        metadata: {
          userId,
          type: 'wallet_funding'
        }
      });

      if (!paymentResult.status) {
        return { success: false, error: paymentResult.message };
      }

      // Create transaction record
      const transactionId = uuidv4();
      const transactionData = {
        id: transactionId,
        userId,
        type: 'deposit',
        amount,
        description: 'Wallet funding via WhatsApp',
        status: 'pending',
        reference: paymentResult.data!.reference,
        currency: 'NGN',
        fee: 0,
        netAmount: amount,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await collections.transactions.doc(transactionId).set(transactionData);

      return {
        success: true,
        paymentUrl: paymentResult.data!.authorization_url,
        reference: paymentResult.data!.reference
      };

    } catch (error: any) {
      console.error('Create payment link error:', error);
      return {
        success: false,
        error: error.message || 'Failed to create payment link'
      };
    }
  }

  /**
   * Get bank list for transfers
   */
  static async getBanks(): Promise<any[]> {
    try {
      const response = await axios.get(`${this.BASE_URL}/bank`, {
        headers: {
          Authorization: `Bearer ${this.SECRET_KEY}`,
        },
      });

      return response.data.data;
    } catch (error: any) {
      console.error('Get banks error:', error);
      return [];
    }
  }

  /**
   * Validate bank account
   */
  static async validateAccount(accountNumber: string, bankCode: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.BASE_URL}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        {
          headers: {
            Authorization: `Bearer ${this.SECRET_KEY}`,
          },
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Validate account error:', error);
      throw error;
    }
  }

  /**
   * Initiate bank transfer
   */
  static async initiateTransfer(
    amount: number,
    accountNumber: string,
    bankCode: string,
    accountName: string,
    reason: string,
    reference?: string
  ): Promise<any> {
    try {
      const transferRef = reference || `TRF_${uuidv4()}`;

      const payload = {
        type: 'nuban',
        name: accountName,
        account_number: accountNumber,
        bank_code: bankCode,
        amount: amount * 100, // Convert to kobo
        currency: 'NGN',
        reference: transferRef,
        reason
      };

      const response = await axios.post(
        `${this.BASE_URL}/transfer`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Initiate transfer error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Transfer initiation failed');
    }
  }

  /**
   * Check transfer status
   */
  static async checkTransferStatus(transferId: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.BASE_URL}/transfer/${transferId}`,
        {
          headers: {
            Authorization: `Bearer ${this.SECRET_KEY}`,
          },
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Check transfer status error:', error);
      throw error;
    }
  }
}
