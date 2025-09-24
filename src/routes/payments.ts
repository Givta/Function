import { Router } from 'express';
import { PaystackService } from '../services/PaystackService';

const router = Router();

/**
 * Paystack webhook endpoint
 * POST /api/payments/webhook/paystack
 */
router.post('/webhook/paystack', async (req, res) => {
  try {
    console.log('Paystack webhook received:', JSON.stringify(req.body, null, 2));

    // Verify webhook signature for security
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const signature = req.headers['x-paystack-signature'] as string;
    const body = JSON.stringify(req.body);

    if (secret && signature) {
      const crypto = await import('crypto');
      const expectedSignature = crypto.createHmac('sha512', secret)
        .update(body)
        .digest('hex');

      if (signature !== expectedSignature) {
        console.error('Invalid webhook signature');
        return res.status(400).json({
          success: false,
          error: 'Invalid signature'
        });
      }
    }

    // Process webhook
    await PaystackService.handleWebhook(req.body);

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error: any) {
    console.error('Paystack webhook error:', error);
    res.status(500).json({
      success: false,
      error: 'Webhook processing failed'
    });
  }
});

/**
 * Paystack transfer webhook endpoint
 * POST /api/payments/webhook/paystack-transfer
 */
router.post('/webhook/paystack-transfer', async (req, res) => {
  try {
    console.log('Paystack transfer webhook received:', JSON.stringify(req.body, null, 2));

    // Verify webhook signature for security
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const signature = req.headers['x-paystack-signature'] as string;
    const body = JSON.stringify(req.body);

    if (secret && signature) {
      const crypto = await import('crypto');
      const expectedSignature = crypto.createHmac('sha512', secret)
        .update(body)
        .digest('hex');

      if (signature !== expectedSignature) {
        console.error('Invalid transfer webhook signature');
        return res.status(400).json({
          success: false,
          error: 'Invalid signature'
        });
      }
    }

    const { event, data } = req.body;

    if (event === 'transfer.success') {
      // Update withdrawal transaction status
      const transferId = data.id;
      const reference = data.reference;

      // Find transaction by reference
      const { collections } = await import('../config/firebase');
      const transactionQuery = await collections.transactions
        .where('reference', '==', reference)
        .where('type', '==', 'withdrawal')
        .limit(1)
        .get();

      if (!transactionQuery.empty) {
        const transactionDoc = transactionQuery.docs[0];
        const transactionId = transactionDoc.id;

        // Update transaction status to completed
        await collections.transactions.doc(transactionId).update({
          status: 'completed',
          updatedAt: new Date(),
          completedAt: new Date()
        });

        // Send notification
        const transactionData = transactionDoc.data();
        const { NotificationService } = await import('../services/NotificationService');
        await NotificationService.sendTransactionNotification(
          transactionData.userId,
          'withdrawal',
          Math.abs(transactionData.amount),
          'NGN',
          reference
        );

        console.log('Withdrawal completed successfully:', reference);
      }
    } else if (event === 'transfer.failed' || event === 'transfer.reversed') {
      // Update withdrawal transaction status to failed
      const reference = data.reference;

      const { collections } = await import('../config/firebase');
      const transactionQuery = await collections.transactions
        .where('reference', '==', reference)
        .where('type', '==', 'withdrawal')
        .limit(1)
        .get();

      if (!transactionQuery.empty) {
        const transactionDoc = transactionQuery.docs[0];
        const transactionId = transactionDoc.id;
        const transactionData = transactionDoc.data();

        // Refund the amount back to wallet
        const { WalletService } = await import('../services/WalletService');
        await WalletService.creditWallet(
          transactionData.userId,
          Math.abs(transactionData.amount),
          'Withdrawal refund - transfer failed',
          reference
        );

        // Update transaction status
        await collections.transactions.doc(transactionId).update({
          status: 'failed',
          updatedAt: new Date()
        });

        console.log('Withdrawal failed and refunded:', reference);
      }
    }

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Transfer webhook processed successfully'
    });

  } catch (error: any) {
    console.error('Paystack transfer webhook error:', error);
    res.status(500).json({
      success: false,
      error: 'Transfer webhook processing failed'
    });
  }
});

