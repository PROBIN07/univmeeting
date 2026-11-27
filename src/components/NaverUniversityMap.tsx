import { useEffect, useMemo, useRef, useState } from 'react';
import type { UniversityGeoItem } from '../types/meeting';
import {
  getCookieConsent,
  setCookieConsent,
  subscribeCookieConsent,
  type CookieConsentLevel,
} from '../utils/cookieConsent';
import { escapeHtml } from '../utils/security';

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
  setSize?: (size: unknown) => void;
  refresh?: (noEffect?: boolean) => void;
  autoResize?: () => void;
  destroy?: () => void;
}

interface NaverMarkerInstance {
  setMap(map: NaverMapInstance | null): void;
  setIcon?: (icon: { content: string; anchor?: unknown }) => void;
  setZIndex?: (zIndex: number) => void;
}

interface NaverMapsNamespace {
  LatLng: new (lat: number, lng: number) => NaverLatLng;
  Size: new (width: number, height: number) => unknown;
  Map: new (
    element: HTMLElement,
    options: {
      center: NaverLatLng;
      zoom: number;
      minZoom?: number;
      maxZoom?: number;
      zoomControl?: boolean;
      tileTransition?: boolean;
      autoResize?: boolean;
    }
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
    // 외부 SDK 호출 시 URL 상세 쿼리(?room= 등)가 제3자 서버로 전송되지 않도록 도메인(origin)만 전달
    script.referrerPolicy = 'origin';
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
  const safeLabel = escapeHtml(label);
  const html = `<div style="display:flex;align-items:center;height:${rowHeight}px;gap:5px;cursor:pointer;font-family:'Paperlogy','Noto Sans KR',sans-serif;">
    <div style="width:${dotSize}px;height:${dotSize}px;border-radius:9999px;border:3px solid #FFFFFF;background:${dotBg};box-sizing:border-box;flex-shrink:0;box-shadow:0 2px 6px rgba(13,5,10,0.22);"></div>
    <div style="background:#FFFFFF;border:${border};border-radius:6px;padding:3px 8px;box-shadow:0 2px 8px rgba(13,5,10,0.12);white-space:nowrap;">
      <span style="font-size:12px;font-weight:${weight};line-height:1.45;color:#0D050A;">${safeLabel}</span>
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
  const markerMapRef = useRef<
    Map<string, { marker: NaverMarkerInstance; signature: string }>
  >(new Map());
  const onSelectUniversityRef = useRef(onSelectUniversity);
  onSelectUniversityRef.current = onSelectUniversity;

  const [cookieConsent, setCookieConsentState] = useState<CookieConsentLevel | null>(() =>
    getCookieConsent()
  );
  const [sdkReady, setSdkReady] = useState<boolean>(Boolean(window.naver?.maps));
  const [sdkFailed, setSdkFailed] = useState<boolean>(!NAVER_MAP_CLIENT_ID);

  useEffect(() => {
    return subscribeCookieConsent(setCookieConsentState);
  }, []);

  const isExternalMapBlockedByConsent = cookieConsent === 'essential';

  const selectedUniv = useMemo(
    () => universities.find((u) => u.id === selectedUniversityId) ?? universities[0],
    [universities, selectedUniversityId]
  );

  const [viewCenter, setViewCenter] = useState<{ lat: number; lng: number }>({
    lat: selectedUniv?.lat ?? 37.4963,
    lng: selectedUniv?.lng ?? 126.9574,
  });

  useEffect(() => {
    if (isExternalMapBlockedByConsent) {
      return;
    }
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
  }, [isExternalMapBlockedByConsent]);

  // Initialize Naver Map once SDK is ready
  useEffect(() => {
    if (
      isExternalMapBlockedByConsent ||
      !sdkReady ||
      !mapContainerRef.current ||
      !window.naver?.maps
    ) {
      return;
    }
    if (mapInstanceRef.current) {
      return;
    }

    const maps = window.naver.maps;
    const container = mapContainerRef.current;
    const center = new maps.LatLng(
      selectedUniv?.lat ?? 37.4963,
      selectedUniv?.lng ?? 126.9574
    );

    const map = new maps.Map(container, {
      center,
      zoom: zoomLevel,
      minZoom: 7,
      maxZoom: 18,
      zoomControl: false,
      tileTransition: false,
      autoResize: true,
    });

    const syncViewportSize = () => {
      const el = mapContainerRef.current;
      const m = mapInstanceRef.current;
      if (!el || !m || !window.naver?.maps) return;
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (width > 0 && height > 0) {
        if (m.setSize && window.naver.maps.Size) {
          m.setSize(new window.naver.maps.Size(width, height));
        }
        m.refresh?.(true);
      }
    };

    maps.Event.addListener(map, 'zoom_changed', () => {
      onZoomChange(map.getZoom());
      map.refresh?.(true);
    });

    maps.Event.addListener(map, 'idle', () => {
      const c = map.getCenter();
      setViewCenter({ lat: c.lat(), lng: c.lng() });
    });

    mapInstanceRef.current = map;

    // Flex 컨테이너 레이아웃 확정 직후 및 폰트 로드 후 지도 뷰포트 크기를 정확히 동기화하여 회색 빈 타일 방지
    const rafId = window.requestAnimationFrame(syncViewportSize);
    const settleTimer = window.setTimeout(syncViewportSize, 180);

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            syncViewportSize();
          })
        : null;
    if (resizeObserver) {
      resizeObserver.observe(container);
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(settleTimer);
      resizeObserver?.disconnect();
      markerMapRef.current.forEach(({ marker }) => marker.setMap(null));
      markerMapRef.current.clear();
      mapInstanceRef.current?.destroy?.();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkReady, isExternalMapBlockedByConsent]);

  // Sync zoom level from buttons
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (map.getZoom() !== zoomLevel) {
      map.setZoom(zoomLevel);
      map.refresh?.(true);
    }
  }, [zoomLevel]);

  // Pan to selected university
  useEffect(() => {
    if (!selectedUniv) return;
    setViewCenter({ lat: selectedUniv.lat, lng: selectedUniv.lng });
    const map = mapInstanceRef.current;
    const el = mapContainerRef.current;
    if (!map || !window.naver?.maps) return;
    if (el && el.clientWidth > 0 && el.clientHeight > 0 && map.setSize && window.naver.maps.Size) {
      map.setSize(new window.naver.maps.Size(el.clientWidth, el.clientHeight));
    }
    map.panTo(new window.naver.maps.LatLng(selectedUniv.lat, selectedUniv.lng));
    map.refresh?.(true);
  }, [selectedUniv]);

  // Prioritize visible markers out of 453 universities for 60fps performance
  const prioritizedUniversities = useMemo(() => {
    const maxMarkers = compact ? 45 : 120;
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

  // Diff-sync markers instead of destroying/recreating all DOM markers on every zoom/pan
  useEffect(() => {
    if (!sdkReady || !mapInstanceRef.current || !window.naver?.maps) {
      return;
    }
    const maps = window.naver.maps;
    const map = mapInstanceRef.current;
    const store = markerMapRef.current;
    const nextIds = new Set(prioritizedUniversities.map((u) => u.id));

    store.forEach((entry, id) => {
      if (!nextIds.has(id)) {
        entry.marker.setMap(null);
        store.delete(id);
      }
    });

    prioritizedUniversities.forEach((univ) => {
      const count = recruitingCountByUniv[univ.name] ?? 0;
      const isActive = univ.id === selectedUniversityId;
      const zIndex = isActive ? 100 : count > 0 ? 50 : 10;
      const signature = `${isActive ? 1 : 0}:${count}:${univ.shortName}`;
      const existing = store.get(univ.id);

      if (existing && existing.signature === signature) {
        return;
      }

      const label = count > 0 ? `${univ.shortName} ${count}` : univ.shortName;
      const { html, anchorX, anchorY } = buildMarkerHtml(
        label,
        isActive,
        count > 0
      );
      const iconSpec = {
        content: html,
        anchor: new maps.Point(anchorX, anchorY),
      };

      if (existing && existing.marker.setIcon) {
        existing.marker.setIcon(iconSpec);
        existing.marker.setZIndex?.(zIndex);
        existing.signature = signature;
        return;
      }

      if (existing) {
        existing.marker.setMap(null);
      }

      const marker = new maps.Marker({
        position: new maps.LatLng(univ.lat, univ.lng),
        map,
        zIndex,
        icon: iconSpec,
      });
      maps.Event.addListener(marker, 'click', () => {
        onSelectUniversityRef.current(univ.id);
      });
      store.set(univ.id, { marker, signature });
    });
  }, [
    sdkReady,
    prioritizedUniversities,
    recruitingCountByUniv,
    selectedUniversityId,
  ]);

  if (sdkReady && !sdkFailed && !isExternalMapBlockedByConsent) {
    return (
      <div
        ref={mapContainerRef}
        role="region"
        aria-label="전국 대학교 네이버 지도"
        className="naver-map-container h-full w-full"
      />
    );
  }

  // Fallback interactive university map canvas
  const baseScale = compact ? 0.6 : 1;
  const scaleFactor = baseScale * (1 + (zoomLevel - 11) * 0.25);
  const centerX = compact ? 320 : 380;
  const centerY = compact ? 130 : 380;
  const anchorX = selectedUniv?.canvasX ?? 300;
  const anchorY = selectedUniv?.canvasY ?? 420;

  return (
    <div
      role="region"
      aria-label="전국 대학교 내장 캠퍼스 지도"
      className="relative h-full w-full overflow-hidden bg-[#FBEBF1]"
    >
      <div className="absolute inset-x-0 bottom-[24px] left-[24px] z-10 flex w-fit max-w-[calc(100%-96px)] flex-col items-start gap-[6px] rounded-[10px] border border-[#EBCDD9] bg-[#FFFFFF]/95 px-[14px] py-[10px] shadow-sm">
        {isExternalMapBlockedByConsent ? (
          <>
            <span className="text-[13px] font-bold leading-[1.45] text-[#0D050A]">
              필수 쿠키만 허용됨 (내장 지도 모드)
            </span>
            <span className="text-[12px] font-normal leading-[1.45] text-[#4A3842]">
              외부 네이버 지도 SDK 호출이 차단되어 있어요.
            </span>
            <button
              type="button"
              onClick={() => setCookieConsent('all')}
              className="mt-1 cursor-pointer rounded-[6px] border-0 bg-[#0D050A] px-[12px] py-[6px] text-[12px] font-medium text-[#FFFFFF]"
            >
              외부 네이버 지도 불러오기 (동의)
            </button>
          </>
        ) : (
          <>
            <span className="text-[13px] font-medium leading-[1.45] text-[#6E5464]">
              내장 캠퍼스 지도 모드
            </span>
            <span className="text-[12px] font-normal leading-[1.45] text-[#8E7182]">
              네이버 클라우드 콘솔 Web 서비스 URL에 현재 도메인을 등록하면 실제 지도가 표시돼요
            </span>
          </>
        )}
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
            aria-label={`${univ.name}, 모집 중인 방 ${count}개`}
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
