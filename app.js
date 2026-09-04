import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const $ = s => document.querySelector(s);

const loginCard = $("#loginCard");
const app = $("#app");
const email = $("#email");
const password = $("#password");
const loginBtn = $("#loginBtn");
const loginStatus = $("#loginStatus");
const logoutBtn = $("#logoutBtn");
const userEmail = $("#userEmail");

const campaignId = $("#campaignId");
const campaignName = $("#campaignName");
const worker = $("#worker");
const baseUrl = $("#baseUrl");
const openCampaignBtn = $("#openCampaignBtn");
const saveCampaignBtn = $("#saveCampaignBtn");
const campaignStatus = $("#campaignStatus");

const guestsInput = $("#guestsInput");
const importGuestsBtn = $("#importGuestsBtn");
const copyPendingBtn = $("#copyPendingBtn");
const exportCsvBtn = $("#exportCsvBtn");
const mainStatus = $("#mainStatus");

const guestList = $("#guestList");
const search = $("#search");
const statusFilter = $("#statusFilter");
const refreshBtn = $("#refreshBtn");
const resetStatusesBtn = $("#resetStatusesBtn");

const statAll = $("#statAll");
const statNew = $("#statNew");
const statCopied = $("#statCopied");
const statSent = $("#statSent");
const statConfirmed = $("#statConfirmed");
const statDeclined = $("#statDeclined");

let guests = [];
let unsubscribeGuests = null;
let activeCampaignId = "";

const STATUS_LABELS = {
  new: "CHƯA COPY",
  copied: "ĐÃ COPY",
  sent: "ĐÃ GỬI",
  confirmed: "ĐÃ XÁC NHẬN",
  declined: "KHÔNG THAM DỰ"
};

function setStatus(el, message = "", isError = false) {
  if (!el) return;
  el.textContent = message;
  el.className = "status-line" + (isError ? " error" : "");
}

function friendlyError(err) {
  const code = err?.code || "";
  const map = {
    "auth/invalid-credential": "Email hoặc mật khẩu không đúng.",
    "auth/invalid-email": "Email không hợp lệ.",
    "auth/too-many-requests": "Đăng nhập thất bại quá nhiều lần. Hãy thử lại sau.",
    "auth/network-request-failed": "Không kết nối được Firebase. Kiểm tra Internet.",
    "permission-denied": "Firebase từ chối quyền truy cập. Kiểm tra tài khoản và Firestore Rules.",
    "firestore/permission-denied": "Firebase từ chối quyền truy cập. Kiểm tra tài khoản và Firestore Rules."
  };
  return map[code] || err?.message || "Có lỗi xảy ra.";
}

