import { google } from 'googleapis';
import { Readable } from 'stream';
import { googleClientService } from '@/lib/integrations/google-client';
import { supabaseAdmin } from '@/lib/supabase/server';

export interface UploadInvoiceFileParams {
  doctorId: string;
  fileName: string;
  fileBuffer: Buffer;
  mimeType: 'application/pdf' | 'application/xml';
  folderName?: string;
}

export class GoogleDriveService {
  /**
   * Obtém ou cria a pasta padrão no Drive do médico
   */
  public async getOrCreateFolder(
    drive: any,
    doctorId: string,
    folderName: string = 'NotoWhats - Notas Fiscais'
  ): Promise<string> {
    const integration = await googleClientService.getIntegration(doctorId);

    if (integration?.driveFolderId) {
      try {
        const check = await drive.files.get({
          fileId: integration.driveFolderId,
          fields: 'id, trashed',
        });
        if (check.data && !check.data.trashed) {
          return integration.driveFolderId;
        }
      } catch {
        // Pasta não encontrada ou sem permissão, busca por nome ou cria nova
      }
    }

    // Busca pasta pelo nome
    const query = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName.replace(/'/g, "\\'")}' and trashed = false`;
    const searchRes = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (searchRes.data.files && searchRes.data.files.length > 0) {
      const folderId = searchRes.data.files[0].id!;
      await (supabaseAdmin.from('google_integrations') as any)
        .update({ drive_folder_id: folderId, updated_at: new Date().toISOString() })
        .eq('doctor_id', doctorId);
      return folderId;
    }

    // Cria a pasta
    const folderMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Pasta gerenciada pelo NotoWhats para armazenamento de Notas Fiscais de Serviços (NFS-e).',
    };

    const folderRes = await drive.files.create({
      requestBody: folderMetadata,
      fields: 'id, name',
    });

    const newFolderId = folderRes.data.id!;
    await (supabaseAdmin.from('google_integrations') as any)
      .update({ drive_folder_id: newFolderId, updated_at: new Date().toISOString() })
      .eq('doctor_id', doctorId);

    return newFolderId;
  }

  /**
   * Faz upload de uma nota fiscal (PDF ou XML) no Google Drive do médico
   */
  public async uploadInvoiceFile(params: UploadInvoiceFileParams): Promise<{
    fileId: string;
    fileName: string;
    webViewLink?: string | null;
  }> {
    const { doctorId, fileName, fileBuffer, mimeType, folderName } = params;

    const { oauth2Client } = await googleClientService.getAuthenticatedClient(doctorId);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const folderId = await this.getOrCreateFolder(drive, doctorId, folderName);

    const stream = new Readable();
    stream.push(fileBuffer);
    stream.push(null);

    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    };

    const media = {
      mimeType,
      body: stream,
    };

    const uploadRes = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id, name, webViewLink, webContentLink',
    });

    return {
      fileId: uploadRes.data.id!,
      fileName: uploadRes.data.name || fileName,
      webViewLink: uploadRes.data.webViewLink,
    };
  }

  /**
   * Faz upload direto a partir de URL pública ou buffer
   */
  public async uploadInvoiceFromUrl(params: {
    doctorId: string;
    invoiceNumber: string;
    pdfUrl?: string;
    xmlContent?: string;
  }): Promise<{
    pdfResult?: { fileId: string; webViewLink?: string | null };
    xmlResult?: { fileId: string; webViewLink?: string | null };
  }> {
    const { doctorId, invoiceNumber, pdfUrl, xmlContent } = params;
    const results: any = {};

    if (pdfUrl) {
      try {
        const res = await fetch(pdfUrl);
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const pdfRes = await this.uploadInvoiceFile({
            doctorId,
            fileName: `DANFSE-${invoiceNumber}.pdf`,
            fileBuffer: buffer,
            mimeType: 'application/pdf',
          });
          results.pdfResult = { fileId: pdfRes.fileId, webViewLink: pdfRes.webViewLink };
        }
      } catch (err) {
        console.warn('[GoogleDrive] Falha ao fazer upload de PDF da URL:', err);
      }
    }

    if (xmlContent) {
      try {
        const buffer = Buffer.from(xmlContent, 'utf-8');
        const xmlRes = await this.uploadInvoiceFile({
          doctorId,
          fileName: `NFSe-${invoiceNumber}.xml`,
          fileBuffer: buffer,
          mimeType: 'application/xml',
        });
        results.xmlResult = { fileId: xmlRes.fileId, webViewLink: xmlRes.webViewLink };
      } catch (err) {
        console.warn('[GoogleDrive] Falha ao fazer upload de XML:', err);
      }
    }

    return results;
  }
}

export const googleDriveService = new GoogleDriveService();
