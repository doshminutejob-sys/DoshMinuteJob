import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
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

async function loadTasks() {
  await checkAdmin();

  const [permSnap, coolSnap, tempSnap] = await Promise.all([
    getDocs(collection(db, "tasks_permanent")),
    getDocs(collection(db, "tasks_cooldown")),
    getDocs(collection(db, "tasks_temporary"))
  ]);

  const tasks = [];
  let totalCompleted = 0;

  permSnap.forEach(d => {
    const data = d.data();
    tasks.push({ id: d.id, collection: "tasks_permanent", ...data });
    totalCompleted += Number(data.completedCount || 0);
  });

  coolSnap.forEach(d => {
    const data = d.data();
    tasks.push({ id: d.id, collection: "tasks_cooldown", ...data });
    totalCompleted += Number(data.completedCount || 0);
  });

  tempSnap.forEach(d => {
    const data = d.data();
    tasks.push({ id: d.id, collection: "tasks_temporary", ...data });
    totalCompleted += Number(data.completedCount || 0);
  });

  // Newest first
  tasks.sort((a, b) => {
    const ta = a.createdAt?.toDate?.()?.getTime() || 0;
    const tb = b.createdAt?.toDate?.()?.getTime() || 0;
    return tb - ta;
  });

  let html = "";

  tasks.forEach(t => {
    const statusBadge = t.status === "published"
      ? `<span class="badge badge-active">Published</span>`
      : `<span class="badge badge-pending">${t.status || "Paused"}</span>`;

    const catLabel = {
      permanent: "Permanent",
      cooldown: "Cooldown",
      temporary: "Temporary"
    }[t.category] || t.category || "—";

    html += `
      <div class="item-card" id="task-${t.id}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
          <div style="font-weight:700;font-size:15px;">${t.name}</div>
          ${statusBadge}
        </div>

        <div style="font-size:13px;color:var(--muted);line-height:1.7;margin-bottom:12px;">
          <div>💰 <b style="color:var(--green)">${t.coin}</b> কয়েন</div>
          <div>📂 ক্যাটাগরি: ${catLabel}</div>
          <div>⏱ টাইমার: ${t.timer || 15}s ${t.code ? "• কোড আছে" : ""}</div>
          <div>🔄 কুলডাউন: ${t.cooldownHours || 0} ঘণ্টা</div>
          ${t.activeDays ? `<div>📅 অ্যাক্টিভ ডেজ: ${t.activeDays}</div>` : ""}
          <div>📊 সম্পন্ন: \( {t.completedCount || 0} \){t.limit ? " / " + t.limit : " / ∞"}</div>
          <div style="word-break:break-all;margin-top:4px;">
            🔗 <a href="\( {t.link}" target="_blank" style="color:var(--blue);"> \){t.link}</a>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <button class="btn-secondary" style="padding:10px;font-size:12px;"
            onclick="window.toggleStatus('\( {t.collection}', ' \){t.id}', '${t.status}')">
            ${t.status === "published" ? "⏸ পজ" : "▶ পাবলিশ"}
          </button>
          <button class="btn-secondary" style="padding:10px;font-size:12px;"
            onclick="window.editTask('\( {t.collection}', ' \){t.id}')">
            ✏️ এডিট
          </button>
          <button class="btn-danger" style="padding:10px;font-size:12px;grid-column:span 2;"
            onclick="window.deleteTask('\( {t.collection}', ' \){t.id}')">
            🗑 ডিলিট
          </button>
        </div>
      </div>
    `;
  });

  document.getElementById("app").innerHTML = `
    <div class="admin-page">
      <div class="admin-header">
        <h1>📋 টাস্ক ম্যানেজমেন্ট</h1>
        <p>সব ধরনের টাস্ক নিয়ন্ত্রণ করুন</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">মোট টাস্ক</div>
          <div class="stat-value">${tasks.length}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">মোট কমপ্লিশন</div>
          <div class="stat-value green">${totalCompleted}</div>
        </div>
      </div>

      <div style="margin-bottom:14px;">
        <a href="index.html" class="btn-primary" style="display:block;text-align:center;text-decoration:none;">
          + নতুন টাস্ক তৈরি (ড্যাশবোর্ড থেকে)
        </a>
      </div>

      <div id="tasksList">
        ${html || `
          <div class="section-card" style="text-align:center;color:var(--muted);">
            কোনো টাস্ক পাওয়া যায়নি। ড্যাশবোর্ড থেকে তৈরি করুন।
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

window.toggleStatus = async function(col, taskId, currentStatus) {
  const newStatus = currentStatus === "published" ? "paused" : "published";
  try {
    await updateDoc(doc(db, col, taskId), { status: newStatus });
    tg.showAlert("টাস্ক " + (newStatus === "published" ? "পাবলিশ" : "পজ") + " হয়েছে");
    loadTasks();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

window.editTask = async function(col, taskId) {
  const snap = await getDoc(doc(db, col, taskId));
  if (!snap.exists()) return tg.showAlert("টাস্ক পাওয়া যায়নি");

  const t = snap.data();

  const name = prompt("টাস্কের নাম:", t.name);
  if (name === null) return;

  const coin = prompt("কয়েন রিওয়ার্ড:", t.coin);
  if (coin === null) return;

  const link = prompt("টাস্ক লিংক:", t.link);
  if (link === null) return;

  const code = prompt("ভেরিফিকেশন কোড (খালি রাখলে টাইমার হবে):", t.code || "");
  const timer = prompt("টাইমার (সেকেন্ড):", t.timer || 15);
  const limit = prompt("লিমিট (০ = আনলিমিটেড):", t.limit || 0);
  const cooldown = prompt("কুলডাউন ঘণ্টা:", t.cooldownHours || 0);

  try {
    await updateDoc(doc(db, col, taskId), {
      name: name.trim() || t.name,
      coin: Number(coin) || t.coin,
      link: link.trim() || t.link,
      code: (code || "").trim(),
      timer: Number(timer) || 15,
      limit: Number(limit) || 0,
      cooldownHours: Number(cooldown) || 0
    });
    tg.showAlert("টাস্ক আপডেট হয়েছে");
    loadTasks();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

window.deleteTask = async function(col, taskId) {
  if (!confirm("এই টাস্ক পার্মানেন্টলি ডিলিট করবেন?")) return;
  try {
    await deleteDoc(doc(db, col, taskId));
    tg.showAlert("টাস্ক ডিলিট হয়েছে");
    loadTasks();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

loadTasks().catch(err => console.error(err));
