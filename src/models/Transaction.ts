export interface ITransaction {
  id: string;
  userId: string;
  type: 'deposit' | 'withdrawal' | 'tip_sent' | 'tip_received' | 'referral_bonus' | 'fee';
  amount: number;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  reference?: string;
  recipientId?: string;
  senderId?: string;
  paymentMethod?: string;
  currency: string;
  fee?: number;
  netAmount: number;
  metadata?: {
    paystackReference?: string;
    flutterwaveReference?: string;
    bankDetails?: {
      accountNumber: string;
      bankCode: string;
      accountName: string;
    };
    tipDetails?: {
      message: string;
      isAnonymous: boolean;
    };
    referralDetails?: {
      level: number;
      referrerId: string;
    };
    whatsappMessageId?: string;
    tipId?: string;
    referredId?: string;
    platform?: string;
    level?: number;
    isAnonymous?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export class TransactionModel {
  static createTransactionData(data: Partial<ITransaction>): ITransaction {
    const now = new Date();
    return {
      id: data.id || '',
      userId: data.userId || '',
      type: data.type || 'deposit',
      amount: data.amount || 0,
      description: data.description || '',
      status: data.status || 'pending',
      reference: data.reference,
      recipientId: data.recipientId,
      senderId: data.senderId,
      paymentMethod: data.paymentMethod,
      currency: data.currency || 'NGN',
      fee: data.fee,
      netAmount: data.netAmount || 0,
      metadata: data.metadata,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      completedAt: data.completedAt
    };
  }

  static updateTransactionData(transaction: ITransaction, updates: Partial<ITransaction>): ITransaction {
    const updated = {
      ...transaction,
      ...updates,
      updatedAt: new Date()
    };

    // Auto-set completedAt when status becomes completed
    if (updates.status === 'completed' && !transaction.completedAt) {
      updated.completedAt = new Date();
    }

    return updated;
  }
}
