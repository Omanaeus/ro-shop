// ของที่ใช้ร่วมกันระหว่างหน้าร้าน (index.html) และหน้าแอดมิน (admin.html)
window.RO = (function () {
  const CATS = [["weapon", "อาวุธ"], ["armor", "ชุด/เกราะ"], ["card", "การ์ด"], ["mat", "วัตถุดิบ"], ["use", "ของใช้"]];
  const ICON = {
    weapon: '<svg viewBox="0 0 40 40"><path d="M30 4l6 0 0 6-18 18-6-6z" fill="#cfd8e3" stroke="#7b8796" stroke-width="1.5"/><path d="M10 22l8 8-3 3-8-8z" fill="#f2b230"/><path d="M8 30l2 2-5 5-2-2z" fill="#7d4a22"/></svg>',
    armor: '<svg viewBox="0 0 40 40"><path d="M20 4l14 5v10c0 9-6 15-14 18C12 34 6 28 6 19V9z" fill="#4aa8ea" stroke="#1f5f96" stroke-width="1.5"/><path d="M20 9l9 3v7c0 6-4 10-9 12z" fill="#9fd6fb"/></svg>',
    card: '<svg viewBox="0 0 40 40"><rect x="9" y="4" width="22" height="32" rx="3" fill="#fff8e6" stroke="#f2b230" stroke-width="2"/><circle cx="20" cy="17" r="7" fill="#ff8fb0"/><circle cx="17.5" cy="15" r="2" fill="#fff"/><rect x="13" y="28" width="14" height="3" rx="1.5" fill="#f2b230"/></svg>',
    mat: '<svg viewBox="0 0 40 40"><path d="M8 26l8-16 10 2 6 14-12 8z" fill="#8a7dd8" stroke="#4d3f9a" stroke-width="1.5"/><path d="M16 10l4 12 12 4" fill="none" stroke="#c9c1ff" stroke-width="1.5"/></svg>',
    use: '<svg viewBox="0 0 40 40"><path d="M15 4h10v4h-10z" fill="#7d4a22"/><path d="M14 8h12v6c5 2 8 6 8 11 0 7-6 11-14 11S6 32 6 25c0-5 3-9 8-11z" fill="#fff" stroke="#9aa9b9" stroke-width="1.5"/><path d="M9 25h22c0 6-5 8-11 8s-11-2-11-8z" fill="#e9f1f8"/></svg>'
  };
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n, cur) => cur === "฿" ? "฿" + Number(n).toLocaleString("th-TH") : Number(n).toLocaleString("en-US") + " z";
  const fullName = i => (Number(i.refine) ? "+" + i.refine + " " : "") + i.name;
  const catName = k => (CATS.find(c => c[0] === k) || ["", ""])[1];
  const safeImg = u => /^https:\/\/(lh3\.googleusercontent\.com|drive\.google\.com)\//.test(String(u || "")) ? String(u) : "";

  /** แปลงราคาแบบ "450k", "1.2m", "45,000" -> ตัวเลข */
  function parsePrice(s) {
    const t = String(s || "").toLowerCase().replace(/[, ]/g, "");
    const m = t.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
    if (!m) return NaN;
    return Math.round(parseFloat(m[1]) * (m[2] === "m" ? 1e6 : m[2] === "k" ? 1e3 : 1));
  }

  async function api(body) {
    if (!window.API_URL) throw new Error("ยังไม่ได้ใส่ API_URL ใน config.js");
    const res = body
      ? await fetch(window.API_URL, { method: "POST", body: JSON.stringify(body) }) // text/plain -> ไม่มี preflight
      : await fetch(window.API_URL + "?t=" + Date.now());
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "เกิดข้อผิดพลาด");
    return data;
  }

  return { CATS, ICON, esc, fmt, fullName, catName, safeImg, parsePrice, api };
})();
