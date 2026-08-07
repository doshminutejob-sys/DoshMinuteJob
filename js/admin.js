import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  addDoc,
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
  return snap.data();
}

async function loadDashboard() {
  await checkAdmin();

  const [usersSnap, permSnap, coolSnap, tempSnap, pendingSnap, settingsSnap] = await Promise.all([
    getDocs(collection(db, "users")),
    getDocs(collection(db, "tasks_permanent")),
    getDocs(collection(db, "tasks_cooldown")),
    getDocs(collection(db, "tasks_temporary")),
    getDocs(query(collection(db, "withdraw_requests"), where("status", "==", "pending"))),
    getDoc(doc(db, "system_settings", "main"))
  ]);

  let totalUsers = 0;
  let activeUsers = 0;
  let inactiveUsers = 0;
  let totalCoins = 0;

  usersSnap.forEach(d => {
    const u = d.data();
    totalUsers++;
    totalCoins += Number(u.totalEarned || 0);
    if (u.status === "Active") activeUsers++;
    else inactiveUsers++;
  });

  const totalTasks = permSnap.size + coolSnap.size + tempSnap.size;
  const pendingWithdraws = pendingSnap.size;
  const settings = settingsSnap.exists() ? settingsSnap.data() : {};
  const withdrawStatus = settings.withdrawEnabled ? "চালু" : "বন্ধ";

  document.getElementById("app").innerHTML = `
    <div class="admin-page">
      <div class="admin-header">
        <h1>🛠 অ্যাডমিন ড্যাশবোর্ড</h1>
        <p>দশ মিনিটের জব • কন্ট্রোল প্যানেল</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">মোট ইউজার</div>
          <div class="stat-value">${totalUsers}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">একটিভ ইউজার</div>
          <div class="stat-value green">${activeUsers}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">ইনএকটিভ</div>
          <div class="stat-value yellow">${inactiveUsers}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">মোট টাস্ক</div>
          <div class="stat-value">${totalTasks}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">পেন্ডিং উইথড্র</div>
          <div class="stat-value yellow">${pendingWithdraws}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">কয়েন ডিস্ট্রিবিউটেড</div>
          <div class="stat-value">${totalCoins.toLocaleString()}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">উইথড্র সিস্টেম</div>
          <div class="stat-value \( {settings.withdrawEnabled ? 'green' : 'red'}"> \){withdrawStatus}</div>
        </div>
      </div>

      <!-- Quick Create Task -->
      <div class="section-card">
        <h2>🚀 কুইক টাস্ক তৈরি</h2>

        <div class="form-grid">
          <input id="taskName" placeholder="টাস্কের নাম *">
          <input id="taskLink" placeholder="টাস্ক লিংক *">
          <input id="taskCoin" type="number" placeholder="কয়েন রিওয়ার্ড *">
          <input id="taskCode" placeholder="ভেরিফিকেশন কোড (ঐচ্ছিক)">
          <input id="taskTimer" type="number" placeholder="টাইমার (সেকেন্ড)" value="15">
          <input id="taskLimit" type="number" placeholder="লিমিট (০ = আনলিমিটেড)" value="0">
          <input id="taskCooldown" type="number" placeholder="কুলডাউন ঘণ্টা" value="0">
          <input id="taskDays" type="number" placeholder="অ্যাক্টিভ ডেজ (Temporary)" value="0">

          <select id="taskCategory">
            <option value="permanent">Permanent (একবারের)</option>
            <option value="cooldown">Cooldown (স্বাধীন কুলডাউন)</option>
            <option value="temporary">Temporary (সাময়িক)</option>
          </select>
        </div>

        <button class="btn-primary" id="createTaskBtn">টাস্ক তৈরি করুন</button>
      </div>

      <!-- Admin Menu -->
      <div class="admin-menu">
        <a href="users.html" class="menu-item">
          <span>👥</span>
          <span>ইউজারস</span>
        </a>
        <a href="tasks.html" class="menu-item">
          <span>📋</span>
          <span>টাস্কস</span>
        </a>
        <a href="withdraws.html" class="menu-item">
          <span>💰</span>
          <span>উইথড্রস</span>
        </a>
        <a href="referrals.html" class="menu-item">
          <span>🔗</span>
          <span>রেফারস</span>
        </a>
        <a href="notifications.html" class="menu-item">
          <span>📢</span>
          <span>নোটিশ</span>
        </a>
        <a href="security.html" class="menu-item">
          <span>🛡</span>
          <span>সিকিউরিটি</span>
        </a>
        <a href="settings.html" class="menu-item">
          <span>⚙</span>
          <span>সেটিংস</span>
        </a>
        <a href="../index.html" class="menu-item">
          <span>🏠</span>
          <span>ইউজার অ্যাপ</span>
        </a>
      </div>
    </div>
  `;

  // Create Task
  document.getElementById("createTaskBtn").onclick = async () => {
    const name = document.getElementById("taskName").value.trim();
    const link = document.getElementById("taskLink").value.trim();
    const coin = Number(document.getElementById("taskCoin").value);
    const code = document.getElementById("taskCode").value.trim();
    const timer = Number(document.getElementById("taskTimer").value) || 15;
    const limit = Number(document.getElementById("taskLimit").value) || 0;
    const cooldownHours = Number(document.getElementById("taskCooldown").value) || 0;
    const activeDays = Number(document.getElementById("taskDays").value) || 0;
    const category = document.getElementById("taskCategory").value;

    if (!name || !link || !coin) {
      return tg.showAlert("নাম, লিংক এবং কয়েন আবশ্যক");
    }

    const btn = document.getElementById("createTaskBtn");
    btn.disabled = true;
    btn.innerText = "তৈরি হচ্ছে...";

    const collectionName = {
      permanent: "tasks_permanent",
      cooldown: "tasks_cooldown",
      temporary: "tasks_temporary"
    }[category];

    try {
      await addDoc(collection(db, collectionName), {
        name,
        link,
        coin,
        code: code || "",
        timer,
        limit,
        cooldownHours,
        activeDays,
        category,
        status: "published",
        completedCount: 0,
        createdAt: serverTimestamp()
      });

      tg.showAlert("✅ টাস্ক সফলভাবে তৈরি হয়েছে!");
      location.reload();
    } catch (e) {
      tg.showAlert("সমস্যা: " + e.message);
      btn.disabled = false;
      btn.innerText = "টাস্ক তৈরি করুন";
    }
  };
}

loadDashboard().catch(err => {
  console.error(err);
});
