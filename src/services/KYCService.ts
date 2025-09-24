import { db, collections } from '../config/firebase';
import { IUser, UserModel } from '../models';
import { NotificationService } from './NotificationService';
import { v4 as uuidv4 } from 'uuid';

export interface KYCSubmission {
  id: string;
  userId: string;
  idCardUrl?: string;
  passportUrl?: string;
  utilityBillUrl?: string;
  selfieUrl?: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  rejectionReason?: string;
  comments?: string;
}

export interface KYCResult {
  success: boolean;
  submissionId?: string;
  error?: string;
}

export class KYCService {
  /**
   * Submit KYC documents
   */
  static async submitKYC(
    userId: string,
    documents: {
      idCardUrl?: string;
      passportUrl?: string;
      utilityBillUrl?: string;
      selfieUrl?: string;
    }
  ): Promise<KYCResult> {
    try {
      // Validate user exists
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Check if user already has a pending or approved KYC
      if (user.kycStatus === 'verified') {
        throw new Error('KYC already verified');
      }

      if (user.kycStatus === 'pending') {
        throw new Error('KYC submission already pending review');
      }

      // Validate at least one document is provided
      const hasDocuments = Object.values(documents).some(url => url && url.trim() !== '');
      if (!hasDocuments) {
        throw new Error('At least one document must be provided');
      }

      const submissionId = uuidv4();
      const submission: KYCSubmission = {
        id: submissionId,
        userId,
        ...documents,
        status: 'pending',
        submittedAt: new Date()
      };

      // Save KYC submission
      await collections.kyc.doc(submissionId).set(submission);

      // Update user KYC status
      await collections.users.doc(userId).update({
        kycStatus: 'pending',
        'kycDocuments.idCard': documents.idCardUrl,
        'kycDocuments.passport': documents.passportUrl,
        'kycDocuments.utilityBill': documents.utilityBillUrl,
        updatedAt: new Date()
      });

      // Send notification
      await NotificationService.sendSystemNotification(
        userId,
        '📋 KYC Submitted Successfully',
        'Your KYC documents have been submitted and are under review. We\'ll notify you once the verification is complete.',
        'medium'
      );

      return {
        success: true,
        submissionId
      };
    } catch (error: any) {
      console.error('Submit KYC error:', error);
      return {
        success: false,
        error: error.message || 'Failed to submit KYC'
      };
    }
  }

  /**
   * Get KYC status for user
   */
  static async getKYCStatus(userId: string): Promise<{
    status: IUser['kycStatus'];
    submission?: KYCSubmission;
    requirements: string[];
  }> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const requirements = this.getKYCRequirements(user);

      let submission: KYCSubmission | undefined;
      if (user.kycStatus === 'pending' || user.kycStatus === 'rejected') {
        const querySnapshot = await collections.kyc
          .where('userId', '==', userId)
          .orderBy('submittedAt', 'desc')
          .limit(1)
          .get();

        if (!querySnapshot.empty) {
          submission = { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() } as KYCSubmission;
        }
      }

