import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { masteryRecords } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  // 获取掌握度数据
  const mastery = await db
    .select()
    .from(masteryRecords)
    .where(eq(masteryRecords.userId, userId));

  const now = new Date();
  const reviewDue = mastery.filter(
    (m) => m.nextReview && m.nextReview <= now
  );

  const hasDiagnosis = mastery.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 space-y-6">
        <h1 className="text-2xl font-bold">Learner</h1>

        {!hasDiagnosis ? (
          <div className="bg-white rounded-lg shadow p-6 text-center space-y-4">
            <h2 className="text-lg font-semibold">欢迎! 先做个诊断</h2>
            <p className="text-gray-600">
              5 道题，约 10 分钟，帮 AI 了解你的水平
            </p>
            <Link
              href="/diagnose"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              开始诊断
            </Link>
          </div>
        ) : (
          <>
            {reviewDue.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="font-semibold">
                  {reviewDue.length} 个知识点需要复习
                </p>
                <Link
                  href="/learn"
                  className="text-blue-600 hover:underline text-sm"
                >
                  开始复习
                </Link>
              </div>
            )}

            <Link
              href="/learn"
              className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition"
            >
              <h2 className="text-lg font-semibold">继续学习</h2>
              <p className="text-gray-600 text-sm">
                已掌握 {mastery.filter((m) => (m.accuracy ?? 0) > 0.8).length}{" "}
                / {mastery.length} 个知识点
              </p>
            </Link>

            <Link
              href="/progress"
              className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition"
            >
              <h2 className="text-lg font-semibold">查看进度</h2>
              <p className="text-gray-600 text-sm">掌握度地图和边界记录</p>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
