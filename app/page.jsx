"use client";

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
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
  Loader2,
  MessageCircle,
  Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useGeolocation } from "@/hooks/useGeolocation";

const HospitalMap = dynamic(() => import("@/components/map/HospitalMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] md:h-[500px] items-center justify-center rounded-2xl bg-slate-100">
      <p className="text-slate-500">지도를 불러오는 중...</p>
    </div>
  ),
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const regionOptions = ["서울","경기","강원","인천","부산","대구","광주","대전","울산","세종","충북","충남","전북","전남","경북","경남","제주"];
const hospitalTypeOptions = ["상급종합병원", "종합병원", "병원", "의원"];
const designationTypeOptions = ["인공/체외 동시 지정기관", "인공수정 지정기관"];

const statusMeta = {
  available: { label: "진료 가능", dot: "bg-emerald-500", text: "text-emerald-700", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  unavailable: { label: "진료 불가", dot: "bg-red-500", text: "text-red-700", badge: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
  unknown: { label: "미확인", dot: "bg-slate-400", text: "text-slate-700", badge: "bg-slate-50 text-slate-700 border-slate-200", icon: HelpCircle },
};

function computeStatusFromComments(comments) {
  if (!comments || comments.length === 0) return "unknown";
  const sorted = [...comments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (sorted[0].status === "available" || sorted[0].status === "unavailable") return sorted[0].status;
  const lastKnown = sorted.find((c) => c.status === "available" || c.status === "unavailable");
  return lastKnown ? lastKnown.status : "unknown";
}

function normalizeHospital(row, comments = []) {
  return {
    id: row.id,
    name: row.name ?? "",
    region: row.region ?? "",
    district: row.district ?? "",
    address: row.address ?? "",
    phone: row.phone ?? "",
    hospital_type: row.hospital_type ?? "",
    designation_type: row.designation_type ?? "",
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    status: computeStatusFromComments(comments),
    comments,
    notes: row.note ? [row.note] : [],
  };
}

function StatusDot({ status }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusMeta[status].dot}`} />;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}일 전`;
  return `${Math.floor(days / 30)}개월 전`;
}

/* ── Place Search ── */
function usePlaceSearch() {
  const [placeQuery, setPlaceQuery] = useState("");
  const [places, setPlaces] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  const search = useCallback((q) => {
    setPlaceQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim() || q.trim().length < 2) { setPlaces([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/hospitals/search-place?query=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        setPlaces(data.places || []);
      } catch { setPlaces([]); }
      setSearching(false);
    }, 300);
  }, []);

  const reset = useCallback(() => { setPlaceQuery(""); setPlaces([]); }, []);
  return { placeQuery, places, searching, search, reset };
}

async function verifyPassword(id, password) {
  try {
    const res = await fetch("/api/hospitals/verify-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, password }),
    });
    return (await res.json()).ok === true;
  } catch { return false; }
}

async function deleteComment(id, password) {
  try {
    const res = await fetch("/api/comments/delete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, password }),
    });
    return (await res.json()).ok === true;
  } catch { return false; }
}

