// src/types.d.ts
// TypeScript module declarations for packages without built-in types

declare module 'bcrypt' {
  export function hash(data: string | Buffer, saltOrRounds: string | number): Promise<string>;
  export function hashSync(data: string | Buffer, saltOrRounds: string | number): string;
  export function compare(data: string | Buffer, encrypted: string): Promise<boolean>;
  export function compareSync(data: string | Buffer, encrypted: string): boolean;
  export function genSalt(rounds?: number): Promise<string>;
  export function genSaltSync(rounds?: number): string;
}

declare module 'qrcode' {
  export interface QRCodeOptions {
    type?: string;
    quality?: number;
    margin?: number;
    color?: {
      dark?: string;
      light?: string;
    };
    width?: number;
  }

  export function toDataURL(text: string, options?: QRCodeOptions): Promise<string>;
  export function toString(text: string, options?: QRCodeOptions): Promise<string>;
  export function toFile(path: string, text: string, options?: QRCodeOptions): Promise<void>;
}

declare module 'multer' {
  import { Request } from 'express';
  
  interface MulterFile {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    destination: string;
    filename: string;
    path: string;
    buffer: Buffer;
  }

  interface MulterOptions {
    dest?: string;
    storage?: any;
    limits?: {
      fieldNameSize?: number;
      fieldSize?: number;
      fields?: number;
      fileSize?: number;
      files?: number;
      parts?: number;
      headerPairs?: number;
    };
    preservePath?: boolean;
    fileFilter?: (req: Request, file: MulterFile, cb: (error: Error | null, acceptFile?: boolean) => void) => void;
  }

  interface Multer {
    single(fieldname: string): any;
    array(fieldname: string, maxCount?: number): any;
    fields(fields: any[]): any;
    none(): any;
    any(): any;
  }

  function multer(options?: MulterOptions): Multer;
  export = multer;
}

// Extend Express namespace
declare global {
  namespace Express {
    interface Request {
      file?: Multer.File;
      files?: { [fieldname: string]: Multer.File[] } | Multer.File[];
      rateLimit?: {
        limit: number;
        current: number;
        remaining: number;
        resetTime?: Date;
      };
    }
  }
}

export {};