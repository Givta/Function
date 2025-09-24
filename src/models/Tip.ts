export interface ITip {
  id: string;
  senderId: string;
  recipientId: string;
  amount: number;
  description: string;
  isAnonymous: boolean;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  currency: string;
  fee: number;
  netAmount: number;
  platform: 'whatsapp' | 'mobile_app';
  metadata?: {
    senderName?: string;
    recipientName?: string;
    message?: string;
    whatsappMessageId?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export class TipModel {
  static createTipData(data: Partial<ITip>): ITip {
    const now = new Date();
    return {
      id: data.id || '',
      senderId: data.senderId || '',
      recipientId: data.recipientId || '',
      amount: data.amount || 0,
      description: data.description || '',
      isAnonymous: data.isAnonymous || false,
      status: data.status || 'pending',
      currency: data.currency || 'NGN',
      fee: data.fee || 0,
      netAmount: data.netAmount || 0,
      platform: data.platform || 'mobile_app',
      metadata: data.metadata,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      completedAt: data.completedAt
    };
  }

  static updateTipData(tip: ITip, updates: Partial<ITip>): ITip {
    const updated = {
      ...tip,
      ...updates,
      updatedAt: new Date()
    };

    // Auto-set completedAt when status becomes completed
    if (updates.status === 'completed' && !tip.completedAt) {
      updated.completedAt = new Date();
    }

    return updated;
  }
}
