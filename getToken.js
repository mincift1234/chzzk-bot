// getToken.js - 최종 버전 (redirectUri 포함)
import 'dotenv/config';

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

// 방금 새로 받은 code 값 붙여 넣기
const CODE = "cKAAEKwZodfXsrQKnyJibjdRJCc";
const STATE = "abc123";
const REDIRECT_URI = "http://localhost:8080/callback";

async function run() {
  try {
    console.log("CLIENT_ID:", CLIENT_ID);
    console.log("CLIENT_SECRET:", CLIENT_SECRET ? "(설정됨)" : "!! 없음");
    console.log("CODE 길이:", CODE.length);
    console.log("REDIRECT_URI:", REDIRECT_URI);

    const res = await fetch("https://openapi.chzzk.naver.com/auth/v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0"
      },
      body: JSON.stringify({
        grantType: "authorization_code",
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        code: CODE,
        state: STATE,
        redirectUri: REDIRECT_URI
      })
    });

    console.log("HTTP status:", res.status);
    const data = await res.json();
    console.log("응답 JSON:", data);

    if (res.ok && data.accessToken) {
      console.log("✅ accessToken:", data.accessToken);
      console.log("✅ refreshToken:", data.refreshToken);
      console.log("⏱ expiresIn:", data.expiresIn);
    } else {
      console.error("❌ 토큰 발급 실패");
    }
  } catch (err) {
    console.error("❌ 요청 중 오류:", err);
  }
}

run();
