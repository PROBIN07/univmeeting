import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { getMaxMembersPerTeam } from '../data/seedData';
import univLogos from '../data/univ-logos.json';
import type {
  ActiveOverlayState,
  MeetingRoom,
  PageId,
  UserProfile,
} from '../types/meeting';
import { FooterAdBannerCarousel } from './LegalDocumentsAndBanner';
import s from './HomeV2.module.css';

interface ShowcaseTeam {
  univ: string;
  short: string;
  gender: 'M' | 'F';
  members: { dept: string; year: number; role: string }[];
}

interface ShowcaseRoom {
  id: string;
  format: number;
  when: string;
  time: string;
  area: string;
  teams: [ShowcaseTeam, ShowcaseTeam];
  places: { name: string; desc: string }[];
}

// daehak-meeting/src/mocks/rooms.json의 랜딩 쇼케이스 예시 방 8개 원본 그대로 반영
const SHOWCASE_ROOMS: ShowcaseRoom[] = [
  {
    id: '1',
    format: 3,
    when: '11월 20일 (금) 저녁',
    time: '7시',
    area: '서울 신촌 일대',
    teams: [
      {
        univ: '숭실대학교',
        short: '숭실대',
        gender: 'M',
        members: [
          { dept: '글로벌미디어학부', year: 26, role: '방장' },
          { dept: '글로벌미디어학부', year: 26, role: '팀원' },
        ],
      },
      {
        univ: '연세대학교',
        short: '연세대',
        gender: 'F',
        members: [{ dept: '경영학과', year: 25, role: '팀원' }],
      },
    ],
    places: [
      { name: '추천 장소 A', desc: '신촌역 도보 3분 · 단체석 · 1인 2~3만원' },
      { name: '추천 장소 B', desc: '이대역 도보 5분 · 룸 · 1인 2만원대' },
    ],
  },
  {
    id: '2',
    format: 2,
    when: '11월 21일 (토) 오후',
    time: '3시',
    area: '대구 동대구역 근처',
    teams: [
      {
        univ: '부산대학교',
        short: '부산대',
        gender: 'M',
        members: [
          { dept: '경영학과', year: 24, role: '방장' },
          { dept: '컴퓨터학부', year: 25, role: '팀원' },
        ],
      },
      {
        univ: '경북대학교',
        short: '경북대',
        gender: 'F',
        members: [{ dept: '국어국문학과', year: 26, role: '팀원' }],
      },
    ],
    places: [{ name: '추천 장소 A', desc: '대구 동대구역 근처 도보 3분 · 단체석' }],
  },
  {
    id: '3',
    format: 3,
    when: '11월 22일 (일) 저녁',
    time: '6시',
    area: '대전 둔산동',
    teams: [
      {
        univ: '전남대학교',
        short: '전남대',
        gender: 'M',
        members: [{ dept: '기계공학부', year: 23, role: '방장' }],
      },
      {
        univ: '충남대학교',
        short: '충남대',
        gender: 'F',
        members: [
          { dept: '심리학과', year: 24, role: '팀원' },
          { dept: '전자공학과', year: 25, role: '팀원' },
          { dept: '경제학과', year: 26, role: '팀원' },
        ],
      },
    ],
    places: [{ name: '추천 장소 A', desc: '대전 둔산동 도보 3분 · 단체석' }],
  },
  {
    id: '4',
    format: 2,
    when: '11월 24일 (화) 저녁',
    time: '7시',
    area: '서울 흑석동',
    teams: [
      {
        univ: '숭실대학교',
        short: '숭실대',
        gender: 'M',
        members: [{ dept: '경영학과', year: 23, role: '방장' }],
      },
      {
        univ: '중앙대학교',
        short: '중앙대',
        gender: 'F',
        members: [],
      },
    ],
    places: [{ name: '추천 장소 A', desc: '서울 흑석동 도보 3분 · 단체석' }],
  },
  {
    id: '5',
    format: 4,
    when: '11월 25일 (수) 저녁',
    time: '7시',
    area: '춘천 명동',
    teams: [
      {
        univ: '강원대학교',
        short: '강원대',
        gender: 'M',
        members: [
          { dept: '컴퓨터학부', year: 24, role: '방장' },
          { dept: '국어국문학과', year: 25, role: '팀원' },
          { dept: '기계공학부', year: 26, role: '팀원' },
        ],
      },
      {
        univ: '한림대학교',
        short: '한림대',
        gender: 'F',
        members: [
          { dept: '심리학과', year: 23, role: '팀원' },
          { dept: '전자공학과', year: 24, role: '팀원' },
        ],
      },
    ],
    places: [{ name: '추천 장소 A', desc: '춘천 명동 도보 3분 · 단체석' }],
  },
  {
    id: '6',
    format: 3,
    when: '11월 26일 (목) 저녁',
    time: '7시',
    area: '인천 부평역',
    teams: [
      {
        univ: '인하대학교',
        short: '인하대',
        gender: 'M',
        members: [
          { dept: '경제학과', year: 25, role: '방장' },
          { dept: '경영학과', year: 26, role: '팀원' },
          { dept: '컴퓨터학부', year: 23, role: '팀원' },
        ],
      },
      {
        univ: '숭실대학교',
        short: '숭실대',
        gender: 'F',
        members: [
          { dept: '국어국문학과', year: 24, role: '팀원' },
          { dept: '기계공학부', year: 25, role: '팀원' },
        ],
      },
    ],
    places: [{ name: '추천 장소 A', desc: '인천 부평역 도보 3분 · 단체석' }],
  },
  {
    id: '7',
    format: 2,
    when: '11월 28일 (토) 오후',
    time: '2시',
    area: '부산 서면',
    teams: [
      {
        univ: '제주대학교',
        short: '제주대',
        gender: 'M',
        members: [
          { dept: '심리학과', year: 26, role: '방장' },
          { dept: '전자공학과', year: 23, role: '팀원' },
        ],
      },
      {
        univ: '부경대학교',
        short: '부경대',
        gender: 'F',
        members: [
          { dept: '경제학과', year: 24, role: '팀원' },
          { dept: '경영학과', year: 25, role: '팀원' },
        ],
      },
    ],
    places: [{ name: '추천 장소 A', desc: '부산 서면 도보 3분 · 단체석' }],
  },
  {
    id: '8',
    format: 4,
    when: '11월 27일 (금) 저녁',
    time: '7시',
    area: '서울 왕십리',
    teams: [
      {
        univ: '고려대학교',
        short: '고려대',
        gender: 'M',
        members: [
          { dept: '컴퓨터학부', year: 26, role: '방장' },
          { dept: '국어국문학과', year: 23, role: '팀원' },
          { dept: '기계공학부', year: 24, role: '팀원' },
          { dept: '심리학과', year: 25, role: '팀원' },
        ],
      },
      {
        univ: '한양대학교',
        short: '한양대',
        gender: 'F',
        members: [
          { dept: '전자공학과', year: 26, role: '팀원' },
          { dept: '경제학과', year: 23, role: '팀원' },
          { dept: '경영학과', year: 24, role: '팀원' },
          { dept: '컴퓨터학부', year: 25, role: '팀원' },
        ],
      },
    ],
    places: [{ name: '추천 장소 A', desc: '서울 왕십리 도보 3분 · 단체석' }],
  },
];

