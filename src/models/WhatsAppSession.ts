export interface IWhatsAppSession {
  id: string;
  userId: string;
  sessionId: string;
  phoneNumber: string;
  isActive: boolean;
  qrCode?: string;
  authState?: any;
  lastActivity: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class WhatsAppSessionModel {
  static createSessionData(data: Partial<IWhatsAppSession>): IWhatsAppSession {
    const now = new Date();
    return {
      id: data.id || '',
      userId: data.userId || '',
      sessionId: data.sessionId || '',
      phoneNumber: data.phoneNumber || '',
      isActive: data.isActive !== undefined ? data.isActive : true,
      qrCode: data.qrCode,
      authState: data.authState,
      lastActivity: data.lastActivity || now,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now
    };
  }

  static updateSessionData(session: IWhatsAppSession, updates: Partial<IWhatsAppSession>): IWhatsAppSession {
    return {
      ...session,
      ...updates,
      updatedAt: new Date()
    };
  }
}
