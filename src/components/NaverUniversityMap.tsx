import { useEffect, useMemo, useRef, useState } from 'react';
import type { UniversityGeoItem } from '../types/meeting';

interface NaverLatLng {
  lat(): number;
  lng(): number;
}

interface NaverMapInstance {
  getCenter(): NaverLatLng;
  setCenter(latlng: NaverLatLng): void;
  panTo(latlng: NaverLatLng): void;
  setZoom(zoom: number): void;
  getZoom(): number;
  autoResize?: () => void;
  destroy?: () => void;
}

interface NaverMarkerInstance {
  setMap(map: NaverMapInstance | null): void;
}

interface NaverMapsNamespace {
  LatLng: new (lat: number, lng: number) => NaverLatLng;
  Map: new (
    element: HTMLElement,
    options: { center: NaverLatLng; zoom: number; zoomControl?: boolean }
  ) => NaverMapInstance;
  Marker: new (options: {
    position: NaverLatLng;
    map: NaverMapInstance;
    icon: { content: string; anchor?: unknown };
    zIndex?: number;
  }) => NaverMarkerInstance;
  Point: new (x: number, y: number) => unknown;
  Event: {
    addListener: (target: unknown, eventName: string, handler: () => void) => void;
    trigger?: (target: unknown, eventName: string) => void;
  };
}

declare global {
  interface Window {
    naver?: {
      maps?: NaverMapsNamespace;
    };
  }
}

const NAVER_MAP_CLIENT_ID = (
  import.meta.env.VITE_NAVER_MAP_CLIENT_ID as string | undefined
)?.trim();

let naverScriptPromise: Promise<boolean> | null = null;

