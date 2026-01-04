import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import nodemailer from "nodemailer";

export async function POST(req: NextRequest) {
  try {
    const { email, fullName, companyId } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (!companyId || typeof companyId !== "string") {
      return NextResponse.json({ error: "Company ID is required" }, { status: 400 });
    }

    // Validate SMTP configuration
    if (!process.env.SMTP_HOST || !process.env.EMAIL_FROM) {
      console.warn("SMTP not configured; skipping employee invite email");
      return NextResponse.json({ message: "Email skipped (SMTP not configured)" }, { status: 200 });
    }

    // Verify the requesting user is an admin of the company
    const cookieStore = await cookies();
    const supabase = createServerComponentClient({ cookies: () => cookieStore as any });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check that user owns/administers this company
    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("id, company_name")
      .eq("id", companyId)
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (companyErr || !company) {
      return NextResponse.json({ error: "Company not found or access denied" }, { status: 403 });
    }

    const companyName = company.company_name || "Your Company";
    const employeeName = fullName || "Team Member";

    // Build employee sign-up URL with pre-filled email
    const origin = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
    const signUpUrl = `${origin}/employee-signup?email=${encodeURIComponent(email)}`;

    // Create SMTP transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_PORT || 587) === "465",
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });

    const fromHeader = process.env.EMAIL_FROM_NAME
      ? `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM}>`
      : process.env.EMAIL_FROM;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited to Join ${companyName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #e2e8f0;">
              <h1 style="margin:0;font-size:24px;font-weight:600;color:#1e293b;">Welcome to ${companyName}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#334155;">
                Hi ${employeeName},
              </p>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#334155;">
                You've been added as an employee at <strong>${companyName}</strong>. To access your employee portal, view your rota, request leave, and more, please create your account.
              </p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#334155;">
                <strong>Important:</strong> You must sign up using this exact email address: <br>
                <span style="color:#4f46e5;font-weight:600;">${email}</span>
              </p>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="${signUpUrl}" style="display:inline-block;padding:14px 32px;background-color:#4f46e5;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;border-radius:8px;">
                      Create Your Account
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#64748b;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${signUpUrl}" style="color:#4f46e5;word-break:break-all;">${signUpUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
              <p style="margin:0;font-size:13px;line-height:1.5;color:#94a3b8;text-align:center;">
                This invitation was sent by ${companyName}.<br>
                If you weren't expecting this email, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    const textContent = `
Hi ${employeeName},

You've been added as an employee at ${companyName}. To access your employee portal, view your rota, request leave, and more, please create your account.

Important: You must sign up using this exact email address: ${email}

Create your account here: ${signUpUrl}

This invitation was sent by ${companyName}. If you weren't expecting this email, you can safely ignore it.
    `.trim();

    await transporter.sendMail({
      from: fromHeader,
      to: email,
      subject: `You're Invited to Join ${companyName}`,
      text: textContent,
      html,
    });

    return NextResponse.json({ success: true, message: "Invitation email sent" }, { status: 200 });
  } catch (e: any) {
    console.error("Failed to send employee invite email:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Failed to send invitation email" }, { status: 500 });
  }
}
