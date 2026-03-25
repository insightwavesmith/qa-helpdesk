import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import TerminalClient from './terminal-client';

export const metadata: Metadata = {
  title: '웹 터미널 | 관리자',
};

export default async function TerminalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    redirect('/dashboard');
  }

  // WebSocket 인증용 토큰 — 서버측 세션 쿠키에서 가져온 uid를 전달
  // 실제 WS 서버는 JWT_SECRET으로 검증하므로, 여기서는 빈 토큰 전달
  // (개발 환경에서는 JWT_SECRET 없이도 dev 역할로 허용)
  const token = '';

  return <TerminalClient token={token} />;
}
