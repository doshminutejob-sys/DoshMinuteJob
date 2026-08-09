import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy
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

// CPAlead Offerwall URL — পরে আসল URL বসাবে
const OFFERWALL_BASE = "https://www.cpalead.com/public/offerwall.php";
const OFFERWALL_PUB_ID = "YOUR_PUBLISHER_ID";

async function loadEarn() {
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

  // History
  let historyHtml = "";
  let totalOfferCoins = 0;
  let approvedCount = 0;
  let pendingCount = 0;

  try {
    const q = query(
      collection(db, "offerwall_history"),
      where("user_id", "==", String(user.id))
    );
    const hSnap = await getDocs(q);
    hSnap.forEach(d => {
      const h = d.data();
      const coins = Number(h.coins || 0);
      if (h.status === "approved") {
        totalOfferCoins += coins;
        approvedCount++;
      } else {
        pendingCount++;
      }
      historyHtml += `
        <div class="card" style="margin-bottom:10px;padding:12px;">
          <div style="font-weight:700;font-size:14px;">${h.offer_name || "Offer"}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px;">
            💰 ${coins.toLocaleString()} কয়েন • ${h.status === "approved" ? "✅ Approved" : "⏳ Pending"}
          </div>
        </div>
      `;
    });
  } catch (e) {}

  const wallUrl = OFFERWALL_BASE + "?id=" + OFFERWALL_PUB_ID + "&subid=" + user.id;

  const vpnBlocked = data.vpnSuspected && data.role !== "admin";

  document.getElementById("app").innerHTML = `
    <div class="page">
      <div class="hero" style="padding:16px;">
        <div style="font-size:20px;font-weight:800;margin-bottom:4px;">💰 Earn Coins</div>
        <div style="font-size:13px;color:var(--muted);">অফার সম্পন্ন করে কয়েন আয় করুন</div>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="stat-value">${totalOfferCoins.toLocaleString()}</div>
          <div class="stat-label">অফার আয়</div>
        </div>
        <div class="stat">
          <div class="stat-value">${approvedCount}</div>
          <div class="stat-label">Approved</div>
        </div>
        <div class="stat">
          <div class="stat-value">${pendingCount}</div>
          <div class="stat-label">Pending</div>
        </div>
      </div>

      ${vpnBlocked ? `
        <div class="card warning-card">
          <div class="card-title">⚠️ Offerwall বন্ধ</div>
          <p>VPN/প্রক্সি সন্দেহ হওয়ায় Offerwall দেখানো হচ্ছে না।</p>
        </div>
      ` : `
        <div class="card" style="text-align:center;">
          <div class="card-title">🔥 CPA Offerwall</div>
          <p style="font-size:13px;color:var(--muted);margin-bottom:14px;">
            অফার সম্পন্ন করুন। অনুমোদনের পর কয়েন অটো যোগ হবে।
          </p>
          <button class="btn" id="openWallBtn">Offerwall খুলুন</button>
        </div>
      `}

      <div class="card">
        <div class="card-title">⚠️ গুরুত্বপূর্ণ নোটিশ</div>
        <p style="font-size:12px;line-height:1.7;color:var(--muted);">
          • কয়েন শুধুমাত্র অ্যাডভার্টাইজার অনুমোদনের পর যোগ হয়<br>
          • অফার শেষ করলেই গ্যারান্টি নয়<br>
          • VPN, ফেক তথ্য, মাল্টি অ্যাকাউন্ট করলে রিওয়ার্ড বাতিল হতে পারে<br>
          • রেট: $1 = 12,000 কয়েন
        </p>
      </div>

      <div style="font-size:15px;font-weight:700;margin:16px 0 10px;">অফার হিস্ট্রি</div>
      ${historyHtml || `<div class="card" style="text-align:center;color:var(--muted);">এখনো কোনো অফার নেই</div>`}
    </div>
  `;

  const btn = document.getElementById("openWallBtn");
  if (btn) {
    btn.onclick = () => {
      if (data.status !== "Active") {
        return tg.showAlert("আগে অ্যাকাউন্ট এক্টিভ করুন");
      }
      if (tg.openLink) {
        tg.openLink(wallUrl);
      } else {
        window.open(wallUrl, "_blank");
      }
    };
  }
}

loadEarn().catch(err => {
  console.error(err);
  document.getElementById("app").innerHTML = `
    <div class="loader-box">
      <h2>সমস্যা হয়েছে</h2>
      <p class="error">${err.message}</p>
    </div>
  `;
});
