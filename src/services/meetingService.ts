import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  computeRoomStatus,
  deriveStudentYearLabel,
  getMaxMembersPerTeam,
  getShortUniversityName,
} from '../data/seedData';
import { auth, db, isFirebaseConfigured } from '../lib/firebase';
import type {
  BoardPost,
  BoardTabType,
  GenderType,
  InquiryRecord,
  MeetingRoom,
  ReportRecord,
  RoomFormat,
  TeamMemberItem,
  UserProfile,
  VerificationRequest,
} from '../types/meeting';
import {
  checkAndRecordActionCooldown,
  containsDangerousPayload,
  getLoginLockoutRemainingSeconds,
  isSafeCertificateDataUrl,
  isSafeEmailAddress,
  recordLoginFailure,
  resetLoginFailures,
  sanitizePlainText,
  validateNickname,
  validateStrongPassword,
  validateStudentId,
  verifyCertificateFileSecurity,
} from '../utils/security';

// 관리자 전용 로그인 계정 설정 (비밀번호는 프론트엔드 코드에 절대 포함하지 않고 Firebase Auth 서버에서만 검증)
export const ADMIN_LOGIN_EMAIL = (
  (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.trim() ||
  'admin@univmeeting.kr'
).toLowerCase();

const EXTRA_ADMIN_EMAILS: Set<string> = new Set(
  [
    ADMIN_LOGIN_EMAIL,
    ...((import.meta.env.VITE_ADMIN_EMAILS as string | undefined) ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  ]
);

export function isConfiguredAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return EXTRA_ADMIN_EMAILS.has(email.trim().toLowerCase());
}

const STORAGE_KEYS = {
  currentUser: 'univ-meeting:prod:current-user',
  localUsers: 'univ-meeting:prod:users-map',
  verifications: 'univ-meeting:prod:verifications',
  rooms: 'univ-meeting:prod:rooms',
  posts: 'univ-meeting:prod:posts',
  reports: 'univ-meeting:prod:reports',
  inquiries: 'univ-meeting:prod:inquiries',
  legacyRoomsPurged: 'univ-meeting:prod:legacy-rooms-purged-v2',
} as const;

// 가짜 방/게시글만 정리하고 회원·학교인증 기록은 절대 지우지 않음!
const LEGACY_FAKE_CONTENT_KEYS = [
  'univ-meeting:rooms:v1',
  'univ-meeting:posts:v1',
  'univ-meeting:rooms:v2',
  'univ-meeting:posts:v2',
];

const FIRESTORE_TIMEOUT_MS = 4000;

function purgeLegacyFakeContentOnce(): void {
  try {
    if (window.localStorage.getItem(STORAGE_KEYS.legacyRoomsPurged) === 'true') {
      return;
    }
    LEGACY_FAKE_CONTENT_KEYS.forEach((key) => window.localStorage.removeItem(key));
    window.localStorage.setItem(STORAGE_KEYS.legacyRoomsPurged, 'true');
  } catch {
    // ignore
  }
}

purgeLegacyFakeContentOnce();

function isLegacySeedRoom(room: MeetingRoom): boolean {
  if (/^room-(?:[1-9]|10)$/.test(room.id)) return true;
  if (
    room.hostUid?.startsWith('seed-') ||
    room.hostUid === 'local-user-ssu-01'
  ) {
    return true;
  }
  return false;
}

function isLegacySeedPost(post: BoardPost): boolean {
  if (/^post-(?:[1-9]|10)$/.test(post.id)) return true;
  if (
    post.authorUid?.startsWith('seed-') ||
    post.authorUid === 'local-user-ssu-01'
  ) {
    return true;
  }
  return false;
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota errors
  }
}

function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

async function safeFirestoreOp<T>(
  label: string,
  operation: () => Promise<T>,
  timeoutMs: number = FIRESTORE_TIMEOUT_MS
): Promise<T | null> {
  if (!isFirebaseConfigured || !db) return null;
  let timer: number | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => {
        reject(new Error(`Firestore operation timed out (${label})`));
      }, timeoutMs);
    });
    return await Promise.race([operation(), timeoutPromise]);
  } catch (err) {
    console.warn(`[Firestore 동기화 안내 - ${label}]`, err);
    return null;
  } finally {
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }
  }
}

function saveUserToLocalMap(profile: UserProfile): void {
  const map = readStorage<Record<string, UserProfile>>(STORAGE_KEYS.localUsers, {});
  map[profile.uid] = profile;
  writeStorage(STORAGE_KEYS.localUsers, map);
}

function getUserFromLocalMap(uid: string): UserProfile | null {
  const map = readStorage<Record<string, UserProfile>>(STORAGE_KEYS.localUsers, {});
  if (map[uid]) return map[uid];
  const legacyV2 = readStorage<Record<string, UserProfile>>(
    'univ-meeting:users-map:v2',
    {}
  );
  if (legacyV2[uid]) return legacyV2[uid];
  const legacyV1 = readStorage<Record<string, UserProfile>>(
    'univ-meeting:users-map:v1',
    {}
  );
  return legacyV1[uid] ?? null;
}

export function loadAllLocalUsers(): UserProfile[] {
  const map = readStorage<Record<string, UserProfile>>(STORAGE_KEYS.localUsers, {});
  return Object.values(map);
}

export function loadCachedCurrentUser(): UserProfile | null {
  if (isFirebaseConfigured) {
    // Firebase 연동 환경에서는 localStorage 변조를 통한 권한·인증 위조를 원천 차단하기 위해
    // 반드시 Firebase Auth + Firestore 서버 검증 완료 후 프로필을 활성화합니다.
    return null;
  }
  return readStorage<UserProfile | null>(STORAGE_KEYS.currentUser, null);
}

export function loadLocalRooms(): MeetingRoom[] {
  return readStorage<MeetingRoom[]>(STORAGE_KEYS.rooms, []).filter(
    (r) => !isLegacySeedRoom(r)
  );
}

export function loadLocalPosts(): BoardPost[] {
  return readStorage<BoardPost[]>(STORAGE_KEYS.posts, []).filter(
    (p) => !isLegacySeedPost(p)
  );
}

export function loadLocalVerificationRequests(): VerificationRequest[] {
  const current = readStorage<VerificationRequest[]>(STORAGE_KEYS.verifications, []);
  const legacyV2 = readStorage<VerificationRequest[]>(
    'univ-meeting:verifications:v2',
    []
  );
  if (legacyV2.length === 0) return current;
  const merged = new Map<string, VerificationRequest>();
  legacyV2.forEach((r) => merged.set(r.id, r));
  current.forEach((r) => merged.set(r.id, r));
  return Array.from(merged.values());
}

export function loadLocalReports(): ReportRecord[] {
  return readStorage<ReportRecord[]>(STORAGE_KEYS.reports, []);
}

export function loadLocalInquiries(): InquiryRecord[] {
  return readStorage<InquiryRecord[]>(STORAGE_KEYS.inquiries, []);
}

function mergeById<T extends { id: string; createdAt: number }>(
  remoteItems: T[],
  localItems: T[]
): T[] {
  const map = new Map<string, T>();
  localItems.forEach((item) => map.set(item.id, item));
  remoteItems.forEach((item) => map.set(item.id, item));
  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
}

function pickBestVerificationRequest(
  candidates: (VerificationRequest | null | undefined)[]
): VerificationRequest | null {
  const valid = candidates.filter((c): c is VerificationRequest => Boolean(c));
  if (valid.length === 0) return null;
  const approved = valid
    .filter((c) => c.status === 'approved')
    .sort((a, b) => (b.reviewedAt ?? b.submittedAt) - (a.reviewedAt ?? a.submittedAt));
  if (approved.length > 0) return approved[0];
  const pending = valid
    .filter((c) => c.status === 'pending')
    .sort((a, b) => b.submittedAt - a.submittedAt);
  if (pending.length > 0) return pending[0];
  return valid.sort(
    (a, b) => (b.reviewedAt ?? b.submittedAt) - (a.reviewedAt ?? a.submittedAt)
  )[0];
}

/**
 * 서버(Firestore) 문서를 단일 신뢰 원본(Source of Truth)으로 사용하여
 * localStorage 조작을 통한 '관리자 사칭(isAdmin)' 및 '인증 완료 위조(approved)' 공격을 차단합니다.
 */
