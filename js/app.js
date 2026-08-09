import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const tg = window.Telegram?.WebApp;

if (!tg || !tg.initDataUnsafe?.user) {
  document.getElementById("app").innerHTML = `
    <div class="loader-box">
      <div class="logo-circle">⏱️</div>
      <h1>দশ মিনিটের জব</h1>
      <p class="error">দয়া করে Telegram অ্যাপের ভিতর থেকে খুলুন</p>
    </div>
  `;
  throw new Error("Telegram Required");
}

tg.ready();
tg.expand();
tg.setHeaderColor("#0B1220");
tg.setBackgroundColor("#0B1220");

const user = tg.initDataUnsafe.user;

function getStartParam() {
  let param = tg.initDataUnsafe?.start_param || null;
  if (!param) {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      param = urlParams.get("tgWebAppStartParam") || urlParams.get("startapp") || urlParams.get("start") || null;
    } catch (e) {}
  }
  if (!param && window.location.hash) {
    try {
      const hashText = window.location.hash.substring(1);
      const urlParams = new URLSearchParams(hashText);
      param = urlParams.get("tgWebAppStartParam") || urlParams.get("startapp") || null;
      if (!param && hashText.includes("tgWebAppStartParam=")) {
        param = hashText.split("tgWebAppStartParam=")[1]?.split("&")[0];
      }
    } catch (e) {}
  }
  return param ? String(param).trim() : null;
}

const startParam = getStartParam();

function generateDeviceHash() {
  const str = [
    navigator.userAgent,
    screen.width + "x" + screen.height,
    navigator.language,
    navigator.platform,
    navigator.hardwareConcurrency || "0"
  ].join("|");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return "dh_" + Math.abs(hash).toString(36);
}

async function detectLocation() {
  try {
    const res = await fetch("https://ipapi.co/json/", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data.ip && data.country_name) {
        return { ip: data.ip, country: data.country_name, countryCode: data.country_code || "", city: data.city || "" };
      }
    }
  } catch (e) {}
  try {
    const res = await fetch("https://ipwho.is/", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.ip) {
        return { ip: data.ip, country: data.country || "Unknown", countryCode: data.country_code || "", city: data.city || "" };
      }
    }
  } catch (e) {}
  return null;
}

function checkVpnSuspicion(ipHistory, newIP, newCountry) {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const recent = (ipHistory || []).filter(item => now - item.time < sevenDays);
  const uniqueCountries = new Set(recent.map(i => i.country).filter(Boolean));
  if (newCountry && newCountry !== "Unknown") uniqueCountries.add(newCountry);
  let vpnScore = 0;
  if (uniqueCountries.size >= 3) vpnScore = 100;
  else if (uniqueCountries.size >= 2) vpnScore = 60;
  return { vpnScore, vpnSuspected: vpnScore >= 60, recentHistory: recent };
}

async function ensureSettings() {
  const ref = doc(db, "system_settings", "main");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      withdrawEnabled: false,
      minWithdraw: 1000,
      requiredActiveReferrals: 15,
      referralBonusPercent: 5,
      partnerReferralPercent: 10,
      activeReferralReward: 250,
      partnerPool: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
}

async function createReferralRecord(newUserId) {
  if (!startParam || startParam === String(newUserId)) return;
  try {
    const q = query(collection(db, "referral_history"), where("newUserId", "==", String(newUserId)));
    const existing = await getDocs(q);
    if (!existing.empty) return;

    await addDoc(collection(db, "referral_history"), {
      referrerId: String(startParam),
      newUserId: String(newUserId),
      status: "pending",
      createdAt: serverTimestamp()
    });

    const referrerRef = doc(db, "users", String(startParam));
    if ((await getDoc(referrerRef)).exists()) {
      await updateDoc(referrerRef, { referrals: increment(1) });
    }
  } catch (e) {
    console.error("Referral error:", e);
  }
}

