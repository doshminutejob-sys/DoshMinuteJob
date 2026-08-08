import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  addDoc
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
const startParam = tg.initDataUnsafe.start_param || null;

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

// ===== IP + Country Detection =====
async function detectLocation() {
  try {
    const res = await fetch("https://ipapi.co/json/", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      ip: data.ip || "",
      country: data.country_name || "Unknown",
      countryCode: data.country_code || "",
      city: data.city || ""
    };
  } catch (e) {
    console.log("Location detect failed", e);
    return null;
  }
}

function checkVpnSuspicion(ipHistory, newIP, newCountry) {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  // Keep only last 7 days records
  const recent = (ipHistory || []).filter(item => now - item.time < sevenDays);

  // Unique IPs in last 7 days
  const uniqueIPs = new Set(recent.map(i => i.ip));
  uniqueIPs.add(newIP);

  // Unique countries
  const uniqueCountries = new Set(recent.map(i => i.country).filter(Boolean));
  if (newCountry) uniqueCountries.add(newCountry);

  let vpnScore = 0;
  let vpnSuspected = false;

  if (uniqueIPs.size >= 3) {
    vpnScore += 40;
    vpnSuspected = true;
  } else if (uniqueIPs.size === 2) {
    vpnScore += 20;
  }

  if (uniqueCountries.size >= 2) {
    vpnScore += 30;
    vpnSuspected = true;
  }

  return {
    vpnScore: Math.min(vpnScore, 100),
    vpnSuspected,
    recentHistory: recent
  };
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
      activeReferralReward: 250,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
}

async function createOrUpdateUser() {
  const userRef = doc(db, "users", String(user.id));
  const snap = await getDoc(userRef);
  const deviceHash = generateDeviceHash();
  const location = await detectLocation();

  if (!snap.exists()) {
    const ipHistory = location ? [{
      ip: location.ip,
      country: location.country,
      countryCode: location.countryCode,
      time: Date.now()
    }] : [];

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
      deviceHash: deviceHash,
      isBanned: false,
      country: location?.country || "Unknown",
      countryCode: location?.countryCode || "",
      lastIP: location?.ip || "",
      ipHistory: ipHistory,
      vpnSuspected: false,
      vpnScore: 0,
      createdAt: serverTimestamp(),
      lastActiveAt: serverTimestamp()
    });

    if (startParam && startParam !== String(user.id)) {
      await addDoc(collection(db, "referral_history"), {
        referrerId: String(startParam),
        newUserId: String(user.id),
        status: "pending",
        createdAt: serverTimestamp()
      });
    }
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
      deviceHash: deviceHash,
      username: user.username || data.username,
      firstName: user.first_name || data.firstName,
      photoUrl: user.photo_url || data.photoUrl || ""
    };

    // Location + VPN check
    if (location && location.ip) {
      const oldHistory = data.ipHistory || [];
      const { vpnScore, vpnSuspected, recentHistory } = checkVpnSuspicion(
        oldHistory,
        location.ip,
        location.country
      );

      // Add new IP if different from last one
      let newHistory = [...recentHistory];
      if (data.lastIP !== location.ip) {
        newHistory.push({
          ip: location.ip,
          country: location.country,
          countryCode: location.countryCode,
          time: Date.now()
        });
      }

      // Keep max 8 records
      if (newHistory.length > 8) {
        newHistory = newHistory.slice(-8);
      }

      updateData.country = location.country;
      updateData.countryCode = location.countryCode;
      updateData.lastIP = location.ip;
      updateData.ipHistory = newHistory;
      updateData.vpnScore = Math.max(data.vpnScore || 0, vpnScore);
      updateData.vpnSuspected = data.vpnSuspected || vpnSuspected;
    }

    await updateDoc(userRef, updateData);
  }
}

async function loadHome() {
  const userRef = doc(db, "users", String(user.id));
  const snap = await getDoc(userRef);
  if (!snap.exists()) return;

  const data = snap.data();

  const isActive = data.status === "Active";
  const statusClass = isActive ? "status-active" : "status-inactive";
  const statusText = isActive ? "Active" : "Inactive";

  const countryText = data.country && data.country !== "Unknown"
    ? data.country
    : "অজানা";

  let activationCard = "";
  if (!isActive) {
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
        ${data.vpnSuspected ? `<span class="badge badge-pending">VPN সন্দেহ</span>` : ""}
      </div>

      ${activationCard}
      ${adminCard}

      <div class="card" style="text-align:center;">
        <div class="card-title">📢 অফিসিয়াল চ্যানেল</div>
        <p style="font-size:13px;color:var(--muted);margin-bottom:12px;">
          আপডেট ও নোটিফিকেশন পেতে চ্যানেলে জয়েন করুন
        </p>
        <a href="https://t.me/Dosh_Minute_Job_Official" target="_blank" class="btn" style="display:block;text-decoration:none;">
          চ্যানেলে জয়েন করুন
        </a>
      </div>

      <div class="quick-grid">
        <a href="tasks.html" class="quick-btn">📋<br>টাস্ক</a>
        <a href="refer.html" class="quick-btn">👥<br>রেফার</a>
        <a href="withdraw.html" class="quick-btn">💰<br>উইথড্র</a>
        <a href="notifications.html" class="quick-btn">🔔<br>নোটিশ</a>
      </div>
    </div>
  `;

  // Admin nav
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
    if (err.message !== "Banned") {
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