function reconcileUserProfile(
  uid: string,
  email: string,
  displayName: string | null | undefined,
  remoteUser: Partial<UserProfile> | null,
  localUser: UserProfile | null,
  verifReq: VerificationRequest | null
): UserProfile {
  // 관리자 판별은 오직 Firebase Auth 검증 이메일 또는 서버 users 문서의 isAdmin 필드만 신뢰 (localUser 절대 불신!)
  const isAdmin =
    isConfiguredAdminEmail(email) || Boolean(remoteUser?.isAdmin === true);

  if (isAdmin) {
    return {
      uid,
      email,
      name: sanitizePlainText(remoteUser?.name || displayName || '운영관리자', 20),
      gender: remoteUser?.gender === '여' ? '여' : '남',
      university: '운영팀',
      department: '관리자',
      studentId: 'ADMIN',
      studentYear: '관리자',
      verified: true,
      verificationStatus: 'approved',
      isAdmin: true,
      createdAt: remoteUser?.createdAt || Date.now(),
    };
  }

  // Firebase 설정 환경에서는 오직 원격 서버(users / verificationRequests) 승인 기록만 인정!
  const allowLocalFallback = !isFirebaseConfigured;

  const isApproved =
    verifReq?.status === 'approved' ||
    remoteUser?.verificationStatus === 'approved' ||
    remoteUser?.verified === true ||
    (allowLocalFallback && localUser?.verificationStatus === 'approved');

  const isRejected =
    !isApproved &&
    (verifReq?.status === 'rejected' ||
      remoteUser?.verificationStatus === 'rejected');

  const isPending =
    !isApproved &&
    !isRejected &&
    (verifReq?.status === 'pending' ||
      remoteUser?.verificationStatus === 'pending' ||
      (allowLocalFallback && localUser?.verificationStatus === 'pending'));

  const finalStatus = isApproved
    ? 'approved'
    : isRejected
      ? 'rejected'
      : isPending
        ? 'pending'
        : 'unverified';

  const university = sanitizePlainText(
    verifReq?.university ||
      remoteUser?.university ||
      localUser?.university ||
      '미지정',
    60
  );
  const department = sanitizePlainText(
    verifReq?.department ||
      remoteUser?.department ||
      localUser?.department ||
      '학과 미입력',
    50
  );
  const studentId = sanitizePlainText(
    verifReq?.studentId ||
      remoteUser?.studentId ||
      localUser?.studentId ||
      '',
    16
  );
  const studentYear = sanitizePlainText(
    verifReq?.studentYear ||
      remoteUser?.studentYear ||
      localUser?.studentYear ||
      (studentId ? deriveStudentYearLabel(studentId) : '재학생'),
    16
  );
  const safeName =
    sanitizePlainText(
      remoteUser?.name || localUser?.name || displayName || '대학생',
      20
    ) || '대학생';

  return {
    uid,
    email: email || remoteUser?.email || '',
    name: safeName,
    gender: (remoteUser?.gender || localUser?.gender) === '여' ? '여' : '남',
    university,
    department,
    studentId,
    studentYear,
    verified: finalStatus === 'approved',
    verificationStatus: finalStatus,
    rejectionReason:
      finalStatus === 'rejected'
        ? sanitizePlainText(
            verifReq?.rejectionReason || remoteUser?.rejectionReason || '',
            200
          )
        : '',
    isAdmin: false,
    createdAt: remoteUser?.createdAt || localUser?.createdAt || Date.now(),
  };
}

export function translateFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

  switch (code) {
    case 'auth/email-already-in-use':
      return '이미 가입된 이메일이에요. 로그인해 주세요.';
    case 'auth/invalid-email':
      return '올바른 이메일 형식을 입력해 주세요.';
    case 'auth/weak-password':
      return '비밀번호는 6자 이상으로 입력해 주세요.';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return '이메일 또는 비밀번호가 올바르지 않아요.';
    case 'auth/too-many-requests':
      return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.';
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
      return 'Firebase 콘솔 > Authentication > Sign-in method에서 "이메일/비밀번호" 로그인을 사용 설정해 주세요.';
    case 'auth/network-request-failed':
      return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
    default:
      return error instanceof Error && error.message
        ? error.message
        : '인증 처리 중 오류가 발생했어요. 다시 시도해 주세요.';
  }
}

export interface SignUpInput {
  name: string;
  gender: GenderType;
  email: string;
  password: string;
  university: string;
  department: string;
}

export async function signUpWithEmail(input: SignUpInput): Promise<UserProfile> {
  const trimmedEmail = input.email.trim().toLowerCase();

  // 1) 관리자 이메일로의 일반 회원가입 원천 차단 (#5 방어)
  if (isConfiguredAdminEmail(trimmedEmail)) {
    throw new Error(
      '관리자 지정 이메일로는 일반 회원가입을 할 수 없어요.'
    );
  }
  if (!isSafeEmailAddress(trimmedEmail)) {
    throw new Error('올바른 이메일 주소를 입력해 주세요.');
  }

  // 2) 닉네임 XSS 및 관리자 사칭 검증 (#5, #7 방어)
  const nickCheck = validateNickname(input.name);
  if (!nickCheck.valid) {
    throw new Error(nickCheck.error ?? '올바른 이름(닉네임)을 입력해 주세요.');
  }

  // 3) 강력한 비밀번호 정책 강제 (#6 방어)
  const pwError = validateStrongPassword(input.password, trimmedEmail);
  if (pwError) {
    throw new Error(pwError);
  }

  // 4) 학과·대학명 스크립트 및 특수 태그 살균 (#7 방어)
  if (
    containsDangerousPayload(input.department) ||
    containsDangerousPayload(input.university)
  ) {
    throw new Error('소속 학교·학과 정보에 허용되지 않는 문자가 포함되어 있어요.');
  }
  const safeUniversity = sanitizePlainText(input.university, 60);
  const safeDept = sanitizePlainText(input.department, 50);
  if (!safeUniversity || safeUniversity === '전체 (상관없음)') {
    throw new Error('소속 대학교를 선택해 주세요.');
  }
  if (!safeDept) {
    throw new Error('학과(학부)를 입력해 주세요.');
  }

  if (!isFirebaseConfigured || !auth) {
    throw new Error('Firebase 설정(.env.local)이 확인되지 않았어요.');
  }

  const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, input.password);
  await updateProfile(cred.user, { displayName: nickCheck.cleaned }).catch(() => {});

  // 가입 시 무조건 일반 미인증 학생 권한으로만 생성 (절대 isAdmin/approved 부여 불가!)
  const profile: UserProfile = {
    uid: cred.user.uid,
    email: trimmedEmail,
    name: nickCheck.cleaned,
    gender: input.gender === '여' ? '여' : '남',
    university: safeUniversity,
    department: safeDept,
    studentId: '',
    studentYear: '재학생',
    verified: false,
    verificationStatus: 'unverified',
    isAdmin: false,
    createdAt: Date.now(),
  };

  writeStorage(STORAGE_KEYS.currentUser, profile);
  saveUserToLocalMap(profile);

  await safeFirestoreOp(
    'saveNewUser',
    () => setDoc(doc(db!, 'users', profile.uid), profile),
    2000
  );

  return profile;
}

