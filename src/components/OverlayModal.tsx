import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NATIONWIDE_UNIVERSITIES } from '../data/universities';
import type { ActiveOverlayState, PageId, ToastId } from '../types/meeting';
import {
  getCookieConsent,
  setCookieConsent,
  subscribeCookieConsent,
  type CookieConsentLevel,
} from '../utils/cookieConsent';
import { isSafeEmailAddress, sanitizePlainText } from '../utils/security';
import {
  COOKIE_SECTIONS,
  LEGAL_EFFECTIVE_DATE,
  PRIVACY_SECTIONS,
  TERMS_SECTIONS,
  type LegalSection,
} from './LegalDocumentsAndBanner';

export const REPORT_REASON_OPTIONS: string[] = [
  '부적절한 내용',
  '허위 정보',
  '광고·스팸',
  '기타',
];

export const DELETION_SCOPE_OPTIONS: string[] = [
  '회원 계정 및 모든 개인정보 전체 삭제',
  '재학증명서·학번 원본 단독 파기',
  '1:1 문의·신고 기록 삭제',
];

export const REGION_SELECT_OPTIONS: string[] = [
  '전체',
  '서울 신촌·홍대',
  '서울 강남',
  '서울 동작·관악',
  '서울 성수·건대',
  '서울 대학로·성북',
  '경기·인천',
  '강원',
  '대전·세종·충청',
  '대구·경북',
  '부산·울산·경남',
  '광주·전라',
  '제주',
];

export const HEADCOUNT_SELECT_OPTIONS: string[] = ['전체', '2:2', '3:3', '4:4'];

export const DATE_SELECT_OPTIONS: string[] = [
  '전체',
  '오늘',
  '이번 주',
  '이번 주말',
  '다음 주',
  '평일 저녁',
  '금요일 저녁',
  '토요일 저녁',
  '일요일 오후',
  '일정 협의',
];

function ModalSearchIcon() {
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

function OverlayChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  if (selected) {
    return (
      <button
        type="button"
        aria-pressed={true}
        onClick={onClick}
        className="flex cursor-pointer flex-row items-center rounded-[999px] border border-[#F7C1D4] bg-[#F7C1D4] px-[14px] py-[6px]"
      >
        <span className="text-[14px] font-bold text-[#0D050A]">{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={false}
      onClick={onClick}
      className="flex cursor-pointer flex-row items-center rounded-[999px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[6px]"
    >
      <span className="text-[14px] font-normal text-[#4A3842]">{label}</span>
    </button>
  );
}

function ModalSecondaryButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 cursor-pointer flex-row items-center justify-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[20px] py-[12px]"
    >
      <span className="text-[15px] font-medium text-[#0D050A]">{label}</span>
    </button>
  );
}

function ModalPrimaryButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex flex-1 cursor-pointer flex-row items-center justify-center rounded-[8px] border-0 bg-[#0D050A] px-[20px] py-[12px] disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span className="text-[15px] font-medium text-[#FFFFFF]">{label}</span>
    </button>
  );
}

function LegalDocumentSections({ sections }: { sections: LegalSection[] }) {
  return (
    <div
      tabIndex={0}
      aria-label="약관 및 정책 본문"
      className="flex max-h-[56vh] flex-col gap-[18px] overflow-y-auto py-[4px] pr-[6px]"
    >
      {sections.map((sec) => (
        <section key={sec.heading} className="flex flex-col gap-[4px]">
          <h3 className="m-0 text-[14px] font-bold leading-[1.45] text-[#0D050A]">
            {sec.heading}
          </h3>
          <p className="m-0 whitespace-pre-line text-[13px] font-normal leading-[1.6] text-[#4A3842]">
            {sec.body}
          </p>
        </section>
      ))}
      <span className="pt-[4px] text-[12px] text-[#6E5464]">
        {`시행일자: ${LEGAL_EFFECTIVE_DATE}`}
      </span>
    </div>
  );
}

function resolveInitialOption(options: string[], initialValue?: string): string {
  if (!initialValue) {
    return options[0];
  }
  if (initialValue === '전체' && options[0] === '전체 (상관없음)') {
    return '전체 (상관없음)';
  }
  if (options.includes(initialValue)) {
    return initialValue;
  }
  return initialValue;
}

