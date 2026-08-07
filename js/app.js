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

  if (!snap.exists()) {
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
      createdAt: serverTimestamp(),
      lastActiveAt: serverTimestamp()
    });

    // Referral tracking
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

    await updateDoc(userRef, {
      lastActiveAt: serverTimestamp(),
      deviceHash: deviceHash,
      username: user.username || data.username,
      firstName: user.first_name || data.firstName,
      photoUrl: user.photo_url || data.photoUrl || ""
    });
  }
}

async function loadHome() {
  const userRef = doc(db, "users", String(user.id));
  const snap = await getDoc(userRef);
  if (!snap.exists()) return;

  const data = snap.data();

  const statusClass = data.status === "Active" ? "status-active" : "status-inactive";
  const statusText = data.status === "Active" ? "Active" : "Inactive";

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

      ${activationCard}
      ${adminCard}

      <div class="quick-grid">
        <a href="tasks.html" class="quick-btn">📋<br>টাস্ক</a>
        <a href="refer.html" class="quick-btn">👥<br>রেফার</a>
        <a href="withdraw.html" class="quick-btn">💰<br>উইথড্র</a>
        <a href="notifications.html" class="quick-btn">🔔<br>নোটিশ</a>
      </div>
    </div>
  `;
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
