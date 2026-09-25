import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleDriveService } from '../google-drive.service';
import { googleClientService } from '@/lib/integrations/google-client';
import { google } from 'googleapis';

const { mockCreateFile, mockGetFile, mockListFiles } = vi.hoisted(() => ({
  mockCreateFile: vi.fn().mockResolvedValue({
    data: {
      id: 'file-drive-999',
      name: 'DANFSE-123.pdf',
      webViewLink: 'https://drive.google.com/file/d/file-drive-999/view',
    },
  }),
  mockGetFile: vi.fn().mockResolvedValue({
    data: { id: 'folder-existing-123', trashed: false },
  }),
  mockListFiles: vi.fn().mockResolvedValue({
    data: { files: [{ id: 'folder-1', name: 'NotoWhats - Notas Fiscais' }] },
  }),
}));

vi.mock('googleapis', () => ({
  google: {
    drive: vi.fn().mockReturnValue({
      files: {
        create: mockCreateFile,
        get: mockGetFile,
        list: mockListFiles,
      },
    }),
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  },
}));

vi.mock('@/lib/integrations/google-client', () => ({
  googleClientService: {
    getIntegration: vi.fn(),
    getAuthenticatedClient: vi.fn(),
  },
}));

describe('GoogleDriveService', () => {
  let service: GoogleDriveService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GoogleDriveService();
  });

  it('deve reutilizar pasta existente se integration.driveFolderId for válido', async () => {
    const mockDrive = {
      files: {
        get: mockGetFile,
      },
    };

    (googleClientService.getIntegration as any).mockResolvedValue({
      driveFolderId: 'folder-existing-123',
    });

    const folderId = await service.getOrCreateFolder(mockDrive, 'doc-123');
    expect(folderId).toBe('folder-existing-123');
    expect(mockGetFile).toHaveBeenCalledWith({
      fileId: 'folder-existing-123',
      fields: 'id, trashed',
    });
  });

  it('deve fazer upload de arquivo PDF para o Google Drive', async () => {
    (googleClientService.getIntegration as any).mockResolvedValue({
      driveFolderId: 'folder-1',
    });
    (googleClientService.getAuthenticatedClient as any).mockResolvedValue({
      oauth2Client: {},
    });

    vi.spyOn(service, 'getOrCreateFolder').mockResolvedValue('folder-1');

    const mockBuffer = Buffer.from('dummy pdf content');
    const result = await service.uploadInvoiceFile({
      doctorId: 'doc-123',
      fileName: 'DANFSE-123.pdf',
      fileBuffer: mockBuffer,
      mimeType: 'application/pdf',
    });

    expect(result.fileId).toBe('file-drive-999');
    expect(result.fileName).toBe('DANFSE-123.pdf');
    expect(result.webViewLink).toBe('https://drive.google.com/file/d/file-drive-999/view');
  });
});
