import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function POST(req: NextRequest) {
  const { id, password } = await req.json();

  if (!id || !password) {
    return NextResponse.json({ ok: false, message: "id와 password가 필요합니다." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("hospitals")
    .select("password")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, message: "병원을 찾을 수 없습니다." }, { status: 404 });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  const isAdmin = adminPassword && password === adminPassword;

  if (!isAdmin && data.password !== password) {
    return NextResponse.json({ ok: false, message: "비밀번호가 올바르지 않습니다." }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
