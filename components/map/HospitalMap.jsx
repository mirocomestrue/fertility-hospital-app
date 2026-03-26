"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Map, MapMarker, CustomOverlayMap } from "react-kakao-maps-sdk";
import { LocateFixed, Phone, MapPin, Navigation, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const STATUS_COLORS = {
  available: { bg: "#10b981", label: "진료 가능" },
  unavailable: { bg: "#ef4444", label: "진료 불가" },
  unknown: { bg: "#94a3b8", label: "미확인" },
};

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };

function useKakaoMapReady() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const check = () => {
      if (window.kakao && window.kakao.maps) {
        if (window.kakao.maps.LatLng) {
          setReady(true);
          return true;
        }
        // autoload=false: need to call kakao.maps.load()
        window.kakao.maps.load(() => {
          setReady(true);
        });
        return true;
      }
      return false;
    };

    if (check()) return;

    // Poll for script load (Script tag in layout loads it)
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (check()) {
        clearInterval(interval);
      } else if (attempts > 50) {
        clearInterval(interval);
        setError("카카오 지도 SDK를 불러올 수 없습니다.");
      }
    }, 200);

    return () => clearInterval(interval);
  }, []);

  return { ready, error };
}

function getLocationErrorMessage(err) {
  switch (err?.code) {
    case 1: return "위치 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해주세요.";
    case 2: return "위치 정보를 사용할 수 없습니다.";
    case 3: return "위치 요청 시간이 초과되었습니다. 다시 시도해주세요.";
    default: return "위치를 가져올 수 없습니다.";
  }
}

