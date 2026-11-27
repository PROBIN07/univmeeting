/**
 * Univmeeting 보안 유틸리티
 * - 입력값 살균(XSS · HTML 태그 · 제어문자 · RLO 스푸핑 차단)
 * - 닉네임 사칭 및 스크립트 검증
 * - 강력한 비밀번호 정책 검증
 * - 로그인 브루트포스(무차별 대입) 잠금 및 요청 쿨다운(Rate Limiting)
 * - 업로드 파일 매직 바이트(실제 바이너리 헤더) 및 악성 PDF 스크립트 검사
 * - URL 파라미터(IDOR) 및 Data URL 프로토콜 화이트리스트 검증
 */

const LOGIN_GUARD_KEY = 'univ-meeting:sec:login-guard';
const ACTION_COOLDOWN_KEY = 'univ-meeting:sec:cooldowns';

const DANGEROUS_PATTERNS: RegExp[] = [
  /<\s*\/?\s*(script|iframe|object|embed|svg|math|style|link|meta|base|form|input|button|textarea|img|video|audio|body|html)/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /data\s*:\s*text\/html/i,
  /data\s*:\s*image\/svg\+xml/i,
  /\bon[a-z]{2,20}\s*=/i,
  /expression\s*\(/i,
];

const IMPERSONATION_KEYWORDS: string[] = [
  '관리자',
  '운영자',
  '운영팀',
  '운영진',
  '대학미팅운영',
  'univmeeting',
  '마스터',
  'admin',
  'administrator',
  'sysadmin',
  'moderator',
  'official',
  'system',
  'root',
];

const WEAK_PASSWORDS = new Set<string>([
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'qwertyui',
  'password',
  'password1',
  'password123',
  'abcd1234',
  'qwer1234',
  'asdf1234',
  'zxcv1234',
  '11111111',
  '00000000',
  'admin123',
  'admin1234',
]);

/** HTML 문자열 템플릿(지도 마커 등) 삽입 시 DOM XSS 완벽 차단 */
export function escapeHtml(raw: string): string {
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 스크립트·이벤트 핸들러·위험 프로토콜 포함 여부 탐지 */
export function containsDangerousPayload(input: string): boolean {
  if (!input) return false;
  return DANGEROUS_PATTERNS.some((re) => re.test(input));
}

/**
 * 일반 텍스트 살균:
 * - 제어문자 및 양방향 유니코드 스푸핑 문자(RLO \u202E 등) 제거
 * - 꺾쇠(<, >) 제거로 HTML/스크립트 태그 원천 무력화
 * - 최대 길이 제한 강제
 */
export function sanitizePlainText(
  input: string,
  maxLength: number,
  allowNewlines = false
): string {
  if (!input) return '';
  let cleaned = String(input)
    // ASCII 제어문자 제거 (개행/탭 제외)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    // 제로폭 문자 및 RLO(우->좌 확장자 위조) 제어문자 제거
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    // HTML 태그 생성에 쓰이는 꺾쇠 제거
    .replace(/[<>]/g, '');

  if (!allowNewlines) {
    cleaned = cleaned.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ');
  } else {
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n');
  }

  return cleaned.trim().slice(0, maxLength);
}

/** 닉네임(이름) 검증: XSS 문자 및 운영자 사칭 원천 차단 */
export function validateNickname(raw: string): {
  valid: boolean;
  cleaned: string;
  error?: string;
} {
  if (containsDangerousPayload(raw) || /[<>'"`;\\]/.test(raw)) {
    return {
      valid: false,
      cleaned: '',
      error: '이름(닉네임)에 사용할 수 없는 특수문자나 스크립트가 포함되어 있어요.',
    };
  }
  const cleaned = sanitizePlainText(raw, 20);
  if (cleaned.length < 2) {
    return {
      valid: false,
      cleaned,
      error: '이름(닉네임)은 2자 이상 20자 이하로 입력해 주세요.',
    };
  }
  const normalized = cleaned.replace(/\s+/g, '').toLowerCase();
  if (IMPERSONATION_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return {
      valid: false,
      cleaned,
      error: '운영팀이나 관리자로 오인될 수 있는 이름은 사용할 수 없어요.',
    };
  }
  return { valid: true, cleaned };
}

/** 학번 검증: 숫자·영문·하이픈만 허용 (4~16자) */
export function validateStudentId(raw: string): {
  valid: boolean;
  cleaned: string;
  error?: string;
} {
  const cleaned = sanitizePlainText(raw, 16).replace(/\s+/g, '');
  if (!/^[A-Za-z0-9-]{4,16}$/.test(cleaned)) {
    return {
      valid: false,
      cleaned,
      error: '학번은 영문·숫자 4~16자로 정확히 입력해 주세요.',
    };
  }
  return { valid: true, cleaned };
}

/** 회원가입 비밀번호 강도 검증 (브루트포스·사전 공격 대비) */
export function validateStrongPassword(
  password: string,
  email?: string
): string | null {
  if (password.length < 8 || password.length > 64) {
    return '비밀번호는 8자 이상 64자 이하로 입력해 주세요.';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return '보안을 위해 비밀번호에 영문과 숫자를 모두 포함해 주세요.';
  }
  if (/^(.)\1{5,}$/.test(password) || WEAK_PASSWORDS.has(password.toLowerCase())) {
    return '너무 추측하기 쉬운 비밀번호예요. 다른 조합을 사용해 주세요.';
  }
  const emailPrefix = email?.split('@')[0]?.trim().toLowerCase();
  if (emailPrefix && emailPrefix.length >= 4 && password.toLowerCase().includes(emailPrefix)) {
    return '이메일 아이디가 그대로 포함된 비밀번호는 사용할 수 없어요.';
  }
  return null;
}

/** URL 쿼리의 room/post ID 검증 (경로 조작 및 스크립트 삽입 차단) */
export function sanitizeUrlEntityId(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(trimmed) ? trimmed : '';
}

/** 안전한 이메일 형식 검증 (mailto: 프로토콜 인젝션 방지) */
export function isSafeEmailAddress(email: string | null | undefined): boolean {
  if (!email) return false;
  const trimmed = email.trim();
  if (trimmed.length > 120) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(trimmed);
}

/* =========================================================
   로그인 무차별 대입(Brute-Force) 방어 잠금 장치
========================================================= */
interface LoginGuardState {
  failures: number;
  lockUntil: number;
  strikes: number;
}

function readLoginGuard(): LoginGuardState {
  try {
    const raw = window.localStorage.getItem(LOGIN_GUARD_KEY);
    if (!raw) return { failures: 0, lockUntil: 0, strikes: 0 };
    const parsed = JSON.parse(raw) as Partial<LoginGuardState>;
    return {
      failures: Number(parsed.failures) || 0,
      lockUntil: Number(parsed.lockUntil) || 0,
      strikes: Number(parsed.strikes) || 0,
    };
  } catch {
    return { failures: 0, lockUntil: 0, strikes: 0 };
  }
}

function writeLoginGuard(state: LoginGuardState): void {
  try {
    window.localStorage.setItem(LOGIN_GUARD_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function getLoginLockoutRemainingSeconds(): number {
  const state = readLoginGuard();
  const diff = state.lockUntil - Date.now();
  return diff > 0 ? Math.ceil(diff / 1000) : 0;
}

export function recordLoginFailure(): { lockedSeconds: number; failures: number } {
  const state = readLoginGuard();
  const nextFailures = state.failures + 1;
  if (nextFailures >= 5) {
    const nextStrikes = state.strikes + 1;
    // 1차 잠금 60초, 2차 이상 반복 공격 시 300초(5분) 잠금
    const lockDurationMs = nextStrikes >= 2 ? 300_000 : 60_000;
    const nextState: LoginGuardState = {
      failures: 0,
      lockUntil: Date.now() + lockDurationMs,
      strikes: nextStrikes,
    };
    writeLoginGuard(nextState);
    return { lockedSeconds: Math.ceil(lockDurationMs / 1000), failures: 5 };
  }
  writeLoginGuard({ ...state, failures: nextFailures });
  return { lockedSeconds: 0, failures: nextFailures };
}

export function resetLoginFailures(): void {
  try {
    window.localStorage.removeItem(LOGIN_GUARD_KEY);
  } catch {
    // ignore
  }
}

/* =========================================================
   도배 · 자동화 요청 쿨다운(Rate Limiting)
========================================================= */
export function checkAndRecordActionCooldown(
  actionKey: string,
  cooldownMs: number
): number {
  try {
    const raw = window.sessionStorage.getItem(ACTION_COOLDOWN_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const now = Date.now();
    const lastAt = map[actionKey] ?? 0;
    if (now - lastAt < cooldownMs) {
      return Math.ceil((cooldownMs - (now - lastAt)) / 1000);
    }
    map[actionKey] = now;
    window.sessionStorage.setItem(ACTION_COOLDOWN_KEY, JSON.stringify(map));
    return 0;
  } catch {
    return 0;
  }
}

/* =========================================================
   재학증명서 업로드 보안 검사 (확장자 위조 · 매직 바이트 · 악성 PDF 차단)
========================================================= */
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf']);
const DANGEROUS_DOUBLE_EXT = /\.(exe|bat|cmd|sh|php|jsp|asp|aspx|html|htm|svg|xml|js|mjs|ts|vbs|scr|msi|jar|ps1)\./i;

export async function verifyCertificateFileSecurity(file: File): Promise<{
  detectedKind: 'jpeg' | 'png' | 'webp' | 'pdf';
  safeFileName: string;
}> {
  if (!file || file.size === 0) {
    throw new Error('비어 있는 파일은 업로드할 수 없어요.');
  }

  // RLO 제어문자 등 파일명 조작 검사
  if (/[\u202A-\u202E\u2066-\u2069]/.test(file.name)) {
    throw new Error('위조된 파일명이 감지되어 업로드가 차단되었어요.');
  }
  if (DANGEROUS_DOUBLE_EXT.test(file.name)) {
    throw new Error('보안상 이중 확장자 파일은 업로드할 수 없어요.');
  }

  const safeFileName = sanitizePlainText(file.name, 80).replace(/[^\w.\-가-힣()\s]/g, '_');
  const ext = safeFileName.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error('JPG, PNG, WEBP 이미지 또는 PDF 문서만 업로드할 수 있어요. (SVG·실행파일 불가)');
  }

  // 메모리 고갈 공격 방지 (이미지 최대 10MB, PDF 최대 700KB)
  const maxBytes = ext === 'pdf' ? 700 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(
      ext === 'pdf'
        ? 'PDF 파일은 700KB 이하만 업로드할 수 있어요. 캡처 이미지(JPG/PNG)로 업로드해 주세요.'
        : '이미지 파일 크기는 10MB 이하여야 해요.'
    );
  }

  // 실제 파일 바이너리 헤더(Magic Bytes) 검사 — 확장자만 바꾼 실행파일/스크립트 차단
  const headerBuf = await file.slice(0, 16).arrayBuffer();
  const b = new Uint8Array(headerBuf);

  const isJpeg = b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const isPng =
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a;
  const isWebp =
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50;
  const isPdf =
    b.length >= 5 &&
    b[0] === 0x25 &&
    b[1] === 0x50 &&
    b[2] === 0x44 &&
    b[3] === 0x46 &&
    b[4] === 0x2d; // %PDF-

  if (isPdf) {
    if (ext !== 'pdf') {
      throw new Error('파일 확장자와 실제 파일 형식(PDF)이 일치하지 않아요.');
    }
    // PDF 내부에 삽입된 악성 JavaScript / 자동실행 액션 탐지 및 차단
    const fullBytes = new Uint8Array(await file.arrayBuffer());
    const asciiPreview = new TextDecoder('latin1').decode(fullBytes);
    if (/\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia)\b/i.test(asciiPreview)) {
      throw new Error('보안 정책상 스크립트나 실행 코드가 포함된 PDF는 업로드할 수 없어요.');
    }
    return { detectedKind: 'pdf', safeFileName };
  }

  if (isJpeg || isPng || isWebp) {
    if (ext === 'pdf') {
      throw new Error('파일 확장자(.pdf)와 실제 이미지 형식이 일치하지 않아요.');
    }
    return {
      detectedKind: isJpeg ? 'jpeg' : isPng ? 'png' : 'webp',
      safeFileName,
    };
  }

  throw new Error(
    '실제 이미지(JPG/PNG/WEBP) 또는 정상 PDF 파일이 아니에요. 확장자를 변경한 파일은 업로드할 수 없어요.'
  );
}

/** Data URL 화이트리스트 검증 (javascript:, data:text/html, data:image/svg+xml 등 완벽 차단) */
export function isSafeCertificateDataUrl(
  dataUrl: string | null | undefined,
  expectedKind?: 'image' | 'pdf'
): boolean {
  if (!dataUrl || dataUrl.length > 980_000) return false;
  if (expectedKind === 'image') {
    return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl);
  }
  if (expectedKind === 'pdf') {
    return /^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/.test(dataUrl);
  }
  return /^data:(image\/(jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(
    dataUrl
  );
}

/** 관리자 포털에서 PDF 열람 시 안전한 Blob URL로 격리 오픈 */
export function openSafePdfCertificate(dataUrl: string): boolean {
  if (!isSafeCertificateDataUrl(dataUrl, 'pdf')) {
    return false;
  }
  try {
    const base64Part = dataUrl.split(',')[1] ?? '';
    const binary = window.atob(base64Part);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    return true;
  } catch {
    return false;
  }
}
