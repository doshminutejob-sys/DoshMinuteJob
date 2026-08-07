import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
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

async function loadLists() {
  await checkAdmin();

  const listsSnap = await getDocs(collection(db, "task_lists"));
  const lists = [];

  for (const d of listsSnap.docs) {
    const listData = d.data();

    // Get tasks of this list
    const tasksQ = query(
      collection(db, "task_list_tasks"),
      where("listId", "==", d.id)
    );
    const tasksSnap = await getDocs(tasksQ);
    const tasks = [];
    tasksSnap.forEach(t => {
      tasks.push({ id: t.id, ...t.data() });
    });

    // Sort by order
    tasks.sort((a, b) => (a.order || 0) - (b.order || 0));

    lists.push({
      id: d.id,
      ...listData,
      tasks
    });
  }

  // Newest list first
  lists.sort((a, b) => {
    const ta = a.createdAt?.toDate?.()?.getTime() || 0;
    const tb = b.createdAt?.toDate?.()?.getTime() || 0;
    return tb - ta;
  });

  let html = "";

  lists.forEach(list => {
    let tasksHtml = "";

    list.tasks.forEach((t, index) => {
      tasksHtml += `
        <div style="background:var(--card2);border-radius:12px;padding:12px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <div style="font-weight:600;font-size:14px;">
              ${index + 1}. ${t.name}
            </div>
            <span style="font-size:12px;color:var(--green);">${t.coin} কয়েন</span>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:8px;word-break:break-all;">
            ${t.link}
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn-secondary" style="padding:7px 10px;font-size:11px;width:auto;"
              onclick="window.moveTask('\( {list.id}', ' \){t.id}', ${t.order}, 'up')">↑</button>
            <button class="btn-secondary" style="padding:7px 10px;font-size:11px;width:auto;"
              onclick="window.moveTask('\( {list.id}', ' \){t.id}', ${t.order}, 'down')">↓</button>
            <button class="btn-danger" style="padding:7px 10px;font-size:11px;width:auto;margin-left:auto;"
              onclick="window.deleteListTask('\( {t.id}', ' \){list.id}')">🗑</button>
          </div>
        </div>
      `;
    });

    html += `
      <div class="item-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
          <div>
            <div style="font-weight:700;font-size:16px;">📜 ${list.name}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px;">
              কুলডাউন: ${list.cooldownHours || 0} ঘণ্টা • টাস্ক: ${list.tasks.length}টি
            </div>
          </div>
          <span class="badge ${list.status === 'published' ? 'badge-active' : 'badge-pending'}">
            ${list.status === 'published' ? 'Published' : 'Paused'}
          </span>
        </div>

        <div style="margin-bottom:12px;">
          ${tasksHtml || `<div style="font-size:13px;color:var(--muted);text-align:center;padding:10px;">এই লিস্টে এখনো কোনো টাস্ক নেই</div>`}
        </div>

        <!-- Add Task to this List -->
        <div style="background:rgba(0,229,160,0.06);border:1px dashed var(--border);border-radius:12px;padding:12px;margin-bottom:12px;">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">+ এই লিস্টে নতুন টাস্ক যোগ করুন</div>
          <input id="name-${list.id}" placeholder="টাস্কের নাম" style="margin-bottom:6px;">
          <input id="link-${list.id}" placeholder="টাস্ক লিংক" style="margin-bottom:6px;">
          <input id="coin-${list.id}" type="number" placeholder="কয়েন" style="margin-bottom:6px;">
          <input id="code-${list.id}" placeholder="কোড (ঐচ্ছিক)" style="margin-bottom:6px;">
          <input id="timer-${list.id}" type="number" placeholder="টাইমার (সেকেন্ড)" value="15" style="margin-bottom:8px;">
          <button class="btn-primary" style="padding:10px;font-size:13px;"
            onclick="window.addTaskToList('${list.id}', ${list.tasks.length})">
            টাস্ক যোগ করুন
          </button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <button class="btn-secondary" style="padding:10px;font-size:12px;"
            onclick="window.toggleListStatus('\( {list.id}', ' \){list.status}')">
            ${list.status === 'published' ? '⏸ পজ' : '▶ পাবলিশ'}
          </button>
          <button class="btn-danger" style="padding:10px;font-size:12px;"
            onclick="window.deleteList('${list.id}')">
            🗑 লিস্ট ডিলিট
          </button>
        </div>
      </div>
    `;
  });

  document.getElementById("app").innerHTML = `
    <div class="admin-page">
      <div class="admin-header">
        <h1>📜 Sequential Task Lists</h1>
        <p>Category C — লিস্ট ও টাস্ক ম্যানেজ করুন</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">মোট লিস্ট</div>
          <div class="stat-value">${lists.length}</div>
        </div>
      </div>

      <div style="margin-bottom:14px;">
        <a href="index.html" class="btn-primary" style="display:block;text-align:center;text-decoration:none;">
          + নতুন লিস্ট তৈরি (ড্যাশবোর্ড থেকে)
        </a>
      </div>

      <div>
        ${html || `
          <div class="section-card" style="text-align:center;color:var(--muted);">
            এখনো কোনো Sequential লিস্ট নেই।<br>
            ড্যাশবোর্ড থেকে নতুন লিস্ট তৈরি করুন।
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

// ===== Actions =====

window.addTaskToList = async function(listId, currentCount) {
  const name = document.getElementById(`name-${listId}`).value.trim();
  const link = document.getElementById(`link-${listId}`).value.trim();
  const coin = Number(document.getElementById(`coin-${listId}`).value);
  const code = document.getElementById(`code-${listId}`).value.trim();
  const timer = Number(document.getElementById(`timer-${listId}`).value) || 15;

  if (!name || !link || !coin) {
    return tg.showAlert("নাম, লিংক ও কয়েন আবশ্যক");
  }

  try {
    await addDoc(collection(db, "task_list_tasks"), {
      listId,
      name,
      link,
      coin,
      code: code || "",
      timer,
      order: currentCount + 1,
      createdAt: serverTimestamp()
    });

    // Update task count
    await updateDoc(doc(db, "task_lists", listId), {
      taskCount: increment(1)
    });

    tg.showAlert("✅ টাস্ক লিস্টে যোগ হয়েছে");
    loadLists();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

window.deleteListTask = async function(taskId, listId) {
  if (!confirm("এই টাস্ক ডিলিট করবেন?")) return;

  try {
    await deleteDoc(doc(db, "task_list_tasks", taskId));
    await updateDoc(doc(db, "task_lists", listId), {
      taskCount: increment(-1)
    });
    tg.showAlert("টাস্ক ডিলিট হয়েছে");
    loadLists();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

window.moveTask = async function(listId, taskId, currentOrder, direction) {
  // Simple reorder: swap with neighbor
  const q = query(
    collection(db, "task_list_tasks"),
    where("listId", "==", listId)
  );
  const snap = await getDocs(q);
  const tasks = [];
  snap.forEach(d => tasks.push({ id: d.id, ...d.data() }));
  tasks.sort((a, b) => (a.order || 0) - (b.order || 0));

  const index = tasks.findIndex(t => t.id === taskId);
  if (index === -1) return;

  let swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= tasks.length) return;

  const other = tasks[swapIndex];

  try {
    await updateDoc(doc(db, "task_list_tasks", taskId), { order: other.order });
    await updateDoc(doc(db, "task_list_tasks", other.id), { order: currentOrder });
    loadLists();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

window.toggleListStatus = async function(listId, currentStatus) {
  const newStatus = currentStatus === "published" ? "paused" : "published";
  try {
    await updateDoc(doc(db, "task_lists", listId), { status: newStatus });
    tg.showAlert("লিস্ট " + (newStatus === "published" ? "পাবলিশ" : "পজ") + " হয়েছে");
    loadLists();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

window.deleteList = async function(listId) {
  if (!confirm("এই পুরো লিস্ট এবং এর সব টাস্ক ডিলিট করবেন?")) return;

  try {
    // Delete all tasks of this list
    const q = query(collection(db, "task_list_tasks"), where("listId", "==", listId));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      await deleteDoc(doc(db, "task_list_tasks", d.id));
    }

    await deleteDoc(doc(db, "task_lists", listId));
    tg.showAlert("লিস্ট ডিলিট হয়েছে");
    loadLists();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

loadLists().catch(err => console.error(err));