export async function loginWithEmail(
  email: string,
  password: string
): Promise<UserProfile> {
  const trimmedEmail = email.trim();
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Firebase 설정(.env.local)이 확인되지 않았어요.');
  }

  // 무차별 비밀번호 대입(Brute-Force) 잠금 확인 (#6 방어)
  const lockSec = getLoginLockoutRemainingSeconds();
  if (lockSec > 0) {
    throw new Error(
      `로그인 실패가 반복되어 보안을 위해 잠겼어요. ${lockSec}초 후에 다시 시도해 주세요.`
    );
  }

  let uid = '';
  let fbEmail = trimmedEmail;
  let fbDisplayName: string | null = null;

  try {
    const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
    uid = cred.user.uid;
    fbEmail = cred.user.email ?? trimmedEmail;
    fbDisplayName = cred.user.displayName;
    resetLoginFailures();
  } catch (err) {
    const { lockedSeconds, failures } = recordLoginFailure();
    if (lockedSeconds > 0) {
      throw new Error(
        `비밀번호 5회 이상 오류로 ${lockedSeconds}초 동안 로그인이 제한돼요.`
      );
    }
    const baseMsg = translateFirebaseAuthError(err);
    throw new Error(`${baseMsg} (실패 ${failures}/5회)`);
  }

  // 1) 관리자 지정 이메일은 추가 Firestore 조회 대기 없이 즉시 로그인 전환 (백그라운드 동기화)
  if (isConfiguredAdminEmail(fbEmail)) {
    const adminProfile = reconcileUserProfile(
      uid,
      fbEmail,
      fbDisplayName,
      null,
      null,
      null
    );
    writeStorage(STORAGE_KEYS.currentUser, adminProfile);
    saveUserToLocalMap(adminProfile);
    if (db) {
      void setDoc(doc(db, 'users', uid), adminProfile, { merge: true }).catch(() => {});
    }
    return adminProfile;
  }

  // 2) 일반 학생 로그인: 단건 문서 2건만 1.8초 상한으로 병렬 조회하여 체감 지연 최소화 (실시간 onSnapshot이 백그라운드에서 계속 동기화)
  const [remoteUserSnap, remoteVerifSnap] = await Promise.all([
    safeFirestoreOp('getUserOnLogin', () => getDoc(doc(db!, 'users', uid)), 1800),
    safeFirestoreOp(
      'getVerifOnLogin',
      () => getDoc(doc(db!, 'verificationRequests', uid)),
      1800
    ),
  ]);

  const remoteUser =
    remoteUserSnap && remoteUserSnap.exists()
      ? (remoteUserSnap.data() as Partial<UserProfile>)
      : null;

  const directVerif =
    remoteVerifSnap && remoteVerifSnap.exists()
      ? ({ ...(remoteVerifSnap.data() as VerificationRequest), id: uid } as VerificationRequest)
      : null;

  // 단건 문서에 아직 승인/심사 기록이 없을 때만 과거 다른 ID로 저장된 인증 문서를 짧게(1.2초 상한) 추가 확인
  let queriedVerifs: VerificationRequest[] = [];
  if (
    directVerif?.status !== 'approved' &&
    remoteUser?.verificationStatus !== 'approved' &&
    remoteUser?.verified !== true
  ) {
    const remoteVerifByUidSnap = await safeFirestoreOp(
      'queryVerifByUidOnLogin',
      () =>
        getDocs(query(collection(db!, 'verificationRequests'), where('uid', '==', uid))),
      1200
    );
    queriedVerifs =
      remoteVerifByUidSnap?.docs.map(
        (d) => ({ ...(d.data() as VerificationRequest), id: d.id } as VerificationRequest)
      ) ?? [];
  }

  const remoteVerif = pickBestVerificationRequest([directVerif, ...queriedVerifs]);

  const localUser = getUserFromLocalMap(uid);

  const reconciled = reconcileUserProfile(
    uid,
    fbEmail,
    fbDisplayName,
    remoteUser,
    localUser,
    remoteVerif
  );

  writeStorage(STORAGE_KEYS.currentUser, reconciled);
  saveUserToLocalMap(reconciled);

  // 프로필 보정 쓰기는 로그인 화면 전환을 막지 않도록 백그라운드에서 비동기 처리
  if (
    db &&
    ((remoteUserSnap && !remoteUserSnap.exists()) ||
      reconciled.isAdmin ||
      (reconciled.verificationStatus === 'approved' &&
        (remoteUser?.verificationStatus !== 'approved' || remoteUser?.verified !== true)))
  ) {
    void setDoc(doc(db, 'users', uid), reconciled, { merge: true }).catch(() => {});
  }

  return reconciled;
}

export async function logoutUser(): Promise<void> {
  // 공용 PC(학교 전산실·도서관 등) 개인정보 잔류 방지를 위해 민감 로컬 캐시 전체 즉시 파기
  removeStorage(STORAGE_KEYS.currentUser);
  removeStorage(STORAGE_KEYS.localUsers);
  removeStorage(STORAGE_KEYS.verifications);
  removeStorage(STORAGE_KEYS.reports);
  removeStorage(STORAGE_KEYS.inquiries);
  removeStorage('univ-meeting:users-map:v1');
  removeStorage('univ-meeting:users-map:v2');
  removeStorage('univ-meeting:verifications:v2');
  if (isFirebaseConfigured && auth) {
    await signOut(auth).catch(() => {});
  }
}

/**
 * [개인정보 삭제권] 계정은 유지한 채 제출한 재학증명서 원본 및 학번 정보를 즉시 영구 파기합니다.
 */
export async function deleteMyVerificationData(
  user: UserProfile
): Promise<UserProfile> {
  const updated: UserProfile = {
    ...user,
    studentId: '',
    studentYear: '재학생',
    verified: false,
    verificationStatus: 'unverified',
    rejectionReason: '',
  };

  removeStorage(STORAGE_KEYS.verifications);
  writeStorage(STORAGE_KEYS.currentUser, updated);
  saveUserToLocalMap(updated);

  await Promise.all([
    safeFirestoreOp('deleteMyVerifDoc', () =>
      deleteDoc(doc(db!, 'verificationRequests', user.uid))
    ),
    safeFirestoreOp('resetUserVerifFields', () =>
      setDoc(doc(db!, 'users', user.uid), updated, { merge: true })
    ),
  ]);

  return updated;
}

/**
 * [회원탈퇴 및 전체 개인정보 즉시 파기]
 * 비밀번호 재인증 후 회원이 개설한 방·작성한 글·참여 내역·재학증명서·프로필·Firebase Auth 계정을 모두 영구 삭제합니다.
 */
export async function withdrawUserAccount(
  user: UserProfile,
  currentPassword: string,
  currentRooms: MeetingRoom[],
  currentPosts: BoardPost[]
): Promise<{ nextRooms: MeetingRoom[]; nextPosts: BoardPost[] }> {
  if (!currentPassword) {
    throw new Error('본인 확인을 위해 현재 비밀번호를 입력해 주세요.');
  }
  if (!isFirebaseConfigured || !auth || !auth.currentUser) {
    throw new Error('로그인 세션을 확인할 수 없어요. 다시 로그인한 뒤 시도해 주세요.');
  }

  const fbUser = auth.currentUser;
  if (fbUser.uid !== user.uid) {
    throw new Error('로그인 계정 정보가 일치하지 않아요.');
  }

  // 1) 본인 확인 재인증 (타인이 열린 브라우저에서 임의 탈퇴시키는 공격 차단 + Firebase recent-login 요건 충족)
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(fbUser, credential);

  // 2) 개설한 방 삭제 및 참여 중인 방에서 내 팀원 슬롯 정리
  const hostedRoomIds: string[] = [];
  const updatedJoinedRooms: MeetingRoom[] = [];
  const nextRooms: MeetingRoom[] = [];

  for (const room of currentRooms) {
    if (room.hostUid === user.uid) {
      hostedRoomIds.push(room.id);
      continue;
    }
    const inLeft = room.leftMembers.some((m) => m.uid === user.uid);
    const inRight = room.rightMembers.some((m) => m.uid === user.uid);
    if (inLeft || inRight) {
      const nextLeft = room.leftMembers.filter((m) => m.uid !== user.uid);
      const nextRight = room.rightMembers.filter((m) => m.uid !== user.uid);
      const cleaned: MeetingRoom = {
        ...room,
        leftMembers: nextLeft,
        rightMembers: nextRight,
        status: computeRoomStatus(room.format, nextLeft.length, nextRight.length),
      };
      updatedJoinedRooms.push(cleaned);
      nextRooms.push(cleaned);
    } else {
      nextRooms.push(room);
    }
  }

  // 3) 작성한 게시글 삭제 및 신청한 게시글에서 신청 내역 정리
  const authoredPostIds: string[] = [];
  const updatedAppliedPosts: BoardPost[] = [];
  const nextPosts: BoardPost[] = [];

  for (const post of currentPosts) {
    if (post.authorUid === user.uid) {
      authoredPostIds.push(post.id);
      continue;
    }
    if (post.applicants.some((a) => a.uid === user.uid)) {
      const nextApps = post.applicants.filter((a) => a.uid !== user.uid);
      const cleanedPost: BoardPost = { ...post, applicants: nextApps };
      updatedAppliedPosts.push(cleanedPost);
      nextPosts.push(cleanedPost);
    } else {
      nextPosts.push(post);
    }
  }

  writeStorage(STORAGE_KEYS.rooms, nextRooms);
  writeStorage(STORAGE_KEYS.posts, nextPosts);

  // 4) 승인 권한이 살아있는 상태에서 방·게시글 정리 후, 재학증명서 및 회원 프로필 문서 영구 삭제
  await Promise.all([
    ...hostedRoomIds.map((rid) =>
      safeFirestoreOp('withdrawDeleteRoom', () => deleteDoc(doc(db!, 'rooms', rid)))
    ),
    ...updatedJoinedRooms.map((rm) =>
      safeFirestoreOp('withdrawLeaveRoom', () =>
        setDoc(doc(db!, 'rooms', rm.id), rm, { merge: true })
      )
    ),
    ...authoredPostIds.map((pid) =>
      safeFirestoreOp('withdrawDeletePost', () => deleteDoc(doc(db!, 'posts', pid)))
    ),
    ...updatedAppliedPosts.map((pt) =>
      safeFirestoreOp('withdrawCancelPost', () =>
        updateDoc(doc(db!, 'posts', pt.id), { applicants: pt.applicants })
      )
    ),
  ]);

  await Promise.all([
    safeFirestoreOp('withdrawDeleteVerif', () =>
      deleteDoc(doc(db!, 'verificationRequests', user.uid))
    ),
    safeFirestoreOp('withdrawDeleteUserDoc', () =>
      deleteDoc(doc(db!, 'users', user.uid))
    ),
  ]);

  // 5) Firebase Authentication 계정 영구 삭제 및 로컬 스토리지 전량 파기
  await deleteUser(fbUser);
  await logoutUser();

  return { nextRooms, nextPosts };
}

