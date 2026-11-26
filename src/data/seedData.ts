import type { RoomFormat } from '../types/meeting';
import { NATIONWIDE_UNIVERSITIES, NATIONWIDE_UNIVERSITY_NAMES } from './universities';

export { NATIONWIDE_UNIVERSITIES as UNIVERSITIES_GEO, NATIONWIDE_UNIVERSITY_NAMES };

const SHORT_NAME_MAP = new Map<string, string>(
  NATIONWIDE_UNIVERSITIES.map((u) => [u.name, u.shortName])
);

export function getShortUniversityName(fullName: string): string {
  const mapped = SHORT_NAME_MAP.get(fullName);
  if (mapped) return mapped;
  const cleaned = fullName.replace(/^국립/, '');
  if (cleaned.endsWith('대학교')) {
    return `${cleaned.slice(0, -3)}대`;
  }
  return cleaned;
}

export function getMaxMembersPerTeam(format: RoomFormat): number {
  if (format === '2:2') return 2;
  if (format === '3:3') return 3;
  return 4;
}

export function computeRoomStatus(
  format: RoomFormat,
  leftCount: number,
  rightCount: number
): '모집 중' | '성사 완료' {
  const max = getMaxMembersPerTeam(format);
  return leftCount >= max && rightCount >= max ? '성사 완료' : '모집 중';
}

export function formatRelativeTime(createdAt: number): string {
  const diffMs = Math.max(0, Date.now() - createdAt);
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return '어제';
  return `${diffDay}일 전`;
}

export function deriveStudentYearLabel(studentId: string): string {
  const digits = studentId.replace(/\D/g, '');
  if (digits.length >= 4 && (digits.startsWith('20') || digits.startsWith('19'))) {
    return `${digits.slice(2, 4)}학번`;
  }
  if (digits.length >= 2) {
    return `${digits.slice(0, 2)}학번`;
  }
  return '재학생';
}
