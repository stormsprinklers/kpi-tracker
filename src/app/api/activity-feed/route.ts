import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@vercel/postgres";

export interface ActivityFeedItem {
  id: number;
  activity_type: string;
  message: string;
  technician_name: string | null;
  city: string | null;
  amount: number | null;
  created_at: string;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sql`
    SELECT id, activity_type, message, technician_name, city, amount, created_at
    FROM activity_feed
    WHERE organization_id = ${session.user.organizationId}
    ORDER BY created_at DESC
    LIMIT 50
  `;

  const items: ActivityFeedItem[] = (result.rows ?? []).map((r) => {
    const row = r as {
      id: number;
      activity_type: string;
      message: string;
      technician_name: string | null;
      city: string | null;
      amount: number | string | null;
      created_at: string;
    };
    return {
      id: row.id,
      activity_type: row.activity_type,
      message: row.message,
      technician_name: row.technician_name,
      city: row.city,
      amount: row.amount != null ? Number(row.amount) : null,
      created_at: row.created_at,
    };
  });

  return NextResponse.json({ items });
}