function isMatched(r: ShowcaseRoom): boolean {
  return r.teams.every((t) => t.members.length >= r.format);
}

const pair = (r: ShowcaseRoom) => `${r.teams[0].short} × ${r.teams[1].short}`;

// 로고가 있는 학교를 앞에 두고 여섯 줄에 번갈아 나눈다 — 처음 보이는 칸이 채워진 칸이 되도록.
const ROW_COUNT = 6;
const LOGO_ROWS = Array.from({ length: ROW_COUNT }, (_, r) =>
  [...univLogos]
    .sort((a, b) => Number(!a.logo) - Number(!b.logo))
    .filter((_, i) => i % ROW_COUNT === r)
);

/**
 * v2 랜딩 — 스크롤 기반. 각 [data-scroll] 섹션에 --p(0→1, 섹션이 화면을 지나가는 진행도)를 써 주고
 * CSS가 그 값으로 움직임을 계산한다. 리렌더 없이 style만 바꾼다.
 */
function useScrollProgress(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const els = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-scroll]') ?? []);
    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        const range = Math.max(1, r.height - vh);
        const p = Math.min(1, Math.max(0, -r.top / range));
        el.style.setProperty('--p', p.toFixed(4));
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [root]);
}

/** 목록 위에서 세로 휠을 굴릴 때만 가로로 넘긴다. 끝에 닿으면 페이지가 다시 세로로 스크롤된다. */
function useWheelToHorizontal(
  ref: React.RefObject<HTMLElement | null>,
  itemCount: number
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return; // 트랙패드 가로 스와이프는 브라우저에 맡김
      const max = el.scrollWidth - el.clientWidth;
      if ((e.deltaY > 0 && el.scrollLeft < max - 1) || (e.deltaY < 0 && el.scrollLeft > 0)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ref, itemCount]);
}

