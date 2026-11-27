import { useEffect, useState } from 'react';
import type { ActiveOverlayState } from '../types/meeting';
import {
  getCookieConsent,
  setCookieConsent,
  subscribeCookieConsent,
  type CookieConsentLevel,
} from '../utils/cookieConsent';

export interface LegalSection {
  heading: string;
  body: string;
}

export const LEGAL_EFFECTIVE_DATE = '2026년 11월 27일';

/* =========================================================
   1. 이용약관 (Terms of Service)
========================================================= */
export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: '제1조 (목적)',
    body: '본 약관은 Univmeeting(이하 "서비스")이 제공하는 대학생 재학 인증 기반 미팅 방 개설·참여 및 모집 게시판 서비스의 이용 조건, 절차, 회원과 운영팀 간의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.',
  },
  {
    heading: '제2조 (이용자격 및 회원가입)',
    body: '1. 서비스는 만 18세 이상이며 국내 고등교육기관(대학교·캠퍼스)에 재학(휴학 포함) 중인 학생을 대상으로 합니다.\n2. 회원가입은 이용자가 본 약관과 개인정보처리방침에 필수 동의하고 계정 정보를 입력하여 완료됩니다.\n3. 미팅 방 개설·참여 및 모집글 작성·신청 등 핵심 매칭 기능은 학번과 재학증명서 심사를 거쳐 운영팀의 승인을 받은 회원에게만 제공됩니다.',
  },
  {
    heading: '제3조 (학교 인증 및 명의도용 금지)',
    body: '1. 회원은 본인의 실제 소속 대학교, 학과, 학번 및 본인 명의의 재학증명서(또는 학적 확인 서류)만을 제출해야 합니다.\n2. 타인의 학번·증명서를 도용하거나 위·변조한 서류를 업로드하는 행위는 관계 법령 위반에 해당하며, 적발 시 사전 통보 없이 영구 이용정지 및 계정 삭제 조치됩니다.',
  },
  {
    heading: '제4조 (회원의 의무 및 금지행위)',
    body: '회원은 다음 행위를 해서는 안 되며, 위반 시 게시물 삭제 및 서비스 이용이 제한될 수 있습니다.\n- 허위 학적 기재, 성별·인원 사칭 또는 다중 계정 생성\n- 타인의 연락처·실명·사진 등 개인정보를 동의 없이 게시글이나 방 소개에 노출하는 행위\n- 영리 목적의 광고, 불법 유흥·스팸 홍보, 금전 요구, 불쾌감·성적 수치심을 유발하는 언행\n- 서비스의 보안 기능 우회 시도, 비정상 자동화 스크립트 호출 및 타 회원 계정 침해 행위',
  },
  {
    heading: '제5조 (서비스의 역할 및 오프라인 만남 면책)',
    body: '1. 서비스는 재학생 간 자율적인 미팅 팀 구성을 돕는 온라인 매칭 공간을 제공하며, 개별 모임이나 오프라인 만남을 직접 주최·주선하지 않습니다.\n2. 미팅 성사 이후의 일정 조율, 장소 선택 및 오프라인 만남 과정에서 발생하는 회원 간 분쟁이나 사고에 대한 일차적 주의 의무와 책임은 참여 당사자에게 있습니다. 안전한 공공장소에서 만남을 진행해 주시기 바랍니다.',
  },
  {
    heading: '제6조 (이용계약 해지 및 회원탈퇴)',
    body: '회원은 언제든지 마이페이지 내 [회원탈퇴] 기능을 통해 이용계약을 즉시 해지할 수 있으며, 탈퇴 즉시 회원의 계정·재학증명서·개설 방 및 작성 게시물은 복구 불가능한 방법으로 영구 파기됩니다.',
  },
];