/**
 * [관리자 전용] 개인정보 삭제 요청 접수 건에 대해 특정 회원의 DB 데이터(프로필·증명서·방·글)를 즉시 파기합니다.
 */
export async function deleteUserDataByAdmin(
  targetUid: string,
  currentRooms: MeetingRoom[],
  currentPosts: BoardPost[]
): Promise<{ nextRooms: MeetingRoom[]; nextPosts: BoardPost[] }> {
  const hostedRoomIds = currentRooms
    .filter((r) => r.hostUid === targetUid)
    .map((r) => r.id);
  const authoredPostIds = currentPosts
    .filter((p) => p.authorUid === targetUid)
    .map((p) => p.id);

  const nextRooms = currentRooms.filter((r) => r.hostUid !== targetUid);
  const nextPosts = currentPosts.filter((p) => p.authorUid !== targetUid);
  writeStorage(STORAGE_KEYS.rooms, nextRooms);
  writeStorage(STORAGE_KEYS.posts, nextPosts);

  const localMap = readStorage<Record<string, UserProfile>>(STORAGE_KEYS.localUsers, {});
  delete localMap[targetUid];
  writeStorage(STORAGE_KEYS.localUsers, localMap);

  await Promise.all([
    safeFirestoreOp('adminPurgeVerif', () =>
      deleteDoc(doc(db!, 'verificationRequests', targetUid))
    ),
    safeFirestoreOp('adminPurgeUser', () =>
      deleteDoc(doc(db!, 'users', targetUid))
    ),
    ...hostedRoomIds.map((rid) =>
      safeFirestoreOp('adminPurgeRoom', () => deleteDoc(doc(db!, 'rooms', rid)))
    ),
    ...authoredPostIds.map((pid) =>
      safeFirestoreOp('adminPurgePost', () => deleteDoc(doc(db!, 'posts', pid)))
    ),
  ]);

  return { nextRooms, nextPosts };
}

export function subscribeAuthAndProfile(
  onUserChange: (user: UserProfile | null) => void,
  onAuthReady?: () => void
): () => void {
  if (!isFirebaseConfigured || !auth || !db) {
    onUserChange(loadCachedCurrentUser());
    onAuthReady?.();
    return () => {};
  }

  const firestore = db;
  const firebaseAuth = auth;
  let profileUnsub: (() => void) | null = null;
  let verifUnsub: (() => void) | null = null;
  let verifQueryUnsub: (() => void) | null = null;

  const authUnsub = onAuthStateChanged(firebaseAuth, (fbUser) => {
    if (profileUnsub) {
      profileUnsub();
      profileUnsub = null;
    }
    if (verifUnsub) {
      verifUnsub();
      verifUnsub = null;
    }
    if (verifQueryUnsub) {
      verifQueryUnsub();
      verifQueryUnsub = null;
    }

    if (!fbUser || fbUser.isAnonymous) {
      removeStorage(STORAGE_KEYS.currentUser);
      onUserChange(null);
      onAuthReady?.();
      return;
    }

    const uid = fbUser.uid;
    const email = fbUser.email ?? '';
    let latestRemoteUser: Partial<UserProfile> | null = null;
    let latestDirectVerif: VerificationRequest | null = null;
    let latestQueriedVerifs: VerificationRequest[] = [];
    let userSnapSettled = false;
    let verifDocSettled = false;
    let verifQuerySettled = false;
    let syncedApprovedOnce = false;

    const emitReconciled = () => {
      if (!userSnapSettled || (!verifDocSettled && !verifQuerySettled)) {
        return;
      }
      const localNow = getUserFromLocalMap(uid);
      const bestVerif = pickBestVerificationRequest([
        latestDirectVerif,
        ...latestQueriedVerifs,
      ]);
      const reconciled = reconcileUserProfile(
        uid,
        email,
        fbUser.displayName,
        latestRemoteUser,
        localNow,
        bestVerif
      );
      writeStorage(STORAGE_KEYS.currentUser, reconciled);
      saveUserToLocalMap(reconciled);
      onUserChange(reconciled);
      onAuthReady?.();

      // 서버 verificationRequests 문서가 approved인데 users/{uid}에 아직 반영 안 된 경우 자동 복구 동기화
      if (
        !syncedApprovedOnce &&
        !reconciled.isAdmin &&
        reconciled.verificationStatus === 'approved' &&
        (latestRemoteUser?.verificationStatus !== 'approved' ||
          latestRemoteUser?.verified !== true)
      ) {
        syncedApprovedOnce = true;
        void setDoc(doc(firestore, 'users', uid), reconciled, { merge: true }).catch(
          () => {}
        );
      }
    };

    profileUnsub = onSnapshot(
      doc(firestore, 'users', uid),
      (snap) => {
        userSnapSettled = true;
        latestRemoteUser = snap.exists() ? (snap.data() as Partial<UserProfile>) : null;
        emitReconciled();
      },
      () => {
        userSnapSettled = true;
        emitReconciled();
      }
    );

    verifUnsub = onSnapshot(
      doc(firestore, 'verificationRequests', uid),
      (snap) => {
        verifDocSettled = true;
        latestDirectVerif = snap.exists()
          ? { ...(snap.data() as VerificationRequest), id: snap.id }
          : null;
        emitReconciled();
      },
      () => {
        verifDocSettled = true;
        emitReconciled();
      }
    );

    verifQueryUnsub = onSnapshot(
      query(collection(firestore, 'verificationRequests'), where('uid', '==', uid)),
      (snap) => {
        verifQuerySettled = true;
        latestQueriedVerifs = snap.docs.map((d) => ({
          ...(d.data() as VerificationRequest),
          id: d.id,
        }));
        emitReconciled();
      },
      () => {
        verifQuerySettled = true;
        emitReconciled();
      }
    );
  });

  return () => {
    if (profileUnsub) profileUnsub();
    if (verifUnsub) verifUnsub();
    if (verifQueryUnsub) verifQueryUnsub();
    authUnsub();
  };
}

