import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { collections } from '../config/firebase';
import { v4 as uuidv4 } from 'uuid';

export interface TwoFactorSetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface TwoFactorResult {
  success: boolean;
  error?: string;
  verified?: boolean;
  setup?: TwoFactorSetup;
}

export class TwoFactorService {
  private static readonly ISSUER = 'Givta Admin';
  private static readonly BACKUP_CODE_COUNT = 10;
  private static readonly BACKUP_CODE_LENGTH = 8;

  /**
   * Generate 2FA setup for user
   */
  static async generateSetup(userId: string, email: string): Promise<TwoFactorResult> {
    try {
      // Generate secret
      const secret = speakeasy.generateSecret({
        name: `${this.ISSUER} (${email})`,
        issuer: this.ISSUER,
        length: 32
      });

      // Generate QR code
      const qrCodeUrl = speakeasy.otpauthURL({
        secret: secret.ascii,
        label: encodeURIComponent(`${this.ISSUER} (${email})`),
        issuer: this.ISSUER,
        encoding: 'ascii'
      });

      const qrCodeDataURL = await qrcode.toDataURL(qrCodeUrl);

      // Generate backup codes
      const backupCodes = this.generateBackupCodes();

      // Store setup temporarily (will be confirmed later)
      const setupId = uuidv4();
      await collections.twoFactorSetup.doc(setupId).set({
        userId,
        secret: secret.ascii,
        backupCodes: backupCodes.map(code => this.hashBackupCode(code)),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
      });

      return {
        success: true,
        setup: {
          secret: secret.ascii,
          qrCodeUrl: qrCodeDataURL,
          backupCodes
        }
      };
    } catch (error: any) {
      console.error('Generate 2FA setup error:', error);
      return {
        success: false,
        error: 'Failed to generate 2FA setup'
      };
    }
  }

  /**
   * Verify 2FA token and enable 2FA
   */
  static async verifyAndEnable(userId: string, token: string, secret: string): Promise<TwoFactorResult> {
    try {
      // Verify token
      const verified = speakeasy.totp.verify({
        secret,
        encoding: 'ascii',
        token,
        window: 2 // Allow 2 time windows (30 seconds each)
      });

      if (!verified) {
        return {
          success: false,
          error: 'Invalid 2FA token'
        };
      }

      // Enable 2FA for user
      await collections.users.doc(userId).update({
        twoFactorEnabled: true,
        twoFactorSecret: secret,
        updatedAt: new Date()
      });

      // Clean up temporary setup
      const setupQuery = await collections.twoFactorSetup
        .where('userId', '==', userId)
        .get();

      setupQuery.docs.forEach((doc: any) => doc.ref.delete());

      return {
        success: true,
        verified: true
      };
    } catch (error: any) {
      console.error('Verify and enable 2FA error:', error);
      return {
        success: false,
        error: 'Failed to verify and enable 2FA'
      };
    }
  }

  /**
   * Verify 2FA token for login
   */
  static async verifyToken(userId: string, token: string): Promise<TwoFactorResult> {
    try {
      // Get user
      const userDoc = await collections.users.doc(userId).get();
      if (!userDoc.exists) {
        return { success: false, error: 'User not found' };
      }

      const user = userDoc.data();

      if (!user!.twoFactorEnabled || !user!.twoFactorSecret) {
        return { success: false, error: '2FA not enabled for this user' };
      }

      // Check if token is a backup code first
      const isBackupCode = await this.verifyBackupCode(userId, token);
      if (isBackupCode) {
        return { success: true, verified: true };
      }

      // Verify TOTP token
      const verified = speakeasy.totp.verify({
        secret: user!.twoFactorSecret,
        encoding: 'ascii',
        token,
        window: 2
      });

      if (!verified) {
        return { success: false, error: 'Invalid 2FA token' };
      }

      return { success: true, verified: true };
    } catch (error: any) {
      console.error('Verify 2FA token error:', error);
      return {
        success: false,
        error: 'Failed to verify 2FA token'
      };
    }
  }

  /**
   * Disable 2FA for user
   */
  static async disableTwoFactor(userId: string): Promise<TwoFactorResult> {
    try {
      await collections.users.doc(userId).update({
        twoFactorEnabled: false,
        twoFactorSecret: null,
        updatedAt: new Date()
      });

      // Clean up backup codes
      const backupQuery = await collections.twoFactorBackupCodes
        .where('userId', '==', userId)
        .get();

      backupQuery.docs.forEach(doc => doc.ref.delete());

      return { success: true };
    } catch (error: any) {
      console.error('Disable 2FA error:', error);
      return {
        success: false,
        error: 'Failed to disable 2FA'
      };
    }
  }

  /**
   * Regenerate backup codes
   */
  static async regenerateBackupCodes(userId: string): Promise<TwoFactorResult> {
    try {
      // Generate new backup codes
      const backupCodes = this.generateBackupCodes();

      // Delete old backup codes
      const oldCodesQuery = await collections.twoFactorBackupCodes
        .where('userId', '==', userId)
        .get();

      oldCodesQuery.docs.forEach(doc => doc.ref.delete());

      // Store new backup codes
      const batch = collections.twoFactorBackupCodes.firestore.batch();
      backupCodes.forEach(code => {
        const docRef = collections.twoFactorBackupCodes.doc();
        batch.set(docRef, {
          userId,
          codeHash: this.hashBackupCode(code),
          used: false,
          createdAt: new Date()
        });
      });

      await batch.commit();

      return {
        success: true,
        setup: {
          secret: '', // Not needed for backup codes
          qrCodeUrl: '',
          backupCodes
        }
      };
    } catch (error: any) {
      console.error('Regenerate backup codes error:', error);
      return {
        success: false,
        error: 'Failed to regenerate backup codes'
      };
    }
  }

  /**
   * Check if user has 2FA enabled
   */
  static async isTwoFactorEnabled(userId: string): Promise<boolean> {
    try {
      const userDoc = await collections.users.doc(userId).get();
      if (!userDoc.exists) return false;

      const user = userDoc.data();
      return user!.twoFactorEnabled || false;
    } catch (error) {
      console.error('Check 2FA enabled error:', error);
      return false;
    }
  }

  /**
   * Generate backup codes
   */
  private static generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < this.BACKUP_CODE_COUNT; i++) {
      codes.push(this.generateBackupCode());
    }
    return codes;
  }

  /**
   * Generate single backup code
   */
  private static generateBackupCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < this.BACKUP_CODE_LENGTH; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Hash backup code for storage
   */
  private static hashBackupCode(code: string): string {
    // In production, use proper hashing like bcrypt
    // For now, using simple hash for demonstration
    return Buffer.from(code).toString('base64');
  }

  /**
   * Verify backup code
   */
  private static async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    try {
      const codeHash = this.hashBackupCode(code);

      const query = await collections.twoFactorBackupCodes
        .where('userId', '==', userId)
        .where('codeHash', '==', codeHash)
        .where('used', '==', false)
        .limit(1)
        .get();

      if (query.empty) {
        return false;
      }

      // Mark code as used
      const docRef = query.docs[0].ref;
      await docRef.update({ used: true, usedAt: new Date() });

      return true;
    } catch (error) {
      console.error('Verify backup code error:', error);
      return false;
    }
  }
}
