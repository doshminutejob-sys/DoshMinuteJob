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

      <!-- CATEGORY A: Permanent -->
      <div class="section-card">
        <h2>⭐ Category A — Permanent Tasks (একবারের টাস্ক)</h2>
        <p style="font-size:12px;color:var(--muted);margin-bottom:12px;">ইউজার জীবনে মাত্র একবার করতে পারবে</p>

        <div class="form-grid">
          <input id="a_name" placeholder="টাস্কের নাম *">
          <input id="a_link" placeholder="টাস্ক লিংক *">
          <input id="a_coin" type="number" placeholder="কয়েন রিওয়ার্ড *">
          <input id="a_code" placeholder="ভেরিফিকেশন কোড (ঐচ্ছিক)">
          <input id="a_timer" type="number" placeholder="টাইমার (সেকেন্ড)" value="15">
          <input id="a_limit" type="number" placeholder="লিমিট (০ = আনলিমিটেড)" value="0">
        </div>
        <button class="btn-primary" id="createA">Permanent টাস্ক তৈরি করুন</button>
      </div>

      <!-- CATEGORY B: Independent Cooldown -->
      <div class="section-card">
        <h2>🔄 Category B — Independent Cooldown Tasks</h2>
        <p style="font-size:12px;color:var(--muted);margin-bottom:12px;">প্রতিটি টাস্কের নিজস্ব আলাদা কুলডাউন থাকবে</p>

        <div class="form-grid">
          <input id="b_name" placeholder="টাস্কের নাম *">
          <input id="b_link" placeholder="টাস্ক লিংক *">
          <input id="b_coin" type="number" placeholder="কয়েন রিওয়ার্ড *">
          <input id="b_code" placeholder="ভেরিফিকেশন কোড (ঐচ্ছিক)">
          <input id="b_timer" type="number" placeholder="টাইমার (সেকেন্ড)" value="15">
          <input id="b_cooldown" type="number" placeholder="কুলডাউন ঘণ্টা *" value="3">
          <input id="b_limit" type="number" placeholder="লিমিট (০ = আনলিমিটেড)" value="0">
        </div>
        <button class="btn-primary" id="createB">Cooldown টাস্ক তৈরি করুন</button>
      </div>

      <!-- CATEGORY C: Sequential Lists -->
      <div class="section-card">
        <h2>📜 Category C — Sequential Task Lists</h2>
        <p style="font-size:12px;color:var(--muted);margin-bottom:12px;">
          প্রথমে একটি লিস্ট তৈরি করুন। পরে সেই লিস্টের ভিতরে টাস্ক যোগ করা যাবে (Lists পেজ থেকে)।
        </p>

        <div class="form-grid">
          <input id="c_listName" placeholder="লিস্টের নাম * (যেমন: Daily Chain)">
          <input id="c_cooldown" type="number" placeholder="লিস্ট কুলডাউন ঘণ্টা *" value="3">
        </div>
        <button class="btn-primary" id="createC">নতুন Sequential লিস্ট তৈরি করুন</button>
      </div>

      <!-- CATEGORY D: Temporary -->
      <div class="section-card">
        <h2>⏳ Category D — Temporary Expiring Tasks</h2>
        <p style="font-size:12px;color:var(--muted);margin-bottom:12px;">নির্দিষ্ট দিন পর অটো এক্সপায়ার হবে + কুলডাউন থাকবে</p>

        <div class="form-grid">
          <input id="d_name" placeholder="টাস্কের নাম *">
          <input id="d_link" placeholder="টাস্ক লিংক *">
          <input id="d_coin" type="number" placeholder="কয়েন রিওয়ার্ড *">
          <input id="d_code" placeholder="ভেরিফিকেশন কোড (ঐচ্ছিক)">
          <input id="d_timer" type="number" placeholder="টাইমার (সেকেন্ড)" value="15">
          <input id="d_cooldown" type="number" placeholder="কুলডাউন ঘণ্টা" value="3">
          <input id="d_days" type="number" placeholder="কত দিন অ্যাক্টিভ থাকবে *" value="7">
          <input id="d_limit" type="number" placeholder="লিমিট (০ = আনলিমিটেড)" value="0">
        </div>
        <button class="btn-primary" id="createD">Temporary টাস্ক তৈরি করুন</button>
      </div>

      <!-- Admin Menu -->
      <div class="admin-menu">
        <a href="users.html" class="menu-item"><span>👥</span><span>ইউজারস</span></a>
        <a href="tasks.html" class="menu-item"><span>📋</span><span>সব টাস্ক</span></a>
        <a href="lists.html" class="menu-item"><span>📜</span><span>সিকোয়েন্সিয়াল লিস্ট</span></a>
        <a href="withdraws.html" class="menu-item"><span>💰</span><span>উইথড্রস</span></a>
        <a href="referrals.html" class="menu-item"><span>🔗</span><span>রেফারস</span></a>
        <a href="notifications.html" class="menu-item"><span>📢</span><span>নোটিশ</span></a>
        <a href="security.html" class="menu-item"><span>🛡</span><span>সিকিউরিটি</span></a>
        <a href="settings.html" class="menu-item"><span>⚙</span><span>সেটিংস</span></a>
        <a href="../index.html" class="menu-item"><span>🏠</span><span>ইউজার অ্যাপ</span></a>
      </div>
    </div>
  `;

  // ========== Create Handlers ==========

  // Category A - Permanent
  document.getElementById("createA").onclick = async () => {
    const name = document.getElementById("a_name").value.trim();
    const link = document.getElementById("a_link").value.trim();
    const coin = Number(document.getElementById("a_coin").value);
    const code = document.getElementById("a_code").value.trim();
    const timer = Number(document.getElementById("a_timer").value) || 15;
    const limit = Number(document.getElementById("a_limit").value) || 0;

    if (!name || !link || !coin) return tg.showAlert("নাম, লিংক ও কয়েন আবশ্যক");

    const btn = document.getElementById("createA");
    btn.disabled = true;
    btn.innerText = "তৈরি হচ্ছে...";

    try {
      await addDoc(collection(db, "tasks_permanent"), {
        name, link, coin,
        code: code || "",
        timer, limit,
        category: "permanent",
        status: "published",
        completedCount: 0,
        createdAt: serverTimestamp()
      });
      tg.showAlert("✅ Permanent টাস্ক তৈরি হয়েছে!");
      location.reload();
    } catch (e) {
      tg.showAlert("সমস্যা: " + e.message);
      btn.disabled = false;
      btn.innerText = "Permanent টাস্ক তৈরি করুন";
    }
  };

  // Category B - Cooldown
  document.getElementById("createB").onclick = async () => {
    const name = document.getElementById("b_name").value.trim();
    const link = document.getElementById("b_link").value.trim();
    const coin = Number(document.getElementById("b_coin").value);
    const code = document.getElementById("b_code").value.trim();
    const timer = Number(document.getElementById("b_timer").value) || 15;
    const cooldownHours = Number(document.getElementById("b_cooldown").value) || 3;
    const limit = Number(document.getElementById("b_limit").value) || 0;

    if (!name || !link || !coin) return tg.showAlert("নাম, লিংক ও কয়েন আবশ্যক");

    const btn = document.getElementById("createB");
    btn.disabled = true;
    btn.innerText = "তৈরি হচ্ছে...";

    try {
      await addDoc(collection(db, "tasks_cooldown"), {
        name, link, coin,
        code: code || "",
        timer, cooldownHours, limit,
        category: "cooldown",
        status: "published",
        completedCount: 0,
        createdAt: serverTimestamp()
      });
      tg.showAlert("✅ Cooldown টাস্ক তৈরি হয়েছে!");
      location.reload();
    } catch (e) {
      tg.showAlert("সমস্যা: " + e.message);
      btn.disabled = false;
      btn.innerText = "Cooldown টাস্ক তৈরি করুন";
    }
  };

  // Category C - Create List
  document.getElementById("createC").onclick = async () => {
    const listName = document.getElementById("c_listName").value.trim();
    const cooldownHours = Number(document.getElementById("c_cooldown").value) || 3;

    if (!listName) return tg.showAlert("লিস্টের নাম দিন");

    const btn = document.getElementById("createC");
    btn.disabled = true;
    btn.innerText = "তৈরি হচ্ছে...";

    try {
      await addDoc(collection(db, "task_lists"), {
        name: listName,
        cooldownHours,
        status: "published",
        taskCount: 0,
        createdAt: serverTimestamp()
      });
      tg.showAlert("✅ Sequential লিস্ট তৈরি হয়েছে! এখন Lists পেজ থেকে টাস্ক যোগ করুন।");
      location.reload();
    } catch (e) {
      tg.showAlert("সমস্যা: " + e.message);
      btn.disabled = false;
      btn.innerText = "নতুন Sequential লিস্ট তৈরি করুন";
    }
  };

  // Category D - Temporary
  document.getElementById("createD").onclick = async () => {
    const name = document.getElementById("d_name").value.trim();
    const link = document.getElementById("d_link").value.trim();
    const coin = Number(document.getElementById("d_coin").value);
    const code = document.getElementById("d_code").value.trim();
    const timer = Number(document.getElementById("d_timer").value) || 15;
    const cooldownHours = Number(document.getElementById("d_cooldown").value) || 3;
    const activeDays = Number(document.getElementById("d_days").value) || 7;
    const limit = Number(document.getElementById("d_limit").value) || 0;

    if (!name || !link || !coin) return tg.showAlert("নাম, লিংক ও কয়েন আবশ্যক");

    const btn = document.getElementById("createD");
    btn.disabled = true;
    btn.innerText = "তৈরি হচ্ছে...";

    try {
      await addDoc(collection(db, "tasks_temporary"), {
        name, link, coin,
        code: code || "",
        timer, cooldownHours, activeDays, limit,
        category: "temporary",
        status: "published",
        completedCount: 0,
        createdAt: serverTimestamp()
      });
      tg.showAlert("✅ Temporary টাস্ক তৈরি হয়েছে!");
      location.reload();
    } catch (e) {
      tg.showAlert("সমস্যা: " + e.message);
      btn.disabled = false;
      btn.innerText = "Temporary টাস্ক তৈরি করুন";
    }
  };
}

loadDashboard().catch(err => console.error(err));
