import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
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
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
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

// 관리자 전용 로그인 계정 설정 (.env.local에서 변경 가능)
export const ADMIN_LOGIN_EMAIL = (
  (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.trim() ||
  'admin@univmeeting.kr'
).toLowerCase();

const ADMIN_INITIAL_PASSWORD =
  (import.meta.env.VITE_ADMIN_PASSWORD as string | undefined)?.trim() || '';

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

const FIRESTORE_TIMEOUT_MS = 10000;

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
  operation: () => Promise<T>
): Promise<T | null> {
  if (!isFirebaseConfigured || !db) return null;
  let timer: number | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => {
        reject(new Error(`Firestore operation timed out (${label})`));
      }, FIRESTORE_TIMEOUT_MS);
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

/**
 * 회원 프로필과 인증 신청 기록(원격 + 로컬)을 교차 검증하여
 * 이미 승인(approved)되었거나 심사 대기(pending) 중인 학교 인증 상태가
 * 어떤 경우에도 'unverified'로 초기화되지 않도록 보장합니다.
 */
function reconcileUserProfile(
  uid: string,
  email: string,
  displayName: string | null | undefined,
  remoteUser: Partial<UserProfile> | null,
  localUser: UserProfile | null,
  verifReq: VerificationRequest | null
): UserProfile {
  const isAdmin =
    isConfiguredAdminEmail(email) ||
    Boolean(remoteUser?.isAdmin) ||
    Boolean(localUser?.isAdmin);

  if (isAdmin) {
    return {
      uid,
      email,
      name: remoteUser?.name || localUser?.name || displayName || '운영관리자',
      gender: remoteUser?.gender || localUser?.gender || '남',
      university: remoteUser?.university || localUser?.university || '운영팀',
      department: remoteUser?.department || localUser?.department || '관리자',
      studentId: remoteUser?.studentId || localUser?.studentId || 'ADMIN',
      studentYear: remoteUser?.studentYear || localUser?.studentYear || '관리자',
      verified: true,
      verificationStatus: 'approved',
      isAdmin: true,
      createdAt: remoteUser?.createdAt || localUser?.createdAt || Date.now(),
    };
  }

  // 승인 상태 우선순위:
  // 1) verificationRequests 문서가 'approved' 이거나 users 문서가 'approved' / verified === true 이면 무조건 approved!
  // 2) 원격 문서가 아직 없거나 unverified일 때 로컬 캐시가 approved이면 로컬 승인 상태 보존!
  const isApproved =
    verifReq?.status === 'approved' ||
    remoteUser?.verificationStatus === 'approved' ||
    remoteUser?.verified === true ||
    (!remoteUser?.verificationStatus && localUser?.verificationStatus === 'approved') ||
    (remoteUser?.verificationStatus === 'unverified' &&
      localUser?.verificationStatus === 'approved');

  const isRejected =
    !isApproved &&
    (verifReq?.status === 'rejected' ||
      remoteUser?.verificationStatus === 'rejected');

  const isPending =
    !isApproved &&
    !isRejected &&
    (verifReq?.status === 'pending' ||
      remoteUser?.verificationStatus === 'pending' ||
      (!remoteUser?.verificationStatus &&
        localUser?.verificationStatus === 'pending'));

  const finalStatus = isApproved
    ? 'approved'
    : isRejected
      ? 'rejected'
      : isPending
        ? 'pending'
        : 'unverified';

  const university =
    verifReq?.university ||
    remoteUser?.university ||
    localUser?.university ||
    '미지정';
  const department =
    verifReq?.department ||
    remoteUser?.department ||
    localUser?.department ||
    '학과 미입력';
  const studentId =
    verifReq?.studentId ||
    remoteUser?.studentId ||
    localUser?.studentId ||
    '';
  const studentYear =
    verifReq?.studentYear ||
    remoteUser?.studentYear ||
    localUser?.studentYear ||
    (studentId ? deriveStudentYearLabel(studentId) : '재학생');

  return {
    uid,
    email: email || remoteUser?.email || localUser?.email || '',
    name: remoteUser?.name || localUser?.name || displayName || '대학생',
    gender: remoteUser?.gender || localUser?.gender || '남',
    university,
    department,
    studentId,
    studentYear,
    verified: finalStatus === 'approved',
    verificationStatus: finalStatus,
    rejectionReason:
      finalStatus === 'rejected'
        ? verifReq?.rejectionReason ||
          remoteUser?.rejectionReason ||
          localUser?.rejectionReason ||
          ''
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
  const trimmedEmail = input.email.trim();
  const trimmedName = input.name.trim();
  const trimmedDept = input.department.trim();

  if (trimmedEmail.toLowerCase() === ADMIN_LOGIN_EMAIL) {
    throw new Error(
      '관리자 전용 계정 이메일이에요. 로그인 페이지에서 바로 로그인해 주세요.'
    );
  }

  if (!isFirebaseConfigured || !auth) {
    throw new Error('Firebase 설정(.env.local)이 확인되지 않았어요.');
  }

  const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, input.password);
  if (trimmedName) {
    await updateProfile(cred.user, { displayName: trimmedName }).catch(() => {});
  }

  const isAdmin = isConfiguredAdminEmail(trimmedEmail);

  const profile: UserProfile = {
    uid: cred.user.uid,
    email: trimmedEmail,
    name: trimmedName || '대학생',
    gender: input.gender,
    university: input.university,
    department: trimmedDept || '자유전공학부',
    studentId: '',
    studentYear: '재학생',
    verified: isAdmin,
    verificationStatus: isAdmin ? 'approved' : 'unverified',
    isAdmin,
    createdAt: Date.now(),
  };

  writeStorage(STORAGE_KEYS.currentUser, profile);
  saveUserToLocalMap(profile);

  await safeFirestoreOp('saveNewUser', () =>
    setDoc(doc(db!, 'users', profile.uid), profile, { merge: true })
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

  let uid = '';
  let fbEmail = trimmedEmail;
  let fbDisplayName: string | null = null;

  try {
    const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
    uid = cred.user.uid;
    fbEmail = cred.user.email ?? trimmedEmail;
    fbDisplayName = cred.user.displayName;
  } catch (err) {
    // 최초 1회 관리자 계정 로그인 시(.env.local 등 초기 비밀번호가 설정된 경우에만) 자동 생성
    if (
      ADMIN_INITIAL_PASSWORD &&
      trimmedEmail.toLowerCase() === ADMIN_LOGIN_EMAIL &&
      password === ADMIN_INITIAL_PASSWORD
    ) {
      const created = await createUserWithEmailAndPassword(
        auth,
        trimmedEmail,
        password
      );
      await updateProfile(created.user, { displayName: '운영관리자' }).catch(
        () => {}
      );
      uid = created.user.uid;
      fbEmail = created.user.email ?? trimmedEmail;
      fbDisplayName = '운영관리자';
    } else {
      throw err;
    }
  }

  const [remoteUserSnap, remoteVerifSnap] = await Promise.all([
    safeFirestoreOp('getUserOnLogin', () => getDoc(doc(db!, 'users', uid))),
    safeFirestoreOp('getVerifOnLogin', () =>
      getDoc(doc(db!, 'verificationRequests', uid))
    ),
  ]);

  const remoteUser =
    remoteUserSnap && remoteUserSnap.exists()
      ? (remoteUserSnap.data() as Partial<UserProfile>)
      : null;

  const localVerif =
    loadLocalVerificationRequests().find((r) => r.uid === uid) ?? null;
  const remoteVerif =
    remoteVerifSnap && remoteVerifSnap.exists()
      ? ({ ...(remoteVerifSnap.data() as VerificationRequest), id: uid } as VerificationRequest)
      : localVerif;

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

  // 원격 문서가 실제로 없었거나 상태 동기화가 필요할 때만 merge로 안전하게 기록 (절대 덮어쓰기 초기화 금지!)
  if (
    (remoteUserSnap && !remoteUserSnap.exists()) ||
    reconciled.isAdmin ||
    (remoteUser &&
      reconciled.verificationStatus === 'approved' &&
      remoteUser.verificationStatus !== 'approved')
  ) {
    await safeFirestoreOp('syncReconciledUser', () =>
      setDoc(doc(db!, 'users', uid), reconciled, { merge: true })
    );
  }

  return reconciled;
}

export async function logoutUser(): Promise<void> {
  removeStorage(STORAGE_KEYS.currentUser);
  if (isFirebaseConfigured && auth) {
    await signOut(auth).catch(() => {});
  }
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

  const authUnsub = onAuthStateChanged(firebaseAuth, (fbUser) => {
    if (profileUnsub) {
      profileUnsub();
      profileUnsub = null;
    }
    if (verifUnsub) {
      verifUnsub();
      verifUnsub = null;
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
    let latestRemoteVerif: VerificationRequest | null =
      loadLocalVerificationRequests().find((r) => r.uid === uid) ?? null;
    let userSnapSettled = false;
    let verifSnapSettled = false;

    const cached = getUserFromLocalMap(uid) ?? loadCachedCurrentUser();
    if (cached && cached.uid === uid) {
      const initialReconciled = reconcileUserProfile(
        uid,
        email,
        fbUser.displayName,
        null,
        cached,
        latestRemoteVerif
      );
      onUserChange(initialReconciled);
    }

    const emitReconciled = () => {
      if (!userSnapSettled || !verifSnapSettled) {
        return;
      }
      const localNow = getUserFromLocalMap(uid);
      const reconciled = reconcileUserProfile(
        uid,
        email,
        fbUser.displayName,
        latestRemoteUser,
        localNow,
        latestRemoteVerif
      );
      writeStorage(STORAGE_KEYS.currentUser, reconciled);
      saveUserToLocalMap(reconciled);
      onUserChange(reconciled);
      onAuthReady?.();

      // 원격 users 문서에 승인 상태가 누락되어 있었다면 자동 복구 동기화
      if (
        reconciled.verificationStatus === 'approved' &&
        latestRemoteUser?.verificationStatus !== 'approved'
      ) {
        void setDoc(doc(firestore, 'users', uid), reconciled, { merge: true }).catch(
          () => {}
        );
      }
    };

    profileUnsub = onSnapshot(
      doc(firestore, 'users', uid),
      (snap) => {
        userSnapSettled = true;
        if (snap.exists()) {
          latestRemoteUser = snap.data() as Partial<UserProfile>;
        }
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
        verifSnapSettled = true;
        if (snap.exists()) {
          latestRemoteVerif = {
            ...(snap.data() as VerificationRequest),
            id: snap.id,
          };
        }
        emitReconciled();
      },
      () => {
        verifSnapSettled = true;
        emitReconciled();
      }
    );
  });

  return () => {
    if (profileUnsub) profileUnsub();
    if (verifUnsub) verifUnsub();
    authUnsub();
  };
}

export function subscribeAllUsers(
  onUsers: (users: UserProfile[]) => void
): () => void {
  onUsers(loadAllLocalUsers().filter((u) => !u.isAdmin));
  if (!isFirebaseConfigured || !db) return () => {};

  const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const remote: UserProfile[] = snap.docs.map((d) => ({
        ...(d.data() as UserProfile),
        uid: d.id,
      }));
      const map = new Map<string, UserProfile>();
      loadAllLocalUsers().forEach((u) => map.set(u.uid, u));
      remote.forEach((u) => {
        const merged = reconcileUserProfile(
          u.uid,
          u.email,
          u.name,
          u,
          map.get(u.uid) ?? null,
          loadLocalVerificationRequests().find((r) => r.uid === u.uid) ?? null
        );
        map.set(u.uid, merged);
        saveUserToLocalMap(merged);
      });
      onUsers(
        Array.from(map.values())
          .filter((u) => !u.isAdmin && !isConfiguredAdminEmail(u.email))
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      );
    },
    () => {
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

  saveUserToLocalMap(updated);
  const currentCached = loadCachedCurrentUser();
  if (currentCached && currentCached.uid === updated.uid) {
    writeStorage(STORAGE_KEYS.currentUser, updated);
  }

  const localReqs = loadLocalVerificationRequests();
  const existingReq = localReqs.find((r) => r.uid === updated.uid);

  if (decision === 'approved') {
    const syncedReq: VerificationRequest = existingReq
      ? {
          ...existingReq,
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
    writeStorage(STORAGE_KEYS.verifications, [
      syncedReq,
      ...localReqs.filter((r) => r.uid !== updated.uid),
    ]);
    await Promise.all([
      safeFirestoreOp('adminDirectVerifyUser', () =>
        setDoc(doc(db!, 'users', updated.uid), updated, { merge: true })
      ),
      safeFirestoreOp('adminDirectVerifyReqDoc', () =>
        setDoc(doc(db!, 'verificationRequests', updated.uid), syncedReq, {
          merge: true,
        })
      ),
    ]);
  } else {
    writeStorage(
      STORAGE_KEYS.verifications,
      localReqs.filter((r) => r.uid !== updated.uid)
    );
    await Promise.all([
      safeFirestoreOp('adminRevokeVerifyUser', () =>
        setDoc(doc(db!, 'users', updated.uid), updated, { merge: true })
      ),
      safeFirestoreOp('adminDeleteVerifyReqDoc', () =>
        deleteDoc(doc(db!, 'verificationRequests', updated.uid))
      ),
    ]);
  }

  return updated;
}

export async function compressCertificateFile(file: File): Promise<{
  dataUrl: string;
  mimeType: string;
  fileName: string;
}> {
  if (file.type === 'application/pdf') {
    const maxPdfBytes = 700 * 1024;
    if (file.size > maxPdfBytes) {
      throw new Error(
        'PDF 파일은 700KB 이하만 업로드할 수 있어요. 캡처 이미지(JPG/PNG)로 업로드해 주세요.'
      );
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('파일을 읽는 중 오류가 발생했어요.'));
      reader.readAsDataURL(file);
    });
    return { dataUrl, mimeType: file.type, fileName: file.name };
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('이미지(JPG, PNG, WEBP) 또는 PDF 파일만 업로드할 수 있어요.');
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
    image.onerror = () => reject(new Error('이미지 형식을 불러올 수 없어요.'));
    image.src = rawDataUrl;
  });

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

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { dataUrl: rawDataUrl, mimeType: file.type, fileName: file.name };
  }
  ctx.drawImage(img, 0, 0, width, height);
  const compressed = canvas.toDataURL('image/jpeg', 0.76);
  return {
    dataUrl: compressed,
    mimeType: 'image/jpeg',
    fileName: file.name,
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
  const studentIdTrimmed = input.studentId.trim();
  const deptTrimmed = input.department.trim() || input.user.department;
  const studentYear = deriveStudentYearLabel(studentIdTrimmed);
  const now = Date.now();

  const request: VerificationRequest = {
    id: input.user.uid,
    uid: input.user.uid,
    userName: input.user.name,
    userEmail: input.user.email,
    gender: input.user.gender,
    university: input.university,
    department: deptTrimmed,
    studentId: studentIdTrimmed,
    studentYear,
    certificateFileName: input.certificateFileName,
    certificateMimeType: input.certificateMimeType,
    certificateDataUrl: input.certificateDataUrl,
    status: 'pending',
    submittedAt: now,
  };

  const updatedUser: UserProfile = {
    ...input.user,
    university: input.university,
    department: deptTrimmed,
    studentId: studentIdTrimmed,
    studentYear,
    verified: false,
    verificationStatus: 'pending',
    rejectionReason: '',
  };

  const existingReqs = loadLocalVerificationRequests().filter(
    (r) => r.uid !== input.user.uid
  );
  writeStorage(STORAGE_KEYS.verifications, [request, ...existingReqs]);
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

export function subscribeVerificationRequests(
  onRequests: (requests: VerificationRequest[]) => void
): () => void {
  const localInitial = loadLocalVerificationRequests();
  onRequests(localInitial);

  if (!isFirebaseConfigured || !db) {
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
      const localNow = loadLocalVerificationRequests();
      const map = new Map<string, VerificationRequest>();
      localNow.forEach((item) => map.set(item.id, item));
      remote.forEach((item) => map.set(item.id, item));
      const merged = Array.from(map.values()).sort(
        (a, b) => b.submittedAt - a.submittedAt
      );
      writeStorage(STORAGE_KEYS.verifications, merged);
      onRequests(merged);
    },
    () => {
      onRequests(loadLocalVerificationRequests());
    }
  );
}

