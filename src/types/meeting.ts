export type GenderType = '남' | '여';

export type RoomFormat = '2:2' | '3:3' | '4:4';

export type RoomStatus = '모집 중' | '성사 완료';

export type BoardTabType = 'meeting' | 'teammate';

export type PostStatus = '모집 중' | '마감';

export type VerificationStatus = 'unverified' | 'pending' | 'approved' | 'rejected';

export type SidoGroup =
  | '서울'
  | '경기·인천'
  | '강원'
  | '충청·대전·세종'
  | '경상·부산·대구·울산'
  | '전라·광주'
  | '제주';

export type ToastId =
  | 'copy-link'
  | 'auth-mail'
  | 'report'
  | 'other-univ-slot'
  | 'max-zoom'
  | 'min-zoom'
  | 'inquiry-sent'
  | 'last-page';

export type OverlayId =
  | 'apply-complete'
  | 'report'
  | 'select-region'
  | 'select-headcount'
  | 'select-date'
  | 'select-university'
  | 'terms'
  | 'privacy'
  | 'cookies'
  | 'privacy-delete'
  | 'inquiry';

export interface ActiveOverlayState {
  id: OverlayId;
  initialValue?: string;
  allowAnyUniversity?: boolean;
  allowCustomDate?: boolean;
  onApply?: (selectedValue: string) => void;
  reportTarget?: {
    targetType: 'room' | 'post' | 'general';
    targetId?: string;
  };
}

export type PageId =
  | 'home'
  | 'login'
  | 'signup'
  | 'rooms'
  | 'room-detail'
  | 'room-create'
  | 'map'
  | 'board'
  | 'board-write'
  | 'board-detail'
  | 'school-auth'
  | 'mypage'
  | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  university: string;
  department: string;
  studentId: string;
  studentYear: string;
  gender: GenderType;
  verified: boolean;
  verificationStatus: VerificationStatus;
  rejectionReason?: string;
  isAdmin?: boolean;
  createdAt: number;
}

export interface VerificationRequest {
  id: string;
  uid: string;
  userName: string;
  userEmail: string;
  gender: GenderType;
  university: string;
  department: string;
  studentId: string;
  studentYear: string;
  certificateFileName: string;
  certificateMimeType: string;
  certificateDataUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  submittedAt: number;
  reviewedAt?: number;
}

export interface StepItem {
  id: string;
  step: string;
  title: string;
  description: string;
}

export interface UniversitySlot {
  name: string;
  shortName: string;
  gender: GenderType;
}

export interface TeamMemberItem {
  id: string;
  uid: string;
  departmentAndYear: string;
  role: '방장' | '팀원';
  gender: GenderType;
}

export interface MeetingRoom {
  id: string;
  title: string;
  format: RoomFormat;
  status: RoomStatus;
  leftUniversity: UniversitySlot;
  rightUniversity: UniversitySlot;
  schedule: string;
  location: string;
  intro: string;
  hostUid: string;
  hostDepartment: string;
  leftMembers: TeamMemberItem[];
  rightMembers: TeamMemberItem[];
  createdAt: number;
}

export interface BoardPostApplicant {
  uid: string;
  university: string;
  department: string;
  appliedAt: number;
}

export interface BoardPost {
  id: string;
  tab: BoardTabType;
  status: PostStatus;
  gender: GenderType;
  title: string;
  university: string;
  department: string;
  format: RoomFormat;
  date: string;
  location: string;
  targetUniversity: string;
  content: string;
  authorUid: string;
  applicants: BoardPostApplicant[];
  createdAt: number;
}

export interface UniversityGeoItem {
  id: string;
  name: string;
  shortName: string;
  sidoGroup: SidoGroup;
  region: string;
  address: string;
  lat: number;
  lng: number;
  canvasX: number;
  canvasY: number;
}

export interface PaginationItem {
  id: string;
  label: string;
  variant: 'active' | 'default-medium' | 'default-regular' | 'black';
}

export interface ReportRecord {
  id?: string;
  targetType: 'room' | 'post' | 'general';
  targetId?: string;
  reason: string;
  detail: string;
  reporterUid: string;
  createdAt: number;
}

export interface InquiryRecord {
  id?: string;
  content: string;
  userUid: string;
  email: string;
  createdAt: number;
}
