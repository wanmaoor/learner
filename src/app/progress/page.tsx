import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { masteryRecords, boundaries } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

export default async function ProgressPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const mastery = await db
    .select()
    .from(masteryRecords)
    .where(eq(masteryRecords.userId, session.user.id))
    .orderBy(masteryRecords.accuracy);

  const allBoundaries = await db
    .select()
    .from(boundaries);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">学习进度</h1>
          <Link href="/" className="text-gray-500 hover:text-gray-700">
            返回
          </Link>
        </div>

        {mastery.map((m) => {
          const topicBoundaries = allBoundaries.filter(
            (b) => b.masteryId === m.id
          );
          const pct = Math.round((m.accuracy ?? 0) * 100);

          return (
            <div key={m.id} className="bg-white rounded-lg shadow p-4 space-y-2">
              <div className="flex justify-between">
                <span className="font-medium">{m.topic}</span>
                <span
                  className={`text-sm font-semibold ${
                    pct >= 80
                      ? "text-green-600"
                      : pct >= 50
                        ? "text-yellow-600"
                        : "text-red-600"
                  }`}
                >
                  {pct}%
                </span>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>

              {topicBoundaries.length > 0 && (
                <div className="text-xs text-gray-500 space-y-1">
                  {topicBoundaries.map((b) => (
                    <div key={b.id} className="flex items-center gap-1">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          b.confirmed ? "bg-red-500" : "bg-yellow-400"
                        }`}
                      />
                      <span>{b.boundaryText}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {mastery.length === 0 && (
          <div className="text-center py-12 space-y-3">
            <p className="text-gray-500">还没有学习记录</p>
            <Link
              href="/diagnose"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              先做个诊断吧
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