export function subscribeAllUsers(
  onUsers: (users: UserProfile[]) => void
): () => void {
  if (!isFirebaseConfigured || !db) {
    onUsers(loadAllLocalUsers().filter((u) => !u.isAdmin));
    return () => {};
  }

  const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const remote: UserProfile[] = snap.docs.map((d) => ({
        ...(d.data() as UserProfile),
        uid: d.id,
      }));
      const verifs = loadLocalVerificationRequests();
      const list = remote
        .map((u) => {
          const matchedVerif = pickBestVerificationRequest(
            verifs.filter((r) => r.uid === u.uid)
          );
          const merged = reconcileUserProfile(
            u.uid,
            u.email,
            u.name,
            u,
            null,
            matchedVerif
          );
          saveUserToLocalMap(merged);
          return merged;
        })
        .filter((u) => !u.isAdmin && !isConfiguredAdminEmail(u.email))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      onUsers(list);
    },
    (err) => {
      console.warn('[Firestore 관리자 회원 목록 조회 오류]', err);
      onUsers(
        loadAllLocalUsers().filter(
          (u) => !u.isAdmin && !isConfiguredAdminEmail(u.email)
        )
      );
    }
  );
}

export async function setUserVerificationByAdmin(
  targetUser: UserProfile,
  decision: 'approved' | 'unverified',
  studentIdInput?: string
): Promise<UserProfile> {
  const nextStudentId = studentIdInput?.trim() || targetUser.studentId || '재학생인증';
  const nextStudentYear =
    studentIdInput?.trim() || targetUser.studentId
      ? deriveStudentYearLabel(nextStudentId)
      : targetUser.studentYear || '재학생';

  const updated: UserProfile = {
    ...targetUser,
    studentId: decision === 'approved' ? nextStudentId : targetUser.studentId,
    studentYear: decision === 'approved' ? nextStudentYear : targetUser.studentYear,
    verified: decision === 'approved',
    verificationStatus: decision,
    rejectionReason: '',
  };

  const localReqs = loadLocalVerificationRequests();
  const existingReq = localReqs.find((r) => r.uid === updated.uid);

  if (decision === 'approved') {
    const syncedReq: VerificationRequest = existingReq
      ? {
          ...existingReq,
          id: updated.uid,
          uid: updated.uid,
          university: updated.university,
          department: updated.department,
          studentId: updated.studentId,
          studentYear: updated.studentYear,
          status: 'approved',
          rejectionReason: '',
          reviewedAt: Date.now(),
        }
      : {
          id: updated.uid,
          uid: updated.uid,
          userName: updated.name,
          userEmail: updated.email,
          gender: updated.gender,
          university: updated.university,
          department: updated.department,
          studentId: updated.studentId,
          studentYear: updated.studentYear,
          certificateFileName: '관리자 직접 승인',
          certificateMimeType: 'text/plain',
          certificateDataUrl: '',
          status: 'approved',
          submittedAt: updated.createdAt || Date.now(),
          reviewedAt: Date.now(),
        };

    if (isFirebaseConfigured && db) {
      const [userWrite, verifWrite] = await Promise.allSettled([
        setDoc(doc(db, 'users', updated.uid), updated, { merge: true }),
        setDoc(doc(db, 'verificationRequests', updated.uid), syncedReq, {
          merge: true,
        }),
      ]);
      if (userWrite.status === 'rejected' && verifWrite.status === 'rejected') {
        throw new Error(
          'Firebase 콘솔 > Firestore Database > 규칙(Rules)에 최신 firestore.rules를 게시해 주세요. (서버 저장 권한 거부됨)'
        );
      }
      if (existingReq && existingReq.id !== updated.uid) {
        await deleteDoc(doc(db, 'verificationRequests', existingReq.id)).catch(() => {});
      }
    }

    writeStorage(STORAGE_KEYS.verifications, [
      syncedReq,
      ...localReqs.filter((r) => r.uid !== updated.uid),
    ]);
  } else {
    if (isFirebaseConfigured && db) {
      const sameUidDocs = await getDocs(
        query(collection(db, 'verificationRequests'), where('uid', '==', updated.uid))
      ).catch(() => null);
      const [userWrite, verifDel] = await Promise.allSettled([
        setDoc(doc(db, 'users', updated.uid), updated, { merge: true }),
        deleteDoc(doc(db, 'verificationRequests', updated.uid)),
      ]);
      if (userWrite.status === 'rejected' && verifDel.status === 'rejected') {
        throw new Error(
          'Firebase 콘솔 > Firestore Database > 규칙(Rules)에 최신 firestore.rules를 게시해 주세요. (서버 저장 권한 거부됨)'
        );
      }
      if (sameUidDocs) {
        await Promise.all(
          sameUidDocs.docs.map((d) => deleteDoc(d.ref).catch(() => {}))
        );
      }
    }

    writeStorage(
      STORAGE_KEYS.verifications,
      localReqs.filter((r) => r.uid !== updated.uid)
    );
  }

  saveUserToLocalMap(updated);
  return updated;
}

export async function compressCertificateFile(file: File): Promise<{
  dataUrl: string;
  mimeType: string;
  fileName: string;
}> {
  // 확장자 위조 · 매직 바이트(실제 바이너리 시그니처) · 악성 PDF 스크립트 정밀 검사 (#8 방어)
  const { detectedKind, safeFileName } = await verifyCertificateFileSecurity(file);

  if (detectedKind === 'pdf') {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('파일을 읽는 중 오류가 발생했어요.'));
      reader.readAsDataURL(file);
    });
    if (!isSafeCertificateDataUrl(dataUrl, 'pdf')) {
      throw new Error('유효하지 않은 PDF 데이터 형식이에요.');
    }
    return { dataUrl, mimeType: 'application/pdf', fileName: safeFileName };
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('이미지를 읽는 중 오류가 발생했어요.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error('손상되었거나 이미지가 아닌 파일이에요.'));
    image.src = rawDataUrl;
  });

  if (img.naturalWidth < 50 || img.naturalHeight < 50) {
    throw new Error('식별 가능한 해상도의 재학증명서 이미지를 업로드해 주세요.');
  }

  const maxDim = 1100;
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    if (width >= height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  // 캔버스 재인코딩으로 EXIF 위치정보(GPS) 및 이미지 내부 은닉 악성 페이로드 완전 제거
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('브라우저 이미지 보안 변환을 처리할 수 없어요.');
  }
  ctx.drawImage(img, 0, 0, width, height);
  const compressed = canvas.toDataURL('image/jpeg', 0.76);
  if (!isSafeCertificateDataUrl(compressed, 'image')) {
    throw new Error('이미지 변환 결과가 보안 기준을 충족하지 않아요.');
  }
  return {
    dataUrl: compressed,
    mimeType: 'image/jpeg',
    fileName: safeFileName,
  };
}

export interface SubmitVerificationInput {
  user: UserProfile;
  university: string;
  department: string;
  studentId: string;
  certificateFileName: string;
  certificateMimeType: string;
  certificateDataUrl: string;
}

export async function submitSchoolVerification(
  input: SubmitVerificationInput
): Promise<{ updatedUser: UserProfile; request: VerificationRequest }> {
  const waitSec = checkAndRecordActionCooldown('submit-verification', 10_000);
  if (waitSec > 0) {
    throw new Error(`잠시 후(${waitSec}초 뒤) 다시 제출해 주세요.`);
  }

  const sidCheck = validateStudentId(input.studentId);
  if (!sidCheck.valid) {
    throw new Error(sidCheck.error ?? '올바른 학번을 입력해 주세요.');
  }

  if (
    containsDangerousPayload(input.department) ||
    containsDangerousPayload(input.university)
  ) {
    throw new Error('학교·학과 정보에 허용되지 않는 문자가 포함되어 있어요.');
  }

  if (!isSafeCertificateDataUrl(input.certificateDataUrl)) {
    throw new Error('검증되지 않은 증명서 파일 형식이에요. 다시 업로드해 주세요.');
  }

  const safeUniversity = sanitizePlainText(input.university, 60);
  const deptTrimmed =
    sanitizePlainText(input.department, 50) || input.user.department;
  const studentIdTrimmed = sidCheck.cleaned;
  const studentYear = deriveStudentYearLabel(studentIdTrimmed);
  const safeCertName = sanitizePlainText(input.certificateFileName, 80);
  const now = Date.now();

  const request: VerificationRequest = {
    id: input.user.uid,
    uid: input.user.uid,
    userName: sanitizePlainText(input.user.name, 20),
    userEmail: input.user.email,
    gender: input.user.gender,
    university: safeUniversity,
    department: deptTrimmed,
    studentId: studentIdTrimmed,
    studentYear,
    certificateFileName: safeCertName,
    certificateMimeType: input.certificateMimeType,
    certificateDataUrl: input.certificateDataUrl,
    status: 'pending',
    submittedAt: now,
  };

  const updatedUser: UserProfile = {
    ...input.user,
    university: safeUniversity,
    department: deptTrimmed,
    studentId: studentIdTrimmed,
    studentYear,
    verified: false,
    verificationStatus: 'pending',
    rejectionReason: '',
  };

  writeStorage(STORAGE_KEYS.currentUser, updatedUser);
  saveUserToLocalMap(updatedUser);

  await Promise.all([
    safeFirestoreOp('submitVerificationRequest', () =>
      setDoc(doc(db!, 'verificationRequests', request.id), request)
    ),
    safeFirestoreOp('updateUserPendingStatus', () =>
      setDoc(doc(db!, 'users', updatedUser.uid), updatedUser, { merge: true })
    ),
  ]);

  return { updatedUser, request };
}

