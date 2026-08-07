import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc
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

async function loadSecurity() {
  await checkAdmin();

  const snap = await getDocs(collection(db, "users"));
  const users = [];
  snap.forEach(d => users.push({ id: d.id, ...d.data() }));

  // Maps for duplicates
  const fbMap = {};
  const deviceMap = {};
  const paymentMap = {};

  users.forEach(u => {
    if (u.facebookLink) {
      fbMap[u.facebookLink] = (fbMap[u.facebookLink] || 0) + 1;
    }
    if (u.deviceHash) {
      deviceMap[u.deviceHash] = (deviceMap[u.deviceHash] || 0) + 1;
    }
    if (u.paymentNumber) {
      paymentMap[u.paymentNumber] = (paymentMap[u.paymentNumber] || 0) + 1;
    }
  });

  let duplicateFB = 0;
  let duplicateDevice = 0;
  let duplicatePayment = 0;
  let suspiciousList = [];

  const seenFB = new Set();
  const seenDevice = new Set();
  const seenPayment = new Set();

  users.forEach(u => {
    const issues = [];

    if (u.facebookLink && fbMap[u.facebookLink] > 1) {
      issues.push("Duplicate Facebook");
      if (!seenFB.has(u.facebookLink)) {
        duplicateFB++;
        seenFB.add(u.facebookLink);
      }
    }

    if (u.deviceHash && deviceMap[u.deviceHash] > 1) {
      issues.push("Duplicate Device");
      if (!seenDevice.has(u.deviceHash)) {
        duplicateDevice++;
        seenDevice.add(u.deviceHash);
      }
    }

    if (u.paymentNumber && paymentMap[u.paymentNumber] > 1) {
      issues.push("Duplicate Payment");
      if (!seenPayment.has(u.paymentNumber)) {
        duplicatePayment++;
        seenPayment.add(u.paymentNumber);
      }
    }

    if (u.isBanned) {
      issues.push("Already Banned");
    }

    if (issues.length > 0) {
      suspiciousList.push({ ...u, issues });
    }
  });

  let html = "";

  suspiciousList.forEach(u => {
    html += `
      <div class="item-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
          <div>
            <div style="font-weight:700;font-size:15px;margin-bottom:3px;">
              👤 ${u.firstName || "User"} ${u.lastName || ""}
            </div>
            <div style="font-size:12px;color:var(--muted);">
              @${u.username || "—"} • ${u.telegramId}
            </div>
          </div>
          ${u.isBanned
            ? `<span class="badge badge-rejected">Banned</span>`
            : `<span class="badge badge-pending">Suspicious</span>`
          }
        </div>

        <div style="font-size:11px;margin-bottom:10px;">
          \( {u.issues.map(i => `<span class="badge badge-rejected" style="margin:2px 4px 2px 0;"> \){i}</span>`).join("")}
        </div>

        <div style="font-size:13px;line-height:1.6;color:var(--muted);margin-bottom:12px;">
          \( {u.facebookLink ? `<div>📘 <a href=" \){u.facebookLink}" target="_blank" style="color:var(--green);">${u.facebookLink}</a></div>` : ""}
          ${u.deviceHash ? `<div>📱 Device: ${u.deviceHash}</div>` : ""}
          ${u.paymentNumber ? `<div>💳 ${u.paymentMethod || ""}: ${u.paymentNumber}</div>` : ""}
          <div>💰 কয়েন: ${Number(u.coin || 0).toLocaleString()}</div>
        </div>

        ${!u.isBanned ? `
          <button class="btn-danger" style="padding:11px;font-size:13px;"
            onclick="window.banUser('${u.id}')">
            🚫 ইউজার ব্যান করুন
          </button>
        ` : `
          <button class="btn-secondary" style="padding:11px;font-size:13px;"
            onclick="window.unbanUser('${u.id}')">
            আনব্যান করুন
          </button>
        `}
      </div>
    `;
  });

  document.getElementById("app").innerHTML = `
    <div class="admin-page">
      <div class="admin-header">
        <h1>🛡 সিকিউরিটি সেন্টার</h1>
        <p>ফ্রড ও মাল্টি-অ্যাকাউন্ট ডিটেকশন</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">মোট ইউজার</div>
          <div class="stat-value">${users.length}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Duplicate FB</div>
          <div class="stat-value yellow">${duplicateFB}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Duplicate Device</div>
          <div class="stat-value yellow">${duplicateDevice}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Duplicate Payment</div>
          <div class="stat-value yellow">${duplicatePayment}</div>
        </div>
      </div>

      <div style="font-size:15px;font-weight:700;margin:8px 0 12px;">
        🚨 সন্দেহজনক অ্যাকাউন্ট (${suspiciousList.length})
      </div>

      <div id="securityList">
        ${html || `
          <div class="section-card" style="text-align:center;color:var(--muted);">
            ✅ কোনো সন্দেহজনক অ্যাকাউন্ট পাওয়া যায়নি
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

window.banUser = async function(uid) {
  if (!confirm("এই ইউজারকে ব্যান করবেন?\n\nডিভাইস হ্যাশ ফ্ল্যাগ করা হবে।")) return;

  try {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};

    await updateDoc(userRef, {
      isBanned: true,
      status: "Banned",
      banDeviceHash: data.deviceHash || ""
    });

    tg.showAlert("ইউজার ব্যান হয়েছে");
    loadSecurity();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

window.unbanUser = async function(uid) {
  if (!confirm("এই ইউজারকে আনব্যান করবেন?")) return;

  try {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};

    await updateDoc(userRef, {
      isBanned: false,
      status: data.facebookLink ? "Active" : "Inactive",
      banDeviceHash: ""
    });

    tg.showAlert("ইউজার আনব্যান হয়েছে");
    loadSecurity();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

loadSecurity().catch(err => console.error(err));