/* =========================================================
   2. 개인정보처리방침 (Privacy Policy — 개인정보 보호법 제30조 준수)
========================================================= */
export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: '1. 수집하는 개인정보 항목 및 수집 방법',
    body: '서비스는 최소한의 개인정보만을 이용자의 명시적 동의를 받아 수집합니다.\n- [회원가입 시(필수)]: 이메일 주소, 비밀번호(단방향 암호화 저장), 이름(닉네임), 성별, 소속 대학교·학과\n- [학교 인증 신청 시(필수)]: 학번, 입학연도 표시값(예: 26학번), 재학증명서 사본(이미지 업로드 시 EXIF GPS 위치정보 자동 제거 후 압축 저장)\n- [1:1 문의·신고·삭제 요청 시]: 회신용 이메일 주소, 문의·신고 내용',
  },
  {
    heading: '2. 개인정보의 수집·이용 목적 및 공개 범위',
    body: '- 회원 식별, 로그인 인증 및 부정 이용 방지\n- 대학교 재학 여부 심사 및 타 대학/외부인 사칭 차단\n- 대학 간 미팅 방·모집 게시판 매칭 제공\n※ 타 회원에게는 [대학교명 · 학과 · 입학연도(예: 26학번) · 성별]만 표시되며, 전체 학번·이메일·재학증명서 원본은 운영팀 심사자 외 어떤 회원에게도 절대 공개되지 않습니다.',
  },
  {
    heading: '3. 개인정보의 보유·이용 기간 및 파기 절차',
    body: '- 회원 개인정보는 회원 자격을 유지하는 동안 보유·이용되며, [회원탈퇴] 시 지체 없이 모든 전자적 파일(계정, 학번, 재학증명서 사본, 작성 게시물)을 복구 불가능하게 즉시 영구 삭제합니다.\n- 회원이 계정은 유지한 채 [재학증명서·학번 원본 파기]만 단독 요청하는 경우에도 해당 인증 서류와 학번을 즉시 삭제합니다.\n- 법령에 따라 보존이 필요한 경우 해당 법령에서 정한 기간 동안만 분리 보관 후 파기합니다.',
  },
  {
    heading: '4. 외부 서비스(SDK) 및 개인정보 처리위탁 안내',
    body: '서비스는 안정적인 운영을 위해 아래 외부 인프라만을 사용하며, 광고 추적·행태분석용 제3자 SDK(Google Analytics, Meta Pixel 등)를 일절 사용하지 않습니다.\n- Google LLC (Firebase Authentication / Cloud Firestore): 회원 로그인 인증 및 암호화 데이터베이스 보관\n- 네이버클라우드(주) (Naver Maps JS API v3): 전국 대학 캠퍼스 지도 표시 (Referrer 도메인만 전송, 쿠키 설정에서 선택적 차단 가능)\n- Vercel Inc.: 웹 애플리케이션 호스팅 및 보안 전송(HTTPS)\n- Google Fonts / jsDelivr CDN: 웹폰트(Noto Sans KR, Paperlogy) 렌더링',
  },
  {
    heading: '5. 정보주체의 권리 행사 방법 (열람·정정·삭제·탈퇴)',
    body: '이용자는 언제든지 [마이페이지 > 개인정보 및 계정 관리]에서 본인의 개인정보 권리를 직접 행사할 수 있습니다.\n- 재학증명서·학번 원본 즉시 파기: 계정은 유지한 채 제출한 인증 서류와 학번만 단독 삭제\n- 개인정보 삭제 요청: 특정 개인정보 항목 또는 문의·신고 기록의 삭제·파기 요청 접수\n- 회원탈퇴: 계정 및 모든 활동 데이터를 즉시 영구 삭제',
  },
  {
    heading: '6. 개인정보의 안전성 확보 조치 및 구제기관',
    body: '서비스는 비밀번호 단방향 암호화, Firestore 최소권한 접근통제, 파일 매직바이트 검증, 이미지 EXIF 위치정보 제거, 공용 PC 로그아웃 시 로컬 캐시 즉시 삭제, CSP 보안 헤더를 적용하고 있습니다.\n- 개인정보 관련 문의: 하단 [문의하기] 또는 마이페이지 [개인정보 삭제 요청]\n- 개인정보침해신고센터 (privacy.kisa.or.kr / 국번없이 118)\n- 개인정보분쟁조정위원회 (www.kopico.go.kr / 1833-6972)',
  },
];

/* =========================================================
   3. 쿠키 및 웹 스토리지 정책 (Cookie & Web Storage Policy)
========================================================= */
export const COOKIE_SECTIONS: LegalSection[] = [
  {
    heading: '1. 쿠키 및 브라우저 저장소 사용 목적',
    body: 'Univmeeting은 광고 맞춤형 추적 쿠키나 제3자 마케팅 쿠키를 일절 사용하지 않으며, 로그인 상태 유지·보안 보호·지도 표시 설정을 위해서만 최소한의 브라우저 저장소(IndexedDB / localStorage / sessionStorage)를 사용합니다.',
  },
  {
    heading: '2. 필수 저장 항목 (서비스 핵심 기능 · 비활성화 불가)',
    body: '- Firebase 인증 세션 토큰: 로그인 상태 유지 및 권한 검증 (로그아웃 시 즉시 파기)\n- 로그인 보안 잠금(login-guard) 및 도배 방지 쿨다운(cooldowns): 비밀번호 무차별 대입 공격 및 스팸 방어\n- 쿠키 동의 설정값(cookie-consent): 이용자의 동의 선택 상태 기억',
  },
  {
    heading: '3. 선택적 외부 기능 항목 (동의 거부 가능)',
    body: '- 네이버 지도 SDK(oapi.map.naver.com): 전국 대학 지도 탭에서 실제 네이버 지도 타일을 불러올 때 사용됩니다. [필수 항목만 허용]을 선택하시면 외부 네이버 지도 스크립트를 자동 호출하지 않고 내장 캠퍼스 지도 모드로 동작합니다.',
  },
];

