# 대학미팅 (Univ Meeting)

전국 453개 대학교·캠퍼스 재학생이 **학번 및 재학증명서 인증**을 거쳐 주선자 없이 안전하게 미팅 방을 만들고 참여하는 웹 애플리케이션입니다.

## 주요 기능
- **Firebase Authentication**: 이메일·비밀번호 회원가입, 로그인, 로그아웃
- **재학증명서 기반 학교 인증**: 학번 입력 + 재학증명서(이미지 자동 압축 / PDF) 업로드 및 운영팀 실시간 승인·반려
- **인증 기반 권한 제어**: 운영팀 승인 완료(`approved`) 회원만 미팅 방 생성·참여 및 모집글 작성·신청 가능
- **미팅 방 주선**: 전국 453개 대학 상대 지정, `2:2` / `3:3` / `4:4` 인원 매칭, 정원 충족 시 자동 성사 전환, 방장/관리자 방 삭제
- **전국 453개 대학 지도 (Naver Maps API v3)**: 권역별 필터, 실시간 모집 방 수 마커 표시, 대학별 방 모아보기
- **게시판**: `미팅 모집` / `팀원 구인` 글 작성, 팀 신청·취소, 작성자 모집 마감/재오픈 및 삭제
- **공유 딥링크**: 방·게시글 고유 링크(`?page=room-detail&room=...`) 복사 및 접속 즉시 해당 상세 페이지 진입
- **운영팀 전용 관리자 포털 (계정 완전 분리)**: 관리자 계정(`VITE_ADMIN_EMAIL`)으로 로그인하면 학생 서비스 화면과 완전히 분리된 관리자 전용 포털로 진입하여 재학증명서 심사, 전체 회원 인증 관리, 미팅 방·게시글 관리, 신고 및 1:1 문의를 처리합니다.

## 로컬 실행 방법
1. `.env.example`을 참고해 `.env.local`에 Firebase Web SDK 키, Naver Map Client ID, 관리자 계정 이메일·비밀번호(`VITE_ADMIN_EMAIL`, `VITE_ADMIN_PASSWORD`)를 설정합니다.
2. 패키지 설치 및 실행:
   ```bash
   npm install
   npm run dev
   ```

## 실제 출시(배포) 체크리스트
1. **Firebase Console (`Authentication`)**
   - `Sign-in method`에서 **이메일/비밀번호** 활성화
   - `Settings > Authorized domains`에 실제 배포 도메인 추가
2. **Firebase Console (`Firestore Database`)**
   - 데이터베이스 생성 후 `firestore.rules` 규칙 배포 (`npx firebase deploy --only firestore:rules`)
3. **Naver Cloud Platform (`Maps`)**
   - Application의 **Web 서비스 URL**에 실제 서비스 도메인(예: `https://meeting-3457.web.app` 또는 커스텀 도메인) 등록
4. **프로덕션 빌드 및 배포**
   ```bash
   npm run build
   npx firebase deploy --only hosting
   ```
   (Vercel 배포 시 `vercel.json` SPA 리라이트 설정이 자동 적용됩니다.)
