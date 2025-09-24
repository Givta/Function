export interface IWallet {
  id: string;
  userId: string;
  balance: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  totalDeposits: number;
  totalWithdrawals: number;
  totalTipsSent: number;
  totalTipsReceived: number;
  totalReferralEarnings: number;
  lastTransactionAt?: Date;
  encryptedPin?: string;
  failedPinAttempts: number;
  pinLockedUntil?: Date;
}

export class WalletModel {
  static createWalletData(data: Partial<IWallet>): IWallet {
    const now = new Date();
    return {
      id: data.id || '',
      userId: data.userId || '',
      balance: data.balance || 0,
      currency: data.currency || 'NGN',
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      isActive: data.isActive !== undefined ? data.isActive : true,
      totalDeposits: data.totalDeposits || 0,
      totalWithdrawals: data.totalWithdrawals || 0,
      totalTipsSent: data.totalTipsSent || 0,
      totalTipsReceived: data.totalTipsReceived || 0,
      totalReferralEarnings: data.totalReferralEarnings || 0,
      lastTransactionAt: data.lastTransactionAt,
      encryptedPin: data.encryptedPin,
      failedPinAttempts: data.failedPinAttempts || 0,
      pinLockedUntil: data.pinLockedUntil
    };
  }

  static updateWalletData(wallet: IWallet, updates: Partial<IWallet>): IWallet {
    return {
      ...wallet,
      ...updates,
      updatedAt: new Date()
    };
  }
}
