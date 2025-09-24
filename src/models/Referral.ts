export interface IReferral {
  id: string;
  referrerId: string;
  referredId: string;
  level: number;
  bonus: number;
  status: 'pending' | 'completed' | 'cancelled';
  referralCode: string;
  platform: 'whatsapp' | 'mobile_app';
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  metadata?: {
    referrerName?: string;
    referredName?: string;
    bonusTransactionId?: string;
  };
}

export class ReferralModel {
  static createReferralData(data: Partial<IReferral>): IReferral {
    const now = new Date();
    return {
      id: data.id || '',
      referrerId: data.referrerId || '',
      referredId: data.referredId || '',
      level: data.level || 1,
      bonus: data.bonus || 0,
      status: data.status || 'pending',
      referralCode: data.referralCode || '',
      platform: data.platform || 'mobile_app',
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      completedAt: data.completedAt,
      metadata: data.metadata
    };
  }

  static updateReferralData(referral: IReferral, updates: Partial<IReferral>): IReferral {
    const updated = {
      ...referral,
      ...updates,
      updatedAt: new Date()
    };

    // Auto-set completedAt when status becomes completed
    if (updates.status === 'completed' && !referral.completedAt) {
      updated.completedAt = new Date();
    }

    return updated;
  }
}
