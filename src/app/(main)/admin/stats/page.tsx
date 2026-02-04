import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function AdminStatsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">통계</h1>
        <p className="text-muted-foreground">
          서비스 이용 현황을 확인하세요.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>총 질문 수</CardDescription>
          </CardHeader>
          <CardContent>
            <CardTitle className="text-3xl">0</CardTitle>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>AI 답변 수</CardDescription>
          </CardHeader>
          <CardContent>
            <CardTitle className="text-3xl">0</CardTitle>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>승인된 답변</CardDescription>
          </CardHeader>
          <CardContent>
            <CardTitle className="text-3xl">0</CardTitle>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>활성 회원</CardDescription>
          </CardHeader>
          <CardContent>
            <CardTitle className="text-3xl">0</CardTitle>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>게시글 수</CardDescription>
          </CardHeader>
          <CardContent>
            <CardTitle className="text-3xl">0</CardTitle>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>이번 주 질문</CardDescription>
          </CardHeader>
          <CardContent>
            <CardTitle className="text-3xl">0</CardTitle>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">활동 트렌드</CardTitle>
          <CardDescription>
            주간 활동 현황 차트가 여기에 표시됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
              <BarChart3 className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">
              데이터가 쌓이면 차트가 표시됩니다.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
