"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Search,
  PlusCircle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  MapPin,
  Phone,
  Pencil,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const regionOptions = [
  "서울",
  "경기",
  "강원",
  "인천",
  "부산",
  "대구",
  "광주",
  "대전",
  "울산",
  "세종",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
];

const EDIT_PASSWORD = "203040";

const statusMeta = {
  available: {
    label: "진료 가능",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
  },
  unavailable: {
    label: "진료 불가",
    dot: "bg-red-500",
    text: "text-red-700",
    badge: "bg-red-50 text-red-700 border-red-200",
    icon: XCircle,
  },
  unknown: {
    label: "미확인",
    dot: "bg-slate-400",
    text: "text-slate-700",
    badge: "bg-slate-50 text-slate-700 border-slate-200",
    icon: HelpCircle,
  },
};

function computeStatus(upvotes, downvotes) {
  if (upvotes === 0 && downvotes === 0) return "unknown";
  if (upvotes > downvotes) return "available";
  if (downvotes > upvotes) return "unavailable";
  return "unknown";
}

function normalizeHospital(row) {
  const upvotes = row.upvotes ?? 0;
  const downvotes = row.downvotes ?? 0;
  return {
    id: row.id,
    name: row.name ?? "",
    address: row.region ?? "서울",
    phone: row.phone ?? "",
    status: computeStatus(upvotes, downvotes),
    upvotes,
    downvotes,
    notes: row.note ? [row.note] : [],
  };
}

function StatusDot({ status }) {
  return <span className={`inline-block h-3 w-3 rounded-full ${statusMeta[status].dot}`} />;
}