function OverlayModalInner({
  overlay,
  defaultEmail,
  onClose,
  onNavigate,
  onShowToast,
  onSubmitReport,
  onSubmitInquiry,
}: {
  overlay: ActiveOverlayState;
  defaultEmail?: string;
  onClose: () => void;
  onNavigate: (page: PageId) => void;
  onShowToast: (toastId: ToastId, customMessage?: string) => void;
  onSubmitReport: (
    reason: string,
    detail: string,
    target?: ActiveOverlayState['reportTarget']
  ) => void;
  onSubmitInquiry: (content: string, overrideEmail?: string) => void;
}) {
  const modalCardRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const allowAnyUniv = overlay.allowAnyUniversity !== false;

  const universityOptionNames = useMemo(() => {
    const names = NATIONWIDE_UNIVERSITIES.map((u) => u.name);
    return allowAnyUniv ? ['전체 (상관없음)', ...names] : names;
  }, [allowAnyUniv]);

  const getInitialSelection = (): string => {
    switch (overlay.id) {
      case 'report':
        return REPORT_REASON_OPTIONS[0];
      case 'privacy-delete':
        return DELETION_SCOPE_OPTIONS[0];
      case 'select-region':
        return resolveInitialOption(REGION_SELECT_OPTIONS, overlay.initialValue);
      case 'select-headcount':
        return resolveInitialOption(HEADCOUNT_SELECT_OPTIONS, overlay.initialValue);
      case 'select-date':
        return resolveInitialOption(DATE_SELECT_OPTIONS, overlay.initialValue);
      case 'select-university': {
        if (!overlay.initialValue) return universityOptionNames[0];
        if (overlay.initialValue === '전체' && allowAnyUniv) {
          return '전체 (상관없음)';
        }
        return universityOptionNames.includes(overlay.initialValue)
          ? overlay.initialValue
          : universityOptionNames[0];
      }
      default:
        return '';
    }
  };

  const [selectedOption, setSelectedOption] = useState<string>(getInitialSelection);
  const [customDateInput, setCustomDateInput] = useState<string>(() => {
    if (
      overlay.id === 'select-date' &&
      overlay.initialValue &&
      !DATE_SELECT_OPTIONS.includes(overlay.initialValue)
    ) {
      return overlay.initialValue;
    }
    return '';
  });
  const [textValue, setTextValue] = useState<string>('');
  const [emailValue, setEmailValue] = useState<string>(defaultEmail ?? '');
  const [formConsented, setFormConsented] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cookieConsent, setCookieConsentState] = useState<CookieConsentLevel | null>(() =>
    getCookieConsent()
  );

  useEffect(() => {
    return subscribeCookieConsent(setCookieConsentState);
  }, []);

  // 키보드 전용 접근성: 모달 오픈 시 내부 첫 요소 포커스, Tab 포커스 트랩(가두기), ESC 닫기 및 이전 포커스 복원
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const focusTimer = window.setTimeout(() => {
      const container = modalCardRef.current;
      if (!container) return;
      const focusables = container.querySelectorAll<HTMLElement>(
        'input:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      focusables[0]?.focus();
    }, 10);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'Tab' && modalCardRef.current) {
        const focusables = Array.from(
          modalCardRef.current.querySelectorAll<HTMLElement>(
            'input:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [onClose]);

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const renderModalCard = () => {
    switch (overlay.id) {
      /* O1 오버레이 - 신청 완료 */
      case 'apply-complete':
        return (
          <div
            ref={modalCardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="overlay-title-apply-complete"
            className="flex w-[440px] max-w-[92vw] flex-col gap-[12px] rounded-[16px] bg-[#FFFFFF] p-[32px] shadow-[0px_12px_32px_0px_rgba(13,5,10,0.18)]"
          >
            <h2
              id="overlay-title-apply-complete"
              className="m-0 text-[22px] font-bold leading-[1.45] text-[#0D050A]"
            >
              신청을 보냈어요
            </h2>
            <p className="m-0 text-[15px] font-normal leading-[1.45] text-[#4A3842]">
              참여 내역은 마이페이지에서 바로 확인할 수 있으며, 언제든 신청을 취소할 수 있어요.
            </p>
            <div className="flex flex-row gap-[8px] self-stretch pt-[12px]">
              <ModalSecondaryButton
                label="마이페이지에서 보기"
                onClick={() => {
                  onClose();
                  onNavigate('mypage');
                }}
              />
              <ModalPrimaryButton label="확인" onClick={onClose} />
            </div>
          </div>
        );

      /* O2 오버레이 - 신고하기 (동의 항목 포함) */
      case 'report':
        return (
          <div
            ref={modalCardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="overlay-title-report"
            className="flex w-[480px] max-w-[92vw] flex-col gap-[12px] rounded-[16px] bg-[#FFFFFF] p-[32px] shadow-[0px_12px_32px_0px_rgba(13,5,10,0.18)]"
          >
            <h2
              id="overlay-title-report"
              className="m-0 text-[22px] font-bold leading-[1.45] text-[#0D050A]"
            >
              신고하기
            </h2>
            <p className="m-0 text-[15px] font-normal leading-[1.45] text-[#4A3842]">
              신고 사유를 골라 주세요. 신고 내용은 운영팀만 볼 수 있어요.
            </p>
            <div className="flex flex-row flex-wrap gap-[8px] self-stretch">
              {REPORT_REASON_OPTIONS.map((reason) => (
                <OverlayChip
                  key={reason}
                  label={reason}
                  selected={selectedOption === reason}
                  onClick={() => setSelectedOption(reason)}
                />
              ))}
            </div>
            <label htmlFor="report-detail-input" className="sr-only">
              신고 상세 사유 입력
            </label>
            <textarea
              id="report-detail-input"
              value={textValue}
              maxLength={500}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder="자세한 내용을 적어 주세요 (선택)"
              className="h-[104px] w-full resize-none self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] p-[14px] text-[14px] font-normal leading-[1.45] text-[#0D050A] placeholder:text-[#6E5464]"
            />
            <label className="flex cursor-pointer flex-row items-start gap-[8px] rounded-[8px] bg-[#FBEBF1] px-[12px] py-[10px] text-[13px] leading-[1.45] text-[#4A3842]">
              <input
                type="checkbox"
                checked={formConsented}
                onChange={(e) => {
                  setFormConsented(e.target.checked);
                  setFormError(null);
                }}
                className="mt-[2px] h-[16px] w-[16px] shrink-0 accent-[#0D050A]"
              />
              <span>
                <strong className="text-[#0D050A]">[필수]</strong> 허위 신고가 아니며, 운영 검토를 위한 신고 내역 수집·처리에 동의합니다.
              </span>
            </label>
            {formError && (
              <span className="text-[13px] font-medium text-[#B42318]">{formError}</span>
            )}
            <div className="flex flex-row gap-[8px] self-stretch pt-[8px]">
              <ModalSecondaryButton label="취소" onClick={onClose} />
              <ModalPrimaryButton
                label="신고하기"
                onClick={() => {
                  if (!formConsented) {
                    setFormError('신고 접수 동의 항목에 체크해 주세요.');
                    return;
                  }
                  onSubmitReport(
                    selectedOption,
                    sanitizePlainText(textValue, 500, true),
                    overlay.reportTarget
                  );
                  onClose();
                  onShowToast('report');
                }}
              />
            </div>
          </div>
        );

      /* S1 선택 - 지역 */
      case 'select-region':
        return (
          <div
            ref={modalCardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="overlay-title-select-region"
            className="flex w-[480px] max-w-[92vw] flex-col gap-[12px] rounded-[16px] bg-[#FFFFFF] p-[32px] shadow-[0px_12px_32px_0px_rgba(13,5,10,0.18)]"
          >
            <h2
              id="overlay-title-select-region"
              className="m-0 text-[22px] font-bold leading-[1.45] text-[#0D050A]"
            >
              지역 선택
            </h2>
            <p className="m-0 text-[15px] font-normal leading-[1.45] text-[#4A3842]">
              미팅할 지역을 골라 주세요.
            </p>
            <div className="flex flex-row flex-wrap gap-[8px] self-stretch">
              {REGION_SELECT_OPTIONS.map((region) => (
                <OverlayChip
                  key={region}
                  label={region}
                  selected={selectedOption === region}
                  onClick={() => setSelectedOption(region)}
                />
              ))}
            </div>
            <div className="flex flex-row gap-[8px] self-stretch pt-[12px]">
              <ModalSecondaryButton label="취소" onClick={onClose} />
              <ModalPrimaryButton
                label="적용"
                onClick={() => {
                  overlay.onApply?.(selectedOption);
                  onClose();
                }}
              />
            </div>
          </div>
        );

      /* S2 선택 - 인원 */
      case 'select-headcount':
        return (
          <div
            ref={modalCardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="overlay-title-select-headcount"
            className="flex w-[480px] max-w-[92vw] flex-col gap-[12px] rounded-[16px] bg-[#FFFFFF] p-[32px] shadow-[0px_12px_32px_0px_rgba(13,5,10,0.18)]"
          >
            <h2
              id="overlay-title-select-headcount"
              className="m-0 text-[22px] font-bold leading-[1.45] text-[#0D050A]"
            >
              인원 선택
            </h2>
            <p className="m-0 text-[15px] font-normal leading-[1.45] text-[#4A3842]">
              한 팀의 인원을 골라 주세요.
            </p>
            <div className="flex flex-row flex-wrap gap-[8px] self-stretch">
              {HEADCOUNT_SELECT_OPTIONS.map((headcount) => (
                <OverlayChip
                  key={headcount}
                  label={headcount}
                  selected={selectedOption === headcount}
                  onClick={() => setSelectedOption(headcount)}
                />
              ))}
            </div>
            <div className="flex flex-row gap-[8px] self-stretch pt-[12px]">
              <ModalSecondaryButton label="취소" onClick={onClose} />
              <ModalPrimaryButton
                label="적용"
                onClick={() => {
                  overlay.onApply?.(selectedOption);
                  onClose();
                }}
              />
            </div>
          </div>
        );

      /* S3 선택 - 날짜 */
      case 'select-date':
        return (
          <div
            ref={modalCardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="overlay-title-select-date"
            className="flex w-[480px] max-w-[92vw] flex-col gap-[12px] rounded-[16px] bg-[#FFFFFF] p-[32px] shadow-[0px_12px_32px_0px_rgba(13,5,10,0.18)]"
          >
            <h2
              id="overlay-title-select-date"
              className="m-0 text-[22px] font-bold leading-[1.45] text-[#0D050A]"
            >
              날짜 선택
            </h2>
            <p className="m-0 text-[15px] font-normal leading-[1.45] text-[#4A3842]">
              미팅 날짜를 고르거나 직접 입력해 주세요.
            </p>
            <div className="flex flex-row flex-wrap gap-[8px] self-stretch">
              {DATE_SELECT_OPTIONS.map((dateItem) => (
                <OverlayChip
                  key={dateItem}
                  label={dateItem}
                  selected={!customDateInput.trim() && selectedOption === dateItem}
                  onClick={() => {
                    setCustomDateInput('');
                    setSelectedOption(dateItem);
                  }}
                />
              ))}
            </div>
            {overlay.allowCustomDate && (
              <div className="flex h-[44px] flex-row items-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] focus-within:ring-2 focus-within:ring-[#0D050A]">
                <label htmlFor="custom-date-input" className="sr-only">
                  미팅 희망 일시 직접 입력
                </label>
                <input
                  id="custom-date-input"
                  type="text"
                  value={customDateInput}
                  onChange={(e) => setCustomDateInput(e.target.value)}
                  placeholder="직접 입력 예) 5월 15일 (금) 저녁 7시"
                  className="w-full border-0 bg-transparent p-0 text-[14px] font-normal text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
                />
              </div>
            )}
            <div className="flex flex-row gap-[8px] self-stretch pt-[12px]">
              <ModalSecondaryButton label="취소" onClick={onClose} />
              <ModalPrimaryButton
                label="적용"
                onClick={() => {
                  const safeCustom = sanitizePlainText(customDateInput, 40);
                  const finalDate = safeCustom || selectedOption;
                  overlay.onApply?.(finalDate);
                  onClose();
                }}
              />
            </div>
          </div>
        );

      /* S4 선택 - 대학 */
      case 'select-university': {
        const trimmedQuery = searchQuery.trim().toLowerCase();
        const filteredUniversities = trimmedQuery
          ? NATIONWIDE_UNIVERSITIES.filter((u) => {
              const hay = `${u.name} ${u.shortName} ${u.region} ${u.address}`.toLowerCase();
              return hay.includes(trimmedQuery);
            }).map((u) => u.name)
          : universityOptionNames;

        return (
          <div
            ref={modalCardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="overlay-title-select-university"
            className="flex w-[480px] max-w-[92vw] flex-col gap-[12px] rounded-[16px] bg-[#FFFFFF] p-[32px] shadow-[0px_12px_32px_0px_rgba(13,5,10,0.18)]"
          >
            <h2
              id="overlay-title-select-university"
              className="m-0 text-[22px] font-bold leading-[1.45] text-[#0D050A]"
            >
              대학 선택
            </h2>
            <p className="m-0 text-[15px] font-normal leading-[1.45] text-[#4A3842]">
              전국 453개 대학교·캠퍼스를 이름이나 지역으로 검색해 주세요.
            </p>
            <div className="flex h-[44px] flex-row items-center gap-[8px] self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] focus-within:ring-2 focus-within:ring-[#0D050A]">
              <ModalSearchIcon />
              <label htmlFor="univ-modal-search" className="sr-only">
                대학교 이름 또는 지역 검색
              </label>
              <input
                id="univ-modal-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="학교 이름 또는 지역 검색 (예: 숭실, 부산, 대전, 가천)"
                className="w-full border-0 bg-transparent p-0 text-[14px] font-normal text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
              />
            </div>
            <div className="flex flex-row items-center justify-between text-[12px] text-[#6E5464]">
              <span>
                {trimmedQuery
                  ? `검색 결과 ${filteredUniversities.length}개교`
                  : `선택됨: ${selectedOption}`}
              </span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-medium text-[#4A3842] underline"
                >
                  검색 초기화
                </button>
              )}
            </div>
            <div className="flex max-h-[260px] flex-row flex-wrap gap-[8px] self-stretch overflow-y-auto pr-[4px]">
              {filteredUniversities.length > 0 ? (
                filteredUniversities.map((university) => (
                  <OverlayChip
                    key={university}
                    label={university}
                    selected={selectedOption === university}
                    onClick={() => setSelectedOption(university)}
                  />
                ))
              ) : (
                <span className="py-[24px] text-[14px] text-[#6E5464]">
                  검색어와 일치하는 대학교가 없어요.
                </span>
              )}
            </div>
            <div className="flex flex-row gap-[8px] self-stretch pt-[12px]">
              <ModalSecondaryButton label="취소" onClick={onClose} />
              <ModalPrimaryButton
                label="적용"
                onClick={() => {
                  overlay.onApply?.(selectedOption);
                  onClose();
                }}
              />
            </div>
          </div>
        );
      }

      /* F1 오버레이 - 이용약관 */
      case 'terms':
        return (
          <div
            ref={modalCardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="overlay-title-terms"
            className="flex w-[600px] max-w-[94vw] flex-col gap-[14px] rounded-[16px] bg-[#FFFFFF] p-[28px] sm:p-[32px] shadow-[0px_12px_32px_0px_rgba(13,5,10,0.18)]"
          >
            <h2
              id="overlay-title-terms"
              className="m-0 text-[22px] font-bold leading-[1.45] text-[#0D050A]"
            >
              서비스 이용약관
            </h2>
            <LegalDocumentSections sections={TERMS_SECTIONS} />
            <div className="flex flex-row gap-[8px] self-stretch pt-[4px]">
              <ModalPrimaryButton label="확인 및 닫기" onClick={onClose} />
            </div>
          </div>
        );

      /* F2 오버레이 - 개인정보처리방침 */
      case 'privacy':
        return (
          <div
            ref={modalCardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="overlay-title-privacy"
            className="flex w-[620px] max-w-[94vw] flex-col gap-[14px] rounded-[16px] bg-[#FFFFFF] p-[28px] sm:p-[32px] shadow-[0px_12px_32px_0px_rgba(13,5,10,0.18)]"
          >
            <h2
              id="overlay-title-privacy"
              className="m-0 text-[22px] font-bold leading-[1.45] text-[#0D050A]"
            >
              개인정보처리방침
            </h2>
            <LegalDocumentSections sections={PRIVACY_SECTIONS} />
            <div className="flex flex-row gap-[8px] self-stretch pt-[4px]">
              <ModalPrimaryButton label="확인 및 닫기" onClick={onClose} />
            </div>
          </div>
        );

      /* F2-B 오버레이 - 쿠키 및 웹 스토리지 정책 */
      case 'cookies':
        return (
          <div
            ref={modalCardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="overlay-title-cookies"
            className="flex w-[580px] max-w-[94vw] flex-col gap-[14px] rounded-[16px] bg-[#FFFFFF] p-[28px] sm:p-[32px] shadow-[0px_12px_32px_0px_rgba(13,5,10,0.18)]"
          >
            <h2
              id="overlay-title-cookies"
              className="m-0 text-[22px] font-bold leading-[1.45] text-[#0D050A]"
            >
              쿠키 및 웹 스토리지 정책
            </h2>
            <LegalDocumentSections sections={COOKIE_SECTIONS} />

            <div className="flex flex-col gap-[8px] pt-[8px]">
              <span className="text-[13px] font-bold text-[#0D050A]">
                {`현재 내 브라우저 설정: ${
                  cookieConsent === 'all'
                    ? '모두 허용 (필수 + 네이버 지도 SDK)'
                    : cookieConsent === 'essential'
                      ? '필수 항목만 허용 (외부 지도 SDK 차단)'
                      : '아직 선택하지 않음'
                }`}
              </span>
              <div className="flex flex-row flex-wrap gap-[8px]">
                <OverlayChip
                  label="필수만 허용"
                  selected={cookieConsent === 'essential'}
                  onClick={() => {
                    setCookieConsent('essential');
                    onShowToast('copy-link', '필수 쿠키·저장소만 허용하도록 저장했어요.');
                  }}
                />
                <OverlayChip
                  label="모두 동의 (네이버 지도 포함)"
                  selected={cookieConsent === 'all'}
                  onClick={() => {
                    setCookieConsent('all');
                    onShowToast('copy-link', '모든 쿠키 및 지도 기능에 동의했어요.');
                  }}
                />
              </div>
            </div>

            <div className="flex flex-row gap-[8px] self-stretch pt-[4px]">
              <ModalPrimaryButton label="확인 및 닫기" onClick={onClose} />
            </div>
          </div>
        );

      /* F2-C 오버레이 - 개인정보 삭제·파기 요청서 */
      case 'privacy-delete':
        return (
          <div
            ref={modalCardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="overlay-title-privacy-delete"
            className="flex w-[500px] max-w-[94vw] flex-col gap-[12px] rounded-[16px] bg-[#FFFFFF] p-[28px] sm:p-[32px] shadow-[0px_12px_32px_0px_rgba(13,5,10,0.18)]"
          >
            <h2
              id="overlay-title-privacy-delete"
              className="m-0 text-[22px] font-bold leading-[1.45] text-[#0D050A]"
            >
              개인정보 삭제·파기 요청
            </h2>
            <p className="m-0 text-[14px] font-normal leading-[1.5] text-[#4A3842]">
              삭제를 원하는 항목을 선택해 접수해 주시면 운영팀이 본인 확인 후 지체 없이 영구 파기하고 안내 메일을 보내드려요.
            </p>

            <div className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-bold text-[#0D050A]">삭제 요청 범위</span>
              <div className="flex flex-row flex-wrap gap-[8px]">
                {DELETION_SCOPE_OPTIONS.map((opt) => (
                  <OverlayChip
                    key={opt}
                    label={opt}
                    selected={selectedOption === opt}
                    onClick={() => setSelectedOption(opt)}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-[6px]">
              <label htmlFor="delete-req-email" className="text-[13px] font-bold text-[#0D050A]">
                가입(또는 문의) 이메일 주소
              </label>
              <div className="flex h-[42px] flex-row items-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[12px] focus-within:ring-2 focus-within:ring-[#0D050A]">
                <input
                  id="delete-req-email"
                  type="email"
                  value={emailValue}
                  onChange={(e) => {
                    setEmailValue(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="본인 확인 및 처리 결과 안내용 이메일"
                  className="w-full border-0 bg-transparent p-0 text-[14px] text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col gap-[6px]">
              <label htmlFor="delete-req-detail" className="text-[13px] font-bold text-[#0D050A]">
                본인 확인 정보 (학교·학번 앞자리 또는 요청 사유)
              </label>
              <textarea
                id="delete-req-detail"
                value={textValue}
                maxLength={500}
                onChange={(e) => {
                  setTextValue(e.target.value);
                  setFormError(null);
                }}
                placeholder="예) 숭실대 26학번 계정 비밀번호 분실로 전체 개인정보 및 재학증명서 파기를 요청합니다."
                className="h-[92px] w-full resize-none rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] p-[12px] text-[14px] text-[#0D050A] placeholder:text-[#6E5464]"
              />
            </div>

            <label className="flex cursor-pointer flex-row items-start gap-[8px] rounded-[8px] bg-[#FBEBF1] px-[12px] py-[10px] text-[13px] leading-[1.45] text-[#4A3842]">
              <input
                type="checkbox"
                checked={formConsented}
                onChange={(e) => {
                  setFormConsented(e.target.checked);
                  setFormError(null);
                }}
                className="mt-[2px] h-[16px] w-[16px] shrink-0 accent-[#0D050A]"
              />
              <span>
                <strong className="text-[#0D050A]">[필수]</strong> 본인 명의 데이터에 대한 파기 요청이며, 삭제 완료 안내 메일 발송을 위한 이메일 수집에 동의합니다.
              </span>
            </label>

            {formError && (
              <span className="text-[13px] font-medium text-[#B42318]">{formError}</span>
            )}

            <div className="flex flex-row gap-[8px] self-stretch pt-[4px]">
              <ModalSecondaryButton label="취소" onClick={onClose} />
              <ModalPrimaryButton
                label="삭제 요청 접수"
                onClick={() => {
                  if (!isSafeEmailAddress(emailValue)) {
                    setFormError('올바른 이메일 주소를 입력해 주세요.');
                    return;
                  }
                  const safeNote = sanitizePlainText(textValue, 500, true);
                  if (safeNote.length < 2) {
                    setFormError('본인 확인 내용 또는 요청 사유를 적어 주세요.');
                    return;
                  }
                  if (!formConsented) {
                    setFormError('필수 동의 항목에 체크해 주세요.');
                    return;
                  }
                  onSubmitInquiry(
                    `[개인정보 삭제 요청 | ${selectedOption}] ${safeNote}`,
                    emailValue.trim()
                  );
                  onClose();
                  onShowToast(
                    'inquiry-sent',
                    '개인정보 삭제 요청이 접수되었어요. 확인 후 지체 없이 파기하고 메일로 안내해 드릴게요.'
                  );
                }}
              />
            </div>
          </div>
        );

      /* F3 오버레이 - 문의하기 (개인정보 수집 동의 포함) */
      case 'inquiry':
        return (
          <div
            ref={modalCardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="overlay-title-inquiry"
            className="flex w-[460px] max-w-[92vw] flex-col gap-[12px] rounded-[16px] bg-[#FFFFFF] p-[32px] shadow-[0px_12px_32px_0px_rgba(13,5,10,0.18)]"
          >
            <h2
              id="overlay-title-inquiry"
              className="m-0 text-[22px] font-bold leading-[1.45] text-[#0D050A]"
            >
              문의하기
            </h2>
            <p className="m-0 text-[15px] font-normal leading-[1.45] text-[#4A3842]">
              궁금한 점이나 불편한 점을 남겨 주세요. 영업일 기준 2일 안에 메일로 답변드려요.
            </p>
            <div className="flex h-[42px] flex-row items-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[12px] focus-within:ring-2 focus-within:ring-[#0D050A]">
              <label htmlFor="inquiry-email-input" className="sr-only">
                답변 받을 이메일 주소
              </label>
              <input
                id="inquiry-email-input"
                type="email"
                value={emailValue}
                onChange={(e) => {
                  setEmailValue(e.target.value);
                  setFormError(null);
                }}
                placeholder="답변 받을 이메일 주소 입력"
                className="w-full border-0 bg-transparent p-0 text-[14px] text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
              />
            </div>
            <label htmlFor="inquiry-content-input" className="sr-only">
              문의 내용 입력
            </label>
            <textarea
              id="inquiry-content-input"
              value={textValue}
              maxLength={1000}
              onChange={(e) => {
                setTextValue(e.target.value);
                setFormError(null);
              }}
              placeholder="문의 내용을 적어 주세요"
              className="h-[112px] w-full resize-none self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] p-[14px] text-[14px] font-normal leading-[1.45] text-[#0D050A] placeholder:text-[#6E5464]"
            />
            <label className="flex cursor-pointer flex-row items-start gap-[8px] rounded-[8px] bg-[#FBEBF1] px-[12px] py-[10px] text-[13px] leading-[1.45] text-[#4A3842]">
              <input
                type="checkbox"
                checked={formConsented}
                onChange={(e) => {
                  setFormConsented(e.target.checked);
                  setFormError(null);
                }}
                className="mt-[2px] h-[16px] w-[16px] shrink-0 accent-[#0D050A]"
              />
              <span>
                <strong className="text-[#0D050A]">[필수]</strong> 문의 응대 및 회신을 위한 이메일·문의 내용 수집·이용에 동의합니다.
              </span>
            </label>
            {formError && (
              <span className="text-[13px] font-medium text-[#B42318]">{formError}</span>
            )}
            <div className="flex flex-row gap-[8px] self-stretch pt-[8px]">
              <ModalSecondaryButton label="취소" onClick={onClose} />
              <ModalPrimaryButton
                label="보내기"
                onClick={() => {
                  if (!isSafeEmailAddress(emailValue)) {
                    setFormError('답변을 받을 올바른 이메일 주소를 입력해 주세요.');
                    return;
                  }
                  const safeInquiry = sanitizePlainText(textValue, 1000, true);
                  if (safeInquiry.length < 2) {
                    setFormError('문의 내용을 2자 이상 입력해 주세요.');
                    return;
                  }
                  if (!formConsented) {
                    setFormError('개인정보 수집·이용 동의 항목에 체크해 주세요.');
                    return;
                  }
                  onSubmitInquiry(safeInquiry, emailValue.trim());
                  onClose();
                  onShowToast('inquiry-sent');
                }}
              />
            </div>
          </div>
        );
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[rgba(13,5,10,0.55)] p-[16px]"
    >
      {renderModalCard()}
    </div>
  );
}

export function OverlayModal({
  overlay,
  defaultEmail,
  onClose,
  onNavigate,
  onShowToast,
  onSubmitReport,
  onSubmitInquiry,
}: {
  overlay: ActiveOverlayState | null;
  defaultEmail?: string;
  onClose: () => void;
  onNavigate: (page: PageId) => void;
  onShowToast: (toastId: ToastId, customMessage?: string) => void;
  onSubmitReport: (
    reason: string,
    detail: string,
    target?: ActiveOverlayState['reportTarget']
  ) => void;
  onSubmitInquiry: (content: string, overrideEmail?: string) => void;
}) {
  if (!overlay) {
    return null;
  }

  return (
    <OverlayModalInner
      key={`${overlay.id}-${overlay.initialValue ?? ''}`}
      overlay={overlay}
      defaultEmail={defaultEmail}
      onClose={onClose}
      onNavigate={onNavigate}
      onShowToast={onShowToast}
      onSubmitReport={onSubmitReport}
      onSubmitInquiry={onSubmitInquiry}
    />
  );
}