function normalizeWorker(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function validUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeCampaignId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeGuestKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .trim();
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/*
 * V4.2
 * Tạo link trực tiếp tới website thiệp.
 *
 * Ví dụ:
 * https://tungngocwedding.love/?guest=Bạn+Loan
 *
 * Worker không còn được dùng để tạo link mới.
 */
function makeInviteLink(workerUrl, landingUrl, guestName) {
  const u = new URL(landingUrl.trim());

  // Xóa tham số cũ nếu Link thiệp gốc đã có sẵn.
  u.searchParams.delete("tenkhach");

  // Website thiệp hiện tại của bạn dùng ?guest=
  u.searchParams.set("guest", guestName.trim());

  return u.toString();
}

function currentCampaignId() {
  return activeCampaignId || normalizeCampaignId(campaignId.value);
}

function campaignRef(cid = currentCampaignId()) {
  return doc(db, "inviteProjects", cid);
}

function guestRef(id, cid = currentCampaignId()) {
  return doc(db, "inviteProjects", cid, "guests", id);
}

function guestsCollection(cid = currentCampaignId()) {
  return collection(db, "inviteProjects", cid, "guests");
}

function validateCampaignForm() {
  const cid = normalizeCampaignId(campaignId.value);
  const w = normalizeWorker(worker.value);
  const b = baseUrl.value.trim();

  if (!auth.currentUser) throw new Error("Bạn chưa đăng nhập.");
  if (!cid) throw new Error("Vui lòng nhập Mã chiến dịch.");

  /*
   * Worker KHÔNG bắt buộc trong V4.2.
   * Link mới được tạo trực tiếp từ Link thiệp gốc.
   */
  if (w && !validUrl(w)) {
    throw new Error("Địa chỉ Worker không hợp lệ.");
  }

  if (!validUrl(b)) {
    throw new Error("Link thiệp gốc không hợp lệ.");
  }

  campaignId.value = cid;
  worker.value = w;

  return { cid, w, b };
}

function parseGuestNames() {
  const names = guestsInput.value
    .split(/\r?\n/)
    .map(v => v.trim())
    .filter(Boolean);

  const seen = new Set();
  const unique = [];

  for (const name of names) {
    const key = normalizeGuestKey(name);

    if (!key || seen.has(key)) continue;

    seen.add(key);
    unique.push(name);
  }

  return unique;
}

async function copyText(text) {
  if (!navigator.clipboard?.writeText) {
    throw new Error(
      "Trình duyệt không hỗ trợ Clipboard API. Hãy mở web bằng HTTPS."
    );
  }

  await navigator.clipboard.writeText(text);
}

function formatTime(ts) {
  try {
    if (!ts) return "";

    const date = ts.toDate ? ts.toDate() : new Date(ts);

    return date.toLocaleString("vi-VN");
  } catch {
    return "";
  }
}

function badgeClass(status) {
  return {
    new: "badge-new",
    copied: "badge-copied",
    sent: "badge-sent",
    confirmed: "badge-confirmed",
    declined: "badge-declined"
  }[status] || "badge-new";
}

function chunks(arr, size = 400) {
  const result = [];

  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }

  return result;
}

async function saveCampaign(showMessage = true) {
  const { cid, w, b } = validateCampaignForm();
  const ref = campaignRef(cid);

  let existing = null;

  try {
    existing = await getDoc(ref);
  } catch (err) {
    if (
      err?.code !== "permission-denied" &&
      err?.code !== "firestore/permission-denied"
    ) {
      throw err;
    }
  }

  const payload = {
    campaignId: cid,
    name: campaignName.value.trim() || cid,
    worker: w,
    baseUrl: b,
    ownerUid: auth.currentUser.uid,
    ownerEmail: auth.currentUser.email || "",
    updatedAt: serverTimestamp()
  };

  if (existing?.exists()) {
    await setDoc(ref, payload, { merge: true });
  } else {
    payload.createdAt = serverTimestamp();
    await setDoc(ref, payload);
  }

  activeCampaignId = cid;

  localStorage.setItem("invite_v4_campaign", cid);

  subscribeGuests(cid);

  if (showMessage) {
    setStatus(
      campaignStatus,
      `Đã lưu chiến dịch "${payload.name}".`
    );
  }
}

async function openCampaign(cidRaw = campaignId.value) {
  const cid = normalizeCampaignId(cidRaw);

  if (!cid) {
    setStatus(
      campaignStatus,
      "Vui lòng nhập Mã chiến dịch.",
      true
    );
    return;
  }

  try {
    const snap = await getDoc(campaignRef(cid));

    if (!snap.exists()) {
      setStatus(
        campaignStatus,
        "Chưa có chiến dịch này. Hãy nhập cấu hình rồi bấm Lưu cấu hình.",
        true
      );
      return;
    }

    const data = snap.data();

    campaignId.value = cid;
    campaignName.value = data.name || "";
    worker.value = data.worker || "";
    baseUrl.value = data.baseUrl || "";

    activeCampaignId = cid;

    localStorage.setItem("invite_v4_campaign", cid);

    subscribeGuests(cid);

    setStatus(
      campaignStatus,
      `Đã mở chiến dịch "${data.name || cid}".`
    );
  } catch (err) {
    console.error(err);

    setStatus(
      campaignStatus,
      "Không mở được chiến dịch. Chiến dịch không tồn tại hoặc tài khoản này không phải chủ sở hữu.",
      true
    );
  }
}