export async function reviewVerificationRequest(
  request: VerificationRequest,
  decision: 'approved' | 'rejected',
  rejectionReason?: string
): Promise<VerificationRequest[]> {
  const reviewedAt = Date.now();
  const updatedReq: VerificationRequest = {
    ...request,
    status: decision,
    rejectionReason: decision === 'rejected' ? rejectionReason ?? '' : '',
    reviewedAt,
  };

  const nextReqs = loadLocalVerificationRequests().map((item) =>
    item.id === request.id ? updatedReq : item
  );
  if (!nextReqs.some((item) => item.id === request.id)) {
    nextReqs.unshift(updatedReq);
  }
  writeStorage(STORAGE_KEYS.verifications, nextReqs);

  const localTarget = getUserFromLocalMap(request.uid);
  const updatedTarget: UserProfile = {
    uid: request.uid,
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
  saveUserToLocalMap(updatedTarget);

  const currentCached = loadCachedCurrentUser();
  if (currentCached && currentCached.uid === request.uid) {
    writeStorage(STORAGE_KEYS.currentUser, updatedTarget);
  }

  await Promise.all([
    safeFirestoreOp('reviewVerificationDoc', () =>
      setDoc(doc(db!, 'verificationRequests', request.id), updatedReq, {
        merge: true,
      })
    ),
    safeFirestoreOp('reviewUpdateUserDoc', () =>
      setDoc(
        doc(db!, 'users', request.uid),
        {
          university: request.university,
          department: request.department,
          studentId: request.studentId,
          studentYear: request.studentYear,
          verified: decision === 'approved',
          verificationStatus: decision,
          rejectionReason: decision === 'rejected' ? rejectionReason ?? '' : '',
        },
        { merge: true }
      )
    ),
  ]);

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
  const id = `room-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const hostShort = getShortUniversityName(input.host.university);
  const opponentShort = getShortUniversityName(input.opponentUniversity);
  const opponentGender: GenderType = input.host.gender === '남' ? '여' : '남';

  const hostMember: TeamMemberItem = {
    id: `m-${Date.now()}-host`,
    uid: input.host.uid,
    departmentAndYear: `${input.host.department} · ${input.host.studentYear}`,
    role: '방장',
    gender: input.host.gender,
  };

  const newRoom: MeetingRoom = {
    id,
    title:
      input.title.trim() || `${hostShort} × ${opponentShort} ${input.format} 미팅`,
    format: input.format,
    status: '모집 중',
    leftUniversity: {
      name: input.host.university,
      shortName: hostShort,
      gender: input.host.gender,
    },
    rightUniversity: {
      name: input.opponentUniversity,
      shortName: opponentShort,
      gender: opponentGender,
    },
    schedule: input.schedule,
    location: input.location,
    intro:
      input.intro.trim() ||
      '편하게 밥 먹으면서 이야기 나눠요! 좋은 인연 만나고 싶습니다.',
    hostUid: input.host.uid,
    hostDepartment: `${hostShort} ${input.host.department}`,
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
  currentRooms: MeetingRoom[]
): Promise<MeetingRoom[]> {
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
  const newPost: BoardPost = {
    id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tab: input.tab,
    status: '모집 중',
    gender: input.author.gender,
    title: input.title.trim(),
    university: input.author.university,
    department: input.author.department,
    format: input.format,
    date: input.date,
    location: input.location,
    targetUniversity: input.targetUniversity,
    content: input.content.trim(),
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
  currentPosts: BoardPost[]
): Promise<BoardPost[]> {
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
  currentPosts: BoardPost[]
): Promise<BoardPost[]> {
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
  const withId: ReportRecord = { ...record, id: `rep-${Date.now()}` };
  const prev = readStorage<ReportRecord[]>(STORAGE_KEYS.reports, []);
  writeStorage(STORAGE_KEYS.reports, [withId, ...prev]);
  await safeFirestoreOp('submitReport', () =>
    addDoc(collection(db!, 'reports'), record)
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
  const withId: InquiryRecord = { ...record, id: `inq-${Date.now()}` };
  const prev = readStorage<InquiryRecord[]>(STORAGE_KEYS.inquiries, []);
  writeStorage(STORAGE_KEYS.inquiries, [withId, ...prev]);
  await safeFirestoreOp('submitInquiry', () =>
    addDoc(collection(db!, 'inquiries'), record)
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
