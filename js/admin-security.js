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

function getTrafficLevel(count) {
  if (count >= 50) return { text: "High", class: "green" };
  if (count >= 15) return { text: "Medium", class: "yellow" };
  return { text: "Low", class: "red" };
}

async function loadSecurity() {
  await checkAdmin();

  const snap = await getDocs(collection(db, "users"));
  const users = [];
  snap.forEach(d => users.push({ id: d.id, ...d.data() }));

  // ===== Country Stats =====
  const countryMap = {};
  users.forEach(u => {
    const c = u.country || "Unknown";
    if (!countryMap[c]) countryMap[c] = 0;
    countryMap[c]++;
  });

  const countryList = Object.entries(countryMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // ===== Duplicate Detection =====
  const fbMap = {};
  const deviceMap = {};
  const paymentMap = {};

  users.forEach(u => {
    if (u.facebookLink) fbMap[u.facebookLink] = (fbMap[u.facebookLink] || 0) + 1;
    if (u.deviceHash) deviceMap[u.deviceHash] = (deviceMap[u.deviceHash] || 0) + 1;
    if (u.paymentNumber) paymentMap[u.paymentNumber] = (paymentMap[u.paymentNumber] || 0) + 1;
  });

  let duplicateFB = 0, duplicateDevice = 0, duplicatePayment = 0;
  const seenFB = new Set(), seenDevice = new Set(), seenPayment = new Set();

  // ===== Suspicious List =====
  const suspiciousList = [];

  users.forEach(u => {
    const issues = [];

    if (u.facebookLink && fbMap[u.facebookLink] > 1) {
      issues.push("Duplicate Facebook");
      if (!seenFB.has(u.facebookLink)) { duplicateFB++; seenFB.add(u.facebookLink); }
    }
    if (u.deviceHash && deviceMap[u.deviceHash] > 1) {
      issues.push("Duplicate Device");
      if (!seenDevice.has(u.deviceHash)) { duplicateDevice++; seenDevice.add(u.deviceHash); }
    }
    if (u.paymentNumber && paymentMap[u.paymentNumber] > 1) {
      issues.push("Duplicate Payment");
      if (!seenPayment.has(u.paymentNumber)) { duplicatePayment++; seenPayment.add(u.paymentNumber); }
    }
    if (u.vpnSuspected || (u.vpnScore || 0) >= 30) {
      issues.push("VPN Suspected (Score: " + (u.vpnScore || 0) + ")");
    }
    if (u.isBanned) {
      issues.push("Already Banned");
    }

    if (issues.length > 0) {
      suspiciousList.push({ ...u, issues });
    }
  });

  // Sort: VPN first, then others
  suspiciousList.sort((a, b) => (b.vpnScore || 0) - (a.vpnScore || 0));

  // ===== Country HTML =====
  let countryHtml = "";
  countryList.forEach(c => {
    const level = getTrafficLevel(c.count);
    countryHtml += `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <div>
          <div style="font-weight:600;">${c.name}</div>
          <div style="font-size:11px;color:var(--muted);">${c.count} জন ইউজার</div>
        </div>
        <span class="badge ${level.class === 'green' ? 'badge-active' : level.class === 'yellow' ? 'badge-pending' : 'badge-rejected'}">
          ${level.text}
        </span>
      </div>
    `;
  });

  // ===== Suspicious HTML =====
  let suspiciousHtml = "";
  suspiciousList.forEach(u => {
    const ipHistoryText = (u.ipHistory || [])
      .slice(-4)
      .map(h => h.country + " (" + (h.ip || "").slice(0, 12) + ")")
      .join(" → ") || "নেই";

    suspiciousHtml += `
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
          <div>📍 দেশ: <b>${u.country || "Unknown"}</b></div>
          <div>📡 VPN Score: <b>${u.vpnScore || 0}</b></div>
          <div>📱 Device: ${u.deviceHash || "—"}</div>
          \( {u.facebookLink ? `<div>📘 <a href=" \){u.facebookLink}" target="_blank" style="color:var(--green);">Facebook</a></div>` : ""}
          ${u.paymentNumber ? `<div>💳 ${u.paymentMethod || ""}: ${u.paymentNumber}</div>` : ""}
          <div style="margin-top:6px;font-size:11px;">IP History: ${ipHistoryText}</div>
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
        <p>কান্ট্রি ট্রাফিক + VPN + ফ্রড ডিটেকশন</p>
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
          <div class="stat-label">VPN সন্দেহ</div>
          <div class="stat-value red">${users.filter(u => u.vpnSuspected || (u.vpnScore || 0) >= 30).length}</div>
        </div>
      </div>

      <!-- Country Traffic -->
      <div class="section-card">
        <h2>🌍 দেশ অনুযায়ী ট্রাফিক</h2>
        <div style="max-height:260px;overflow-y:auto;">
          ${countryHtml || `<div style="color:var(--muted);font-size:13px;">এখনো ডেটা নেই</div>`}
        </div>
      </div>

      <div style="font-size:15px;font-weight:700;margin:18px 0 12px;">
        🚨 সন্দেহজনক অ্যাকাউন্ট (${suspiciousList.length})
      </div>

      <div>
        ${suspiciousHtml || `
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