function loadNaverMapScript(clientId: string): Promise<boolean> {
  if (window.naver?.maps) {
    return Promise.resolve(true);
  }
  if (naverScriptPromise) {
    return naverScriptPromise;
  }

  naverScriptPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-naver-maps="true"]'
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.naver?.maps)));
      existing.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(
      clientId
    )}`;
    script.async = true;
    script.defer = true;
    script.dataset.naverMaps = 'true';
    script.onload = () => resolve(Boolean(window.naver?.maps));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return naverScriptPromise;
}

function buildMarkerHtml(
  label: string,
  active: boolean,
  hasRooms: boolean
): { html: string; anchorX: number; anchorY: number } {
  const dotBg = active ? '#0D050A' : hasRooms ? '#E87BA4' : '#8E7182';
  const dotSize = active ? 20 : hasRooms ? 16 : 14;
  const weight = active || hasRooms ? '700' : '500';
  const border = active ? '2px solid #0D050A' : '1px solid #EBCDD9';
  const rowHeight = 26;
  const html = `<div style="display:flex;align-items:center;height:${rowHeight}px;gap:5px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">
    <div style="width:${dotSize}px;height:${dotSize}px;border-radius:9999px;border:3px solid #FFFFFF;background:${dotBg};box-sizing:border-box;flex-shrink:0;box-shadow:0 2px 6px rgba(13,5,10,0.22);"></div>
    <div style="background:#FFFFFF;border:${border};border-radius:6px;padding:3px 8px;box-shadow:0 2px 8px rgba(13,5,10,0.12);white-space:nowrap;">
      <span style="font-size:12px;font-weight:${weight};line-height:1.45;color:#0D050A;">${label}</span>
    </div>
  </div>`;
  return {
    html,
    anchorX: Math.round(dotSize / 2),
    anchorY: Math.round(rowHeight / 2),
  };
}

export function NaverUniversityMap({
  universities,
  recruitingCountByUniv,
  selectedUniversityId,
  zoomLevel,
  onSelectUniversity,
  onZoomChange,
  compact = false,
}: {
  universities: UniversityGeoItem[];
  recruitingCountByUniv: Record<string, number>;
  selectedUniversityId: string;
  zoomLevel: number;
  onSelectUniversity: (univId: string) => void;
  onZoomChange: (zoom: number) => void;
  compact?: boolean;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<NaverMapInstance | null>(null);
  const markersRef = useRef<NaverMarkerInstance[]>([]);
  const [sdkReady, setSdkReady] = useState<boolean>(Boolean(window.naver?.maps));
  const [sdkFailed, setSdkFailed] = useState<boolean>(!NAVER_MAP_CLIENT_ID);

  const selectedUniv = useMemo(
    () => universities.find((u) => u.id === selectedUniversityId) ?? universities[0],
    [universities, selectedUniversityId]
  );

  const [viewCenter, setViewCenter] = useState<{ lat: number; lng: number }>({
    lat: selectedUniv?.lat ?? 37.4963,
    lng: selectedUniv?.lng ?? 126.9574,
  });

  useEffect(() => {
    if (!NAVER_MAP_CLIENT_ID) {
      setSdkFailed(true);
      return;
    }

    let cancelled = false;
    void loadNaverMapScript(NAVER_MAP_CLIENT_ID).then((loaded) => {
      if (cancelled) return;
      if (loaded) {
        setSdkReady(true);
        setSdkFailed(false);
      } else {
        setSdkFailed(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Initialize Naver Map once SDK is ready
  useEffect(() => {
    if (!sdkReady || !mapContainerRef.current || !window.naver?.maps) {
      return;
    }
    if (mapInstanceRef.current) {
      return;
    }

    const maps = window.naver.maps;
    const center = new maps.LatLng(
      selectedUniv?.lat ?? 37.4963,
      selectedUniv?.lng ?? 126.9574
    );

    const map = new maps.Map(mapContainerRef.current, {
      center,
      zoom: zoomLevel,
      zoomControl: false,
    });

    maps.Event.addListener(map, 'zoom_changed', () => {
      onZoomChange(map.getZoom());
    });

    maps.Event.addListener(map, 'idle', () => {
      const c = map.getCenter();
      setViewCenter({ lat: c.lat(), lng: c.lng() });
    });

    mapInstanceRef.current = map;

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            map.autoResize?.();
            maps.Event.trigger?.(map, 'resize');
          })
        : null;
    if (resizeObserver && mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver?.disconnect();
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
      mapInstanceRef.current?.destroy?.();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkReady]);

  // Sync zoom level from buttons
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (mapInstanceRef.current.getZoom() !== zoomLevel) {
      mapInstanceRef.current.setZoom(zoomLevel);
    }
  }, [zoomLevel]);

  // Pan to selected university
  useEffect(() => {
    if (!selectedUniv) return;
    setViewCenter({ lat: selectedUniv.lat, lng: selectedUniv.lng });
    if (!mapInstanceRef.current || !window.naver?.maps) return;
    mapInstanceRef.current.autoResize?.();
    mapInstanceRef.current.panTo(
      new window.naver.maps.LatLng(selectedUniv.lat, selectedUniv.lng)
    );
  }, [selectedUniv]);

  // Prioritize visible markers out of 453 universities for 60fps performance
  const prioritizedUniversities = useMemo(() => {
    const maxMarkers = compact ? 45 : 150;
    if (universities.length <= maxMarkers) {
      return universities;
    }
    const scored = universities.map((u) => {
      const isSel = u.id === selectedUniversityId ? -1000 : 0;
      const roomBonus = (recruitingCountByUniv[u.name] ?? 0) > 0 ? -0.06 : 0;
      const dist =
        Math.abs(u.lat - viewCenter.lat) + Math.abs(u.lng - viewCenter.lng);
      return { u, score: isSel + roomBonus + dist };
    });
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, maxMarkers).map((s) => s.u);
  }, [
    universities,
    selectedUniversityId,
    recruitingCountByUniv,
    viewCenter,
    compact,
  ]);

  // Sync markers with university list & real room counts
  useEffect(() => {
    if (!sdkReady || !mapInstanceRef.current || !window.naver?.maps) {
      return;
    }
    const maps = window.naver.maps;
    const map = mapInstanceRef.current;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = prioritizedUniversities.map((univ) => {
      const count = recruitingCountByUniv[univ.name] ?? 0;
      const isActive = univ.id === selectedUniversityId;
      const label = count > 0 ? `${univ.shortName} ${count}` : univ.shortName;
      const { html, anchorX, anchorY } = buildMarkerHtml(
        label,
        isActive,
        count > 0
      );
      const marker = new maps.Marker({
        position: new maps.LatLng(univ.lat, univ.lng),
        map,
        zIndex: isActive ? 100 : count > 0 ? 50 : 10,
        icon: {
          content: html,
          anchor: new maps.Point(anchorX, anchorY),
        },
      });
      maps.Event.addListener(marker, 'click', () => {
        onSelectUniversity(univ.id);
      });
      return marker;
    });

    return () => {
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
    };
  }, [
    sdkReady,
    prioritizedUniversities,
    recruitingCountByUniv,
    selectedUniversityId,
    onSelectUniversity,
  ]);

  if (sdkReady && !sdkFailed) {
    return <div ref={mapContainerRef} className="h-full w-full" />;
  }

  // Fallback interactive university map canvas
  const baseScale = compact ? 0.6 : 1;
  const scaleFactor = baseScale * (1 + (zoomLevel - 11) * 0.25);
  const centerX = compact ? 320 : 380;
  const centerY = compact ? 130 : 380;
  const anchorX = selectedUniv?.canvasX ?? 300;
  const anchorY = selectedUniv?.canvasY ?? 420;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#FBEBF1]">
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-[4px] px-[16px] text-center">
        <span className="text-[15px] font-medium leading-[1.45] text-[#6E5464]">
          Naver Map 영역
        </span>
        <span className="text-[12px] font-normal leading-[1.45] text-[#8E7182]">
          네이버 클라우드 콘솔 Web 서비스 URL에 현재 도메인을 등록하면 지도가 표시돼요
        </span>
      </div>

      {prioritizedUniversities.slice(0, compact ? 16 : 36).map((univ) => {
        const count = recruitingCountByUniv[univ.name] ?? 0;
        const isActive = univ.id === selectedUniversityId;
        const x = centerX + (univ.canvasX - anchorX) * scaleFactor;
        const y = centerY + (univ.canvasY - anchorY) * scaleFactor;
        const label = count > 0 ? `${univ.shortName} ${count}` : univ.shortName;

        return (
          <button
            key={univ.id}
            type="button"
            onClick={() => onSelectUniversity(univ.id)}
            style={{ left: x, top: y }}
            className="absolute flex cursor-pointer flex-row items-center gap-[6px] border-0 bg-transparent p-0"
          >
            {isActive ? (
              <div className="h-[20px] w-[20px] shrink-0 rounded-full border-[3px] border-[#FFFFFF] bg-[#0D050A]" />
            ) : (
              <div className="h-[14px] w-[14px] shrink-0 rounded-full border-[3px] border-[#FFFFFF] bg-[#8E7182]" />
            )}
            <div className="flex shrink-0 flex-row rounded-[6px] bg-[#FFFFFF] px-[8px] py-[4px]">
              <span
                className={`whitespace-nowrap text-[12px] leading-[1.45] text-[#0D050A] ${
                  isActive ? 'font-bold' : 'font-medium'
                }`}
              >
                {label}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
