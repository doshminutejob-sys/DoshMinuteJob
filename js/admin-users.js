import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const tg = window.Telegram?.WebApp;

if (!tg || !tg.initDataUnsafe?.user) {
  document.getElementById("app").innerHTML = `
    <div class="loader-box"><h1>⛔ অ্যাক্সেস ডিনাইড</h1></div>
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

async function loadUsers() {
  await checkAdmin();

  const snap = await getDocs(collection(db, "users"));
  const users = [];
  snap.forEach(d => users.push({ id: d.id, ...d.data() }));
  users.sort((a, b) => Number(b.coin || 0) - Number(a.coin || 0));

  let html = "";
  users.forEach(u => {
    const roleBadge = u.role === "admin"
      ? `<span class="badge badge-active">Admin</span>`
      : u.role === "partner"
        ? `<span class="badge badge-pending">Partner</span>`
        : `<span class="badge">User</span>`;

    const statusBadge = u.isBanned
      ? `<span class="badge badge-rejected">Banned</span>`
      : u.status === "Active"
        ? `<span class="badge badge-active">Active</span>`
        : `<span class="badge badge-pending">Inactive</span>`;

    html += `
      <div class="item-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <div>
            <div style="font-weight:700;">👤 ${u.firstName || "User"}</div>
            <div style="font-size:12px;color:var(--muted);">@${u.username || "—"} • ${u.telegramId || u.id}</div>
          </div>
          <div style="text-align:right;">\( {roleBadge}<br> \){statusBadge}</div>
        </div>
        <div style="font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:10px;">
          💰 ${Number(u.coin || 0).toLocaleString()} কয়েন<br>
          👥 রেফার: ${u.referrals || 0} (Active: ${u.activeReferrals || 0})<br>
          📍 ${u.country || "Unknown"}
          \( {u.facebookLink ? `<br>📘 <a href=" \){u.facebookLink}" target="_blank" style="color:var(--green);">Facebook</a>` : ""}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <button class="btn-secondary" style="padding:10px;font-size:12px;" onclick="window.addCoin('${u.id}')">+ কয়েন</button>
          ${u.role === "partner"
            ? `<button class="btn-secondary" style="padding:10px;font-size:12px;" onclick="window.removePartner('${u.id}')">Partner সরান</button>`
            : u.role !== "admin"
              ? `<button class="btn-primary" style="padding:10px;font-size:12px;" onclick="window.makePartner('${u.id}')">👑 Partner</button>`
              : `<button class="btn-secondary" style="padding:10px;font-size:12px;" disabled>Admin</button>`
          }
          ${!u.isBanned
            ? `<button class="btn-danger" style="padding:10px;font-size:12px;grid-column:span 2;" onclick="window.banUser('${u.id}')">🚫 ব্যান</button>`
            : `<button class="btn-secondary" style="padding:10px;font-size:12px;grid-column:span 2;" onclick="window.unbanUser('${u.id}')">আনব্যান</button>`
          }
        </div>
      </div>
    `;
  });

  document.getElementById("app").innerHTML = `
    <div class="admin-page">
      <div class="admin-header">
        <h1>👥 ইউজারস</h1>
        <p>মোট ${users.length} জন</p>
      </div>
      <div class="section-card">
        <input id="searchUser" placeholder="সার্চ: নাম / ID / username" oninput="window.filterUsers()">
      </div>
      <div id="usersList">${html || `<div class="section-card">কোনো ইউজার নেই</div>`}</div>
      <div style="margin-top:18px;">
        <a href="index.html" class="btn-secondary" style="display:block;text-align:center;text-decoration:none;">← ড্যাশবোর্ড</a>
      </div>
    </div>
  `;

  window._allUsersHtml = html;
}

window.filterUsers = function() {
  const q = (document.getElementById("searchUser")?.value || "").toLowerCase();
  const cards = document.querySelectorAll("#usersList .item-card");
  cards.forEach(card => {
    card.style.display = card.innerText.toLowerCase().includes(q) ? "block" : "none";
  });
};

window.makePartner = async function(uid) {
  if (!confirm("এই ইউজারকে Partner বানাবেন?\n(অ্যাডমিন এক্সেস পাবে না)")) return;
  try {
    await updateDoc(doc(db, "users", uid), { role: "partner" });
    tg.showAlert("👑 Partner বানানো হয়েছে");
    loadUsers();
  } catch (e) {
    tg.showAlert(e.message);
  }
};

window.removePartner = async function(uid) {
  if (!confirm("Partner রোল সরাবেন?")) return;
  try {
    await updateDoc(doc(db, "users", uid), { role: "user" });
    tg.showAlert("Partner সরানো হয়েছে");
    loadUsers();
  } catch (e) {
    tg.showAlert(e.message);
  }
};

window.addCoin = async function(uid) {
  const amount = prompt("কত কয়েন যোগ করবেন?");
  if (!amount || isNaN(amount) || Number(amount) <= 0) return;
  try {
    await updateDoc(doc(db, "users", uid), {
      coin: increment(Number(amount)),
      totalEarned: increment(Number(amount))
    });
    tg.showAlert("কয়েন যোগ হয়েছে");
    loadUsers();
  } catch (e) {
    tg.showAlert(e.message);
  }
};

window.banUser = async function(uid) {
  if (!confirm("ব্যান করবেন?")) return;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const data = snap.data() || {};
    await updateDoc(doc(db, "users", uid), {
      isBanned: true,
      status: "Banned",
      banDeviceHash: data.deviceHash || ""
    });
    tg.showAlert("ব্যান হয়েছে");
    loadUsers();
  } catch (e) {
    tg.showAlert(e.message);
  }
};

window.unbanUser = async function(uid) {
  if (!confirm("আনব্যান?")) return;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const data = snap.data() || {};
    await updateDoc(doc(db, "users", uid), {
      isBanned: false,
      status: data.facebookLink ? "Active" : "Inactive",
      banDeviceHash: ""
    });
    tg.showAlert("আনব্যান হয়েছে");
    loadUsers();
  } catch (e) {
    tg.showAlert(e.message);
  }
};

loadUsers().catch(err => console.error(err));