/** 일반 재학생 본인 단건 인증 내역만 안전하게 구독 (타인의 재학증명서 접근 원천 차단) */
export function subscribeMyVerificationRequest(
  uid: string,
  onRequest: (request: VerificationRequest | undefined) => void
): () => void {
  if (!uid || !isFirebaseConfigured || !db) {
    onRequest(undefined);
    return () => {};
  }
  let directItem: VerificationRequest | null = null;
  let queriedItems: VerificationRequest[] = [];

  const emit = () => {
    const best = pickBestVerificationRequest([directItem, ...queriedItems]);
    onRequest(best ?? undefined);
  };

  const unsubDoc = onSnapshot(
    doc(db, 'verificationRequests', uid),
    (snap) => {
      directItem = snap.exists()
        ? { ...(snap.data() as VerificationRequest), id: snap.id }
        : null;
      emit();
    },
    () => {
      directItem = null;
      emit();
    }
  );

  const unsubQuery = onSnapshot(
    query(collection(db, 'verificationRequests'), where('uid', '==', uid)),
    (snap) => {
      queriedItems = snap.docs.map((d) => ({
        ...(d.data() as VerificationRequest),
        id: d.id,
      }));
      emit();
    },
    () => {
      queriedItems = [];
      emit();
    }
  );

  return () => {
    unsubDoc();
    unsubQuery();
  };
}

export function subscribeVerificationRequests(
  onRequests: (requests: VerificationRequest[]) => void
): () => void {
  if (!isFirebaseConfigured || !db) {
    onRequests(loadLocalVerificationRequests());
    return () => {};
  }

  const q = query(
    collection(db, 'verificationRequests'),
    orderBy('submittedAt', 'desc')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const remote: VerificationRequest[] = snapshot.docs.map((d) => ({
        ...(d.data() as VerificationRequest),
        id: d.id,
      }));
      // 동일 uid로 중복 생성된 과거 인증 신청서가 있을 경우 가장 우선순위 높은(approved 우선) 건으로 통합 표시
      const byUid = new Map<string, VerificationRequest[]>();
      remote.forEach((item) => {
        const key = item.uid || item.id;
        const arr = byUid.get(key) ?? [];
        arr.push(item);
        byUid.set(key, arr);
      });
      const deduped: VerificationRequest[] = [];
      byUid.forEach((group) => {
        const best = pickBestVerificationRequest(group);
        if (best) deduped.push(best);
      });
      deduped.sort((a, b) => b.submittedAt - a.submittedAt);
      writeStorage(STORAGE_KEYS.verifications, deduped);
      onRequests(deduped);
    },
    (err) => {
      console.warn('[Firestore 인증 심사 목록 조회 오류]', err);
      onRequests(loadLocalVerificationRequests());
    }
  );
}

/**
 * 관리자 포털 진입 시 verificationRequests에서는 이미 'approved'로 처리되어 있으나
 * 과거 권한 규칙/문서 ID 차이로 users/{uid} 또는 verificationRequests/{uid}에 미반영된 계정을 자동 복구합니다.
 */
export async function repairApprovedUsersInFirestore(
  requests: VerificationRequest[],
  users: UserProfile[]
): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  const userByUid = new Map(users.map((u) => [u.uid, u]));
  const tasks: Promise<unknown>[] = [];

  for (const req of requests) {
    if (req.status !== 'approved' || !req.uid) continue;
    const matchedUser = userByUid.get(req.uid);
    const needsUserRepair =
      !matchedUser ||
      matchedUser.verified !== true ||
      matchedUser.verificationStatus !== 'approved';
    const needsCanonicalVerifDoc = req.id !== req.uid;

    if (needsUserRepair) {
      const repairedProfile: UserProfile = {
        uid: req.uid,
        email: matchedUser?.email || req.userEmail,
        name: matchedUser?.name || req.userName,
        gender: matchedUser?.gender || req.gender,
        university: req.university || matchedUser?.university || '미지정',
        department: req.department || matchedUser?.department || '학과 미입력',
        studentId: req.studentId || matchedUser?.studentId || '재학생인증',
        studentYear:
          req.studentYear ||
          matchedUser?.studentYear ||
          deriveStudentYearLabel(req.studentId || ''),
        verified: true,
        verificationStatus: 'approved',
        rejectionReason: '',
        isAdmin: false,
        createdAt: matchedUser?.createdAt || req.submittedAt || Date.now(),
      };
      tasks.push(
        setDoc(doc(db, 'users', req.uid), repairedProfile, { merge: true }).catch(
          () => {}
        )
      );
    }

    if (needsCanonicalVerifDoc) {
      const canonicalReq: VerificationRequest = { ...req, id: req.uid };
      tasks.push(
        setDoc(doc(db, 'verificationRequests', req.uid), canonicalReq, {
          merge: true,
        })
          .then(() => deleteDoc(doc(db!, 'verificationRequests', req.id)))
          .catch(() => {})
      );
    }
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
}

export async function reviewVerificationRequest(
  request: VerificationRequest,
  decision: 'approved' | 'rejected',
  rejectionReason?: string
): Promise<VerificationRequest[]> {
  const reviewedAt = Date.now();
  const canonicalId = request.uid || request.id;
  const updatedReq: VerificationRequest = {
    ...request,
    id: canonicalId,
    uid: canonicalId,
    status: decision,
    rejectionReason: decision === 'rejected' ? rejectionReason ?? '' : '',
    reviewedAt,
  };

  const localTarget = getUserFromLocalMap(canonicalId);
  const updatedTarget: UserProfile = {
    uid: canonicalId,
    email: localTarget?.email || request.userEmail,
    name: localTarget?.name || request.userName,
    gender: localTarget?.gender || request.gender,
    university: request.university,
    department: request.department,
    studentId: request.studentId,
    studentYear: request.studentYear,
    verified: decision === 'approved',
    verificationStatus: decision,
    rejectionReason: decision === 'rejected' ? rejectionReason ?? '' : '',
    isAdmin: false,
    createdAt: localTarget?.createdAt || request.submittedAt,
  };

  if (isFirebaseConfigured && db) {
    const [verifWrite, userWrite] = await Promise.allSettled([
      setDoc(doc(db, 'verificationRequests', canonicalId), updatedReq, {
        merge: true,
      }),
      setDoc(doc(db, 'users', canonicalId), updatedTarget, {
        merge: true,
      }),
    ]);
    if (verifWrite.status === 'rejected' && userWrite.status === 'rejected') {
      throw new Error(
        'Firebase 콘솔 > Firestore Database > 규칙(Rules)에 최신 firestore.rules를 게시해 주세요. (서버 저장 권한 거부됨)'
      );
    }
    if (request.id !== canonicalId) {
      await deleteDoc(doc(db, 'verificationRequests', request.id)).catch(() => {});
    }
  }

  saveUserToLocalMap(updatedTarget);

  const nextReqs = loadLocalVerificationRequests()
    .filter((item) => item.id !== request.id && item.uid !== canonicalId);
  nextReqs.unshift(updatedReq);
  writeStorage(STORAGE_KEYS.verifications, nextReqs);

  return nextReqs;
}

