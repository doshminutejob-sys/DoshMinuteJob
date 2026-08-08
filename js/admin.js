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

  const [usersSnap, permSnap, coolSnap, tempSnap, listSnap, pendingSnap, settingsSnap] = await Promise.all([
    getDocs(collection(db, "users")),
    getDocs(collection(db, "tasks_permanent")),
    getDocs(collection(db, "tasks_cooldown")),
    getDocs(collection(db, "tasks_temporary")),
    getDocs(collection(db, "task_lists")),
    getDocs(query(collection(db, "withdraw_requests"), where("status", "==", "pending"))),
    getDoc(doc(db, "system_settings", "main"))
  ]);

  let totalUsers = 0, activeUsers = 0, inactiveUsers = 0, totalCoins = 0;
  usersSnap.forEach(d => {
    const u = d.data();
    totalUsers++;
    totalCoins += Number(u.totalEarned || 0);
    if (u.status === "Active") activeUsers++;
    else inactiveUsers++;
  });

  const totalTasks = permSnap.size + coolSnap.size + tempSnap.size;
  const totalLists = listSnap.size;
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
          <div class="stat-label">সিকোয়েন্সিয়াল লিস্ট</div>
          <div class="stat-value">${totalLists}</div>
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

      <!-- Create Task Button -->
      <div style="margin:18px 0;">
        <a href="create-task.html" class="btn-primary" style="display:block;text-align:center;text-decoration:none;padding:16px;font-size:16px;">
          ➕ টাস্ক তৈরি করুন
        </a>
      </div>

      <!-- Admin Menu -->
      <div class="admin-menu">
        <a href="users.html" class="menu-item"><span>👥</span><span>ইউজারস</span></a>
        <a href="tasks.html" class="menu-item"><span>📋</span><span>সব টাস্ক</span></a>
        <a href="lists.html" class="menu-item"><span>📜</span><span>সিকোয়েন্সিয়াল</span></a>
        <a href="withdraws.html" class="menu-item"><span>💰</span><span>উইথড্রস</span></a>
        <a href="referrals.html" class="menu-item"><span>🔗</span><span>রেফারস</span></a>
        <a href="notifications.html" class="menu-item"><span>📢</span><span>নোটিশ</span></a>
        <a href="security.html" class="menu-item"><span>🛡</span><span>সিকিউরিটি</span></a>
        <a href="settings.html" class="menu-item"><span>⚙</span><span>সেটিংস</span></a>
        <a href="../index.html" class="menu-item"><span>🏠</span><span>ইউজার অ্যাপ</span></a>
      </div>
    </div>
  `;
}

loadDashboard().catch(err => console.error(err));
