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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const regionOptions = [
  "서울", "경기", "강원", "인천", "부산", "대구", "광주", "대전",
  "울산", "세종", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

const hospitalTypeOptions = ["상급종합병원", "종합병원", "병원", "의원"];
const designationTypeOptions = ["인공/체외 동시 지정기관", "인공수정 지정기관"];

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
    region: row.region ?? "서울",
    district: row.district ?? "",
    address: row.address ?? "",
    phone: row.phone ?? "",
    hospital_type: row.hospital_type ?? "",
    designation_type: row.designation_type ?? "",
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    status: computeStatus(upvotes, downvotes),
    upvotes,
    downvotes,
    notes: row.note ? [row.note] : [],
  };
}

function StatusDot({ status }) {
  return <span className={`inline-block h-3 w-3 rounded-full ${statusMeta[status].dot}`} />;
}

/* ── Place Search Hook ── */
function usePlaceSearch() {
  const [placeQuery, setPlaceQuery] = useState("");
  const [places, setPlaces] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  const search = useCallback((q) => {
    setPlaceQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim() || q.trim().length < 2) {
      setPlaces([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/hospitals/search-place?query=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        setPlaces(data.places || []);
      } catch {
        setPlaces([]);
      }
      setSearching(false);
    }, 300);
  }, []);

  const reset = useCallback(() => {
    setPlaceQuery("");
    setPlaces([]);
  }, []);

  return { placeQuery, places, searching, search, reset };
}

