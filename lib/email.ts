import nodemailer from "nodemailer";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Resolve the sender address once, preferring EMAIL_FROM (provider-agnostic)
 * and falling back to the legacy SMTP_FROM name.
 */
function fromAddress(): string {
  return (
    process.env.EMAIL_FROM ??
    process.env.SMTP_FROM ??
    "Clutch Social <noreply@clutch.game>"
  );
}

/* ------------------------------------------------------------------------ */
/*  Transport 1: Resend HTTPS API (preferred — works on locked-down hosts    */
/*  where outbound SMTP is blocked, e.g. DigitalOcean's default droplet).   */
/* ------------------------------------------------------------------------ */

async function sendViaResend(options: EmailOptions): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[Email/Resend] ${res.status} sending "${options.subject}" to ${options.to}: ${body.slice(0, 500)}`
      );
      return false;
    }

    console.log(`[Email/Resend] Sent: "${options.subject}" to ${options.to}`);
    return true;
  } catch (err) {
    console.error(`[Email/Resend] Failed:`, err);
    return false;
  }
}

/* ------------------------------------------------------------------------ */
/*  Transport 2: generic SMTP (fallback for local dev / self-hosted SMTP).   */
/* ------------------------------------------------------------------------ */

function smtpTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    // Fail fast on unreachable hosts instead of blocking invite responses
    // for 60+ seconds when the host blocks outbound SMTP.
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
  });
}

async function sendViaSmtp(options: EmailOptions): Promise<boolean> {
  const transporter = smtpTransport();
  if (!transporter) return false;

  try {
    await transporter.sendMail({
      from: fromAddress(),
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    console.log(`[Email/SMTP] Sent: "${options.subject}" to ${options.to}`);
    return true;
  } catch (err) {
    console.error(`[Email/SMTP] Failed to send "${options.subject}" to ${options.to}:`, err);
    return false;
  }
}

/* ------------------------------------------------------------------------ */

export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY ||
      (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  );
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  // Prefer Resend when configured — no SMTP round-trips, works on hosts
  // with outbound port 25/465/587 blocked.
  if (process.env.RESEND_API_KEY) {
    return sendViaResend(options);
  }
  if (smtpTransport()) {
    return sendViaSmtp(options);
  }
  console.warn("[Email] No provider configured. Skipping:", options.subject);
  return false;
}

/* ------------------------------------------------------------------------ */
/*  Shared visual wrapper                                                    */
/* ------------------------------------------------------------------------ */

function htmlShell(title: string, body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>${title}</title></head>
<body style="margin:0;padding:0;background:#F4F6FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#05090E;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="font-weight:800;letter-spacing:-0.01em;font-size:22px;margin-bottom:24px;">
      Clutch <span style="color:#8A94A2;font-weight:500;">Social</span>
    </div>
    <div style="background:#FFFFFF;border:1px solid #E3E8EF;border-radius:14px;padding:28px;">
      ${body}
    </div>
    <div style="margin-top:24px;font-size:11px;color:#8A94A2;">
      Clutch Social — sent from ${process.env.NEXTAUTH_URL ?? "social.clutch.game"}
    </div>
  </div>
</body></html>`;
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#05090E;color:#FFFFFF;text-decoration:none;font-weight:600;padding:11px 18px;border-radius:8px;font-size:13px;">${label}</a>`;
}

/* ------------------------------------------------------------------------ */
/*  Invitation email                                                         */
/* ------------------------------------------------------------------------ */

