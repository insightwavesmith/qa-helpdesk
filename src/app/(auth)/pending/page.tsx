import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GraduationCap, Clock, Mail } from "lucide-react";

export default function PendingPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
            <GraduationCap className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">사관학교 헬프데스크</h1>
        </div>

        <Card className="shadow-lg text-center">
          <CardHeader className="pb-4">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Clock className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-xl">가입 검토 중</CardTitle>
            <CardDescription className="text-base">
              가입 신청이 접수되었습니다!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              관리자가 회원 정보를 확인한 후 승인해 드립니다.
              <br />
              승인이 완료되면 서비스를 이용하실 수 있습니다.
            </p>
            <div className="flex items-center justify-center gap-2 rounded-lg bg-muted p-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                승인 완료 시 이메일로 안내드립니다.
              </span>
            </div>
          </CardContent>
          <CardFooter className="justify-center">
            <Button variant="outline" asChild>
              <Link href="/login">로그인 페이지로 돌아가기</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
