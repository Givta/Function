import { Router, Request } from 'express';
import { KYCService } from '../services/KYCService';
import { AuthMiddleware } from '../middleware/auth/AuthMiddleware';
import multer, { FileFilterCallback } from 'multer';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    // Allow images only
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

/**
 * Submit KYC documents
 * POST /api/kyc/submit
 */
router.post('/submit', AuthMiddleware.authenticate, upload.fields([
  { name: 'idCard', maxCount: 1 },
  { name: 'passport', maxCount: 1 },
  { name: 'utilityBill', maxCount: 1 },
  { name: 'selfie', maxCount: 1 }
]), async (req, res) => {
  try {
    const userId = req.user!.id;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    // Upload documents to cloud storage
    const documents: any = {};

    if (files.idCard?.[0]) {
      const uploadResult = await KYCService.uploadDocument(userId, 'idCard', files.idCard[0]);
      if (uploadResult) documents.idCardUrl = uploadResult.url;
    }

    if (files.passport?.[0]) {
      const uploadResult = await KYCService.uploadDocument(userId, 'passport', files.passport[0]);
      if (uploadResult) documents.passportUrl = uploadResult.url;
    }

    if (files.utilityBill?.[0]) {
      const uploadResult = await KYCService.uploadDocument(userId, 'utilityBill', files.utilityBill[0]);
      if (uploadResult) documents.utilityBillUrl = uploadResult.url;
    }

    if (files.selfie?.[0]) {
      const uploadResult = await KYCService.uploadDocument(userId, 'selfie', files.selfie[0]);
      if (uploadResult) documents.selfieUrl = uploadResult.url;
    }

    // Validate documents
    const validation = KYCService.validateKYCDocuments(documents);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Document validation failed',
        details: validation.errors
      });
    }

    // Submit KYC
    const result = await KYCService.submitKYC(userId, documents);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: 'KYC documents submitted successfully',
      submissionId: result.submissionId
    });

  } catch (error: any) {
    console.error('Submit KYC error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to submit KYC documents'
    });
  }
});

/**
 * Get KYC status
 * GET /api/kyc/status
 */
router.get('/status', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const status = await KYCService.getKYCStatus(userId);

    res.json({
      success: true,
      data: status
    });

  } catch (error: any) {
    console.error('Get KYC status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get KYC status'
    });
  }
});

/**
 * Check if user is eligible for KYC bonus
 * GET /api/kyc/eligibility
 */
router.get('/eligibility', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const status = await KYCService.getKYCStatus(userId);

    const isEligible = status.status === 'verified';

    res.json({
      success: true,
      data: {
        eligible: isEligible,
        currentStatus: status.status,
        reason: isEligible ? 'KYC verified' : 'KYC not verified or pending'
      }
    });

  } catch (error: any) {
    console.error('Check KYC eligibility error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check KYC eligibility'
    });
  }
});

/**
 * Get KYC requirements
 * GET /api/kyc/requirements
 */
router.get('/requirements', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const status = await KYCService.getKYCStatus(userId);

    res.json({
      success: true,
      data: {
        requirements: status.requirements,
        currentStatus: status.status
      }
    });

  } catch (error: any) {
    console.error('Get KYC requirements error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get KYC requirements'
    });
  }
});

/**
 * Review KYC submission (Admin only)
 * POST /api/kyc/review/:submissionId
 */
router.post('/review/:submissionId', AuthMiddleware.authenticate, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { action, comments } = req.body;
    const adminId = req.user!.id;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid action. Must be "approve" or "reject"'
      });
    }

    const result = await KYCService.reviewKYCSubmission(submissionId, adminId, action, comments);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: `KYC submission ${action}d successfully`
    });

  } catch (error: any) {
    console.error('Review KYC error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to review KYC submission'
    });
  }
});

/**
 * Get pending KYC submissions (Admin only)
 * GET /api/kyc/pending
 */
router.get('/pending', AuthMiddleware.authenticate, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const submissions = await KYCService.getPendingKYCSubmissions(limit, offset);

    res.json({
      success: true,
      data: submissions,
      pagination: {
        limit,
        offset,
        hasMore: submissions.length === limit
      }
    });

  } catch (error: any) {
    console.error('Get pending KYC error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pending KYC submissions'
    });
  }
});

/**
 * Get KYC statistics (Admin only)
 * GET /api/kyc/statistics
 */
router.get('/statistics', AuthMiddleware.authenticate, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const statistics = await KYCService.getKYCStatistics();

    res.json({
      success: true,
      data: statistics
    });

  } catch (error: any) {
    console.error('Get KYC statistics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get KYC statistics'
    });
  }
});

/**
 * Get user's KYC submission details
 * GET /api/kyc/submission
 */
router.get('/submission', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const status = await KYCService.getKYCStatus(userId);

    res.json({
      success: true,
      data: status.submission || null
    });

  } catch (error: any) {
    console.error('Get KYC submission error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get KYC submission'
    });
  }
});

export default router;
