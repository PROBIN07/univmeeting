import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdminPortal,
  LoginView,
  SchoolVerificationView,
  SignupView,
} from './components/AuthAndVerificationPages';
import { HomeV2 } from './components/HomeV2';
import {
  CookieConsentBanner,
  SubpageLegalFooter,
} from './components/LegalDocumentsAndBanner';
import { NaverUniversityMap } from './components/NaverUniversityMap';
import { OverlayModal } from './components/OverlayModal';
import {
  UNIVERSITIES_GEO,
  formatRelativeTime,
  getMaxMembersPerTeam,
  getShortUniversityName,
} from './data/seedData';
import {
  createBoardPost,
  createMeetingRoom,
  deleteBoardPost,
  deleteMeetingRoom,
  deleteMyVerificationData,
  deleteUserDataByAdmin,
  loadAllLocalUsers,
  loadCachedCurrentUser,
  loadLocalPosts,
  loadLocalRooms,
  loadLocalVerificationRequests,
  logoutUser,
  repairApprovedUsersInFirestore,
  reviewVerificationRequest,
  setUserVerificationByAdmin,
  submitInquiry,
  submitReport,
  submitSchoolVerification,
  subscribeAllUsers,
  subscribeAuthAndProfile,
  subscribeFirestoreDbMissing,
  subscribeInquiries,
  subscribeMyVerificationRequest,
  subscribePosts,
  subscribeReports,
  subscribeRooms,
  subscribeVerificationRequests,
  toggleBoardPostStatus,
  togglePostApply,
  toggleRoomJoin,
  translateFirebaseAuthError,
  withdrawUserAccount,
} from './services/meetingService';
import { sanitizeUrlEntityId } from './utils/security';
import type {
  ActiveOverlayState,
  BoardPost,
  BoardTabType,
  GenderType,
  InquiryRecord,
  MeetingRoom,
  PageId,
  PaginationItem,
  ReportRecord,
  RoomFormat,
  SidoGroup,
  ToastId,
  UserProfile,
  VerificationRequest,
} from './types/meeting';

export const TOAST_MESSAGES: Record<ToastId, string> = {
  'copy-link': '링크를 복사했어요',
  'auth-mail': '인증 메일을 보냈어요. 메일함을 확인해 주세요.',
  report: '신고를 접수했어요. 검토 후 알려드릴게요.',
  'other-univ-slot': '이 자리는 상대 대학 인증 사용자만 신청할 수 있어요',
  'max-zoom': '가장 크게 확대했어요',
  'min-zoom': '가장 작게 축소했어요',
  'inquiry-sent': '문의를 보냈어요. 답변은 메일로 알려드릴게요.',
  'last-page': '마지막 페이지예요',
};

const NAV_ITEMS: string[] = ['주선', '지도', '게시판'];

const FORMAT_OPTIONS: RoomFormat[] = ['2:2', '3:3', '4:4'];

const ROOMS_PER_PAGE = 8;
const POSTS_PER_PAGE = 7;

const MAP_MIN_ZOOM = 7;
const MAP_MAX_ZOOM = 18;
const MAP_DEFAULT_ZOOM = 11;

const DEFAULT_FOCUS_UNIV =
  UNIVERSITIES_GEO.find((u) => u.name === '숭실대학교') ?? UNIVERSITIES_GEO[0];

const VALID_PAGES: Set<PageId> = new Set<PageId>([
  'home',
  'login',
  'signup',
  'rooms',
  'room-detail',
  'room-create',
  'map',
  'board',
  'board-write',
  'board-detail',
  'school-auth',
  'mypage',
]);

function readInitialRouteFromUrl(): {
  page: PageId;
  roomId: string;
  postId: string;
} {
  try {
    // 1) /admin, /.env 등 비허용 하위 경로 직접 접근 시 즉시 루트('/')로 정규화 (#1 방어)
    if (window.location.pathname !== '/') {
      window.history.replaceState(null, '', '/');
      return { page: 'home', roomId: '', postId: '' };
    }

    const params = new URLSearchParams(window.location.search);
    // 2) URL ID 조작·특수문자·스크립트 파라미터 정규식 검증 (#2 방어)
    const roomParam = sanitizeUrlEntityId(params.get('room'));
    const postParam = sanitizeUrlEntityId(params.get('post'));
    const pageParam = params.get('page') as PageId | null;

    if (pageParam === 'admin') {
      window.history.replaceState(null, '', '/');
      return { page: 'home', roomId: '', postId: '' };
    }
    if (roomParam) {
      return { page: 'room-detail', roomId: roomParam, postId: postParam };
    }
    if (postParam) {
      return { page: 'board-detail', roomId: roomParam, postId: postParam };
    }
    if (pageParam && VALID_PAGES.has(pageParam)) {
      return { page: pageParam, roomId: roomParam, postId: postParam };
    }
  } catch {
    // ignore
  }
  return { page: 'home', roomId: '', postId: '' };
}

function buildShareUrl(params: Record<string, string>): string {
  const url = new URL(window.location.href);
  url.search = '';
  Object.entries(params).forEach(([k, v]) => {
    if (v) url.searchParams.set(k, v);
  });
  return url.toString();
}

function isStudentVerified(user: UserProfile | null): boolean {
  return Boolean(user && user.verified && user.verificationStatus === 'approved');
}

function matchesRegionFilter(location: string, regionFilter: string): boolean {
  if (regionFilter === '전체') return true;
  if (location.includes(regionFilter)) return true;
  const keywords = regionFilter
    .replace('서울 ', '')
    .split('·')
    .map((k) => k.trim())
    .filter(Boolean);
  return keywords.some((kw) => location.includes(kw));
}

function matchesDateFilter(dateText: string, dateFilter: string): boolean {
  if (dateFilter === '전체') return true;
  if (dateText.includes(dateFilter)) return true;
  if (dateFilter === '이번 주말') {
    return (
      dateText.includes('토') ||
      dateText.includes('일') ||
      dateText.includes('주말')
    );
  }
  return false;
}

function buildPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  const safeTotal = Math.max(1, totalPages);
  const items: PaginationItem[] = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(safeTotal, start + 4);
  for (let p = start; p <= end; p += 1) {
    items.push({
      id: `page-${p}`,
      label: String(p),
      variant: p === currentPage ? 'active' : 'default-medium',
    });
  }
  if (safeTotal > 1) {
    items.push({
      id: 'page-next',
      label: '>',
      variant: 'default-medium',
    });
  }
  return items;
}