/* ── Main ── */
export default function FertilityHospitalApp() {
  const [hospitals, setHospitals] = useState([]);
  const [allComments, setAllComments] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [form, setForm] = useState({ name: "", region: "서울", address: "", phone: "", memo: "", hospital_type: "", designation_type: "", password: "", latitude: null, longitude: null });
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordChecking, setPasswordChecking] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedHospitalId, setSelectedHospitalId] = useState(null);
  // Comment form state per hospital
  const [commentForms, setCommentForms] = useState({});
  const [commentDeleting, setCommentDeleting] = useState(null);
  const [commentDeletePw, setCommentDeletePw] = useState("");

  const userLocation = useGeolocation();
  const placeSearch = usePlaceSearch();

  const hospitalsWithStatus = useMemo(() => {
    const commentsByHospital = {};
    allComments.forEach((c) => {
      if (!commentsByHospital[c.hospital_id]) commentsByHospital[c.hospital_id] = [];
      commentsByHospital[c.hospital_id].push(c);
    });
    return hospitals.map((h) => ({ ...h, status: computeStatusFromComments(commentsByHospital[h.id] || []), comments: commentsByHospital[h.id] || [] }));
  }, [hospitals, allComments]);

  const filtered = useMemo(() => {
    return hospitalsWithStatus.filter((h) => {
      const text = `${h.name} ${h.address} ${h.district} ${h.region} ${h.hospital_type} ${h.designation_type}`.toLowerCase();
      const matchesQuery = text.includes(query.toLowerCase());
      const matchesStatus = statusFilter === "전체" ||
        (statusFilter === "진료 가능" && h.status === "available") ||
        (statusFilter === "진료 불가" && h.status === "unavailable") ||
        (statusFilter === "미확인" && h.status === "unknown");
      return matchesQuery && matchesStatus;
    });
  }, [hospitalsWithStatus, query, statusFilter]);

  const stats = useMemo(() => ({
    total: hospitalsWithStatus.length,
    available: hospitalsWithStatus.filter((h) => h.status === "available").length,
    unavailable: hospitalsWithStatus.filter((h) => h.status === "unavailable").length,
    unknown: hospitalsWithStatus.filter((h) => h.status === "unknown").length,
  }), [hospitalsWithStatus]);

  const fetchData = async () => {
    if (!supabase) { setError("Supabase 환경변수가 없습니다."); setLoading(false); return; }
    setLoading(true); setError("");
    const [hRes, cRes] = await Promise.all([
      supabase.from("hospitals").select("id, name, region, district, address, phone, note, hospital_type, designation_type, latitude, longitude").order("id", { ascending: true }),
      supabase.from("comments").select("id, hospital_id, content, status, created_at").order("created_at", { ascending: false }),
    ]);
    if (hRes.error) { setError("병원 목록을 불러오지 못했습니다."); setLoading(false); return; }
    setHospitals((hRes.data ?? []).map((r) => ({ ...r, name: r.name ?? "", region: r.region ?? "", district: r.district ?? "", address: r.address ?? "", phone: r.phone ?? "", hospital_type: r.hospital_type ?? "", designation_type: r.designation_type ?? "", latitude: r.latitude ?? null, longitude: r.longitude ?? null, notes: r.note ? [r.note] : [] })));
    setAllComments(cRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const resetForm = () => {
    setForm({ name: "", region: "서울", address: "", phone: "", memo: "", hospital_type: "", designation_type: "", password: "", latitude: null, longitude: null });
    setEditingId(null);
    placeSearch.reset();
  };

  const requestProtectedAction = (action) => { setPendingAction(action); setPasswordValue(""); setPasswordOpen(true); };

  const handleAddHospital = async () => {
    if (!form.name.trim() || !form.password.trim() || !supabase) {
      if (!form.password.trim()) window.alert("비밀번호를 입력해주세요.");
      return;
    }
    const payload = { name: form.name.trim(), region: form.region.trim(), address: form.address.trim(), phone: form.phone.trim(), note: form.memo.trim(), hospital_type: form.hospital_type || null, designation_type: form.designation_type || null, latitude: form.latitude, longitude: form.longitude, password: form.password.trim() };
    const { data, error } = await supabase.from("hospitals").insert(payload).select("id, name, region, district, address, phone, note, hospital_type, designation_type, latitude, longitude").single();
    if (error) { window.alert("병원 등록에 실패했습니다."); return; }
    setHospitals((prev) => [{ ...data, name: data.name ?? "", region: data.region ?? "", district: data.district ?? "", address: data.address ?? "", phone: data.phone ?? "", hospital_type: data.hospital_type ?? "", designation_type: data.designation_type ?? "", latitude: data.latitude ?? null, longitude: data.longitude ?? null, notes: data.note ? [data.note] : [] }, ...prev]);
    resetForm(); setFormOpen(false);
  };

  const handleSaveHospital = async () => {
    if (!form.name.trim() || editingId === null || !supabase) return;
    const payload = { name: form.name.trim(), region: form.region.trim(), address: form.address.trim(), phone: form.phone.trim(), note: form.memo.trim(), hospital_type: form.hospital_type || null, designation_type: form.designation_type || null, latitude: form.latitude, longitude: form.longitude };
    const { data, error } = await supabase.from("hospitals").update(payload).eq("id", editingId).select("id, name, region, district, address, phone, note, hospital_type, designation_type, latitude, longitude").single();
    if (error) { window.alert("병원 수정에 실패했습니다."); return; }
    setHospitals((prev) => prev.map((h) => h.id === editingId ? { ...data, name: data.name ?? "", region: data.region ?? "", district: data.district ?? "", address: data.address ?? "", phone: data.phone ?? "", hospital_type: data.hospital_type ?? "", designation_type: data.designation_type ?? "", latitude: data.latitude ?? null, longitude: data.longitude ?? null, notes: data.note ? [data.note] : [] } : h));
    resetForm(); setFormOpen(false);
  };

  const openEditHospital = (hospital) => {
    setEditingId(hospital.id);
    setForm({ name: hospital.name, region: hospital.region || "서울", address: hospital.address, phone: hospital.phone, memo: hospital.notes?.[0] || "", hospital_type: hospital.hospital_type, designation_type: hospital.designation_type, password: "", latitude: hospital.latitude, longitude: hospital.longitude });
    setFormOpen(true);
  };

  const performDeleteHospital = async (id) => {
    if (!supabase) return;
    const { error } = await supabase.from("hospitals").delete().eq("id", id);
    if (error) { window.alert("병원 삭제에 실패했습니다."); return; }
    setHospitals((prev) => prev.filter((h) => h.id !== id));
    setAllComments((prev) => prev.filter((c) => c.hospital_id !== id));
    if (editingId === id) { resetForm(); setFormOpen(false); }
  };

  const handlePasswordSubmit = async () => {
    const targetId = pendingAction?.type === "edit" ? pendingAction.hospital.id : pendingAction?.id;
    if (!targetId || !passwordValue) return;
    setPasswordChecking(true);
    const ok = await verifyPassword(targetId, passwordValue);
    setPasswordChecking(false);
    if (!ok) { window.alert("비밀번호가 올바르지 않습니다."); return; }
    if (pendingAction?.type === "edit") openEditHospital(pendingAction.hospital);
    if (pendingAction?.type === "delete") performDeleteHospital(pendingAction.id);
    setPasswordOpen(false); setPasswordValue(""); setPendingAction(null);
  };

  const handleAddComment = async (hospitalId) => {
    const cf = commentForms[hospitalId];
    if (!cf?.content?.trim() || !cf?.status || !cf?.password?.trim() || !supabase) return;
    const { data, error } = await supabase.from("comments").insert({ hospital_id: hospitalId, content: cf.content.trim(), status: cf.status, password: cf.password.trim() }).select("id, hospital_id, content, status, created_at").single();
    if (error) { window.alert("제보 등록에 실패했습니다."); return; }
    setAllComments((prev) => [data, ...prev]);
    setCommentForms((prev) => ({ ...prev, [hospitalId]: { content: "", status: "unknown", password: "" } }));
  };

  const handleDeleteComment = async (commentId) => {
    if (!commentDeletePw.trim()) return;
    setCommentDeleting(commentId);
    const ok = await deleteComment(commentId, commentDeletePw.trim());
    setCommentDeleting(null);
    if (!ok) { window.alert("비밀번호가 올바르지 않습니다."); return; }
    setAllComments((prev) => prev.filter((c) => c.id !== commentId));
    setCommentDeletePw("");
  };

  const handleSelectPlace = (place) => {
    const regionMap = { '서울':'서울','부산':'부산','대구':'대구','인천':'인천','광주':'광주','대전':'대전','울산':'울산','세종':'세종','경기':'경기','강원':'강원','충북':'충북','충남':'충남','전북':'전북','전남':'전남','경북':'경북','경남':'경남','제주':'제주' };
    let region = "서울";
    for (const [key, val] of Object.entries(regionMap)) { if (place.address?.includes(key)) { region = val; break; } }
    setForm((prev) => ({ ...prev, name: prev.name || place.name, address: place.road_address || place.address, phone: prev.phone || place.phone, latitude: place.latitude, longitude: place.longitude, region }));
    placeSearch.reset();
  };

  const updateCommentForm = (hospitalId, field, value) => {
    setCommentForms((prev) => ({
      ...prev,
      [hospitalId]: { content: "", status: "unknown", password: "", ...prev[hospitalId], [field]: value },
    }));
  };

  const statCards = [
    { key: "전체", label: "전체", value: stats.total, color: "" },
    { key: "진료 가능", label: "가능", value: stats.available, color: "text-emerald-600" },
    { key: "진료 불가", label: "불가", value: stats.unavailable, color: "text-red-600" },
    { key: "미확인", label: "미확인", value: stats.unknown, color: "text-slate-500" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 lg:p-10">
      <div className="mx-auto max-w-4xl space-y-4 md:space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">난임 지정 병원 찾기</h1>
            <p className="text-xs md:text-sm text-slate-500 mt-1">전국 난임시술 의료기관 현황 (2025.12.31 기준)</p>
            <p className="text-[11px] text-slate-400 mt-1">가능/불가 여부는 최근 제보를 기준으로 표시되며, 실제 진료 상황과 다를 수 있습니다.</p>
            {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
          </div>
          <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => { resetForm(); setFormOpen(true); }}>
                <PlusCircle className="h-4 w-4" /> 병원 등록
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingId ? "병원 수정" : "병원 등록"}</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-2">
                {/* Place Search */}
                <div className="space-y-2">
                  <Label>장소 검색</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input className="pl-10" placeholder="병원명 또는 주소로 검색" value={placeSearch.placeQuery} onChange={(e) => { placeSearch.search(e.target.value); setForm((prev) => ({ ...prev, address: "", latitude: null, longitude: null })); }} />
                    {placeSearch.searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
                  </div>
                  {placeSearch.places.length > 0 && (
                    <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                      {placeSearch.places.map((place, idx) => (
                        <button key={idx} type="button" onClick={() => handleSelectPlace(place)} className="w-full px-3 py-2 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0">
                          <p className="text-sm font-medium">{place.name}</p>
                          <p className="text-xs text-slate-500">{place.road_address || place.address}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <hr />
                <div className="space-y-2">
                  <Label>병원명 *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>종별</Label>
                    <select value={form.hospital_type} onChange={(e) => setForm({ ...form, hospital_type: e.target.value })} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                      <option value="">선택</option>
                      {hospitalTypeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>지정 유형</Label>
                    <select value={form.designation_type} onChange={(e) => setForm({ ...form, designation_type: e.target.value })} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                      <option value="">선택</option>
                      {designationTypeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>지역</Label>
                  <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                    {regionOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>주소 {!form.latitude && <span className="text-orange-500 text-xs font-normal">장소 검색을 진행해주세요</span>}{form.latitude && <span className="text-emerald-600 text-xs font-normal">좌표 입력됨</span>}</Label>
                  <Input value={form.address} readOnly className="bg-slate-50 cursor-not-allowed text-sm" />
                </div>
                <div className="space-y-2">
                  <Label>전화번호</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>메모</Label>
                  <Textarea value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} rows={2} />
                </div>
                {!editingId && (
                  <div className="space-y-2">
                    <Label>비밀번호 *</Label>
                    <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="비밀번호 설정" />
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button onClick={editingId ? handleSaveHospital : handleAddHospital} className="flex-1 rounded-xl">{editingId ? "수정 저장" : "등록하기"}</Button>
                  {editingId && <Button variant="outline" onClick={() => { resetForm(); setFormOpen(false); }} className="rounded-xl">취소</Button>}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Password Dialog */}
        <Dialog open={passwordOpen} onOpenChange={(open) => { setPasswordOpen(open); if (!open) { setPasswordValue(""); setPendingAction(null); } }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>비밀번호 입력</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <Input type="password" value={passwordValue} onChange={(e) => setPasswordValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handlePasswordSubmit(); }} placeholder="비밀번호" />
              <div className="flex gap-2">
                <Button onClick={handlePasswordSubmit} disabled={passwordChecking} className="flex-1 rounded-xl">{passwordChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : "확인"}</Button>
                <Button variant="outline" onClick={() => { setPasswordOpen(false); setPasswordValue(""); setPendingAction(null); }} className="rounded-xl">취소</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Stat Cards as Filter */}
        <div className="grid grid-cols-4 gap-2">
          {statCards.map((s) => (
            <button key={s.key} onClick={() => setStatusFilter(s.key)} className={`rounded-2xl p-3 md:p-4 text-left transition-all ${statusFilter === s.key ? "bg-white shadow-md ring-2 ring-slate-900/10" : "bg-white/60 shadow-sm hover:bg-white hover:shadow"}`}>
              <p className="text-[10px] md:text-xs text-slate-500">{s.label}</p>
              <p className={`mt-0.5 text-lg md:text-2xl font-bold ${s.color}`}>{s.value}</p>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-10 rounded-xl bg-white shadow-sm border-0" placeholder="병원명, 지역, 주소, 종별 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        {/* Map */}
        <HospitalMap hospitals={filtered} userLocation={userLocation} onSelectHospital={(id) => setSelectedHospitalId(id)} />

        {/* Selected hospital indicator */}
        {selectedHospitalId && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs px-2 py-1 bg-blue-50 text-blue-700 border-blue-200">지도에서 선택됨</Badge>
            <button onClick={() => setSelectedHospitalId(null)} className="text-xs text-slate-500 hover:underline">전체 보기</button>
          </div>
        )}

        {/* Hospital List */}
        {loading ? (
          <div className="py-16 text-center text-slate-500">불러오는 중...</div>
        ) : (
          <div className="space-y-3">
            {(selectedHospitalId ? filtered.filter((h) => h.id === selectedHospitalId) : filtered).map((hospital) => {
              const meta = statusMeta[hospital.status];
              const StatusIcon = meta.icon;
              const cf = commentForms[hospital.id] || { content: "", status: "unknown", password: "" };

              return (
                <Card key={hospital.id} className="rounded-2xl border-0 shadow-sm overflow-hidden">
                  {/* Hospital Header */}
                  <div className="px-4 pt-4 pb-3 md:px-5 md:pt-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusDot status={hospital.status} />
                          <h3 className="text-sm md:text-base font-semibold truncate">{hospital.name}</h3>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${meta.badge}`}>{meta.label}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {hospital.hospital_type && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-500 border-slate-200">{hospital.hospital_type}</Badge>}
                          {hospital.designation_type && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-500 border-slate-200">{hospital.designation_type}</Badge>}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => requestProtectedAction({ type: "edit", hospital })}><Pencil className="h-3.5 w-3.5 text-slate-400" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => requestProtectedAction({ type: "delete", id: hospital.id })}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="mt-2.5 space-y-1 text-xs text-slate-500">
                      {hospital.address && (
                        <div className="flex items-start gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span className="line-clamp-1">{hospital.address}</span>
                        </div>
                      )}
                      {hospital.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          <a href={`tel:${hospital.phone}`} className="text-blue-600 hover:underline">{hospital.phone}</a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Comments Section */}
                  <div className="border-t border-slate-100 bg-slate-50/50">
                    <div className="px-4 py-3 md:px-5">
                      <p className="text-xs font-medium text-slate-500 mb-2.5 flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5" />
                       {hospital.comments.length >= 0 && `(${hospital.comments.length})`}
                      </p>

                      {/* Comment List */}
                      {hospital.comments.length > 0 && (
                        <div className="space-y-2 mb-3">
                          {hospital.comments.slice(0, 5).map((c) => (
                            <div key={c.id} className="flex items-start gap-2 group">
                              <StatusDot status={c.status} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-slate-700">{c.content}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(c.created_at)}</p>
                              </div>
                              {/* Delete comment */}
                              {commentDeleting === c.id ? (
                                <div className="flex items-center gap-1">
                                  <input type="password" value={commentDeletePw} onChange={(e) => setCommentDeletePw(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleDeleteComment(c.id); }} placeholder="비밀번호" className="h-6 w-20 rounded border border-slate-200 px-1.5 text-[10px]" />
                                  <button onClick={() => handleDeleteComment(c.id)} className="text-[10px] text-red-500 hover:underline">삭제</button>
                                  <button onClick={() => { setCommentDeleting(null); setCommentDeletePw(""); }} className="text-[10px] text-slate-400 hover:underline">취소</button>
                                </div>
                              ) : (
                                <button onClick={() => { setCommentDeleting(c.id); setCommentDeletePw(""); }} className="opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Trash2 className="h-3 w-3 text-slate-300 hover:text-red-400" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add Comment Form */}
                      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <div className="flex items-center gap-1 px-3 pt-2.5 pb-2">
                          {[{ key: "available", label: "가능", cls: "emerald" }, { key: "unavailable", label: "불가", cls: "red" }, { key: "unknown", label: "미확인", cls: "slate" }].map((s) => (
                            <button key={s.key} type="button" onClick={() => updateCommentForm(hospital.id, "status", s.key)}
                              className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${(cf.status || "unknown") === s.key
                                ? s.cls === "emerald" ? "bg-emerald-100 text-emerald-700" : s.cls === "red" ? "bg-red-100 text-red-700" : "bg-slate-200 text-slate-700"
                                : "text-slate-400 hover:text-slate-600"}`}>
                              {s.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center px-3 pb-2.5 gap-2">
                          <input value={cf.content} onChange={(e) => updateCommentForm(hospital.id, "content", e.target.value)} placeholder="제보 내용을 입력해주세요" className="flex-1 text-xs outline-none bg-transparent placeholder:text-slate-400" />
                          <span className="text-slate-200 select-none">|</span>
                          <input type="password" value={cf.password} onChange={(e) => updateCommentForm(hospital.id, "password", e.target.value)} placeholder="비밀번호" className="w-16 text-xs outline-none bg-transparent text-right placeholder:text-slate-400" />
                          <button disabled={!cf.content?.trim() || !cf.password?.trim()} onClick={() => handleAddComment(hospital.id)} className="text-blue-500 hover:text-blue-600 disabled:text-slate-300 transition-colors shrink-0">
                            <Send className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}

            {filtered.length === 0 && !selectedHospitalId && (
              <div className="py-16 text-center">
                <HelpCircle className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p className="font-semibold">검색 결과가 없습니다</p>
                <p className="mt-1 text-sm text-slate-500">검색어를 바꾸거나 병원을 직접 등록해보세요.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
