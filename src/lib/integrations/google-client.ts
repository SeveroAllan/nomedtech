import { google } from 'googleapis';
import { supabaseAdmin } from '@/lib/supabase/server';

export const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events.readonly',
];

export interface GoogleIntegrationRecord {
  id: string;
  doctorId: string;
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiry?: string | null;
  googleEmail?: string | null;
  googleName?: string | null;
  googleAvatarUrl?: string | null;
  scopes: string[];
  driveFolderId?: string | null;
  driveFolderName: string;
  autoSendGmail: boolean;
  autoUploadDrive: boolean;
  lastCalendarSync?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export class GoogleClientService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    this.redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() || `${appUrl}/api/integrations/google/callback`;
  }

  public isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  public createOAuth2Client() {
    return new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );
  }

  public getAuthUrl(doctorId: string): string {
    const oauth2Client = this.createOAuth2Client();
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_SCOPES,
      state: doctorId,
    });
  }

  public async exchangeCode(code: string) {
    const oauth2Client = this.createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    return {
      tokens,
      userInfo,
    };
  }

  public async saveIntegration(params: {
    doctorId: string;
    tokens: any;
    userInfo: any;
  }): Promise<GoogleIntegrationRecord> {
    const { doctorId, tokens, userInfo } = params;
    const tokenExpiry = tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : null;

    const payload: any = {
      doctor_id: doctorId,
      access_token: tokens.access_token,
      token_expiry: tokenExpiry,
      google_email: userInfo.email || null,
      google_name: userInfo.name || null,
      google_avatar_url: userInfo.picture || null,
      scopes: GOOGLE_SCOPES,
      updated_at: new Date().toISOString(),
    };

    if (tokens.refresh_token) {
      payload.refresh_token = tokens.refresh_token;
    }

    const { data, error } = await (supabaseAdmin.from('google_integrations') as any)
      .upsert(payload, { onConflict: 'doctor_id' })
      .select()
      .single();

    if (error) {
      throw new Error(`Falha ao salvar integração Google no Supabase: ${error.message}`);
    }

    return this.mapRow(data);
  }

  public async getIntegration(doctorId: string): Promise<GoogleIntegrationRecord | null> {
    if (!doctorId) return null;

    try {
      const { data, error } = await (supabaseAdmin.from('google_integrations') as any)
        .select('*')
        .eq('doctor_id', doctorId)
        .maybeSingle();

      if (error || !data) return null;
      return this.mapRow(data);
    } catch {
      return null;
    }
  }

  public async getAuthenticatedClient(doctorId: string) {
    const integration = await this.getIntegration(doctorId);
    if (!integration || !integration.accessToken) {
      throw new Error('Conta Google não conectada para este médico.');
    }

    const oauth2Client = this.createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: integration.accessToken,
      refresh_token: integration.refreshToken || undefined,
      expiry_date: integration.tokenExpiry ? new Date(integration.tokenExpiry).getTime() : undefined,
    });

    const isExpiring = integration.tokenExpiry
      ? new Date(integration.tokenExpiry).getTime() - Date.now() < 5 * 60 * 1000
      : false;

    if (isExpiring && integration.refreshToken) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);

        const newExpiry = credentials.expiry_date
          ? new Date(credentials.expiry_date).toISOString()
          : null;

        await (supabaseAdmin.from('google_integrations') as any)
          .update({
            access_token: credentials.access_token,
            token_expiry: newExpiry,
            updated_at: new Date().toISOString(),
          })
          .eq('doctor_id', doctorId);
      } catch (refreshErr) {
        console.warn('[GoogleClient] Falha ao renovar token com refresh_token:', refreshErr);
      }
    }

    return {
      oauth2Client,
      integration,
    };
  }

  public async disconnect(doctorId: string): Promise<boolean> {
    const { error } = await (supabaseAdmin.from('google_integrations') as any)
      .delete()
      .eq('doctor_id', doctorId);

    if (error) {
      throw new Error(`Erro ao desconectar Google: ${error.message}`);
    }
    return true;
  }

  public async updateSettings(doctorId: string, updates: {
    autoSendGmail?: boolean;
    autoUploadDrive?: boolean;
    driveFolderId?: string;
  }): Promise<GoogleIntegrationRecord | null> {
    const { data, error } = await (supabaseAdmin.from('google_integrations') as any)
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('doctor_id', doctorId)
      .select()
      .single();

    if (error || !data) return null;
    return this.mapRow(data);
  }

  private mapRow(row: any): GoogleIntegrationRecord {
    return {
      id: row.id,
      doctorId: row.doctor_id,
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      tokenExpiry: row.token_expiry,
      googleEmail: row.google_email,
      googleName: row.google_name,
      googleAvatarUrl: row.google_avatar_url,
      scopes: row.scopes || [],
      driveFolderId: row.drive_folder_id,
      driveFolderName: row.drive_folder_name || 'NotoWhats - Notas Fiscais',
      autoSendGmail: row.auto_send_gmail ?? true,
      autoUploadDrive: row.auto_upload_drive ?? true,
      lastCalendarSync: row.last_calendar_sync,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const googleClientService = new GoogleClientService();
