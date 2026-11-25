// อ่านข้อความจาก OCR ของหน้าต่างไอเทม Ragnarok แล้วแปลงเป็นข้อมูลไอเทม
(function (root) {
  const SKIP = /^(item|description|info|close|ok|cancel|equip|use|drop|weight|price|sell|buy)\b/i;

  function cleanLine(s) {
    return String(s)
      .replace(/[|¦_~`"“”‘’]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[^A-Za-z0-9+\[]+/, "")
      .replace(/[^A-Za-z0-9\]\)\.%]+$/, "")
      .trim();
  }

  function guessCat(all, name) {
    const cls = (all.match(/(?:class|type|item type)\s*[:;.]\s*([A-Za-z /-]+)/i) || [])[1] || "";
    const t = (cls + " " + name).toLowerCase();
    if (/\bcard\b/.test(t)) return "card";
    if (/dagger|sword|bow|staff|rod|mace|axe|spear|katar|book|knuckle|whip|instrument|gun|weapon/.test(t)) return "weapon";
    if (/armor|garment|shield|footgear|shoes|headgear|helm|accessory|manteau|muffler|robe|clothes|hat|ring|clip/.test(t)) return "armor";
    if (/potion|healing|usable|consum|recover|herb|fruit|scroll|box/.test(t)) return "use";
    if (/etc|misc|material|ore|elunium|oridecon|jewel|gem/.test(t)) return "mat";
    if (/\b(attack|atk|weapon level)\s*[:;]/i.test(all)) return "weapon";
    if (/\b(defense|def)\s*[:;]/i.test(all)) return "armor";
    if (/\b(recovers?|restores?)\b/i.test(all)) return "use";
    return "mat";
  }

  function parseItemText(text) {
    const lines = String(text || "").split(/\r?\n/).map(cleanLine).filter(l => l.length >= 2);
    const all = lines.join("\n");
    let name = "";
    // 1) บรรทัดที่มีช่อง [n] มักเป็นชื่อไอเทม
    const slotLine = lines.find(l => /\[\s*\d\s*\]/.test(l) && !/:/.test(l));
    if (slotLine) name = slotLine;
    // 2) ไม่งั้นใช้บรรทัดแรกที่ไม่มี ":" และมีตัวอักษรพอสมควร
    if (!name) name = lines.find(l => !/[:;=]/.test(l) && /[A-Za-z]{3,}/.test(l) && !SKIP.test(l)) || "";

    const stackM = name.match(/\((?:x\s*)?(\d{1,5})\)\s*$/i) || name.match(/\s[xX]\s?(\d{1,5})$/);
    if (stackM) name = name.slice(0, stackM.index);
    let refine = 0;
    const r = name.match(/^\+\s*(\d{1,2})\s*/);
    if (r) { refine = Math.min(20, parseInt(r[1], 10)); name = name.slice(r[0].length); }
    name = name
      .replace(/\[\s*(\d)\s*\]/, "[$1]")
      .replace(/\s*\((?:x\s*)?\d+\)\s*$/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    // ตัด [n] ซ้ำ หรือขยะท้ายชื่อหลังวงเล็บ
    const m = name.match(/^(.*?\[\d\])/);
    if (m) name = m[1];

    const qtyM = all.match(/(?:amount|qty|quantity|ea)\s*[:;x]?\s*(\d{1,5})/i);
    const effects = lines.filter(l => l !== slotLine && /(?:\b[A-Za-z]{2,}\s*[+-]\s*\d+%?|\d+%\s)/.test(l) && !/^(weight|price|requirement|required|level)/i.test(l)).slice(0, 2);

    return {
      name: name.slice(0, 80),
      refine,
      cat: guessCat(all, name),
      qty: stackM ? parseInt(stackM[1], 10) : qtyM ? parseInt(qtyM[1], 10) : 1,
      note: effects.join(", ").slice(0, 200),
      raw: lines
    };
  }

  root.parseItemText = parseItemText;
  if (typeof module !== "undefined") module.exports = { parseItemText };
})(typeof window !== "undefined" ? window : globalThis);
