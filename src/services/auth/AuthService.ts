import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { db, auth as firebaseAdminAuth } from '../../config/firebase';
import { IUser, UserModel } from '../../models';
import { v4 as uuidv4 } from 'uuid';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginCredentials {
  email?: string;
  phoneNumber?: string;
  password: string;
}

export interface RegisterData {
  email?: string;
  phoneNumber?: string;
  username: string;
  password: string;
  referralCode?: string;
}

export class AuthService {
  private static readonly JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
  private static readonly JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
  private static readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
  private static readonly JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

  /**
   * Register a new user
   */
  static async register(data: RegisterData): Promise<{ user: IUser; tokens: AuthTokens }> {
    // Check if user already exists
    if (data.email) {
      const existingUser = await this.getUserByEmail(data.email);
      if (existingUser) {
        throw new Error('User with this email already exists');
      }
    }

    if (data.phoneNumber) {
      const existingUser = await this.getUserByPhoneNumber(data.phoneNumber);
      if (existingUser) {
        throw new Error('User with this phone number already exists');
      }
    }

    // For Firebase Auth, we need an email. If no email provided, create a dummy one
    let firebaseEmail = data.email;
    if (!firebaseEmail && data.phoneNumber) {
      // Create a dummy email using phone number for Firebase Auth
      firebaseEmail = `${data.phoneNumber}@whatsapp.givta.local`;
    }

    if (!firebaseEmail) {
      throw new Error('Email is required for registration');
    }

    // Generate unique ID and referral code
    const userId = uuidv4();
    const referralCode = this.generateReferralCode(data.username);

    // Hash password
    const passwordHash = await UserModel.hashPassword(data.password);

    // Handle referral
    let referredBy: string | undefined;
    if (data.referralCode) {
      const referrer = await this.getUserByReferralCode(data.referralCode);
      if (referrer) {
        referredBy = referrer.id;
      }
    }

    // Create user data
    const userData = UserModel.createUserData({
      id: userId,
      email: data.email,
      phoneNumber: data.phoneNumber,
      username: data.username,
      passwordHash,
      referralCode,
      referredBy
    });

    // Create Firebase Auth user
    try {
      console.log('Creating Firebase Auth user for:', firebaseEmail);
      const firebaseUserRecord = await firebaseAdminAuth.createUser({
        email: firebaseEmail,
        password: data.password,
        displayName: data.username,
        emailVerified: false,
      });
      console.log('Firebase Auth user created:', firebaseUserRecord.uid);

      // Store Firebase UID in user data
      userData.firebaseUid = firebaseUserRecord.uid;
    } catch (firebaseError: any) {
      console.error('Firebase Auth creation error:', firebaseError);
      // If Firebase Auth creation fails, we still allow the user to be created
      // They can log in via the API but not through Firebase Auth
      console.warn('Continuing without Firebase Auth user creation');
    }

    // Save to Firestore
    await db.collection('users').doc(userId).set(userData);

    // Create wallet for the user
    const { WalletService } = await import('../WalletService');
    await WalletService.createWallet(userId);

    // Process referral if provided
    if (referredBy && data.referralCode) {
      const { ReferralService } = await import('../ReferralService');
      await ReferralService.processReferral(referredBy, userId, 'mobile_app');
    }

    // Generate tokens
    const tokens = this.generateTokens(userId);

    return { user: userData, tokens };
  }

