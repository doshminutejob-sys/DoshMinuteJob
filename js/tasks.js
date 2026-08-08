import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  increment,
  serverTimestamp,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const tg = window.Telegram?.WebApp;

if (!tg || !tg.initDataUnsafe?.user) {
  location.href = "index.html";
  throw new Error("Telegram Required");
}

tg.ready();
tg.expand();
tg.setHeaderColor("#0B1220");
tg.setBackgroundColor("#0B1220");

const user = tg.initDataUnsafe.user;
let userData = null;
let userClaims = {};
let currentCategory = null;

async function getUser() {
  const snap = await getDoc(doc(db, "users", String(user.id)));
  if (!snap.exists()) {
    location.href = "index.html";
    return null;
  }
  userData = snap.data();

  if (userData.isBanned) {
    document.getElementById("app").innerHTML = `
      <div class="loader-box">
        <div class="logo-circle">🚫</div>
        <h1>অ্যাকাউন্ট ব্যান</h1>
        <p class="error">আপনার অ্যাকাউন্ট স্থগিত</p>
      </div>
    `;
    return null;
  }

  await updateDoc(doc(db, "users", String(user.id)), {
    lastActiveAt: serverTimestamp()
  });

  return userData;
}

async function loadClaims() {
  const q = query(
    collection(db, "task_claims"),
    where("userId", "==", String(user.id))
  );
  const snap = await getDocs(q);
  userClaims = {};
  snap.forEach(d => {
    userClaims[d.data().taskId] = d.data();
  });
}

function isInCooldown(claim, hours) {
  if (!claim || !claim.claimedAt || !hours) return false;
  const claimed = claim.claimedAt.toDate().getTime();
  return Date.now() - claimed < hours * 3600000;
}

function remainingTime(claim, hours) {
  const claimed = claim.claimedAt.toDate().getTime();
  const left = hours * 3600000 - (Date.now() - claimed);
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  return h + "ঘ " + m + "মি";
}

function emptyCard(msg) {
  return `<div class="card" style="text-align:center;color:var(--muted);font-size:13px;">${msg}</div>`;
}

function taskCard(t, actionHtml, badge) {
  const completed = t.completedCount || 0;
  const limitText = t.limit ? completed + " / " + t.limit : completed + "";

  return `
    <div class="card" style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div style="font-weight:700;font-size:15px;">${t.name}</div>
        <span style="font-size:10px;background:rgba(0,229,160,0.12);color:var(--green);padding:3px 8px;border-radius:20px;">${badge}</span>
      </div>
      <div style="font-size:14px;margin-bottom:6px;">💰 <b style="color:var(--green)">${t.coin}</b> কয়েন</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:12px;">
        ${limitText} জন সম্পন্ন
      </div>
      ${actionHtml}
    </div>
  `;
}

function renderActionButtons(taskId, t, category) {
  if (userData.status !== "Active") {
    return `<button class="btn" disabled style="opacity:0.5">আগে অ্যাকাউন্ট এক্টিভ করুন</button>`;
  }

  // যদি কোড থাকে
  if (t.code && t.code.trim()) {
    return `
      <button class="btn" onclick="window.openAndStart('\( {taskId}', ' \){t.link}', ${t.coin}, \( {t.timer || 15}, ' \){t.code}', '${category}')">
        টাস্ক ওপেন করুন
      </button>
      <div id="code-area-${taskId}" style="display:none;margin-top:10px;">
        <input type="text" id="code-${taskId}" placeholder="ভেরিফিকেশন কোড লিখুন">
        <button class="btn" style="margin-top:8px;" onclick="window.submitCode('${taskId}', \( {t.coin}, ' \){t.code}', '${category}')">
          কোড সাবমিট ও ক্লেম
        </button>
      </div>
    `;
  }

  // সাধারণ টাইমার টাস্ক
  const timer = t.timer || 15;
  return `
    <button class="btn" id="btn-${taskId}"
      onclick="window.openAndStart('\( {taskId}', ' \){t.link}', ${t.coin}, \( {timer}, '', ' \){category}')">
      টাস্ক ওপেন করুন
    </button>
  `;
}

