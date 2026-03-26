import { NextRequest, NextResponse } from "next/server";

const KAKAO_REST_KEY = process.env.KAKAO_DEFAULT_REST_API_KEY;

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("query");

  if (!query) {
    return NextResponse.json({ places: [] });
  }

  if (!KAKAO_REST_KEY) {
    return NextResponse.json({ places: [], error: "Kakao API key not configured" }, { status: 500 });
  }

  // Search by keyword (병원, 장소 등)
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=5`;
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
  });

  if (!res.ok) {
    // Fallback to address search
    const addrUrl = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}&size=5`;
    const addrRes = await fetch(addrUrl, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
    });

    if (!addrRes.ok) {
      return NextResponse.json({ places: [] });
    }

    const addrData = await addrRes.json();
    const places = (addrData.documents || []).map((doc: any) => ({
      name: doc.address_name,
      address: doc.address_name,
      road_address: doc.road_address?.address_name || doc.address_name,
      latitude: parseFloat(doc.y),
      longitude: parseFloat(doc.x),
      phone: "",
    }));

    return NextResponse.json({ places });
  }

  const data = await res.json();
  const places = (data.documents || []).map((doc: any) => ({
    name: doc.place_name,
    address: doc.address_name,
    road_address: doc.road_address_name || doc.address_name,
    latitude: parseFloat(doc.y),
    longitude: parseFloat(doc.x),
    phone: doc.phone || "",
  }));

  return NextResponse.json({ places });
}
