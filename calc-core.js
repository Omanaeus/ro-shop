// สูตรคำนวณราคา + ตัวจับคู่ข้อความจาก screenshot (ไม่มีส่วน UI ทดสอบแยกได้)
(function (root) {
  const DEFAULT_CFG = { base: 0, k: 1.5, floor: 0.2 };

  // คีย์น้ำหนักของออปชัน: "type|ช่อง|ชื่อ"
  const wkey = (type, slot, name) => type + "|" + (slot + 1) + "|" + name;

  // คุณภาพของค่าที่ roll ได้ 0..1
  function quality(v, min, max) {
    if (!(v >= min)) return 0;
    if (max <= min) return 1;
    return Math.max(0, Math.min(1, (v - min) / (max - min)));
  }

  // มูลค่าออปชัน = น้ำหนัก × (floor + (1−floor) × q^k)
  function optionValue(weight, q, cfg) {
    const f = Math.max(0, Math.min(1, cfg.floor)), k = Math.max(0.1, cfg.k);
    return Math.round((Number(weight) || 0) * (f + (1 - f) * Math.pow(q, k)));
  }

  /** picks = [{name, value} | null ต่อช่อง] */
  function price(type, picks, weights, cfg) {
    cfg = Object.assign({}, DEFAULT_CFG, cfg || {});
    const lines = type.slots.map((pool, s) => {
      const p = picks[s];
      if (!p || !p.name) return null;
      const opt = pool.find(o => o[0] === p.name);
      if (!opt) return null;
      const q = quality(Number(p.value), opt[1], opt[2]);
      const w = Number(weights[wkey(type.id, s, opt[0])]) || 0;
      return { slot: s, name: opt[0], value: Number(p.value), min: opt[1], max: opt[2], q, weight: w, worth: optionValue(w, q, cfg) };
    });
    const total = Math.round((Number(cfg.base) || 0) + lines.reduce((a, l) => a + (l ? l.worth : 0), 0));
    return { total, lines, cfg };
  }

  /* ---------- ต้นทุนการตีอาวุธ ---------- */
  // ราคาต่อชิ้นของวัตถุดิบ: ใช้ราคาที่ใส่ไว้ ("mat|ชื่อ") ถ้าไม่มี และทำเองได้ จะคิดจากวัตถุดิบย่อย
  function unitPrice(name, W, sub, depth) {
    const own = Number(W["mat|" + name]) || 0;
    if (own > 0) return { price: own, from: "buy" };
    const r = sub && sub[name];
    if (r && (depth || 0) < 4) {
      let sum = 0;
      for (const [m, q] of r) { const u = unitPrice(m, W, sub, (depth || 0) + 1); if (!u.price) return { price: 0, from: "missing" }; sum += u.price * q; }
      return { price: sum, from: "craft" };
    }
    return { price: 0, from: "missing" };
  }

  /** recipe = [ชื่อ, lv, [[วัตถุดิบ, จำนวน]]]; rate = โอกาสสำเร็จ 0..1 */
  function forgeCost(recipe, W, sub) {
    if (!recipe) return { lines: [], matCost: 0, rate: 1, expected: 0, missing: 0 };
    const rate = Math.max(0.01, Math.min(1, Number(W["forge|rate"]) || 0.4));
    const lines = recipe[2].map(([m, q]) => { const u = unitPrice(m, W, sub); return { name: m, qty: q, unit: u.price, from: u.from, cost: u.price * q }; });
    const matCost = lines.reduce((a, l) => a + l.cost, 0);
    return { lines, matCost, rate, expected: Math.round(matCost / rate), missing: lines.filter(l => !l.unit).length };
  }

  /* ---------- อาวุธตีเหล็ก: ค่าพลัง (power index) ---------- */
  // บทบาทของออปชัน: speed = ความเร็วโจมตี, mult = ตัวคูณแยก (ระยะไกล), slot4 = ทะลุเกราะ, add = บวกรวมในก้อนดาเมจ
  function roleOf(slot, name) {
    if (slot === 3) return "slot4";
    if (/^ASPD/.test(name)) return "speed";
    if (/^Long-range/.test(name)) return "mult";
    return "add";
  }
  // ดาเมจตามขนาดของประเภทอาวุธ (จาก recipes.js): [เล็ก, กลาง, ใหญ่] %
  const SIZES = ["Small", "Medium", "Large"];
  function sizeModOf(weapon) {
    const T = root.WEAPON_TYPES || {}, M = root.SIZE_MOD || {}, t = T[weapon];
    return t && M[t] ? { type: t, mod: M[t] } : { type: "", mod: [100, 100, 100] };
  }
  // ความครอบคลุมขนาด เทียบกับ Mace (อาวุธอ้างอิง Stunner): ยิ่งตีได้ 100% หลายขนาด ยิ่งสูง
  function sizeFactor(weapon, W) {
    const w = SIZES.map((z, i) => Number(W["size|" + z] ?? [0.25, 0.5, 0.25][i]));
    const cov = m => m.reduce((a, v, i) => a + w[i] * v / 100, 0) / (w[0] + w[1] + w[2] || 1);
    const ref = cov((root.SIZE_MOD || {}).Mace || [75, 100, 100]);
    return ref ? cov(sizeModOf(weapon).mod) / ref : 1;
  }
  const raceOf = n => (String(n).match(/(Formless|Undead|Brute|Plant|Insect|Fish|Demon|Demi-Human|Angel|Dragon)/) || [])[1] || "";

  /**
   * ตัวคูณดาเมจ = (1 + Σ ω·ค่า%) × Π(1 + ω·ค่า%)[ระยะไกล]
   * ความเร็ว     = 1 + Σ ω·ค่า         [ASPD +n, ASPD %]
   * ช่อง 4       = 1 + c·ค่า%          [c สูงกว่าถ้าเผ่าตรงกับช่อง 3]
   * ค่าพลัง      = ตัวคูณดาเมจ × ความเร็ว × ช่อง 4
   */
  // ω เฉพาะอาวุธ: "forge@ชื่ออาวุธ|ช่อง|ออปชัน" (ถ้ามีอย่างน้อย 1 ค่า ถือว่าอาวุธนี้ใช้ ω ของตัวเองทั้งชุด)
  const hasOwnOmega = (W, weapon) => !!weapon && Object.keys(W).some(k => k.startsWith("forge@" + weapon + "|"));
  const omegaKey = (W, weapon, slot, name) => hasOwnOmega(W, weapon) ? "forge@" + weapon + "|" + (slot + 1) + "|" + name : wkey("forge", slot, name);
  function forgePower(type, picks, W, weapon) {
    let add = 0, mult = 1, speed = 1, s4 = 1; const lines = [];
    const race3 = picks[2] ? raceOf(picks[2].name) : "";
    type.slots.forEach((pool, s) => {
      const p = picks[s]; if (!p || !p.name) return;
      const opt = pool.find(o => o[0] === p.name); if (!opt) return;
      const raw = Math.max(0, Number(p.value) || 0), v = Math.min(raw, opt[2]), role = roleOf(s, opt[0]); // ค่าเกินช่วง roll ถูกตัดที่ค่าสูงสุด
      const k = omegaKey(W, weapon, s, opt[0]);
      const rawW = W[k] ?? W[wkey(type.id, s, opt[0])];
      const w = rawW === undefined && s === 3 ? 1 : Number(rawW); const om = isFinite(w) ? Math.max(0, Math.min(5, w)) : 0; // ช่อง 4: ω = ตัวคูณของ c
      let eff = 0;
      if (role === "add") {
        eff = om * v / 100;
        const sz = opt[0].match(/(Small|Medium|Large) targets/);
        if (sz) eff *= sizeModOf(weapon).mod[SIZES.indexOf(sz[1])] / 100; // Dagger ตีขนาดใหญ่ได้ 50% → ออปชันขนาดใหญ่ได้ผลครึ่งเดียว
        add += eff;
      }
      else if (role === "mult") { eff = om * v / 100; mult *= 1 + eff; }
      else if (role === "speed") { eff = om * v; speed += eff; }
      else { const match = race3 && raceOf(opt[0]) === race3; const c = Number(W[match ? "forge|s4match" : "forge|s4other"]) || 0; eff = c * om * v / 100; s4 *= 1 + eff; }
      lines.push({ slot: s, name: opt[0], value: v, over: raw > opt[2], min: opt[1], max: opt[2], q: quality(v, opt[1], opt[2]), role, omega: om, eff });
    });
    const dmg = (1 + add) * mult;
    // ออปชันที่ใช้งานได้: ผลเทียบดาเมจ ≥ เกณฑ์ (ค่าเริ่มต้น 20%) หรือความเร็ว ≥ +0.2 (ASPD +2 ขึ้นไป / ASPD 14%)
    const thr = Number(W["forge|useful"] ?? 0.2);
    lines.forEach(l => { l.useful = l.role === "speed" ? l.eff >= 0.2 - 1e-9 : l.role !== "slot4" && l.eff >= thr - 1e-9; });
    return { lines, add, mult, dmg, speed, s4, power: dmg * speed, useful: lines.filter(l => l.useful).length };
  }

  // เส้นราคา: จุดอ้างอิง "curve|ค่าพลัง" = ราคา (z) ต่อกันแบบ log; นอกช่วงใช้ความชันของช่วงริมสุด
  // เส้นของอาวุธเฉพาะตัว: "curve@ชื่ออาวุธ|ค่าพลัง"; ไม่มีก็ใช้เส้นกลาง "curve|ค่าพลัง"
  const curvePrefix = weapon => "curve" + (weapon ? "@" + weapon : "") + "|";
  function anchors(W, weapon) {
    const pre = curvePrefix(weapon);
    return Object.keys(W).filter(k => k.startsWith(pre)).map(k => [Number(k.slice(pre.length)), Number(W[k])]).filter(a => a[0] > 0 && a[1] > 0).sort((a, b) => a[0] - b[0]);
  }
  const hasOwnCurve = (W, weapon) => !!weapon && anchors(W, weapon).length >= 2;
  // ต่อจุดแบบ log (ใช้กับทุกตาราง): pts = [[x, y], ...] เรียงตาม x
  function interpLog(pts, x) {
    if (!pts.length) return 0; if (pts.length === 1) return pts[0][1];
    x = Math.max(pts[0][0] - 0.3, Math.min(x, pts[pts.length - 1][0] + 0.3)); // ต่อเส้นเกินจุดริมได้ไม่เกิน 0.3 กันราคาพุ่ง
    let i = pts.findIndex(a => a[0] >= x);
    if (i === 0) i = 1; else if (i < 0) i = pts.length - 1;
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], t = (x - x0) / (x1 - x0);
    return Math.max(0, Math.exp(Math.log(y0) + t * (Math.log(y1) - Math.log(y0))));
  }
  const table = (W, pre) => Object.keys(W).filter(k => k.startsWith(pre)).map(k => [Number(k.slice(pre.length)), Number(W[k])]).filter(a => a[0] > 0 && a[1] > 0).sort((a, b) => a[0] - b[0]);
  // เส้นกลาง: ราคาตามความเร็ว "speed|ความเร็ว" = z และตัวคูณจากดาเมจ "dmgx|ตัวคูณดาเมจ" = เท่า
  // ตารางเฉพาะอาวุธ: "speed@อาวุธ|…" / "dmgx@อาวุธ|…" (ถ้ามี ≥ 2 จุด ใช้แทนของกลาง)
  const hasOwnTF = (W, weapon) => !!weapon && (table(W, "speed@" + weapon + "|").length >= 2 || table(W, "dmgx@" + weapon + "|").length >= 2);
  const tfPre = (W, kind, weapon) => weapon && table(W, kind + "@" + weapon + "|").length >= 2 ? kind + "@" + weapon + "|" : kind + "|";
  const speedPrice = (sp, W, weapon) => interpLog(table(W, tfPre(W, "speed", weapon)), sp);
  const dmgMult = (d, W, weapon) => interpLog(table(W, tfPre(W, "dmgx", weapon)), d);
  function curvePrice(P, W, weapon) { return interpLog(anchors(W, weapon), P); }


  // ค่าตีบวก: "refine|ระดับ" = ราคาใบการันตี (บาท) บวกตรงๆ แปลงเป็น z ด้วย "thb|perM"
  function refineZ(level, W) {
    const baht = Number(W["refine|" + level]) || 0, rate = Number(W["thb|perM"]) || 0;
    return baht && rate ? Math.round(baht / rate * 1e6) : 0;
  }
  // "+9 Very Very ..." บรรทัดชื่อไอเทม → 9
  function refineFromText(text) { const m = String(text || "").match(/(?:^|\n)\s*\+\s?(\d{1,2})\s+[A-Za-z]/); return m ? Math.min(20, parseInt(m[1], 10)) : 0; }

  // ชุดออปชันที่เข้าคู่กัน (จาก weights.js: window.COMBOS) → ตัวคูณราคา
  function comboOf(lines, W, weapon) {
    const sets = ((root.COMBOS || {})[weapon]) || [], min = Number(W["combo|min"] ?? 0.15);
    let best = { n: 0, mult: 1, names: [] };
    sets.forEach(set => {
      const hit = lines.filter(l => l.role !== "slot4" && (l.role === "speed" ? false : l.eff >= min - 1e-9) && set.some(k => new RegExp("\\b" + k + "\\b").test(l.name)));
      const n = new Set(hit.map(l => l.slot)).size;
      const mult = n >= 3 ? Number(W["combo|x3"] ?? 4) : n === 2 ? Number(W["combo|x2"] ?? 2) : 1;
      if (mult > best.mult) best = { n, mult, names: hit.map(l => l.name) };
    });
    return best;
  }

  function forgePrice(type, picks, W, recipe, sub, refine) {
    const name = recipe ? recipe[0] : "", own = hasOwnCurve(W, name), ownTF = !own && hasOwnTF(W, name);
    const pw = forgePower(type, picks, W, name);
    const explicit = name && W["demand|" + name] !== undefined;
    const sf = sizeFactor(name, W);
    // อาวุธที่ยังไม่มีราคาจริง: ความต้องการตามเลเวลอาวุธ (Lv 3 แพงสุดเสมอ) × ความครอบคลุมขนาด (ปรับเล็กน้อยในเลเวลเดียวกัน)
    const lv = recipe ? recipe[1] : 3, lvKey = "demand|lv" + lv;
    const base = W[lvKey] !== undefined ? Number(W[lvKey]) : Number(W["demand|*"] ?? 1);
    const demand = own || (ownTF && table(W, "speed@" + name + "|").length >= 2) ? 1 : explicit ? Number(W["demand|" + name]) : +(base * sf).toFixed(3);
    const d = isFinite(demand) ? demand : 1;
    const sz = own ? 0 : speedPrice(pw.speed, W, name), gx = own ? 0 : dmgMult(pw.dmg, W, name);
    const combo = comboOf(pw.lines, W, name);
    const market = Math.round((own ? curvePrice(pw.power, W, name) : sz * gx * d) * pw.s4 * combo.mult);
    const fc = forgeCost(recipe, W, sub);
    const rz = refineZ(refine || 0, W);
    return { ...pw, combo, own, ownTF, demand, demandAuto: !own && !ownTF && !explicit, sizeF: sf, lv, lvBase: base, size: sizeModOf(name), speedZ: sz, dmgX: gx, market, fc, refine: refine || 0, refineZ: rz, total: Math.max(market, fc.expected) + rz, floored: fc.expected > market };
  }

  /* ---------- OCR matching ---------- */
  const norm = s => String(s).toLowerCase().replace(/\(mhp\)|\(msp\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  function bigrams(s) { const t = s.replace(/ /g, ""), out = new Map(); for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); out.set(g, (out.get(g) || 0) + 1); } return out; }
  function dice(a, b) {
    const A = bigrams(a), B = bigrams(b); let inter = 0, na = 0, nb = 0;
    A.forEach(v => na += v); B.forEach(v => nb += v);
    A.forEach((v, g) => { if (B.has(g)) inter += Math.min(v, B.get(g)); });
    return na + nb ? 2 * inter / (na + nb) : 0;
  }
  // ชื่อเรียกอื่นที่มักเจอใน tooltip
  const ALIAS = [[/\bmax\s*hp\b|\bmhp\b/g, "maxhp"], [/\bmax\s*sp\b|\bmsp\b/g, "maxsp"], [/\bcrit(ical)?\b(?! damage)/g, "cri"], [/demi\s*human/g, "demi human"],
    [/\bphysical\b/g, "phys"], [/\bdefen[cs]e\b/g, "def"], [/\bphys\s+def\s+of\s+(?:the\s+)?([a-z][a-z ]*?)\s+(?:monsters?|enemies|race|targets?)\b/g, "$1 phys def"], [/\bagainst\b/g, "to"], [/\b(small|medium|large)\s+size(?:d)?\s+(?:enemies|monsters|targets)\b/g, "$1 targets"]];
  function canon(s) { let t = norm(s); ALIAS.forEach(([re, r]) => t = t.replace(re, r)); return t; }

  /** อ่านทีละบรรทัด หาออปชันที่ตรงที่สุด + ตัวเลข แล้ววางลงช่องที่ว่าง */
  function matchText(type, text) {
    const cands = [];
    type.slots.forEach((pool, s) => pool.forEach(o => cands.push({ s, o, c: canon(o[0]).replace(/\s*\b(?:increase|reduction)\b\s*/g, " ").trim(), pct: /%/.test(o[0]) })));
    const found = [];
    // รวมบรรทัดที่ถูกตัดกลาง (เช่น "... Monsters +" แล้วขึ้นบรรทัดใหม่ "4%")
    const rawLines = String(text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean), lines = [];
    rawLines.forEach(l => {
      const prev = lines[lines.length - 1];
      if (prev === undefined || /:/.test(prev)) return lines.push(l);
      if (/^%$/.test(l)) lines[lines.length - 1] = prev + "%";                                   // "+32" / "%"
      else if (/\d$/.test(prev) && /^\d+(?:\.\d+)?\s*%$/.test(l)) lines[lines.length - 1] = prev + l; // "+1" / "8%"
      else if (/[+\-]\s*$/.test(prev) || /^[+\-]?\s*\d+(?:\.\d+)?\s*%?$/.test(l) && !/\d/.test(prev)) lines[lines.length - 1] = prev + " " + l;
      else lines.push(l);
    });
    lines.forEach(raw => {
      if (/:/.test(raw)) return; // บรรทัดข้อมูลไอเทม เช่น "ATK : 140" ไม่ใช่ออปชัน
      raw = raw.replace(/\([^)]*[a-z][^)]*\)/gi, " "); // ตัดคำอธิบายในวงเล็บ เช่น "(After Attack Delay Reduction)"
      const nums = raw.match(/\d+(?:\.\d+)?/g); if (!nums) return;
      const hasPct = /%/.test(raw);
      const line = canon(raw.replace(/[+\-]?\d+(?:\.\d+)?\s*%?/g, " ")).replace(/\s*\b(?:increase|reduction)\b\s*/g, " ").trim();
      if (line.length < 2) return;
      let best = null;
      cands.forEach(c => {
        let sc = line === c.c ? 1.2 : dice(line, c.c);
        if (c.pct !== hasPct) sc -= 0.15;
        if (!best || sc > best.sc) best = { ...c, sc };
      });
      if (best && best.sc >= 0.72) found.push({ name: best.o[0], value: parseFloat(nums[nums.length - 1]), sc: best.sc });
    });
    const picks = type.slots.map(() => null); let n = 0;
    found.forEach(f => {
      const s = type.slots.findIndex((pool, i) => !picks[i] && pool.some(o => o[0] === f.name));
      if (s >= 0) { picks[s] = { name: f.name, value: f.value }; n++; }
    });
    return { picks, count: n };
  }

  /** นับ "Very" หน้าคำว่า Strong = จำนวน Star Crumb */
  function starsFromText(text) { const m = String(text || "").match(/((?:very\s*)+)strong/i); return m ? Math.min(3, (m[1].match(/very/gi) || []).length) : 0; }

  /** หาชื่ออาวุธจากบรรทัดชื่อไอเทมเท่านั้น (บรรทัดก่อนคำอธิบาย/Type) ต้องตรงทั้งคำ; ไม่เจอ = "" */
  function weaponFromText(text, names) {
    const lines = String(text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const title = lines.slice(0, 1).filter(l => !/:/.test(l)).join(" ").replace(/^\+\s?\d+\s*/, "").replace(/(?:very\s*)*strong/ig, " ").replace(/\[\d\]/g, " ");
    const hit = names.filter(n => new RegExp("(^|[^a-z])" + n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z]|$)", "i").test(title)).sort((a, b) => b.length - a.length);
    return hit[0] || "";
  }

  const api = { comboOf, sizeModOf, sizeFactor, weaponFromText, hasOwnTF, tfPre, interpLog, table, speedPrice, dmgMult, refineZ, refineFromText, hasOwnOmega, omegaKey, curvePrefix, hasOwnCurve, roleOf, forgePower, curvePrice, anchors, forgePrice, starsFromText, DEFAULT_CFG, wkey, quality, optionValue, price, matchText, unitPrice, forgeCost };
  root.CALC = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