export function subscribeRooms(onRooms: (rooms: MeetingRoom[]) => void): () => void {
  const initialLocal = loadLocalRooms();
  onRooms(initialLocal);

  if (!isFirebaseConfigured || !db) {
    return () => {};
  }

  const firestore = db;
  const q = query(collection(firestore, 'rooms'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const legacyDocIds: string[] = [];
      const remoteItems: MeetingRoom[] = [];

      snapshot.docs.forEach((d) => {
        const room = { ...(d.data() as MeetingRoom), id: d.id };
        if (isLegacySeedRoom(room)) {
          legacyDocIds.push(d.id);
        } else {
          remoteItems.push(room);
        }
      });

      if (legacyDocIds.length > 0 && auth?.currentUser) {
        legacyDocIds.forEach((docId) => {
          void deleteDoc(doc(firestore, 'rooms', docId)).catch(() => {});
        });
      }

      const localItems = loadLocalRooms();
      const merged =
        remoteItems.length > 0 ? mergeById(remoteItems, localItems) : remoteItems;
      const now = Date.now();
      const pendingLocal = localItems.filter(
        (loc) =>
          !merged.some((m) => m.id === loc.id) && now - loc.createdAt < 15000
      );
      const finalRooms = [...pendingLocal, ...merged].sort(
        (a, b) => b.createdAt - a.createdAt
      );
      writeStorage(STORAGE_KEYS.rooms, finalRooms);
      onRooms(finalRooms);
    },
    () => {
      onRooms(loadLocalRooms());
    }
  );
}

export function subscribePosts(onPosts: (posts: BoardPost[]) => void): () => void {
  const initialLocal = loadLocalPosts();
  onPosts(initialLocal);

  if (!isFirebaseConfigured || !db) {
    return () => {};
  }

  const firestore = db;
  const q = query(collection(firestore, 'posts'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const legacyDocIds: string[] = [];
      const remoteItems: BoardPost[] = [];

      snapshot.docs.forEach((d) => {
        const post = { ...(d.data() as BoardPost), id: d.id };
        if (isLegacySeedPost(post)) {
          legacyDocIds.push(d.id);
        } else {
          remoteItems.push(post);
        }
      });

      if (legacyDocIds.length > 0 && auth?.currentUser) {
        legacyDocIds.forEach((docId) => {
          void deleteDoc(doc(firestore, 'posts', docId)).catch(() => {});
        });
      }

      const localItems = loadLocalPosts();
      const merged =
        remoteItems.length > 0 ? mergeById(remoteItems, localItems) : remoteItems;
      const now = Date.now();
      const pendingLocal = localItems.filter(
        (loc) =>
          !merged.some((m) => m.id === loc.id) && now - loc.createdAt < 15000
      );
      const finalPosts = [...pendingLocal, ...merged].sort(
        (a, b) => b.createdAt - a.createdAt
      );
      writeStorage(STORAGE_KEYS.posts, finalPosts);
      onPosts(finalPosts);
    },
    () => {
      onPosts(loadLocalPosts());
    }
  );
}

export interface CreateRoomInput {
  title: string;
  format: RoomFormat;
  schedule: string;
  location: string;
  opponentUniversity: string;
  intro: string;
  host: UserProfile;
}