function subscribeGuests(cid) {
  if (unsubscribeGuests) {
    unsubscribeGuests();
    unsubscribeGuests = null;
  }

  if (!cid || !auth.currentUser) {
    guests = [];
    renderGuests();
    return;
  }

  unsubscribeGuests = onSnapshot(
    guestsCollection(cid),

    snapshot => {
      guests = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      guests.sort((a, b) => {
        const oa = Number.isFinite(a.order)
          ? a.order
          : Number.MAX_SAFE_INTEGER;

        const ob = Number.isFinite(b.order)
          ? b.order
          : Number.MAX_SAFE_INTEGER;

        if (oa !== ob) return oa - ob;

        return String(a.name || "").localeCompare(
          String(b.name || ""),
          "vi"
        );
      });

      renderGuests();
    },

    err => {
      console.error(err);
      setStatus(mainStatus, friendlyError(err), true);
    }
  );
}

async function importGuests() {
  try {
    const { cid, w, b } = validateCampaignForm();
    const names = parseGuestNames();

    if (!names.length) {
      setStatus(
        mainStatus,
        "Vui lòng nhập ít nhất 1 khách mời.",
        true
      );
      return;
    }

    await saveCampaign(false);

    importGuestsBtn.disabled = true;

    setStatus(
      mainStatus,
      "Đang kiểm tra tên trùng..."
    );

    const prepared = await Promise.all(
      names.map(async (name, index) => {
        const key = normalizeGuestKey(name);
        const id = (await sha256(key)).slice(0, 40);
        const ref = guestRef(id, cid);
        const existing = await getDoc(ref);

        return {
          name,
          key,
          id,
          ref,
          exists: existing.exists(),
          index
        };
      })
    );

    const missing = prepared.filter(x => !x.exists);
    const skipped = prepared.length - missing.length;

    if (!missing.length) {
      guestsInput.value = "";

      setStatus(
        mainStatus,
        `Không thêm khách mới. Đã bỏ qua ${skipped} tên đã tồn tại.`
      );

      return;
    }

    const baseOrder = Date.now() * 1000;

    for (const group of chunks(missing, 400)) {
      const batch = writeBatch(db);

      group.forEach(item => {
        batch.set(item.ref, {
          name: item.name,
          normalizedName: item.key,

          // Link được tạo TRỰC TIẾP:
          // https://tungngocwedding.love/?guest=...
          link: makeInviteLink(w, b, item.name),

          status: "new",
          order: baseOrder + item.index,

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),

          copiedAt: null,
          sentAt: null,
          confirmedAt: null,
          declinedAt: null
        });
      });

      await batch.commit();
    }

    guestsInput.value = "";

    setStatus(
      mainStatus,
      `Đã thêm ${missing.length} khách mới${
        skipped
          ? `, bỏ qua ${skipped} khách đã tồn tại.`
          : "."
      }`
    );
  } catch (err) {
    console.error(err);
    setStatus(mainStatus, friendlyError(err), true);
  } finally {
    importGuestsBtn.disabled = false;
  }
}

