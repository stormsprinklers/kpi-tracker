import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { initSchema } from "@/lib/db";
import { getUserByEmail, createPasswordResetToken, deletePasswordResetTokensForUser } from "@/lib/db/queries";

export async function POST(request: Request) {
  try {
    await initSchema();
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim()?.toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const user = await getUserByEmail(email);
    if (user?.organization_id) {
      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      await deletePasswordResetTokensForUser(user.id);
      await createPasswordResetToken(user.id, tokenHash, expiresAt);

      const baseUrl = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;
      console.log("[forgot-password] Reset link (stub - integrate Resend/SendGrid later):", resetUrl);
    }

    return NextResponse.json({
      success: true,
      message: "If an account exists with that email, we sent reset instructions.",
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    return NextResponse.json(
      { error: "Request failed" },
      { status: 500 }
    );
  }
}
