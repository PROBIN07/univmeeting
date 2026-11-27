import React, { useEffect, useRef, useState } from 'react';
import { deriveStudentYearLabel, formatRelativeTime } from '../data/seedData';
import {
  compressCertificateFile,
  loginWithEmail,
  signUpWithEmail,
  translateFirebaseAuthError,
} from '../services/meetingService';
import type {
  ActiveOverlayState,
  BoardPost,
  GenderType,
  InquiryRecord,
  MeetingRoom,
  PageId,
  ReportRecord,
  UserProfile,
  VerificationRequest,
} from '../types/meeting';
import {
  isSafeCertificateDataUrl,
  isSafeEmailAddress,
  openSafePdfCertificate,
  sanitizePlainText,
  validateNickname,
  validateStrongPassword,
  validateStudentId,
} from '../utils/security';

function ChevronDownSmall() {
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

function GenderBadge({ gender }: { gender: GenderType }) {
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

/* =========================
   1. 로그인 페이지
========================= */
export function LoginView({
  header,
  onSuccess,
  onNavigate,
}: {
  header: React.ReactNode;
  onSuccess: (user: UserProfile) => void;
  onNavigate: (page: PageId) => void;
}) {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorText('이메일을 입력해 주세요.');
      return;
    }
    if (!password) {
      setErrorText('비밀번호를 입력해 주세요.');
      return;
    }
    if (submitting) return;
    setErrorText(null);
    setSubmitting(true);
    try {
      const profile = await loginWithEmail(email, password);
      onSuccess(profile);
    } catch (err) {
      setErrorText(translateFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-[1440px] flex-col bg-[#FFFFFF]">
      {header}

      <main className="flex flex-1 flex-col items-center justify-center px-5 py-[64px] md:px-12 xl:px-[120px]">
        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-[480px] flex-col items-stretch gap-[24px] rounded-[16px] border border-[#EBCDD9] bg-[#FFFFFF] p-6 sm:p-[40px]"
        >
          <div className="flex flex-col items-start gap-[10px]">
            <span className="inline-flex rounded-[999px] bg-[#F7D8E4] px-[12px] py-[4px] text-[13px] font-bold text-[#0D050A]">
              재학생 인증 캠퍼스 미팅
            </span>
            <h1 className="m-0 text-[32px] font-bold leading-[1.45] text-[#0D050A]">로그인</h1>
            <p className="m-0 text-[15px] font-normal leading-[1.45] text-[#4A3842]">
              가입한 이메일과 비밀번호로 로그인해 주세요.
            </p>
          </div>

          <div className="flex flex-col gap-[18px] self-stretch">
            <div className="flex flex-col gap-[8px] self-stretch">
              <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">
                이메일
              </label>
              <div className="flex h-[44px] flex-row items-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px]">
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="yourname@univ.ac.kr"
                  className="w-full border-0 bg-transparent p-0 text-[14px] font-normal text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col gap-[8px] self-stretch">
              <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">
                비밀번호
              </label>
              <div className="flex h-[44px] flex-row items-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px]">
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호 입력"
                  className="w-full border-0 bg-transparent p-0 text-[14px] font-normal text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {errorText && (
            <div className="rounded-[8px] border border-[#F5C2C7] bg-[#FFF5F5] px-[14px] py-[12px] text-[13px] font-medium leading-[1.45] text-[#B42318]">
              {errorText}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex cursor-pointer flex-row items-center justify-center self-stretch rounded-[8px] border-0 bg-[#0D050A] px-[20px] py-[13px] disabled:opacity-60"
          >
            <span className="text-[15px] font-medium text-[#FFFFFF]">
              {submitting ? '로그인 중...' : '로그인'}
            </span>
          </button>

          <div className="h-[1px] self-stretch bg-[#EBCDD9]" />

          <div className="flex flex-row items-center justify-center gap-[8px]">
            <span className="text-[14px] font-normal text-[#6E5464]">
              아직 계정이 없으신가요?
            </span>
            <button
              type="button"
              onClick={() => onNavigate('signup')}
              className="cursor-pointer border-0 bg-transparent p-0 text-[14px] font-bold text-[#0D050A] underline"
            >
              회원가입하기
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

/* =========================
   2. 회원가입 페이지
========================= */
export function SignupView({
  header,
  onSuccess,
  onNavigate,
  onOpenOverlay,
}: {
  header: React.ReactNode;
  onSuccess: (user: UserProfile) => void;
  onNavigate: (page: PageId) => void;
  onOpenOverlay: (overlay: ActiveOverlayState) => void;
}) {
  const [name, setName] = useState<string>('');
  const [gender, setGender] = useState<GenderType>('남');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [passwordConfirm, setPasswordConfirm] = useState<string>('');
  const [university, setUniversity] = useState<string>('');
  const [department, setDepartment] = useState<string>('');
  const [agreeTerms, setAgreeTerms] = useState<boolean>(false);
  const [agreePrivacy, setAgreePrivacy] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const allAgreed = agreeTerms && agreePrivacy;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nickCheck = validateNickname(name);
    if (!nickCheck.valid) {
      setErrorText(nickCheck.error ?? '올바른 이름(닉네임)을 입력해 주세요.');
      return;
    }
    if (!isSafeEmailAddress(email)) {
      setErrorText('올바른 이메일 주소를 입력해 주세요.');
      return;
    }
    const pwError = validateStrongPassword(password, email);
    if (pwError) {
      setErrorText(pwError);
      return;
    }
    if (password !== passwordConfirm) {
      setErrorText('비밀번호와 비밀번호 확인이 일치하지 않아요.');
      return;
    }
    if (!university || university === '전체 (상관없음)') {
      setErrorText('소속 대학교를 선택해 주세요.');
      return;
    }
    const safeDept = sanitizePlainText(department, 50);
    if (!safeDept) {
      setErrorText('학과(학부)를 입력해 주세요.');
      return;
    }
    if (!agreeTerms || !agreePrivacy) {
      setErrorText('서비스 이용약관 및 개인정보 수집·이용 필수 동의 항목에 체크해 주세요.');
      return;
    }
    if (submitting) return;
    setErrorText(null);
    setSubmitting(true);
    try {
      const profile = await signUpWithEmail({
        name: nickCheck.cleaned,
        gender,
        email: email.trim(),
        password,
        university,
        department: safeDept,
      });
      onSuccess(profile);
    } catch (err) {
      setErrorText(translateFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-[1440px] flex-col bg-[#FFFFFF]">
      {header}

      <main className="flex flex-1 flex-col items-center px-5 py-[56px] md:px-12 xl:px-[120px]">
        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-[560px] flex-col items-stretch gap-[24px] rounded-[16px] border border-[#EBCDD9] bg-[#FFFFFF] p-6 sm:p-[40px]"
        >
          <div className="flex flex-col gap-[8px]">
            <h1 className="m-0 text-[32px] font-bold leading-[1.45] text-[#0D050A]">회원가입</h1>
            <p className="m-0 text-[15px] font-normal leading-[1.45] text-[#4A3842]">
              계정을 만든 뒤 학번과 재학증명서를 제출해 승인받으면 미팅 방 생성과 참여가 가능해요.
            </p>
          </div>

          <div className="flex flex-col gap-[16px] self-stretch sm:flex-row">
            <div className="flex flex-1 flex-col gap-[8px]">
              <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">
                이름 (닉네임)
              </label>
              <div className="flex h-[44px] flex-row items-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px]">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="이름 또는 활동 닉네임"
                  className="w-full border-0 bg-transparent p-0 text-[14px] font-normal text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col gap-[8px]">
              <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">성별</label>
              <div className="flex h-[44px] flex-row items-center gap-[8px]">
                {(['남', '여'] as const).map((g) =>
                  gender === g ? (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGender(g)}
                      className="flex cursor-pointer flex-row items-center rounded-[999px] border border-[#F7C1D4] bg-[#F7C1D4] px-[18px] py-[8px]"
                    >
                      <span className="text-[14px] font-bold text-[#0D050A]">{g}</span>
                    </button>
                  ) : (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGender(g)}
                      className="flex cursor-pointer flex-row items-center rounded-[999px] border border-[#D8B4C4] bg-[#FFFFFF] px-[18px] py-[8px]"
                    >
                      <span className="text-[14px] font-normal text-[#4A3842]">{g}</span>
                    </button>
                  )
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-[8px] self-stretch">
            <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">
              이메일 (로그인 아이디)
            </label>
            <div className="flex h-[44px] flex-row items-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px]">
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="yourname@univ.ac.kr"
                className="w-full border-0 bg-transparent p-0 text-[14px] font-normal text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-[12px] self-stretch sm:flex-row">
            <div className="flex flex-1 flex-col gap-[8px]">
              <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">
                비밀번호
              </label>
              <div className="flex h-[44px] flex-row items-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px]">
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="영문+숫자 포함 8자 이상"
                  className="w-full border-0 bg-transparent p-0 text-[14px] font-normal text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-[8px]">
              <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">
                비밀번호 확인
              </label>
              <div className="flex h-[44px] flex-row items-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px]">
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="비밀번호 재입력"
                  className="w-full border-0 bg-transparent p-0 text-[14px] font-normal text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-[12px] self-stretch sm:flex-row">
            <div className="flex flex-1 flex-col gap-[8px]">
              <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">
                소속 대학교
              </label>
              <button
                type="button"
                onClick={() =>
                  onOpenOverlay({
                    id: 'select-university',
                    initialValue: university || undefined,
                    allowAnyUniversity: false,
                    onApply: (val) => setUniversity(val),
                  })
                }
                className="flex h-[44px] cursor-pointer flex-row items-center justify-between self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[0px]"
              >
                <span
                  className={`truncate text-[14px] font-normal ${
                    university ? 'text-[#0D050A]' : 'text-[#6E5464]'
                  }`}
                >
                  {university || '학교 검색 및 선택'}
                </span>
                <ChevronDownSmall />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-[8px]">
              <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">
                학과 / 학부
              </label>
              <div className="flex h-[44px] flex-row items-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px]">
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="소속 학과 또는 학부 입력"
                  className="w-full border-0 bg-transparent p-0 text-[14px] font-normal text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-[10px] rounded-[10px] border border-[#EBCDD9] bg-[#FBEBF1] p-[16px]">
            <label className="flex cursor-pointer flex-row items-center gap-[8px] border-b border-[#EBCDD9] pb-[10px] text-[14px] font-bold text-[#0D050A]">
              <input
                type="checkbox"
                checked={allAgreed}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAgreeTerms(checked);
                  setAgreePrivacy(checked);
                  setErrorText(null);
                }}
                className="h-[17px] w-[17px] shrink-0 accent-[#0D050A]"
              />
              <span>필수 약관 전체 동의하기</span>
            </label>

            <div className="flex flex-row items-center justify-between gap-[8px]">
              <label className="flex cursor-pointer flex-row items-center gap-[8px] text-[13px] text-[#4A3842]">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => {
                    setAgreeTerms(e.target.checked);
                    setErrorText(null);
                  }}
                  className="h-[16px] w-[16px] shrink-0 accent-[#0D050A]"
                />
                <span>
                  <strong className="text-[#0D050A]">[필수]</strong> 만 18세 이상 대학생이며 서비스 이용약관 동의
                </span>
              </label>
              <button
                type="button"
                onClick={() => onOpenOverlay({ id: 'terms' })}
                className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[12px] font-bold text-[#6E5464] underline"
              >
                전문 보기
              </button>
            </div>

            <div className="flex flex-row items-center justify-between gap-[8px]">
              <label className="flex cursor-pointer flex-row items-center gap-[8px] text-[13px] text-[#4A3842]">
                <input
                  type="checkbox"
                  checked={agreePrivacy}
                  onChange={(e) => {
                    setAgreePrivacy(e.target.checked);
                    setErrorText(null);
                  }}
                  className="h-[16px] w-[16px] shrink-0 accent-[#0D050A]"
                />
                <span>
                  <strong className="text-[#0D050A]">[필수]</strong> 개인정보 수집 및 이용 동의 (이메일·닉네임·대학·학과)
                </span>
              </label>
              <button
                type="button"
                onClick={() => onOpenOverlay({ id: 'privacy' })}
                className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[12px] font-bold text-[#6E5464] underline"
              >
                전문 보기
              </button>
            </div>
          </div>

          {errorText && (
            <div className="rounded-[8px] border border-[#F5C2C7] bg-[#FFF5F5] px-[14px] py-[12px] text-[13px] font-medium leading-[1.45] text-[#B42318]">
              {errorText}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex cursor-pointer flex-row items-center justify-center self-stretch rounded-[8px] border-0 bg-[#0D050A] px-[20px] py-[13px] disabled:opacity-60"
          >
            <span className="text-[15px] font-medium text-[#FFFFFF]">
              {submitting ? '가입 처리 중...' : '회원가입 완료'}
            </span>
          </button>

          <div className="flex flex-row items-center justify-center gap-[8px]">
            <span className="text-[14px] font-normal text-[#6E5464]">
              이미 계정이 있으신가요?
            </span>
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="cursor-pointer border-0 bg-transparent p-0 text-[14px] font-bold text-[#0D050A] underline"
            >
              로그인하기
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

/* =========================
   3. 학교 인증 페이지 (학번 + 재학증명서 업로드 + 운영팀 승인 대기)
========================= */
export function SchoolVerificationView({
  header,
  user,
  myRequest,
  onSubmitVerification,
  onNavigate,
  onOpenOverlay,
}: {
  header: React.ReactNode;
  user: UserProfile | null;
  myRequest: VerificationRequest | undefined;
  onSubmitVerification: (payload: {
    university: string;
    department: string;
    studentId: string;
    certificateFileName: string;
    certificateMimeType: string;
    certificateDataUrl: string;
  }) => Promise<void>;
  onNavigate: (page: PageId) => void;
  onOpenOverlay: (overlay: ActiveOverlayState) => void;
}) {
  const [selectedSchool, setSelectedSchool] = useState<string>(user?.university ?? '');
  const [department, setDepartment] = useState<string>(user?.department ?? '');
  const [studentId, setStudentId] = useState<string>(user?.studentId ?? '');
  const [fileName, setFileName] = useState<string>(
    myRequest?.certificateFileName ?? ''
  );
  const [fileMimeType, setFileMimeType] = useState<string>(
    myRequest?.certificateMimeType ?? ''
  );
  const [fileDataUrl, setFileDataUrl] = useState<string>(
    myRequest?.certificateDataUrl ?? ''
  );
  const [isEditingAgain, setIsEditingAgain] = useState<boolean>(false);
  const [agreeCertCollection, setAgreeCertCollection] = useState<boolean>(false);
  const [uploadingFile, setUploadingFile] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-[1440px] flex-col bg-[#FFFFFF]">
        {header}
        <main className="flex flex-1 flex-col items-center justify-center px-5 py-[80px] md:px-12 xl:px-[120px]">
          <div className="flex w-full max-w-[480px] flex-col items-center gap-[18px] rounded-[16px] border border-[#EBCDD9] p-[40px] text-center">
            <h1 className="m-0 text-[26px] font-bold text-[#0D050A]">
              로그인이 필요한 페이지예요
            </h1>
            <p className="m-0 text-[15px] leading-[1.45] text-[#4A3842]">
              학교 인증(학번 및 재학증명서 제출)은 로그인 후 진행할 수 있어요.
            </p>
            <div className="flex flex-row gap-[10px] pt-[8px]">
              <button
                type="button"
                onClick={() => onNavigate('login')}
                className="cursor-pointer rounded-[8px] border-0 bg-[#0D050A] px-[24px] py-[12px] text-[15px] font-medium text-[#FFFFFF]"
              >
                로그인하기
              </button>
              <button
                type="button"
                onClick={() => onNavigate('signup')}
                className="cursor-pointer rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[24px] py-[12px] text-[15px] font-medium text-[#0D050A]"
              >
                회원가입
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorText(null);
    setUploadingFile(true);
    try {
      const compressed = await compressCertificateFile(file);
      setFileName(compressed.fileName);
      setFileMimeType(compressed.mimeType);
      setFileDataUrl(compressed.dataUrl);
    } catch (err) {
      setErrorText(
        err instanceof Error
          ? err.message
          : '재학증명서 파일을 처리하는 중 오류가 발생했어요.'
      );
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchool || selectedSchool === '전체 (상관없음)') {
      setErrorText('인증할 대학교를 선택해 주세요.');
      return;
    }
    const safeDept = sanitizePlainText(department, 50);
    if (!safeDept) {
      setErrorText('학과(학부)를 입력해 주세요.');
      return;
    }
    const sidCheck = validateStudentId(studentId);
    if (!sidCheck.valid) {
      setErrorText(sidCheck.error ?? '정확한 학번을 입력해 주세요.');
      return;
    }
    if (!fileDataUrl || !isSafeCertificateDataUrl(fileDataUrl)) {
      setErrorText('정상적인 재학증명서 이미지(JPG/PNG/WEBP) 또는 PDF 파일을 업로드해 주세요.');
      return;
    }
    if (!agreeCertCollection) {
      setErrorText('학번 및 재학증명서 수집·이용 필수 동의 항목에 체크해 주세요.');
      return;
    }
    if (submitting) return;
    setErrorText(null);
    setSubmitting(true);
    try {
      await onSubmitVerification({
        university: selectedSchool,
        department: safeDept,
        studentId: sidCheck.cleaned,
        certificateFileName: fileName,
        certificateMimeType: fileMimeType,
        certificateDataUrl: fileDataUrl,
      });
      setIsEditingAgain(false);
    } catch (err) {
      setErrorText(
        err instanceof Error
          ? err.message
          : '인증 요청 처리 중 오류가 발생했어요.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const showStatusCardOnly =
    (user.verificationStatus === 'approved' || user.verificationStatus === 'pending') &&
    !isEditingAgain;

  const derivedYearPreview = studentId.trim()
    ? deriveStudentYearLabel(studentId.trim())
    : null;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-[1440px] flex-col bg-[#FFFFFF]">
      {header}

      <main className="flex flex-col items-center self-stretch px-5 py-[56px] md:px-12 xl:px-[120px]">
        <div className="flex w-full max-w-[720px] flex-col items-stretch gap-[28px]">
          <div className="flex flex-col gap-[8px] self-stretch">
            <h1 className="m-0 text-[32px] font-bold leading-[1.45] text-[#0D050A]">학교 인증</h1>
            <p className="m-0 text-[16px] font-normal leading-[1.45] text-[#4A3842]">
              학번과 재학증명서를 업로드하면 운영팀이 확인 후 승인해 드려요. 승인 완료 후 방 생성과 미팅 참여가 가능해요.
            </p>
          </div>

          {user.verificationStatus === 'rejected' && (
            <div className="flex flex-col gap-[6px] rounded-[12px] border border-[#F5C2C7] bg-[#FFF5F5] p-[20px]">
              <span className="text-[15px] font-bold text-[#B42318]">
                학교 인증 요청이 반려되었어요
              </span>
              <span className="text-[14px] text-[#4A3842]">
                {user.rejectionReason
                  ? `반려 사유: ${user.rejectionReason}`
                  : '제출하신 학번 또는 재학증명서를 다시 확인해 재업로드해 주세요.'}
              </span>
            </div>
          )}

          {showStatusCardOnly ? (
            <div className="flex flex-col gap-[20px] rounded-[16px] border border-[#EBCDD9] bg-[#FFFFFF] p-[32px]">
              <div className="flex flex-row items-center justify-between">
                <div className="flex flex-row items-center gap-[10px]">
                  <span
                    className={`inline-flex rounded-[999px] px-[14px] py-[6px] text-[14px] font-bold text-[#0D050A] ${
                      user.verificationStatus === 'approved'
                        ? 'bg-[#F7C1D4]'
                        : 'bg-[#F7D8E4]'
                    }`}
                  >
                    {user.verificationStatus === 'approved'
                      ? '재학생 인증 승인 완료'
                      : '운영팀 승인 심사 대기 중'}
                  </span>
                </div>
                {myRequest && (
                  <span className="text-[13px] text-[#6E5464]">
                    {`제출: ${formatRelativeTime(myRequest.submittedAt)}`}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-[8px] rounded-[12px] bg-[#FBEBF1] p-[20px]">
                <div className="flex flex-row justify-between text-[14px]">
                  <span className="text-[#6E5464]">학교 / 학과</span>
                  <span className="font-bold text-[#0D050A]">
                    {`${user.university} ${user.department}`}
                  </span>
                </div>
                <div className="flex flex-row justify-between text-[14px]">
                  <span className="text-[#6E5464]">학번</span>
                  <span className="font-bold text-[#0D050A]">
                    {`${user.studentId} (프로필 표시: ${user.studentYear})`}
                  </span>
                </div>
                {myRequest?.certificateFileName && (
                  <div className="flex flex-row justify-between text-[14px]">
                    <span className="text-[#6E5464]">제출한 재학증명서</span>
                    <span className="font-medium text-[#4A3842]">
                      {myRequest.certificateFileName}
                    </span>
                  </div>
                )}
              </div>

              {myRequest?.certificateDataUrl &&
                myRequest.certificateMimeType.startsWith('image/') &&
                isSafeCertificateDataUrl(myRequest.certificateDataUrl, 'image') && (
                  <div className="flex flex-col gap-[8px]">
                    <span className="text-[13px] font-medium text-[#6E5464]">
                      제출한 증명서 미리보기
                    </span>
                    <img
                      src={myRequest.certificateDataUrl}
                      alt={`${user.university} 제출 재학증명서 미리보기`}
                      className="max-h-[260px] w-fit rounded-[8px] border border-[#EBCDD9] object-contain"
                    />
                  </div>
                )}

              <p className="m-0 text-[14px] leading-[1.45] text-[#4A3842]">
                {user.verificationStatus === 'approved'
                  ? '이제 미팅 방을 직접 만들거나 내 대학이 포함된 미팅 방·모집글에 자유롭게 참여할 수 있어요!'
                  : '제출하신 학번과 재학증명서를 운영팀이 검토하고 있어요. 승인이 완료되면 실시간으로 방 생성과 미팅 참여 권한이 열려요.'}
              </p>

              <div className="flex flex-row justify-end gap-[10px] pt-[4px]">
                <button
                  type="button"
                  onClick={() => setIsEditingAgain(true)}
                  className="cursor-pointer rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[20px] py-[12px] text-[14px] font-medium text-[#0D050A]"
                >
                  서류 다시 제출하기
                </button>
                {user.verificationStatus === 'approved' ? (
                  <button
                    type="button"
                    onClick={() => onNavigate('rooms')}
                    className="cursor-pointer rounded-[8px] border-0 bg-[#0D050A] px-[20px] py-[12px] text-[14px] font-medium text-[#FFFFFF]"
                  >
                    미팅 방 둘러보기
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNavigate('home')}
                    className="cursor-pointer rounded-[8px] border-0 bg-[#0D050A] px-[20px] py-[12px] text-[14px] font-medium text-[#FFFFFF]"
                  >
                    홈으로 이동
                  </button>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col items-stretch gap-[24px]">
              <div className="flex flex-col gap-[16px] self-stretch sm:flex-row">
                <div className="flex flex-1 flex-col gap-[10px]">
                  <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">
                    학교
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenOverlay({
                        id: 'select-university',
                        initialValue: selectedSchool || undefined,
                        allowAnyUniversity: false,
                        onApply: (val) => setSelectedSchool(val),
                      })
                    }
                    className="flex h-[44px] cursor-pointer flex-row items-center justify-between self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[0px]"
                  >
                    <span className="truncate text-[14px] font-normal text-[#4A3842]">
                      {selectedSchool || '학교 검색 및 선택'}
                    </span>
                    <ChevronDownSmall />
                  </button>
                </div>

                <div className="flex flex-1 flex-col gap-[10px]">
                  <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">
                    학과 / 학부
                  </label>
                  <div className="flex h-[44px] flex-row items-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px]">
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="소속 학과 또는 학부 입력"
                      className="w-full border-0 bg-transparent p-0 text-[14px] font-normal text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-[10px] self-stretch">
                <div className="flex flex-row items-center justify-between">
                  <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">
                    학번
                  </label>
                  {derivedYearPreview && (
                    <span className="text-[13px] font-medium text-[#6E5464]">
                      {`프로필 표시 학번: ${derivedYearPreview}`}
                    </span>
                  )}
                </div>
                <div className="flex h-[44px] flex-row items-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px]">
                  <input
                    type="text"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    placeholder="전체 학번 입력 (예: 20261234)"
                    className="w-full border-0 bg-transparent p-0 text-[14px] font-normal text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-[10px] self-stretch">
                <label className="text-[15px] font-bold leading-[1.45] text-[#0D050A]">
                  재학증명서 업로드
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div
                  role="button"
                  tabIndex={0}
                  aria-label="재학증명서 이미지 또는 PDF 파일 선택"
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  className="flex cursor-pointer flex-col items-center justify-center gap-[10px] rounded-[12px] border border-dashed border-[#D8B4C4] bg-[#FBEBF1] p-[28px] text-center"
                >
                  {uploadingFile ? (
                    <span className="text-[14px] font-medium text-[#4A3842]">
                      재학증명서 파일을 불러오는 중이에요...
                    </span>
                  ) : fileDataUrl ? (
                    <div className="flex flex-col items-center gap-[12px]">
                      {fileMimeType.startsWith('image/') ? (
                        <img
                          src={fileDataUrl}
                          alt={`${selectedSchool || '선택 대학'} 업로드 재학증명서 미리보기`}
                          className="max-h-[220px] rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] object-contain"
                        />
                      ) : (
                        <div className="rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[20px] py-[12px] text-[14px] font-bold text-[#0D050A]">
                          PDF 문서 첨부 완료
                        </div>
                      )}
                      <span className="text-[14px] font-bold text-[#0D050A]">{fileName}</span>
                      <span className="text-[13px] text-[#6E5464]">
                        다른 파일로 바꾸려면 여기를 클릭해 주세요
                      </span>
                    </div>
                  ) : (
                    <>
                      <span className="text-[15px] font-bold text-[#0D050A]">
                        클릭하여 재학증명서 파일 선택 (이미지 또는 PDF)
                      </span>
                      <span className="text-[13px] text-[#6E5464]">
                        학교명·성명·학번이 보이도록 발급받은 재학증명서(또는 모바일 학생증·포털 학적 캡처)를 올려 주세요.
                      </span>
                    </>
                  )}
                </div>
              </div>

              {errorText && (
                <div className="rounded-[8px] border border-[#F5C2C7] bg-[#FFF5F5] px-[14px] py-[12px] text-[13px] font-medium text-[#B42318]">
                  {errorText}
                </div>
              )}

              <div className="flex flex-col gap-[10px] self-stretch rounded-[10px] border border-[#EBCDD9] bg-[#F7D8E4] px-[16px] py-[14px]">
                <span className="text-[13px] font-normal leading-[1.45] text-[#4A3842]">
                  제출된 재학증명서는 재학 여부 확인에만 사용되며 이미지 속 EXIF 위치정보는 자동 제거돼요. 타 회원에게는 학교·학과·입학연도(예: 26학번)만 표시되고 전체 학번·증명서 원본은 절대 공개되지 않아요.
                </span>
                <div className="flex flex-row items-start justify-between gap-[8px] border-t border-[#D8B4C4] pt-[10px]">
                  <label className="flex cursor-pointer flex-row items-start gap-[8px] text-[13px] text-[#0D050A]">
                    <input
                      type="checkbox"
                      checked={agreeCertCollection}
                      onChange={(e) => {
                        setAgreeCertCollection(e.target.checked);
                        setErrorText(null);
                      }}
                      className="mt-[2px] h-[16px] w-[16px] shrink-0 accent-[#0D050A]"
                    />
                    <span>
                      <strong>[필수]</strong> 본인 명의의 서류이며 재학 여부 심사를 위한 학번·재학증명서 수집·이용에 동의합니다. (마이페이지에서 언제든 즉시 파기 가능)
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => onOpenOverlay({ id: 'privacy' })}
                    className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[12px] font-bold text-[#4A3842] underline"
                  >
                    처리방침
                  </button>
                </div>
              </div>

              <div className="flex flex-row justify-end gap-[12px] self-stretch">
                {isEditingAgain && (
                  <button
                    type="button"
                    onClick={() => setIsEditingAgain(false)}
                    className="flex cursor-pointer flex-row items-center justify-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[20px] py-[12px]"
                  >
                    <span className="text-[15px] font-medium text-[#0D050A]">취소</span>
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting || uploadingFile}
                  className="flex cursor-pointer flex-row items-center justify-center rounded-[8px] border-0 bg-[#0D050A] px-[24px] py-[12px] disabled:opacity-60"
                >
                  <span className="text-[15px] font-medium text-[#FFFFFF]">
                    {submitting ? '제출 중...' : '인증 심사 요청하기'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

/* =========================
   4. 관리자 전용 포털 (학생 서비스 화면과 완전히 분리된 관리자 페이지)
========================= */
export function AdminPortal({
  adminUser,
  requests,
  users,
  rooms,
  posts,
  reports,
  inquiries,
  onApprove,
  onReject,
  onDirectSetUserVerification,
  onPurgeUserData,
  onDeleteRoom,
  onTogglePostStatus,
  onDeletePost,
  onLogout,
}: {
  adminUser: UserProfile;
  requests: VerificationRequest[];
  users: UserProfile[];
  rooms: MeetingRoom[];
  posts: BoardPost[];
  reports: ReportRecord[];
  inquiries: InquiryRecord[];
  onApprove: (req: VerificationRequest) => Promise<void>;
  onReject: (req: VerificationRequest, reason: string) => Promise<void>;
  onDirectSetUserVerification: (
    targetUser: UserProfile,
    decision: 'approved' | 'unverified'
  ) => Promise<void>;
  onPurgeUserData: (targetUser: UserProfile) => Promise<void>;
  onDeleteRoom: (roomId: string) => Promise<void>;
  onTogglePostStatus: (post: BoardPost) => Promise<void>;
  onDeletePost: (postId: string) => Promise<void>;
  onLogout: () => void;
}) {
  const [sectionTab, setSectionTab] = useState<
    'verifications' | 'users' | 'rooms' | 'posts' | 'reports' | 'inquiries'
  >('verifications');
  const [statusFilter, setStatusFilter] = useState<
    'pending' | 'approved' | 'rejected' | 'all'
  >('pending');
  const [userSearch, setUserSearch] = useState<string>('');
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(
    null
  );
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState<string>('');

  useEffect(() => {
    if (!previewImage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewImage(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewImage]);

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const approvedCount = requests.filter((r) => r.status === 'approved').length;
  const rejectedCount = requests.filter((r) => r.status === 'rejected').length;

  const filteredRequests = requests.filter((r) =>
    statusFilter === 'all' ? true : r.status === statusFilter
  );

  // requests에만 있고 users 컬렉션에는 아직 없을 수 있는 계정까지 통합 표시
  const mergedStudentUsers: UserProfile[] = React.useMemo(() => {
    const map = new Map<string, UserProfile>();
    users.forEach((u) => {
      if (!u.isAdmin) map.set(u.uid, u);
    });
    requests.forEach((req) => {
      const existing = map.get(req.uid);
      if (!existing) {
        map.set(req.uid, {
          uid: req.uid,
          email: req.userEmail,
          name: req.userName,
          gender: req.gender,
          university: req.university,
          department: req.department,
          studentId: req.studentId,
          studentYear: req.studentYear,
          verified: req.status === 'approved',
          verificationStatus: req.status,
          rejectionReason: req.rejectionReason ?? '',
          isAdmin: false,
          createdAt: req.submittedAt,
        });
      }
    });
    const q = userSearch.trim().toLowerCase();
    return Array.from(map.values())
      .filter((u) => {
        if (!q) return true;
        return `${u.name} ${u.email} ${u.university} ${u.department} ${u.studentId}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }, [users, requests, userSearch]);

  const navTabs: {
    id: 'verifications' | 'users' | 'rooms' | 'posts' | 'reports' | 'inquiries';
    label: string;
    badge?: number;
  }[] = [
    { id: 'verifications', label: '학교 인증 심사', badge: pendingCount },
    { id: 'users', label: '전체 회원 관리', badge: mergedStudentUsers.length },
    { id: 'rooms', label: '미팅 방 관리', badge: rooms.length },
    { id: 'posts', label: '게시판 관리', badge: posts.length },
    { id: 'reports', label: '신고 접수', badge: reports.length },
    { id: 'inquiries', label: '1:1 문의', badge: inquiries.length },
  ];

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#FFFFFF]">
      {/* 관리자 전용 상단 고정 헤더 */}
      <header className="z-30 w-full shrink-0 border-b border-[#EBCDD9] bg-[#0D050A]">
        <div className="mx-auto flex h-[72px] w-full max-w-[1440px] flex-row items-center justify-between px-5 md:px-12 xl:px-[120px]">
          <div className="flex flex-row items-center gap-[12px]">
            <img
              src="/logo.svg?v=2"
              alt="Univmeeting 로고"
              className="h-[28px] w-[28px] rounded-[6px] object-cover"
            />
            <span className="text-[20px] font-bold text-[#FFFFFF]">Univmeeting</span>
            <span className="rounded-[999px] bg-[#F7C1D4] px-[10px] py-[3px] text-[12px] font-bold text-[#0D050A]">
              ADMIN PORTAL
            </span>
          </div>

          <div className="flex flex-row items-center gap-[14px]">
            <span className="hidden text-[13px] font-normal text-[#F7D8E4] sm:inline">
              {adminUser.email}
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="cursor-pointer rounded-[8px] border border-[#6E5464] bg-transparent px-[14px] py-[7px] text-[13px] font-medium text-[#FFFFFF]"
            >
              관리자 로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* 관리자 전용 스크롤 본문 */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto bg-[#FFFFFF]">
        <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-[24px] px-5 py-[44px] md:px-12 xl:px-[120px]">
          <div className="flex flex-col gap-[6px]">
            <h1 className="m-0 text-[30px] font-bold leading-[1.45] text-[#0D050A]">
              운영팀 통합 관리자 페이지
            </h1>
            <p className="m-0 text-[15px] font-normal leading-[1.45] text-[#4A3842]">
              재학증명서 심사, 회원 학교 인증 관리, 미팅 방·게시글 운영, 신고 및 1:1 문의를 전용 포털에서 관리합니다.
            </p>
          </div>

          {/* 상단 섹션 탭 */}
          <div className="flex flex-row flex-wrap self-stretch shadow-[inset_0_-1px_0_0_#EBCDD9]">
            {navTabs.map((t) => {
              const active = sectionTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSectionTab(t.id)}
                  className={`flex cursor-pointer flex-row items-center gap-[8px] border-0 bg-transparent px-[18px] py-[14px] ${
                    active ? 'shadow-[inset_0_-2px_0_0_#0D050A]' : ''
                  }`}
                >
                  <span
                    className={
                      active
                        ? 'text-[15px] font-bold leading-[1.45] text-[#0D050A]'
                        : 'text-[15px] font-medium leading-[1.45] text-[#6E5464]'
                    }
                  >
                    {t.label}
                  </span>
                  {typeof t.badge === 'number' && (
                    <span
                      className={`rounded-[999px] px-[8px] py-[1px] text-[12px] font-bold ${
                        t.id === 'verifications' && t.badge > 0
                          ? 'bg-[#F7C1D4] text-[#0D050A]'
                          : 'bg-[#FBEBF1] text-[#4A3842]'
                      }`}
                    >
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 1) 학교 인증 심사 탭 */}
          {sectionTab === 'verifications' && (
            <>
              <div className="flex flex-row flex-wrap gap-[8px]">
                {(
                  [
                    { id: 'pending', label: `승인 대기 (${pendingCount})` },
                    { id: 'approved', label: `승인 완료 (${approvedCount})` },
                    { id: 'rejected', label: `반려됨 (${rejectedCount})` },
                    { id: 'all', label: `전체 (${requests.length})` },
                  ] as const
                ).map((tab) =>
                  statusFilter === tab.id ? (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusFilter(tab.id)}
                      className="flex cursor-pointer flex-row items-center rounded-[999px] border border-[#F7C1D4] bg-[#F7C1D4] px-[16px] py-[6px]"
                    >
                      <span className="text-[14px] font-bold text-[#0D050A]">{tab.label}</span>
                    </button>
                  ) : (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusFilter(tab.id)}
                      className="flex cursor-pointer flex-row items-center rounded-[999px] border border-[#D8B4C4] bg-[#FFFFFF] px-[16px] py-[6px]"
                    >
                      <span className="text-[14px] font-normal text-[#4A3842]">{tab.label}</span>
                    </button>
                  )
                )}
              </div>

              {filteredRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-[8px] rounded-[12px] border border-[#EBCDD9] py-[72px]">
                  <span className="text-[15px] text-[#6E5464]">
                    해당 상태의 학교 인증 신청 내역이 없어요.
                  </span>
                  <span className="text-[13px] text-[#8E7182]">
                    기존 가입 회원의 인증 상태를 직접 변경하려면 상단 &lsquo;전체 회원 관리&rsquo; 탭을 이용해 주세요.
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-[20px]">
                  {filteredRequests.map((req) => (
                    <article
                      key={req.id}
                      className="flex flex-col items-start justify-between gap-[24px] rounded-[16px] border border-[#EBCDD9] bg-[#FFFFFF] p-[28px] lg:flex-row"
                    >
                      <div className="flex flex-1 flex-col gap-[14px]">
                        <div className="flex flex-row flex-wrap items-center gap-[10px]">
                          <span
                            className={`rounded-[999px] px-[12px] py-[4px] text-[13px] font-bold text-[#0D050A] ${
                              req.status === 'approved'
                                ? 'bg-[#F7C1D4]'
                                : req.status === 'rejected'
                                  ? 'bg-[#EBCDD9]'
                                  : 'bg-[#F7D8E4]'
                            }`}
                          >
                            {req.status === 'approved'
                              ? '승인 완료'
                              : req.status === 'rejected'
                                ? '반려됨'
                                : '승인 대기'}
                          </span>
                          <span className="text-[18px] font-bold text-[#0D050A]">
                            {req.userName}
                          </span>
                          <GenderBadge gender={req.gender} />
                          <span className="text-[14px] text-[#6E5464]">{req.userEmail}</span>
                          <span className="text-[13px] text-[#8E7182]">
                            {`· ${formatRelativeTime(req.submittedAt)}`}
                          </span>
                        </div>

                        <div className="flex flex-row flex-wrap gap-[28px] rounded-[10px] bg-[#FBEBF1] px-[20px] py-[14px]">
                          <div className="flex flex-col gap-[2px]">
                            <span className="text-[12px] text-[#6E5464]">학교</span>
                            <span className="text-[15px] font-bold text-[#0D050A]">
                              {req.university}
                            </span>
                          </div>
                          <div className="flex flex-col gap-[2px]">
                            <span className="text-[12px] text-[#6E5464]">학과 / 학부</span>
                            <span className="text-[15px] font-bold text-[#0D050A]">
                              {req.department}
                            </span>
                          </div>
                          <div className="flex flex-col gap-[2px]">
                            <span className="text-[12px] text-[#6E5464]">제출 학번</span>
                            <span className="text-[15px] font-bold text-[#0D050A]">
                              {`${req.studentId} (${req.studentYear})`}
                            </span>
                          </div>
                          <div className="flex flex-col gap-[2px]">
                            <span className="text-[12px] text-[#6E5464]">첨부 파일</span>
                            <span className="text-[14px] font-medium text-[#4A3842]">
                              {req.certificateFileName}
                            </span>
                          </div>
                        </div>

                        {req.rejectionReason && req.status === 'rejected' && (
                          <span className="text-[13px] font-medium text-[#B42318]">
                            {`반려 사유: ${req.rejectionReason}`}
                          </span>
                        )}

                        {rejectingId === req.id ? (
                          <div className="flex flex-row items-center gap-[8px] pt-[4px]">
                            <input
                              type="text"
                              value={rejectReasonInput}
                              onChange={(e) => setRejectReasonInput(e.target.value)}
                              placeholder="반려 사유 입력 (예: 증명서 학번 식별 불가)"
                              className="h-[40px] flex-1 rounded-[8px] border border-[#D8B4C4] px-[12px] text-[14px] text-[#0D050A] focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                await onReject(
                                  req,
                                  rejectReasonInput.trim() ||
                                    '재학증명서의 학교·학번 정보를 다시 확인해 업로드해 주세요.'
                                );
                                setRejectingId(null);
                                setRejectReasonInput('');
                              }}
                              className="cursor-pointer rounded-[8px] border-0 bg-[#0D050A] px-[16px] py-[10px] text-[14px] font-medium text-[#FFFFFF]"
                            >
                              반려 확정
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingId(null);
                                setRejectReasonInput('');
                              }}
                              className="cursor-pointer rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[10px] text-[14px] text-[#0D050A]"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-row items-center gap-[10px] pt-[4px]">
                            {req.status !== 'approved' && (
                              <button
                                type="button"
                                onClick={() => onApprove(req)}
                                className="cursor-pointer rounded-[8px] border-0 bg-[#0D050A] px-[20px] py-[10px] text-[14px] font-medium text-[#FFFFFF]"
                              >
                                승인하기
                              </button>
                            )}
                            {req.status !== 'rejected' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectingId(req.id);
                                  setRejectReasonInput('');
                                }}
                                className="cursor-pointer rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[20px] py-[10px] text-[14px] font-medium text-[#0D050A]"
                              >
                                반려하기
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex w-[260px] shrink-0 flex-col items-center gap-[8px]">
                        {req.certificateDataUrl &&
                        req.certificateMimeType.startsWith('image/') &&
                        isSafeCertificateDataUrl(req.certificateDataUrl, 'image') ? (
                          <>
                            <img
                              src={req.certificateDataUrl}
                              alt={`${req.userName} 재학증명서`}
                              onClick={() =>
                                setPreviewImage({
                                  url: req.certificateDataUrl,
                                  title: `${req.university} ${req.userName} (${req.studentId})`,
                                })
                              }
                              className="h-[160px] w-full cursor-pointer rounded-[10px] border border-[#D8B4C4] bg-[#FBEBF1] object-cover"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewImage({
                                  url: req.certificateDataUrl,
                                  title: `${req.university} ${req.userName} (${req.studentId})`,
                                })
                              }
                              className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-bold text-[#0D050A] underline"
                            >
                              재학증명서 크게 보기
                            </button>
                          </>
                        ) : req.certificateDataUrl &&
                          isSafeCertificateDataUrl(req.certificateDataUrl, 'pdf') ? (
                          <button
                            type="button"
                            onClick={() => {
                              openSafePdfCertificate(req.certificateDataUrl);
                            }}
                            className="flex h-[120px] w-full cursor-pointer flex-col items-center justify-center gap-[6px] rounded-[10px] border border-[#D8B4C4] bg-[#FBEBF1] p-[16px] text-center"
                          >
                            <span className="text-[14px] font-bold text-[#0D050A]">
                              PDF 재학증명서 안전 열기
                            </span>
                            <span className="w-full truncate text-[12px] text-[#6E5464]">
                              {req.certificateFileName}
                            </span>
                          </button>
                        ) : (
                          <div className="flex h-[120px] w-full items-center justify-center rounded-[10px] border border-[#EBCDD9] text-[13px] text-[#6E5464]">
                            {req.certificateFileName || '첨부 파일 없음'}
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}

          {/* 2) 전체 회원 관리 탭 (테스트 계정 등 직접 인증 승인/해제 지원) */}
          {sectionTab === 'users' && (
            <div className="flex flex-col gap-[16px]">
              <div className="flex flex-row items-center justify-between gap-[12px]">
                <div className="flex h-[44px] w-full max-w-[380px] flex-row items-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px]">
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="이름, 이메일, 대학교, 학과 검색"
                    className="w-full border-0 bg-transparent p-0 text-[14px] text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
                  />
                </div>
              </div>

              {mergedStudentUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-[12px] border border-[#EBCDD9] py-[72px]">
                  <span className="text-[15px] text-[#6E5464]">가입된 학생 회원이 없어요.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-[12px]">
                  {mergedStudentUsers.map((u) => {
                    const isApproved = u.verified && u.verificationStatus === 'approved';
                    return (
                      <article
                        key={u.uid}
                        className="flex flex-col items-start justify-between gap-[16px] rounded-[12px] border border-[#EBCDD9] bg-[#FFFFFF] p-[20px] sm:flex-row sm:items-center"
                      >
                        <div className="flex flex-col gap-[6px]">
                          <div className="flex flex-row flex-wrap items-center gap-[8px]">
                            <span
                              className={`rounded-[999px] px-[10px] py-[2px] text-[12px] font-bold text-[#0D050A] ${
                                isApproved
                                  ? 'bg-[#F7C1D4]'
                                  : u.verificationStatus === 'pending'
                                    ? 'bg-[#F7D8E4]'
                                    : 'bg-[#FBEBF1]'
                              }`}
                            >
                              {isApproved
                                ? '학교 인증 완료'
                                : u.verificationStatus === 'pending'
                                  ? '심사 대기'
                                  : u.verificationStatus === 'rejected'
                                    ? '반려됨'
                                    : '미인증'}
                            </span>
                            <span className="text-[16px] font-bold text-[#0D050A]">{u.name}</span>
                            <GenderBadge gender={u.gender} />
                            <span className="text-[14px] text-[#6E5464]">{u.email}</span>
                          </div>
                          <span className="text-[14px] text-[#4A3842]">
                            {`${u.university} · ${u.department}${
                              u.studentId ? ` · 학번 ${u.studentId} (${u.studentYear})` : ''
                            }`}
                          </span>
                        </div>

                        <div className="flex shrink-0 flex-row flex-wrap items-center gap-[8px]">
                          {isApproved ? (
                            <button
                              type="button"
                              onClick={() => onDirectSetUserVerification(u, 'unverified')}
                              className="cursor-pointer rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[9px] text-[13px] font-medium text-[#4A3842]"
                            >
                              인증 해제
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onDirectSetUserVerification(u, 'approved')}
                              className="cursor-pointer rounded-[8px] border-0 bg-[#0D050A] px-[16px] py-[9px] text-[13px] font-medium text-[#FFFFFF]"
                            >
                              학교 인증 승인
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `${u.name}(${u.email}) 회원의 프로필·재학증명서·개설 방·작성 글을 모두 영구 파기할까요?`
                                )
                              ) {
                                void onPurgeUserData(u);
                              }
                            }}
                            className="cursor-pointer rounded-[8px] border border-[#F5C2C7] bg-[#FFF5F5] px-[12px] py-[9px] text-[13px] font-bold text-[#B42318]"
                          >
                            개인정보 파기
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 3) 미팅 방 관리 탭 */}
          {sectionTab === 'rooms' && (
            <div className="flex flex-col gap-[12px]">
              {rooms.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-[12px] border border-[#EBCDD9] py-[72px]">
                  <span className="text-[15px] text-[#6E5464]">현재 개설된 미팅 방이 없어요.</span>
                </div>
              ) : (
                rooms.map((room) => (
                  <article
                    key={room.id}
                    className="flex flex-col items-start justify-between gap-[16px] rounded-[12px] border border-[#EBCDD9] bg-[#FFFFFF] p-[20px] sm:flex-row sm:items-center"
                  >
                    <div className="flex flex-col gap-[6px]">
                      <div className="flex flex-row flex-wrap items-center gap-[8px]">
                        <span className="rounded-[999px] border border-[#D8B4C4] px-[10px] py-[2px] text-[12px] font-medium text-[#4A3842]">
                          {room.format}
                        </span>
                        <span className="text-[13px] font-bold text-[#0D050A]">{room.status}</span>
                        <span className="text-[16px] font-bold text-[#0D050A]">{room.title}</span>
                      </div>
                      <span className="text-[14px] text-[#4A3842]">
                        {`${room.leftUniversity.name}(${room.leftUniversity.gender}) × ${room.rightUniversity.name}(${room.rightUniversity.gender}) · ${room.schedule} · ${room.location}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`'${room.title}' 미팅 방을 삭제할까요?`)) {
                          void onDeleteRoom(room.id);
                        }
                      }}
                      className="shrink-0 cursor-pointer rounded-[8px] border border-[#F5C2C7] bg-[#FFF5F5] px-[14px] py-[8px] text-[13px] font-bold text-[#B42318]"
                    >
                      방 삭제
                    </button>
                  </article>
                ))
              )}
            </div>
          )}

          {/* 4) 게시판 관리 탭 */}
          {sectionTab === 'posts' && (
            <div className="flex flex-col gap-[12px]">
              {posts.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-[12px] border border-[#EBCDD9] py-[72px]">
                  <span className="text-[15px] text-[#6E5464]">현재 등록된 게시글이 없어요.</span>
                </div>
              ) : (
                posts.map((post) => (
                  <article
                    key={post.id}
                    className="flex flex-col items-start justify-between gap-[16px] rounded-[12px] border border-[#EBCDD9] bg-[#FFFFFF] p-[20px] sm:flex-row sm:items-center"
                  >
                    <div className="flex flex-col gap-[6px]">
                      <div className="flex flex-row flex-wrap items-center gap-[8px]">
                        <span className="rounded-[999px] bg-[#F7D8E4] px-[10px] py-[2px] text-[12px] font-bold text-[#0D050A]">
                          {post.tab === 'meeting' ? '미팅 모집' : '팀원 구인'}
                        </span>
                        <span className="text-[13px] font-bold text-[#0D050A]">{post.status}</span>
                        <GenderBadge gender={post.gender} />
                        <span className="text-[16px] font-bold text-[#0D050A]">{post.title}</span>
                      </div>
                      <span className="text-[14px] text-[#4A3842]">
                        {`${post.university} ${post.department} · ${post.format} · ${post.date} · ${post.location}`}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-row items-center gap-[8px]">
                      <button
                        type="button"
                        onClick={() => void onTogglePostStatus(post)}
                        className="cursor-pointer rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[8px] text-[13px] font-medium text-[#0D050A]"
                      >
                        {post.status === '모집 중' ? '마감 처리' : '모집 재오픈'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`'${post.title}' 게시글을 삭제할까요?`)) {
                            void onDeletePost(post.id);
                          }
                        }}
                        className="cursor-pointer rounded-[8px] border border-[#F5C2C7] bg-[#FFF5F5] px-[14px] py-[8px] text-[13px] font-bold text-[#B42318]"
                      >
                        글 삭제
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}

          {/* 5) 신고 접수 탭 */}
          {sectionTab === 'reports' && (
            <div className="flex flex-col gap-[16px]">
              {reports.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-[12px] border border-[#EBCDD9] py-[72px]">
                  <span className="text-[15px] text-[#6E5464]">접수된 신고 내역이 없어요.</span>
                </div>
              ) : (
                reports.map((rep, idx) => (
                  <article
                    key={rep.id ?? idx}
                    className="flex flex-row items-center justify-between gap-[20px] rounded-[12px] border border-[#EBCDD9] bg-[#FFFFFF] p-[24px]"
                  >
                    <div className="flex flex-col gap-[6px]">
                      <div className="flex flex-row items-center gap-[8px]">
                        <span className="rounded-[999px] bg-[#F7C1D4] px-[10px] py-[2px] text-[12px] font-bold text-[#0D050A]">
                          {rep.reason}
                        </span>
                        <span className="text-[13px] text-[#6E5464]">
                          {rep.targetType === 'room'
                            ? '미팅 방 신고'
                            : rep.targetType === 'post'
                              ? '게시글 신고'
                              : '일반 신고'}
                        </span>
                        <span className="text-[13px] text-[#8E7182]">
                          {`· ${formatRelativeTime(rep.createdAt)}`}
                        </span>
                      </div>
                      <p className="m-0 text-[14px] text-[#0D050A]">
                        {rep.detail || '(상세 내용 미기재)'}
                      </p>
                    </div>

                    {rep.targetId && rep.targetType === 'room' && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('신고된 미팅 방을 즉시 삭제할까요?')) {
                            void onDeleteRoom(rep.targetId!);
                          }
                        }}
                        className="shrink-0 cursor-pointer rounded-[8px] border border-[#F5C2C7] bg-[#FFF5F5] px-[14px] py-[8px] text-[13px] font-bold text-[#B42318]"
                      >
                        신고된 방 삭제
                      </button>
                    )}
                    {rep.targetId && rep.targetType === 'post' && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('신고된 게시글을 즉시 삭제할까요?')) {
                            void onDeletePost(rep.targetId!);
                          }
                        }}
                        className="shrink-0 cursor-pointer rounded-[8px] border border-[#F5C2C7] bg-[#FFF5F5] px-[14px] py-[8px] text-[13px] font-bold text-[#B42318]"
                      >
                        신고된 글 삭제
                      </button>
                    )}
                  </article>
                ))
              )}
            </div>
          )}

          {/* 6) 1:1 문의 탭 */}
          {sectionTab === 'inquiries' && (
            <div className="flex flex-col gap-[16px]">
              {inquiries.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-[12px] border border-[#EBCDD9] py-[72px]">
                  <span className="text-[15px] text-[#6E5464]">접수된 1:1 문의가 없어요.</span>
                </div>
              ) : (
                inquiries.map((inq, idx) => (
                  <article
                    key={inq.id ?? idx}
                    className="flex flex-row items-center justify-between gap-[20px] rounded-[12px] border border-[#EBCDD9] bg-[#FFFFFF] p-[24px]"
                  >
                    <div className="flex flex-col gap-[6px]">
                      <div className="flex flex-row flex-wrap items-center gap-[8px]">
                        {inq.content.startsWith('[개인정보 삭제 요청') && (
                          <span className="rounded-[999px] bg-[#FFF5F5] border border-[#F5C2C7] px-[10px] py-[2px] text-[12px] font-bold text-[#B42318]">
                            개인정보 파기 요청
                          </span>
                        )}
                        <span className="text-[14px] font-bold text-[#0D050A]">
                          {inq.email || '비회원 문의'}
                        </span>
                        <span className="text-[13px] text-[#8E7182]">
                          {`· ${formatRelativeTime(inq.createdAt)}`}
                        </span>
                      </div>
                      <p className="m-0 whitespace-pre-line text-[14px] text-[#4A3842]">
                        {inq.content}
                      </p>
                    </div>

                    {isSafeEmailAddress(inq.email) && (
                      <a
                        href={`mailto:${encodeURIComponent(inq.email.trim())}?subject=${encodeURIComponent('[Univmeeting] 문의하신 내용에 답변드립니다')}`}
                        className="shrink-0 rounded-[8px] bg-[#0D050A] px-[14px] py-[8px] text-[13px] font-medium text-[#FFFFFF] no-underline"
                      >
                        메일 답변하기
                      </a>
                    )}
                  </article>
                ))
              )}
            </div>
          )}
        </main>
      </div>

      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[rgba(13,5,10,0.72)] p-[40px]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] max-w-[900px] flex-col gap-[16px] rounded-[16px] bg-[#FFFFFF] p-[24px]"
          >
            <div className="flex flex-row items-center justify-between gap-[24px]">
              <span className="text-[18px] font-bold text-[#0D050A]">{previewImage.title}</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="cursor-pointer rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[6px] text-[13px] font-medium text-[#0D050A]"
              >
                닫기
              </button>
            </div>
            <img
              src={previewImage.url}
              alt={previewImage.title}
              className="max-h-[70vh] w-auto rounded-[8px] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