/* =========================================================
   4. 하단 쿠키 동의 배너 (Cookie Consent Banner)
========================================================= */
export function CookieConsentBanner({
  onOpenOverlay,
}: {
  onOpenOverlay: (overlay: ActiveOverlayState) => void;
}) {
  const [consent, setConsentState] = useState<CookieConsentLevel | null>(() =>
    getCookieConsent()
  );

  useEffect(() => {
    return subscribeCookieConsent(setConsentState);
  }, []);

  if (consent !== null) {
    return null;
  }

  return (
    <aside
      role="region"
      aria-label="쿠키 및 개인정보 보호 안내"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#EBCDD9] bg-[#0D050A]/95 px-5 py-[18px] text-[#FFFFFF] shadow-[0_-8px_28px_rgba(13,5,10,0.35)] backdrop-blur-md"
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-start justify-between gap-[14px] lg:flex-row lg:items-center">
        <div className="flex flex-col gap-[4px]">
          <span className="text-[14px] font-bold text-[#F7C1D4]">
            쿠키 및 외부 지도 SDK 이용 안내
          </span>
          <p className="m-0 text-[13px] leading-[1.5] text-[#FFFFFF]/85">
            Univmeeting은 광고·추적 쿠키를 사용하지 않으며, 안전한 로그인 유지(필수)와 네이버 캠퍼스 지도 표시(선택)를 위해 최소한의 브라우저 저장소를 사용합니다.{' '}
            <button
              type="button"
              onClick={() => onOpenOverlay({ id: 'cookies' })}
              className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-bold text-[#F7C1D4] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F7C1D4]"
            >
              쿠키정책 보기
            </button>
            {' · '}
            <button
              type="button"
              onClick={() => onOpenOverlay({ id: 'privacy' })}
              className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-bold text-[#F7C1D4] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F7C1D4]"
            >
              개인정보처리방침
            </button>
          </p>
        </div>

        <div className="flex w-full shrink-0 flex-row items-center justify-end gap-[8px] lg:w-auto">
          <button
            type="button"
            onClick={() => setCookieConsent('essential')}
            className="cursor-pointer rounded-[8px] border border-[#FFFFFF]/35 bg-transparent px-[16px] py-[9px] text-[13px] font-medium text-[#FFFFFF] transition-colors hover:bg-[#FFFFFF]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F7C1D4]"
          >
            필수만 허용
          </button>
          <button
            type="button"
            onClick={() => setCookieConsent('all')}
            className="cursor-pointer rounded-[8px] border-0 bg-[#F7C1D4] px-[18px] py-[9px] text-[13px] font-bold text-[#0D050A] transition-all hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFFFFF]"
          >
            모두 동의
          </button>
        </div>
      </div>
    </aside>
  );
}

/* =========================================================
   5. 하단 우측 순환 광고 배너 (5초 간격 3종 자동 롤링)
========================================================= */
interface AdBannerItem {
  id: 'dairy' | 'studyvoyage' | 'univmeeting';
  imageSrc: string;
  alt: string;
  href?: string;
}

const FOOTER_AD_BANNERS: AdBannerItem[] = [
  {
    id: 'dairy',
    imageSrc: '/banners/dairy_adbanner.png',
    alt: 'dAIry AI와 함께 세상에서 가장 쉬운 일기 쓰기 — Google Play에서 보기',
    href: 'https://play.google.com/store/apps/details?id=com.qkrdltlsska.dairy',
  },
  {
    id: 'studyvoyage',
    imageSrc: '/banners/studyvoyage_adbanner.png',
    alt: '훨씬 더 재밌는 공부를 위해 떠나는 항해 STUDY VOYAGE — Google Play에서 보기',
    href: 'https://play.google.com/store/apps/details?id=com.classof26.study_voyage',
  },
  {
    id: 'univmeeting',
    imageSrc: '/banners/univmeeting_adbanner.png',
    alt: 'Univmeeting과 함께할 새로운 광고주를 모집합니다 — 문의하기 열기',
  },
];

const AD_ROTATION_INTERVAL_MS = 5000;

export function FooterAdBannerCarousel({
  onOpenOverlay,
}: {
  onOpenOverlay: (overlay: ActiveOverlayState) => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [paused, setPaused] = useState<boolean>(false);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % FOOTER_AD_BANNERS.length);
    }, AD_ROTATION_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      role="region"
      aria-label="제휴 및 광고 배너"
      className="relative aspect-[3300/564] w-full max-w-[520px] shrink-0 overflow-hidden rounded-[6px] bg-[#FFFFFF] shadow-[0_2px_10px_rgba(13,5,10,0.08)] md:w-[420px] lg:w-[480px] xl:w-[520px]"
    >
      {FOOTER_AD_BANNERS.map((banner, idx) => {
        const isActive = idx === activeIndex;
        const commonClassName = `absolute inset-0 block h-full w-full cursor-pointer border-0 bg-transparent p-0 transition-opacity duration-500 ease-in-out ${
          isActive
            ? 'z-10 opacity-100 pointer-events-auto'
            : 'z-0 opacity-0 pointer-events-none'
        }`;

        if (banner.href) {
          return (
            <a
              key={banner.id}
              href={banner.href}
              target="_blank"
              rel="noopener noreferrer"
              tabIndex={isActive ? 0 : -1}
              aria-hidden={!isActive}
              className={commonClassName}
            >
              <img
                src={banner.imageSrc}
                alt={banner.alt}
                className="block h-full w-full object-cover"
              />
            </a>
          );
        }

        return (
          <button
            key={banner.id}
            type="button"
            tabIndex={isActive ? 0 : -1}
            aria-hidden={!isActive}
            onClick={() => onOpenOverlay({ id: 'inquiry' })}
            className={commonClassName}
          >
            <img
              src={banner.imageSrc}
              alt={banner.alt}
              className="block h-full w-full object-cover"
            />
          </button>
        );
      })}
    </div>
  );
}

