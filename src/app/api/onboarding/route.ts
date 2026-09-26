import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient, getAuthenticatedDoctorId, supabaseAdmin } from '@/lib/supabase/server';
import { EvolutionClient } from '@/lib/integrations/evolution-client';

export const dynamic = 'force-dynamic';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55')) return digits;
  return `55${digits}`;
}

function phoneCandidates(phone: string): string[] {
  const normalized = normalizePhone(phone);
  const withoutCountryCode = normalized.startsWith('55') ? normalized.slice(2) : normalized;
  return Array.from(new Set([normalized, withoutCountryCode]));
}

function hashOtp(code: string): string {
  const secret =
    process.env.WHATSAPP_OTP_SECRET ||
    '9f3d7c1a8e5b2d4f6a0c1e7b9d3f5a8c2e6d0b4f7a1c9e3d5b8f2a6c0e4d7b1';
  return crypto.createHmac('sha256', secret).update(code).digest('hex');
}

function createOtpCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

function getAccountEmail(phone: string): string {
  return `${normalizePhone(phone)}@login.noto.app`;
}

function getOtpInstanceName(integrationInstance?: string | null): string {
  return (
    integrationInstance ||
    process.env.EVOLUTION_ONBOARDING_INSTANCE_NAME ||
    process.env.EVOLUTION_OTP_INSTANCE_NAME ||
    ''
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === 'request_whatsapp_otp') {
      const phone = typeof body.phone === 'string' ? body.phone : '';
      const candidates = phoneCandidates(phone);
      if (candidates.some((candidate) => candidate.length < 10)) {
        return NextResponse.json({ error: 'Informe um celular válido.' }, { status: 400 });
      }

      let { data: doctor } = await supabaseAdmin
        .from('doctors')
        .select('id, phone, user_id, name')
        .in('phone', candidates)
        .maybeSingle();

      if (!doctor?.id) {
        const { data: lead, error: leadError } = await supabaseAdmin
          .from('doctors')
          .insert({
            phone: normalizePhone(phone),
            email: getAccountEmail(phone),
            name: 'Novo cadastro',
            onboarding_status: 'pending_xml',
          })
          .select('id, phone, user_id, name')
          .single();

        if (leadError || !lead) {
          throw new Error(`Não foi possível iniciar o cadastro: ${leadError?.message || 'lead inválido'}`);
        }
        doctor = lead;
      }

      const { data: integration } = await supabaseAdmin
        .from('integrations')
        .select('evolution_instance_name')
        .eq('doctor_id', doctor.id)
        .maybeSingle();

      const otpInstanceName = getOtpInstanceName(integration?.evolution_instance_name);
      if (!otpInstanceName) {
        return NextResponse.json(
          { error: 'O canal de validação WhatsApp ainda não está configurado.' },
          { status: 503 }
        );
      }

      const { data: recentOtp } = await (supabaseAdmin as any)
        .from('whatsapp_login_otps')
        .select('created_at')
        .eq('doctor_id', doctor.id)
        .is('consumed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentOtp?.created_at &&
        Date.now() - new Date(recentOtp.created_at).getTime() < OTP_RESEND_COOLDOWN_MS) {
        return NextResponse.json(
          { error: 'Aguarde um minuto antes de solicitar outro código.' },
          { status: 429 }
        );
      }

      const code = createOtpCode();
      const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
      const { error: insertError } = await (supabaseAdmin as any)
        .from('whatsapp_login_otps')
        .insert({
          doctor_id: doctor.id,
          phone: normalizePhone(phone),
          code_hash: hashOtp(code),
          expires_at: expiresAt,
        });

      if (insertError) {
        throw new Error(`Não foi possível criar o código de acesso: ${insertError.message}`);
      }

      const evolution = new EvolutionClient();
      try {
        await evolution.sendTextMessage(
          otpInstanceName,
          normalizePhone(phone),
          `*${code}* este é seu código de verificação. Para sua segurança, não compartilhe com ninguém.`
        );
      } catch (error) {
        await (supabaseAdmin as any)
          .from('whatsapp_login_otps')
          .update({ consumed_at: new Date().toISOString() })
          .eq('doctor_id', doctor.id)
          .eq('code_hash', hashOtp(code));
        throw error;
      }

      return NextResponse.json({
        success: true,
        maskedPhone: `••••••${normalizePhone(phone).slice(-4)}`,
        expiresInSeconds: OTP_TTL_MS / 1000,
      });
    }

    if (action === 'verify_whatsapp_otp') {
      const phone = typeof body.phone === 'string' ? body.phone : '';
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      if (!/^\d{6}$/.test(code)) {
        return NextResponse.json({ error: 'Digite o código de 6 dígitos.' }, { status: 400 });
      }

      const candidates = phoneCandidates(phone);
      const { data: doctor } = await supabaseAdmin
        .from('doctors')
        .select('id, email, user_id, phone, name')
        .in('phone', candidates)
        .maybeSingle();
      if (!doctor?.id) {
        return NextResponse.json({ error: 'Código inválido.' }, { status: 401 });
      }

      const { data: otp } = await (supabaseAdmin as any)
        .from('whatsapp_login_otps')
        .select('id, code_hash, expires_at, attempts, consumed_at')
        .eq('doctor_id', doctor.id)
        .is('consumed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!otp || otp.attempts >= MAX_OTP_ATTEMPTS || new Date(otp.expires_at).getTime() <= Date.now()) {
        return NextResponse.json({ error: 'Código expirado ou inválido. Solicite um novo código.' }, { status: 401 });
      }

      const expectedHash = hashOtp(code);
      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedHash, 'hex'),
        Buffer.from(otp.code_hash, 'hex')
      );
      if (!isValid) {
        await (supabaseAdmin as any)
          .from('whatsapp_login_otps')
          .update({ attempts: otp.attempts + 1 })
          .eq('id', otp.id);
        return NextResponse.json({ error: 'Código inválido.' }, { status: 401 });
      }

      await (supabaseAdmin as any)
        .from('whatsapp_login_otps')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', otp.id);

      let accountEmail = doctor.email || getAccountEmail(phone);
      let userId = doctor.user_id;

      if (!userId) {
        const temporaryPassword = crypto.randomBytes(32).toString('hex');
        const { data: createdUser, error: createUserError } =
          await supabaseAdmin.auth.admin.createUser({
            email: accountEmail,
            password: temporaryPassword,
            email_confirm: true,
            phone: normalizePhone(phone),
            phone_confirm: true,
            user_metadata: {
              full_name: doctor.name === 'Novo cadastro' ? '' : doctor.name,
              phone: normalizePhone(phone),
            },
          });

        if (createUserError || !createdUser.user) {
          throw new Error(createUserError?.message || 'Não foi possível criar sua conta.');
        }

        userId = createdUser.user.id;
        const { error: linkDoctorError } = await supabaseAdmin
          .from('doctors')
          .update({ user_id: userId, updated_at: new Date().toISOString() })
          .eq('id', doctor.id);

        if (linkDoctorError) {
          throw new Error(`Não foi possível vincular sua conta: ${linkDoctorError.message}`);
        }
      }

      const { data: linkData, error: linkError } = await (supabaseAdmin.auth.admin as any).generateLink({
        type: 'magiclink',
        email: accountEmail,
      });
      const tokenHash = linkData?.properties?.hashed_token;
      if (linkError || !tokenHash) {
        throw new Error('Não foi possível criar a sessão de autenticação.');
      }

      const client = await createClient();
      const { data: authData, error: authError } = await client.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'email',
      });
      if (authError || !authData.user) {
        throw new Error('Não foi possível concluir a autenticação.');
      }

      return NextResponse.json({
        success: true,
        doctorId: doctor.id,
        email: accountEmail,
      });
    }

    // 0. AÇÃO: LOGIN COM E-MAIL E SENHA
    if (action === 'login') {
      const { email, password } = body;
      if (!email || !password) {
        return NextResponse.json(
          { error: 'E-mail e senha são obrigatórios.' },
          { status: 400 }
        );
      }

      const cleanEmail = email.trim().toLowerCase();

      const client = await createClient();
      const { data: authData, error: authError } = await client.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (authError || !authData?.user) {
        return NextResponse.json(
          { error: 'Credenciais inválidas. Verifique seu e-mail e senha.' },
          { status: 401 }
        );
      }

      const { data: doc } = await supabaseAdmin
        .from('doctors')
        .select('*')
        .eq('email', cleanEmail)
        .maybeSingle();

      let finalDoc = doc;
      if (!finalDoc) {
        // Auto-cria o registro do médico se existe no Supabase Auth mas não na tabela doctors
        const tempPhone = `5500${crypto.randomInt(100000000, 1000000000)}`;
        const { data: createdDoc } = await supabaseAdmin
          .from('doctors')
          .insert({
            user_id: authData.user?.id,
            name: authData.user?.user_metadata?.full_name || cleanEmail.split('@')[0],
            email: cleanEmail,
            phone: tempPhone,
            onboarding_status: 'pending_xml',
          })
          .select()
          .single();
        finalDoc = createdDoc;
      } else if (!finalDoc.user_id && authData.user?.id) {
        await supabaseAdmin
          .from('doctors')
          .update({ user_id: authData.user.id })
          .eq('id', finalDoc.id);
        finalDoc.user_id = authData.user.id;
      }

      let integration = null;
      if (finalDoc?.id) {
        const { data: intData } = await supabaseAdmin
          .from('integrations')
          .select('*')
          .eq('doctor_id', finalDoc.id)
          .maybeSingle();
        integration = intData;
      }

      return NextResponse.json({
        success: true,
        userId: authData.user?.id,
        doctorId: finalDoc?.id || null,
        doctor: finalDoc,
        integration,
      });
    }

    // 1. AÇÃO: CADASTRO DO MÉDICO (CRIAÇÃO OBRIGATÓRIA NO SUPABASE AUTH E DOCTORS)
    if (action === 'register') {
      const { email, password, name } = body;

      if (!email || !password) {
        return NextResponse.json(
          { error: 'E-mail e senha são obrigatórios.' },
          { status: 400 }
        );
      }

      const cleanEmail = email.trim().toLowerCase();
      const doctorName = name?.trim() || cleanEmail.split('@')[0];

      // 1. Cria ou atualiza o usuário no Supabase Auth
      let userId: string | null = null;

      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: doctorName },
      });

      if (userData?.user?.id) {
        userId = userData.user.id;
      } else {
        return NextResponse.json(
          { error: 'Este e-mail já está cadastrado. Faça login ou use outro e-mail.' },
          { status: 409 }
        );
      }

      // 2. Busca se o médico já existe na tabela doctors
      const { data: existingDoc } = await supabaseAdmin
        .from('doctors')
        .select('*')
        .eq('email', cleanEmail)
        .maybeSingle();

      let finalDoc = existingDoc;

      if (existingDoc) {
        // Atualiza o user_id e nome para manter sincronizado com o Supabase Auth
        const { data: updatedDoc } = await supabaseAdmin
          .from('doctors')
          .update({
            user_id: userId,
            name: doctorName,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingDoc.id)
          .select()
          .single();
        if (updatedDoc) finalDoc = updatedDoc;
      } else {
        // Insere novo médico vinculado ao user_id do Supabase Auth
        const tempPhone = `5500${crypto.randomInt(100000000, 1000000000)}`;
        const { data: newDoc, error: docError } = await supabaseAdmin
          .from('doctors')
          .insert({
            user_id: userId,
            name: doctorName,
            email: cleanEmail,
            phone: tempPhone,
            onboarding_status: 'pending_xml',
          })
          .select()
          .single();

        if (docError) {
          console.error('Erro ao inserir médico no Supabase:', docError);
          return NextResponse.json(
            { error: docError.message || 'Erro ao salvar médico no banco.' },
            { status: 500 }
          );
        }
        finalDoc = newDoc;
      }

      const client = await createClient();
      const { error: signInError } = await client.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (signInError) {
        return NextResponse.json(
          { error: 'Cadastro criado, mas não foi possível iniciar a sessão.' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        doctorId: finalDoc?.id || '',
        userId,
        doctor: finalDoc,
      });
    }

    // 2. AÇÃO: ATUALIZAR DADOS FISCAIS DO XML
    if (action === 'update_fiscal') {
      const {
        doctorId,
        cnpj,
        inscricaoMunicipal,
        razaoSocial,
        cnae,
        issRate,
        taxRegime,
        city,
        state,
      } = body;

      if (!doctorId) {
        return NextResponse.json(
          { error: 'ID do médico é obrigatório.' },
          { status: 400 }
        );
      }

      const authenticatedDoctorId = await getAuthenticatedDoctorId();
      if (authenticatedDoctorId !== doctorId) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
      }

      const { data: updatedDoc, error: updateError } = await supabaseAdmin
        .from('doctors')
        .update({
          cpf_cnpj: cnpj || null,
          inscricao_municipal: inscricaoMunicipal || null,
          cnae: cnae || null,
          iss_rate: issRate || 2.0,
          tax_regime: taxRegime || 'simples_nacional',
          city: city || null,
          state: state || null,
          onboarding_status: 'pending_certificate',
          updated_at: new Date().toISOString(),
        })
        .eq('id', doctorId)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message || 'Erro ao atualizar dados fiscais.' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        doctor: updatedDoc,
      });
    }

    // 3. AÇÃO: SALVAR CERTIFICADO DIGITAL
    if (action === 'update_certificate') {
      const { doctorId, filename } = body;

      if (!doctorId || !filename) {
        return NextResponse.json(
          { error: 'DoctorId e filename são obrigatórios.' },
          { status: 400 }
        );
      }

      // Verifica se já existe certificado para este médico
      const { data: existingCert } = await supabaseAdmin
        .from('certificates')
        .select('id')
        .eq('doctor_id', doctorId)
        .maybeSingle();

      let cert: any = null;
      let certError: any = null;

      if (existingCert) {
        const res = await supabaseAdmin
          .from('certificates')
          .update({
            filename,
            storage_path: `certificates/${doctorId}/${filename}`,
            is_valid: true,
            focus_nfe_validated: true,
          })
          .eq('id', existingCert.id)
          .select()
          .single();
        cert = res.data;
        certError = res.error;
      } else {
        const res = await supabaseAdmin
          .from('certificates')
          .insert({
            doctor_id: doctorId,
            filename,
            storage_path: `certificates/${doctorId}/${filename}`,
            is_valid: true,
            focus_nfe_validated: true,
          })
          .select()
          .single();
        cert = res.data;
        certError = res.error;
      }

      // Atualiza status do médico
      await supabaseAdmin
        .from('doctors')
        .update({
          onboarding_status: 'pending_whatsapp_connection',
          updated_at: new Date().toISOString(),
        })
        .eq('id', doctorId);

      if (certError) {
        return NextResponse.json(
          { error: certError.message || 'Erro ao registrar certificado.' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        certificate: cert,
      });
    }

    // 4. AÇÃO: VINCULAR WHATSAPP (EVOLUTION API) E FINALIZAR ONBOARDING
    if (action === 'connect_whatsapp') {
      const { doctorId, phone, pairingCode, instanceName = 'notowhats_medico_01' } = body;

      if (!doctorId || !phone) {
        return NextResponse.json(
          { error: 'DoctorId e phone são obrigatórios.' },
          { status: 400 }
        );
      }

      const cleanPhone = phone.replace(/\D/g, '');
      const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

      // Atualiza o telefone real do médico e status ativo
      const { data: updatedDoctor } = await supabaseAdmin
        .from('doctors')
        .update({
          phone: fullPhone,
          onboarding_status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', doctorId)
        .select()
        .maybeSingle();

      // Upsert na tabela integrations
      const { data: integration, error: intError } = await supabaseAdmin
        .from('integrations')
        .upsert(
          {
            doctor_id: doctorId,
            evolution_instance_name: instanceName,
            evolution_pairing_code: pairingCode || null,
            evolution_connected: true,
            evolution_api_url: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
            evolution_api_key: process.env.EVOLUTION_API_GLOBAL_KEY || 'notowhats_secret_key',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'doctor_id' }
        )
        .select()
        .single();

      if (intError) {
        return NextResponse.json(
          { error: intError.message || 'Erro ao registrar integração WhatsApp.' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        integration,
      });
    }

    // 5. AÇÃO: ENVIAR KIT DE RESPOSTAS RÁPIDAS APÓS CONFIRMAÇÃO DA CONEXÃO
    if (action === 'send_welcome_kit') {
      const { doctorId, instanceName } = body;

      try {
        const { data: doc } = await supabaseAdmin
          .from('doctors')
          .select('name, phone')
          .eq('id', doctorId)
          .maybeSingle();

        if (doc && doc.phone && instanceName) {
          const { EvolutionClient } = await import('@/lib/integrations/evolution-client');
          const { generateQuickRepliesWelcomeMessage } = await import('@/features/whatsapp/quick-replies');
          const evo = new EvolutionClient();
          const welcomeText = generateQuickRepliesWelcomeMessage(doc.name);
          await evo.sendTextMessage(instanceName, doc.phone, welcomeText);
        }
      } catch (err) {
        console.warn('Aviso ao enviar kit de boas-vindas:', err);
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'Ação não suportada.' },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('Erro na rota de onboarding:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno do servidor no onboarding.' },
      { status: 500 }
    );
  }
}
