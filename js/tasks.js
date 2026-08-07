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
  return `${h}ঘ ${m}মি`;
}

async function loadTasks() {
  await getUser();
  if (!userData) return;

  await loadClaims();

  // Load all task collections
  const [permSnap, coolSnap, tempSnap] = await Promise.all([
    getDocs(collection(db, "tasks_permanent")),
    getDocs(collection(db, "tasks_cooldown")),
    getDocs(collection(db, "tasks_temporary"))
  ]);

  let permanentHtml = "";
  let cooldownHtml = "";
  let temporaryHtml = "";

  const now = Date.now();

  // ===== Permanent Tasks =====
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
      action = renderActionButtons(d.id, t);
    }

    permanentHtml += taskCard(t, action, "একবারের টাস্ক");
  });

  // ===== Independent Cooldown Tasks =====
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
      action = renderActionButtons(d.id, t);
    }

    cooldownHtml += taskCard(t, action, `কুলডাউন ${cd} ঘণ্টা`);
  });

  // ===== Temporary Tasks =====
  tempSnap.forEach(d => {
    const t = d.data();
    if (t.status !== "published") return;

    // Check expiry
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
      action = renderActionButtons(d.id, t);
    }

    temporaryHtml += taskCard(t, action, `মেয়াদ ${t.activeDays || "∞"} দিন`);
  });

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
      <div id="permanentList">
        ${permanentHtml || emptyCard("কোনো পার্মানেন্ট টাস্ক নেই")}
      </div>

      <div class="section-title">🔄 কুলডাউন টাস্ক</div>
      <div id="cooldownList">
        ${cooldownHtml || emptyCard("কোনো কুলডাউন টাস্ক নেই")}
      </div>

      <div class="section-title">⏳ সাময়িক টাস্ক</div>
      <div id="temporaryList">
        ${temporaryHtml || emptyCard("কোনো সাময়িক টাস্ক নেই")}
      </div>
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

function renderActionButtons(taskId, t) {
  if (t.code && t.code.trim()) {
    return `
      <button class="btn" onclick="window.openLink('${t.link}')">টাস্ক ওপেন করুন</button>
      <input type="text" id="code-${taskId}" placeholder="ভেরিফিকেশন কোড লিখুন" style="margin-top:10px;">
      <button class="btn" style="margin-top:8px;" onclick="window.submitCode('${taskId}', \( {t.coin}, ' \){t.code}', '${t.category || "cooldown"}')">
        কোড সাবমিট ও ক্লেম
      </button>
    `;
  }

  const timer = t.timer || 15;
  return `
    <button class="btn" onclick="window.openLink('${t.link}')">টাস্ক ওপেন করুন</button>
    <button class="btn" id="claim-${taskId}" style="margin-top:8px;"
      onclick="window.startTimer('${taskId}', ${t.coin}, \( {timer}, ' \){t.category || "cooldown"}')">
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

  const btn = document.getElementById(`claim-${taskId}`);
  if (!btn || btn.disabled) return;

  btn.disabled = true;
  let left = seconds;
  btn.innerText = `অপেক্ষা করুন ${left}s...`;

  const interval = setInterval(() => {
    left--;
    btn.innerText = `অপেক্ষা করুন ${left}s...`;
    if (left <= 0) clearInterval(interval);
  }, 1000);

  setTimeout(async () => {
    try {
      await claimTask(taskId, coin, category);
      tg.showAlert(`✅ ${coin} কয়েন যোগ হয়েছে!`);
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

  const input = document.getElementById(`code-${taskId}`);
  const code = (input?.value || "").trim();

  if (!code) return tg.showAlert("কোড লিখুন");
  if (code !== correctCode) return tg.showAlert("ভুল কোড!");

  try {
    await claimTask(taskId, coin, category);
    tg.showAlert(`✅ ${coin} কয়েন যোগ হয়েছে!`);
    loadTasks();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

async function claimTask(taskId, coin, category) {
  // Save claim
  await addDoc(collection(db, "task_claims"), {
    userId: String(user.id),
    taskId,
    coin,
    category,
    claimedAt: serverTimestamp()
  });

  // Add coin to user
  await updateDoc(doc(db, "users", String(user.id)), {
    coin: increment(coin),
    totalEarned: increment(coin),
    lastActiveAt: serverTimestamp()
  });

  // Update task completed count
  const collectionName = {
    permanent: "tasks_permanent",
    cooldown: "tasks_cooldown",
    temporary: "tasks_temporary"
  }[category] || "tasks_cooldown";

  try {
    await updateDoc(doc(db, collectionName, taskId), {
      completedCount: increment(1)
    });
  } catch (e) {}

  // Activate referral if pending
  await activateReferral();
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

    // Give reward to referrer
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

// Extra CSS for section title
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
