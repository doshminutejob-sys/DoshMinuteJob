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
    const data = d.data();
    userClaims[data.taskId] = data;
  });
}

function isInCooldown(claim, hours) {
  if (!claim || !claim.claimedAt || !hours) return false;
  const claimed = claim.claimedAt.toDate().getTime();
  const ms = hours * 60 * 60 * 1000;
  return Date.now() - claimed < ms;
}

function remainingTime(claim, hours) {
  const claimed = claim.claimedAt.toDate().getTime();
  const ms = hours * 60 * 60 * 1000;
  const left = ms - (Date.now() - claimed);
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  return h + "ঘ " + m + "মি";
}

async function loadTasks() {
  await getUser();
  if (!userData) return;

  await loadClaims();

  const [permSnap, coolSnap, tempSnap, listsSnap] = await Promise.all([
    getDocs(collection(db, "tasks_permanent")),
    getDocs(collection(db, "tasks_cooldown")),
    getDocs(collection(db, "tasks_temporary")),
    getDocs(collection(db, "task_lists"))
  ]);

  let permanentHtml = "";
  let cooldownHtml = "";
  let temporaryHtml = "";
  let sequentialHtml = "";

  const now = Date.now();

  // ===== A. Permanent =====
  permSnap.forEach(d => {
    const t = d.data();
    if (t.status !== "published") return;

    const claimed = userClaims[d.id];
    let action = "";

    if (userData.status !== "Active") {
      action = `<button class="btn" disabled style="opacity:0.5">আগে অ্যাকাউন্ট এক্টিভ করুন</button>`;
    } else if (claimed) {
      action = `<button class="btn" disabled style="opacity:0.6">✅ সম্পন্ন হয়েছে</button>`;
    } else {
      action = renderActionButtons(d.id, t, "permanent");
    }

    permanentHtml += taskCard(t, action, "একবারের টাস্ক");
  });

  // ===== B. Independent Cooldown =====
  coolSnap.forEach(d => {
    const t = d.data();
    if (t.status !== "published") return;

    const claimed = userClaims[d.id];
    const cd = t.cooldownHours || 0;
    let action = "";

    if (userData.status !== "Active") {
      action = `<button class="btn" disabled style="opacity:0.5">আগে অ্যাকাউন্ট এক্টিভ করুন</button>`;
    } else if (claimed && isInCooldown(claimed, cd)) {
      action = `<button class="btn" disabled style="opacity:0.6">⏳ ${remainingTime(claimed, cd)}</button>`;
    } else {
      action = renderActionButtons(d.id, t, "cooldown");
    }

    cooldownHtml += taskCard(t, action, "কুলডাউন " + cd + " ঘণ্টা");
  });

  // ===== D. Temporary =====
  tempSnap.forEach(d => {
    const t = d.data();
    if (t.status !== "published") return;

    if (t.activeDays && t.createdAt?.toDate) {
      const expire = t.createdAt.toDate().getTime() + (t.activeDays * 86400000);
      if (now > expire) return;
    }

    const claimed = userClaims[d.id];
    const cd = t.cooldownHours || 0;
    let action = "";

    if (userData.status !== "Active") {
      action = `<button class="btn" disabled style="opacity:0.5">আগে অ্যাকাউন্ট এক্টিভ করুন</button>`;
    } else if (claimed && isInCooldown(claimed, cd)) {
      action = `<button class="btn" disabled style="opacity:0.6">⏳ ${remainingTime(claimed, cd)}</button>`;
    } else {
      action = renderActionButtons(d.id, t, "temporary");
    }

    temporaryHtml += taskCard(t, action, "মেয়াদ " + (t.activeDays || "∞") + " দিন");
  });

  // ===== C. Sequential Lists =====
  for (const listDoc of listsSnap.docs) {
    const list = listDoc.data();
    if (list.status !== "published") continue;

    // Get all tasks of this list ordered
    const tasksQ = query(
      collection(db, "task_list_tasks"),
      where("listId", "==", listDoc.id)
    );
    const tasksSnap = await getDocs(tasksQ);
    const listTasks = [];
    tasksSnap.forEach(t => listTasks.push({ id: t.id, ...t.data() }));
    listTasks.sort((a, b) => (a.order || 0) - (b.order || 0));

    if (listTasks.length === 0) continue;

    // Find which task the user should see next
    // Logic: Find the first task that is either never claimed or cooldown expired
    let currentTask = null;
    let currentIndex = 0;

    for (let i = 0; i < listTasks.length; i++) {
      const t = listTasks[i];
      const claim = userClaims[t.id];
      const cd = list.cooldownHours || 0;

      if (!claim) {
        currentTask = t;
        currentIndex = i;
        break;
      }

      if (cd > 0 && !isInCooldown(claim, cd)) {
        // Cooldown finished → cycle back or continue
        // For sequential: after finishing all, start from beginning after cooldown of last task
        currentTask = t;
        currentIndex = i;
        break;
      }
    }

    // If all tasks are in cooldown, show the one with earliest remaining time
    if (!currentTask) {
      // Find the claim that will expire soonest
      let soonest = null;
      let soonestTask = null;
      listTasks.forEach(t => {
        const claim = userClaims[t.id];
        if (claim && claim.claimedAt) {
          const expireAt = claim.claimedAt.toDate().getTime() + ((list.cooldownHours || 0) * 3600000);
          if (!soonest || expireAt < soonest) {
            soonest = expireAt;
            soonestTask = t;
          }
        }
      });
      currentTask = soonestTask || listTasks[0];
    }

    if (!currentTask) continue;

    const claim = userClaims[currentTask.id];
    const cd = list.cooldownHours || 0;
    let action = "";

    if (userData.status !== "Active") {
      action = `<button class="btn" disabled style="opacity:0.5">আগে অ্যাকাউন্ট এক্টিভ করুন</button>`;
    } else if (claim && isInCooldown(claim, cd)) {
      action = `<button class="btn" disabled style="opacity:0.6">⏳ ${remainingTime(claim, cd)}</button>`;
    } else {
      action = renderActionButtons(currentTask.id, currentTask, "sequential");
    }

    sequentialHtml += `
      <div class="card" style="margin-bottom:12px;">
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">
          📜 লিস্ট: <b>${list.name}</b> • টাস্ক \( {currentIndex + 1}/ \){listTasks.length}
        </div>
        <div style="font-weight:700;font-size:15px;margin-bottom:6px;">${currentTask.name}</div>
        <div style="font-size:14px;margin-bottom:6px;">💰 <b style="color:var(--green)">${currentTask.coin}</b> কয়েন</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:12px;">
          কুলডাউন: ${cd} ঘণ্টা
        </div>
        ${action}
      </div>
    `;
  }

  // Render page
  document.getElementById("app").innerHTML = `
    <div class="page">
      <div class="hero" style="padding:16px;">
        <div style="font-size:20px;font-weight:800;margin-bottom:4px;">📋 টাস্ক সমূহ</div>
        <div style="font-size:13px;color:var(--muted);">টাস্ক সম্পন্ন করে কয়েন আয় করুন</div>
      </div>

      ${userData.status !== "Active" ? `
        <div class="card warning-card">
          <div class="card-title">⚠️ অ্যাকাউন্ট এক্টিভ নয়</div>
          <p>টাস্ক করার আগে প্রোফাইল থেকে Facebook লিংক দিয়ে অ্যাকাউন্ট এক্টিভ করুন।</p>
          <button class="btn" onclick="location.href='profile.html'">প্রোফাইলে যান</button>
        </div>
      ` : ""}

      <div class="section-title">⭐ একবারের টাস্ক (Permanent)</div>
      <div>${permanentHtml || emptyCard("কোনো পার্মানেন্ট টাস্ক নেই")}</div>

      <div class="section-title">🔄 কুলডাউন টাস্ক</div>
      <div>${cooldownHtml || emptyCard("কোনো কুলডাউন টাস্ক নেই")}</div>

      <div class="section-title">📜 সিকোয়েন্সিয়াল লিস্ট</div>
      <div>${sequentialHtml || emptyCard("কোনো সিকোয়েন্সিয়াল লিস্ট নেই")}</div>

      <div class="section-title">⏳ সাময়িক টাস্ক</div>
      <div>${temporaryHtml || emptyCard("কোনো সাময়িক টাস্ক নেই")}</div>
    </div>
  `;
}

