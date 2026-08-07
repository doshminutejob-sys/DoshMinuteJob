import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  increment,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const tg = window.Telegram?.WebApp;

if (!tg || !tg.initDataUnsafe?.user) {
  document.getElementById("app").innerHTML = `
    <div class="loader-box">
      <h1>⛔ অ্যাক্সেস ডিনাইড</h1>
      <p>Telegram থেকে খুলুন</p>
    </div>
  `;
  throw new Error("Telegram Required");
}

tg.ready();
tg.expand();
tg.setHeaderColor("#0B1220");
tg.setBackgroundColor("#0B1220");

const adminUser = tg.initDataUnsafe.user;

async function checkAdmin() {
  const snap = await getDoc(doc(db, "users", String(adminUser.id)));
  if (!snap.exists() || snap.data().role !== "admin") {
    document.getElementById("app").innerHTML = `
      <div class="loader-box">
        <div class="logo-circle">⛔</div>
        <h1>অ্যাক্সেস ডিনাইড</h1>
        <p>আপনি অ্যাডমিন নন</p>
      </div>
    `;
    throw new Error("Not Admin");
  }
}

async function loadReferrals() {
  await checkAdmin();

  const snap = await getDocs(collection(db, "referral_history"));
  const list = [];
  let pending = 0, active = 0;

  snap.forEach(d => {
    const data = d.data();
    list.push({ id: d.id, ...data });
    if (data.status === "active") active++;
    else pending++;
  });

  // Pending first, then newest
  list.sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (b.status === "pending" && a.status !== "pending") return 1;
    const ta = a.createdAt?.toDate?.()?.getTime() || 0;
    const tb = b.createdAt?.toDate?.()?.getTime() || 0;
    return tb - ta;
  });

  let html = "";

  for (const r of list) {
    let referrerName = r.referrerId;
    let newUserName = r.newUserId;

    try {
      const refSnap = await getDoc(doc(db, "users", r.referrerId));
      if (refSnap.exists()) {
        const u = refSnap.data();
        referrerName = (u.firstName || "") + " (@" + (u.username || r.referrerId) + ")";
      }
    } catch (e) {}

    try {
      const newSnap = await getDoc(doc(db, "users", r.newUserId));
      if (newSnap.exists()) {
        const u = newSnap.data();
        newUserName = (u.firstName || "") + " (@" + (u.username || r.newUserId) + ")";
      }
    } catch (e) {}

    const badge = r.status === "active"
      ? `<span class="badge badge-active">Active</span>`
      : `<span class="badge badge-pending">Pending</span>`;

    const date = r.createdAt?.toDate
      ? r.createdAt.toDate().toLocaleDateString("bn-BD")
      : "—";

    html += `
      <div class="item-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div style="font-size:12px;color:var(--muted);">${date}</div>
          ${badge}
        </div>

        <div style="font-size:13px;line-height:1.7;margin-bottom:12px;">
          <div>👤 <b>রেফারার:</b> ${referrerName}</div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:6px;">ID: ${r.referrerId}</div>
          <div>🆕 <b>নতুন ইউজার:</b> ${newUserName}</div>
          <div style="font-size:11px;color:var(--muted);">ID: ${r.newUserId}</div>
        </div>

        ${r.status === "pending" ? `
          <button class="btn-primary" style="padding:11px;font-size:13px;"
            onclick="window.approveReferral('\( {r.id}', ' \){r.referrerId}')">
            ✅ ম্যানুয়ালি অ্যাপ্রুভ করুন
          </button>
        ` : `
          <button class="btn-secondary" disabled style="padding:11px;">Already Active</button>
        `}
      </div>
    `;
  }

  document.getElementById("app").innerHTML = `
    <div class="admin-page">
      <div class="admin-header">
        <h1>🔗 রেফার ম্যানেজমেন্ট</h1>
        <p>রেফার ট্র্যাক ও ম্যানুয়াল অ্যাপ্রুভ</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Pending</div>
          <div class="stat-value yellow">${pending}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Active</div>
          <div class="stat-value green">${active}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">মোট</div>
          <div class="stat-value">${list.length}</div>
        </div>
      </div>

      <div style="font-size:12px;color:var(--muted);margin-bottom:14px;line-height:1.5;">
        নোট: রেফার অটোমেটিক Active হয় যখন নতুন ইউজার কমপক্ষে ১টি টাস্ক সম্পন্ন করে।  
        এখান থেকে ম্যানুয়ালিও অ্যাপ্রুভ করা যায়।
      </div>

      <div id="referralsList">
        ${html || `
          <div class="section-card" style="text-align:center;color:var(--muted);">
            এখনো কোনো রেফার নেই
          </div>
        `}
      </div>

      <div style="margin-top:18px;">
        <a href="index.html" class="btn-secondary" style="display:block;text-align:center;text-decoration:none;">
          ← ড্যাশবোর্ডে ফিরে যান
        </a>
      </div>
    </div>
  `;
}

window.approveReferral = async function(id, referrerId) {
  if (!confirm("এই রেফার ম্যানুয়ালি অ্যাপ্রুভ করবেন?\n\nরেফারারের Active Referrals বাড়বে এবং রিওয়ার্ড পাবে।")) return;

  try {
    const refDoc = doc(db, "referral_history", id);
    const snap = await getDoc(refDoc);
    if (!snap.exists()) return tg.showAlert("পাওয়া যায়নি");
    if (snap.data().status === "active") return tg.showAlert("ইতিমধ্যে Active");

    await updateDoc(refDoc, {
      status: "active",
      activatedAt: serverTimestamp(),
      activatedBy: "admin"
    });

    // Give reward to referrer
    const settingsSnap = await getDoc(doc(db, "system_settings", "main"));
    const reward = settingsSnap.exists() ? (settingsSnap.data().activeReferralReward || 250) : 250;

    const referrerRef = doc(db, "users", referrerId);
    const referrerSnap = await getDoc(referrerRef);
    if (referrerSnap.exists()) {
      await updateDoc(referrerRef, {
        activeReferrals: increment(1),
        referrals: increment(1),
        coin: increment(reward),
        totalEarned: increment(reward),
        referralIncome: increment(reward)
      });
    }

    tg.showAlert("✅ রেফার অ্যাপ্রুভ হয়েছে + " + reward + " কয়েন দেওয়া হয়েছে");
    loadReferrals();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

loadReferrals().catch(err => console.error(err));
