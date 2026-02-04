"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { updateBusinessCertUrl } from "@/actions/auth";
import { GraduationCap, Loader2, Upload, FileCheck } from "lucide-react";

export default function SignupPage() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    passwordConfirm: "",
    name: "",
    phone: "",
    shopUrl: "",
    shopName: "",
    businessNumber: "",
    cohort: "",
  });
  const [businessFile, setBusinessFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBusinessFile(file);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    if (formData.password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      // signUp에 metadata 포함 → trigger가 profiles 자동 생성 (모든 필드 포함)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            name: formData.name,
            phone: formData.phone,
            shop_url: formData.shopUrl,
            shop_name: formData.shopName,
            business_number: formData.businessNumber,
            cohort: formData.cohort || null,
          },
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (!authData.user) {
        setError("회원가입 중 오류가 발생했습니다.");
        return;
      }

      // 사업자등록증 파일 업로드
      if (businessFile) {
        const fileExt = businessFile.name.split(".").pop();
        const filePath = `business-docs/${authData.user.id}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(filePath, businessFile);

        if (!uploadError) {
          const {
            data: { publicUrl },
          } = supabase.storage.from("documents").getPublicUrl(filePath);
          // server action으로 프로필 업데이트 (service role = RLS 우회)
          await updateBusinessCertUrl(authData.user.id, publicUrl);
        }
      }

      router.push("/pending");
    } catch {
      setError("회원가입 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4 py-8">
      <div className="w-full max-w-lg space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
            <GraduationCap className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">사관학교 헬프데스크</h1>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl">회원가입</CardTitle>
            <CardDescription>
              수강생 정보를 입력해주세요.
              <br />
              관리자 승인 후 서비스를 이용하실 수 있습니다.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSignup}>
            <CardContent className="space-y-5">
              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* 계정 정보 */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                  계정 정보
                </h3>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="email">이메일 *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={formData.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="password">비밀번호 *</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="6자 이상"
                        value={formData.password}
                        onChange={(e) => updateField("password", e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="passwordConfirm">비밀번호 확인 *</Label>
                      <Input
                        id="passwordConfirm"
                        type="password"
                        placeholder="비밀번호 재입력"
                        value={formData.passwordConfirm}
                        onChange={(e) =>
                          updateField("passwordConfirm", e.target.value)
                        }
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* 개인 정보 */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                  개인 정보
                </h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="name">이름 *</Label>
                      <Input
                        id="name"
                        placeholder="홍길동"
                        value={formData.name}
                        onChange={(e) => updateField("name", e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">전화번호 *</Label>
                      <Input
                        id="phone"
                        placeholder="010-1234-5678"
                        value={formData.phone}
                        onChange={(e) => updateField("phone", e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* 쇼핑몰 정보 */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                  사업 정보
                </h3>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="shopName">쇼핑몰 이름 *</Label>
                    <Input
                      id="shopName"
                      placeholder="내 쇼핑몰"
                      value={formData.shopName}
                      onChange={(e) => updateField("shopName", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shopUrl">쇼핑몰 URL *</Label>
                    <Input
                      id="shopUrl"
                      placeholder="https://myshop.com"
                      value={formData.shopUrl}
                      onChange={(e) => updateField("shopUrl", e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="businessNumber">사업자등록번호 *</Label>
                      <Input
                        id="businessNumber"
                        placeholder="000-00-00000"
                        value={formData.businessNumber}
                        onChange={(e) =>
                          updateField("businessNumber", e.target.value)
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cohort">수강 기수</Label>
                      <Input
                        id="cohort"
                        placeholder="예: 1기"
                        value={formData.cohort}
                        onChange={(e) => updateField("cohort", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* 사업자등록증 업로드 */}
                  <div className="space-y-2">
                    <Label>사업자등록증 (선택)</Label>
                    <div
                      className="flex items-center gap-3 rounded-lg border-2 border-dashed p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      {businessFile ? (
                        <>
                          <FileCheck className="h-8 w-8 text-primary shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {businessFile.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(businessFile.size / 1024 / 1024).toFixed(1)}MB
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <Upload className="h-8 w-8 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-sm font-medium">
                              클릭하여 파일 선택
                            </p>
                            <p className="text-xs text-muted-foreground">
                              이미지 또는 PDF (최대 10MB)
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    가입 중...
                  </>
                ) : (
                  "회원가입"
                )}
              </Button>
              <p className="text-sm text-muted-foreground">
                이미 계정이 있으신가요?{" "}
                <Link
                  href="/login"
                  className="font-medium text-primary hover:underline"
                >
                  로그인
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