function taskCard(t, actionHtml, badge) {
  return `
    <div class="card" style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div style="font-weight:700;font-size:15px;">${t.name}</div>
        <span style="font-size:10px;background:rgba(0,229,160,0.12);color:var(--green);padding:3px 8px;border-radius:20px;">${badge}</span>
      </div>
      <div style="font-size:14px;margin-bottom:6px;">💰 <b style="color:var(--green)">${t.coin}</b> কয়েন</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:12px;">
        \( {t.completedCount || 0} \){t.limit ? " / " + t.limit : ""} জন সম্পন্ন করেছে
      </div>
      ${actionHtml}
    </div>
  `;
}

function emptyCard(msg) {
  return `<div class="card" style="text-align:center;color:var(--muted);font-size:13px;">${msg}</div>`;
}

function renderActionButtons(taskId, t, category) {
  if (t.code && t.code.trim()) {
    return `
      <button class="btn" onclick="window.openLink('${t.link}')">টাস্ক ওপেন করুন</button>
      <input type="text" id="code-${taskId}" placeholder="ভেরিফিকেশন কোড লিখুন" style="margin-top:10px;">
      <button class="btn" style="margin-top:8px;" onclick="window.submitCode('${taskId}', \( {t.coin}, ' \){t.code}', '${category}')">
        কোড সাবমিট ও ক্লেম
      </button>
    `;
  }

  const timer = t.timer || 15;
  return `
    <button class="btn" onclick="window.openLink('${t.link}')">টাস্ক ওপেন করুন</button>
    <button class="btn" id="claim-${taskId}" style="margin-top:8px;"
      onclick="window.startTimer('${taskId}', ${t.coin}, \( {timer}, ' \){category}')">
      টাইমার শুরু করুন (${timer}s)
    </button>
  `;
}

