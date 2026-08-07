import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  setDoc,
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

async function loadSettings() {
  await checkAdmin();

  const settingsRef = doc(db, "system_settings", "main");
  const snap = await getDoc(settingsRef);

  let data = {
    withdrawEnabled: false,
    minWithdraw: 1000,
    requiredActiveReferrals: 15,
    activeReferralReward: 250,
    referralBonusPercent: 5
  };

  if (snap.exists()) {
    data = { ...data, ...snap.data() };
  } else {
    // Auto create
    await setDoc(settingsRef, {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  document.getElementById("app").innerHTML = `
    <div class="admin-page">
      <div class="admin-header">
        <h1>⚙ সিস্টেম সেটিংস</h1>
        <p>পুরো প্ল্যাটফর্মের কনফিগারেশন</p>
      </div>

      <div class="section-card">
        <h2>💰 উইথড্র সেটিংস</h2>

        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:6px;">উইথড্র সিস্টেম</label>
        <select id="withdrawEnabled">
          <option value="true" ${data.withdrawEnabled ? "selected" : ""}>✅ চালু (ON)</option>
          <option value="false" ${!data.withdrawEnabled ? "selected" : ""}>❌ বন্ধ (OFF)</option>
        </select>

        <label style="font-size:12px;color:var(--muted);display:block;margin:14px 0 6px;">মিনিমাম উইথড্র অ্যামাউন্ট (কয়েন)</label>
        <input id="minWithdraw" type="number" value="${data.minWithdraw || 1000}" placeholder="1000">

        <label style="font-size:12px;color:var(--muted);display:block;margin:14px 0 6px;">প্রয়োজনীয় Active Referral</label>
        <input id="requiredRefs" type="number" value="${data.requiredActiveReferrals || 15}" placeholder="15">
      </div>

      <div class="section-card">
        <h2>👥 রেফার সেটিংস</h2>

        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:6px;">Active Referral রিওয়ার্ড (কয়েন)</label>
        <input id="refReward" type="number" value="${data.activeReferralReward || 250}" placeholder="250">

        <label style="font-size:12px;color:var(--muted);display:block;margin:14px 0 6px;">রেফার বোনাস পার্সেন্ট (%)</label>
        <input id="refPercent" type="number" value="${data.referralBonusPercent || 5}" placeholder="5">
        <p style="font-size:11px;color:var(--muted);margin-top:6px;">
          রেফারকৃত ইউজার যখন কয়েন আয় করবে, রেফারার সেই পরিমাণের এই পার্সেন্ট পাবে।
        </p>
      </div>

      <button class="btn-primary" id="saveBtn" style="margin-bottom:14px;">
        💾 সেটিংস সেভ করুন
      </button>

      <a href="index.html" class="btn-secondary" style="display:block;text-align:center;text-decoration:none;">
        ← ড্যাশবোর্ডে ফিরে যান
      </a>
    </div>
  `;

  document.getElementById("saveBtn").onclick = saveSettings;
}

async function saveSettings() {
  const withdrawEnabled = document.getElementById("withdrawEnabled").value === "true";
  const minWithdraw = Number(document.getElementById("minWithdraw").value);
  const requiredActiveReferrals = Number(document.getElementById("requiredRefs").value);
  const activeReferralReward = Number(document.getElementById("refReward").value);
  const referralBonusPercent = Number(document.getElementById("refPercent").value);

  if (minWithdraw < 0 || requiredActiveReferrals < 0 || activeReferralReward < 0 || referralBonusPercent < 0) {
    return tg.showAlert("নেগেটিভ ভ্যালু দেওয়া যাবে না");
  }

  const btn = document.getElementById("saveBtn");
  btn.disabled = true;
  btn.innerText = "সেভ হচ্ছে...";

  try {
    await setDoc(doc(db, "system_settings", "main"), {
      withdrawEnabled,
      minWithdraw,
      requiredActiveReferrals,
      activeReferralReward,
      referralBonusPercent,
      updatedAt: serverTimestamp()
    }, { merge: true });

    tg.showAlert("✅ সেটিংস সফলভাবে সেভ হয়েছে");
    btn.disabled = false;
    btn.innerText = "💾 সেটিংস সেভ করুন";
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
    btn.disabled = false;
    btn.innerText = "💾 সেটিংস সেভ করুন";
  }
}

loadSettings().catch(err => console.error(err));
