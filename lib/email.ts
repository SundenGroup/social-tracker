import nodemailer from "nodemailer";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendEmail({ to, subject, html }: EmailOptions): Promise<boolean> {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM ?? "noreply@clutch.game";

  if (!transporter) {
    console.warn("[Email] SMTP not configured. Skipping email:", subject);
    return false;
  }

  try {
    await transporter.sendMail({ from, to, subject, html });
    console.log(`[Email] Sent: "${subject}" to ${to}`);
    return true;
  } catch (error) {
    console.error(`[Email] Failed to send "${subject}" to ${to}:`, error);
    return false;
  }
}

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
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold">Account</td><td>${accountName}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold">Platform</td><td>${platform}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold">Error</td><td>${errorMessage}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold">Time</td><td>${new Date().toISOString()}</td></tr>
      </table>
      <p><a href="${process.env.NEXTAUTH_URL}/settings">View Settings Dashboard</a></p>
    `,
  });
}
