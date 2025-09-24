import bcrypt from 'bcrypt';

export interface IUser {
  id: string;
  email?: string;
  username: string; // Required unique username for tipping
  phoneNumber?: string;
  photoURL?: string;
  emailVerified: boolean;
  passwordHash?: string;
  firebaseUid?: string; // Firebase Auth UID for frontend authentication
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  isActive: boolean;
  referralCode: string;
  referredBy?: string;
  referralLevel: number;
  totalReferrals: number;
  totalEarnings: number;
  preferences: {
    notifications: boolean;
    language: string;
    currency: string;
    theme: 'light' | 'dark' | 'system';
  };
  kycStatus: 'pending' | 'verified' | 'rejected' | 'not_submitted';
  kycDocuments?: {
    idCard?: string;
    passport?: string;
    utilityBill?: string;
  };
  whatsappId?: string;
  deviceTokens: string[];
  userType: 'user' | 'admin' | 'moderator';
  phoneVerified: boolean;
}

export class UserModel {
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static createUserData(data: Partial<IUser>): IUser {
    const now = new Date();
    return {
      id: data.id || '',
      email: data.email,
      username: data.username || '',
      phoneNumber: data.phoneNumber,
      photoURL: data.photoURL,
      emailVerified: data.emailVerified || false,
      passwordHash: data.passwordHash,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      lastLoginAt: data.lastLoginAt,
      isActive: data.isActive !== undefined ? data.isActive : true,
      referralCode: data.referralCode || '',
      referredBy: data.referredBy,
      referralLevel: data.referralLevel || 0,
      totalReferrals: data.totalReferrals || 0,
      totalEarnings: data.totalEarnings || 0,
      preferences: {
        notifications: data.preferences?.notifications !== undefined ? data.preferences.notifications : true,
        language: data.preferences?.language || 'en',
        currency: data.preferences?.currency || 'NGN',
        theme: data.preferences?.theme || 'system'
      },
      kycStatus: data.kycStatus || 'not_submitted',
      kycDocuments: data.kycDocuments,
      whatsappId: data.whatsappId,
      deviceTokens: data.deviceTokens || [],
      userType: data.userType || 'user',
      phoneVerified: data.phoneVerified || false
    };
  }
}