/* =========================================================
   6. 공통 하단 법적 고지 푸터 (서브 페이지용)
========================================================= */
export function SubpageLegalFooter({
  onOpenOverlay,
}: {
  onOpenOverlay: (overlay: ActiveOverlayState) => void;
}) {
  const links: { label: string; bold?: boolean; action: () => void }[] = [
    { label: '이용약관', action: () => onOpenOverlay({ id: 'terms' }) },
    {
      label: '개인정보처리방침',
      bold: true,
      action: () => onOpenOverlay({ id: 'privacy' }),
    },
    { label: '쿠키정책', action: () => onOpenOverlay({ id: 'cookies' }) },
    {
      label: '신고 센터',
      action: () =>
        onOpenOverlay({ id: 'report', reportTarget: { targetType: 'general' } }),
    },
    { label: '문의하기', action: () => onOpenOverlay({ id: 'inquiry' }) },
  ];

  return (
    <footer className="mt-auto w-full border-t border-[#EBCDD9] bg-[#FBEBF1] px-5 py-[36px] md:px-12 xl:px-[120px]">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-start justify-between gap-[20px] md:flex-row md:items-center">
        <div className="flex flex-col gap-[6px]">
          <span className="text-[14px] font-bold text-[#4A3842]">Univmeeting</span>
          <nav
            aria-label="법적 고지 및 고객지원 메뉴"
            className="flex flex-row flex-wrap items-center gap-x-[8px] gap-y-[4px]"
          >
            {links.map((item, idx) => (
              <span key={item.label} className="inline-flex items-center gap-[8px]">
                {idx > 0 && (
                  <span aria-hidden="true" className="text-[12px] text-[#8E7182]">
                    ·
                  </span>
                )}
                <button
                  type="button"
                  onClick={item.action}
                  className={`cursor-pointer border-0 bg-transparent p-0 text-[13px] hover:text-[#0D050A] hover:underline ${
                    item.bold ? 'font-bold text-[#0D050A]' : 'font-normal text-[#6E5464]'
                  }`}
                >
                  {item.label}
                </button>
              </span>
            ))}
          </nav>
        </div>

        <FooterAdBannerCarousel onOpenOverlay={onOpenOverlay} />
      </div>
    </footer>
  );
}
