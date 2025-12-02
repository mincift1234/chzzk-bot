// index.js - 치지직 봇 메인 코드

import 'dotenv/config';
import buzzkModule from 'buzzk';
import admin from 'firebase-admin';
import fs from 'fs';

// 1. buzzk / Firebase 준비
const buzzk = buzzkModule;
const BuzzkChat = buzzk.chat;

// 1-1. Firebase Admin 초기화
// Render 같은 서버에서는 환경변수(FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)를 쓰고,
// 로컬 개발 환경에서는 serviceAccountKey.json 파일을 사용하는 방식으로 둘 다 지원.
let firebaseApp;

if (
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_PRIVATE_KEY
) {
  // ENV 기반 초기화 (Render 등)
  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert({
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      // 환경변수에 들어간 \n 문자열을 실제 줄바꿈으로 변환
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
  console.log('✅ Firebase initialized with ENV variables');
} else {
  // 로컬에서 serviceAccountKey.json 파일 사용하는 fallback
  const serviceAccount = JSON.parse(
    fs.readFileSync('./serviceAccountKey.json', 'utf8')
  );

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log('✅ Firebase initialized with serviceAccountKey.json');
}

const db = admin.firestore();

// 2. CHZZK 클라이언트 인증 (CLIENT_ID / SECRET)
buzzk.auth(process.env.CLIENT_ID, process.env.CLIENT_SECRET);

// 3. 내 uid (commands/{uid}에서 명령어 읽음)
const ownerUid = process.env.COMMAND_OWNER_UID;
const refreshToken = process.env.REFRESH_TOKEN;

if (!ownerUid) {
  console.error('❌ COMMAND_OWNER_UID가 .env 또는 환경변수에 설정되어 있지 않습니다.');
  process.exit(1);
}

let commandMap = {}; // 메모리에 캐시해둘 명령어들

// Firestore에서 명령어 로드
async function loadCommands() {
  try {
    const docRef = db.collection('commands').doc(ownerUid);
    const snap = await docRef.get();
    const data = snap.data() || {};
    commandMap = data.commands || {};
    console.log('🔁 명령어 로드 완료:', commandMap);
  } catch (err) {
    console.error('❌ 명령어 로드 오류:', err);
  }
}

async function startBot() {
  try {
    // 1) 명령어 먼저 한 번 로드
    await loadCommands();

    // 2) 30초마다 명령어 다시 로드 (관리자 사이트에서 수정해도 반영되게)
    setInterval(loadCommands, 30000);

    // 3) refreshToken으로 accessToken 발급
    const oauth = await buzzk.oauth.refresh(refreshToken);
    if (!oauth || !oauth.access) {
      console.error('❌ refreshToken으로 accessToken 발급 실패:', oauth);
      return;
    }

    const accessToken = oauth.access;

    // 4) 채팅 연결
    const chat = new BuzzkChat(accessToken);
    await chat.connect();

    console.log('✅ 치지직 봇 채팅 연결 완료');

    // 5) 채팅 이벤트 처리
    chat.onMessage(async (data) => {
      const msg = (data.message || '').trim();
      const nick = data.author?.name || '알수없음';

      console.log(`${nick}: ${msg}`);

      // 5-1) Firestore에서 가져온 명령어 exact match
      if (commandMap[msg]) {
        await chat.send(commandMap[msg]);
        return;
      }

      // 5-2) 예시: !픽 제트 → 파라미터 있는 커맨드
      if (msg.startsWith('!픽 ')) {
        const agent = msg.split(' ')[1] || '레이나';
        await chat.send(`${nick}님, 오늘 픽은 ${agent} 추천!`);
      }
    });

    // 6) 끊어지면 재연결
    chat.onDisconnect(() => {
      console.log('⚠️ 채팅 연결 끊김, 5초 후 재연결 시도');
      setTimeout(startBot, 5000);
    });
  } catch (err) {
    console.error('❌ 봇 시작 중 에러:', err);
    console.log('5초 후 재시도');
    setTimeout(startBot, 5000);
  }
}

// 7. 봇 실행
startBot();