const STEPS = [
  {
    no: '01',
    title: '학교 메일로 인증해요',
    desc: '재학생만 들어올 수 있어요. 학교 이메일 한 번이면 끝나고, 인증 배지가 내 프로필에 붙어요.',
  },
  {
    no: '02',
    title: '내 대학이 들어간 방을 골라요',
    desc: '날짜·인원·지역으로 거르고, 원하는 방이 없으면 상대 대학을 정해 방을 직접 만들어요.',
  },
  {
    no: '03',
    title: '양쪽 자리가 차면 성사돼요',
    desc: '주선자를 기다릴 필요 없어요. 두 학교 팀원이 모두 모이는 순간 미팅이 확정돼요.',
  },
  {
    no: '04',
    title: '두 학교 중간에서 만나요',
    desc: '양쪽 캠퍼스 사이 장소를 추천받아요. 누구 한쪽만 멀리 오지 않아도 돼요.',
  },
];

function Slots({ room }: { room: ShowcaseRoom }) {
  return (
    <div className={s.slots}>
      {room.teams.map((t) => (
        <div key={t.univ} className={s.slotRow}>
          <span className={s.slotName}>{t.short}</span>
          <span className={s.slotDots}>
            {Array.from({ length: room.format }, (_, i) => (
              <i
                key={i}
                className={
                  i < t.members.length ? (t.gender === 'M' ? s.dotM : s.dotF) : s.dotEmpty
                }
              />
            ))}
          </span>
          <span className={s.slotCount}>
            {t.members.length}/{room.format}
          </span>
        </div>
      ))}
    </div>
  );
}

function RealRoomSlots({ room }: { room: MeetingRoom }) {
  const maxPerTeam = getMaxMembersPerTeam(room.format);
  const sides = [
    {
      key: `left-${room.leftUniversity.name}`,
      short: room.leftUniversity.shortName,
      gender: room.leftUniversity.gender,
      filled: room.leftMembers.length,
    },
    {
      key: `right-${room.rightUniversity.name}`,
      short: room.rightUniversity.shortName,
      gender: room.rightUniversity.gender,
      filled: room.rightMembers.length,
    },
  ];

  return (
    <div className={s.slots}>
      {sides.map((side) => (
        <div key={side.key} className={s.slotRow}>
          <span className={s.slotName}>{side.short}</span>
          <span className={s.slotDots}>
            {Array.from({ length: maxPerTeam }, (_, i) => (
              <i
                key={i}
                className={
                  i < side.filled
                    ? side.gender === '남'
                      ? s.dotM
                      : s.dotF
                    : s.dotEmpty
                }
              />
            ))}
          </span>
          <span className={s.slotCount}>
            {side.filled}/{maxPerTeam}
          </span>
        </div>
      ))}
    </div>
  );
}

function PhoneRoom({ room }: { room: ShowcaseRoom }) {
  return (
    <div className={s.screen}>
      <div className={s.screenTop}>
        <span className={s.tag}>
          {room.format}:{room.format}
        </span>
        <span>모집 중</span>
      </div>
      <p className={s.screenPair}>{pair(room)}</p>
      <p className={s.screenMeta}>
        {room.when} {room.time}
        <br />
        {room.area}
      </p>
      <Slots room={room} />
      <span className={s.screenCta}>참여 신청</span>
    </div>
  );
}

