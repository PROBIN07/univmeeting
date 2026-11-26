import React, { useEffect, useMemo, useState } from 'react';
import { NATIONWIDE_UNIVERSITIES } from '../data/universities';
import type { ActiveOverlayState, PageId, ToastId } from '../types/meeting';

export const REPORT_REASON_OPTIONS: string[] = [
  '부적절한 내용',
  '허위 정보',
  '광고·스팸',
  '기타',
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
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 cursor-pointer flex-row items-center justify-center rounded-[8px] border-0 bg-[#0D050A] px-[20px] py-[12px]"
    >
      <span className="text-[15px] font-medium text-[#FFFFFF]">{label}</span>
    </button>
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
  onClose,
  onNavigate,
  onShowToast,
  onSubmitReport,
  onSubmitInquiry,
}: {
  overlay: ActiveOverlayState;
  onClose: () => void;
  onNavigate: (page: PageId) => void;
  onShowToast: (toastId: ToastId) => void;
  onSubmitReport: (
    reason: string,
    detail: string,
    target?: ActiveOverlayState['reportTarget']
  ) => void;
  onSubmitInquiry: (content: string) => void;
}) {
  const allowAnyUniv = overlay.allowAnyUniversity !== false;

  const universityOptionNames = useMemo(() => {
    const names = NATIONWIDE_UNIVERSITIES.map((u) => u.name);
    return allowAnyUniv ? ['전체 (상관없음)', ...names] : names;
  }, [allowAnyUniv]);

  const getInitialSelection = (): string => {
    switch (overlay.id) {
      case 'report':
        return REPORT_REASON_OPTIONS[0];
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
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
            <div className="flex flex-row gap-[8px] self-stretch px-[0px] pb-[0px] pt-[12px]">
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

      /* O2 오버레이 - 신고하기 */
      case 'report':
        return (
          <div
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
            <textarea
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder="자세한 내용을 적어 주세요 (선택)"
              className="h-[112px] w-full resize-none self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] p-[14px] font-['Noto_Sans_KR',sans-serif] text-[14px] font-normal leading-[1.45] text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
            />
            <div className="flex flex-row gap-[8px] self-stretch px-[0px] pb-[0px] pt-[12px]">
              <ModalSecondaryButton label="취소" onClick={onClose} />
              <ModalPrimaryButton
                label="신고하기"
                onClick={() => {
                  onSubmitReport(selectedOption, textValue, overlay.reportTarget);
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
            <div className="flex flex-row gap-[8px] self-stretch px-[0px] pb-[0px] pt-[12px]">
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
            <div className="flex flex-row gap-[8px] self-stretch px-[0px] pb-[0px] pt-[12px]">
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
              <div className="flex h-[44px] flex-row items-center rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px]">
                <input
                  type="text"
                  value={customDateInput}
                  onChange={(e) => setCustomDateInput(e.target.value)}
                  placeholder="직접 입력 예) 5월 15일 (금) 저녁 7시"
                  className="w-full border-0 bg-transparent p-0 font-['Noto_Sans_KR',sans-serif] text-[14px] font-normal text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
                />
              </div>
            )}
            <div className="flex flex-row gap-[8px] self-stretch px-[0px] pb-[0px] pt-[12px]">
              <ModalSecondaryButton label="취소" onClick={onClose} />
              <ModalPrimaryButton
                label="적용"
                onClick={() => {
                  const finalDate = customDateInput.trim() || selectedOption;
                  overlay.onApply?.(finalDate);
                  onClose();
                }}
              />
            </div>
          </div>
        );

      /* S4 선택 - 대학 (전국 453개 대학교/캠퍼스 검색 지원) */
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
            <div className="flex h-[44px] flex-row items-center gap-[8px] self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] px-[14px] py-[0px]">
              <ModalSearchIcon />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="학교 이름 또는 지역 검색 (예: 숭실, 부산, 대전, 가천)"
                className="w-full border-0 bg-transparent p-0 font-['Noto_Sans_KR',sans-serif] text-[14px] font-normal text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
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
            <div className="flex flex-row gap-[8px] self-stretch px-[0px] pb-[0px] pt-[12px]">
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="overlay-title-terms"
            className="flex w-[440px] max-w-[92vw] flex-col gap-[12px] rounded-[16px] bg-[#FFFFFF] p-[32px] shadow-[0px_12px_32px_0px_rgba(13,5,10,0.18)]"
          >
            <h2
              id="overlay-title-terms"
              className="m-0 text-[22px] font-bold leading-[1.45] text-[#0D050A]"
            >
              이용약관
            </h2>
            <p className="m-0 text-[15px] font-normal leading-[1.45] text-[#4A3842]">
              대학미팅은 학번 및 재학증명서 심사를 통해 재학생 인증 승인을 마친 회원에게 방 생성 및 미팅 참여 기능을 제공합니다. 타인의 명의를 도용하거나 허위 증명서 제출, 불건전한 언행, 영리·광고 목적의 활동이 확인될 경우 사전 통보 없이 서비스 이용이 영구 제한될 수 있습니다.
            </p>
            <div className="flex flex-row gap-[8px] self-stretch px-[0px] pb-[0px] pt-[12px]">
              <ModalPrimaryButton label="닫기" onClick={onClose} />
            </div>
          </div>
        );

      /* F2 오버레이 - 개인정보처리방침 */
      case 'privacy':
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="overlay-title-privacy"
            className="flex w-[440px] max-w-[92vw] flex-col gap-[12px] rounded-[16px] bg-[#FFFFFF] p-[32px] shadow-[0px_12px_32px_0px_rgba(13,5,10,0.18)]"
          >
            <h2
              id="overlay-title-privacy"
              className="m-0 text-[22px] font-bold leading-[1.45] text-[#0D050A]"
            >
              개인정보처리방침
            </h2>
            <p className="m-0 text-[15px] font-normal leading-[1.45] text-[#4A3842]">
              수집 항목은 이메일, 이름(닉네임), 성별, 소속 대학·학과, 학번 및 재학증명서이며 회원 식별과 재학 여부 심사 목적으로만 이용됩니다. 다른 회원에게는 학교·학과·입학연도(예: 26학번)만 표시되며 전체 학번과 증명서 원본은 운영팀 외 누구에게도 공개되지 않습니다.
            </p>
            <div className="flex flex-row gap-[8px] self-stretch px-[0px] pb-[0px] pt-[12px]">
              <ModalPrimaryButton label="닫기" onClick={onClose} />
            </div>
          </div>
        );

      /* F3 오버레이 - 문의하기 */
      case 'inquiry':
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="overlay-title-inquiry"
            className="flex w-[440px] max-w-[92vw] flex-col gap-[12px] rounded-[16px] bg-[#FFFFFF] p-[32px] shadow-[0px_12px_32px_0px_rgba(13,5,10,0.18)]"
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
            <textarea
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder="문의 내용을 적어 주세요"
              className="h-[120px] w-full resize-none self-stretch rounded-[8px] border border-[#D8B4C4] bg-[#FFFFFF] p-[14px] font-['Noto_Sans_KR',sans-serif] text-[14px] font-normal leading-[1.45] text-[#0D050A] placeholder:text-[#6E5464] focus:outline-none"
            />
            <div className="flex flex-row gap-[8px] self-stretch px-[0px] pb-[0px] pt-[12px]">
              <ModalSecondaryButton label="취소" onClick={onClose} />
              <ModalPrimaryButton
                label="보내기"
                onClick={() => {
                  if (!textValue.trim()) {
                    onClose();
                    return;
                  }
                  onSubmitInquiry(textValue.trim());
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
      className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[rgba(13,5,10,0.5)] p-[16px] font-['Noto_Sans_KR',sans-serif]"
    >
      {renderModalCard()}
    </div>
  );
}

export function OverlayModal({
  overlay,
  onClose,
  onNavigate,
  onShowToast,
  onSubmitReport,
  onSubmitInquiry,
}: {
  overlay: ActiveOverlayState | null;
  onClose: () => void;
  onNavigate: (page: PageId) => void;
  onShowToast: (toastId: ToastId) => void;
  onSubmitReport: (
    reason: string,
    detail: string,
    target?: ActiveOverlayState['reportTarget']
  ) => void;
  onSubmitInquiry: (content: string) => void;
}) {
  if (!overlay) {
    return null;
  }

  return (
    <OverlayModalInner
      key={`${overlay.id}-${overlay.initialValue ?? ''}`}
      overlay={overlay}
      onClose={onClose}
      onNavigate={onNavigate}
      onShowToast={onShowToast}
      onSubmitReport={onSubmitReport}
      onSubmitInquiry={onSubmitInquiry}
    />
  );
}