async function createOrUpdateUser() {
  const userRef = doc(db, "users", String(user.id));
  const snap = await getDoc(userRef);
  const deviceHash = generateDeviceHash();
  const location = await detectLocation();

  if (!snap.exists()) {
    const deviceQuery = query(collection(db, "users"), where("deviceHash", "==", deviceHash));
    const deviceSnap = await getDocs(deviceQuery);
    if (!deviceSnap.empty) {
      document.getElementById("app").innerHTML = `
        <div class="loader-box">
          <div class="logo-circle">🚫</div>
          <h1>ডিভাইস ব্লক</h1>
          <p class="error">এই ফোন দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট খোলা আছে।<br>এক ডিভাইসে শুধুমাত্র একটি অ্যাকাউন্ট অনুমোদিত।</p>
        </div>
      `;
      throw new Error("Device already registered");
    }
  }

  if (!snap.exists()) {
    const ipHistory = location ? [{ ip: location.ip, country: location.country, countryCode: location.countryCode, time: Date.now() }] : [];
    await setDoc(userRef, {
      telegramId: user.id,
      username: user.username || "",
      firstName: user.first_name || "",
      lastName: user.last_name || "",
      photoUrl: user.photo_url || "",
      facebookLink: "",
      role: "user",
      status: "Inactive",
      coin: 0,
      totalEarned: 0,
      totalWithdraw: 0,
      referrals: 0,
      activeReferrals: 0,
      referralIncome: 0,
      paymentMethod: "",
      paymentNumber: "",
      deviceHash,
      isBanned: false,
      referredBy: (startParam && startParam !== String(user.id)) ? String(startParam) : "",
      country: location ? location.country : "Unknown",
      countryCode: location ? location.countryCode : "",
      lastIP: location ? location.ip : "",
      ipHistory,
      vpnSuspected: false,
      vpnScore: 0,
      createdAt: serverTimestamp(),
      lastActiveAt: serverTimestamp()
    });
    if (startParam) await createReferralRecord(user.id);
  } else {
    const data = snap.data();
    if (data.isBanned) {
      document.getElementById("app").innerHTML = `
        <div class="loader-box">
          <div class="logo-circle">🚫</div>
          <h1>অ্যাকাউন্ট ব্যান</h1>
          <p class="error">আপনার অ্যাকাউন্ট স্থগিত করা হয়েছে</p>
        </div>
      `;
      throw new Error("Banned");
    }

    let updateData = {
      lastActiveAt: serverTimestamp(),
      deviceHash,
      username: user.username || data.username || "",
      firstName: user.first_name || data.firstName || "",
      photoUrl: user.photo_url || data.photoUrl || ""
    };

    if (!data.referredBy && startParam && startParam !== String(user.id)) {
      updateData.referredBy = String(startParam);
      await createReferralRecord(user.id);
    }

    if (location && location.ip) {
      const oldHistory = data.ipHistory || [];
      const result = checkVpnSuspicion(oldHistory, location.ip, location.country);
      let newHistory = [...result.recentHistory];
      if (data.lastIP !== location.ip) {
        newHistory.push({ ip: location.ip, country: location.country, countryCode: location.countryCode, time: Date.now() });
      }
      if (newHistory.length > 8) newHistory = newHistory.slice(-8);
      updateData.country = location.country;
      updateData.countryCode = location.countryCode;
      updateData.lastIP = location.ip;
      updateData.ipHistory = newHistory;
      updateData.vpnScore = Math.max(data.vpnScore || 0, result.vpnScore);
      updateData.vpnSuspected = data.vpnSuspected || result.vpnSuspected;
    }
    await updateDoc(userRef, updateData);
  }
}