function ToastOverlay({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  if (!message) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center justify-end px-4 pb-[48px] pt-[0px]"
    >
      <div
        onClick={onDismiss}
        className="pointer-events-auto flex cursor-pointer flex-row rounded-[999px] bg-[#0D050A] px-[24px] py-[14px] shadow-[0_8px_24px_rgba(13,5,10,0.22)]"
      >
        <span className="text-center text-[15px] font-medium leading-[1.45] text-[#FFFFFF]">
          {message}
        </span>
      </div>
    </div>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="h-[16px] w-[16px] shrink-0"
    >
      <path
        d="M4 6L8 10L12 6"
        stroke="#8E7182"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="h-[18px] w-[18px] shrink-0"
    >
      <path
        d="M13.5 8.25C13.5 11.1495 11.1495 13.5 8.25 13.5C5.35051 13.5 3 11.1495 3 8.25C3 5.35051 5.35051 3 8.25 3C11.1495 3 13.5 5.35051 13.5 8.25Z"
        stroke="#8E7182"
        strokeWidth="1.5"
      />
      <path
        d="M15 15L12.375 12.375"
        stroke="#8E7182"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GenderTag({ gender }: { gender: GenderType }) {
  const isMale = gender === '남';
  return (
    <span
      aria-label={isMale ? '남성' : '여성'}
      className={`inline-flex shrink-0 flex-row items-center rounded-[999px] px-[8px] py-[2px] ${
        isMale ? 'bg-[#ABD2FA]' : 'bg-[#F7C1D4]'
      }`}
    >
      <span aria-hidden="true" className="text-[12px] font-bold leading-[1.45] text-[#0D050A]">
        {gender}
      </span>
    </span>
  );
}

function PaginationButton({
  item,
  onClick,
}: {
  item: PaginationItem;
  onClick?: () => void;
}) {
  const ariaLabel = item.label === '>' ? '다음 페이지' : `${item.label}페이지`;
  if (item.variant === 'active') {
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        aria-current="page"
        onClick={onClick}
        className="flex h-[36px] w-[36px] cursor-pointer flex-row items-center justify-center rounded-[8px] border border-[#F7C1D4] bg-[#F7C1D4]"
      >
        <span className="text-[14px] font-bold leading-[1.45] text-[#0D050A]">{item.label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="flex h-[36px] w-[36px] cursor-pointer flex-row items-center justify-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF]"
    >
      <span className="text-[14px] font-medium leading-[1.45] text-[#4A3842]">{item.label}</span>
    </button>
  );
}

function RoomCard({
  room,
  ctaLabelOverride,
  onSelect,
}: {
  room: MeetingRoom;
  ctaLabelOverride?: string;
  onSelect: () => void;
}) {
  const maxPerTeam = getMaxMembersPerTeam(room.format);
  const slotsStatus = `${room.leftUniversity.shortName} ${room.leftMembers.length}/${maxPerTeam} · ${room.rightUniversity.shortName} ${room.rightMembers.length}/${maxPerTeam}`;
  const ctaLabel =
    ctaLabelOverride ?? (room.status === '성사 완료' ? '방 보기' : '참여 신청');

  return (
    <article className="flex w-full flex-col gap-[14px] rounded-[12px] border border-[#EBCDD9] bg-[#FFFFFF] p-[20px] sm:w-[282px] sm:shrink-0">
      <div className="flex flex-row items-center justify-between self-stretch">
        <div className="flex flex-row items-center rounded-[999px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[6px]">
          <span className="text-[14px] font-normal text-[#4A3842]">{room.format}</span>
        </div>
        <span className="text-[14px] font-bold text-[#0D050A]">{room.status}</span>
      </div>

      <div className="flex flex-row flex-wrap items-center gap-[8px]">
        <span className="text-[19px] font-bold text-[#0D050A]">
          {room.leftUniversity.shortName}
        </span>
        <GenderTag gender={room.leftUniversity.gender} />
        <span className="text-[18px] font-normal text-[#6E5464]">×</span>
        <span className="text-[19px] font-bold text-[#0D050A]">
          {room.rightUniversity.shortName}
        </span>
        <GenderTag gender={room.rightUniversity.gender} />
      </div>

      <div className="flex flex-col gap-[4px]">
        <span className="truncate text-[14px] font-normal text-[#4A3842]">
          {room.schedule}
        </span>
        <span className="truncate text-[14px] font-normal text-[#4A3842]">
          {room.location}
        </span>
      </div>

      <div className="flex flex-row items-center gap-[8px]">
        <span className="text-[13px] font-normal text-[#6E5464]">{slotsStatus}</span>
      </div>

      <button
        type="button"
        onClick={onSelect}
        className="flex cursor-pointer flex-row items-center justify-center self-stretch rounded-[8px] border border-[#F7C1D4] bg-[#F7C1D4] px-[20px] py-[12px]"
      >
        <span className="text-[15px] font-bold text-[#0D050A]">{ctaLabel}</span>
      </button>
    </article>
  );
}

function PostRowItemView({
  post,
  onSelect,
}: {
  post: BoardPost;
  onSelect: () => void;
}) {
  const isRecruiting = post.status === '모집 중';
  const meta = `${post.university} · ${post.format} · ${post.date} · ${post.location}`;
  const applicantCount = `신청 ${post.applicants.length}팀`;
  const timeAgo = formatRelativeTime(post.createdAt);

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className="flex cursor-pointer flex-row items-center gap-[16px] self-stretch border-b border-[#EBCDD9] bg-[#FFFFFF] px-4 py-[20px] sm:gap-[20px] sm:px-[24px]"
    >
      {isRecruiting ? (
        <div className="flex shrink-0 flex-row items-center rounded-[999px] border border-[#F7C1D4] bg-[#F7C1D4] px-[14px] py-[6px]">
          <span className="text-[14px] font-bold text-[#0D050A]">{post.status}</span>
        </div>
      ) : (
        <div className="flex shrink-0 flex-row items-center rounded-[999px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[6px]">
          <span className="text-[14px] font-normal text-[#4A3842]">{post.status}</span>
        </div>
      )}

      <GenderTag gender={post.gender} />

      <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
        <span className="truncate text-[16px] font-medium text-[#0D050A]">
          {post.title}
        </span>
        <span className="truncate text-[14px] font-normal text-[#6E5464]">{meta}</span>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-[4px]">
        <span className="text-[14px] font-medium text-[#4A3842]">{applicantCount}</span>
        <span className="text-[13px] font-normal text-[#6E5464]">{timeAgo}</span>
      </div>
    </article>
  );
}

function getNavItemClassName(activePage: PageId, item: string): string {
  const isActive =
    ((activePage === 'rooms' ||
      activePage === 'room-detail' ||
      activePage === 'room-create') &&
      item === '주선') ||
    (activePage === 'map' && item === '지도') ||
    ((activePage === 'board' ||
      activePage === 'board-write' ||
      activePage === 'board-detail') &&
      item === '게시판');

  return isActive
    ? 'text-[16px] font-bold text-[#F7C1D4] no-underline'
    : 'text-[16px] font-medium text-[#FFFFFF]/65 transition-colors hover:text-[#FFFFFF] no-underline';
}

function GNB({
  activePage,
  user,
  onLogout,
  onNavigate,
}: {
  activePage: PageId;
  user: UserProfile | null;
  onLogout: () => void;
  onNavigate: (page: PageId) => void;
}) {
  const getAuthBadge = () => {
    if (!user) return null;
    if (user.verificationStatus === 'approved' && user.verified) {
      return (
        <button
          type="button"
          onClick={() => onNavigate('school-auth')}
          className="hidden cursor-pointer flex-row items-center rounded-[999px] border border-[#F7C1D4] bg-[#F7C1D4] px-[14px] py-[6px] sm:flex"
        >
          <span className="text-[14px] font-bold text-[#0D050A]">
            {`${getShortUniversityName(user.university)} 인증`}
          </span>
        </button>
      );
    }
    if (user.verificationStatus === 'pending') {
      return (
        <button
          type="button"
          onClick={() => onNavigate('school-auth')}
          className="hidden cursor-pointer flex-row items-center rounded-[999px] border border-[#F7D8E4] bg-[#F7D8E4] px-[14px] py-[6px] sm:flex"
        >
          <span className="text-[14px] font-bold text-[#0D050A]">학교 인증 심사 중</span>
        </button>
      );
    }
    if (user.verificationStatus === 'rejected') {
      return (
        <button
          type="button"
          onClick={() => onNavigate('school-auth')}
          className="hidden cursor-pointer flex-row items-center rounded-[999px] border border-[#F5C2C7] bg-[#FFF5F5] px-[14px] py-[6px] sm:flex"
        >
          <span className="text-[14px] font-bold text-[#B42318]">학교 재인증 필요</span>
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => onNavigate('school-auth')}
        className="hidden cursor-pointer flex-row items-center rounded-[999px] border border-[#F7C1D4]/50 bg-transparent px-[14px] py-[6px] transition-colors hover:bg-[#F7C1D4]/15 sm:flex"
      >
        <span className="text-[14px] font-medium text-[#F7C1D4]">학교 인증하기</span>
      </button>
    );
  };

  return (
    <header className="flex h-[72px] w-full max-w-[1440px] flex-row items-center justify-between bg-[#0D050A] px-5 py-[0px] md:px-12 xl:px-[120px]">
      <div className="flex flex-row items-center gap-6 sm:gap-[56px]">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          aria-label="Univmeeting 홈으로 이동"
          className="flex cursor-pointer flex-row items-center gap-[8px] border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F7C1D4]"
        >
          <img
            src="/logo.svg?v=2"
            alt="Univmeeting 로고"
            className="h-[28px] w-[28px] rounded-[6px] object-cover"
          />
          <span className="text-[20px] font-bold text-[#FFFFFF]">Univmeeting</span>
        </button>

        <nav aria-label="주요 메뉴" className="flex flex-row items-center gap-5 sm:gap-[36px]">
          {NAV_ITEMS.map((item) => (
            <a
              key={item}
              href={`#${item}`}
              onClick={(e) => {
                e.preventDefault();
                if (item === '주선') {
                  onNavigate('rooms');
                } else if (item === '지도') {
                  onNavigate('map');
                } else if (item === '게시판') {
                  onNavigate('board');
                }
              }}
              className={getNavItemClassName(activePage, item)}
            >
              {item}
            </a>
          ))}
        </nav>
      </div>

      <div className="flex flex-row items-center gap-[10px]">
        {user ? (
          <>
            {getAuthBadge()}
            <button
              type="button"
              title="마이페이지"
              aria-label="마이페이지"
              onClick={() => onNavigate('mypage')}
              className={`flex h-[36px] w-[36px] cursor-pointer items-center justify-center rounded-full border-0 p-0 text-[13px] font-bold text-[#0D050A] ${
                user.gender === '남' ? 'bg-[#ABD2FA]' : 'bg-[#F7C1D4]'
              }`}
            >
              {user.name.slice(0, 1)}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="cursor-pointer rounded-[8px] border border-[#FFFFFF]/30 bg-transparent px-[12px] py-[6px] text-[13px] font-medium text-[#FFFFFF]/85 transition-colors hover:bg-[#FFFFFF]/10"
            >
              로그아웃
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="cursor-pointer rounded-[8px] border border-[#FFFFFF]/35 bg-transparent px-[16px] py-[8px] text-[14px] font-medium text-[#FFFFFF] transition-colors hover:bg-[#FFFFFF]/10"
            >
              로그인
            </button>
            <button
              type="button"
              onClick={() => onNavigate('signup')}
              className="cursor-pointer rounded-[8px] border-0 bg-[#F7C1D4] px-[16px] py-[8px] text-[14px] font-bold text-[#0D050A] transition-all hover:brightness-105"
            >
              회원가입
            </button>
          </>
        )}
      </div>
    </header>
  );
}

function BoardDetailPage({
  post,
  user,
  isAdmin,
  onToggleApply,
  onToggleStatus,
  onDeletePost,
  onNavigate,
  onShowToast,
  onOpenOverlay,
}: {
  post: BoardPost | undefined;
  user: UserProfile | null;
  isAdmin: boolean;
  onToggleApply: (post: BoardPost) => void;
  onToggleStatus: (post: BoardPost) => void;
  onDeletePost: (postId: string) => void;
  onNavigate: (page: PageId) => void;
  onShowToast: (toastId: ToastId, customMessage?: string) => void;
  onOpenOverlay: (overlay: ActiveOverlayState) => void;
}) {
  if (!post) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-[1440px] flex-col bg-[#FFFFFF]">
        <main className="flex flex-1 flex-col items-center justify-center gap-[16px] px-5 py-[80px]">
          <p className="m-0 text-[16px] text-[#4A3842]">
            존재하지 않거나 삭제된 모집글이에요.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('board')}
            className="cursor-pointer rounded-[8px] border-0 bg-[#0D050A] px-[20px] py-[12px] text-[15px] font-medium text-[#FFFFFF]"
          >
            게시판으로 돌아가기
          </button>
        </main>
      </div>
    );
  }

  const alreadyApplied = Boolean(user && post.applicants.some((a) => a.uid === user.uid));
  const isAuthor = Boolean(user && post.authorUid === user.uid);
  const canManage = isAuthor || isAdmin;
  const maxPerTeam = getMaxMembersPerTeam(post.format);
  const timeAgo = formatRelativeTime(post.createdAt);
  const tabLabel = post.tab === 'meeting' ? '미팅 모집' : '팀원 구인';

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col bg-[#FFFFFF]">
      <main className="flex flex-col gap-[24px] self-stretch px-5 py-[40px] md:px-12 xl:px-[120px]">
        <button
          type="button"
          onClick={() => onNavigate('board')}
          className="w-fit cursor-pointer border-0 bg-transparent p-0 text-left whitespace-pre text-[14px] font-normal leading-[1.45] text-[#6E5464] hover:underline"
        >
          {`게시판  >  ${tabLabel}`}
        </button>

        <div className="flex flex-col items-start gap-[32px] self-stretch lg:flex-row">
          <div className="flex w-full flex-1 flex-col items-stretch gap-[36px]">
            <section className="flex flex-col gap-[12px] self-stretch">
              <div className="flex flex-row items-center gap-[10px]">
                <div className="flex flex-row items-center rounded-[999px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[6px]">
                  <span className="text-[14px] font-normal text-[#4A3842]">{post.format}</span>
                </div>
                <span className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">
                  {post.status}
                </span>
                <GenderTag gender={post.gender} />
              </div>

              <h1 className="m-0 text-[28px] font-bold leading-[1.45] text-[#0D050A] sm:text-[32px]">
                {post.title}
              </h1>

              <p className="m-0 whitespace-pre-wrap text-[15px] font-normal leading-[1.45] text-[#4A3842] sm:text-[16px]">
                {`${post.university} ${post.department}  ·  ${post.date}  ·  ${post.location}  ·  ${timeAgo}`}
              </p>
            </section>

            <section className="flex flex-col gap-[8px] self-stretch rounded-[12px] bg-[#F7D8E4] p-[24px]">
              <h2 className="m-0 text-[16px] font-bold leading-[1.45] text-[#0D050A]">본문</h2>
              <p className="m-0 self-stretch whitespace-pre-line text-[15px] font-normal leading-[1.45] text-[#4A3842]">
                {post.content}
              </p>
            </section>

            <section className="flex flex-col gap-[8px] self-stretch rounded-[12px] border border-[#EBCDD9] bg-[#FFFFFF] p-[24px]">
              <h2 className="m-0 text-[16px] font-bold leading-[1.45] text-[#0D050A]">
                원하는 조건
              </h2>
              <p className="m-0 self-stretch whitespace-pre-wrap text-[15px] font-normal leading-[1.45] text-[#4A3842]">
                {`인원 ${post.format}  ·  날짜 ${post.date}  ·  지역 ${post.location}  ·  상대 대학 ${post.targetUniversity}`}
              </p>
            </section>

            {isAuthor && post.applicants.length > 0 && (
              <section className="flex flex-col gap-[12px] self-stretch rounded-[12px] border border-[#EBCDD9] bg-[#FFFFFF] p-[24px]">
                <h2 className="m-0 text-[16px] font-bold text-[#0D050A]">
                  {`신청한 팀 목록 (${post.applicants.length}팀)`}
                </h2>
                <div className="flex flex-col gap-[8px]">
                  {post.applicants.map((app) => (
                    <div
                      key={app.uid}
                      className="flex flex-row items-center justify-between rounded-[8px] bg-[#FBEBF1] px-[16px] py-[10px]"
                    >
                      <span className="text-[14px] font-medium text-[#0D050A]">
                        {`${app.university} · ${app.department}`}
                      </span>
                      <span className="text-[13px] text-[#6E5464]">
                        {formatRelativeTime(app.appliedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="flex w-full shrink-0 flex-col gap-[16px] rounded-[12px] border border-[#EBCDD9] bg-[#FFFFFF] p-[24px] lg:w-[396px]">
            <h2 className="m-0 text-[20px] font-bold leading-[1.45] text-[#0D050A]">신청하기</h2>

            <div className="flex flex-col gap-[4px] self-stretch rounded-[8px] bg-[#F7D8E4] p-[16px]">
              <span className="text-[13px] font-normal leading-[1.45] text-[#6E5464]">내 소속</span>
              <span className="text-[15px] font-medium leading-[1.45] text-[#0D050A]">
                {!user
                  ? '로그인 후 신청 가능'
                  : isStudentVerified(user)
                    ? `${user.university} · 재학생 인증 완료`
                    : user.verificationStatus === 'pending'
                      ? `${user.university} · 인증 승인 대기 중`
                      : `${user.university} · 학교 인증 필요`}
              </span>
            </div>

            <span className="text-[16px] font-bold leading-[1.45] text-[#0D050A]">
              {isAuthor
                ? `현재 ${post.applicants.length}팀이 신청했어요`
                : `우리 팀 ${maxPerTeam}명으로 신청해요 (현재 ${post.applicants.length}팀 신청)`}
            </span>

            {!isAuthor && (
              <button
                type="button"
                disabled={post.status === '마감' && !alreadyApplied}
                onClick={() => onToggleApply(post)}
                className={`flex cursor-pointer flex-row items-center justify-center self-stretch rounded-[8px] px-[20px] py-[12px] ${
                  alreadyApplied
                    ? 'border border-[#D8B4C4] bg-[#FFFFFF]'
                    : 'border-0 bg-[#0D050A] disabled:cursor-not-allowed disabled:opacity-50'
                }`}
              >
                <span
                  className={`text-[15px] font-medium ${
                    alreadyApplied ? 'text-[#0D050A]' : 'text-[#FFFFFF]'
                  }`}
                >
                  {alreadyApplied
                    ? '신청 취소하기'
                    : post.status === '마감'
                      ? '모집이 마감됐어요'
                      : '우리 팀으로 신청하기'}
                </span>
              </button>
            )}

            {canManage && (
              <div className="flex flex-row gap-[8px] self-stretch">
                <button
                  type="button"
                  onClick={() => onToggleStatus(post)}
                  className="flex flex-1 cursor-pointer flex-row items-center justify-center rounded-[8px] border border-[#0D050A] bg-[#0D050A] px-[16px] py-[12px]"
                >
                  <span className="text-[14px] font-medium text-[#FFFFFF]">
                    {post.status === '모집 중' ? '모집 마감하기' : '다시 모집하기'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('이 모집글을 삭제할까요?')) {
                      onDeletePost(post.id);
                    }
                  }}
                  className="flex cursor-pointer flex-row items-center justify-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[16px] py-[12px]"
                >
                  <span className="text-[14px] font-medium text-[#B42318]">삭제</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                const shareUrl = buildShareUrl({
                  page: 'board-detail',
                  post: post.id,
                });
                navigator.clipboard?.writeText(shareUrl).catch(() => {});
                onShowToast('copy-link');
              }}
              className="flex cursor-pointer flex-row items-center justify-center self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[20px] py-[12px]"
            >
              <span className="text-[15px] font-medium text-[#0D050A]">링크 공유하기</span>
            </button>

            <p className="m-0 self-stretch text-[13px] font-normal leading-[1.45] text-[#6E5464]">
              학교 인증 승인을 마친 회원만 신청할 수 있어요.
            </p>

            <a
              href="#report"
              onClick={(e) => {
                e.preventDefault();
                onOpenOverlay({
                  id: 'report',
                  reportTarget: { targetType: 'post', targetId: post.id },
                });
              }}
              className="w-fit text-[13px] font-medium leading-[1.45] text-[#6E5464] no-underline"
            >
              신고하기
            </a>
          </aside>
        </div>
      </main>
    </div>
  );
}

function MyPage({
  user,
  rooms,
  posts,
  onSelectRoom,
  onSelectPost,
  onRequestCreateRoom,
  onRequestWritePost,
  onDeleteVerificationOnly,
  onWithdrawAccount,
  onOpenOverlay,
  onNavigate,
}: {
  user: UserProfile | null;
  rooms: MeetingRoom[];
  posts: BoardPost[];
  onSelectRoom: (roomId: string) => void;
  onSelectPost: (postId: string) => void;
  onRequestCreateRoom: () => void;
  onRequestWritePost: () => void;
  onDeleteVerificationOnly: () => Promise<void>;
  onWithdrawAccount: (password: string) => Promise<void>;
  onOpenOverlay: (overlay: ActiveOverlayState) => void;
  onNavigate: (page: PageId) => void;
}) {
  const [activeTab, setActiveTab] = useState<'joined' | 'hosted' | 'posts'>('joined');
  const [showWithdrawForm, setShowWithdrawForm] = useState<boolean>(false);
  const [withdrawPassword, setWithdrawPassword] = useState<string>('');
  const [withdrawConsented, setWithdrawConsented] = useState<boolean>(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<boolean>(false);

  const joinedRooms = useMemo(
    () =>
      user
        ? rooms.filter(
            (r) =>
              r.leftMembers.some((m) => m.uid === user.uid) ||
              r.rightMembers.some((m) => m.uid === user.uid)
          )
        : [],
    [rooms, user]
  );

  const hostedRooms = useMemo(
    () => (user ? rooms.filter((r) => r.hostUid === user.uid) : []),
    [rooms, user]
  );

  const myPosts = useMemo(
    () => (user ? posts.filter((p) => p.authorUid === user.uid) : []),
    [posts, user]
  );

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-[1440px] flex-col bg-[#FFFFFF]">
        <main className="flex flex-1 flex-col items-center justify-center px-5 py-[80px]">
          <div className="flex w-full max-w-[480px] flex-col items-center gap-[18px] rounded-[16px] border border-[#EBCDD9] p-[40px] text-center">
            <h1 className="m-0 text-[26px] font-bold text-[#0D050A]">마이페이지</h1>
            <p className="m-0 text-[15px] text-[#4A3842]">
              로그인하면 참여 중인 미팅 방과 학교 인증 상태를 확인할 수 있어요.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="cursor-pointer rounded-[8px] border-0 bg-[#0D050A] px-[24px] py-[12px] text-[15px] font-medium text-[#FFFFFF]"
            >
              로그인하러 가기
            </button>
          </div>
        </main>
      </div>
    );
  }

  const displayedRooms = activeTab === 'hosted' ? hostedRooms : joinedRooms;

  const tabs: { id: 'joined' | 'hosted' | 'posts'; label: string }[] = [
    { id: 'joined', label: `참여 중인 방 (${joinedRooms.length})` },
    { id: 'hosted', label: `내가 만든 방 (${hostedRooms.length})` },
    { id: 'posts', label: `내가 쓴 글 (${myPosts.length})` },
  ];

  const statusText =
    user.verificationStatus === 'approved'
      ? '재학생 인증 완료'
      : user.verificationStatus === 'pending'
        ? '재학생 인증 심사 대기 중'
        : user.verificationStatus === 'rejected'
          ? '학교 인증 반려 (재제출 필요)'
          : '학교 미인증';

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col bg-[#FFFFFF]">
      <main className="flex flex-col gap-[28px] self-stretch px-5 py-[48px] md:px-12 xl:px-[120px]">
        <div className="flex flex-col items-start justify-between gap-4 self-stretch sm:flex-row sm:items-center">
          <div className="flex flex-col gap-[8px]">
            <div className="flex flex-row items-center gap-[10px]">
              <h1 className="m-0 text-[32px] font-bold leading-[1.45] text-[#0D050A]">
                {`${user.name}님의 마이페이지`}
              </h1>
              <GenderTag gender={user.gender} />
            </div>
            <p className="m-0 whitespace-pre-wrap text-[16px] font-normal leading-[1.45] text-[#4A3842]">
              {`${user.university} ${user.department} · ${user.studentYear}  ·  ${statusText}`}
            </p>
          </div>

          <div className="flex flex-row items-center gap-[10px]">
            {!isStudentVerified(user) && (
              <button
                type="button"
                onClick={() => onNavigate('school-auth')}
                className="flex cursor-pointer flex-row items-center justify-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[20px] py-[12px]"
              >
                <span className="text-[15px] font-medium text-[#0D050A]">학교 인증 관리</span>
              </button>
            )}
            <button
              type="button"
              onClick={onRequestCreateRoom}
              className="flex cursor-pointer flex-row items-center justify-center rounded-[8px] border-0 bg-[#0D050A] px-[20px] py-[12px]"
            >
              <span className="text-[15px] font-medium text-[#FFFFFF]">+ 방 만들기</span>
            </button>
          </div>
        </div>

        <div className="flex flex-row flex-wrap gap-[8px]">
          {tabs.map((tab) =>
            activeTab === tab.id ? (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="flex cursor-pointer flex-row items-center rounded-[999px] border border-[#F7C1D4] bg-[#F7C1D4] px-[14px] py-[6px]"
              >
                <span className="text-[14px] font-bold text-[#0D050A]">{tab.label}</span>
              </button>
            ) : (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="flex cursor-pointer flex-row items-center rounded-[999px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[6px]"
              >
                <span className="text-[14px] font-normal text-[#4A3842]">{tab.label}</span>
              </button>
            )
          )}
        </div>

        {activeTab !== 'posts' && (
          <div className="flex flex-row flex-wrap gap-[24px] self-stretch">
            {displayedRooms.length > 0 ? (
              displayedRooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  ctaLabelOverride="방 보기"
                  onSelect={() => onSelectRoom(room.id)}
                />
              ))
            ) : (
              <div className="flex w-full flex-col items-center gap-[12px] rounded-[12px] border border-[#EBCDD9] py-[48px]">
                <span className="text-[15px] text-[#6E5464]">
                  {activeTab === 'hosted'
                    ? '아직 직접 만든 방이 없어요.'
                    : '아직 참여 중인 미팅 방이 없어요.'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    activeTab === 'hosted' ? onRequestCreateRoom() : onNavigate('rooms')
                  }
                  className="cursor-pointer rounded-[8px] border-0 bg-[#0D050A] px-[20px] py-[10px] text-[14px] font-medium text-[#FFFFFF]"
                >
                  {activeTab === 'hosted' ? '새 방 만들기' : '미팅 방 둘러보기'}
                </button>
              </div>
            )}
          </div>
        )}

        <section className="flex flex-col gap-[16px] self-stretch">
          <h2 className="m-0 text-[20px] font-bold leading-[1.45] text-[#0D050A]">내가 쓴 글</h2>
          {myPosts.length > 0 ? (
            <div className="flex flex-col border-t border-[#EBCDD9]">
              {myPosts.map((post) => (
                <PostRowItemView
                  key={post.id}
                  post={post}
                  onSelect={() => onSelectPost(post.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-[12px] rounded-[12px] border border-[#EBCDD9] py-[40px]">
              <span className="text-[15px] text-[#6E5464]">아직 작성한 모집글이 없어요.</span>
              <button
                type="button"
                onClick={onRequestWritePost}
                className="cursor-pointer rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[20px] py-[10px] text-[14px] font-medium text-[#0D050A]"
              >
                모집글 쓰러 가기
              </button>
            </div>
          )}
        </section>

        {/* 개인정보 열람·파기 및 회원탈퇴 관리 섹션 */}
        <section
          aria-labelledby="account-privacy-heading"
          className="flex flex-col gap-[16px] self-stretch rounded-[16px] border border-[#EBCDD9] bg-[#FBEBF1]/60 p-[24px]"
        >
          <div className="flex flex-col gap-[4px]">
            <h2
              id="account-privacy-heading"
              className="m-0 text-[18px] font-bold leading-[1.45] text-[#0D050A]"
            >
              개인정보 및 계정 관리
            </h2>
            <p className="m-0 text-[14px] text-[#4A3842]">
              제출한 재학증명서·학번 원본 파기, 개인정보 삭제 요청 및 회원 탈퇴를 진행할 수 있어요.
            </p>
          </div>

          <div className="flex flex-row flex-wrap items-center gap-[10px]">
            {user.verificationStatus !== 'unverified' && (
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      '제출하신 재학증명서 파일과 학번 정보를 서버에서 즉시 영구 파기할까요? (계정은 유지되며 학교 인증은 미인증 상태로 전환됩니다)'
                    )
                  ) {
                    void onDeleteVerificationOnly();
                  }
                }}
                className="cursor-pointer rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[9px] text-[13px] font-medium text-[#4A3842]"
              >
                재학증명서·학번 원본 파기
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenOverlay({ id: 'privacy-delete' })}
              className="cursor-pointer rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[9px] text-[13px] font-medium text-[#0D050A]"
            >
              개인정보 삭제 요청
            </button>
            <button
              type="button"
              aria-expanded={showWithdrawForm}
              onClick={() => {
                setShowWithdrawForm((v) => !v);
                setWithdrawError(null);
              }}
              className="cursor-pointer rounded-[8px] border border-[#F5C2C7] bg-[#FFF5F5] px-[14px] py-[9px] text-[13px] font-bold text-[#B42318]"
            >
              {showWithdrawForm ? '회원 탈퇴 닫기' : '회원 탈퇴'}
            </button>
          </div>

          {showWithdrawForm && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!withdrawPassword) {
                  setWithdrawError('본인 확인을 위해 현재 로그인 비밀번호를 입력해 주세요.');
                  return;
                }
                if (!withdrawConsented) {
                  setWithdrawError('영구 삭제 안내 동의 항목에 체크해 주세요.');
                  return;
                }
                if (withdrawing) return;
                setWithdrawError(null);
                setWithdrawing(true);
                try {
                  await onWithdrawAccount(withdrawPassword);
                } catch (err) {
                  setWithdrawError(translateFirebaseAuthError(err));
                } finally {
                  setWithdrawing(false);
                }
              }}
              className="flex flex-col gap-[12px] rounded-[12px] border border-[#F5C2C7] bg-[#FFFFFF] p-[20px]"
            >
              <span className="text-[15px] font-bold text-[#B42318]">
                회원탈퇴 및 전체 개인정보 즉시 파기 확인
              </span>
              <p className="m-0 text-[13px] leading-[1.5] text-[#4A3842]">
                탈퇴 즉시 회원 계정({user.email}), 학번, 재학증명서 사본, 직접 개설한 미팅 방({hostedRooms.length}개), 작성한 모집글({myPosts.length}개) 및 참여 신청 기록이 서버에서 복구 불가능하게 영구 삭제됩니다.
              </p>

              <div className="flex flex-col gap-[6px]">
                <label htmlFor="withdraw-password" className="text-[13px] font-bold text-[#0D050A]">
                  현재 비밀번호 재확인
                </label>
                <div className="flex h-[42px] max-w-[360px] flex-row items-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[12px] focus-within:ring-2 focus-within:ring-[#0D050A]">
                  <input
                    id="withdraw-password"
                    type="password"
                    autoComplete="current-password"
                    value={withdrawPassword}
                    onChange={(e) => {
                      setWithdrawPassword(e.target.value);
                      setWithdrawError(null);
                    }}
                    placeholder="현재 비밀번호 입력"
                    className="w-full border-0 bg-transparent p-0 text-[14px] text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
                  />
                </div>
              </div>

              <label className="flex cursor-pointer flex-row items-start gap-[8px] text-[13px] text-[#0D050A]">
                <input
                  type="checkbox"
                  checked={withdrawConsented}
                  onChange={(e) => {
                    setWithdrawConsented(e.target.checked);
                    setWithdrawError(null);
                  }}
                  className="mt-[2px] h-[16px] w-[16px] shrink-0 accent-[#B42318]"
                />
                <span>
                  <strong>[필수]</strong> 모든 개인정보 및 활동 내역이 즉시 영구 파기되며 복구할 수 없음을 확인하고 탈퇴에 동의합니다.
                </span>
              </label>

              {withdrawError && (
                <span className="text-[13px] font-medium text-[#B42318]">
                  {withdrawError}
                </span>
              )}

              <div className="flex flex-row justify-end gap-[8px]">
                <button
                  type="button"
                  onClick={() => {
                    setShowWithdrawForm(false);
                    setWithdrawPassword('');
                    setWithdrawConsented(false);
                    setWithdrawError(null);
                  }}
                  className="cursor-pointer rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[16px] py-[9px] text-[13px] font-medium text-[#0D050A]"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={withdrawing}
                  className="cursor-pointer rounded-[8px] border-0 bg-[#B42318] px-[18px] py-[9px] text-[13px] font-bold text-[#FFFFFF] disabled:opacity-60"
                >
                  {withdrawing ? '파기 및 탈퇴 처리 중...' : '회원탈퇴 및 전체 정보 영구 삭제'}
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}

function RoomCreatePage({
  user,
  onCreateRoom,
  onNavigate,
  onOpenOverlay,
}: {
  user: UserProfile | null;
  onCreateRoom: (payload: {
    title: string;
    format: RoomFormat;
    schedule: string;
    location: string;
    opponentUniversity: string;
    intro: string;
  }) => Promise<void>;
  onNavigate: (page: PageId) => void;
  onOpenOverlay: (overlay: ActiveOverlayState) => void;
}) {
  const [title, setTitle] = useState<string>('');
  const [format, setFormat] = useState<RoomFormat>('3:3');
  const [selectedDate, setSelectedDate] = useState<string>('이번 주말');
  const [selectedRegion, setSelectedRegion] = useState<string>('서울 신촌·홍대');
  const [selectedUniversity, setSelectedUniversity] = useState<string>('');
  const [intro, setIntro] = useState<string>('');
  const [agreeRoomRules, setAgreeRoomRules] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  if (!user || !isStudentVerified(user)) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-[1440px] flex-col bg-[#FFFFFF]">
        <main className="flex flex-1 flex-col items-center justify-center px-5 py-[80px]">
          <div className="flex w-full max-w-[520px] flex-col items-center gap-[16px] rounded-[16px] border border-[#EBCDD9] p-[40px] text-center">
            <h1 className="m-0 text-[26px] font-bold text-[#0D050A]">
              학교 인증 승인 후 방을 만들 수 있어요
            </h1>
            <p className="m-0 text-[15px] leading-[1.45] text-[#4A3842]">
              {!user
                ? '먼저 로그인한 뒤 학번과 재학증명서 인증을 진행해 주세요.'
                : user.verificationStatus === 'pending'
                  ? '현재 운영팀이 제출하신 재학증명서를 검토 중이에요. 승인 완료 후 바로 방을 만들 수 있어요.'
                  : '학번과 재학증명서를 업로드하고 승인을 받으면 방을 생성할 수 있어요.'}
            </p>
            <button
              type="button"
              onClick={() => onNavigate(user ? 'school-auth' : 'login')}
              className="cursor-pointer rounded-[8px] border-0 bg-[#0D050A] px-[24px] py-[12px] text-[15px] font-medium text-[#FFFFFF]"
            >
              {user ? '학교 인증 페이지로 이동' : '로그인하러 가기'}
            </button>
          </div>
        </main>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUniversity) {
      setErrorText('미팅할 상대 대학교를 선택해 주세요.');
      return;
    }
    if (selectedUniversity === user.university) {
      setErrorText('상대 대학은 내 소속 대학과 다른 대학교로 선택해 주세요.');
      return;
    }
    if (!agreeRoomRules) {
      setErrorText('방 개설 이용수칙 및 개인정보 노출 금지 동의 항목에 체크해 주세요.');
      return;
    }
    if (submitting) return;
    setErrorText(null);
    setSubmitting(true);
    try {
      await onCreateRoom({
        title,
        format,
        schedule: selectedDate,
        location: selectedRegion,
        opponentUniversity: selectedUniversity,
        intro,
      });
    } catch {
      setErrorText('방 생성 중 오류가 발생했어요. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const myShort = getShortUniversityName(user.university);
  const oppShort = selectedUniversity
    ? getShortUniversityName(selectedUniversity)
    : '상대대학';

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col bg-[#FFFFFF]">
      <main className="flex flex-col items-center self-stretch px-5 py-[56px] md:px-12 xl:px-[120px]">
        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-[720px] flex-col items-stretch gap-[28px]"
        >
          <div className="flex flex-col gap-[8px] self-stretch">
            <h1 className="m-0 text-[32px] font-bold leading-[1.45] text-[#0D050A]">방 만들기</h1>
            <p className="m-0 text-[16px] font-normal leading-[1.45] text-[#4A3842]">
              전국 453개 대학 중 상대 대학과 인원을 정하면, 그 대학 학생들이 남은 자리를 채워요.
            </p>
          </div>

          <div className="flex flex-col gap-[10px] self-stretch">
            <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">방 이름</label>
            <div className="flex h-[44px] flex-row items-center gap-[8px] self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[0px]">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`예) ${myShort} × ${oppShort} ${format} 저녁 미팅 (비워두면 자동 생성)`}
                className="w-full border-0 bg-transparent p-0 text-[14px] font-normal text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-[10px] self-stretch">
            <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">인원</label>
            <div className="flex flex-row gap-[8px]">
              {FORMAT_OPTIONS.map((opt) =>
                format === opt ? (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setFormat(opt)}
                    className="flex cursor-pointer flex-row items-center rounded-[999px] border border-[#F7C1D4] bg-[#F7C1D4] px-[14px] py-[6px]"
                  >
                    <span className="text-[14px] font-bold text-[#0D050A]">{opt}</span>
                  </button>
                ) : (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setFormat(opt)}
                    className="flex cursor-pointer flex-row items-center rounded-[999px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[6px]"
                  >
                    <span className="text-[14px] font-normal text-[#4A3842]">{opt}</span>
                  </button>
                )
              )}
            </div>
          </div>

          <div className="flex flex-col gap-[16px] self-stretch sm:flex-row">
            <div className="flex flex-1 flex-col gap-[10px]">
              <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">날짜</label>
              <button
                type="button"
                onClick={() =>
                  onOpenOverlay({
                    id: 'select-date',
                    initialValue: selectedDate,
                    allowCustomDate: true,
                    onApply: (val) => setSelectedDate(val === '전체' ? '일정 협의' : val),
                  })
                }
                className="flex h-[44px] cursor-pointer flex-row items-center justify-between self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[0px]"
              >
                <span className="text-[14px] font-normal text-[#4A3842]">{selectedDate}</span>
                <ChevronDownIcon />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-[10px]">
              <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">지역</label>
              <button
                type="button"
                onClick={() =>
                  onOpenOverlay({
                    id: 'select-region',
                    initialValue: selectedRegion,
                    onApply: (val) => setSelectedRegion(val === '전체' ? '지역 협의' : val),
                  })
                }
                className="flex h-[44px] cursor-pointer flex-row items-center justify-between self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[0px]"
              >
                <span className="text-[14px] font-normal text-[#4A3842]">{selectedRegion}</span>
                <ChevronDownIcon />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-[10px] self-stretch">
            <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">
              상대 대학
            </label>
            <button
              type="button"
              onClick={() =>
                onOpenOverlay({
                  id: 'select-university',
                  initialValue: selectedUniversity || undefined,
                  allowAnyUniversity: false,
                  onApply: (val) => setSelectedUniversity(val),
                })
              }
              className="flex h-[44px] cursor-pointer flex-row items-center justify-between self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[0px]"
            >
              <span
                className={`text-[14px] font-normal ${
                  selectedUniversity ? 'text-[#0D050A]' : 'text-[#6E5464]'
                }`}
              >
                {selectedUniversity || '상대 대학교 검색 및 선택'}
              </span>
              <ChevronDownIcon />
            </button>
          </div>

          <div className="flex flex-col gap-[10px] self-stretch">
            <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">방 소개</label>
            <textarea
              value={intro}
              maxLength={500}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="어떤 미팅을 원하는지, 팀 분위기를 적어 주세요."
              className="h-[160px] w-full resize-none self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] p-[14px] text-[14px] font-normal leading-[1.45] text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
            />
            <div className="flex flex-row justify-end self-stretch">
              <span className="text-[13px] font-normal leading-[1.45] text-[#6E5464]">
                {`${intro.length} / 500`}
              </span>
            </div>
          </div>

          {errorText && (
            <div className="rounded-[8px] border border-[#F5C2C7] bg-[#FFF5F5] px-[14px] py-[12px] text-[13px] font-medium text-[#B42318]">
              {errorText}
            </div>
          )}

          <div className="flex flex-col gap-[10px] self-stretch rounded-[8px] bg-[#F7D8E4] px-[16px] py-[14px]">
            <span className="text-[13px] font-normal leading-[1.45] text-[#4A3842]">
              {`방을 만들면 ${user.university} 첫 자리에 방장으로 들어가요. 상대 대학 자리는 그 대학 인증을 마친 회원만 신청할 수 있어요.`}
            </span>
            <label className="flex cursor-pointer flex-row items-start gap-[8px] border-t border-[#D8B4C4] pt-[10px] text-[13px] text-[#0D050A]">
              <input
                type="checkbox"
                checked={agreeRoomRules}
                onChange={(e) => {
                  setAgreeRoomRules(e.target.checked);
                  setErrorText(null);
                }}
                className="mt-[2px] h-[16px] w-[16px] shrink-0 accent-[#0D050A]"
              />
              <span>
                <strong>[필수]</strong> 타인의 개인정보·연락처 무단 노출 및 불건전 목적이 없으며 이용약관 준수에 동의합니다.
              </span>
            </label>
          </div>

          <div className="flex flex-row justify-end gap-[12px] self-stretch">
            <button
              type="button"
              onClick={() => onNavigate('rooms')}
              className="flex cursor-pointer flex-row items-center justify-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[20px] py-[12px]"
            >
              <span className="text-[15px] font-medium text-[#0D050A]">취소</span>
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex cursor-pointer flex-row items-center justify-center rounded-[8px] border-0 bg-[#0D050A] px-[20px] py-[12px] disabled:opacity-60"
            >
              <span className="text-[15px] font-medium text-[#FFFFFF]">
                {submitting ? '생성 중...' : '방 만들기'}
              </span>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function BoardWritePage({
  user,
  onCreatePost,
  onNavigate,
  onOpenOverlay,
}: {
  user: UserProfile | null;
  onCreatePost: (payload: {
    tab: BoardTabType;
    title: string;
    format: RoomFormat;
    date: string;
    location: string;
    targetUniversity: string;
    content: string;
  }) => Promise<void>;
  onNavigate: (page: PageId) => void;
  onOpenOverlay: (overlay: ActiveOverlayState) => void;
}) {
  const [tab, setTab] = useState<BoardTabType>('meeting');
  const [title, setTitle] = useState<string>('');
  const [format, setFormat] = useState<RoomFormat>('3:3');
  const [selectedDate, setSelectedDate] = useState<string>('이번 주말');
  const [selectedRegion, setSelectedRegion] = useState<string>('서울 신촌·홍대');
  const [selectedUniversity, setSelectedUniversity] = useState<string>('전체 (상관없음)');
  const [content, setContent] = useState<string>('');
  const [agreePostRules, setAgreePostRules] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  if (!user || !isStudentVerified(user)) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-[1440px] flex-col bg-[#FFFFFF]">
        <main className="flex flex-1 flex-col items-center justify-center px-5 py-[80px]">
          <div className="flex w-full max-w-[520px] flex-col items-center gap-[16px] rounded-[16px] border border-[#EBCDD9] p-[40px] text-center">
            <h1 className="m-0 text-[26px] font-bold text-[#0D050A]">
              학교 인증 승인 후 글을 작성할 수 있어요
            </h1>
            <p className="m-0 text-[15px] leading-[1.45] text-[#4A3842]">
              학번과 재학증명서를 업로드하고 운영팀 승인을 완료해 주세요.
            </p>
            <button
              type="button"
              onClick={() => onNavigate(user ? 'school-auth' : 'login')}
              className="cursor-pointer rounded-[8px] border-0 bg-[#0D050A] px-[24px] py-[12px] text-[15px] font-medium text-[#FFFFFF]"
            >
              {user ? '학교 인증 페이지로 이동' : '로그인하러 가기'}
            </button>
          </div>
        </main>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorText('제목을 입력해 주세요.');
      return;
    }
    if (!content.trim()) {
      setErrorText('소개 내용을 입력해 주세요.');
      return;
    }
    if (!agreePostRules) {
      setErrorText('모집글 작성 수칙 및 개인정보 보호 동의 항목에 체크해 주세요.');
      return;
    }
    if (submitting) return;
    setErrorText(null);
    setSubmitting(true);
    try {
      await onCreatePost({
        tab,
        title,
        format,
        date: selectedDate === '전체' ? '일정 협의' : selectedDate,
        location: selectedRegion === '전체' ? '지역 협의' : selectedRegion,
        targetUniversity: selectedUniversity,
        content,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col bg-[#FFFFFF]">
      <main className="flex flex-col items-center self-stretch px-5 py-[56px] md:px-12 xl:px-[120px]">
        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-[720px] flex-col items-stretch gap-[28px]"
        >
          <div className="flex flex-col gap-[8px] self-stretch">
            <h1 className="m-0 text-[32px] font-bold leading-[1.45] text-[#0D050A]">모집글 작성</h1>
            <p className="m-0 text-[16px] font-normal leading-[1.45] text-[#4A3842]">
              원하는 조건을 적어 두면, 조건에 맞는 팀이 신청해요.
            </p>
          </div>

          <div className="flex flex-col gap-[10px] self-stretch">
            <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">글 종류</label>
            <div className="flex flex-row gap-[8px]">
              {(
                [
                  { id: 'meeting', label: '미팅 모집' },
                  { id: 'teammate', label: '팀원 구인' },
                ] as const
              ).map((chip) =>
                tab === chip.id ? (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setTab(chip.id)}
                    className="flex cursor-pointer flex-row items-center rounded-[999px] border border-[#F7C1D4] bg-[#F7C1D4] px-[14px] py-[6px]"
                  >
                    <span className="text-[14px] font-bold text-[#0D050A]">{chip.label}</span>
                  </button>
                ) : (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setTab(chip.id)}
                    className="flex cursor-pointer flex-row items-center rounded-[999px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[6px]"
                  >
                    <span className="text-[14px] font-normal text-[#4A3842]">{chip.label}</span>
                  </button>
                )
              )}
            </div>
          </div>

          <div className="flex flex-col gap-[10px] self-stretch">
            <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">제목</label>
            <div className="flex h-[44px] flex-row items-center gap-[8px] self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[0px]">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="모집글 제목을 입력해 주세요"
                className="w-full border-0 bg-transparent p-0 text-[14px] font-normal text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-[10px] self-stretch">
            <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">인원</label>
            <div className="flex flex-row gap-[8px]">
              {FORMAT_OPTIONS.map((opt) =>
                format === opt ? (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setFormat(opt)}
                    className="flex cursor-pointer flex-row items-center rounded-[999px] border border-[#F7C1D4] bg-[#F7C1D4] px-[14px] py-[6px]"
                  >
                    <span className="text-[14px] font-bold text-[#0D050A]">{opt}</span>
                  </button>
                ) : (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setFormat(opt)}
                    className="flex cursor-pointer flex-row items-center rounded-[999px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[6px]"
                  >
                    <span className="text-[14px] font-normal text-[#4A3842]">{opt}</span>
                  </button>
                )
              )}
            </div>
          </div>

          <div className="flex flex-col gap-[16px] self-stretch sm:flex-row">
            <div className="flex flex-1 flex-col gap-[10px]">
              <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">
                희망 날짜
              </label>
              <button
                type="button"
                onClick={() =>
                  onOpenOverlay({
                    id: 'select-date',
                    initialValue: selectedDate,
                    allowCustomDate: true,
                    onApply: setSelectedDate,
                  })
                }
                className="flex h-[44px] cursor-pointer flex-row items-center justify-between self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[0px]"
              >
                <span className="text-[14px] font-normal text-[#4A3842]">{selectedDate}</span>
                <ChevronDownIcon />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-[10px]">
              <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">
                희망 지역
              </label>
              <button
                type="button"
                onClick={() =>
                  onOpenOverlay({
                    id: 'select-region',
                    initialValue: selectedRegion,
                    onApply: setSelectedRegion,
                  })
                }
                className="flex h-[44px] cursor-pointer flex-row items-center justify-between self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[0px]"
              >
                <span className="text-[14px] font-normal text-[#4A3842]">{selectedRegion}</span>
                <ChevronDownIcon />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-[10px] self-stretch">
            <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">
              원하는 상대 대학
            </label>
            <button
              type="button"
              onClick={() =>
                onOpenOverlay({
                  id: 'select-university',
                  initialValue: selectedUniversity,
                  allowAnyUniversity: true,
                  onApply: setSelectedUniversity,
                })
              }
              className="flex h-[44px] cursor-pointer flex-row items-center justify-between self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[0px]"
            >
              <span className="text-[14px] font-normal text-[#4A3842]">{selectedUniversity}</span>
              <ChevronDownIcon />
            </button>
          </div>

          <div className="flex flex-col gap-[10px] self-stretch">
            <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">소개</label>
            <textarea
              value={content}
              maxLength={500}
              onChange={(e) => setContent(e.target.value)}
              placeholder="팀 소개, 원하는 분위기 등을 자유롭게 적어 주세요."
              className="h-[160px] w-full resize-none self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] p-[14px] text-[14px] font-normal leading-[1.45] text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
            />
            <div className="flex flex-row justify-end self-stretch">
              <span className="text-[13px] font-normal leading-[1.45] text-[#6E5464]">
                {`${content.length} / 500`}
              </span>
            </div>
          </div>

          {errorText && (
            <span className="text-[13px] font-medium text-[#B42318]">{errorText}</span>
          )}

          <div className="flex flex-col gap-[10px] self-stretch rounded-[8px] bg-[#F7D8E4] px-[16px] py-[14px]">
            <span className="text-[13px] font-normal leading-[1.45] text-[#4A3842]">
              학교 인증을 마친 사용자만 글을 쓰고 신청할 수 있어요.
            </span>
            <label className="flex cursor-pointer flex-row items-start gap-[8px] border-t border-[#D8B4C4] pt-[10px] text-[13px] text-[#0D050A]">
              <input
                type="checkbox"
                checked={agreePostRules}
                onChange={(e) => {
                  setAgreePostRules(e.target.checked);
                  setErrorText(null);
                }}
                className="mt-[2px] h-[16px] w-[16px] shrink-0 accent-[#0D050A]"
              />
              <span>
                <strong>[필수]</strong> 실명·연락처 등 개인정보 무단 기재 및 허위·광고성 게시물이 아님을 확인하고 동의합니다.
              </span>
            </label>
          </div>

          <div className="flex flex-row justify-end gap-[12px] self-stretch">
            <button
              type="button"
              onClick={() => onNavigate('board')}
              className="flex cursor-pointer flex-row items-center justify-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[20px] py-[12px]"
            >
              <span className="text-[15px] font-medium text-[#0D050A]">취소</span>
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex cursor-pointer flex-row items-center justify-center rounded-[8px] border-0 bg-[#0D050A] px-[20px] py-[12px] disabled:opacity-60"
            >
              <span className="text-[15px] font-medium text-[#FFFFFF]">
                {submitting ? '등록 중...' : '등록하기'}
              </span>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function BoardListPage({
  posts,
  activeTab,
  onChangeTab,
  onSelectPost,
  onRequestWritePost,
  onShowToast,
  onOpenOverlay,
}: {
  posts: BoardPost[];
  activeTab: BoardTabType;
  onChangeTab: (tab: BoardTabType) => void;
  onSelectPost: (postId: string) => void;
  onRequestWritePost: () => void;
  onShowToast: (toastId: ToastId, customMessage?: string) => void;
  onOpenOverlay: (overlay: ActiveOverlayState) => void;
}) {
  const [regionFilter, setRegionFilter] = useState<string>('전체');
  const [headcountFilter, setHeadcountFilter] = useState<string>('전체');
  const [dateFilter, setDateFilter] = useState<string>('전체');
  const [onlyRecruiting, setOnlyRecruiting] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pageNumber, setPageNumber] = useState<number>(1);

  const isMeetingTab = activeTab === 'meeting';
  const tabPostsCount = useMemo(
    () => posts.filter((p) => p.tab === activeTab).length,
    [posts, activeTab]
  );

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return posts.filter((post) => {
      if (post.tab !== activeTab) return false;
      if (onlyRecruiting && post.status !== '모집 중') return false;
      if (!matchesRegionFilter(post.location, regionFilter)) return false;
      if (headcountFilter !== '전체' && post.format !== headcountFilter) return false;
      if (!matchesDateFilter(post.date, dateFilter)) return false;
      if (q) {
        const hay = `${post.title} ${post.university} ${post.location}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [posts, activeTab, onlyRecruiting, regionFilter, headcountFilter, dateFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / POSTS_PER_PAGE));
  const safePage = Math.min(pageNumber, totalPages);
  const visiblePosts = filteredPosts.slice(
    (safePage - 1) * POSTS_PER_PAGE,
    safePage * POSTS_PER_PAGE
  );
  const paginationItems = buildPaginationItems(safePage, totalPages);

  const boardFilterItems: { label: string; onClick: () => void }[] = [
    {
      label: `지역: ${regionFilter}`,
      onClick: () =>
        onOpenOverlay({
          id: 'select-region',
          initialValue: regionFilter,
          onApply: (val) => {
            setRegionFilter(val);
            setPageNumber(1);
          },
        }),
    },
    {
      label: `인원: ${headcountFilter}`,
      onClick: () =>
        onOpenOverlay({
          id: 'select-headcount',
          initialValue: headcountFilter,
          onApply: (val) => {
            setHeadcountFilter(val);
            setPageNumber(1);
          },
        }),
    },
    {
      label: `날짜: ${dateFilter}`,
      onClick: () =>
        onOpenOverlay({
          id: 'select-date',
          initialValue: dateFilter,
          onApply: (val) => {
            setDateFilter(val);
            setPageNumber(1);
          },
        }),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col bg-[#FFFFFF]">
      <main className="flex flex-col items-stretch gap-[24px] self-stretch px-5 py-[48px] md:px-12 xl:px-[120px]">
        <div className="flex flex-row items-center justify-between self-stretch">
          <div className="flex flex-col gap-[8px]">
            <h1 className="m-0 text-[32px] font-bold leading-[1.45] text-[#0D050A]">게시판</h1>
            <p className="m-0 text-[16px] font-normal leading-[1.45] text-[#4A3842]">
              원하는 조건으로 직접 미팅을 모집하거나, 모자란 팀원을 구해 보세요.
            </p>
          </div>

          <button
            type="button"
            onClick={onRequestWritePost}
            className="flex shrink-0 cursor-pointer flex-row items-center justify-center rounded-[8px] border-0 bg-[#0D050A] px-[20px] py-[12px]"
          >
            <span className="text-[15px] font-medium text-[#FFFFFF]">글쓰기</span>
          </button>
        </div>

        <div className="flex flex-row self-stretch shadow-[inset_0_-1px_0_0_#EBCDD9]">
          <button
            type="button"
            onClick={() => {
              onChangeTab('meeting');
              setPageNumber(1);
            }}
            className={`flex cursor-pointer flex-row border-0 bg-transparent px-[20px] py-[14px] ${
              isMeetingTab ? 'shadow-[inset_0_-2px_0_0_#0D050A]' : ''
            }`}
          >
            <span
              className={
                isMeetingTab
                  ? 'text-[16px] font-bold leading-[1.45] text-[#0D050A]'
                  : 'text-[16px] font-medium leading-[1.45] text-[#6E5464]'
              }
            >
              미팅 모집
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onChangeTab('teammate');
              setPageNumber(1);
            }}
            className={`flex cursor-pointer flex-row border-0 bg-transparent px-[20px] py-[14px] ${
              !isMeetingTab ? 'shadow-[inset_0_-2px_0_0_#0D050A]' : ''
            }`}
          >
            <span
              className={
                !isMeetingTab
                  ? 'text-[16px] font-bold leading-[1.45] text-[#0D050A]'
                  : 'text-[16px] font-medium leading-[1.45] text-[#6E5464]'
              }
            >
              팀원 구인
            </span>
          </button>
        </div>

        <div className="flex flex-col gap-3 self-stretch lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-row flex-wrap gap-[12px]">
            {boardFilterItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className="flex h-[44px] w-[160px] cursor-pointer flex-row items-center justify-between rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[0px]"
              >
                <span className="truncate text-[14px] font-normal text-[#4A3842]">
                  {item.label}
                </span>
                <ChevronDownIcon />
              </button>
            ))}
          </div>

          <div className="flex flex-row flex-wrap items-center gap-[12px]">
            <button
              type="button"
              onClick={() => {
                setOnlyRecruiting((prev) => !prev);
                setPageNumber(1);
              }}
              className={`flex cursor-pointer flex-row items-center rounded-[999px] border px-[14px] py-[6px] ${
                onlyRecruiting
                  ? 'border-[#F7C1D4] bg-[#F7C1D4]'
                  : 'border-[#D8B4C4] bg-[#FFFFFF]'
              }`}
            >
              <span
                className={
                  onlyRecruiting
                    ? 'text-[14px] font-bold text-[#0D050A]'
                    : 'text-[14px] font-normal text-[#4A3842]'
                }
              >
                모집 중만 보기
              </span>
            </button>

            <div className="flex h-[44px] w-full flex-row items-center gap-[8px] rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[0px] sm:w-[300px]">
              <SearchIcon />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPageNumber(1);
                }}
                placeholder="제목, 학교 검색"
                className="w-full border-0 bg-transparent p-0 text-[14px] font-normal text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col items-stretch self-stretch border-t border-[#0D050A]">
          {visiblePosts.length > 0 ? (
            visiblePosts.map((post) => (
              <PostRowItemView
                key={post.id}
                post={post}
                onSelect={() => onSelectPost(post.id)}
              />
            ))
          ) : tabPostsCount === 0 ? (
            <div className="flex flex-col items-center gap-[12px] border-b border-[#EBCDD9] py-[64px]">
              <span className="text-[16px] font-medium text-[#0D050A]">
                아직 등록된 모집글이 없어요
              </span>
              <span className="text-[14px] text-[#6E5464]">
                첫 번째 모집글을 올리고 다른 대학 팀과 연결돼 보세요!
              </span>
              <button
                type="button"
                onClick={onRequestWritePost}
                className="mt-1 cursor-pointer rounded-[8px] border-0 bg-[#0D050A] px-[20px] py-[10px] text-[14px] font-medium text-[#FFFFFF]"
              >
                첫 모집글 작성하기
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-[12px] border-b border-[#EBCDD9] py-[56px]">
              <span className="text-[15px] text-[#6E5464]">
                선택한 필터 조건에 맞는 게시글이 없어요.
              </span>
              <button
                type="button"
                onClick={() => {
                  setRegionFilter('전체');
                  setHeadcountFilter('전체');
                  setDateFilter('전체');
                  setOnlyRecruiting(false);
                  setSearchQuery('');
                  setPageNumber(1);
                }}
                className="cursor-pointer rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[16px] py-[8px] text-[14px] font-medium text-[#0D050A]"
              >
                필터 초기화
              </button>
            </div>
          )}
        </div>

        {filteredPosts.length > 0 && (
          <div className="flex flex-row justify-center gap-[8px] self-stretch">
            {paginationItems.map((page) => (
              <PaginationButton
                key={page.id}
                item={page}
                onClick={() => {
                  if (page.label === '>') {
                    if (safePage >= totalPages) {
                      onShowToast('last-page');
                    } else {
                      setPageNumber(safePage + 1);
                    }
                  } else {
                    setPageNumber(Number(page.label));
                  }
                }}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

const MAP_REGION_CHIPS: { id: 'all' | 'recruiting' | SidoGroup; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'recruiting', label: '모집 방 있음' },
  { id: '서울', label: '서울' },
  { id: '경기·인천', label: '경기·인천' },
  { id: '충청·대전·세종', label: '대전·충청' },
  { id: '경상·부산·대구·울산', label: '부산·대구·경상' },
  { id: '전라·광주', label: '광주·전라' },
  { id: '강원', label: '강원' },
  { id: '제주', label: '제주' },
];

function MapPage({
  rooms,
  user,
  initialSelectedUnivId,
  onConsumeInitialSelectedUnivId,
  onViewUniversityRooms,
  onShowToast,
}: {
  rooms: MeetingRoom[];
  user: UserProfile | null;
  initialSelectedUnivId: string | null;
  onConsumeInitialSelectedUnivId: () => void;
  onViewUniversityRooms: (universityName: string) => void;
  onShowToast: (toastId: ToastId, customMessage?: string) => void;
}) {
  const defaultUniv = useMemo(() => {
    if (user?.university) {
      const matched = UNIVERSITIES_GEO.find((u) => u.name === user.university);
      if (matched) return matched;
    }
    return DEFAULT_FOCUS_UNIV;
  }, [user]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'recruiting' | SidoGroup>('all');
  const [selectedUnivId, setSelectedUnivId] = useState<string>(
    initialSelectedUnivId ?? defaultUniv.id
  );
  const [isInfoCardOpen, setIsInfoCardOpen] = useState<boolean>(true);
  const [zoomLevel, setZoomLevel] = useState<number>(MAP_DEFAULT_ZOOM);

  useEffect(() => {
    if (initialSelectedUnivId) {
      setSelectedUnivId(initialSelectedUnivId);
      setIsInfoCardOpen(true);
      onConsumeInitialSelectedUnivId();
    }
  }, [initialSelectedUnivId, onConsumeInitialSelectedUnivId]);

  const { recruitingCountByUniv, matchedCountByUniv } = useMemo(() => {
    const recruiting: Record<string, number> = {};
    const matched: Record<string, number> = {};

    rooms.forEach((room) => {
      const names = [room.leftUniversity.name, room.rightUniversity.name];
      names.forEach((name) => {
        if (room.status === '모집 중') {
          recruiting[name] = (recruiting[name] ?? 0) + 1;
        } else {
          matched[name] = (matched[name] ?? 0) + 1;
        }
      });
    });

    return { recruitingCountByUniv: recruiting, matchedCountByUniv: matched };
  }, [rooms]);

  const filteredUniversities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return UNIVERSITIES_GEO.filter((univ) => {
      if (filterMode === 'recruiting' && (recruitingCountByUniv[univ.name] ?? 0) === 0) {
        return false;
      }
      if (
        filterMode !== 'all' &&
        filterMode !== 'recruiting' &&
        univ.sidoGroup !== filterMode
      ) {
        return false;
      }
      if (q) {
        const hay = `${univ.name} ${univ.shortName} ${univ.region} ${univ.address}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [searchQuery, filterMode, recruitingCountByUniv]);

  // 권역·검색 필터 변경 시 선택 대학과 지도 마커/정보 카드가 어긋나지 않도록 자동 동기화
  useEffect(() => {
    if (
      filteredUniversities.length > 0 &&
      !filteredUniversities.some((u) => u.id === selectedUnivId)
    ) {
      setSelectedUnivId(filteredUniversities[0].id);
    }
  }, [filteredUniversities, selectedUnivId]);

  const selectedUniversity =
    UNIVERSITIES_GEO.find((u) => u.id === selectedUnivId) ?? defaultUniv;

  const handleSelectUniversity = useCallback((univId: string) => {
    setSelectedUnivId(univId);
    setIsInfoCardOpen(true);
    setZoomLevel((prev) => Math.max(prev, 14));
  }, []);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1440px] flex-1 flex-col overflow-hidden bg-[#FFFFFF]">
      <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden self-stretch lg:flex-row">
        <aside className="flex h-[280px] min-h-0 w-full shrink-0 flex-col gap-[14px] overflow-hidden border-b border-[#EBCDD9] bg-[#FFFFFF] p-[24px] lg:h-full lg:w-[400px] lg:border-b-0 lg:border-r">
          <h1 className="m-0 shrink-0 text-[22px] font-bold leading-[1.45] text-[#0D050A]">
            전국 대학 지도
          </h1>

          <div className="flex h-[44px] shrink-0 flex-row items-center gap-[8px] self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[0px]">
            <SearchIcon />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="전국 453개 대학·지역 검색"
              className="w-full border-0 bg-transparent p-0 text-[14px] font-normal text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
            />
          </div>

          <div className="flex shrink-0 flex-row flex-wrap gap-[6px]">
            {MAP_REGION_CHIPS.map((chip) =>
              filterMode === chip.id ? (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setFilterMode(chip.id)}
                  className="flex cursor-pointer flex-row items-center rounded-[999px] border border-[#F7C1D4] bg-[#F7C1D4] px-[12px] py-[5px]"
                >
                  <span className="text-[13px] font-bold text-[#0D050A]">{chip.label}</span>
                </button>
              ) : (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setFilterMode(chip.id)}
                  className="flex cursor-pointer flex-row items-center rounded-[999px] border border-[#D8B4C4] bg-[#FFFFFF] px-[12px] py-[5px]"
                >
                  <span className="text-[13px] font-normal text-[#4A3842]">{chip.label}</span>
                </button>
              )
            )}
          </div>

          <span className="shrink-0 text-[13px] font-normal leading-[1.45] text-[#6E5464]">
            {`검색 결과 ${filteredUniversities.length}개교`}
          </span>

          <div className="flex min-h-0 flex-1 flex-col items-stretch gap-[4px] self-stretch overflow-y-auto overscroll-contain pr-[4px]">
            {filteredUniversities.map((univ) => {
              const count = recruitingCountByUniv[univ.name] ?? 0;
              const isSelected = univ.id === selectedUniversity.id;
              return (
                <button
                  key={univ.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => handleSelectUniversity(univ.id)}
                  className={`flex shrink-0 cursor-pointer flex-col gap-[4px] self-stretch rounded-[8px] p-[12px] text-left ${
                    isSelected
                      ? 'border border-[#0D050A] bg-[#F7D8E4]'
                      : 'border border-transparent bg-transparent'
                  }`}
                >
                  <span className="text-[15px] font-medium leading-[1.45] text-[#0D050A]">
                    {univ.name}
                  </span>
                  <span className="text-[13px] font-normal leading-[1.45] text-[#6E5464]">
                    {`${univ.region} · 모집 중인 방 ${count}개`}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="relative h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-[#FBEBF1]">
          <NaverUniversityMap
            universities={filteredUniversities.length > 0 ? filteredUniversities : UNIVERSITIES_GEO}
            recruitingCountByUniv={recruitingCountByUniv}
            selectedUniversityId={selectedUniversity.id}
            zoomLevel={zoomLevel}
            onSelectUniversity={handleSelectUniversity}
            onZoomChange={setZoomLevel}
          />

          {isInfoCardOpen && (
            <div className="absolute right-[24px] top-[24px] z-10 flex w-[320px] max-w-[calc(100%-48px)] flex-col gap-[14px] rounded-[12px] border border-[#D8B4C4] bg-[#FFFFFF] p-[20px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.08)] sm:w-[340px]">
              <div className="flex flex-row items-start justify-between gap-2 self-stretch">
                <span className="text-[19px] font-bold leading-[1.45] text-[#0D050A]">
                  {selectedUniversity.name}
                </span>
                <button
                  type="button"
                  onClick={() => setIsInfoCardOpen(false)}
                  className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[13px] font-normal leading-[1.45] text-[#6E5464]"
                >
                  닫기
                </button>
              </div>

              <span className="text-[14px] font-normal leading-[1.45] text-[#4A3842]">
                {selectedUniversity.address}
              </span>

              <div className="flex flex-row gap-[24px] self-stretch rounded-[8px] bg-[#F7D8E4] px-[14px] py-[12px]">
                <div className="flex flex-col gap-[2px]">
                  <span className="text-[12px] font-normal leading-[1.45] text-[#6E5464]">
                    모집 중인 방
                  </span>
                  <span className="text-[16px] font-bold leading-[1.45] text-[#0D050A]">
                    {`${recruitingCountByUniv[selectedUniversity.name] ?? 0}개`}
                  </span>
                </div>
                <div className="flex flex-col gap-[2px]">
                  <span className="text-[12px] font-normal leading-[1.45] text-[#6E5464]">
                    성사 완료
                  </span>
                  <span className="text-[16px] font-bold leading-[1.45] text-[#0D050A]">
                    {`${matchedCountByUniv[selectedUniversity.name] ?? 0}건`}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onViewUniversityRooms(selectedUniversity.name)}
                className="flex cursor-pointer flex-row items-center justify-center self-stretch rounded-[8px] border-0 bg-[#0D050A] px-[20px] py-[12px]"
              >
                <span className="text-[15px] font-medium text-[#FFFFFF]">이 대학 방 보기</span>
              </button>
            </div>
          )}

          <div
            style={{ right: 24, bottom: 24 }}
            className="absolute z-10 flex flex-col rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF]"
          >
            <button
              type="button"
              aria-label="지도 확대"
              onClick={() => {
                if (zoomLevel >= MAP_MAX_ZOOM) {
                  onShowToast('max-zoom');
                } else {
                  setZoomLevel((prev) => Math.min(MAP_MAX_ZOOM, prev + 1));
                }
              }}
              className="flex h-[40px] w-[40px] cursor-pointer flex-row items-center justify-center border-0 bg-transparent p-0"
            >
              <span aria-hidden="true" className="text-[18px] font-medium leading-[1.45] text-[#4A3842]">
                +
              </span>
            </button>
            <button
              type="button"
              aria-label="지도 축소"
              onClick={() => {
                if (zoomLevel <= MAP_MIN_ZOOM) {
                  onShowToast('min-zoom');
                } else {
                  setZoomLevel((prev) => Math.max(MAP_MIN_ZOOM, prev - 1));
                }
              }}
              className="flex h-[40px] w-[40px] cursor-pointer flex-row items-center justify-center border-0 bg-transparent p-0"
            >
              <span aria-hidden="true" className="text-[18px] font-medium leading-[1.45] text-[#4A3842]">
                −
              </span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function RoomDetailPage({
  room,
  user,
  isAdmin,
  onToggleJoin,
  onDeleteRoom,
  onNavigate,
  onShowToast,
  onOpenOverlay,
}: {
  room: MeetingRoom | undefined;
  user: UserProfile | null;
  isAdmin: boolean;
  onToggleJoin: (room: MeetingRoom) => void;
  onDeleteRoom: (roomId: string) => void;
  onNavigate: (page: PageId) => void;
  onShowToast: (toastId: ToastId, customMessage?: string) => void;
  onOpenOverlay: (overlay: ActiveOverlayState) => void;
}) {
  if (!room) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-[1440px] flex-col bg-[#FFFFFF]">
        <main className="flex flex-1 flex-col items-center justify-center gap-[16px] px-5 py-[80px]">
          <p className="m-0 text-[16px] text-[#4A3842]">
            존재하지 않거나 삭제된 미팅 방이에요.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('rooms')}
            className="cursor-pointer rounded-[8px] border-0 bg-[#0D050A] px-[20px] py-[12px] text-[15px] font-medium text-[#FFFFFF]"
          >
            방 목록으로 돌아가기
          </button>
        </main>
      </div>
    );
  }

  const maxPerTeam = getMaxMembersPerTeam(room.format);
  const isLeftMine = Boolean(user && room.leftUniversity.name === user.university);
  const isRightMine = Boolean(user && room.rightUniversity.name === user.university);
  const myTeamSide = isLeftMine ? 'left' : isRightMine ? 'right' : null;
  const myTeamMembers =
    myTeamSide === 'left'
      ? room.leftMembers
      : myTeamSide === 'right'
        ? room.rightMembers
        : [];
  const alreadyJoined = Boolean(user && myTeamMembers.some((m) => m.uid === user.uid));
  const isHost = Boolean(user && room.hostUid === user.uid);
  const canDelete = isHost || isAdmin;
  const remainingMySlots = myTeamSide ? Math.max(0, maxPerTeam - myTeamMembers.length) : 0;
  const myShortName = user ? getShortUniversityName(user.university) : '';

  const teamCards = [
    {
      id: 'left-team',
      universityName: room.leftUniversity.name,
      countText: `${room.leftMembers.length} / ${maxPerTeam}`,
      gender: room.leftUniversity.gender,
      members: room.leftMembers,
      emptySlotsCount: Math.max(0, maxPerTeam - room.leftMembers.length),
    },
    {
      id: 'right-team',
      universityName: room.rightUniversity.name,
      countText: `${room.rightMembers.length} / ${maxPerTeam}`,
      gender: room.rightUniversity.gender,
      members: room.rightMembers,
      emptySlotsCount: Math.max(0, maxPerTeam - room.rightMembers.length),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col bg-[#FFFFFF]">
      <main className="flex flex-col gap-[24px] self-stretch px-5 py-[40px] md:px-12 xl:px-[120px]">
        <button
          type="button"
          onClick={() => onNavigate('rooms')}
          className="w-fit cursor-pointer border-0 bg-transparent p-0 text-left whitespace-pre text-[14px] font-normal leading-[1.45] text-[#6E5464] hover:underline"
        >
          {`미팅 방   >   ${room.leftUniversity.shortName} × ${room.rightUniversity.shortName} ${room.format}`}
        </button>

        <div className="flex flex-col items-start gap-[32px] self-stretch lg:flex-row">
          <div className="flex w-full flex-1 flex-col items-stretch gap-[36px]">
            <section className="flex flex-col gap-[12px] self-stretch">
              <div className="flex flex-row items-center gap-[10px]">
                <div className="flex flex-row items-center rounded-[999px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[6px]">
                  <span className="text-[14px] font-normal text-[#4A3842]">{room.format}</span>
                </div>
                <span className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">
                  {room.status}
                </span>
              </div>

              <h1 className="m-0 text-[28px] font-bold leading-[1.45] text-[#0D050A] sm:text-[32px]">
                {room.title}
              </h1>

              <p className="m-0 whitespace-pre-wrap text-[15px] font-normal leading-[1.45] text-[#4A3842] sm:text-[16px]">
                {`${room.schedule}  ·  ${room.location}  ·  방장 ${room.hostDepartment}`}
              </p>
            </section>

            <section className="flex flex-col gap-[8px] self-stretch rounded-[12px] bg-[#F7D8E4] p-[24px]">
              <h2 className="m-0 text-[16px] font-bold leading-[1.45] text-[#0D050A]">방 소개</h2>
              <p className="m-0 self-stretch whitespace-pre-line text-[15px] font-normal leading-[1.45] text-[#4A3842]">
                {room.intro}
              </p>
            </section>

            <section className="flex flex-col gap-[16px] self-stretch">
              <h2 className="m-0 text-[20px] font-bold leading-[1.45] text-[#0D050A]">팀 구성</h2>
              <p className="m-0 text-[14px] font-normal leading-[1.45] text-[#6E5464]">
                양쪽 자리가 모두 차면 미팅이 성사돼요.
              </p>

              <div className="flex flex-col items-stretch gap-[20px] self-stretch sm:flex-row sm:items-start">
                {teamCards.map((team) => {
                  const isOtherUniversity = Boolean(
                    user && team.universityName !== user.university
                  );
                  return (
                    <div
                      key={team.id}
                      className="flex flex-1 flex-col items-stretch gap-[12px] rounded-[12px] border border-[#EBCDD9] p-[20px]"
                    >
                      <div className="flex flex-row items-center justify-between gap-2 self-stretch">
                        <span className="text-[18px] font-bold leading-[1.45] text-[#0D050A]">
                          {team.universityName}
                        </span>
                        <span className="shrink-0 text-[16px] font-medium leading-[1.45] text-[#4A3842]">
                          {team.countText}
                        </span>
                      </div>

                      {team.members.map((member) => (
                        <div
                          key={member.id}
                          className="flex flex-row items-center gap-[12px] self-stretch"
                        >
                          <div
                            className={`h-[40px] w-[40px] shrink-0 rounded-full ${
                              member.gender === '남' ? 'bg-[#ABD2FA]' : 'bg-[#F7C1D4]'
                            }`}
                          />
                          <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                            <span className="truncate text-[15px] font-medium leading-[1.45] text-[#0D050A]">
                              {member.departmentAndYear}
                            </span>
                            <span className="text-[13px] font-normal leading-[1.45] text-[#6E5464]">
                              {user && member.uid === user.uid
                                ? `${member.role} (나)`
                                : member.role}
                            </span>
                          </div>
                          <GenderTag gender={member.gender} />
                        </div>
                      ))}

                      {Array.from({ length: team.emptySlotsCount }).map((_, idx) => (
                        <button
                          key={`${team.id}-empty-${idx}`}
                          type="button"
                          onClick={() => {
                            if (!user || !isStudentVerified(user)) {
                              onToggleJoin(room);
                              return;
                            }
                            if (isOtherUniversity) {
                              onShowToast(
                                'other-univ-slot',
                                `이 자리는 ${team.universityName} 인증 사용자만 신청할 수 있어요`
                              );
                            } else if (!alreadyJoined) {
                              onToggleJoin(room);
                            }
                          }}
                          className="flex h-[40px] cursor-pointer flex-row items-center justify-center self-stretch rounded-[8px] border border-dashed border-[#D8B4C4] bg-transparent px-[12px] py-[10px]"
                        >
                          <span className="text-[14px] font-normal leading-[1.45] text-[#6E5464]">
                            {`빈 자리 · ${team.gender}`}
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="flex w-full shrink-0 flex-col gap-[16px] rounded-[12px] border border-[#EBCDD9] bg-[#FFFFFF] p-[24px] lg:w-[396px]">
            <h2 className="m-0 text-[20px] font-bold leading-[1.45] text-[#0D050A]">참여하기</h2>

            <div className="flex flex-col gap-[4px] self-stretch rounded-[8px] bg-[#F7D8E4] p-[16px]">
              <span className="text-[13px] font-normal leading-[1.45] text-[#6E5464]">내 소속</span>
              <span className="text-[15px] font-medium leading-[1.45] text-[#0D050A]">
                {!user
                  ? '로그인 후 참여 가능'
                  : isStudentVerified(user)
                    ? `${user.university} · 재학생 인증 완료`
                    : user.verificationStatus === 'pending'
                      ? `${user.university} · 인증 승인 대기 중`
                      : `${user.university} · 학교 인증 필요`}
              </span>
            </div>

            <span className="text-[16px] font-bold leading-[1.45] text-[#0D050A]">
              {!user
                ? '로그인 및 학교 인증 후 신청할 수 있어요'
                : !isStudentVerified(user)
                  ? '학교 인증 승인을 마치면 신청할 수 있어요'
                  : !myTeamSide
                    ? `${room.leftUniversity.shortName} · ${room.rightUniversity.shortName} 전용 방이에요`
                    : isHost
                      ? '내가 방장으로 참여 중이에요'
                      : alreadyJoined
                        ? `${myShortName} 팀으로 참여 중이에요`
                        : remainingMySlots > 0
                          ? `${myShortName} 자리 ${remainingMySlots}개 남음`
                          : `${myShortName} 자리가 모두 찼어요`}
            </span>

            <button
              type="button"
              disabled={
                Boolean(
                  user &&
                    isStudentVerified(user) &&
                    (isHost || (!alreadyJoined && (!myTeamSide || remainingMySlots === 0)))
                )
              }
              onClick={() => onToggleJoin(room)}
              className={`flex cursor-pointer flex-row items-center justify-center self-stretch rounded-[8px] px-[20px] py-[12px] ${
                alreadyJoined && !isHost
                  ? 'border border-[#D8B4C4] bg-[#FFFFFF]'
                  : 'border-0 bg-[#0D050A] disabled:cursor-not-allowed disabled:opacity-50'
              }`}
            >
              <span
                className={`text-[15px] font-medium ${
                  alreadyJoined && !isHost ? 'text-[#0D050A]' : 'text-[#FFFFFF]'
                }`}
              >
                {!user
                  ? '로그인하고 참여 신청'
                  : !isStudentVerified(user)
                    ? '학교 인증하고 참여 신청'
                    : isHost
                      ? '방장으로 참여 중'
                      : alreadyJoined
                        ? '참여 신청 취소'
                        : myTeamSide
                          ? `${myShortName} 팀으로 참여 신청`
                          : '내 대학이 포함된 방만 신청 가능'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                const shareUrl = buildShareUrl({
                  page: 'room-detail',
                  room: room.id,
                });
                navigator.clipboard?.writeText(shareUrl).catch(() => {});
                onShowToast('copy-link');
              }}
              className="flex cursor-pointer flex-row items-center justify-center self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[20px] py-[12px]"
            >
              <span className="text-[15px] font-medium text-[#0D050A]">링크 공유하기</span>
            </button>

            {canDelete && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('이 미팅 방을 삭제할까요? 삭제하면 복구할 수 없어요.')) {
                    onDeleteRoom(room.id);
                  }
                }}
                className="flex cursor-pointer flex-row items-center justify-center self-stretch rounded-[8px] border border-[#F5C2C7] bg-[#FFF5F5] px-[20px] py-[11px]"
              >
                <span className="text-[14px] font-medium text-[#B42318]">미팅 방 삭제하기</span>
              </button>
            )}

            <p className="m-0 self-stretch text-[13px] font-normal leading-[1.45] text-[#6E5464]">
              학교 인증(학번·재학증명서 승인)을 완료한 해당 대학 학생만 자리에 참여할 수 있어요.
            </p>

            <a
              href="#report"
              onClick={(e) => {
                e.preventDefault();
                onOpenOverlay({
                  id: 'report',
                  reportTarget: { targetType: 'room', targetId: room.id },
                });
              }}
              className="w-fit text-[13px] font-medium leading-[1.45] text-[#6E5464] no-underline"
            >
              신고하기
            </a>
          </aside>
        </div>
      </main>
    </div>
  );
}

function MeetingRoomsPage({
  rooms,
  user,
  initialUniversityFilter,
  onConsumeInitialUniversityFilter,
  onSelectRoom,
  onRequestCreateRoom,
  onShowToast,
  onOpenOverlay,
}: {
  rooms: MeetingRoom[];
  user: UserProfile | null;
  initialUniversityFilter: string | null;
  onConsumeInitialUniversityFilter: () => void;
  onSelectRoom: (roomId: string) => void;
  onRequestCreateRoom: () => void;
  onShowToast: (toastId: ToastId, customMessage?: string) => void;
  onOpenOverlay: (overlay: ActiveOverlayState) => void;
}) {
  const [scopeTab, setScopeTab] = useState<'all' | 'my-univ' | 'recruiting'>('all');
  const [regionFilter, setRegionFilter] = useState<string>('전체');
  const [headcountFilter, setHeadcountFilter] = useState<string>('전체');
  const [dateFilter, setDateFilter] = useState<string>('전체');
  const [universityFilter, setUniversityFilter] = useState<string>('전체');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pageNumber, setPageNumber] = useState<number>(1);

  useEffect(() => {
    if (initialUniversityFilter) {
      setUniversityFilter(initialUniversityFilter);
      setPageNumber(1);
      onConsumeInitialUniversityFilter();
    }
  }, [initialUniversityFilter, onConsumeInitialUniversityFilter]);

  const filteredRooms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rooms.filter((room) => {
      if (scopeTab === 'my-univ') {
        if (!user) return false;
        if (
          room.leftUniversity.name !== user.university &&
          room.rightUniversity.name !== user.university
        ) {
          return false;
        }
      }
      if (scopeTab === 'recruiting' && room.status !== '모집 중') {
        return false;
      }
      if (!matchesRegionFilter(room.location, regionFilter)) return false;
      if (headcountFilter !== '전체' && room.format !== headcountFilter) return false;
      if (!matchesDateFilter(room.schedule, dateFilter)) return false;
      if (
        universityFilter !== '전체' &&
        room.leftUniversity.name !== universityFilter &&
        room.rightUniversity.name !== universityFilter
      ) {
        return false;
      }
      if (q) {
        const hay = `${room.title} ${room.leftUniversity.name} ${room.leftUniversity.shortName} ${room.rightUniversity.name} ${room.rightUniversity.shortName} ${room.location}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    rooms,
    scopeTab,
    user,
    regionFilter,
    headcountFilter,
    dateFilter,
    universityFilter,
    searchQuery,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredRooms.length / ROOMS_PER_PAGE));
  const safePage = Math.min(pageNumber, totalPages);
  const visibleRooms = filteredRooms.slice(
    (safePage - 1) * ROOMS_PER_PAGE,
    safePage * ROOMS_PER_PAGE
  );
  const paginationItems = buildPaginationItems(safePage, totalPages);

  const roomFilterItems: { label: string; onClick: () => void }[] = [
    {
      label: `지역: ${regionFilter}`,
      onClick: () =>
        onOpenOverlay({
          id: 'select-region',
          initialValue: regionFilter,
          onApply: (val) => {
            setRegionFilter(val);
            setPageNumber(1);
          },
        }),
    },
    {
      label: `인원: ${headcountFilter}`,
      onClick: () =>
        onOpenOverlay({
          id: 'select-headcount',
          initialValue: headcountFilter,
          onApply: (val) => {
            setHeadcountFilter(val);
            setPageNumber(1);
          },
        }),
    },
    {
      label: `날짜: ${dateFilter}`,
      onClick: () =>
        onOpenOverlay({
          id: 'select-date',
          initialValue: dateFilter,
          onApply: (val) => {
            setDateFilter(val);
            setPageNumber(1);
          },
        }),
    },
    {
      label: `상대 대학: ${universityFilter === '전체' ? '전체' : getShortUniversityName(universityFilter)}`,
      onClick: () =>
        onOpenOverlay({
          id: 'select-university',
          initialValue: universityFilter,
          allowAnyUniversity: true,
          onApply: (val) => {
            setUniversityFilter(val === '전체 (상관없음)' ? '전체' : val);
            setPageNumber(1);
          },
        }),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col bg-[#FFFFFF]">
      <main className="flex flex-col gap-[28px] self-stretch px-5 py-[48px] md:px-12 xl:px-[120px]">
        <div className="flex flex-row items-center justify-between self-stretch">
          <div className="flex flex-col gap-[8px]">
            <h1 className="m-0 text-[32px] font-bold leading-[1.45] text-[#0D050A]">미팅 방</h1>
            <p className="m-0 text-[16px] font-normal leading-[1.45] text-[#4A3842]">
              학교 인증을 마친 뒤 내 대학이 포함된 방에 참여하거나 새 방을 만들어 보세요.
            </p>
          </div>

          <button
            type="button"
            onClick={onRequestCreateRoom}
            className="flex shrink-0 cursor-pointer flex-row items-center justify-center rounded-[8px] border-0 bg-[#0D050A] px-[20px] py-[12px]"
          >
            <span className="text-[15px] font-medium text-[#FFFFFF]">+ 방 만들기</span>
          </button>
        </div>

        <div className="flex flex-row flex-wrap gap-[8px]">
          {(
            [
              { id: 'all', label: '전체 방' },
              { id: 'my-univ', label: '내 대학이 포함된 방' },
              { id: 'recruiting', label: '모집 중만' },
            ] as const
          ).map((tab) =>
            scopeTab === tab.id ? (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (tab.id === 'my-univ' && !user) {
                    onShowToast('auth-mail', '로그인하면 내 대학이 포함된 방만 모아볼 수 있어요');
                    return;
                  }
                  setScopeTab(tab.id);
                  setPageNumber(1);
                }}
                className="flex cursor-pointer flex-row items-center rounded-[999px] border border-[#F7C1D4] bg-[#F7C1D4] px-[14px] py-[6px]"
              >
                <span className="text-[14px] font-bold text-[#0D050A]">{tab.label}</span>
              </button>
            ) : (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (tab.id === 'my-univ' && !user) {
                    onShowToast('auth-mail', '로그인하면 내 대학이 포함된 방만 모아볼 수 있어요');
                    return;
                  }
                  setScopeTab(tab.id);
                  setPageNumber(1);
                }}
                className="flex cursor-pointer flex-row items-center rounded-[999px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[6px]"
              >
                <span className="text-[14px] font-normal text-[#4A3842]">{tab.label}</span>
              </button>
            )
          )}
        </div>

        <div className="flex flex-col gap-3 self-stretch lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-row flex-wrap gap-[12px]">
            {roomFilterItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className="flex h-[44px] w-[160px] cursor-pointer flex-row items-center justify-between rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[0px]"
              >
                <span className="truncate text-[14px] font-normal text-[#4A3842]">
                  {item.label}
                </span>
                <ChevronDownIcon />
              </button>
            ))}
          </div>

          <div className="flex h-[44px] w-full flex-row items-center gap-[8px] rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[0px] sm:w-[300px]">
            <SearchIcon />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPageNumber(1);
              }}
              placeholder="대학 이름으로 검색"
              className="w-full border-0 bg-transparent p-0 text-[14px] font-normal text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
            />
          </div>
        </div>

        {visibleRooms.length > 0 ? (
          <div className="flex flex-row flex-wrap gap-[24px] self-stretch">
            {visibleRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                onSelect={() => onSelectRoom(room.id)}
              />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <div className="flex flex-col items-center gap-[12px] py-[72px] text-center">
            <span className="text-[17px] font-bold text-[#0D050A]">
              아직 개설된 미팅 방이 없어요
            </span>
            <span className="text-[14px] text-[#4A3842]">
              우리 학교의 첫 번째 방장이 되어 원하는 상대 대학과 미팅 방을 열어 보세요!
            </span>
            <button
              type="button"
              onClick={onRequestCreateRoom}
              className="mt-1 cursor-pointer rounded-[8px] border-0 bg-[#0D050A] px-[22px] py-[11px] text-[14px] font-medium text-[#FFFFFF]"
            >
              + 첫 미팅 방 만들기
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-[12px] py-[72px] text-center">
            <span className="text-[15px] text-[#6E5464]">
              선택한 조건에 맞는 미팅 방이 없어요.
            </span>
            <button
              type="button"
              onClick={() => {
                setScopeTab('all');
                setRegionFilter('전체');
                setHeadcountFilter('전체');
                setDateFilter('전체');
                setUniversityFilter('전체');
                setSearchQuery('');
                setPageNumber(1);
              }}
              className="cursor-pointer rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[16px] py-[8px] text-[14px] font-medium text-[#0D050A]"
            >
              필터 초기화
            </button>
          </div>
        )}

        {filteredRooms.length > 0 && (
          <div className="flex flex-row justify-center gap-[8px] self-stretch">
            {paginationItems.map((page) => (
              <PaginationButton
                key={page.id}
                item={page}
                onClick={() => {
                  if (page.label === '>') {
                    if (safePage >= totalPages) {
                      onShowToast('last-page');
                    } else {
                      setPageNumber(safePage + 1);
                    }
                  } else {
                    setPageNumber(Number(page.label));
                  }
                }}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export function App() {
  const initialRoute = useMemo(() => readInitialRouteFromUrl(), []);

  const [currentPage, setCurrentPage] = useState<PageId>(initialRoute.page);
  const [user, setUser] = useState<UserProfile | null>(() => loadCachedCurrentUser());
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [rooms, setRooms] = useState<MeetingRoom[]>(() => loadLocalRooms());
  const [posts, setPosts] = useState<BoardPost[]>(() => loadLocalPosts());
  const [verificationRequests, setVerificationRequests] = useState<VerificationRequest[]>([]);
  const [ownVerificationRequest, setOwnVerificationRequest] = useState<
    VerificationRequest | undefined
  >(undefined);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [inquiries, setInquiries] = useState<InquiryRecord[]>([]);
  const [firestoreDbMissing, setFirestoreDbMissing] = useState<boolean>(false);

  const [selectedRoomId, setSelectedRoomId] = useState<string>(initialRoute.roomId);
  const [selectedPostId, setSelectedPostId] = useState<string>(initialRoute.postId);
  const [boardTab, setBoardTab] = useState<BoardTabType>('meeting');
  const [roomsUnivFilter, setRoomsUnivFilter] = useState<string | null>(null);
  const [mapInitialUnivId, setMapInitialUnivId] = useState<string | null>(null);

  const [activeOverlay, setActiveOverlay] = useState<ActiveOverlayState | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const userRef = useRef<UserProfile | null>(user);
  userRef.current = user;
  const prevPageRef = useRef<PageId>(currentPage);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, [currentPage]);

  // URL 쿼리스트링 및 브라우저 뒤로가기/앞으로가기 동기화 (로그인·회원가입 통과 직후에는 히스토리를 치환해 뒤로가기 시 로그인 창 재노출 방지)
  useEffect(() => {
    const wasAuthEntryPage =
      prevPageRef.current === 'login' || prevPageRef.current === 'signup';
    prevPageRef.current = currentPage;

    const params = new URLSearchParams();
    if (currentPage !== 'home') {
      params.set('page', currentPage);
    }
    if (currentPage === 'room-detail' && selectedRoomId) {
      params.set('room', selectedRoomId);
    }
    if (currentPage === 'board-detail' && selectedPostId) {
      params.set('post', selectedPostId);
    }
    const qs = params.toString();
    const targetUrl = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    if (`${window.location.pathname}${window.location.search}` !== targetUrl) {
      if (wasAuthEntryPage && userRef.current) {
        window.history.replaceState(null, '', targetUrl);
      } else {
        window.history.pushState(null, '', targetUrl);
      }
    }
  }, [currentPage, selectedRoomId, selectedPostId]);

  useEffect(() => {
    const handlePopState = () => {
      const next = readInitialRouteFromUrl();
      if (userRef.current && (next.page === 'login' || next.page === 'signup')) {
        window.history.replaceState(null, '', '/');
        setCurrentPage('home');
        return;
      }
      setCurrentPage(next.page);
      if (next.roomId) setSelectedRoomId(next.roomId);
      if (next.postId) setSelectedPostId(next.postId);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 공용 데이터(방, 게시글), 인증 상태 및 Firestore DB 프로비저닝 상태 구독
  useEffect(() => {
    const unsubAuth = subscribeAuthAndProfile(setUser);
    const unsubRooms = subscribeRooms(setRooms);
    const unsubPosts = subscribePosts(setPosts);
    const unsubDbState = subscribeFirestoreDbMissing(setFirestoreDbMissing);
    return () => {
      unsubAuth();
      unsubRooms();
      unsubPosts();
      unsubDbState();
    };
  }, []);

  // 일반 재학생은 오직 '본인 단건' 인증 신청 내역만 구독 (타인 재학증명서 접근 원천 차단)
  useEffect(() => {
    if (!user?.uid || user.isAdmin) {
      setOwnVerificationRequest(undefined);
      return;
    }
    const unsubMyVerif = subscribeMyVerificationRequest(
      user.uid,
      setOwnVerificationRequest
    );
    return () => unsubMyVerif();
  }, [user?.uid, user?.isAdmin]);

  // 민감 관리자 컬렉션(전체 회원·재학증명서·신고·문의)은 관리자 인증 완료 시에만 구독!
  useEffect(() => {
    if (!user?.isAdmin) {
      setAllUsers([]);
      setVerificationRequests([]);
      setReports([]);
      setInquiries([]);
      return;
    }
    const unsubUsers = subscribeAllUsers(setAllUsers);
    const unsubVerify = subscribeVerificationRequests(setVerificationRequests);
    const unsubReports = subscribeReports(setReports);
    const unsubInquiries = subscribeInquiries(setInquiries);
    return () => {
      unsubUsers();
      unsubVerify();
      unsubReports();
      unsubInquiries();
    };
  }, [user?.isAdmin]);

  // 관리자 로그인 상태에서 기존 승인된 인증 신청서가 users 문서에 누락되어 있을 경우 자동 복구
  useEffect(() => {
    if (!user?.isAdmin || verificationRequests.length === 0) return;
    void repairApprovedUsersInFirestore(verificationRequests, allUsers);
  }, [user?.isAdmin, verificationRequests, allUsers]);

  const showToast = useCallback((toastId: ToastId, customMessage?: string) => {
    setToastMessage(customMessage ?? TOAST_MESSAGES[toastId]);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 2800);
  }, []);

  const dismissToast = useCallback(() => {
    setToastMessage(null);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  const openOverlay = useCallback((overlay: ActiveOverlayState) => {
    setActiveOverlay(overlay);
  }, []);

  const closeOverlay = useCallback(() => {
    setActiveOverlay(null);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const requireVerifiedStudent = useCallback(
    (actionLabel: string): boolean => {
      if (!user) {
        showToast('auth-mail', `로그인 후 ${actionLabel}할 수 있어요.`);
        setCurrentPage('login');
        return false;
      }
      if (user.verificationStatus === 'pending') {
        showToast(
          'auth-mail',
          `학교 인증 심사 대기 중이에요. 운영팀 승인 후 ${actionLabel}할 수 있어요.`
        );
        setCurrentPage('school-auth');
        return false;
      }
      if (!isStudentVerified(user)) {
        showToast(
          'auth-mail',
          `학번·재학증명서 학교 인증을 완료해야 ${actionLabel}할 수 있어요.`
        );
        setCurrentPage('school-auth');
        return false;
      }
      return true;
    },
    [user, showToast]
  );

  const handleRequestCreateRoom = useCallback(() => {
    if (!requireVerifiedStudent('방을 생성')) return;
    setCurrentPage('room-create');
  }, [requireVerifiedStudent]);

  const handleRequestWritePost = useCallback(() => {
    if (!requireVerifiedStudent('모집글을 작성')) return;
    setCurrentPage('board-write');
  }, [requireVerifiedStudent]);

  const handleSelectRoom = useCallback((roomId: string) => {
    setSelectedRoomId(roomId);
    setCurrentPage('room-detail');
  }, []);

  const handleSelectPost = useCallback((postId: string) => {
    setSelectedPostId(postId);
    setCurrentPage('board-detail');
  }, []);

  const handleViewUniversityRooms = useCallback((universityName: string) => {
    setRoomsUnivFilter(universityName);
    setCurrentPage('rooms');
  }, []);

  const handleCreateRoom = useCallback(
    async (payload: {
      title: string;
      format: RoomFormat;
      schedule: string;
      location: string;
      opponentUniversity: string;
      intro: string;
    }) => {
      if (!user || !isStudentVerified(user)) {
        requireVerifiedStudent('방을 생성');
        return;
      }
      try {
        const { room, nextRooms } = await createMeetingRoom(
          { ...payload, host: user },
          rooms
        );
        setRooms(nextRooms);
        setSelectedRoomId(room.id);
        setCurrentPage('room-detail');
        showToast('copy-link', '새 미팅 방을 만들었어요');
      } catch (err) {
        showToast(
          'report',
          err instanceof Error ? err.message : '방 생성 중 오류가 발생했어요.'
        );
      }
    },
    [rooms, user, requireVerifiedStudent, showToast]
  );

  const handleDeleteRoom = useCallback(
    async (roomId: string) => {
      try {
        const next = await deleteMeetingRoom(roomId, rooms, user);
        setRooms(next);
        setCurrentPage('rooms');
        showToast('copy-link', '미팅 방을 삭제했어요');
      } catch (err) {
        showToast(
          'report',
          err instanceof Error ? err.message : '방 삭제 권한이 없어요.'
        );
      }
    },
    [rooms, user, showToast]
  );

  const handleToggleRoomJoin = useCallback(
    async (room: MeetingRoom) => {
      if (!user) {
        requireVerifiedStudent('미팅 방에 참여');
        return;
      }

      const alreadyInRoom =
        room.leftMembers.some((m) => m.uid === user.uid) ||
        room.rightMembers.some((m) => m.uid === user.uid);

      if (!alreadyInRoom && !requireVerifiedStudent('미팅 방에 참여')) {
        return;
      }

      const { action, nextRooms } = await toggleRoomJoin(room, user, rooms);
      if (action === 'joined') {
        setRooms(nextRooms);
        openOverlay({ id: 'apply-complete' });
      } else if (action === 'cancelled') {
        setRooms(nextRooms);
        showToast('copy-link', '참여 신청을 취소했어요');
      } else if (action === 'wrong-univ') {
        showToast(
          'other-univ-slot',
          `이 방은 ${room.leftUniversity.name} · ${room.rightUniversity.name} 인증 사용자만 신청할 수 있어요`
        );
      } else if (action === 'full') {
        showToast('other-univ-slot', '우리 대학 자리가 모두 찼어요');
      }
    },
    [rooms, user, requireVerifiedStudent, openOverlay, showToast]
  );

  const handleCreatePost = useCallback(
    async (payload: {
      tab: BoardTabType;
      title: string;
      format: RoomFormat;
      date: string;
      location: string;
      targetUniversity: string;
      content: string;
    }) => {
      if (!user || !isStudentVerified(user)) {
        requireVerifiedStudent('모집글을 작성');
        return;
      }
      try {
        const { post, nextPosts } = await createBoardPost(
          { ...payload, author: user },
          posts
        );
        setPosts(nextPosts);
        setBoardTab(post.tab);
        setSelectedPostId(post.id);
        setCurrentPage('board-detail');
        showToast('copy-link', '모집글을 등록했어요');
      } catch (err) {
        showToast(
          'report',
          err instanceof Error ? err.message : '모집글 등록 중 오류가 발생했어요.'
        );
      }
    },
    [posts, user, requireVerifiedStudent, showToast]
  );

  const handleTogglePostStatus = useCallback(
    async (post: BoardPost) => {
      try {
        const next = await toggleBoardPostStatus(post, posts, user);
        setPosts(next);
        showToast(
          'copy-link',
          post.status === '모집 중' ? '모집을 마감했어요' : '다시 모집 중으로 변경했어요'
        );
      } catch (err) {
        showToast(
          'report',
          err instanceof Error ? err.message : '상태 변경 권한이 없어요.'
        );
      }
    },
    [posts, user, showToast]
  );

  const handleDeletePost = useCallback(
    async (postId: string) => {
      try {
        const next = await deleteBoardPost(postId, posts, user);
        setPosts(next);
        setCurrentPage('board');
        showToast('copy-link', '모집글을 삭제했어요');
      } catch (err) {
        showToast(
          'report',
          err instanceof Error ? err.message : '삭제 권한이 없어요.'
        );
      }
    },
    [posts, user, showToast]
  );

  const handleTogglePostApply = useCallback(
    async (post: BoardPost) => {
      if (!user) {
        requireVerifiedStudent('미팅을 신청');
        return;
      }
      const alreadyApplied = post.applicants.some((a) => a.uid === user.uid);
      if (!alreadyApplied && !requireVerifiedStudent('미팅을 신청')) {
        return;
      }

      const { action, nextPosts } = await togglePostApply(post, user, posts);
      setPosts(nextPosts);
      if (action === 'applied') {
        openOverlay({ id: 'apply-complete' });
      } else {
        showToast('copy-link', '신청을 취소했어요');
      }
    },
    [posts, user, requireVerifiedStudent, openOverlay, showToast]
  );

  const handleSubmitVerification = useCallback(
    async (payload: {
      university: string;
      department: string;
      studentId: string;
      certificateFileName: string;
      certificateMimeType: string;
      certificateDataUrl: string;
    }) => {
      if (!user) return;
      const { updatedUser, request } = await submitSchoolVerification({
        user,
        ...payload,
      });
      setUser(updatedUser);
      setOwnVerificationRequest(request);
      showToast('auth-mail', '인증 심사를 요청했어요. 운영팀 승인 후 이용 가능해요.');
    },
    [user, showToast]
  );

  const handleApproveVerification = useCallback(
    async (req: VerificationRequest) => {
      try {
        const next = await reviewVerificationRequest(req, 'approved');
        setVerificationRequests(next);
        setAllUsers(
          loadAllLocalUsers().filter((u) => !u.isAdmin)
        );
        if (user && user.uid === req.uid) {
          setUser({
            ...user,
            university: req.university,
            department: req.department,
            studentId: req.studentId,
            studentYear: req.studentYear,
            verified: true,
            verificationStatus: 'approved',
            rejectionReason: '',
          });
        }
        showToast('auth-mail', `${req.userName}님의 ${req.university} 인증을 승인했어요.`);
      } catch (err) {
        showToast(
          'report',
          err instanceof Error
            ? `승인 저장 실패: ${err.message}`
            : '인증 승인 처리 중 서버 권한 오류가 발생했어요.'
        );
      }
    },
    [user, showToast]
  );

  const handleRejectVerification = useCallback(
    async (req: VerificationRequest, reason: string) => {
      try {
        const next = await reviewVerificationRequest(req, 'rejected', reason);
        setVerificationRequests(next);
        setAllUsers(
          loadAllLocalUsers().filter((u) => !u.isAdmin)
        );
        if (user && user.uid === req.uid) {
          setUser({
            ...user,
            verified: false,
            verificationStatus: 'rejected',
            rejectionReason: reason,
          });
        }
        showToast('report', `${req.userName}님의 인증 요청을 반려 처리했어요.`);
      } catch (err) {
        showToast(
          'report',
          err instanceof Error
            ? `반려 저장 실패: ${err.message}`
            : '반려 처리 중 서버 권한 오류가 발생했어요.'
        );
      }
    },
    [user, showToast]
  );

  const handleLogout = useCallback(async () => {
    await logoutUser();
    setUser(null);
    setCurrentPage('home');
    showToast('copy-link', '로그아웃되었어요');
  }, [showToast]);

  const handleDirectSetUserVerification = useCallback(
    async (targetUser: UserProfile, decision: 'approved' | 'unverified') => {
      try {
        const updated = await setUserVerificationByAdmin(targetUser, decision);
        setAllUsers((prev) => {
          const filtered = prev.filter((u) => u.uid !== updated.uid);
          return [updated, ...filtered];
        });
        setVerificationRequests(loadLocalVerificationRequests());
        showToast(
          'auth-mail',
          decision === 'approved'
            ? `${updated.name}님의 ${updated.university} 인증을 승인했어요.`
            : `${updated.name}님의 학교 인증을 해제했어요.`
        );
      } catch (err) {
        showToast(
          'report',
          err instanceof Error
            ? `상태 변경 실패: ${err.message}`
            : '학교 인증 상태 저장 중 서버 권한 오류가 발생했어요.'
        );
      }
    },
    [showToast]
  );

  const handleSubmitReport = useCallback(
    (reason: string, detail: string, target?: ActiveOverlayState['reportTarget']) => {
      void submitReport({
        targetType: target?.targetType ?? 'general',
        targetId: target?.targetId,
        reason,
        detail,
        reporterUid: user?.uid ?? 'guest',
        createdAt: Date.now(),
      });
    },
    [user]
  );

  const handleSubmitInquiry = useCallback(
    (content: string, overrideEmail?: string) => {
      void submitInquiry({
        content,
        userUid: user?.uid ?? 'guest',
        email: overrideEmail ?? user?.email ?? '',
        createdAt: Date.now(),
      });
    },
    [user]
  );

  const handleDeleteVerificationOnly = useCallback(async () => {
    if (!user) return;
    const updated = await deleteMyVerificationData(user);
    setUser(updated);
    setOwnVerificationRequest(undefined);
    showToast('copy-link', '재학증명서 원본과 학번 정보가 서버에서 즉시 파기되었어요.');
  }, [user, showToast]);

  const handleWithdrawAccount = useCallback(
    async (password: string) => {
      if (!user) return;
      const { nextRooms, nextPosts } = await withdrawUserAccount(
        user,
        password,
        rooms,
        posts
      );
      setRooms(nextRooms);
      setPosts(nextPosts);
      setUser(null);
      setOwnVerificationRequest(undefined);
      setCurrentPage('home');
      showToast('copy-link', '회원탈퇴 및 모든 개인정보 영구 파기가 완료되었어요.');
    },
    [user, rooms, posts, showToast]
  );

  const handleAdminPurgeUser = useCallback(
    async (targetUser: UserProfile) => {
      const { nextRooms, nextPosts } = await deleteUserDataByAdmin(
        targetUser.uid,
        rooms,
        posts
      );
      setRooms(nextRooms);
      setPosts(nextPosts);
      setAllUsers((prev) => prev.filter((u) => u.uid !== targetUser.uid));
      setVerificationRequests((prev) => prev.filter((r) => r.uid !== targetUser.uid));
      showToast('copy-link', `${targetUser.name}님의 개인정보 및 게시물을 모두 파기했어요.`);
    },
    [rooms, posts, showToast]
  );

  const myVerificationRequest = ownVerificationRequest;

  const isAdminAccess = Boolean(user?.isAdmin);
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);
  const selectedPost = posts.find((p) => p.id === selectedPostId);

  // 관리자 계정 로그인 시 학생 화면과 완전히 분리된 관리자 전용 포털로 전환
  if (user?.isAdmin) {
    return (
      <>
        <AdminPortal
          adminUser={user}
          requests={verificationRequests}
          users={allUsers}
          rooms={rooms}
          posts={posts}
          reports={reports}
          inquiries={inquiries}
          firestoreDbMissing={firestoreDbMissing}
          onApprove={handleApproveVerification}
          onReject={handleRejectVerification}
          onDirectSetUserVerification={handleDirectSetUserVerification}
          onPurgeUserData={handleAdminPurgeUser}
          onDeleteRoom={handleDeleteRoom}
          onTogglePostStatus={handleTogglePostStatus}
          onDeletePost={handleDeletePost}
          onLogout={handleLogout}
        />
        <ToastOverlay message={toastMessage} onDismiss={dismissToast} />
      </>
    );
  }

  // 홈(V2 랜딩)은 daehak-meeting-share/daehak-meeting/src/pages/V2.tsx 기반 독립 헤더·스크롤로 렌더링
  if (currentPage === 'home' || currentPage === 'admin') {
    return (
      <>
        <HomeV2
          user={user}
          realRooms={rooms}
          univCount={UNIVERSITIES_GEO.length}
          onSelectRoom={handleSelectRoom}
          onNavigate={setCurrentPage}
          onRequestCreateRoom={handleRequestCreateRoom}
          onOpenOverlay={openOverlay}
        />
        <CookieConsentBanner onOpenOverlay={openOverlay} />
        <OverlayModal
          overlay={activeOverlay}
          defaultEmail={user?.email}
          onClose={closeOverlay}
          onNavigate={setCurrentPage}
          onShowToast={showToast}
          onSubmitReport={handleSubmitReport}
          onSubmitInquiry={handleSubmitInquiry}
        />
        <ToastOverlay message={toastMessage} onDismiss={dismissToast} />
      </>
    );
  }

  const gnbElement = (
    <GNB
      activePage={currentPage}
      user={user}
      onLogout={handleLogout}
      onNavigate={setCurrentPage}
    />
  );

  let pageView: React.ReactNode;
  if (currentPage === 'login') {
    pageView = (
      <LoginView
        header={null}
        onSuccess={(loggedInUser) => {
          setUser(loggedInUser);
          if (loggedInUser.isAdmin) {
            showToast('auth-mail', '관리자 페이지로 로그인되었어요.');
            return;
          }
          showToast('copy-link', `${loggedInUser.name}님 반가워요!`);
          setCurrentPage(isStudentVerified(loggedInUser) ? 'rooms' : 'school-auth');
        }}
        onNavigate={setCurrentPage}
      />
    );
  } else if (currentPage === 'signup') {
    pageView = (
      <SignupView
        header={null}
        onSuccess={(newUser) => {
          setUser(newUser);
          showToast(
            'auth-mail',
            '회원가입이 완료되었어요! 이어서 학번과 재학증명서를 제출해 주세요.'
          );
          setCurrentPage('school-auth');
        }}
        onNavigate={setCurrentPage}
        onOpenOverlay={openOverlay}
      />
    );
  } else if (currentPage === 'school-auth') {
    pageView = (
      <SchoolVerificationView
        header={null}
        user={user}
        myRequest={myVerificationRequest}
        onSubmitVerification={handleSubmitVerification}
        onNavigate={setCurrentPage}
        onOpenOverlay={openOverlay}
      />
    );
  } else if (currentPage === 'rooms') {
    pageView = (
      <MeetingRoomsPage
        rooms={rooms}
        user={user}
        initialUniversityFilter={roomsUnivFilter}
        onConsumeInitialUniversityFilter={() => setRoomsUnivFilter(null)}
        onSelectRoom={handleSelectRoom}
        onRequestCreateRoom={handleRequestCreateRoom}
        onShowToast={showToast}
        onOpenOverlay={openOverlay}
      />
    );
  } else if (currentPage === 'room-detail') {
    pageView = (
      <RoomDetailPage
        room={selectedRoom}
        user={user}
        isAdmin={isAdminAccess}
        onToggleJoin={handleToggleRoomJoin}
        onDeleteRoom={handleDeleteRoom}
        onNavigate={setCurrentPage}
        onShowToast={showToast}
        onOpenOverlay={openOverlay}
      />
    );
  } else if (currentPage === 'room-create') {
    pageView = (
      <RoomCreatePage
        user={user}
        onCreateRoom={handleCreateRoom}
        onNavigate={setCurrentPage}
        onOpenOverlay={openOverlay}
      />
    );
  } else if (currentPage === 'map') {
    pageView = (
      <MapPage
        rooms={rooms}
        user={user}
        initialSelectedUnivId={mapInitialUnivId}
        onConsumeInitialSelectedUnivId={() => setMapInitialUnivId(null)}
        onViewUniversityRooms={handleViewUniversityRooms}
        onShowToast={showToast}
      />
    );
  } else if (currentPage === 'board') {
    pageView = (
      <BoardListPage
        posts={posts}
        activeTab={boardTab}
        onChangeTab={setBoardTab}
        onSelectPost={handleSelectPost}
        onRequestWritePost={handleRequestWritePost}
        onShowToast={showToast}
        onOpenOverlay={openOverlay}
      />
    );
  } else if (currentPage === 'board-write') {
    pageView = (
      <BoardWritePage
        user={user}
        onCreatePost={handleCreatePost}
        onNavigate={setCurrentPage}
        onOpenOverlay={openOverlay}
      />
    );
  } else if (currentPage === 'board-detail') {
    pageView = (
      <BoardDetailPage
        post={selectedPost}
        user={user}
        isAdmin={isAdminAccess}
        onToggleApply={handleTogglePostApply}
        onToggleStatus={handleTogglePostStatus}
        onDeletePost={handleDeletePost}
        onNavigate={setCurrentPage}
        onShowToast={showToast}
        onOpenOverlay={openOverlay}
      />
    );
  } else {
    pageView = (
      <MyPage
        user={user}
        rooms={rooms}
        posts={posts}
        onSelectRoom={handleSelectRoom}
        onSelectPost={handleSelectPost}
        onRequestCreateRoom={handleRequestCreateRoom}
        onRequestWritePost={handleRequestWritePost}
        onDeleteVerificationOnly={handleDeleteVerificationOnly}
        onWithdrawAccount={handleWithdrawAccount}
        onOpenOverlay={openOverlay}
        onNavigate={setCurrentPage}
      />
    );
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#FFFFFF]">
      {/* 키보드 전용 이동자를 위한 본문 바로가기 스킵 링크 */}
      <a
        href="#page-main"
        className="sr-only z-50 rounded-[8px] bg-[#F7C1D4] px-[16px] py-[10px] text-[14px] font-bold text-[#0D050A] focus:not-sr-only focus:fixed focus:left-[16px] focus:top-[12px]"
      >
        본문으로 건너뛰기
      </a>

      {/* 상단 고정 GNB (홈과 통일감을 주는 다크 테마) */}
      <div className="z-30 w-full shrink-0 border-b border-[#FFFFFF]/14 bg-[#0D050A]">
        <div className="mx-auto w-full max-w-[1440px]">{gnbElement}</div>
      </div>

      {/* 하단 독립 스크롤 본문 (지도 탭에서는 외부 스크롤 잠금, 대학 목록만 내부 스크롤) */}
      <div
        id="page-main"
        tabIndex={-1}
        ref={scrollContainerRef}
        className={
          currentPage === 'map'
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
            : 'flex flex-1 flex-col overflow-x-hidden overflow-y-auto'
        }
      >
        <div
          className={
            currentPage === 'map'
              ? 'flex h-full min-h-0 w-full flex-1 flex-col'
              : 'flex-1'
          }
        >
          {pageView}
        </div>
        {currentPage !== 'map' && <SubpageLegalFooter onOpenOverlay={openOverlay} />}
      </div>

      <CookieConsentBanner onOpenOverlay={openOverlay} />
      <OverlayModal
        overlay={activeOverlay}
        defaultEmail={user?.email}
        onClose={closeOverlay}
        onNavigate={setCurrentPage}
        onShowToast={showToast}
        onSubmitReport={handleSubmitReport}
        onSubmitInquiry={handleSubmitInquiry}
      />
      <ToastOverlay message={toastMessage} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
