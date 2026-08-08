import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
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
let currentCategory = null;

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

// ==================== CATEGORY LIST ====================
async function showCategoryList() {
  currentCategory = null;
  await checkAdmin();

  const [permSnap, coolSnap, tempSnap, listSnap] = await Promise.all([
    getDocs(collection(db, "tasks_permanent")),
    getDocs(collection(db, "tasks_cooldown")),
    getDocs(collection(db, "tasks_temporary")),
    getDocs(collection(db, "task_lists"))
  ]);

  document.getElementById("app").innerHTML = `
    <div class="admin-page">
      <div class="admin-header">
        <h1>📋 টাস্ক ম্যানেজমেন্ট</h1>
        <p>ক্যাটাগরি সিলেক্ট করে টাস্ক দেখুন ও নিয়ন্ত্রণ করুন</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Permanent</div>
          <div class="stat-value">${permSnap.size}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Cooldown</div>
          <div class="stat-value">${coolSnap.size}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Sequential</div>
          <div class="stat-value">${listSnap.size}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Temporary</div>
          <div class="stat-value">${tempSnap.size}</div>
        </div>
      </div>

      <div class="item-card" style="cursor:pointer;" onclick="window.openAdminCategory('permanent')">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="font-size:26px;">⭐</div>
          <div>
            <div style="font-weight:700;">Permanent Tasks</div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px;">${permSnap.size} টি টাস্ক • একবারের</div>
          </div>
        </div>
      </div>

      <div class="item-card" style="cursor:pointer;" onclick="window.openAdminCategory('cooldown')">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="font-size:26px;">🔄</div>
          <div>
            <div style="font-weight:700;">Cooldown Tasks</div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px;">${coolSnap.size} টি টাস্ক • আলাদা কুলডাউন</div>
          </div>
        </div>
      </div>

      <div class="item-card" style="cursor:pointer;" onclick="window.openAdminCategory('sequential')">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="font-size:26px;">📜</div>
          <div>
            <div style="font-weight:700;">Sequential Lists</div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px;">${listSnap.size} টি লিস্ট • Lists পেজ থেকে ম্যানেজ করুন</div>
          </div>
        </div>
      </div>

      <div class="item-card" style="cursor:pointer;" onclick="window.openAdminCategory('temporary')">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="font-size:26px;">⏳</div>
          <div>
            <div style="font-weight:700;">Temporary Tasks</div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px;">${tempSnap.size} টি টাস্ক • মেয়াদোত্তীর্ণ</div>
          </div>
        </div>
      </div>

      <div style="margin-top:18px;">
        <a href="index.html" class="btn-secondary" style="display:block;text-align:center;text-decoration:none;">
          ← ড্যাশবোর্ডে ফিরে যান
        </a>
      </div>
    </div>
  `;
}

// ==================== OPEN CATEGORY ====================
window.openAdminCategory = async function(cat) {
  currentCategory = cat;

  if (cat === "sequential") {
    // Sequential lists are managed in lists.html
    location.href = "lists.html";
    return;
  }

  const collectionName = {
    permanent: "tasks_permanent",
    cooldown: "tasks_cooldown",
    temporary: "tasks_temporary"
  }[cat];

  const titleMap = {
    permanent: "⭐ Permanent Tasks",
    cooldown: "🔄 Cooldown Tasks",
    temporary: "⏳ Temporary Tasks"
  };

  const snap = await getDocs(collection(db, collectionName));
  const tasks = [];
  let totalCompleted = 0;

  snap.forEach(d => {
    const data = d.data();
    tasks.push({ id: d.id, ...data });
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

    html += `
      <div class="item-card" id="task-${t.id}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
          <div style="font-weight:700;font-size:15px;">${t.name}</div>
          ${statusBadge}
        </div>

        <div style="font-size:13px;color:var(--muted);line-height:1.7;margin-bottom:12px;">
          <div>💰 <b style="color:var(--green)">${t.coin}</b> কয়েন</div>
          <div>⏱ টাইমার: ${t.timer || 15}s ${t.code ? "• কোড আছে" : ""}</div>
          ${t.cooldownHours ? `<div>🔄 কুলডাউন: ${t.cooldownHours} ঘণ্টা</div>` : ""}
          ${t.activeDays ? `<div>📅 অ্যাক্টিভ ডেজ: ${t.activeDays}</div>` : ""}
          <div>📊 সম্পন্ন: \( {t.completedCount || 0} \){t.limit ? " / " + t.limit : " / ∞"}</div>
          <div style="word-break:break-all;margin-top:4px;">
            🔗 <a href="\( {t.link}" target="_blank" style="color:var(--blue);"> \){t.link}</a>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <button class="btn-secondary" style="padding:10px;font-size:12px;"
            onclick="window.toggleStatus('\( {collectionName}', ' \){t.id}', '${t.status}')">
            ${t.status === "published" ? "⏸ পজ" : "▶ পাবলিশ"}
          </button>
          <button class="btn-secondary" style="padding:10px;font-size:12px;"
            onclick="window.editTask('\( {collectionName}', ' \){t.id}')">
            ✏️ এডিট
          </button>
          <button class="btn-danger" style="padding:10px;font-size:12px;grid-column:span 2;"
            onclick="window.deleteTask('\( {collectionName}', ' \){t.id}')">
            🗑 ডিলিট
          </button>
        </div>
      </div>
    `;
  });

  document.getElementById("app").innerHTML = `
    <div class="admin-page">
      <div style="margin-bottom:14px;">
        <button class="btn-secondary" style="width:auto;padding:10px 16px;font-size:13px;"
          onclick="window.backToAdminCategories()">
          ← সব ক্যাটাগরি
        </button>
      </div>

      <div class="admin-header" style="margin-bottom:16px;">
        <h1>${titleMap[cat]}</h1>
        <p>${tasks.length} টি টাস্ক • মোট কমপ্লিশন: ${totalCompleted}</p>
      </div>

      <div>
        ${html || `
          <div class="section-card" style="text-align:center;color:var(--muted);">
            এই ক্যাটাগরিতে কোনো টাস্ক নেই। ড্যাশবোর্ড থেকে তৈরি করুন।
          </div>
        `}
      </div>

      <div style="margin-top:18px;">
        <a href="index.html" class="btn-primary" style="display:block;text-align:center;text-decoration:none;">
          + নতুন টাস্ক তৈরি (ড্যাশবোর্ড)
        </a>
      </div>
    </div>
  `;
};

window.backToAdminCategories = function() {
  showCategoryList();
};

// ==================== ACTIONS ====================
window.toggleStatus = async function(col, taskId, currentStatus) {
  const newStatus = currentStatus === "published" ? "paused" : "published";
  try {
    await updateDoc(doc(db, col, taskId), { status: newStatus });
    tg.showAlert("টাস্ক " + (newStatus === "published" ? "পাবলিশ" : "পজ") + " হয়েছে");
    if (currentCategory) window.openAdminCategory(currentCategory);
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
    if (currentCategory) window.openAdminCategory(currentCategory);
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

window.deleteTask = async function(col, taskId) {
  if (!confirm("এই টাস্ক পার্মানেন্টলি ডিলিট করবেন?")) return;
  try {
    await deleteDoc(doc(db, col, taskId));
    tg.showAlert("টাস্ক ডিলিট হয়েছে");
    if (currentCategory) window.openAdminCategory(currentCategory);
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

// Init
showCategoryList().catch(err => console.error(err));
