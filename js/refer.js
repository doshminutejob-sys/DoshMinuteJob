import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp
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
  const userRef = doc(db, "users", String(user.id));
  const snap = await getDoc(userRef);

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
        <p class="error">আপনার অ্যাকাউন্ট স্থগিত</p>
      </div>
    `;
    return;
  }

  await updateDoc(userRef, { lastActiveAt: serverTimestamp() });

  // Referral link (Mini App)
  const referralLink = `https://t.me/\( {BOT_USERNAME}?startapp= \){user.id}`;

  // Load referral history
  const q = query(
    collection(db, "referral_history"),
    where("referrerId", "==", String(user.id))
  );
  const refSnap = await getDocs(q);

  let total = 0;
  let active = 0;
  let pending = 0;
  let listHtml = "";

  for (const item of refSnap.docs) {
    const r = item.data();
    total++;
    if (r.status === "active") active++;
    else pending++;

    let name = r.newUserId;
    try {
      const uSnap = await getDoc(doc(db, "users", r.newUserId));
      if (uSnap.exists()) {
        const u = uSnap.data();
        name = u.firstName || u.username || r.newUserId;
      }
    } catch (e) {}

    const badge = r.status === "active"
      ? `<span class="status-badge status-active">Active</span>`
      : `<span class="status-badge status-inactive">Pending</span>`;

    listHtml += `
      <div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:14px;">
        <div>
          <div style="font-weight:600;font-size:14px;">👤 ${name}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">ID: ${r.newUserId}</div>
        </div>
        ${badge}
      </div>
    `;
  }

  // Settings for reward info
  let rewardText = "250";
  try {
    const sSnap = await getDoc(doc(db, "system_settings", "main"));
    if (sSnap.exists()) {
      rewardText = sSnap.data().activeReferralReward || 250;
    }
  } catch (e) {}

  document.getElementById("app").innerHTML = `
    <div class="page">
      <div class="hero" style="padding:16px;">
        <div style="font-size:20px;font-weight:800;margin-bottom:4px;">👥 রেফার প্রোগ্রাম</div>
        <div style="font-size:13px;color:var(--muted);">বন্ধুদের আমন্ত্রণ জানিয়ে কয়েন আয় করুন</div>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="stat-value">${total}</div>
          <div class="stat-label">মোট রেফার</div>
        </div>
        <div class="stat">
          <div class="stat-value">${active}</div>
          <div class="stat-label">একটিভ</div>
        </div>
        <div class="stat">
          <div class="stat-value">${pending}</div>
          <div class="stat-label">পেন্ডিং</div>
        </div>
        <div class="stat">
          <div class="stat-value">${Number(data.referralIncome || 0).toLocaleString()}</div>
          <div class="stat-label">রেফার আয়</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">🔗 আপনার রেফার লিংক</div>
        <input id="refLink" readonly value="${referralLink}" style="font-size:12px;">
        <button class="btn" id="copyBtn" style="margin-top:10px;">📋 লিংক কপি করুন</button>
        <button class="btn" id="shareBtn" style="margin-top:8px;background:var(--card2);color:var(--text);border:1px solid var(--border);">
          📤 টেলিগ্রামে শেয়ার করুন
        </button>
      </div>

      <div class="card" style="background:linear-gradient(160deg,#141E33,rgba(0,229,160,0.08));">
        <div class="card-title">🎁 রেফার রিওয়ার্ড</div>
        <div style="font-size:13px;line-height:1.7;color:var(--muted);">
          • প্রতিটি Active রেফারেল = <b style="color:var(--green)">${rewardText} কয়েন</b><br>
          • রেফারকৃত ইউজার যখন কয়েন আয় করবে, আপনি পাবেন <b style="color:var(--green)">৫%</b> বোনাস<br>
          • Active হতে হলে রেফারকৃত ইউজারকে কমপক্ষে ১টি টাস্ক সম্পন্ন করতে হবে
        </div>
      </div>

      <div style="font-size:15px;font-weight:700;margin:18px 0 10px;">📜 আপনার রেফার লিস্ট</div>
      <div>
        ${listHtml || `
          <div class="card" style="text-align:center;color:var(--muted);font-size:13px;">
            এখনো কোনো রেফার নেই।<br>লিংক শেয়ার করে শুরু করুন!
          </div>
        `}
      </div>
    </div>
  `;

  // Copy button
  document.getElementById("copyBtn").onclick = () => {
    const link = document.getElementById("refLink").value;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).then(() => {
        tg.showAlert("লিংক কপি হয়েছে!");
      });
    } else {
      const input = document.getElementById("refLink");
      input.select();
      document.execCommand("copy");
      tg.showAlert("লিংক কপি হয়েছে!");
    }
  };

  // Share button
  document.getElementById("shareBtn").onclick = () => {
    const link = document.getElementById("refLink").value;
    const text = `দশ মিনিটের জব-এ জয়েন করুন এবং টাস্ক করে কয়েন আয় করুন!\n\n${link}`;
    if (tg.openTelegramLink) {
      tg.openTelegramLink(`https://t.me/share/url?url=\( {encodeURIComponent(link)}&text= \){encodeURIComponent(text)}`);
    } else {
      window.open(`https://t.me/share/url?url=\( {encodeURIComponent(link)}&text= \){encodeURIComponent(text)}`, "_blank");
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
