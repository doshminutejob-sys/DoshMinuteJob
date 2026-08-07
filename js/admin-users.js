import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
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
let allUsers = [];

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

async function loadUsers() {
  await checkAdmin();

  const snap = await getDocs(collection(db, "users"));
  allUsers = [];
  snap.forEach(d => {
    allUsers.push({ id: d.id, ...d.data() });
  });

  // Highest coin first
  allUsers.sort((a, b) => (b.coin || 0) - (a.coin || 0));

  renderUsers(allUsers);
}

function renderUsers(list) {
  let active = 0, inactive = 0, banned = 0;

  list.forEach(u => {
    if (u.isBanned) banned++;
    else if (u.status === "Active") active++;
    else inactive++;
  });

  let html = "";

  list.forEach(u => {
    let badge = "";
    if (u.isBanned) {
      badge = `<span class="badge badge-rejected">Banned</span>`;
    } else if (u.status === "Active") {
      badge = `<span class="badge badge-active">Active</span>`;
    } else {
      badge = `<span class="badge badge-pending">Inactive</span>`;
    }

    html += `
      <div class="item-card" id="user-${u.id}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
          <div>
            <div style="font-weight:700;font-size:15px;margin-bottom:3px;">
              👤 ${u.firstName || "User"} ${u.lastName || ""}
            </div>
            <div style="font-size:12px;color:var(--muted);">
              @${u.username || "—"} • ID: ${u.telegramId}
            </div>
          </div>
          ${badge}
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:13px;margin-bottom:12px;">
          <div>💰 কয়েন: <b>${Number(u.coin || 0).toLocaleString()}</b></div>
          <div>📈 আয়: <b>${Number(u.totalEarned || 0).toLocaleString()}</b></div>
          <div>👥 একটিভ রেফ: <b>${u.activeReferrals || 0}</b></div>
          <div>🔗 মোট রেফ: <b>${u.referrals || 0}</b></div>
        </div>

        ${u.facebookLink ? `
          <div style="font-size:12px;margin-bottom:8px;">
            <a href="${u.facebookLink}" target="_blank" style="color:var(--green);text-decoration:none;">
              📘 Facebook Profile
            </a>
          </div>
        ` : ""}

        ${u.paymentMethod ? `
          <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">
            💳 ${u.paymentMethod}: ${u.paymentNumber || "—"}
          </div>
        ` : ""}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <button class="btn-secondary" style="padding:10px;font-size:12px;" onclick="window.addCoin('${u.id}')">
            + কয়েন অ্যাড
          </button>
          <button class="btn-secondary" style="padding:10px;font-size:12px;" onclick="window.removeCoin('${u.id}')">
            − কয়েন রিমুভ
          </button>
          <button class="btn-secondary" style="padding:10px;font-size:12px;" onclick="window.toggleBan('${u.id}', ${!!u.isBanned})">
            ${u.isBanned ? "আনব্যান" : "ব্যান"}
          </button>
          <button class="btn-danger" style="padding:10px;font-size:12px;" onclick="window.deleteUser('${u.id}')">
            ডিলিট
          </button>
        </div>
      </div>
    `;
  });

  document.getElementById("app").innerHTML = `
    <div class="admin-page">
      <div class="admin-header">
        <h1>👥 ইউজার ম্যানেজমেন্ট</h1>
        <p>মোট ${list.length} জন ইউজার</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Active</div>
          <div class="stat-value green">${active}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Inactive</div>
          <div class="stat-value yellow">${inactive}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Banned</div>
          <div class="stat-value red">${banned}</div>
        </div>
      </div>

      <div style="margin-bottom:14px;">
        <input id="searchInput" placeholder="Telegram ID বা Username দিয়ে সার্চ..." style="margin:0;">
      </div>

      <div id="usersList">
        ${html || `<div class="section-card" style="text-align:center;color:var(--muted);">কোনো ইউজার পাওয়া যায়নি</div>`}
      </div>

      <div style="margin-top:18px;">
        <a href="index.html" class="btn-secondary" style="display:block;text-align:center;text-decoration:none;">
          ← ড্যাশবোর্ডে ফিরে যান
        </a>
      </div>
    </div>
  `;

  document.getElementById("searchInput").oninput = (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) {
      renderUsers(allUsers);
      return;
    }
    const filtered = allUsers.filter(u =>
      String(u.telegramId).includes(q) ||
      (u.username || "").toLowerCase().includes(q) ||
      (u.firstName || "").toLowerCase().includes(q)
    );
    renderUsers(filtered);
  };
}

// ===== Actions =====
window.addCoin = async function(uid) {
  const amount = prompt("কত কয়েন অ্যাড করবেন?");
  if (!amount || isNaN(amount) || Number(amount) <= 0) return;

  try {
    await updateDoc(doc(db, "users", uid), {
      coin: increment(Number(amount)),
      totalEarned: increment(Number(amount))
    });
    tg.showAlert("+" + amount + " কয়েন অ্যাড হয়েছে");
    loadUsers();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

window.removeCoin = async function(uid) {
  const amount = prompt("কত কয়েন রিমুভ করবেন?");
  if (!amount || isNaN(amount) || Number(amount) <= 0) return;

  try {
    await updateDoc(doc(db, "users", uid), {
      coin: increment(-Number(amount))
    });
    tg.showAlert("-" + amount + " কয়েন রিমুভ হয়েছে");
    loadUsers();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

window.toggleBan = async function(uid, currentlyBanned) {
  const action = currentlyBanned ? "আনব্যান" : "ব্যান";
  if (!confirm("আপনি কি এই ইউজারকে " + action + " করতে চান?")) return;

  try {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    const data = snap.data();

    if (currentlyBanned) {
      await updateDoc(userRef, {
        isBanned: false,
        status: data.facebookLink ? "Active" : "Inactive"
      });
      tg.showAlert("ইউজার আনব্যান হয়েছে");
    } else {
      await updateDoc(userRef, {
        isBanned: true,
        status: "Banned",
        banDeviceHash: data.deviceHash || ""
      });
      tg.showAlert("ইউজার ব্যান হয়েছে");
    }
    loadUsers();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

window.deleteUser = async function(uid) {
  if (!confirm("এই ইউজারকে পার্মানেন্টলি ডিলিট করবেন?\nএটি আর ফেরত আনা যাবে না।")) return;
  if (!confirm("শেষবার নিশ্চিত করুন — ডিলিট করবেন?")) return;

  try {
    await deleteDoc(doc(db, "users", uid));
    tg.showAlert("ইউজার ডিলিট হয়েছে");
    loadUsers();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

loadUsers().catch(err => console.error(err));
