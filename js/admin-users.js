import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const tg = window.Telegram?.WebApp;
const app = document.getElementById("app");

if (!tg || !tg.initDataUnsafe?.user) {
  app.innerHTML = `<div class="loader-box"><h1>⛔ Telegram থেকে খুলুন</h1></div>`;
  throw new Error("Telegram Required");
}

tg.ready();
tg.expand();
tg.setHeaderColor("#0B1220");
tg.setBackgroundColor("#0B1220");

const adminUser = tg.initDataUnsafe.user;

async function loadUsers() {
  try {
    // Admin check
    const adminSnap = await getDoc(doc(db, "users", String(adminUser.id)));
    if (!adminSnap.exists() || adminSnap.data().role !== "admin") {
      app.innerHTML = `
        <div class="loader-box">
          <div class="logo-circle">⛔</div>
          <h1>অ্যাক্সেস ডিনাইড</h1>
          <p>আপনি অ্যাডমিন নন</p>
        </div>
      `;
      return;
    }

    const snap = await getDocs(collection(db, "users"));
    const users = [];
    snap.forEach(d => users.push({ id: d.id, ...d.data() }));
    users.sort((a, b) => Number(b.coin || 0) - Number(a.coin || 0));

    let html = "";

    users.forEach(u => {
      const name = u.firstName || "User";
      const uname = u.username || "—";
      const tid = u.telegramId || u.id;
      const coin = Number(u.coin || 0).toLocaleString();
      const refs = (u.referrals || 0) + " (Active: " + (u.activeReferrals || 0) + ")";
      const country = u.country || "Unknown";

      let roleBadge = '<span class="badge">User</span>';
      if (u.role === "admin") roleBadge = '<span class="badge badge-active">Admin</span>';
      if (u.role === "partner") roleBadge = '<span class="badge badge-pending">Partner</span>';

      let statusBadge = '<span class="badge badge-pending">Inactive</span>';
      if (u.isBanned) statusBadge = '<span class="badge badge-rejected">Banned</span>';
      else if (u.status === "Active") statusBadge = '<span class="badge badge-active">Active</span>';

      let fb = "";
      if (u.facebookLink) {
        fb = '<br>📘 <a href="' + u.facebookLink + '" target="_blank" style="color:var(--green);">Facebook</a>';
      }

      let partnerBtn = "";
      if (u.role === "partner") {
        partnerBtn = '<button class="btn-secondary" style="padding:10px;font-size:12px;" onclick="window.removePartner(\'' + u.id + '\')">Partner সরান</button>';
      } else if (u.role !== "admin") {
        partnerBtn = '<button class="btn-primary" style="padding:10px;font-size:12px;" onclick="window.makePartner(\'' + u.id + '\')">👑 Partner</button>';
      } else {
        partnerBtn = '<button class="btn-secondary" style="padding:10px;font-size:12px;" disabled>Admin</button>';
      }

      let banBtn = "";
      if (!u.isBanned) {
        banBtn = '<button class="btn-danger" style="padding:10px;font-size:12px;grid-column:span 2;" onclick="window.banUser(\'' + u.id + '\')">🚫 ব্যান</button>';
      } else {
        banBtn = '<button class="btn-secondary" style="padding:10px;font-size:12px;grid-column:span 2;" onclick="window.unbanUser(\'' + u.id + '\')">আনব্যান</button>';
      }

      html += '<div class="item-card">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">' +
          '<div>' +
            '<div style="font-weight:700;">👤 ' + name + '</div>' +
            '<div style="font-size:12px;color:var(--muted);">@' + uname + ' • ' + tid + '</div>' +
          '</div>' +
          '<div style="text-align:right;">' + roleBadge + '<br>' + statusBadge + '</div>' +
        '</div>' +
        '<div style="font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:10px;">' +
          '💰 ' + coin + ' কয়েন<br>' +
          '👥 রেফার: ' + refs + '<br>' +
          '📍 ' + country + fb +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
          '<button class="btn-secondary" style="padding:10px;font-size:12px;" onclick="window.addCoin(\'' + u.id + '\')">+ কয়েন</button>' +
          partnerBtn +
          banBtn +
        '</div>' +
      '</div>';
    });

    app.innerHTML =
      '<div class="admin-page">' +
        '<div class="admin-header">' +
          '<h1>👥 ইউজারস</h1>' +
          '<p>মোট ' + users.length + ' জন</p>' +
        '</div>' +
        '<div class="section-card">' +
          '<input id="searchUser" placeholder="সার্চ: নাম / ID / username">' +
        '</div>' +
        '<div id="usersList">' +
          (html || '<div class="section-card">কোনো ইউজার নেই</div>') +
        '</div>' +
        '<div style="margin-top:18px;">' +
          '<a href="index.html" class="btn-secondary" style="display:block;text-align:center;text-decoration:none;">← ড্যাশবোর্ড</a>' +
        '</div>' +
      '</div>';

    const search = document.getElementById("searchUser");
    if (search) {
      search.oninput = function () {
        const q = (this.value || "").toLowerCase();
        document.querySelectorAll("#usersList .item-card").forEach(function (card) {
          card.style.display = card.innerText.toLowerCase().includes(q) ? "block" : "none";
        });
      };
    }

  } catch (err) {
    console.error(err);
    app.innerHTML =
      '<div class="loader-box">' +
        '<h1>সমস্যা হয়েছে</h1>' +
        '<p class="error">' + err.message + '</p>' +
        '<br><button class="btn-primary" onclick="location.reload()">আবার চেষ্টা</button>' +
      '</div>';
  }
}

window.makePartner = async function (uid) {
  if (!confirm("Partner বানাবেন? (অ্যাডমিন এক্সেস পাবে না)")) return;
  try {
    await updateDoc(doc(db, "users", uid), { role: "partner" });
    tg.showAlert("👑 Partner হয়েছে");
    loadUsers();
  } catch (e) {
    tg.showAlert(e.message);
  }
};

window.removePartner = async function (uid) {
  if (!confirm("Partner রোল সরাবেন?")) return;
  try {
    await updateDoc(doc(db, "users", uid), { role: "user" });
    tg.showAlert("Partner সরানো হয়েছে");
    loadUsers();
  } catch (e) {
    tg.showAlert(e.message);
  }
};

window.addCoin = async function (uid) {
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

window.banUser = async function (uid) {
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

window.unbanUser = async function (uid) {
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

loadUsers();