function StepScreen({ i, rooms }: { i: number; rooms: ShowcaseRoom[] }) {
  if (i === 0) {
    return (
      <div className={s.screen}>
        <p className={s.screenLabel}>학교 인증</p>
        <p className={s.screenPair}>숭실대학교</p>
        <span className={s.field}>me@soongsil.ac.kr</span>
        <span className={s.screenCta}>인증 메일 보내기</span>
      </div>
    );
  }
  if (i === 1) {
    return (
      <div className={s.screen}>
        <p className={s.screenLabel}>숭실대가 포함된 방</p>
        {rooms
          .filter((r) => r.teams.some((t) => t.short === '숭실대'))
          .slice(0, 3)
          .map((r) => (
            <div key={r.id} className={s.miniRow}>
              <b>{pair(r)}</b>
              <span>
                {r.format}:{r.format} · {r.area}
              </span>
            </div>
          ))}
      </div>
    );
  }
  if (i === 2) {
    const full = rooms.find(isMatched) ?? rooms[0];
    return (
      <div className={s.screen}>
        <div className={s.screenTop}>
          <span className={s.tag}>
            {full.format}:{full.format}
          </span>
          <span className={s.done}>성사 완료</span>
        </div>
        <p className={s.screenPair}>{pair(full)}</p>
        <Slots room={full} />
      </div>
    );
  }
  return (
    <div className={s.screen}>
      <p className={s.screenLabel}>중간 지점 추천</p>
      <div className={s.mini}>
        <i className={s.pinA} />
        <i className={s.pinB} />
        <i className={s.pinMid} />
      </div>
      <p className={s.screenMeta}>{rooms[0].places[0]?.desc}</p>
    </div>
  );
}

const FOOTER_ITEMS = [
  { key: 'terms', label: '이용약관' },
  { key: 'privacy', label: '개인정보처리방침' },
  { key: 'cookies', label: '쿠키정책' },
  { key: 'report', label: '신고 센터' },
  { key: 'inquiry', label: '문의하기' },
] as const;