  /**
   * Login user with credentials (flexible - email or phone)
   */
  static async login(credentials: LoginCredentials): Promise<{ user: IUser; tokens: AuthTokens }> {
    let user: IUser | null = null;
    let identifier = credentials.email || credentials.phoneNumber;

    if (!identifier) {
      throw new Error('Email or phone number is required');
    }

    // Clean the identifier
    identifier = identifier.trim();

    // Determine if it's an email or phone number
    const isEmail = identifier.includes('@');

    if (isEmail) {
      // Try email lookup
      user = await this.getUserByEmail(identifier);
    } else {
      // Try phone number lookup (clean it first)
      const cleanPhone = identifier.replace(/[^0-9]/g, '');
      if (cleanPhone.length >= 10) {
        user = await this.getUserByPhoneNumber(cleanPhone);
      }

      // If not found and it looks like a full international number, try with country code
      if (!user && cleanPhone.length >= 10) {
        // Try with +234 prefix if it's a Nigerian number
        if (cleanPhone.startsWith('0')) {
          const withCountryCode = '234' + cleanPhone.substring(1);
          user = await this.getUserByPhoneNumber(withCountryCode);
        }
      }
    }

    if (!user || !user.passwordHash) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isValidPassword = await UserModel.comparePassword(credentials.password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    await db.collection('users').doc(user.id).update({
      lastLoginAt: new Date(),
      updatedAt: new Date()
    });

    // Generate tokens
    const tokens = this.generateTokens(user.id);

    return { user, tokens };
  }

  /**
   * Verify JWT token and return user
   */
  static async verifyToken(token: string): Promise<IUser> {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as { userId: string };
      const user = await this.getUserById(decoded.userId);

      if (!user) {
        throw new Error('User not found');
      }

      return user;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  static async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const decoded = jwt.verify(refreshToken, this.JWT_REFRESH_SECRET) as { userId: string };
      const user = await this.getUserById(decoded.userId);

      if (!user) {
        throw new Error('User not found');
      }

      return this.generateTokens(decoded.userId);
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Generate access and refresh tokens
   */
  private static generateTokens(userId: string): AuthTokens {
    const accessToken = jwt.sign({ userId }, this.JWT_SECRET, {
      expiresIn: '15m'
    });

    const refreshToken = jwt.sign({ userId }, this.JWT_REFRESH_SECRET, {
      expiresIn: '7d'
    });

    return { accessToken, refreshToken };
  }

  /**
   * Get user by ID
   */
  static async getUserById(userId: string): Promise<IUser | null> {
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) return null;

    return doc.data() as IUser;
  }

  /**
   * Get user by email
   */
  static async getUserByEmail(email: string): Promise<IUser | null> {
    const querySnapshot = await db.collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (querySnapshot.empty) return null;

    const doc = querySnapshot.docs[0];
    return { id: doc.id, ...doc.data() } as IUser;
  }

  /**
   * Get user by phone number
   */
  static async getUserByPhoneNumber(phoneNumber: string): Promise<IUser | null> {
    try {
      console.log('Searching for user by phoneNumber:', phoneNumber);

      const querySnapshot = await db.collection('users')
        .where('phoneNumber', '==', phoneNumber)
        .limit(1)
        .get();

      console.log('Phone query result - empty:', querySnapshot.empty, 'size:', querySnapshot.size);

      if (querySnapshot.empty) return null;

      const doc = querySnapshot.docs[0];
      const userData = { id: doc.id, ...doc.data() } as IUser;
      console.log('Found user by phone:', userData.username, userData.phoneNumber);
      return userData;
    } catch (error: any) {
      console.error('Error getting user by phoneNumber:', error);
      return null;
    }
  }

  /**
   * Get user by referral code
   */
  static async getUserByReferralCode(referralCode: string): Promise<IUser | null> {
    const querySnapshot = await db.collection('users')
      .where('referralCode', '==', referralCode)
      .limit(1)
      .get();

    if (querySnapshot.empty) return null;

    const doc = querySnapshot.docs[0];
    return { id: doc.id, ...doc.data() } as IUser;
  }

  /**
   * Get user by username
   */
  static async getUserByUsername(username: string): Promise<IUser | null> {
    try {
      console.log('Searching for user by username:', username);

      const querySnapshot = await db.collection('users')
        .where('username', '==', username)
        .limit(1)
        .get();

      console.log('Query result - empty:', querySnapshot.empty, 'size:', querySnapshot.size);

      if (querySnapshot.empty) return null;

      const doc = querySnapshot.docs[0];
      const userData = { id: doc.id, ...doc.data() } as IUser;
      console.log('Found user:', userData.username, userData.phoneNumber);
      return userData;
    } catch (error: any) {
      console.error('Error getting user by username:', error);
      return null;
    }
  }

  /**
   * Search users by username (for tipping)
   */
  static async searchUsersByUsername(searchTerm: string, limit: number = 10): Promise<IUser[]> {
    try {
      // Note: Firestore doesn't support case-insensitive searches or partial matches
      // In production, you might want to use Algolia or implement a search index
      const querySnapshot = await db.collection('users')
        .where('username', '>=', searchTerm)
        .where('username', '<=', searchTerm + '\uf8ff')
        .limit(limit)
        .get();

      const users: IUser[] = [];
      querySnapshot.forEach(doc => {
        users.push({ id: doc.id, ...doc.data() } as IUser);
      });

      return users;
    } catch (error) {
      console.error('Search users by username error:', error);
      return [];
    }
  }

  /**
   * Generate unique referral code
   */
  private static generateReferralCode(displayName: string): string {
    const prefix = displayName.replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return prefix + random;
  }

  /**
   * Verify phone number with OTP (placeholder for Twilio integration)
   */
  static async sendPhoneVerification(phoneNumber: string): Promise<string> {
    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // TODO: Integrate with Twilio for SMS sending
    console.log(`OTP for ${phoneNumber}: ${otp}`);

    // Store OTP in cache/database with expiration
    // For now, just return it (in production, send via SMS)
    return otp;
  }

  /**
   * Verify OTP
   */
  static async verifyPhoneOTP(phoneNumber: string, otp: string): Promise<boolean> {
    // TODO: Verify OTP from cache/database
    // For now, accept any 6-digit code
    return /^\d{6}$/.test(otp);
  }

  /**
   * Send email verification
   */
  static async sendEmailVerification(email: string): Promise<string> {
    const token = uuidv4();

    // TODO: Send email with verification link
    console.log(`Verification token for ${email}: ${token}`);

    return token;
  }

  /**
   * Verify email token
   */
  static async verifyEmailToken(token: string): Promise<boolean> {
    // TODO: Verify token from database
    return true;
  }

  /**
   * Compare password with hash (public method for external use)
   */
  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return UserModel.comparePassword(password, hash);
  }
}