// ==================== CATEGORY LIST ====================
function showCategoryList() {
  currentCategory = null;

  document.getElementById("app").innerHTML = `
    <div class="page">
      <div class="hero" style="padding:16px;">
        <div style="font-size:20px;font-weight:800;margin-bottom:4px;">📋 টাস্ক ক্যাটাগরি</div>
        <div style="font-size:13px;color:var(--muted);">ক্যাটাগরি সিলেক্ট করে টাস্ক দেখুন</div>
      </div>

      ${userData.status !== "Active" ? `
        <div class="card warning-card">
          <div class="card-title">⚠️ অ্যাকাউন্ট এক্টিভ নয়</div>
          <p>টাস্ক করার আগে প্রোফাইল থেকে Facebook লিংক দিয়ে এক্টিভ করুন।</p>
          <button class="btn" onclick="location.href='profile.html'">প্রোফাইলে যান</button>
        </div>
      ` : ""}

      <div class="card" style="cursor:pointer;" onclick="window.openCategory('permanent')">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="font-size:28px;">⭐</div>
          <div>
            <div style="font-weight:700;font-size:16px;">Permanent Tasks</div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px;">একবারের টাস্ক</div>
          </div>
        </div>
      </div>

      <div class="card" style="cursor:pointer;" onclick="window.openCategory('cooldown')">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="font-size:28px;">🔄</div>
          <div>
            <div style="font-weight:700;font-size:16px;">Cooldown Tasks</div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px;">আলাদা কুলডাউন</div>
          </div>
        </div>
      </div>

      <div class="card" style="cursor:pointer;" onclick="window.openCategory('sequential')">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="font-size:28px;">📜</div>
          <div>
            <div style="font-weight:700;font-size:16px;">Sequential Lists</div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px;">একটার পর একটা</div>
          </div>
        </div>
      </div>

      <div class="card" style="cursor:pointer;" onclick="window.openCategory('temporary')">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="font-size:28px;">⏳</div>
          <div>
            <div style="font-weight:700;font-size:16px;">Temporary Tasks</div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px;">মেয়াদোত্তীর্ণ</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.openCategory = async function(cat) {
  currentCategory = cat;
  await renderCategoryTasks(cat);
};

async function renderCategoryTasks(cat) {
  let title = "";
  let html = "";

  if (cat === "permanent") {
    title = "⭐ Permanent Tasks";
    const snap = await getDocs(collection(db, "tasks_permanent"));
    snap.forEach(d => {
      const t = d.data();
      if (t.status !== "published") return;
      const claimed = userClaims[d.id];
      let action = claimed
        ? `<button class="btn" disabled style="opacity:0.6">✅ সম্পন্ন হয়েছে</button>`
        : renderActionButtons(d.id, t, "permanent");
      html += taskCard(t, action, "একবারের");
    });
  }

  if (cat === "cooldown") {
    title = "🔄 Cooldown Tasks";
    const snap = await getDocs(collection(db, "tasks_cooldown"));
    snap.forEach(d => {
      const t = d.data();
      if (t.status !== "published") return;
      const claimed = userClaims[d.id];
      const cd = t.cooldownHours || 0;
      let action = "";
      if (claimed && isInCooldown(claimed, cd)) {
        action = `<button class="btn" disabled style="opacity:0.6">⏳ ${remainingTime(claimed, cd)}</button>`;
      } else {
        action = renderActionButtons(d.id, t, "cooldown");
      }
      html += taskCard(t, action, cd + " ঘণ্টা");
    });
  }

  if (cat === "temporary") {
    title = "⏳ Temporary Tasks";
    const snap = await getDocs(collection(db, "tasks_temporary"));
    const now = Date.now();
    snap.forEach(d => {
      const t = d.data();
      if (t.status !== "published") return;
      if (t.activeDays && t.createdAt?.toDate) {
        const expire = t.createdAt.toDate().getTime() + t.activeDays * 86400000;
        if (now > expire) return;
      }
      const claimed = userClaims[d.id];
      const cd = t.cooldownHours || 0;
      let action = "";
      if (claimed && isInCooldown(claimed, cd)) {
        action = `<button class="btn" disabled style="opacity:0.6">⏳ ${remainingTime(claimed, cd)}</button>`;
      } else {
        action = renderActionButtons(d.id, t, "temporary");
      }
      html += taskCard(t, action, (t.activeDays || "∞") + " দিন");
    });
  }

  if (cat === "sequential") {
    title = "📜 Sequential Lists";
    const listsSnap = await getDocs(collection(db, "task_lists"));

    for (const listDoc of listsSnap.docs) {
      const list = listDoc.data();
      if (list.status !== "published") continue;

      const tasksQ = query(collection(db, "task_list_tasks"), where("listId", "==", listDoc.id));
      const tasksSnap = await getDocs(tasksQ);
      const listTasks = [];
      tasksSnap.forEach(t => listTasks.push({ id: t.id, ...t.data() }));
      listTasks.sort((a, b) => (a.order || 0) - (b.order || 0));
      if (listTasks.length === 0) continue;

      let currentTask = null;
      let currentIndex = 0;
      for (let i = 0; i < listTasks.length; i++) {
        const t = listTasks[i];
        const claim = userClaims[t.id];
        const cd = list.cooldownHours || 0;
        if (!claim || !isInCooldown(claim, cd)) {
          currentTask = t;
          currentIndex = i;
          break;
        }
      }
      if (!currentTask) currentTask = listTasks[0];

      const claim = userClaims[currentTask.id];
      const cd = list.cooldownHours || 0;
      let action = "";
      if (claim && isInCooldown(claim, cd)) {
        action = `<button class="btn" disabled style="opacity:0.6">⏳ ${remainingTime(claim, cd)}</button>`;
      } else {
        action = renderActionButtons(currentTask.id, currentTask, "sequential");
      }

      html += `
        <div class="card" style="margin-bottom:12px;">
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">
            📜 ${list.name} • টাস্ক \( {currentIndex + 1}/ \){listTasks.length}
          </div>
          <div style="font-weight:700;font-size:15px;margin-bottom:6px;">${currentTask.name}</div>
          <div style="font-size:14px;margin-bottom:6px;">💰 <b style="color:var(--green)">${currentTask.coin}</b> কয়েন</div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:12px;">কুলডাউন: ${cd} ঘণ্টা</div>
          ${action}
        </div>
      `;
    }
  }

  document.getElementById("app").innerHTML = `
    <div class="page">
      <div style="margin-bottom:14px;">
        <button class="btn" style="width:auto;padding:10px 16px;font-size:13px;background:var(--card2);color:var(--text);border:1px solid var(--border);"
          onclick="window.backToCategories()">
          ← সব ক্যাটাগরি
        </button>
      </div>

      <div class="hero" style="padding:16px;margin-bottom:14px;">
        <div style="font-size:18px;font-weight:800;">${title}</div>
      </div>

      <div>
        ${html || emptyCard("এই ক্যাটাগরিতে এখনো কোনো টাস্ক নেই")}
      </div>
    </div>
  `;
}

window.backToCategories = function() {
  showCategoryList();
};

// ==================== NEW FLOW: Open + Auto Timer ====================
window.openAndStart = function(taskId, link, coin, seconds, code, category) {
  if (userData.status !== "Active") {
    return tg.showAlert("আগে অ্যাকাউন্ট এক্টিভ করুন");
  }

  // লিংক ওপেন করো
  if (link) {
    window.open(link, "_blank");
  }

  // যদি কোড থাকে → কোড ইনপুট দেখাও
  if (code && code.trim()) {
    const area = document.getElementById("code-area-" + taskId);
    if (area) area.style.display = "block";
    return;
  }

  // সাধারণ টাইমার টাস্ক
  const btn = document.getElementById("btn-" + taskId);
  if (!btn || btn.disabled) return;

  btn.disabled = true;
  let left = seconds;
  btn.innerText = "অপেক্ষা করুন " + left + "s...";

  const interval = setInterval(() => {
    left--;
    if (left > 0) {
      btn.innerText = "অপেক্ষা করুন " + left + "s...";
    } else {
      clearInterval(interval);
    }
  }, 1000);

  setTimeout(async () => {
    try {
      await claimTask(taskId, coin, category);
      tg.showAlert("✅ " + coin + " কয়েন যোগ হয়েছে!");
      if (currentCategory) {
        await loadClaims();
        renderCategoryTasks(currentCategory);
      }
    } catch (e) {
      tg.showAlert("সমস্যা: " + e.message);
      btn.disabled = false;
      btn.innerText = "টাস্ক ওপেন করুন";
    }
  }, seconds * 1000);
};

window.submitCode = async function(taskId, coin, correctCode, category) {
  if (userData.status !== "Active") {
    return tg.showAlert("আগে অ্যাকাউন্ট এক্টিভ করুন");
  }

  const input = document.getElementById("code-" + taskId);
  const code = (input?.value || "").trim();

  if (!code) return tg.showAlert("কোড লিখুন");
  if (code !== correctCode) return tg.showAlert("ভুল কোড!");

  try {
    await claimTask(taskId, coin, category);
    tg.showAlert("✅ " + coin + " কয়েন যোগ হয়েছে!");
    if (currentCategory) {
      await loadClaims();
      renderCategoryTasks(currentCategory);
    }
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

async function claimTask(taskId, coin, category) {
  // Already claimed check
  if (userClaims[taskId]) {
    throw new Error("এই টাস্ক ইতিমধ্যে সম্পন্ন হয়েছে");
  }

  await addDoc(collection(db, "task_claims"), {
    userId: String(user.id),
    taskId,
    coin,
    category,
    claimedAt: serverTimestamp()
  });

  await updateDoc(doc(db, "users", String(user.id)), {
    coin: increment(coin),
    totalEarned: increment(coin),
    lastActiveAt: serverTimestamp()
  });

  if (category !== "sequential") {
    const col = {
      permanent: "tasks_permanent",
      cooldown: "tasks_cooldown",
      temporary: "tasks_temporary"
    }[category];
    if (col) {
      try {
        await updateDoc(doc(db, col, taskId), { completedCount: increment(1) });
      } catch (e) {}
    }
  }

  await activateReferral();
  await giveReferralBonus(coin);
}

async function activateReferral() {
  const q = query(
    collection(db, "referral_history"),
    where("newUserId", "==", String(user.id)),
    where("status", "==", "pending")
  );
  const snap = await getDocs(q);

  for (const d of snap.docs) {
    const ref = d.data();
    await updateDoc(doc(db, "referral_history", d.id), {
      status: "active",
      activatedAt: serverTimestamp()
    });

    const settingsSnap = await getDoc(doc(db, "system_settings", "main"));
    const reward = settingsSnap.exists() ? (settingsSnap.data().activeReferralReward || 250) : 250;

    const referrerRef = doc(db, "users", ref.referrerId);
    if ((await getDoc(referrerRef)).exists()) {
      await updateDoc(referrerRef, {
        activeReferrals: increment(1),
        referrals: increment(1),
        coin: increment(reward),
        totalEarned: increment(reward),
        referralIncome: increment(reward)
      });
    }
  }
}

async function giveReferralBonus(earnedCoin) {
  const q = query(
    collection(db, "referral_history"),
    where("newUserId", "==", String(user.id)),
    where("status", "==", "active")
  );
  const snap = await getDocs(q);
  if (snap.empty) return;

  const settingsSnap = await getDoc(doc(db, "system_settings", "main"));
  const percent = settingsSnap.exists() ? (settingsSnap.data().referralBonusPercent || 5) : 5;
  const bonus = Math.floor(earnedCoin * (percent / 100));
  if (bonus <= 0) return;

  for (const d of snap.docs) {
    const ref = d.data();
    const referrerRef = doc(db, "users", ref.referrerId);
    if ((await getDoc(referrerRef)).exists()) {
      await updateDoc(referrerRef, {
        coin: increment(bonus),
        totalEarned: increment(bonus),
        referralIncome: increment(bonus)
      });
    }
  }
}

// ===== INIT =====
(async () => {
  await getUser();
  if (!userData) return;
  await loadClaims();
  showCategoryList();
})().catch(err => {
  console.error(err);
  document.getElementById("app").innerHTML = `
    <div class="loader-box">
      <h2>সমস্যা হয়েছে</h2>
      <p class="error">${err.message}</p>
    </div>
  `;
});
