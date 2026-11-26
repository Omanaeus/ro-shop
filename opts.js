// ออปชันของไอเทม: แปลงข้อความ <-> ข้อมูล และใช้กรองในหน้าร้าน (ต้องโหลด affixes.js + calc-core.js ก่อน)
window.OPTS = (function () {
  const TYPES = window.AFFIXES || [];
  const TYPE_LABEL = { forge: "อาวุธ", armor: "Armor", garment: "Garment", shoes: "Shoes" };
  const pct = n => /\(%\)/.test(n);
  const short = n => String(n).replace(/\s*\(%\)\s*$/, "").replace(/\(MHP\)|\(MSP\)/, "");
  /** {n, v} -> "ATK +55" / "Phys Damage to Medium targets +32%" */
  const fmt = o => short(o.n) + " +" + o.v + (pct(o.n) ? "%" : "");

  /** ข้อความหลายบรรทัด (จาก screenshot หรือพิมพ์เอง) -> { type, opts:[{n,v,t}] } เลือกประเภทที่จับคู่ได้มากที่สุด */
  function parse(text) {
    let best = { type: "", opts: [] };
    TYPES.forEach(t => {
      const m = window.CALC.matchText(t, text);
      if (m.count > best.opts.length) best = { type: t.id, opts: m.picks.filter(Boolean).map(p => ({ n: p.name, v: Number(p.value) || 0, t: t.id })) };
    });
    return best;
  }

  /** รายชื่อออปชันทั้งหมดสำหรับตัวกรอง: [{t, label, names:[...]}] */
  function catalog() {
    return TYPES.map(t => ({ t: t.id, label: TYPE_LABEL[t.id] || t.label, names: [...new Set(t.slots.flat().map(o => o[0]))].sort() }));
  }
  return { fmt, short, parse, catalog, TYPE_LABEL };
})();