/**
 * Manually verify and complete payment (for development/testing)
 * POST /api/payments/verify/:reference
 */
router.post('/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;

    console.log('Manually verifying payment:', reference);

    // Verify payment with Paystack
    const verificationResult = await PaystackService.verifyPayment(reference);

    if (verificationResult.status && verificationResult.data.status === 'success') {
      // Process successful payment
      const paymentData = {
        event: 'charge.success',
        data: {
          id: verificationResult.data.id,
          reference: verificationResult.data.reference,
          amount: verificationResult.data.amount,
          currency: verificationResult.data.currency,
          status: verificationResult.data.status,
          paid_at: verificationResult.data.paid_at,
          customer: {
            email: verificationResult.data.customer.email
          },
          metadata: verificationResult.data.metadata
        }
      };

      await PaystackService.handleWebhook(paymentData);

      res.json({
        success: true,
        message: 'Payment verified and processed successfully',
        data: verificationResult.data
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Payment not successful',
        data: verificationResult.data
      });
    }

  } catch (error: any) {
    console.error('Manual payment verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Payment verification failed'
    });
  }
});

/**
 * Initialize payment
 * POST /api/payments/initialize
 */
router.post('/initialize', async (req, res) => {
  try {
    const { amount, email } = req.body;

    if (!amount || !email) {
      return res.status(400).json({
        success: false,
        error: 'Amount and email are required'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than 0'
      });
    }

    const result = await PaystackService.initializePayment({
      amount,
      email
    });

    if (!result.status) {
      return res.status(400).json({
        success: false,
        error: result.message
      });
    }

    res.json({
      success: true,
      data: result.data
    });

  } catch (error: any) {
    console.error('Initialize payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize payment'
    });
  }
});

/**
 * Initialize Paystack payment (Frontend compatibility)
 * POST /api/paystack/initialize
 */
router.post('/paystack/initialize', async (req, res) => {
  try {
    const { amount, email } = req.body;

    if (!amount || !email) {
      return res.status(400).json({
        success: false,
        error: 'Amount and email are required'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than 0'
      });
    }

    const result = await PaystackService.initializePayment({
      amount,
      email
    });

    if (!result.status) {
      return res.status(400).json({
        success: false,
        error: result.message
      });
    }

    res.json({
      success: true,
      data: result.data
    });

  } catch (error: any) {
    console.error('Initialize Paystack payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize payment'
    });
  }
});

/**
 * Verify Paystack payment (Frontend compatibility)
 * GET /api/paystack/verify/:reference
 */
router.get('/paystack/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;

    console.log('Verifying Paystack payment:', reference);

    // Verify payment with Paystack
    const verificationResult = await PaystackService.verifyPayment(reference);

    if (verificationResult.status && verificationResult.data.status === 'success') {
      res.json({
        success: true,
        message: 'Payment verified successfully',
        data: {
          status: verificationResult.data.status,
          transaction: {
            id: verificationResult.data.id,
            reference: verificationResult.data.reference,
            amount: verificationResult.data.amount,
            currency: verificationResult.data.currency,
            status: verificationResult.data.status,
            paid_at: verificationResult.data.paid_at,
            customer: verificationResult.data.customer
          }
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Payment not successful',
        data: verificationResult.data
      });
    }

  } catch (error: any) {
    console.error('Verify Paystack payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Payment verification failed'
    });
  }
});

/**
 * Get bank list
 * GET /api/payments/banks
 */
router.get('/banks', async (req, res) => {
  try {
    const banks = await PaystackService.getBanks();

    res.json({
      success: true,
      data: banks
    });

  } catch (error: any) {
    console.error('Get banks error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch banks'
    });
  }
});

/**
 * Validate bank account
 * POST /api/payments/verify-bank-account
 */
router.post('/verify-bank-account', async (req, res) => {
  try {
    const { accountNumber, bankCode } = req.body;

    if (!accountNumber || !bankCode) {
      return res.status(400).json({
        success: false,
        error: 'Account number and bank code are required'
      });
    }

    const result = await PaystackService.validateAccount(accountNumber, bankCode);

    res.json({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error('Validate bank account error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate bank account'
    });
  }
});

export default router;
