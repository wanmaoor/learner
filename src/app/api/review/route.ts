import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { masteryRecords } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const dueItems = await db
    .select()
    .from(masteryRecords)
    .where(eq(masteryRecords.userId, session.user.id))
    .then((records) =>
      records
        .filter((r) => r.nextReview && r.nextReview <= now)
        .sort(
          (a, b) =>
            (a.nextReview?.getTime() ?? 0) - (b.nextReview?.getTime() ?? 0)
        )
        .slice(0, 10)
    );

  return NextResponse.json({ reviewQueue: dueItems });
}