// ===== Global Actions =====
window.openLink = function(link) {
  if (link) window.open(link, "_blank");
};

window.startTimer = function(taskId, coin, seconds, category) {
  if (userData.status !== "Active") {
    return tg.showAlert("আগে অ্যাকাউন্ট এক্টিভ করুন");
  }

  const btn = document.getElementById("claim-" + taskId);
  if (!btn || btn.disabled) return;

  btn.disabled = true;
  let left = seconds;
  btn.innerText = "অপেক্ষা করুন " + left + "s...";

  const interval = setInterval(() => {
    left--;
    btn.innerText = "অপেক্ষা করুন " + left + "s...";
    if (left <= 0) clearInterval(interval);
  }, 1000);

  setTimeout(async () => {
    try {
      await claimTask(taskId, coin, category);
      tg.showAlert("✅ " + coin + " কয়েন যোগ হয়েছে!");
      loadTasks();
    } catch (e) {
      tg.showAlert("সমস্যা: " + e.message);
      btn.disabled = false;
      btn.innerText = "আবার চেষ্টা করুন";
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
    loadTasks();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

async function claimTask(taskId, coin, category) {
  // 1. Save claim
  await addDoc(collection(db, "task_claims"), {
    userId: String(user.id),
    taskId,
    coin,
    category,
    claimedAt: serverTimestamp()
  });

  // 2. Add coin to user
  await updateDoc(doc(db, "users", String(user.id)), {
    coin: increment(coin),
    totalEarned: increment(coin),
    lastActiveAt: serverTimestamp()
  });

  // 3. Update completed count (for non-sequential)
  if (category !== "sequential") {
    const collectionName = {
      permanent: "tasks_permanent",
      cooldown: "tasks_cooldown",
      temporary: "tasks_temporary"
    }[category];

    if (collectionName) {
      try {
        await updateDoc(doc(db, collectionName, taskId), {
          completedCount: increment(1)
        });
      } catch (e) {}
    }
  }

  // 4. Activate referral if pending + give reward
  await activateReferral();

  // 5. Give 5% bonus to referrer
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
    const referrerSnap = await getDoc(referrerRef);
    if (referrerSnap.exists()) {
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

// ===== 5% Referral Bonus =====
async function giveReferralBonus(earnedCoin) {
  // Find who referred this user
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
    const referrerSnap = await getDoc(referrerRef);
    if (referrerSnap.exists()) {
      await updateDoc(referrerRef, {
        coin: increment(bonus),
        totalEarned: increment(bonus),
        referralIncome: increment(bonus)
      });
    }
  }
}

// Extra CSS
const style = document.createElement("style");
style.textContent = `
  .section-title{
    font-size:15px;
    font-weight:700;
    margin:18px 0 10px;
    color:var(--text);
  }
`;
document.head.appendChild(style);

loadTasks().catch(err => {
  console.error(err);
  document.getElementById("app").innerHTML = `
    <div class="loader-box">
      <h2>সমস্যা হয়েছে</h2>
      <p class="error">${err.message}</p>
    </div>
  `;
});