export default function SeoulFertilityHospitalVoteSearch() {
  const [hospitals, setHospitals] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [form, setForm] = useState({
    name: "",
    address: "서울",
    phone: "",
    memo: "",
  });
  const [editingId, setEditingId] = useState(null);
  const [voterSelections, setVoterSelections] = useState({});
  const [formOpen, setFormOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    return hospitals.filter((h) => {
      const text = `${h.name} ${h.address}`.toLowerCase();
      const matchesQuery = text.includes(query.toLowerCase());
      const matchesStatus =
        statusFilter === "전체" ||
        (statusFilter === "진료 가능" && h.status === "available") ||
        (statusFilter === "진료 불가" && h.status === "unavailable") ||
        (statusFilter === "미확인" && h.status === "unknown");

      return matchesQuery && matchesStatus;
    });
  }, [hospitals, query, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: hospitals.length,
      available: hospitals.filter((h) => h.status === "available").length,
      unavailable: hospitals.filter((h) => h.status === "unavailable").length,
      unknown: hospitals.filter((h) => h.status === "unknown").length,
    };
  }, [hospitals]);

  const fetchHospitals = async () => {
    if (!supabase) {
      setError("Supabase 환경변수가 없습니다.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("hospitals")
      .select("id, name, region, phone, note, upvotes, downvotes")
      .order("id", { ascending: false });

    if (error) {
      setError("병원 목록을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    setHospitals((data ?? []).map(normalizeHospital));
    setLoading(false);
  };

  useEffect(() => {
    fetchHospitals();
  }, []);

  const resetForm = () => {
    setForm({ name: "", address: "서울", phone: "", memo: "" });
    setEditingId(null);
  };

  const openNewHospitalForm = () => {
    resetForm();
    setFormOpen(true);
  };

  const requestProtectedAction = (action) => {
    setPendingAction(action);
    setPasswordValue("");
    setPasswordOpen(true);
  };

  const handleVote = async (id, type) => {
    const target = hospitals.find((hospital) => hospital.id === id);
    if (!target || !supabase) return;

    const previousVote = voterSelections[id] || null;
    let upvotes = target.upvotes;
    let downvotes = target.downvotes;

    if (previousVote === type) {
      if (type === "available") upvotes = Math.max(0, upvotes - 1);
      if (type === "unavailable") downvotes = Math.max(0, downvotes - 1);
    } else {
      if (previousVote === "available") upvotes = Math.max(0, upvotes - 1);
      if (previousVote === "unavailable") downvotes = Math.max(0, downvotes - 1);
      if (type === "available") upvotes += 1;
      if (type === "unavailable") downvotes += 1;
    }

    const { error } = await supabase
      .from("hospitals")
      .update({ upvotes, downvotes })
      .eq("id", id);

    if (error) {
      window.alert("투표 저장에 실패했습니다.");
      return;
    }

    setHospitals((prev) =>
      prev.map((hospital) =>
        hospital.id === id
          ? {
              ...hospital,
              upvotes,
              downvotes,
              status: computeStatus(upvotes, downvotes),
            }
          : hospital
      )
    );

    setVoterSelections((prev) => ({
      ...prev,
      [id]: previousVote === type ? null : type,
    }));
  };

  const handleAddHospital = async () => {
    if (!form.name.trim() || !supabase) return;

    const payload = {
      name: form.name.trim(),
      region: form.address.trim(),
      phone: form.phone.trim(),
      note: form.memo.trim(),
      upvotes: 0,
      downvotes: 0,
    };

    const { data, error } = await supabase
      .from("hospitals")
      .insert(payload)
      .select("id, name, region, phone, note, upvotes, downvotes")
      .single();

    if (error) {
      window.alert("병원 등록에 실패했습니다.");
      return;
    }

    setHospitals((prev) => [normalizeHospital(data), ...prev]);
    resetForm();
    setFormOpen(false);
  };

  const handleSaveHospital = async () => {
    if (!form.name.trim() || editingId === null || !supabase) return;

    const payload = {
      name: form.name.trim(),
      region: form.address.trim(),
      phone: form.phone.trim(),
      note: form.memo.trim(),
    };

    const { data, error } = await supabase
      .from("hospitals")
      .update(payload)
      .eq("id", editingId)
      .select("id, name, region, phone, note, upvotes, downvotes")
      .single();

    if (error) {
      window.alert("병원 수정에 실패했습니다.");
      return;
    }

    setHospitals((prev) =>
      prev.map((hospital) => (hospital.id === editingId ? normalizeHospital(data) : hospital))
    );
    resetForm();
    setFormOpen(false);
  };

  const openEditHospital = (hospital) => {
    setEditingId(hospital.id);
    setForm({
      name: hospital.name || "",
      address: hospital.address || "서울",
      phone: hospital.phone || "",
      memo: hospital.notes?.[0] || "",
    });
    setFormOpen(true);
  };

  const performDeleteHospital = async (id) => {
    if (!supabase) return;

    const { error } = await supabase.from("hospitals").delete().eq("id", id);

    if (error) {
      window.alert("병원 삭제에 실패했습니다.");
      return;
    }

    setHospitals((prev) => prev.filter((hospital) => hospital.id !== id));
    setVoterSelections((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    if (editingId === id) {
      resetForm();
      setFormOpen(false);
    }
  };

  const handlePasswordSubmit = () => {
    if (passwordValue !== EDIT_PASSWORD) {
      window.alert("비밀번호가 올바르지 않습니다.");
      return;
    }

    if (pendingAction?.type === "edit") {
      openEditHospital(pendingAction.hospital);
    }

    if (pendingAction?.type === "delete") {
      performDeleteHospital(pendingAction.id);
    }

    setPasswordOpen(false);
    setPasswordValue("");
    setPendingAction(null);
  };

  const closePasswordDialog = (open) => {
    setPasswordOpen(open);
    if (!open) {
      setPasswordValue("");
      setPendingAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">서울 난임병원 검색 · 환자 제보형 진료 상태판</h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              실제 방문한 환자가 직접 “진료 가능 / 진료 불가”를 남기는 구조입니다.
              기본 상태는 모두 <span className="font-semibold text-slate-700">미확인</span>입니다.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <Dialog open={formOpen} onOpenChange={setFormOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 rounded-2xl" onClick={openNewHospitalForm}>
                <PlusCircle className="h-4 w-4" /> {editingId ? "병원 수정" : "병원 직접 등록"}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>{editingId ? "병원 수정" : "병원 등록"}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-4 py-2">
                <div className="space-y-2">
                  <Label>병원명 *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>지역</Label>
                  <select
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  >
                    {regionOptions.map((region) => (
                      <option key={region} value={region}>
                        {region}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>전화번호</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>메모</Label>
                  <Textarea value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={editingId ? handleSaveHospital : handleAddHospital} className="flex-1 rounded-2xl">
                    {editingId ? "수정 저장" : "등록하기"}
                  </Button>
                  {editingId && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        resetForm();
                        setFormOpen(false);
                      }}
                      className="rounded-2xl"
                    >
                      취소
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Dialog open={passwordOpen} onOpenChange={closePasswordDialog}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>비밀번호 입력</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>비밀번호</Label>
                <Input
                  type="password"
                  value={passwordValue}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handlePasswordSubmit();
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handlePasswordSubmit} className="flex-1 rounded-2xl">
                  확인
                </Button>
                <Button variant="outline" onClick={() => closePasswordDialog(false)} className="rounded-2xl">
                  취소
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">전체 병원</p>
              <p className="mt-2 text-3xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">진료 가능</p>
              <p className="mt-2 text-3xl font-bold text-emerald-600">{stats.available}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">진료 불가</p>
              <p className="mt-2 text-3xl font-bold text-red-600">{stats.unavailable}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">미확인</p>
              <p className="mt-2 text-3xl font-bold text-slate-600">{stats.unknown}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl border-0 shadow-sm">
          <CardContent className="p-4 md:p-5">
            <div className="grid gap-3 md:grid-cols-[1.6fr,1fr]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-10"
                  placeholder="병원명 또는 지역 검색"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="전체">전체</TabsTrigger>
                  <TabsTrigger value="진료 가능">가능</TabsTrigger>
                  <TabsTrigger value="진료 불가">불가</TabsTrigger>
                  <TabsTrigger value="미확인">미확인</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="py-16 text-center text-slate-500">불러오는 중...</CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filtered.map((hospital) => {
              const meta = statusMeta[hospital.status];
              const StatusIcon = meta.icon;
              const currentVote = voterSelections[hospital.id];

              return (
                <Card key={hospital.id} className="rounded-2xl border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <StatusDot status={hospital.status} />
                          <CardTitle className="text-xl">{hospital.name}</CardTitle>
                          <Badge variant="outline" className={meta.badge}>{meta.label}</Badge>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant={currentVote === "available" ? "default" : "outline"}
                          className="gap-2 rounded-2xl"
                          onClick={() => handleVote(hospital.id, "available")}
                        >
                          <CheckCircle2 className="h-4 w-4" /> {currentVote === "available" ? "가능 취소" : "가능"}
                        </Button>
                        <Button
                          variant={currentVote === "unavailable" ? "default" : "outline"}
                          className="gap-2 rounded-2xl"
                          onClick={() => handleVote(hospital.id, "unavailable")}
                        >
                          <XCircle className="h-4 w-4" /> {currentVote === "unavailable" ? "불가 취소" : "불가"}
                        </Button>
                        <Button
                          variant="outline"
                          className="gap-2 rounded-2xl"
                          onClick={() => requestProtectedAction({ type: "edit", hospital })}
                        >
                          <Pencil className="h-4 w-4" /> 수정
                        </Button>
                        <Button
                          variant="outline"
                          className="gap-2 rounded-2xl text-red-600"
                          onClick={() => requestProtectedAction({ type: "delete", id: hospital.id })}
                        >
                          <Trash2 className="h-4 w-4" /> 삭제
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                      <div className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{hospital.address || "주소 정보 없음"}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Phone className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{hospital.phone || "연락처 정보 없음"}</span>
                      </div>
                    </div>

                    <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-3">
                      <div>
                        <p className="text-xs text-slate-500">현재 표시 상태</p>
                        <div className={`mt-1 flex items-center gap-2 font-semibold ${meta.text}`}>
                          <StatusIcon className="h-4 w-4" /> {meta.label}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">가능 제보</p>
                        <p className="mt-1 text-lg font-semibold text-emerald-600">{hospital.upvotes}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">불가 제보</p>
                        <p className="mt-1 text-lg font-semibold text-red-600">{hospital.downvotes}</p>
                      </div>
                    </div>

                    {hospital.notes?.length > 0 && (
                      <div className="rounded-2xl border border-slate-200 p-4">
                        <p className="mb-2 text-sm font-semibold">메모</p>
                        <ul className="space-y-2 text-sm text-slate-600">
                          {hospital.notes.map((note, idx) => (
                            <li key={idx}>• {note}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {filtered.length === 0 && (
              <Card className="rounded-2xl border-0 shadow-sm">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <HelpCircle className="mb-3 h-10 w-10 text-slate-300" />
                  <p className="text-lg font-semibold">검색 결과가 없습니다</p>
                  <p className="mt-1 text-sm text-slate-500">검색어를 바꾸거나 병원을 직접 등록해보세요.</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}