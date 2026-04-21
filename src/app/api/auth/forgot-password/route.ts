import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { initSchema } from "@/lib/db";
import { getUserByEmail, createPasswordResetToken, deletePasswordResetTokensForUser } from "@/lib/db/queries";
import {
  buildPasswordResetEmailHtml,
  buildPasswordResetEmailPlainText,
} from "@/lib/email/passwordResetEmailTemplate";
import { resolveAppBaseUrl } from "@/lib/email/resolveAppBaseUrl";
import { sendTransactionalEmail } from "@/lib/email/sendGrid";

export async function POST(request: Request) {
  try {
    await initSchema();
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim()?.toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const user = await getUserByEmail(email);
    const hasPassword = Boolean(user?.password_hash?.trim());

    if (user && hasPassword) {
      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      await deletePasswordResetTokensForUser(user.id);
      await createPasswordResetToken(user.id, tokenHash, expiresAt);

      const base = resolveAppBaseUrl();
      const resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`;

      const html = buildPasswordResetEmailHtml({ appBaseUrl: base, resetUrl });
      const text = buildPasswordResetEmailPlainText({ appBaseUrl: base, resetUrl });

      const send = await sendTransactionalEmail({
        to: [email],
        subject: "Reset your Home Services Analytics password",
        html,
        text,
      });

      if (!send.ok) {
        console.error("[forgot-password] SendGrid:", send.error);
        await deletePasswordResetTokensForUser(user.id);
        return NextResponse.json(
          {
            error:
              "We could not send the reset email. Check SendGrid configuration (SENDGRID_API_KEY) and your app URL (NEXT_PUBLIC_APP_URL or NEXTAUTH_URL), then try again.",
          },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "If an account exists with that email, we sent reset instructions.",
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
