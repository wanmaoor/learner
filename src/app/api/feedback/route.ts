import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { analyticsEvents } from "@/db/schema";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { questionId, feedbackType } = await request.json();

  await db.insert(analyticsEvents).values({
    userId: session.user.id,
    eventType: "feedback",
    metadata: { question_id: questionId, type: feedbackType },
  });

  return NextResponse.json({ ok: true });
}