      return {
        status: user.kycStatus,
        submission,
        requirements
      };
    } catch (error: any) {
      console.error('Get KYC status error:', error);
      return {
        status: 'not_submitted',
        requirements: []
      };
    }
  }

  /**
   * Get KYC requirements for user
   */
  private static getKYCRequirements(user: IUser): string[] {
    const requirements: string[] = [];

    if (!user.kycDocuments?.idCard && !user.kycDocuments?.passport) {
      requirements.push('Government-issued ID (ID Card or Passport)');
    }

    if (!user.kycDocuments?.utilityBill) {
      requirements.push('Utility bill or proof of address');
    }

    if (!user.phoneNumber) {
      requirements.push('Phone number verification');
    }

    return requirements;
  }

  /**
   * Review KYC submission (Admin only)
   */
  static async reviewKYCSubmission(
    submissionId: string,
    adminId: string,
    action: 'approve' | 'reject',
    comments?: string
  ): Promise<KYCResult> {
    try {
      const submissionRef = collections.kyc.doc(submissionId);
      const doc = await submissionRef.get();

      if (!doc.exists) {
        return { success: false, error: 'KYC submission not found' };
      }

      const submission = { id: doc.id, ...doc.data() } as KYCSubmission;

      if (submission.status !== 'pending') {
        return { success: false, error: 'Submission already reviewed' };
      }

      const now = new Date();
      const newStatus = action === 'approve' ? 'approved' : 'rejected';

      // Update submission
      await submissionRef.update({
        status: newStatus,
        reviewedAt: now,
        reviewedBy: adminId,
        comments,
        updatedAt: now
      });

      // Update user KYC status
      const userStatus = action === 'approve' ? 'verified' : 'rejected';
      await collections.users.doc(submission.userId).update({
        kycStatus: userStatus,
        updatedAt: now
      });

      // Send notification to user
      const title = action === 'approve' ? '✅ KYC Approved!' : '❌ KYC Rejected';
      const message = action === 'approve'
        ? 'Congratulations! Your KYC verification has been approved. You now have access to all premium features.'
        : `Your KYC submission was rejected. Reason: ${comments || 'Please check your documents and try again.'}`;

      await NotificationService.sendSystemNotification(
        submission.userId,
        title,
        message,
        action === 'approve' ? 'high' : 'urgent'
      );

      return {
        success: true,
        submissionId
      };
    } catch (error: any) {
      console.error('Review KYC submission error:', error);
      return {
        success: false,
        error: error.message || 'Failed to review KYC submission'
      };
    }
  }

  /**
   * Get pending KYC submissions (Admin only)
   */
  static async getPendingKYCSubmissions(limit: number = 50, offset: number = 0): Promise<KYCSubmission[]> {
    try {
      const querySnapshot = await collections.kyc
        .where('status', '==', 'pending')
        .orderBy('submittedAt', 'asc')
        .limit(limit)
        .offset(offset)
        .get();

      const submissions: KYCSubmission[] = [];

      for (const doc of querySnapshot.docs) {
        const submission = { id: doc.id, ...doc.data() } as KYCSubmission;

        // Get user details
        const user = await this.getUserById(submission.userId);
        if (user) {
          submission.userDetails = {
            username: user.username,
            email: user.email,
            phoneNumber: user.phoneNumber
          };
        }

        submissions.push(submission);
      }

      return submissions;
    } catch (error: any) {
      console.error('Get pending KYC submissions error:', error);
      return [];
    }
  }

  /**
   * Get KYC statistics (Admin only)
   */
  static async getKYCStatistics(): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    completionRate: number;
  }> {
    try {
      const querySnapshot = await collections.kyc.get();
      const submissions = querySnapshot.docs.map(doc => doc.data() as KYCSubmission);

      const stats = {
        total: submissions.length,
        pending: submissions.filter(s => s.status === 'pending').length,
        approved: submissions.filter(s => s.status === 'approved').length,
        rejected: submissions.filter(s => s.status === 'rejected').length,
        completionRate: 0
      };

      if (stats.total > 0) {
        stats.completionRate = ((stats.approved + stats.rejected) / stats.total) * 100;
      }

      return stats;
    } catch (error: any) {
      console.error('Get KYC statistics error:', error);
      return {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        completionRate: 0
      };
    }
  }

  /**
   * Upload KYC document (helper method)
   */
  static async uploadDocument(
    userId: string,
    documentType: 'idCard' | 'passport' | 'utilityBill' | 'selfie',
    file: any
  ): Promise<{ url: string } | null> {
    try {
      // TODO: Implement file upload to cloud storage (AWS S3, Cloudinary, etc.)
      // For now, return a placeholder URL
      const fileName = `${userId}_${documentType}_${Date.now()}.${file.mimetype.split('/')[1]}`;
      const url = `https://storage.givta.com/kyc/${fileName}`;

      console.log(`📁 KYC Document uploaded: ${fileName}`);

      return { url };
    } catch (error) {
      console.error('Upload document error:', error);
      return null;
    }
  }

  /**
   * Validate KYC documents
   */
  static validateKYCDocuments(documents: {
    idCardUrl?: string;
    passportUrl?: string;
    utilityBillUrl?: string;
    selfieUrl?: string;
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check if at least one ID document is provided
    if (!documents.idCardUrl && !documents.passportUrl) {
      errors.push('At least one form of government-issued ID is required (ID Card or Passport)');
    }

    // Check utility bill
    if (!documents.utilityBillUrl) {
      errors.push('Proof of address (utility bill) is required');
    }

    // Validate URLs (basic check)
    Object.entries(documents).forEach(([key, url]) => {
      if (url && !this.isValidUrl(url)) {
        errors.push(`Invalid ${key} URL`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if user is KYC eligible for bonuses
   */
  static isEligibleForBonuses(user: IUser): boolean {
    return user.kycStatus === 'verified';
  }

  /**
   * Get user by ID (helper method)
   */
  private static async getUserById(userId: string): Promise<IUser | null> {
    const doc = await collections.users.doc(userId).get();
    if (!doc.exists) return null;
    return doc.data() as IUser;
  }

  /**
   * Validate URL format
   */
  private static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}

// Extend KYCSubmission interface to include user details for admin views
declare module './KYCService' {
  interface KYCSubmission {
    userDetails?: {
      username?: string;
      email?: string;
      phoneNumber?: string;
    };
  }
}