/* ── Verify password via API ── */
async function verifyPassword(id, password) {
  try {
    const res = await fetch("/api/hospitals/verify-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, password }),
    });
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

/* ── Main Component ── */
export default function FertilityHospitalApp() {
  const [hospitals, setHospitals] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [form, setForm] = useState({
    name: "",
    region: "서울",
    address: "",
    phone: "",
    memo: "",
    hospital_type: "",
    designation_type: "",
    password: "",
    latitude: null,
    longitude: null,
  });
  const [editingId, setEditingId] = useState(null);
  const [voterSelections, setVoterSelections] = useState({});
  const [formOpen, setFormOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordChecking, setPasswordChecking] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedHospitalId, setSelectedHospitalId] = useState(null);

  const userLocation = useGeolocation();
  const placeSearch = usePlaceSearch();

  const filtered = useMemo(() => {
    return hospitals.filter((h) => {
      const text = `${h.name} ${h.address} ${h.district} ${h.region} ${h.hospital_type} ${h.designation_type}`.toLowerCase();
      const matchesQuery = text.includes(query.toLowerCase());
      const matchesStatus =
        statusFilter === "전체" ||
        (statusFilter === "진료 가능" && h.status === "available") ||
        (statusFilter === "진료 불가" && h.status === "unavailable") ||
        (statusFilter === "미확인" && h.status === "unknown");
      return matchesQuery && matchesStatus;
    });
  }, [hospitals, query, statusFilter]);

  const stats = useMemo(() => ({
    total: hospitals.length,
    available: hospitals.filter((h) => h.status === "available").length,
    unavailable: hospitals.filter((h) => h.status === "unavailable").length,
    unknown: hospitals.filter((h) => h.status === "unknown").length,
  }), [hospitals]);

  const fetchHospitals = async () => {
    if (!supabase) { setError("Supabase 환경변수가 없습니다."); setLoading(false); return; }
    setLoading(true);
    setError("");
    const { data, error } = await supabase
      .from("hospitals")
      .select("id, name, region, district, address, phone, note, hospital_type, designation_type, upvotes, downvotes, latitude, longitude")
      .order("id", { ascending: true });
    if (error) { setError("병원 목록을 불러오지 못했습니다."); setLoading(false); return; }
    setHospitals((data ?? []).map(normalizeHospital));
    setLoading(false);
  };

  useEffect(() => { fetchHospitals(); }, []);

  const resetForm = () => {
    setForm({ name: "", region: "서울", address: "", phone: "", memo: "", hospital_type: "", designation_type: "", password: "", latitude: null, longitude: null });
    setEditingId(null);
    placeSearch.reset();
  };

  const openNewHospitalForm = () => { resetForm(); setFormOpen(true); };

  const requestProtectedAction = (action) => {
    setPendingAction(action);
    setPasswordValue("");
    setPasswordOpen(true);
  };

  const handleVote = async (id, type) => {
    const target = hospitals.find((h) => h.id === id);
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
    const { error } = await supabase.from("hospitals").update({ upvotes, downvotes }).eq("id", id);
    if (error) { window.alert("투표 저장에 실패했습니다."); return; }
    setHospitals((prev) => prev.map((h) => h.id === id ? { ...h, upvotes, downvotes, status: computeStatus(upvotes, downvotes) } : h));
    setVoterSelections((prev) => ({ ...prev, [id]: previousVote === type ? null : type }));
  };

  const handleAddHospital = async () => {
    if (!form.name.trim() || !form.password.trim() || !supabase) {
      if (!form.password.trim()) window.alert("비밀번호를 입력해주세요.");
      return;
    }
    const payload = {
      name: form.name.trim(),
      region: form.region.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      note: form.memo.trim(),
      hospital_type: form.hospital_type || null,
      designation_type: form.designation_type || null,
      latitude: form.latitude,
      longitude: form.longitude,
      password: form.password.trim(),
      upvotes: 0,
      downvotes: 0,
    };
    const { data, error } = await supabase
      .from("hospitals")
      .insert(payload)
      .select("id, name, region, district, address, phone, note, hospital_type, designation_type, upvotes, downvotes, latitude, longitude")
      .single();
    if (error) { window.alert("병원 등록에 실패했습니다."); return; }
    setHospitals((prev) => [normalizeHospital(data), ...prev]);
    resetForm();
    setFormOpen(false);
  };

  const handleSaveHospital = async () => {
    if (!form.name.trim() || editingId === null || !supabase) return;
    const payload = {
      name: form.name.trim(),
      region: form.region.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      note: form.memo.trim(),
      hospital_type: form.hospital_type || null,
      designation_type: form.designation_type || null,
      latitude: form.latitude,
      longitude: form.longitude,
    };
    const { data, error } = await supabase
      .from("hospitals")
      .update(payload)
      .eq("id", editingId)
      .select("id, name, region, district, address, phone, note, hospital_type, designation_type, upvotes, downvotes, latitude, longitude")
      .single();
    if (error) { window.alert("병원 수정에 실패했습니다."); return; }
    setHospitals((prev) => prev.map((h) => h.id === editingId ? normalizeHospital(data) : h));
    resetForm();
    setFormOpen(false);
  };

  const openEditHospital = (hospital) => {
    setEditingId(hospital.id);
    setForm({
      name: hospital.name || "",
      region: hospital.region || "서울",
      address: hospital.address || "",
      phone: hospital.phone || "",
      memo: hospital.notes?.[0] || "",
      hospital_type: hospital.hospital_type || "",
      designation_type: hospital.designation_type || "",
      password: "",
      latitude: hospital.latitude,
      longitude: hospital.longitude,
    });
    setFormOpen(true);
  };

  const performDeleteHospital = async (id) => {
    if (!supabase) return;
    const { error } = await supabase.from("hospitals").delete().eq("id", id);
    if (error) { window.alert("병원 삭제에 실패했습니다."); return; }
    setHospitals((prev) => prev.filter((h) => h.id !== id));
    setVoterSelections((prev) => { const next = { ...prev }; delete next[id]; return next; });
    if (editingId === id) { resetForm(); setFormOpen(false); }
  };

  const handlePasswordSubmit = async () => {
    const targetId = pendingAction?.type === "edit" ? pendingAction.hospital.id : pendingAction?.id;
    if (!targetId || !passwordValue) return;

    setPasswordChecking(true);
    const ok = await verifyPassword(targetId, passwordValue);
    setPasswordChecking(false);

    if (!ok) {
      window.alert("비밀번호가 올바르지 않습니다.");
      return;
    }

    if (pendingAction?.type === "edit") openEditHospital(pendingAction.hospital);
    if (pendingAction?.type === "delete") performDeleteHospital(pendingAction.id);

    setPasswordOpen(false);
    setPasswordValue("");
    setPendingAction(null);
  };

  const closePasswordDialog = (open) => {
    setPasswordOpen(open);
    if (!open) { setPasswordValue(""); setPendingAction(null); }
  };

  const handleSelectPlace = (place) => {
    // Extract region from address
    const regionMap = {
      '서울': '서울', '부산': '부산', '대구': '대구', '인천': '인천',
      '광주': '광주', '대전': '대전', '울산': '울산', '세종': '세종',
      '경기': '경기', '강원': '강원', '충북': '충북', '충남': '충남',
      '전북': '전북', '전남': '전남', '경북': '경북', '경남': '경남', '제주': '제주',
    };
    let region = "서울";
    for (const [key, val] of Object.entries(regionMap)) {
      if (place.address?.includes(key)) { region = val; break; }
    }

    setForm((prev) => ({
      ...prev,
      name: prev.name || place.name,
      address: place.road_address || place.address,
      phone: prev.phone || place.phone,
      latitude: place.latitude,
      longitude: place.longitude,
      region,
    }));
    placeSearch.reset();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 lg:p-10">
      <div className="mx-auto max-w-4xl space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-xl md:text-3xl font-bold tracking-tight">난임 지정 병원 찾기</h1>
            <p className="max-w-3xl text-xs md:text-sm leading-5 md:leading-6 text-slate-600">
              전국 난임시술 의료기관 지정 현황 (2025.12.31 기준) · 환자가 직접 "진료 가능 / 불가"를 제보합니다.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          {/* ── Hospital Form Dialog ── */}
          <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2 rounded-2xl" onClick={openNewHospitalForm}>
                <PlusCircle className="h-4 w-4" /> 병원 직접 등록
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "병원 수정" : "병원 등록"}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-4 py-2">
                {/* Place Search */}
                <div className="space-y-2">
                  <Label>장소 검색 (카카오)</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      className="pl-10"
                      placeholder="병원명 또는 주소로 검색"
                      value={placeSearch.placeQuery}
                      onChange={(e) => placeSearch.search(e.target.value)}
                    />
                    {placeSearch.searching && (
                      <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
                    )}
                  </div>
                  {placeSearch.places.length > 0 && (
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                      {placeSearch.places.map((place, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectPlace(place)}
                          className="w-full px-3 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0"
                        >
                          <p className="text-sm font-medium">{place.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{place.road_address || place.address}</p>
                          {place.phone && <p className="text-xs text-slate-400 mt-0.5">{place.phone}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <hr className="border-slate-200" />

                {/* Name */}
                <div className="space-y-2">
                  <Label>병원명 *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>

                {/* Type dropdowns */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>종별</Label>
                    <select
                      value={form.hospital_type}
                      onChange={(e) => setForm({ ...form, hospital_type: e.target.value })}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="">선택</option>
                      {hospitalTypeOptions.map((t) => (<option key={t} value={t}>{t}</option>))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>지정 유형</Label>
                    <select
                      value={form.designation_type}
                      onChange={(e) => setForm({ ...form, designation_type: e.target.value })}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="">선택</option>
                      {designationTypeOptions.map((t) => (<option key={t} value={t}>{t}</option>))}
                    </select>
                  </div>
                </div>

                {/* Region */}
                <div className="space-y-2">
                  <Label>지역</Label>
                  <select
                    value={form.region}
                    onChange={(e) => setForm({ ...form, region: e.target.value })}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  >
                    {regionOptions.map((r) => (<option key={r} value={r}>{r}</option>))}
                  </select>
                </div>

                {/* Address (read-only, filled by place search) */}
                <div className="space-y-2">
                  <Label>
                    주소
                    {form.latitude
                      ? <span className="text-emerald-600 text-xs ml-1">좌표 입력됨</span>
                      : <span className="text-orange-500 text-xs ml-1">위 장소 검색으로 입력해주세요</span>
                    }
                  </Label>
                  <Input
                    value={form.address}
                    readOnly
                    className="bg-slate-50 cursor-not-allowed"
                    placeholder="장소 검색으로 자동 입력됩니다"
                  />
                  {form.address && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, address: "", latitude: null, longitude: null, region: "서울" })}
                      className="text-xs text-red-500 hover:underline"
                    >
                      주소 초기화
                    </button>
                  )}
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <Label>전화번호</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>

                {/* Memo */}
                <div className="space-y-2">
                  <Label>메모</Label>
                  <Textarea value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
                </div>

                {/* Password */}
                {!editingId && (
                  <div className="space-y-2">
                    <Label>비밀번호 * <span className="text-xs text-slate-400 font-normal">수정/삭제 시 필요</span></Label>
                    <Input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="비밀번호 설정"
                    />
                  </div>
                )}

                {/* Submit */}
                <div className="flex gap-2">
                  <Button onClick={editingId ? handleSaveHospital : handleAddHospital} className="flex-1 rounded-2xl">
                    {editingId ? "수정 저장" : "등록하기"}
                  </Button>
                  {editingId && (
                    <Button variant="outline" onClick={() => { resetForm(); setFormOpen(false); }} className="rounded-2xl">
                      취소
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Password Dialog */}
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
                  onKeyDown={(e) => { if (e.key === "Enter") handlePasswordSubmit(); }}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handlePasswordSubmit} disabled={passwordChecking} className="flex-1 rounded-2xl">
                  {passwordChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : "확인"}
                </Button>
                <Button variant="outline" onClick={() => closePasswordDialog(false)} className="rounded-2xl">취소</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 md:gap-4">
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="p-3 md:p-5">
              <p className="text-[10px] md:text-sm text-slate-500">전체</p>
              <p className="mt-0.5 text-lg md:text-3xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="p-3 md:p-5">
              <p className="text-[10px] md:text-sm text-slate-500">진료 가능</p>
              <p className="mt-0.5 text-lg md:text-3xl font-bold text-emerald-600">{stats.available}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="p-3 md:p-5">
              <p className="text-[10px] md:text-sm text-slate-500">진료 불가</p>
              <p className="mt-0.5 text-lg md:text-3xl font-bold text-red-600">{stats.unavailable}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="p-3 md:p-5">
              <p className="text-[10px] md:text-sm text-slate-500">미확인</p>
              <p className="mt-0.5 text-lg md:text-3xl font-bold text-slate-600">{stats.unknown}</p>
            </CardContent>
          </Card>
        </div>

        {/* Search + Filter */}
        <Card className="rounded-2xl border-0 shadow-sm">
          <CardContent className="p-3 md:p-5">
            <div className="grid gap-3 md:grid-cols-[1.6fr,1fr]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-10"
                  placeholder="병원명, 지역, 주소, 종별 검색"
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

        {/* Map */}
        <HospitalMap
          hospitals={filtered}
          userLocation={userLocation}
          onSelectHospital={(id) => setSelectedHospitalId(id)}
        />

        {/* Hospital List */}
        {selectedHospitalId && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs px-2 py-1 bg-blue-50 text-blue-700 border-blue-200">
              지도에서 선택한 병원
            </Badge>
            <button onClick={() => setSelectedHospitalId(null)} className="text-xs text-slate-500 hover:underline">
              전체 보기
            </button>
          </div>
        )}
        {loading ? (
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="py-16 text-center text-slate-500">불러오는 중...</CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:gap-4">
            {(selectedHospitalId ? filtered.filter((h) => h.id === selectedHospitalId) : filtered).map((hospital) => {
              const meta = statusMeta[hospital.status];
              const StatusIcon = meta.icon;
              const currentVote = voterSelections[hospital.id];

              return (
                <Card key={hospital.id} className="rounded-2xl border-0 shadow-sm">
                  <CardHeader className="px-4 pb-2 pt-4 md:px-6 md:pb-3 md:pt-6">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusDot status={hospital.status} />
                          <CardTitle className="text-base md:text-xl">{hospital.name}</CardTitle>
                          <Badge variant="outline" className={meta.badge}>{meta.label}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {hospital.hospital_type && (
                            <Badge variant="outline" className="text-[10px] md:text-xs px-1.5 py-0 text-slate-500 border-slate-200">
                              {hospital.hospital_type}
                            </Badge>
                          )}
                          {hospital.designation_type && (
                            <Badge variant="outline" className="text-[10px] md:text-xs px-1.5 py-0 text-slate-500 border-slate-200">
                              {hospital.designation_type}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 md:gap-2">
                        <Button size="sm" variant={currentVote === "available" ? "default" : "outline"} className="gap-1.5 rounded-2xl text-xs md:text-sm" onClick={() => handleVote(hospital.id, "available")}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span className="hidden md:inline">{currentVote === "available" ? "가능 취소" : "가능"}</span>
                          <span className="md:hidden">{currentVote === "available" ? "취소" : "가능"}</span>
                        </Button>
                        <Button size="sm" variant={currentVote === "unavailable" ? "default" : "outline"} className="gap-1.5 rounded-2xl text-xs md:text-sm" onClick={() => handleVote(hospital.id, "unavailable")}>
                          <XCircle className="h-3.5 w-3.5" />
                          <span className="hidden md:inline">{currentVote === "unavailable" ? "불가 취소" : "불가"}</span>
                          <span className="md:hidden">{currentVote === "unavailable" ? "취소" : "불가"}</span>
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 rounded-2xl text-xs md:text-sm" onClick={() => requestProtectedAction({ type: "edit", hospital })}>
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="hidden md:inline">수정</span>
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 rounded-2xl text-xs md:text-sm text-red-600" onClick={() => requestProtectedAction({ type: "delete", id: hospital.id })}>
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="hidden md:inline">삭제</span>
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 px-4 pb-4 md:px-6 md:pb-6">
                    <div className="grid gap-2 text-xs md:text-sm text-slate-600 md:grid-cols-2">
                      <div className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 md:h-4 md:w-4 shrink-0" />
                        <span className="line-clamp-2">{hospital.address || hospital.region || "주소 정보 없음"}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Phone className="mt-0.5 h-3.5 w-3.5 md:h-4 md:w-4 shrink-0" />
                        {hospital.phone ? (
                          <a href={`tel:${hospital.phone}`} className="text-blue-600 hover:underline">{hospital.phone}</a>
                        ) : (
                          <span>연락처 정보 없음</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 rounded-2xl bg-slate-50 p-3 md:p-4">
                      <div>
                        <p className="text-[10px] md:text-xs text-slate-500">현재 상태</p>
                        <div className={`mt-0.5 flex items-center gap-1.5 text-sm font-semibold ${meta.text}`}>
                          <StatusIcon className="h-3.5 w-3.5" /> {meta.label}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] md:text-xs text-slate-500">가능 제보</p>
                        <p className="mt-0.5 text-base md:text-lg font-semibold text-emerald-600">{hospital.upvotes}</p>
                      </div>
                      <div>
                        <p className="text-[10px] md:text-xs text-slate-500">불가 제보</p>
                        <p className="mt-0.5 text-base md:text-lg font-semibold text-red-600">{hospital.downvotes}</p>
                      </div>
                    </div>

                    {hospital.notes?.length > 0 && hospital.notes[0] && (
                      <div className="rounded-2xl border border-slate-200 p-3 md:p-4">
                        <p className="mb-1.5 text-xs md:text-sm font-semibold">메모</p>
                        <ul className="space-y-1.5 text-xs md:text-sm text-slate-600">
                          {hospital.notes.map((note, idx) => (<li key={idx}>• {note}</li>))}
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