async function loadHome() {
  const snap = await getDoc(doc(db, "users", String(user.id)));
  if (!snap.exists()) return;
  const data = snap.data();

  const statusText = data.status === "Active" ? "Active" : "Inactive";
  const statusClass = data.status === "Active" ? "status-active" : "status-inactive";
  const countryText = (data.country && data.country !== "Unknown") ? data.country : "অজানা";

  let activationCard = "";
  if (data.status !== "Active") {
    activationCard = `
      <div class="card warning-card">
        <div class="card-title">⚠️ অ্যাকাউন্ট এক্টিভ নয়</div>
        <p>সব ফিচার আনলক করতে আপনার Facebook প্রোফাইল লিংক দিন।</p>
        <button class="btn" onclick="location.href='profile.html'">প্রোফাইলে যান ও এক্টিভেট করুন</button>
      </div>
    `;
  }

  let adminCard = "";
  if (data.role === "admin") {
    adminCard = `
      <div class="card">
        <div class="card-title">🛠 অ্যাডমিন প্যানেল</div>
        <button class="btn" onclick="location.href='admin/index.html'">ড্যাশবোর্ড খুলুন</button>
      </div>
    `;
  }

  let partnerCard = "";
  if (data.role === "partner" || data.role === "admin") {
    partnerCard = `
      <div class="card">
        <div class="card-title">👑 পার্টনার জোন</div>
        <button class="btn" onclick="location.href='partner.html'">পার্টনার লিস্ট দেখুন</button>
      </div>
    `;
  }

  document.getElementById("app").innerHTML = `
    <div class="page">
      <div class="hero">
        <div class="hero-top">
          <img src="${data.photoUrl || 'images/default-avatar.png'}" class="avatar" onerror="this.src='images/default-avatar.png'">
          <div>
            <div class="hero-name">${data.firstName || "User"}</div>
            <div class="hero-username">@${data.username || "unknown"}</div>
            <span class="status-badge \( {statusClass}"> \){statusText}</span>
          </div>
        </div>
        <div class="balance-box">
          <div class="balance-label">বর্তমান ব্যালেন্স</div>
          <div class="balance-amount">💰 ${Number(data.coin || 0).toLocaleString()}</div>
        </div>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="stat-value">${Number(data.totalEarned || 0).toLocaleString()}</div>
          <div class="stat-label">মোট আয়</div>
        </div>
        <div class="stat">
          <div class="stat-value">${data.activeReferrals || 0}</div>
          <div class="stat-label">একটিভ রেফার</div>
        </div>
        <div class="stat">
          <div class="stat-value">${data.referrals || 0}</div>
          <div class="stat-label">মোট রেফার</div>
        </div>
        <div class="stat">
          <div class="stat-value">${Number(data.totalWithdraw || 0).toLocaleString()}</div>
          <div class="stat-label">উইথড্র</div>
        </div>
      </div>

      <div class="card" style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:13px;color:var(--muted);">📍 আপনার লোকেশন</div>
          <div style="font-weight:600;margin-top:3px;">${countryText}</div>
        </div>
        ${data.vpnSuspected ? `<span class="status-badge status-inactive">VPN সন্দেহ</span>` : ""}
      </div>

      ${activationCard}
      ${partnerCard}
      ${adminCard}

      <div class="card" style="text-align:center;">
        <div class="card-title">📢 অফিসিয়াল চ্যানেল</div>
        <p style="font-size:13px;color:var(--muted);margin-bottom:12px;">আপডেট ও নোটিফিকেশন পেতে চ্যানেলে জয়েন করুন</p>
        <a href="https://t.me/Dosh_Minute_Job_Official" target="_blank" class="btn" style="display:block;text-decoration:none;">চ্যানেলে জয়েন করুন</a>
      </div>

      <div class="quick-grid">
        <a href="tasks.html" class="quick-btn">📋<br>টাস্ক</a>
        <a href="earn.html" class="quick-btn">💰<br>Earn</a>
        <a href="refer.html" class="quick-btn">👥<br>রেফার</a>
        <a href="withdraw.html" class="quick-btn">💸<br>উইথড্র</a>
      </div>
    </div>
  `;

  if (data.role === "admin") {
    const nav = document.querySelector(".bottom-nav");
    if (nav && !nav.querySelector('a[href="admin/index.html"]')) {
      const adminLink = document.createElement("a");
      adminLink.href = "admin/index.html";
      adminLink.className = "nav-item";
      adminLink.innerHTML = `<span class="icon">🛠</span><span class="label">অ্যাডমিন</span>`;
      nav.appendChild(adminLink);
    }
  }
}

(async () => {
  try {
    await ensureSettings();
    await createOrUpdateUser();
    await loadHome();
  } catch (err) {
    if (err.message !== "Banned" && err.message !== "Device already registered") {
      console.error(err);
      document.getElementById("app").innerHTML = `
        <div class="loader-box">
          <h2>সমস্যা হয়েছে</h2>
          <p class="error">${err.message}</p>
        </div>
      `;
    }
  }
})();