export async function sendInviteEmail({
  to,
  name,
  inviterName,
  organizationName,
  url,
  expiresInHours = 72,
}: {
  to: string;
  name: string;
  inviterName?: string | null;
  organizationName: string;
  url: string;
  expiresInHours?: number;
}): Promise<boolean> {
  const inviter = inviterName ? ` by <strong>${escapeHtml(inviterName)}</strong>` : "";
  const body = `
    <p style="font-size:15px;font-weight:600;margin:0 0 6px 0;">Hi ${escapeHtml(name)},</p>
    <p style="color:#5B6470;line-height:1.55;margin:0 0 18px 0;">
      You've been invited${inviter} to join <strong>${escapeHtml(organizationName)}</strong> on Clutch Social —
      our social performance tracker for esports partners.
    </p>
    <p style="color:#5B6470;line-height:1.55;margin:0 0 22px 0;">
      Click the button below to set your password and finish creating your account.
    </p>
    <div style="margin:0 0 22px 0;">${ctaButton(url, "Set up your account")}</div>
    <p style="color:#8A94A2;font-size:12px;line-height:1.6;margin:0;">
      This invitation link expires in ${expiresInHours} hours. If the button doesn't work, copy and paste this URL:
      <br/><span style="color:#5B6470;word-break:break-all;">${url}</span>
    </p>
    <hr style="border:none;border-top:1px solid #E3E8EF;margin:24px 0;"/>
    <p style="color:#8A94A2;font-size:12px;margin:0;">
      If you weren't expecting this email, you can safely ignore it — no account will be created until you follow the link.
    </p>`;
  return sendEmail({
    to,
    subject: `You've been invited to ${organizationName} on Clutch Social`,
    html: htmlShell("Clutch Social invitation", body),
    text: `You've been invited to join ${organizationName} on Clutch Social.\n\nFinish setting up your account here:\n${url}\n\nThis link expires in ${expiresInHours} hours.`,
  });
}

/* ------------------------------------------------------------------------ */
/*  Password reset email                                                     */
/* ------------------------------------------------------------------------ */

export async function sendPasswordResetEmail({
  to,
  name,
  url,
  expiresInMinutes = 60,
}: {
  to: string;
  name?: string | null;
  url: string;
  expiresInMinutes?: number;
}): Promise<boolean> {
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  const body = `
    <p style="font-size:15px;font-weight:600;margin:0 0 6px 0;">${greeting}</p>
    <p style="color:#5B6470;line-height:1.55;margin:0 0 22px 0;">
      Someone asked to reset the password for your Clutch Social account. If that was you,
      click the button below to pick a new password.
    </p>
    <div style="margin:0 0 22px 0;">${ctaButton(url, "Reset your password")}</div>
    <p style="color:#8A94A2;font-size:12px;line-height:1.6;margin:0;">
      This link expires in ${expiresInMinutes} minutes. If the button doesn't work, paste this URL into your browser:
      <br/><span style="color:#5B6470;word-break:break-all;">${url}</span>
    </p>
    <hr style="border:none;border-top:1px solid #E3E8EF;margin:24px 0;"/>
    <p style="color:#8A94A2;font-size:12px;margin:0;">
      If you didn't request a reset, you can ignore this email — your password hasn't changed.
    </p>`;
  return sendEmail({
    to,
    subject: "Reset your Clutch Social password",
    html: htmlShell("Reset your password", body),
    text: `Reset your Clutch Social password by visiting:\n${url}\n\nThis link expires in ${expiresInMinutes} minutes. If you didn't request this, ignore this email.`,
  });
}

/* ------------------------------------------------------------------------ */
/*  Existing sync-failure alert (unchanged)                                  */
/* ------------------------------------------------------------------------ */

export async function sendSyncFailureAlert(
  accountName: string,
  platform: string,
  errorMessage: string,
  adminEmail: string
): Promise<boolean> {
  return sendEmail({
    to: adminEmail,
    subject: `[Clutch] Sync failure: ${platform} - ${accountName}`,
    html: `
      <h2>Sync Failure Alert</h2>
      <p>An account has failed to sync multiple times.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold">Account</td><td>${escapeHtml(accountName)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold">Platform</td><td>${escapeHtml(platform)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold">Error</td><td>${escapeHtml(errorMessage)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold">Time</td><td>${new Date().toISOString()}</td></tr>
      </table>
      <p><a href="${process.env.NEXTAUTH_URL}/settings">View Settings Dashboard</a></p>
    `,
  });
}

/* ------------------------------------------------------------------------ */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
