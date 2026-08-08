import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const tg = window.Telegram?.WebApp;

if (!tg || !tg.initDataUnsafe?.user) {
  location.href = "index.html";
  throw new Error("Telegram Required");
}

tg.ready();
tg.expand();
tg.setHeaderColor("#0B1220");
tg.setBackgroundColor("#0B1220");

const user = tg.initDataUnsafe.user;
const BOT_USERNAME = "DoshMinuteJobBot";

async function loadRefer() {
  const snap = await getDoc(doc(db, "users", String(user.id)));
  if (!snap.exists()) {
    location.href = "index.html";
    return;
  }

  const data = snap.data();

  if (data.isBanned) {
    document.getElementById("app").innerHTML = `
      <div class="loader-box">
        <div class="logo-circle">🚫</div>
        <h1>অ্যাকাউন্ট ব্যান</h1>
      </div>
    `;
    return;
  }

  // সঠিক রেফার লিংক
  const referralLink = "https://t.me/" + BOT_USERNAME + "?startapp=" + user.id;

  // রেফার লিস্ট
  const q = query(
    collection(db, "referral_history"),
    where("referrerId", "==", String(user.id))
  );
  const refSnap = await getDocs(q);

  let pending = 0;
  let active = 0;
  let listHtml = "";

  refSnap.forEach(d => {
    const r = d.data();
    if (r.status === "active") active++;
    else pending++;

    listHtml += `
      <div class="card" style="margin-bottom:10px;padding:12px;">
        <div style="font-size:13px;">
          ইউজার ID: ${r.newUserId}<br>
          স্ট্যাটাস: <b>${r.status === "active" ? "✅ Active" : "⏳ Pending"}</b>
        </div>
      </div>
    `;
  });

  document.getElementById("app").innerHTML = `
    <div class="page">
      <div class="hero" style="padding:16px;">
        <div style="font-size:20px;font-weight:800;margin-bottom:4px;">👥 রেফার প্রোগ্রাম</div>
        <div style="font-size:13px;color:var(--muted);">বন্ধুদের আমন্ত্রণ জানিয়ে কয়েন আয় করুন</div>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="stat-value">${data.referrals || 0}</div>
          <div class="stat-label">মোট রেফার</div>
        </div>
        <div class="stat">
          <div class="stat-value">${data.activeReferrals || 0}</div>
          <div class="stat-label">একটিভ রেফার</div>
        </div>
        <div class="stat">
          <div class="stat-value">${Number(data.referralIncome || 0).toLocaleString()}</div>
          <div class="stat-label">রেফার আয়</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">🔗 তোমার রেফার লিংক</div>
        <input id="refLink" readonly value="${referralLink}" style="font-size:13px;margin-bottom:10px;">
        <button class="btn" id="copyBtn">📋 কপি করুন</button>
        <button class="btn" id="shareBtn" style="margin-top:8px;background:var(--card2);color:var(--text);border:1px solid var(--border);">
          শেয়ার করুন
        </button>
      </div>

      <div class="card">
        <div class="card-title">রিওয়ার্ড নিয়ম</div>
        <p style="font-size:13px;line-height:1.6;color:var(--muted);">
          • প্রতিটি Active রেফারেলে ২৫০ কয়েন<br>
          • রেফারকৃত ইউজার আয় করলে তুমি পাবে ৫% বোনাস<br>
          • রেফার Active হয় যখন সে কমপক্ষে ১টা টাস্ক সম্পন্ন করে
        </p>
      </div>

      <div style="font-size:15px;font-weight:700;margin:16px 0 10px;">
        রেফার লিস্ট (${pending + active})
      </div>
      ${listHtml || `<div class="card" style="text-align:center;color:var(--muted);">এখনো কোনো রেফার নেই</div>`}
    </div>
  `;

  document.getElementById("copyBtn").onclick = () => {
    const input = document.getElementById("refLink");
    input.select();
    input.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(referralLink).then(() => {
      tg.showAlert("লিংক কপি হয়েছে!");
    }).catch(() => {
      document.execCommand("copy");
      tg.showAlert("লিংক কপি হয়েছে!");
    });
  };

  document.getElementById("shareBtn").onclick = () => {
    const shareUrl = "https://t.me/share/url?url=" + encodeURIComponent(referralLink) + "&text=" + encodeURIComponent("দশ মিনিটের জব-এ জয়েন করো এবং কয়েন আয় করো!");
    if (tg.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, "_blank");
    }
  };
}

loadRefer().catch(err => {
  console.error(err);
  document.getElementById("app").innerHTML = `
    <div class="loader-box">
      <h2>সমস্যা হয়েছে</h2>
      <p class="error">${err.message}</p>
    </div>
  `;
});
