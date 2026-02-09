import { getMembers } from "@/actions/admin";
import { getSubscriberCount } from "@/actions/subscribers";
import { MembersClient } from "./members-client";

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; role?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const role = params.role || "all";
  const tab = params.tab || "members";

  const { data: members, count } = await getMembers({
    page,
    pageSize: 20,
    role: role !== "all" ? role : undefined,
  });

  const totalPages = Math.ceil((count || 0) / 20);
  const subscriberCount = await getSubscriberCount();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">회원 관리</h1>
        <p className="text-sm text-gray-500 mt-1">
          가입 신청을 검토하고 승인/거절하세요.
        </p>
      </div>

      <MembersClient
        members={members}
        currentRole={role}
        currentPage={page}
        totalPages={totalPages}
        totalCount={count || 0}
        subscriberCount={subscriberCount}
        currentTab={tab}
      />
    </div>
  );
}