export async function createMeetingRoom(
  input: CreateRoomInput,
  currentRooms: MeetingRoom[]
): Promise<{ room: MeetingRoom; nextRooms: MeetingRoom[] }> {
  if (!input.host.verified || input.host.verificationStatus !== 'approved') {
    throw new Error('학교 인증 승인 완료 후 방을 생성할 수 있어요.');
  }
  const waitSec = checkAndRecordActionCooldown('create-room', 10_000);
  if (waitSec > 0) {
    throw new Error(`도배 방지를 위해 ${waitSec}초 후에 새 방을 만들 수 있어요.`);
  }
  if (containsDangerousPayload(input.title) || containsDangerousPayload(input.intro)) {
    throw new Error('방 제목이나 소개에 허용되지 않는 스크립트가 포함되어 있어요.');
  }

  const id = `room-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const hostShort = getShortUniversityName(input.host.university);
  const safeOpponentUniv = sanitizePlainText(input.opponentUniversity, 60);
  const opponentShort = getShortUniversityName(safeOpponentUniv);
  const opponentGender: GenderType = input.host.gender === '남' ? '여' : '남';
  const safeTitle = sanitizePlainText(input.title, 80);
  const safeIntro = sanitizePlainText(input.intro, 500, true);

  const hostMember: TeamMemberItem = {
    id: `m-${Date.now()}-host`,
    uid: input.host.uid,
    departmentAndYear: `${sanitizePlainText(input.host.department, 40)} · ${sanitizePlainText(input.host.studentYear, 16)}`,
    role: '방장',
    gender: input.host.gender,
  };

  const newRoom: MeetingRoom = {
    id,
    title: safeTitle || `${hostShort} × ${opponentShort} ${input.format} 미팅`,
    format: input.format,
    status: '모집 중',
    leftUniversity: {
      name: input.host.university,
      shortName: hostShort,
      gender: input.host.gender,
    },
    rightUniversity: {
      name: safeOpponentUniv,
      shortName: opponentShort,
      gender: opponentGender,
    },
    schedule: sanitizePlainText(input.schedule, 50),
    location: sanitizePlainText(input.location, 50),
    intro:
      safeIntro ||
      '편하게 밥 먹으면서 이야기 나눠요! 좋은 인연 만나고 싶습니다.',
    hostUid: input.host.uid,
    hostDepartment: `${hostShort} ${sanitizePlainText(input.host.department, 40)}`,
    leftMembers: [hostMember],
    rightMembers: [],
    createdAt: Date.now(),
  };

  const nextRooms = [newRoom, ...currentRooms];
  writeStorage(STORAGE_KEYS.rooms, nextRooms);

  await safeFirestoreOp('createRoom', () =>
    setDoc(doc(db!, 'rooms', newRoom.id), newRoom)
  );

  return { room: newRoom, nextRooms };
}

export async function deleteMeetingRoom(
  roomId: string,
  currentRooms: MeetingRoom[],
  caller?: UserProfile | null
): Promise<MeetingRoom[]> {
  const target = currentRooms.find((r) => r.id === roomId);
  if (
    target &&
    caller &&
    !caller.isAdmin &&
    target.hostUid !== caller.uid
  ) {
    throw new Error('방장 본인 또는 관리자만 방을 삭제할 수 있어요.');
  }
  const nextRooms = currentRooms.filter((r) => r.id !== roomId);
  writeStorage(STORAGE_KEYS.rooms, nextRooms);

  await safeFirestoreOp('deleteRoom', () => deleteDoc(doc(db!, 'rooms', roomId)));
  return nextRooms;
}

export async function toggleRoomJoin(
  room: MeetingRoom,
  user: UserProfile,
  currentRooms: MeetingRoom[]
): Promise<{
  action: 'joined' | 'cancelled' | 'wrong-univ' | 'full' | 'host-cannot-leave';
  nextRooms: MeetingRoom[];
}> {
  const isLeftUniv = room.leftUniversity.name === user.university;
  const isRightUniv = room.rightUniversity.name === user.university;

  if (!isLeftUniv && !isRightUniv) {
    return { action: 'wrong-univ', nextRooms: currentRooms };
  }

  if (room.hostUid === user.uid) {
    return { action: 'host-cannot-leave', nextRooms: currentRooms };
  }

  const maxPerTeam = getMaxMembersPerTeam(room.format);
  const targetSide: 'left' | 'right' = isLeftUniv ? 'left' : 'right';
  const currentSideMembers =
    targetSide === 'left' ? room.leftMembers : room.rightMembers;
  const alreadyJoined = currentSideMembers.some((m) => m.uid === user.uid);

  let nextLeft = room.leftMembers;
  let nextRight = room.rightMembers;
  let action: 'joined' | 'cancelled';

  if (alreadyJoined) {
    if (targetSide === 'left') {
      nextLeft = room.leftMembers.filter((m) => m.uid !== user.uid);
    } else {
      nextRight = room.rightMembers.filter((m) => m.uid !== user.uid);
    }
    action = 'cancelled';
  } else {
    if (currentSideMembers.length >= maxPerTeam) {
      return { action: 'full', nextRooms: currentRooms };
    }
    const newMember: TeamMemberItem = {
      id: `m-${Date.now()}`,
      uid: user.uid,
      departmentAndYear: `${user.department} · ${user.studentYear}`,
      role: '팀원',
      gender:
        targetSide === 'left'
          ? room.leftUniversity.gender
          : room.rightUniversity.gender,
    };
    if (targetSide === 'left') {
      nextLeft = [...room.leftMembers, newMember];
    } else {
      nextRight = [...room.rightMembers, newMember];
    }
    action = 'joined';
  }

  const nextStatus = computeRoomStatus(room.format, nextLeft.length, nextRight.length);
  const updatedRoom: MeetingRoom = {
    ...room,
    leftMembers: nextLeft,
    rightMembers: nextRight,
    status: nextStatus,
  };

  const nextRooms = currentRooms.map((item) =>
    item.id === room.id ? updatedRoom : item
  );
  writeStorage(STORAGE_KEYS.rooms, nextRooms);

  await safeFirestoreOp('toggleRoomJoin', () =>
    setDoc(doc(db!, 'rooms', room.id), updatedRoom, { merge: true })
  );

  return { action, nextRooms };
}

export interface CreatePostInput {
  tab: BoardTabType;
  title: string;
  format: RoomFormat;
  date: string;
  location: string;
  targetUniversity: string;
  content: string;
  author: UserProfile;
}

export async function createBoardPost(
  input: CreatePostInput,
  currentPosts: BoardPost[]
): Promise<{ post: BoardPost; nextPosts: BoardPost[] }> {
  if (!input.author.verified || input.author.verificationStatus !== 'approved') {
    throw new Error('학교 인증 승인 완료 후 모집글을 작성할 수 있어요.');
  }
  const waitSec = checkAndRecordActionCooldown('create-post', 10_000);
  if (waitSec > 0) {
    throw new Error(`도배 방지를 위해 ${waitSec}초 후에 새 글을 작성할 수 있어요.`);
  }
  if (containsDangerousPayload(input.title) || containsDangerousPayload(input.content)) {
    throw new Error('제목이나 본문에 허용되지 않는 스크립트가 포함되어 있어요.');
  }

  const safeTitle = sanitizePlainText(input.title, 100);
  const safeContent = sanitizePlainText(input.content, 1000, true);
  if (safeTitle.length < 2 || safeContent.length < 2) {
    throw new Error('제목과 소개 내용을 2자 이상 입력해 주세요.');
  }

  const newPost: BoardPost = {
    id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tab: input.tab,
    status: '모집 중',
    gender: input.author.gender,
    title: safeTitle,
    university: sanitizePlainText(input.author.university, 60),
    department: sanitizePlainText(input.author.department, 50),
    format: input.format,
    date: sanitizePlainText(input.date, 50),
    location: sanitizePlainText(input.location, 50),
    targetUniversity: sanitizePlainText(input.targetUniversity, 60),
    content: safeContent,
    authorUid: input.author.uid,
    applicants: [],
    createdAt: Date.now(),
  };

  const nextPosts = [newPost, ...currentPosts];
  writeStorage(STORAGE_KEYS.posts, nextPosts);

  await safeFirestoreOp('createBoardPost', () =>
    setDoc(doc(db!, 'posts', newPost.id), newPost)
  );

  return { post: newPost, nextPosts };
}

export async function toggleBoardPostStatus(
  post: BoardPost,
  currentPosts: BoardPost[],
  caller?: UserProfile | null
): Promise<BoardPost[]> {
  if (caller && !caller.isAdmin && post.authorUid !== caller.uid) {
    throw new Error('작성자 본인 또는 관리자만 상태를 변경할 수 있어요.');
  }
  const nextStatus = post.status === '모집 중' ? '마감' : '모집 중';
  const updated: BoardPost = { ...post, status: nextStatus };
  const nextPosts = currentPosts.map((p) => (p.id === post.id ? updated : p));
  writeStorage(STORAGE_KEYS.posts, nextPosts);

  await safeFirestoreOp('toggleBoardPostStatus', () =>
    updateDoc(doc(db!, 'posts', post.id), { status: nextStatus })
  );
  return nextPosts;
}

export async function deleteBoardPost(
  postId: string,
  currentPosts: BoardPost[],
  caller?: UserProfile | null
): Promise<BoardPost[]> {
  const target = currentPosts.find((p) => p.id === postId);
  if (target && caller && !caller.isAdmin && target.authorUid !== caller.uid) {
    throw new Error('작성자 본인 또는 관리자만 게시글을 삭제할 수 있어요.');
  }
  const nextPosts = currentPosts.filter((p) => p.id !== postId);
  writeStorage(STORAGE_KEYS.posts, nextPosts);

  await safeFirestoreOp('deleteBoardPost', () =>
    deleteDoc(doc(db!, 'posts', postId))
  );
  return nextPosts;
}

export async function togglePostApply(
  post: BoardPost,
  user: UserProfile,
  currentPosts: BoardPost[]
): Promise<{ action: 'applied' | 'cancelled'; nextPosts: BoardPost[] }> {
  const alreadyApplied = post.applicants.some((a) => a.uid === user.uid);
  const nextApplicants = alreadyApplied
    ? post.applicants.filter((a) => a.uid !== user.uid)
    : [
        ...post.applicants,
        {
          uid: user.uid,
          university: user.university,
          department: user.department,
          appliedAt: Date.now(),
        },
      ];

  const updatedPost: BoardPost = {
    ...post,
    applicants: nextApplicants,
  };

  const nextPosts = currentPosts.map((item) =>
    item.id === post.id ? updatedPost : item
  );
  writeStorage(STORAGE_KEYS.posts, nextPosts);

  await safeFirestoreOp('togglePostApply', () =>
    updateDoc(doc(db!, 'posts', post.id), {
      applicants: nextApplicants,
    })
  );

  return { action: alreadyApplied ? 'cancelled' : 'applied', nextPosts };
}

export async function submitReport(record: ReportRecord): Promise<void> {
  if (checkAndRecordActionCooldown('submit-report', 10_000) > 0) {
    return;
  }
  const sanitized: ReportRecord = {
    targetType: record.targetType,
    ...(record.targetId ? { targetId: sanitizePlainText(record.targetId, 64) } : {}),
    reason: sanitizePlainText(record.reason, 40),
    detail: sanitizePlainText(record.detail, 500, true),
    reporterUid: sanitizePlainText(record.reporterUid, 64),
    createdAt: Date.now(),
  };
  await safeFirestoreOp('submitReport', () =>
    addDoc(collection(db!, 'reports'), sanitized)
  );
}

export function subscribeReports(
  onReports: (reports: ReportRecord[]) => void
): () => void {
  onReports(loadLocalReports());
  if (!isFirebaseConfigured || !db) return () => {};
  const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const items: ReportRecord[] = snap.docs.map((d) => ({
        ...(d.data() as ReportRecord),
        id: d.id,
      }));
      onReports(items.length > 0 ? items : loadLocalReports());
    },
    () => onReports(loadLocalReports())
  );
}

export async function submitInquiry(record: InquiryRecord): Promise<void> {
  if (checkAndRecordActionCooldown('submit-inquiry', 10_000) > 0) {
    return;
  }
  const safeContent = sanitizePlainText(record.content, 1000, true);
  if (safeContent.length < 2) return;
  const sanitized: InquiryRecord = {
    content: safeContent,
    userUid: sanitizePlainText(record.userUid, 64),
    email: isSafeEmailAddress(record.email) ? record.email.trim() : '',
    createdAt: Date.now(),
  };
  await safeFirestoreOp('submitInquiry', () =>
    addDoc(collection(db!, 'inquiries'), sanitized)
  );
}

export function subscribeInquiries(
  onInquiries: (inquiries: InquiryRecord[]) => void
): () => void {
  onInquiries(loadLocalInquiries());
  if (!isFirebaseConfigured || !db) return () => {};
  const q = query(collection(db, 'inquiries'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const items: InquiryRecord[] = snap.docs.map((d) => ({
        ...(d.data() as InquiryRecord),
        id: d.id,
      }));
      onInquiries(items.length > 0 ? items : loadLocalInquiries());
    },
    () => onInquiries(loadLocalInquiries())
  );
}