export function HomeV2({
  user,
  realRooms,
  univCount,
  onSelectRoom,
  onNavigate,
  onRequestCreateRoom,
  onOpenOverlay,
}: {
  user: UserProfile | null;
  realRooms: MeetingRoom[];
  univCount: number;
  onSelectRoom: (roomId: string) => void;
  onNavigate: (page: PageId) => void;
  onRequestCreateRoom: () => void;
  onOpenOverlay: (overlay: ActiveOverlayState) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const showcaseRooms = SHOWCASE_ROOMS;
  const waitingRooms = useMemo(
    () => realRooms.filter((r) => r.status === '모집 중'),
    [realRooms]
  );
  const openCount = waitingRooms.length;
  const heroPairs = useMemo(
    () =>
      waitingRooms.length > 0
        ? waitingRooms.map(
            (r) => `${r.leftUniversity.shortName} × ${r.rightUniversity.shortName}`
          )
        : showcaseRooms.map((r) => pair(r)),
    [waitingRooms, showcaseRooms]
  );
  const [word, setWord] = useState(0);
  const [paused, setPaused] = useState(false);
  const [step, setStep] = useState(0);

  useScrollProgress(rootRef);
  useWheelToHorizontal(trackRef, waitingRooms.length);

  // 히어로의 큰 학교 조합이 2.6초마다 바뀐다(일시정지 가능).
  useEffect(() => {
    if (paused || heroPairs.length < 2) return;
    const id = setInterval(() => setWord((w) => (w + 1) % heroPairs.length), 2600);
    return () => clearInterval(id);
  }, [paused, heroPairs.length]);

  // 스텝 섹션: 화면 가운데를 지나는 단계가 활성.
  useEffect(() => {
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-step]') ?? []);
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (e.isIntersecting) {
            setStep(Number((e.target as HTMLElement).dataset.step));
          }
        }
      },
      { rootMargin: '-50% 0px -50% 0px' }
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const lead = showcaseRooms[0];
  const currentHeroPair = heroPairs[word % heroPairs.length] ?? pair(showcaseRooms[0]);

  return (
    <div ref={rootRef} className={s.page}>
      <a href="#main" className={s.skip}>
        본문으로 건너뛰기
      </a>
      <header className={s.nav}>
        <a
          href="#main"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={s.logo}
        >
          <img src="/logo.svg?v=2" alt="Univmeeting 로고" className={s.mark} />
          <span className={s.logoText}>Univmeeting</span>
        </a>
        <nav aria-label="주요 메뉴" className={s.links}>
          <a href="#steps">진행 방식</a>
        </nav>
        {user ? (
          <a
            href="?page=mypage"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('mypage');
            }}
            className={s.navCta}
          >
            마이페이지
          </a>
        ) : (
          <a
            href="?page=login"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('login');
            }}
            className={s.navCta}
          >
            로그인
          </a>
        )}
      </header>

      <main id="main">
        {/* 1. 히어로 — 로드 시 한 번 등장, 큰 학교 조합이 순환 */}
        <section className={s.hero}>
          <div className={s.heroText}>
            <p className={s.eyebrow}>
              지금 {openCount}개 방 모집 중 · 전국 {univCount}개 대학
            </p>
            <h1 className={s.h1}>
              주선자 없이,
              <br />
              다른 대학 <span className={s.nowrap}>학생과 미팅</span>
            </h1>
            <div className={s.actions}>
              <a
                href="?page=rooms"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate('rooms');
                }}
                className={s.btnPrimary}
              >
                미팅 방 둘러보기
              </a>
              <a
                href="?page=room-create"
                onClick={(e) => {
                  e.preventDefault();
                  onRequestCreateRoom();
                }}
                className={s.btnGhost}
              >
                방 만들기
              </a>
            </div>
          </div>
          <p className={s.bigWord} aria-live="off">
            <span key={word} className={s.wordIn}>
              {currentHeroPair}
            </span>
          </p>
          <button
            type="button"
            className={s.pause}
            onClick={() => setPaused((v) => !v)}
            aria-pressed={paused}
          >
            {paused ? '다시 재생' : '일시정지'}
          </button>
        </section>

        {/* 2. 고정된 폰 — 스크롤하면 제목이 흐려지고 폰이 커지며 학교 태그가 양옆으로 흐른다 */}
        <section className={s.pin} data-scroll style={{ '--screens': 3 } as React.CSSProperties}>
          <div className={s.sticky}>
            <h2 className={s.pinTitle}>
              내 학교가 들어간 방에
              <br />
              바로 들어가요
            </h2>
            <div className={s.tags} aria-hidden="true">
              {LOGO_ROWS.map((row, r) => (
                <div key={r} className={s.tagRow}>
                  {row.map((u) =>
                    u.logo ? (
                      <span key={u.name} className={s.logoTile}>
                        <img src={u.logo} alt={`${u.name} 로고`} loading="lazy" />
                      </span>
                    ) : (
                      <span key={u.name} className={`${s.logoTile} ${s.logoEmpty}`}>
                        {u.name}
                      </span>
                    )
                  )}
                </div>
              ))}
            </div>
            <div className={s.phone}>
              <PhoneRoom room={lead} />
            </div>
          </div>
        </section>

        {/* 3. 실제 모집 중인 미팅 방 목록 — 목록 위에서 휠을 굴릴 때 가로로 넘어간다 */}
        <section className={s.rail} id="rooms" aria-labelledby="rooms-title">
          <h2 id="rooms-title" className={s.railTitle}>
            <em>{waitingRooms.length}개</em>의 방이 상대 학교를 기다려요
          </h2>
          {waitingRooms.length > 0 ? (
            <div
              ref={trackRef}
              className={s.track}
              tabIndex={0}
              role="region"
              aria-label="모집 중인 미팅 방 목록, 가로로 넘겨 보세요"
            >
              {waitingRooms.map((r) => (
                <div
                  key={r.id}
                  onClick={() => onSelectRoom(r.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectRoom(r.id);
                    }
                  }}
                  className={s.card}
                >
                  <div className={s.screenTop}>
                    <span className={s.tag}>{r.format}</span>
                    <span>{r.status}</span>
                  </div>
                  <p className={s.cardPair}>
                    {`${r.leftUniversity.shortName} × ${r.rightUniversity.shortName}`}
                  </p>
                  <p className={s.cardMeta}>
                    {r.schedule}
                    <br />
                    {r.location}
                  </p>
                  <RealRoomSlots room={r} />
                </div>
              ))}
            </div>
          ) : (
            <div className={s.emptyRail}>
              <p>
                현재 모집 중인 미팅 방이 없어요. 첫 번째 방을 직접 만들고 상대 학교 팀을 초대해 보세요!
              </p>
              <div className={s.actions}>
                <a
                  href="?page=room-create"
                  onClick={(e) => {
                    e.preventDefault();
                    onRequestCreateRoom();
                  }}
                  className={s.btnPrimary}
                >
                  첫 미팅 방 만들기
                </a>
                <a
                  href="?page=rooms"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('rooms');
                  }}
                  className={s.btnGhost}
                >
                  미팅 방 목록 가기
                </a>
              </div>
            </div>
          )}
        </section>

        {/* 4. 단계 — 왼쪽 폰은 고정, 오른쪽 단계가 지나갈 때마다 화면이 바뀐다 */}
        <section className={s.steps} id="steps" aria-labelledby="steps-title">
          <div className={s.stepsPhone}>
            <div className={s.phone}>
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={i === step ? s.layerOn : s.layer}
                  aria-hidden={i !== step}
                >
                  <StepScreen i={i} rooms={showcaseRooms} />
                </div>
              ))}
            </div>
          </div>
          <div className={s.stepsText}>
            <h2 id="steps-title" className={s.stepsTitle}>
              네 단계면 미팅이 잡혀요
            </h2>
            <ol className={s.stepList}>
              {STEPS.map((st, i) => (
                <li key={st.no} data-step={i} className={i === step ? s.stepOn : s.step}>
                  <span className={s.stepNo}>{st.no}</span>
                  <h3>{st.title}</h3>
                  <p>{st.desc}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 5. 마무리 — 큰 타이포가 스크롤에 맞춰 채워진다 */}
        <section className={s.close} data-scroll style={{ '--screens': 2 } as React.CSSProperties}>
          <div className={s.sticky}>
            <p className={s.closeType}>
              두 학교 사이,
              <br />딱 중간에서
            </p>
            <div className={s.actions}>
              <a
                href="?page=map"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate('map');
                }}
                className={s.btnPrimary}
              >
                지도에서 대학 찾기
              </a>
              <a
                href="?page=room-create"
                onClick={(e) => {
                  e.preventDefault();
                  onRequestCreateRoom();
                }}
                className={s.btnGhost}
              >
                방 만들기
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <div className={s.footerInfo}>
          <p className={s.footerBrand}>Univmeeting</p>
          <div className={s.footerLinks}>
            {FOOTER_ITEMS.map((item, idx) => (
              <Fragment key={item.key}>
                {idx > 0 && <span aria-hidden="true">·</span>}
                <button
                  type="button"
                  onClick={() => {
                    if (item.key === 'terms') {
                      onOpenOverlay({ id: 'terms' });
                    } else if (item.key === 'privacy') {
                      onOpenOverlay({ id: 'privacy' });
                    } else if (item.key === 'cookies') {
                      onOpenOverlay({ id: 'cookies' });
                    } else if (item.key === 'report') {
                      onOpenOverlay({
                        id: 'report',
                        reportTarget: { targetType: 'general' },
                      });
                    } else if (item.key === 'inquiry') {
                      onOpenOverlay({ id: 'inquiry' });
                    }
                  }}
                >
                  {item.label}
                </button>
              </Fragment>
            ))}
          </div>
        </div>
        <FooterAdBannerCarousel onOpenOverlay={onOpenOverlay} />
      </footer>
    </div>
  );
}
