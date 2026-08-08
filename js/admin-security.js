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
  try {
    const snap = await getDoc(doc(db, "users", String(adminUser.id)));
    if (!snap.exists() || snap.data().role !== "admin") {
      document.getElementById("app").innerHTML = `
        <div class="loader-box">
          <div class="logo-circle">⛔</div>
          <h1>অ্যাক্সেস ডিনাইড</h1>
          <p>আপনি অ্যাডমিন নন</p>
        </div>
      `;
      return false;
    }
    return true;
  } catch (e) {
    console.error("Admin check error:", e);
    document.getElementById("app").innerHTML = `
      <div class="loader-box">
        <h1>সমস্যা</h1>
        <p class="error">অ্যাডমিন চেক করতে ব্যর্থ: ${e.message}</p>
      </div>
    `;
    return false;
  }
}

function getTrafficLevel(count) {
  if (count >= 50) return { text: "High", cls: "badge-active" };
  if (count >= 15) return { text: "Medium", cls: "badge-pending" };
  return { text: "Low", cls: "badge-rejected" };
}

async function loadSecurity() {
  const isAdmin = await checkAdmin();
  if (!isAdmin) return;

  try {
    const snap = await getDocs(collection(db, "users"));
    const users = [];
    snap.forEach(d => {
      users.push({ id: d.id, ...d.data() });
    });

    // Country Stats
    const countryMap = {};
    users.forEach(u => {
      const c = u.country || "Unknown";
      countryMap[c] = (countryMap[c] || 0) + 1;
    });

    const countryList = Object.entries(countryMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Duplicates
    const fbMap = {}, deviceMap = {}, paymentMap = {};
    users.forEach(u => {
      if (u.facebookLink) fbMap[u.facebookLink] = (fbMap[u.facebookLink] || 0) + 1;
      if (u.deviceHash) deviceMap[u.deviceHash] = (deviceMap[u.deviceHash] || 0) + 1;
      if (u.paymentNumber) paymentMap[u.paymentNumber] = (paymentMap[u.paymentNumber] || 0) + 1;
    });

    let duplicateFB = 0, duplicateDevice = 0;
    const seenFB = new Set(), seenDevice = new Set();

    const suspiciousList = [];

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
      if (u.vpnSuspected || (u.vpnScore || 0) >= 30) {
        issues.push("VPN Score: " + (u.vpnScore || 0));
      }
      if (u.isBanned) {
        issues.push("Banned");
      }

      if (issues.length > 0) {
        suspiciousList.push({ ...u, issues });
      }
    });

    suspiciousList.sort((a, b) => (b.vpnScore || 0) - (a.vpnScore || 0));

    // Country HTML
    let countryHtml = "";
    if (countryList.length === 0) {
      countryHtml = `<div style="color:var(--muted);font-size:13px;padding:10px 0;">এখনো কোনো দেশের ডেটা নেই</div>`;
    } else {
      countryList.forEach(c => {
        const level = getTrafficLevel(c.count);
        countryHtml += `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <div>
              <div style="font-weight:600;">${c.name}</div>
              <div style="font-size:11px;color:var(--muted);">${c.count} জন</div>
            </div>
            <span class="badge \( {level.cls}"> \){level.text}</span>
          </div>
        `;
      });
    }

    // Suspicious HTML
    let suspiciousHtml = "";
    if (suspiciousList.length === 0) {
      suspiciousHtml = `
        <div class="section-card" style="text-align:center;color:var(--muted);">
          ✅ কোনো সন্দেহজনক অ্যাকাউন্ট নেই
        </div>
      `;
    } else {
      suspiciousList.forEach(u => {
        suspiciousHtml += `
          <div class="item-card">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <div>
                <div style="font-weight:700;">👤 ${u.firstName || "User"}</div>
                <div style="font-size:12px;color:var(--muted);">@${u.username || "—"} • ${u.telegramId}</div>
              </div>
              ${u.isBanned ? `<span class="badge badge-rejected">Banned</span>` : `<span class="badge badge-pending">Suspicious</span>`}
            </div>

            <div style="font-size:11px;margin-bottom:8px;">
              \( {u.issues.map(i => `<span class="badge badge-rejected" style="margin:2px 3px 2px 0;"> \){i}</span>`).join("")}
            </div>

            <div style="font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:10px;">
              <div>📍 ${u.country || "Unknown"}</div>
              <div>📡 VPN Score: ${u.vpnScore || 0}</div>
              <div>💰 ${Number(u.coin || 0).toLocaleString()} কয়েন</div>
            </div>

            ${!u.isBanned ? `
              <button class="btn-danger" style="padding:10px;font-size:13px;" onclick="window.banUser('${u.id}')">
                🚫 ব্যান করুন
              </button>
            ` : `
              <button class="btn-secondary" style="padding:10px;font-size:13px;" onclick="window.unbanUser('${u.id}')">
                আনব্যান করুন
              </button>
            `}
          </div>
        `;
      });
    }

    document.getElementById("app").innerHTML = `
      <div class="admin-page">
        <div class="admin-header">
          <h1>🛡 সিকিউরিটি সেন্টার</h1>
          <p>কান্ট্রি ট্রাফিক + VPN + ফ্রড</p>
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
            <div class="stat-value red">${users.filter(u => u.vpnSuspected || (u.vpnScore||0) >= 30).length}</div>
          </div>
        </div>

        <div class="section-card">
          <h2>🌍 দেশ অনুযায়ী ট্রাফিক</h2>
          <div style="max-height:240px;overflow-y:auto;">
            ${countryHtml}
          </div>
        </div>

        <div style="font-size:15px;font-weight:700;margin:16px 0 10px;">
          🚨 সন্দেহজনক অ্যাকাউন্ট (${suspiciousList.length})
        </div>

        ${suspiciousHtml}

        <div style="margin-top:18px;">
          <a href="index.html" class="btn-secondary" style="display:block;text-align:center;text-decoration:none;">
            ← ড্যাশবোর্ডে ফিরে যান
          </a>
        </div>
      </div>
    `;

  } catch (err) {
    console.error(err);
    document.getElementById("app").innerHTML = `
      <div class="loader-box">
        <h1>সমস্যা হয়েছে</h1>
        <p class="error">${err.message}</p>
        <br>
        <button class="btn-primary" onclick="location.reload()">আবার চেষ্টা করুন</button>
      </div>
    `;
  }
}

window.banUser = async function(uid) {
  if (!confirm("এই ইউজারকে ব্যান করবেন?")) return;
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
  if (!confirm("আনব্যান করবেন?")) return;
  try {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};
    await updateDoc(userRef, {
      isBanned: false,
      status: data.facebookLink ? "Active" : "Inactive",
      banDeviceHash: ""
    });
    tg.showAlert("আনব্যান হয়েছে");
    loadSecurity();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

loadSecurity();
