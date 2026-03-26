import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function POST(req: NextRequest) {
  const { id, password } = await req.json();

  if (!id || !password) {
    return NextResponse.json({ ok: false, message: "필수 값이 누락되었습니다." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("comments")
    .select("password")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, message: "댓글을 찾을 수 없습니다." }, { status: 404 });
  }

  if (data.password !== password) {
    return NextResponse.json({ ok: false, message: "비밀번호가 올바르지 않습니다." }, { status: 403 });
  }

  const { error: delError } = await supabase.from("comments").delete().eq("id", id);

  if (delError) {
    return NextResponse.json({ ok: false, message: "삭제에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