export default function HospitalMap({ hospitals, userLocation, onSelectHospital }) {
  const { ready, error } = useKakaoMapReady();

  const [map, setMap] = useState(null);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [level, setLevel] = useState(8);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(null);

  useEffect(() => {
    if (userLocation?.latitude && userLocation?.longitude) {
      setCenter({ lat: userLocation.latitude, lng: userLocation.longitude });
      setLevel(5);
      setLocationError(null);
    }
  }, [userLocation?.latitude, userLocation?.longitude]);

  // Clear location error after 5 seconds
  useEffect(() => {
    if (!locationError) return;
    const timer = setTimeout(() => setLocationError(null), 5000);
    return () => clearTimeout(timer);
  }, [locationError]);

  const handleMoveToCurrentLocation = useCallback(() => {
    const moveTo = (lat, lng) => {
      const newCenter = { lat, lng };
      setCenter(newCenter);
      setLevel(5);
      setLocating(false);
      setLocationError(null);
      if (map) {
        map.setCenter(new window.kakao.maps.LatLng(lat, lng));
        map.setLevel(5);
      }
    };

    if (userLocation?.latitude && userLocation?.longitude) {
      moveTo(userLocation.latitude, userLocation.longitude);
      userLocation.refresh?.();
      return;
    }

    if (!navigator.geolocation) {
      setLocationError("이 브라우저에서는 위치 서비스를 지원하지 않습니다.");
      return;
    }

    // Check if we're on HTTPS or localhost
    const isSecure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (!isSecure) {
      setLocationError("위치 서비스는 HTTPS 환경에서만 사용 가능합니다.");
      return;
    }

    setLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => moveTo(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        setLocating(false);
        setLocationError(getLocationErrorMessage(err));
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  }, [userLocation, map]);

  const hospitalsWithCoords = hospitals.filter(
    (h) => h.latitude != null && h.longitude != null
  );

  if (!ready && !error) {
    return (
      <div className="flex h-[60vh] md:h-[500px] items-center justify-center rounded-2xl bg-slate-100">
        <p className="text-slate-500">지도를 불러오는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[60vh] md:h-[500px] items-center justify-center rounded-2xl bg-slate-100">
        <div className="text-center">
          <p className="text-slate-500">지도를 불러올 수 없습니다.</p>
          <p className="mt-1 text-xs text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <Map
        center={center}
        level={level}
        style={{ width: "100%", height: "60vh", minHeight: "400px" }}
        onCreate={setMap}
        onClick={() => { setSelectedHospital(null); onSelectHospital?.(null); }}
      >
        {/* User location marker */}
        {userLocation?.latitude && userLocation?.longitude && (
          <MapMarker
            position={{ lat: userLocation.latitude, lng: userLocation.longitude }}
            image={{
              src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Ccircle cx='10' cy='10' r='8' fill='%233b82f6' stroke='white' stroke-width='3'/%3E%3C/svg%3E",
              size: { width: 20, height: 20 },
            }}
          />
        )}

        {/* Hospital markers */}
        {hospitalsWithCoords.map((hospital) => {
          const color = STATUS_COLORS[hospital.status]?.bg || "#94a3b8";
          const encodedSvg = encodeURIComponent(
            `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='36' viewBox='0 0 28 36'>
              <path d='M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z' fill='${color}'/>
              <circle cx='14' cy='13' r='5' fill='white'/>
            </svg>`
          );

          return (
            <MapMarker
              key={hospital.id}
              position={{ lat: hospital.latitude, lng: hospital.longitude }}
              image={{
                src: `data:image/svg+xml,${encodedSvg}`,
                size: { width: 28, height: 36 },
                options: { offset: { x: 14, y: 36 } },
              }}
              onClick={() => { setSelectedHospital(hospital); onSelectHospital?.(hospital.id); }}
            />
          );
        })}

        {/* Info overlay */}
        {selectedHospital && selectedHospital.latitude && selectedHospital.longitude && (
          <CustomOverlayMap
            position={{ lat: selectedHospital.latitude, lng: selectedHospital.longitude }}
            yAnchor={1.35}
          >
            <div className="w-64 rounded-xl bg-white p-3 shadow-lg border border-slate-200">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-bold leading-tight">{selectedHospital.name}</h3>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedHospital(null);
                  }}
                  className="shrink-0 text-slate-400 hover:text-slate-600 text-lg leading-none"
                >
                  ×
                </button>
              </div>

              <div className="mt-1.5 flex flex-wrap gap-1">
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 ${
                    selectedHospital.status === "available"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : selectedHospital.status === "unavailable"
                      ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-slate-50 text-slate-700 border-slate-200"
                  }`}
                >
                  {STATUS_COLORS[selectedHospital.status]?.label}
                </Badge>
                {selectedHospital.hospital_type && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {selectedHospital.hospital_type}
                  </Badge>
                )}
              </div>

              {selectedHospital.address && (
                <p className="mt-2 flex items-start gap-1 text-xs text-slate-500">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                  <span className="line-clamp-2">{selectedHospital.address}</span>
                </p>
              )}

              {selectedHospital.phone && (
                <a
                  href={`tel:${selectedHospital.phone}`}
                  className="mt-1 flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  <Phone className="h-3 w-3" />
                  {selectedHospital.phone}
                </a>
              )}

              <div className="mt-2 flex gap-3 text-xs">
                <span className="text-emerald-600">가능 {selectedHospital.upvotes}</span>
                <span className="text-red-600">불가 {selectedHospital.downvotes}</span>
              </div>

              <a
                href={`https://map.kakao.com/link/to/${selectedHospital.name},${selectedHospital.latitude},${selectedHospital.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center justify-center gap-1 rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-medium text-yellow-900 hover:bg-yellow-500 transition-colors"
              >
                <Navigation className="h-3 w-3" />
                길찾기
              </a>
            </div>
          </CustomOverlayMap>
        )}
      </Map>

      {/* Current location button */}
      <button
        onClick={handleMoveToCurrentLocation}
        disabled={locating}
        className="absolute bottom-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
        title="내 위치"
      >
        {locating ? (
          <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
        ) : (
          <LocateFixed className="h-5 w-5 text-blue-600" />
        )}
      </button>

      {/* Location error toast */}
      {locationError && (
        <div className="absolute bottom-16 right-4 z-10 max-w-[250px] rounded-xl bg-red-50 border border-red-200 px-3 py-2 shadow-lg">
          <p className="text-xs text-red-700">{locationError}</p>
        </div>
      )}

      {/* Hospital count badge */}
      <div className="absolute top-4 left-4 z-10 rounded-full bg-white/90 backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm border border-slate-200">
        지도에 {hospitalsWithCoords.length}개 병원 표시
      </div>
    </div>
  );
}
