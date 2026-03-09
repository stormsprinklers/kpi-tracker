import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { hash } from "bcryptjs";
import { initSchema } from "@/lib/db";
import {
  findValidPasswordResetToken,
  deletePasswordResetToken,
  updateUserPassword,
} from "@/lib/db/queries";

export async function POST(request: Request) {
  try {
    await initSchema();
    const body = (await request.json()) as { token?: string; password?: string };
    const token = body.token?.trim();
    const password = body.password;

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const row = await findValidPasswordResetToken(tokenHash);
    if (!row) {
      return NextResponse.json(
        { error: "Invalid or expired token. Please request a new password reset." },
        { status: 400 }
      );
    }

    const { user_id: userId, id: tokenId } = row;
    const passwordHash = await hash(password, 10);
    await updateUserPassword(userId, passwordHash);
    await deletePasswordResetToken(tokenId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Reset password error:", err);
    return NextResponse.json(
      { error: "Reset failed" },
      { status: 500 }
    );
  }
}
