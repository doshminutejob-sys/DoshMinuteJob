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

async function loadPartners() {
  const meSnap = await getDoc(doc(db, "users", String(user.id)));
  if (!meSnap.exists()) {
    location.href = "index.html";
    return;
  }

  const me = meSnap.data();

  // ===== শুধু Partner বা Admin দেখতে পারবে =====
  if (me.role !== "partner" && me.role !== "admin") {
    document.getElementById("app").innerHTML = `
      <div class="page">
        <div class="loader-box" style="padding-top:80px;">
          <div class="logo-circle">👑</div>
          <h1>পার্টনার এক্সেস</h1>
          <p class="error" style="margin-top:12px;line-height:1.6;">
            এই পেজ শুধুমাত্র পার্টনার ও অ্যাডমিনদের জন্য।
          </p>
          <button class="btn" style="margin-top:20px;" onclick="location.href='index.html'">
            হোমে ফিরে যান
          </button>
        </div>
      </div>
    `;
    return;
  }

  const q = query(collection(db, "users"), where("role", "==", "partner"));
  const snap = await getDocs(q);

  const partners = [];
  snap.forEach(d => {
    const u = d.data();
    partners.push({
      id: d.id,
      name: u.firstName || u.username || "Partner",
      username: u.username || "",
      referralIncome: Number(u.referralIncome || 0),
      activeReferrals: Number(u.activeReferrals || 0),
      referrals: Number(u.referrals || 0)
    });
  });

  partners.sort((a, b) => b.referralIncome - a.referralIncome);

  const totalReferralEarnings = partners.reduce((s, p) => s + p.referralIncome, 0);

  let pool = 0;
  try {
    const sSnap = await getDoc(doc(db, "system_settings", "main"));
    if (sSnap.exists()) pool = Number(sSnap.data().partnerPool || 0);
  } catch (e) {}

  partners.forEach((p, i) => {
    p.rank = i + 1;
    p.profitPercent = totalReferralEarnings > 0
      ? (p.referralIncome / totalReferralEarnings) * 100
      : 0;
    p.monthlyProfit = totalReferralEarnings > 0
      ? Math.floor((p.referralIncome / totalReferralEarnings) * pool)
      : 0;
  });

  const top3 = partners.slice(0, 3);
  const rest = partners.slice(3);
  const myPartner = partners.find(p => p.id === String(user.id));

  let podiumHtml = "";
  const medals = ["🥇", "🥈", "🥉"];
  const classes = ["gold", "silver", "bronze"];
  for (let i = 0; i < 3; i++) {
    const p = top3[i];
    if (!p) {
      podiumHtml += `<div class="podium-card \( {classes[i]}"><div class="podium-rank"> \){medals[i]}</div><div class="podium-name">—</div></div>`;
    } else {
      podiumHtml += `
        <div class="podium-card ${classes[i]}">
          <div class="podium-rank">${medals[i]}</div>
          <div class="podium-name">${p.name}</div>
          <div class="podium-earn">${p.referralIncome.toLocaleString()}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px;">${p.profitPercent.toFixed(1)}%</div>
        </div>
      `;
    }
  }

  let gridHtml = "";
  if (myPartner) {
    gridHtml += `
      <div class="partner-card me">
        <div class="pc-rank">👑 তোমার র‍্যাঙ্ক #${myPartner.rank}</div>
        <div class="pc-name">${myPartner.name}</div>
        <div class="pc-stat">
          💰 রেফার আয়: ${myPartner.referralIncome.toLocaleString()} কয়েন<br>
          📈 শেয়ার: ${myPartner.profitPercent.toFixed(2)}%<br>
          🎁 সম্ভাব্য মাসিক: ${myPartner.monthlyProfit.toLocaleString()} কয়েন
        </div>
      </div>
    `;
  }

  rest.forEach(p => {
    gridHtml += `
      <div class="partner-card">
        <div class="pc-rank">#${p.rank}</div>
        <div class="pc-name">${p.name}</div>
        <div class="pc-stat">
          💰 ${p.referralIncome.toLocaleString()}<br>
          📈 ${p.profitPercent.toFixed(1)}%<br>
          🎁 ${p.monthlyProfit.toLocaleString()}
        </div>
      </div>
    `;
  });

  document.getElementById("app").innerHTML = `
    <div class="page">
      <div class="partner-header">
        <h1>👑 পার্টনার লিস্ট</h1>
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">💎 লভ্যাংশ পুল</div>
        <div class="pool-value">${pool.toLocaleString()} Coins</div>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="stat-value">${partners.length}</div>
          <div class="stat-label">পার্টনার</div>
        </div>
        <div class="stat">
          <div class="stat-value">${totalReferralEarnings.toLocaleString()}</div>
          <div class="stat-label">মোট রেফার আয়</div>
        </div>
        <div class="stat">
          <div class="stat-value">${pool.toLocaleString()}</div>
          <div class="stat-label">পুল</div>
        </div>
      </div>

      <div style="font-size:14px;font-weight:700;margin-bottom:10px;">🏆 টপ পার্টনার</div>
      <div class="podium">${podiumHtml}</div>

      <div style="font-size:14px;font-weight:700;margin-bottom:10px;">সকল পার্টনার</div>
      <div class="partner-grid">
        ${gridHtml || `<div class="card" style="grid-column:1/-1;text-align:center;color:var(--muted);">এখনো কোনো পার্টনার নেই</div>`}
      </div>

      <div class="card" style="margin-top:16px;">
        <div class="card-title">লভ্যাংশ কিভাবে গণনা হয়?</div>
        <p style="font-size:12px;line-height:1.7;color:var(--muted);">
          • শুধুমাত্র Approved আয় গণনা হয়<br>
          • যার রেফাররা যত বেশি আয় করবে, সে তত বেশি পাবে<br>
          • পার্টনার রেফার বোনাস: ১০% (সাধারণ ৫%)<br>
          • লভ্যাংশ মাসে একবার বিতরণ<br>
          • পুল অ্যাডমিন সেট করেন
        </p>
      </div>
    </div>
  `;
}

loadPartners().catch(err => {
  console.error(err);
  document.getElementById("app").innerHTML = `
    <div class="loader-box">
      <h2>সমস্যা</h2>
      <p class="error">${err.message}</p>
    </div>
  `;
});
