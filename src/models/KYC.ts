export interface IKYC {
  id: string;
  userId: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'requires_changes';
  documents: {
    idCard?: {
      url: string;
      uploadedAt: Date;
      verified: boolean;
    };
    passport?: {
      url: string;
      uploadedAt: Date;
      verified: boolean;
    };
    utilityBill?: {
      url: string;
      uploadedAt: Date;
      verified: boolean;
    };
    selfie?: {
      url: string;
      uploadedAt: Date;
      verified: boolean;
    };
  };
  personalInfo: {
    fullName: string;
    dateOfBirth: Date;
    address: string;
    phoneNumber: string;
    email: string;
    idNumber?: string; // ID number for identification
    idType?: 'national_id' | 'drivers_license' | 'passport' | 'voters_card'; // Type of ID
    nationality?: string; // User's nationality
  };
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  rejectionReason?: string;
  notes?: string;
  verifiedAt?: Date; // When KYC was verified
  verifiedBy?: string; // Who verified the KYC
  createdAt: Date;
  updatedAt: Date;
}

export class KYCModel {
  static createKYCData(data: Partial<IKYC>): IKYC {
    const now = new Date();
    return {
      id: data.id || '',
      userId: data.userId || '',
      status: data.status || 'pending',
      documents: data.documents || {},
      personalInfo: {
        fullName: data.personalInfo?.fullName || '',
        dateOfBirth: data.personalInfo?.dateOfBirth || now,
        address: data.personalInfo?.address || '',
        phoneNumber: data.personalInfo?.phoneNumber || '',
        email: data.personalInfo?.email || '',
        idNumber: data.personalInfo?.idNumber,
        idType: data.personalInfo?.idType,
        nationality: data.personalInfo?.nationality,
      },
      submittedAt: data.submittedAt || now,
      reviewedAt: data.reviewedAt,
      reviewedBy: data.reviewedBy,
      rejectionReason: data.rejectionReason,
      notes: data.notes,
      verifiedAt: data.verifiedAt,
      verifiedBy: data.verifiedBy,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    };
  }
}