async function copyGuest(g) {
  /*
   * Không cho copy lại nếu Firebase đã ghi nhận khách này
   * ở bất kỳ trạng thái nào khác "new".
   */
  if (g.status !== "new") {
    setStatus(
      mainStatus,
      `"${g.name}" đã được xử lý trước đó (${
        STATUS_LABELS[g.status] || g.status
      }).`,
      true
    );

    return;
  }

  try {
    await copyText(g.link);

    await updateDoc(guestRef(g.id), {
      status: "copied",
      copiedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    setStatus(
      mainStatus,
      `Đã copy link của "${g.name}" và lưu dấu lên Firebase.`
    );
  } catch (err) {
    console.error(err);
    setStatus(mainStatus, friendlyError(err), true);
  }
}

async function setGuestStatus(g, status) {
  const patch = {
    status,
    updatedAt: serverTimestamp()
  };

  if (status === "sent") {
    patch.sentAt = serverTimestamp();
  }

  if (status === "confirmed") {
    patch.confirmedAt = serverTimestamp();
  }

  if (status === "declined") {
    patch.declinedAt = serverTimestamp();
  }

  await updateDoc(
    guestRef(g.id),
    patch
  );
}

async function deleteGuest(g) {
  if (
    !confirm(
      `Xóa "${g.name}" khỏi danh sách khách?\n\nThao tác này không thể hoàn tác.`
    )
  ) {
    return;
  }

  try {
    await deleteDoc(guestRef(g.id));

    setStatus(
      mainStatus,
      `Đã xóa "${g.name}".`
    );
  } catch (err) {
    setStatus(
      mainStatus,
      friendlyError(err),
      true
    );
  }
}

async function copyPending() {
  const pending = guests.filter(
    g => g.status === "new"
  );

  if (!pending.length) {
    setStatus(
      mainStatus,
      "Không còn khách ở trạng thái Chưa copy.",
      true
    );

    return;
  }

  if (
    !confirm(
      `Copy toàn bộ ${pending.length} khách chưa copy?\n\nSau đó tất cả sẽ được đánh dấu ĐÃ COPY.`
    )
  ) {
    return;
  }

  try {
    copyPendingBtn.disabled = true;

    await copyText(
      pending
        .map(g => `${g.name}\n${g.link}`)
        .join("\n\n")
    );

    for (const group of chunks(pending, 400)) {
      const batch = writeBatch(db);

      group.forEach(g => {
        batch.update(
          guestRef(g.id),
          {
            status: "copied",
            copiedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }
        );
      });

      await batch.commit();
    }

    setStatus(
      mainStatus,
      `Đã copy ${pending.length} khách và đánh dấu ĐÃ COPY.`
    );
  } catch (err) {
    console.error(err);
    setStatus(
      mainStatus,
      friendlyError(err),
      true
    );
  } finally {
    copyPendingBtn.disabled = false;
  }
}

async function resetStatuses() {
  if (!guests.length) {
    setStatus(
      mainStatus,
      "Chưa có khách để reset.",
      true
    );

    return;
  }

  if (
    !confirm(
      `Đưa trạng thái của ${guests.length} khách về CHƯA COPY?\n\nTên khách và link vẫn được giữ nguyên.`
    )
  ) {
    return;
  }

  try {
    resetStatusesBtn.disabled = true;

    for (const group of chunks(guests, 400)) {
      const batch = writeBatch(db);

      group.forEach(g => {
        batch.update(
          guestRef(g.id),
          {
            status: "new",
            copiedAt: null,
            sentAt: null,
            confirmedAt: null,
            declinedAt: null,
            updatedAt: serverTimestamp()
          }
        );
      });

      await batch.commit();
    }

    setStatus(
      mainStatus,
      "Đã reset toàn bộ trạng thái về CHƯA COPY."
    );
  } catch (err) {
    setStatus(
      mainStatus,
      friendlyError(err),
      true
    );
  } finally {
    resetStatusesBtn.disabled = false;
  }
}

function updateStats() {
  statAll.textContent = guests.length;

  statNew.textContent =
    guests.filter(g => g.status === "new").length;

  statCopied.textContent =
    guests.filter(g => g.status === "copied").length;

  statSent.textContent =
    guests.filter(g => g.status === "sent").length;

  statConfirmed.textContent =
    guests.filter(g => g.status === "confirmed").length;

  statDeclined.textContent =
    guests.filter(g => g.status === "declined").length;
}

function filteredGuests() {
  const q = search.value.trim().toLowerCase();
  const st = statusFilter.value;

  return guests.filter(g => {
    const matchName =
      !q ||
      String(g.name || "")
        .toLowerCase()
        .includes(q);

    const matchStatus =
      st === "all" ||
      g.status === st;

    return matchName && matchStatus;
  });
}

function renderGuests() {
  updateStats();

  const rows = filteredGuests();

  guestList.innerHTML = "";

  if (!rows.length) {
    guestList.innerHTML =
      `<div class="empty">Không có khách phù hợp với bộ lọc hiện tại.</div>`;

    return;
  }

  rows.forEach(g => {
    const row = document.createElement("article");
    row.className = "guest";
    row.dataset.status = g.status || "new";

    const head = document.createElement("div");
    head.className = "guest-head";

    const left = document.createElement("div");

    const name = document.createElement("div");
    name.className = "guest-name";
    name.textContent = g.name || "(Không tên)";

    const link = document.createElement("div");
    link.className = "link";
    link.textContent = g.link || "";

    left.append(name, link);

    const badge = document.createElement("span");
    badge.className =
      `badge ${badgeClass(g.status)}`;

    badge.textContent =
      STATUS_LABELS[g.status] || "CHƯA COPY";

    head.append(left, badge);

    const actions = document.createElement("div");
    actions.className = "guest-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn btn-warning";

    copyBtn.textContent =
      g.status === "new"
        ? "Copy link"
        : "Đã copy/đã xử lý ✓";

    copyBtn.disabled =
      g.status !== "new";

    copyBtn.addEventListener(
      "click",
      () => copyGuest(g)
    );

    const openBtn = document.createElement("button");
    openBtn.className = "btn btn-gray";
    openBtn.textContent = "Mở link";

    openBtn.addEventListener(
      "click",
      () =>
        window.open(
          g.link,
          "_blank",
          "noopener,noreferrer"
        )
    );

    const sentBtn = document.createElement("button");
    sentBtn.className = "btn btn-soft";
    sentBtn.textContent = "Đã gửi";

    sentBtn.addEventListener(
      "click",
      async () => {
        try {
          await setGuestStatus(g, "sent");

          setStatus(
            mainStatus,
            `Đã đánh dấu "${g.name}" là ĐÃ GỬI.`
          );
        } catch (err) {
          setStatus(
            mainStatus,
            friendlyError(err),
            true
          );
        }
      }
    );

    const confirmBtn =
      document.createElement("button");

    confirmBtn.className =
      "btn btn-success";

    confirmBtn.textContent =
      "Tham dự";

    confirmBtn.addEventListener(
      "click",
      async () => {
        try {
          await setGuestStatus(
            g,
            "confirmed"
          );

          setStatus(
            mainStatus,
            `Đã đánh dấu "${g.name}" XÁC NHẬN THAM DỰ.`
          );
        } catch (err) {
          setStatus(
            mainStatus,
            friendlyError(err),
            true
          );
        }
      }
    );

    const declineBtn =
      document.createElement("button");

    declineBtn.className =
      "btn btn-danger";

    declineBtn.textContent =
      "Không tham dự";

    declineBtn.addEventListener(
      "click",
      async () => {
        try {
          await setGuestStatus(
            g,
            "declined"
          );

          setStatus(
            mainStatus,
            `Đã đánh dấu "${g.name}" KHÔNG THAM DỰ.`
          );
        } catch (err) {
          setStatus(
            mainStatus,
            friendlyError(err),
            true
          );
        }
      }
    );

    const deleteBtn =
      document.createElement("button");

    deleteBtn.className =
      "btn btn-danger";

    deleteBtn.textContent =
      "Xóa";

    deleteBtn.addEventListener(
      "click",
      () => deleteGuest(g)
    );

    actions.append(
      copyBtn,
      openBtn,
      sentBtn,
      confirmBtn,
      declineBtn,
      deleteBtn
    );

    const meta =
      document.createElement("div");

    meta.className = "meta";

    const parts = [];

    if (g.copiedAt) {
      parts.push(
        `Copy: ${formatTime(g.copiedAt)}`
      );
    }

    if (g.sentAt) {
      parts.push(
        `Gửi: ${formatTime(g.sentAt)}`
      );
    }

    if (g.confirmedAt) {
      parts.push(
        `Xác nhận: ${formatTime(g.confirmedAt)}`
      );
    }

    if (g.declinedAt) {
      parts.push(
        `Từ chối: ${formatTime(g.declinedAt)}`
      );
    }

    meta.textContent =
      parts.join(" • ");

    row.append(
      head,
      actions,
      meta
    );

    guestList.appendChild(row);
  });
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportCsv() {
  if (!guests.length) {
    setStatus(
      mainStatus,
      "Chưa có dữ liệu để xuất.",
      true
    );

    return;
  }

  const header = [
    "Tên khách",
    "Trạng thái",
    "Link",
    "Thời gian copy",
    "Thời gian gửi",
    "Thời gian xác nhận",
    "Thời gian không tham dự"
  ];

  const rows = guests.map(g => [
    g.name,
    STATUS_LABELS[g.status] || g.status,
    g.link,
    formatTime(g.copiedAt),
    formatTime(g.sentAt),
    formatTime(g.confirmedAt),
    formatTime(g.declinedAt)
  ]);

  const csv =
    "\uFEFF" +
    [header, ...rows]
      .map(row =>
        row.map(csvEscape).join(",")
      )
      .join("\r\n");

  const blob = new Blob(
    [csv],
    {
      type: "text/csv;charset=utf-8"
    }
  );

  const url =
    URL.createObjectURL(blob);

  const a =
    document.createElement("a");

  a.href = url;

  a.download =
    `${currentCampaignId() || "khach-moi"}.csv`;

  document.body.appendChild(a);

  a.click();

  a.remove();

  URL.revokeObjectURL(url);

  setStatus(
    mainStatus,
    "Đã xuất danh sách CSV."
  );
}

loginBtn.addEventListener(
  "click",
  async () => {
    setStatus(loginStatus);

    loginBtn.disabled = true;

    try {
      await signInWithEmailAndPassword(
        auth,
        email.value.trim(),
        password.value
      );
    } catch (err) {
      console.error(err);

      setStatus(
        loginStatus,
        friendlyError(err),
        true
      );
    } finally {
      loginBtn.disabled = false;
    }
  }
);

password.addEventListener(
  "keydown",
  e => {
    if (e.key === "Enter") {
      loginBtn.click();
    }
  }
);

logoutBtn.addEventListener(
  "click",
  () => signOut(auth)
);

onAuthStateChanged(
  auth,
  async user => {
    if (user) {
      loginCard.classList.add("hidden");
      app.classList.remove("hidden");

      userEmail.textContent =
        user.email || user.uid;

      const savedCampaign =
        localStorage.getItem(
          "invite_v4_campaign"
        );

      if (savedCampaign) {
        campaignId.value =
          savedCampaign;

        await openCampaign(
          savedCampaign
        );
      } else {
        setStatus(
          campaignStatus,
          "Nhập Mã chiến dịch và Link thiệp để bắt đầu."
        );
      }
    } else {
      app.classList.add("hidden");
      loginCard.classList.remove("hidden");

      guests = [];
      activeCampaignId = "";

      renderGuests();

      if (unsubscribeGuests) {
        unsubscribeGuests();
        unsubscribeGuests = null;
      }
    }
  }
);

openCampaignBtn.addEventListener(
  "click",
  () => openCampaign()
);

saveCampaignBtn.addEventListener(
  "click",
  async () => {
    try {
      await saveCampaign(true);
    } catch (err) {
      console.error(err);

      setStatus(
        campaignStatus,
        friendlyError(err),
        true
      );
    }
  }
);

importGuestsBtn.addEventListener(
  "click",
  importGuests
);

copyPendingBtn.addEventListener(
  "click",
  copyPending
);

exportCsvBtn.addEventListener(
  "click",
  exportCsv
);

resetStatusesBtn.addEventListener(
  "click",
  resetStatuses
);

search.addEventListener(
  "input",
  renderGuests
);

statusFilter.addEventListener(
  "change",
  renderGuests
);

refreshBtn.addEventListener(
  "click",
  async () => {
    if (!currentCampaignId()) {
      setStatus(
        mainStatus,
        "Chưa mở chiến dịch.",
        true
      );

      return;
    }

    await openCampaign(
      currentCampaignId()
    );
  }
);

campaignId.addEventListener(
  "change",
  () => {
    campaignId.value =
      normalizeCampaignId(
        campaignId.value
      );
  }
);
