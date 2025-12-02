// index.js - 멀티 유저 치지직 봇 (미니 빵떡 V1)

import 'dotenv/config';
import buzzkModule from 'buzzk';
import admin from 'firebase-admin';

// 1. buzzk 준비
const buzzk = buzzkModule;
const BuzzkChat = buzzk.chat;

// 2. Firebase Admin 초기화 (ENV 방식)
admin.initializeApp({
  credential: admin.credential.cert({
    project_id: process.env.FIREBASE_PROJECT_ID,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = admin.firestore();

// 3. CHZZK 클라이언트 인증
buzzk.auth(process.env.CLIENT_ID, process.env.CLIENT_SECRET);

// 🔹 여러 유저에 대한 봇 인스턴스를 관리하는 맵
// uid -> { chat, commands }
const bots = new Map();

// 유저 1명에 대한 명령어 로드
async function loadCommandsForUser(uid) {
  const docRef = db.collection('commands').doc(uid);
  const snap = await docRef.get();
  const data = snap.data() || {};
  const commands = data.commands || {};
  return commands;
}

// 유저 1명에 대한 봇 생성 & 연결
async function startBotForUser(userDoc) {
  const uid = userDoc.id;
  const data = userDoc.data();

  const refreshToken = data.chzzkRefreshToken;
  const botEnabled = data.botEnabled;

  if (!botEnabled) {
    console.log(`⏸ [${uid}] botEnabled=false, 스킵`);
    return;
  }

  if (!refreshToken) {
    console.log(`⚠️ [${uid}] chzzkRefreshToken 없음, 스킵`);
    return;
  }

  try {
    console.log(`🔑 [${uid}] refreshToken으로 accessToken 발급 시도`);
    const oauth = await buzzk.oauth.refresh(refreshToken);

    if (!oauth || !oauth.access) {
      console.error(`❌ [${uid}] accessToken 발급 실패:`, oauth);
      return;
    }

    const accessToken = oauth.access;

    // 이미 돌아가는 봇이 있으면 먼저 정리
    if (bots.has(uid)) {
      try {
        const old = bots.get(uid);
        if (old.chat) {
          old.chat.disconnect?.();
        }
      } catch (e) {
        console.error(`⚠️ [${uid}] 기존 봇 정리 중 에러:`, e);
      }
      bots.delete(uid);
    }

    const chat = new BuzzkChat(accessToken);
    await chat.connect();

    console.log(`✅ [${uid}] 치지직 봇 채팅 연결 완료`);

    // 명령어 로드
    let commands = await loadCommandsForUser(uid);
    console.log(`🔁 [${uid}] 명령어 로드:`, commands);

    // bots 맵에 저장
    bots.set(uid, { chat, commands });

    // 30초마다 이 유저 명령어 갱신
    setInterval(async () => {
      try {
        const updated = await loadCommandsForUser(uid);
        const info = bots.get(uid);
        if (info) {
          info.commands = updated;
          console.log(`🔁 [${uid}] 명령어 갱신:`, updated);
        }
      } catch (err) {
        console.error(`❌ [${uid}] 명령어 갱신 중 에러:`, err);
      }
    }, 30000);

    // 채팅 처리
    chat.onMessage(async (msgData) => {
      const msg = (msgData.message || '').trim();
      const nick = msgData.author?.name || '알수없음';

      const info = bots.get(uid);
      const cmdMap = info?.commands || {};

      console.log(`[${uid}] ${nick}: ${msg}`);

      // 유저별 커맨드 매칭
      if (cmdMap[msg]) {
        await chat.send(cmdMap[msg]);
        return;
      }

      // 예: 공통 샘플 커맨드
      if (msg.startsWith('!픽 ')) {
        const agent = msg.split(' ')[1] || '레이나';
        await chat.send(`${nick}님, 오늘 픽은 ${agent} 추천!`);
      }
    });

    chat.onDisconnect(() => {
      console.log(`⚠️ [${uid}] 채팅 연결 끊김, 5초 후 재연결 시도`);
      setTimeout(() => startBotForUser(userDoc), 5000);
    });
  } catch (err) {
    console.error(`❌ [${uid}] 봇 시작 중 에러:`, err);
  }
}

// 전체 유저에 대해 봇 시작 / 재시작
async function startAllBots() {
  console.log('🌐 전체 유저 봇 시작/갱신');

  const snap = await db
    .collection('users')
    .where('botEnabled', '==', true)
    .get();

  if (snap.empty) {
    console.log('ℹ️ botEnabled=true 유저가 없음');
    return;
  }

  for (const userDoc of snap.docs) {
    await startBotForUser(userDoc);
  }
}

async function main() {
  try {
    await startAllBots();

    // 1분마다 botEnabled=true 유저 목록을 다시 보고
    // 새로 켜진 유저가 있으면 봇 추가
    setInterval(startAllBots, 60000);
  } catch (err) {
    console.error('❌ 메인 루프 에러:', err);
  }
}

main();
