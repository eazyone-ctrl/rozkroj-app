/* Optymalizator rozkroju płyt (cięcia gilotynowe).
 *
 * Cel (tylko materiał, liczba cięć nie ma wpływu), w tej kolejności:
 *   1. wszystkie formatki rozmieszczone,
 *   2. jak najmniejsza łączna powierzchnia zużytych płyt (mniej odpadu),
 *   3. formatki w zwartym bloku: jak najmniej odpadu między formatkami
 *      (wolne kawałki poza dwoma największymi na płycie; blok w rogu zostawia
 *      resztkę w kształcie litery L, czyli dwa prostokąty, i ma wynik 0),
 *   4. jak największe całe kawałki odpadu: najpierw największy, potem kolejne
 *      (liczą się prostokąty, które da się wyciąć cięciem gilotynowym,
 *      z krótszym bokiem co najmniej MIN_SIDE mm),
 *   5. ostatnia płyta jak najmniej zajęta, pozostałe po kolei jak najpełniej.
 * Długość i liczba cięć są tylko liczone i pokazywane.
 *
 * Każda płyta jest układana z pozostałych formatek przez kilka generatorów
 * i wybierany jest najlepszy wzór:
 *   - "wolne prostokąty": dowolne cięcie gilotynowe, różne reguły dopasowania,
 *   - "pasy" (3 etapy, jak na pile panelowej): cięcie wzdłużne na pasy,
 *     poprzeczne na kolumny, w kolumnie ewentualnie piętrowanie; pasy wzdłuż
 *     i w poprzek płyty; daje inne układy niż wolne prostokąty,
 *     często ciaśniejsze przy powtarzalnych formatkach.
 * Nad tym działa wielostart + przeszukiwanie lokalne (zamiany kolejności,
 * przesuwanie formatek z najsłabszej płyty na początek) w zadanym czasie.
 *
 * Całość jest w jednej funkcji, żeby dało się ją uruchomić w Web Workerze
 * zbudowanym z Function.toString() (działa też z file://).
 */
function rozkrojCore() {
  var EPS = 1e-6;

  /* ---------- Generator 1: wolne prostokąty, cięcia gilotynowe ---------- */
  function packFree(items, SL, SW, kerf, split, fit) {
    var free = [{ x: 0, y: 0, w: SL, h: SW }], placed = [], used = {}, cut = 0, cuts = 0, area = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i], best = null, bs = Infinity, bs2 = Infinity;
      for (var fi = 0; fi < free.length; fi++) {
        var f = free[fi];
        for (var o = 0; o < 2; o++) {
          if (o === 1 && (!it.rot || it.l === it.w)) break;
          var a = o ? it.w : it.l, b = o ? it.l : it.w;
          if (a > f.w + EPS || b > f.h + EPS) continue;
          var dw = f.w - a, dh = f.h - b, s, s2;
          if (fit === 'bssf') { s = Math.min(dw, dh); s2 = Math.max(dw, dh); }
          else if (fit === 'blsf') { s = Math.max(dw, dh); s2 = Math.min(dw, dh); }
          else { s = f.w * f.h - a * b; s2 = Math.min(dw, dh); }
          if (s < bs - EPS || (Math.abs(s - bs) <= EPS && s2 < bs2)) { bs = s; bs2 = s2; best = { fi: fi, a: a, b: b }; }
        }
      }
      if (!best) continue;
      var fr = free[best.fi], pa = best.a, pb = best.b, ddw = fr.w - pa, ddh = fr.h - pb;
      var rw = ddw - kerf, bh = ddh - kerf, horiz;
      if (split === 'sls') horiz = ddw <= ddh;
      else if (split === 'lls') horiz = ddw > ddh;
      else if (split === 'h') horiz = true;
      else if (split === 'v') horiz = false;
      else {
        var r0 = Math.max(rw, 0), b0 = Math.max(bh, 0);
        horiz = Math.max(r0 * pb, fr.w * b0) >= Math.max(r0 * fr.h, pa * b0);
      }
      free.splice(best.fi, 1);
      if (horiz) {
        if (rw > EPS) free.push({ x: fr.x + pa + kerf, y: fr.y, w: rw, h: pb });
        if (bh > EPS) free.push({ x: fr.x, y: fr.y + pb + kerf, w: fr.w, h: bh });
        if (ddh > EPS) { cut += fr.w; cuts++; }
        if (ddw > EPS) { cut += pb; cuts++; }
      } else {
        if (rw > EPS) free.push({ x: fr.x + pa + kerf, y: fr.y, w: rw, h: fr.h });
        if (bh > EPS) free.push({ x: fr.x, y: fr.y + pb + kerf, w: pa, h: bh });
        if (ddw > EPS) { cut += fr.h; cuts++; }
        if (ddh > EPS) { cut += pa; cuts++; }
      }
      placed.push({ pi: it.pi, x: fr.x, y: fr.y, a: pa, b: pb });
      used[i] = 1; area += pa * pb;
    }
    return { placed: placed, used: used, free: free, cut: cut, cuts: cuts, area: area };
  }

  /* ---------- Generator 2: pasy (cięcie 3-etapowe) ---------- */
  // Pasy biegną wzdłuż osi X (długość SL), układane jeden pod drugim w osi Y.
  // Kierunek poprzeczny uzyskuje się przez transpozycję (packStripsDir).
  function packStrips(items, SL, SW, kerf, sel) {
    var n = items.length, used = {}, placed = [], free = [], cut = 0, cuts = 0, area = 0, y = 0;
    function orients(it) { var r = [[it.l, it.w]]; if (it.rot && Math.abs(it.l - it.w) > EPS) r.push([it.w, it.l]); return r; }

    function buildStrip(H, taken) {
      var pl = [], x = 0, ar = 0, ct = 0, cn = 0, fr = [], tk = {};
      for (var i = 0; i < n; i++) {
        if (used[i] || tk[i]) continue;
        var os = orients(items[i]), pick = null;
        for (var k = 0; k < os.length; k++) {
          var a = os[k][0], b = os[k][1];
          if (b > H + EPS || a > SL - x + EPS) continue;
          // najlepiej dokładnie na wysokość pasa, potem jak najwyżej
          if (!pick || b > pick[1] + EPS || (Math.abs(b - pick[1]) <= EPS && a < pick[0])) pick = [a, b];
        }
        if (!pick) continue;
        var cw = pick[0], cy = pick[1];
        tk[i] = 1; pl.push({ i: i, x: x, y: 0, a: cw, b: cy }); ar += cw * cy;
        if (cw < SL - x - EPS) { ct += H; cn++; } // cięcie poprzeczne kończące kolumnę
        // piętrowanie w kolumnie
        while (H - cy - kerf > EPS) {
          var room = H - cy - kerf, bj = -1, bo = null;
          for (var j = 0; j < n; j++) {
            if (used[j] || tk[j]) continue;
            var oj = orients(items[j]);
            for (var q = 0; q < oj.length; q++) {
              var aa = oj[q][0], bb = oj[q][1];
              if (aa > cw + EPS || bb > room + EPS) continue;
              if (!bo || aa * bb > bo[0] * bo[1] + EPS) { bo = [aa, bb]; bj = j; }
            }
          }
          if (bj < 0) break;
          ct += cw; cn++; // cięcie oddzielające piętro
          tk[bj] = 1; pl.push({ i: bj, x: x, y: cy + kerf, a: bo[0], b: bo[1] }); ar += bo[0] * bo[1];
          if (bo[0] < cw - EPS) { ct += bo[1]; cn++; } // docięcie na szerokość
          cy += kerf + bo[1];
        }
        if (H - cy - kerf > EPS) fr.push({ x: x, y: cy + kerf, w: cw, h: H - cy - kerf });
        x += cw + kerf;
        if (x >= SL - EPS) break;
      }
      if (SL - x > EPS) fr.push({ x: x, y: 0, w: SL - x, h: H });
      return { pl: pl, ar: ar, ct: ct, cn: cn, fr: fr, tk: tk };
    }

    while (SW - y > EPS) {
      var avail = SW - y, cand = [], seen = {};
      for (var i = 0; i < n && cand.length < (sel === 'first' ? 1 : 10); i++) {
        if (used[i]) continue;
        var os = orients(items[i]);
        for (var k = 0; k < os.length; k++) {
          var b = os[k][1];
          if (b > avail + EPS || os[k][0] > SL + EPS) continue;
          var key = Math.round(b * 10);
          if (!seen[key]) { seen[key] = 1; cand.push(b); }
        }
      }
      if (!cand.length) break;
      var best = null;
      for (var c = 0; c < cand.length; c++) {
        var s = buildStrip(cand[c]);
        if (!s.pl.length) continue;
        var ratio = s.ar / (SL * cand[c]);
        if (!best || ratio > best.ratio + 1e-4 || (Math.abs(ratio - best.ratio) <= 1e-4 && s.ar > best.s.ar)) best = { ratio: ratio, s: s, H: cand[c] };
      }
      if (!best) break;
      var st = best.s, H = best.H;
      st.pl.forEach(function (p) { placed.push({ pi: items[p.i].pi, x: p.x, y: y + p.y, a: p.a, b: p.b }); used[p.i] = 1; });
      st.fr.forEach(function (f) { free.push({ x: f.x, y: y + f.y, w: f.w, h: f.h }); });
      area += st.ar; cut += st.ct; cuts += st.cn;
      if (avail - H > EPS) { cut += SL; cuts++; }
      y += H + kerf;
    }
    if (SW - y > EPS) free.push({ x: 0, y: y, w: SL, h: SW - y });
    return { placed: placed, used: used, free: free, cut: cut, cuts: cuts, area: area };
  }
  function packStripsDir(items, SL, SW, kerf, sel, dir) {
    if (!dir) return packStrips(items, SL, SW, kerf, sel);
    var t = items.map(function (it) { return { pi: it.pi, l: it.w, w: it.l, rot: it.rot }; });
    var r = packStrips(t, SW, SL, kerf, sel);
    r.placed = r.placed.map(function (p) { return { pi: p.pi, x: p.y, y: p.x, a: p.b, b: p.a }; });
    r.free = r.free.map(function (f) { return { x: f.y, y: f.x, w: f.h, h: f.w }; });
    return r;
  }

  /* ---------- Układanie kolejnych płyt ---------- */
  // Odpad między formatkami na płycie: wszystkie wolne kawałki poza dwoma
  // największymi użytecznymi. Zwarty blok formatek w rogu zostawia resztkę w
  // kształcie litery L = dokładnie dwa prostokąty, więc ma tu wynik 0.
  function scatterOf(free) {
    var fs = free.slice().sort(function (x, y) { return y.w * y.h - x.w * x.h; }), s = 0, kept = 0;
    fs.forEach(function (f) {
      if (kept < 2 && Math.min(f.w, f.h) >= MIN_SIDE) kept++;
      else s += f.w * f.h;
    });
    return s;
  }
  function maxRect(fr) { var m = 0; fr.forEach(function (f) { m = Math.max(m, f.w * f.h); }); return m; }
  // Lepszy wzór płyty: wyższe wykorzystanie, potem mniej odpadu między formatkami,
  // potem większy cały kawałek odpadu.
  function betterPattern(r, util, best) {
    if (!best) return true;
    if (util > best.util + 1e-5) return true;
    if (util < best.util - 1e-5) return false;
    if (r.area > best.r.area + 1) return true;
    if (r.area < best.r.area - 1) return false;
    var sa = scatterOf(r.free), sb = scatterOf(best.r.free);
    if (Math.abs(sa - sb) > 1e3) return sa < sb;
    return maxRect(r.free) > maxRect(best.r.free) + 1;
  }
  function runOnce(order, sts, o, cfg) {
    var remaining = order.slice(), left = sts.map(function (s) { return s.qty; }), sheets = [], guard = 0;
    while (remaining.length && guard++ < 1000) {
      var best = null;
      for (var si = 0; si < sts.length; si++) {
        if (left[si] <= 0) continue;
        var s = sts[si], cands = [];
        if (cfg.free) cands.push(packFree(remaining, s.UL, s.UW, o.kerf, cfg.split, cfg.fit));
        if (cfg.strips) {
          cands.push(packStripsDir(remaining, s.UL, s.UW, o.kerf, cfg.sel, 0));
          cands.push(packStripsDir(remaining, s.UL, s.UW, o.kerf, cfg.sel, 1));
        }
        for (var c = 0; c < cands.length; c++) {
          var r = cands[c];
          if (!r.placed.length) continue;
          var util = r.area / (s.L * s.W);
          if (betterPattern(r, util, best)) best = { util: util, r: r, si: si };
        }
      }
      if (!best) break;
      left[best.si]--;
      var st = sts[best.si], rr = best.r, trimCut = o.trim > 0 ? 2 * (st.UL + st.UW) : 0;
      rr.placed.forEach(function (p) { p.x += o.trim; p.y += o.trim; });
      rr.free.forEach(function (f) { f.x += o.trim; f.y += o.trim; });
      sheets.push({ si: best.si, ref: st.ref, L: st.L, W: st.W, placed: rr.placed, free: rr.free, area: rr.area,
        cut: rr.cut + trimCut, cuts: rr.cuts + (o.trim > 0 ? 4 : 0), items: remaining.filter(function (_, i) { return rr.used[i]; }) });
      remaining = remaining.filter(function (_, i) { return !rr.used[i]; });
    }
    var total = 0, cut = 0, cuts = 0, rem = [], scatter = 0;
    sheets.forEach(function (sh) {
      total += sh.L * sh.W; cut += sh.cut; cuts += sh.cuts;
      sh.scatter = scatterOf(sh.free); scatter += sh.scatter;
      // wolne prostokąty z cięć gilotynowych = kawałki, które piła faktycznie wytnie w całości
      sh.free.forEach(function (f) { if (Math.min(f.w, f.h) >= MIN_SIDE) rem.push(f.w * f.h); });
    });
    rem.sort(function (x, y) { return y - x; });
    return { sheets: sheets, unplaced: remaining, total: total, maxFree: rem[0] || 0, rem: rem.slice(0, 5), scatter: scatter, cut: cut, cuts: cuts, order: order };
  }
  // Węższe paski nie liczą się jako użyteczny odpad.
  var MIN_SIDE = 100;
  // Wykorzystanie płyt od najpełniejszej (do trybu "zapełniaj pierwsze płyty").
  function fillVec(r) {
    if (!r.fill) r.fill = r.sheets.map(function (s) { return s.area / (s.L * s.W); }).sort(function (x, y) { return y - x; });
    return r.fill;
  }
  // Tylko materiał: wszystko się mieści → najmniejsza powierzchnia płyt →
  // najmniej odpadu między formatkami (formatki w zwartym bloku) →
  // jak największe całe kawałki odpadu (największy, potem kolejne) →
  // ostatnia płyta jak najmniej zajęta → pozostałe płyty po kolei jak najpełniej.
  // Cięcia nie mają wpływu.
  function better(a, b) {
    if (!b) return true;
    if (a.unplaced.length !== b.unplaced.length) return a.unplaced.length < b.unplaced.length;
    if (Math.abs(a.total - b.total) > 1) return a.total < b.total;
    if (Math.abs(a.scatter - b.scatter) > 1e4) return a.scatter < b.scatter; // różnica > 0,01 m²
    for (var k = 0; k < 5; k++) {
      var ra = a.rem[k] || 0, rb = b.rem[k] || 0;
      if (Math.abs(ra - rb) > 1e4) return ra > rb; // różnica > 0,01 m²
    }
    var va = fillVec(a), vb = fillVec(b), la = va[va.length - 1], lb2 = vb[vb.length - 1];
    if (va.length === vb.length && Math.abs(la - lb2) > 5e-4) return la < lb2;
    for (var i = 0; i < Math.min(va.length, vb.length); i++) if (Math.abs(va[i] - vb[i]) > 5e-4) return va[i] > vb[i];
    return false;
  }

  // Dolna granica liczby płyt (z samej powierzchni), gdy jest jeden rodzaj płyty.
  function lowerBound(items, sts) {
    if (sts.length !== 1) return null;
    var a = 0; items.forEach(function (it) { a += it.l * it.w; });
    return Math.ceil(a / (sts[0].UL * sts[0].UW) - 1e-9);
  }

  function optimizeOne(parts, stocks, o, onProgress) {
    var items = [];
    parts.forEach(function (p, pi) { for (var k = 0; k < p.q; k++) items.push({ pi: pi, l: p.l, w: p.w, rot: p.r == null ? !o.grainAll : !!p.r }); });
    var sts = stocks.map(function (s, k) { return { ref: k, L: s.l, W: s.w, qty: s.q, UL: s.l - 2 * o.trim, UW: s.w - 2 * o.trim }; })
      .filter(function (s) { return s.UL > 0 && s.UW > 0 && s.qty > 0; });
    if (!items.length || !sts.length) return { sheets: [], unplaced: items, total: 0, maxFree: 0, cut: 0, cuts: 0, lb: null, done: true };
    var lb = lowerBound(items, sts);
    var keys = [
      function (a, b) { return b.l * b.w - a.l * a.w; },
      function (a, b) { return Math.max(b.l, b.w) - Math.max(a.l, a.w) || b.l * b.w - a.l * a.w; },
      function (a, b) { return b.l - a.l || b.w - a.w; },
      function (a, b) { return b.w - a.w || b.l - a.l; },
      function (a, b) { return (b.l + b.w) - (a.l + a.w); },
      function (a, b) { return Math.min(b.l, b.w) - Math.min(a.l, a.w) || Math.max(b.l, b.w) - Math.max(a.l, a.w); }
    ];
    var cfgs = [], splits = ['max', 'sls', 'lls', 'h', 'v'], fits = ['bssf', 'baf', 'blsf'];
    splits.forEach(function (sp) { fits.forEach(function (ft) { cfgs.push({ free: true, strips: false, split: sp, fit: ft }); }); });
    cfgs.push({ free: false, strips: true, sel: 'best' }, { free: false, strips: true, sel: 'first' });
    cfgs.push({ free: true, strips: true, split: 'max', fit: 'bssf', sel: 'best' }, { free: true, strips: true, split: 'sls', fit: 'baf', sel: 'best' });
    var budget = o.budget == null ? 3000 : o.budget, t0 = Date.now(), best = null, lastPost = t0;
    function out(done) {
      var r = best, sh = r.sheets.slice().sort(function (x, y) { return y.area / (y.L * y.W) - x.area / (x.L * x.W); });
      return { sheets: sh, unplaced: r.unplaced, total: r.total, maxFree: r.maxFree, scatter: r.scatter, cut: r.cut, cuts: r.cuts, lb: lb, done: done };
    }
    function consider(r) {
      if (better(r, best)) {
        best = r;
        if (onProgress && Date.now() - lastPost > 200) { lastPost = Date.now(); onProgress(out(false)); }
        return true;
      }
      return false;
    }
    // Faza 1: wszystkie kolejności × wszystkie konfiguracje.
    var orders = keys.map(function (k) { return items.slice().sort(k); });
    outer: for (var c = 0; c < cfgs.length; c++) for (var k = 0; k < orders.length; k++) {
      consider(runOnce(orders[k], sts, o, cfgs[c]));
      if (Date.now() - t0 > budget * 0.6 && best) break outer;
    }
    // Faza 2: przeszukiwanie lokalne wokół najlepszego (z rzadkimi restartami).
    var seed = 12345;
    function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
    var cur = best, curCfg = cfgs[0], n = 0, stale = 0;
    while (Date.now() - t0 < budget && items.length > 2 && n++ < 20000) {
      var base = stale > 60 ? orders[Math.floor(rnd() * orders.length)] : cur.order, ord = base.slice(), m = rnd();
      if (m < 0.35 && cur.sheets.length > 1) {
        // formatki z najsłabiej wykorzystanej płyty na początek kolejności
        var worst = null;
        cur.sheets.forEach(function (sh) { var u = sh.area / (sh.L * sh.W); if (!worst || u < worst.u) worst = { u: u, sh: sh }; });
        var set = new Set(worst.sh.items);
        ord = worst.sh.items.slice().sort(keys[Math.floor(rnd() * keys.length)]).concat(ord.filter(function (it) { return !set.has(it); }));
      } else if (m < 0.75) {
        var sw = 1 + Math.floor(rnd() * Math.max(1, Math.min(6, ord.length / 6)));
        for (var q = 0; q < sw; q++) { var i = Math.floor(rnd() * ord.length), j = Math.floor(rnd() * ord.length), tmp = ord[i]; ord[i] = ord[j]; ord[j] = tmp; }
      } else {
        // przesuń blok formatek w inne miejsce
        var a = Math.floor(rnd() * ord.length), len = 1 + Math.floor(rnd() * Math.min(8, ord.length - a)), blk = ord.splice(a, len), at = Math.floor(rnd() * (ord.length + 1));
        Array.prototype.splice.apply(ord, [at, 0].concat(blk));
      }
      var cfg = rnd() < 0.5 ? curCfg : cfgs[Math.floor(rnd() * cfgs.length)];
      var r = runOnce(ord, sts, o, cfg);
      if (consider(r)) { cur = r; curCfg = cfg; stale = 0; }
      else if (!better(cur, r)) { cur = r; curCfg = cfg; stale++; } // równie dobry: idź dalej (płaskowyż)
      else if (++stale > 120) { cur = best; stale = 0; }
    }
    return out(true);
  }

  /* ---------- Kilka płyt (dekorów) naraz ----------
     Formatka z płytą m (np. "U141 Różowy") trafia tylko na płyty o tym samym kodzie (pierwszy wyraz, bez wielkości liter).
     Formatki bez płyty idą na płyty bez kodu; gdy takich nie ma — na wszystkie. Gdy brak płyty o danym kodzie — też na płyty bez kodu / wszystkie.
     Każda grupa ma osobny rozkrój; budżet czasu dzielony proporcjonalnie do liczby sztuk. */
  function keyOf(v) { return String(v == null ? '' : v).trim().split(/\s+/)[0].toUpperCase(); }
  function optimize(parts, stocks, o, onProgress) {
    var groups = [], byKey = {};
    parts.forEach(function (p, pi) {
      var k = keyOf(p.m);
      if (!byKey[k]) { byKey[k] = { k: k, idx: [], qty: 0 }; groups.push(byKey[k]); }
      byKey[k].idx.push(pi); byKey[k].qty += p.q;
    });
    var plain = [], all = stocks.map(function (_, i) { return i; });
    stocks.forEach(function (s, i) { if (!keyOf(s.c)) plain.push(i); });
    if (groups.length <= 1 && (!groups.length || !groups[0].k) && !stocks.some(function (s) { return keyOf(s.c); }))
      return optimizeOne(parts, stocks, o, onProgress); // jak dawniej: jedna grupa, płyty bez kodów
    var total = 0; groups.forEach(function (g) { total += g.qty; });
    var budget = o.budget == null ? 3000 : o.budget;
    groups.forEach(function (g) {
      var match = g.k ? stocks.map(function (s, i) { return keyOf(s.c) === g.k ? i : -1; }).filter(function (i) { return i >= 0; }) : [];
      g.st = match.length ? match : (plain.length ? plain : all);
      g.missing = !!g.k && !match.length;
      g.budget = total ? budget * g.qty / total : 0;
    });
    function run(g, b, prog) {
      var r = optimizeOne(g.idx.map(function (pi) { return parts[pi]; }), g.st.map(function (si) { return stocks[si]; }), Object.assign({}, o, { budget: b }), prog);
      return remap(r, g);
    }
    function remap(r, g) {
      var out = Object.assign({}, r);
      out.sheets = r.sheets.map(function (sh) {
        var c = Object.assign({}, sh);
        c.ref = g.st[sh.ref]; c.key = g.k;
        c.placed = sh.placed.map(function (p) { return Object.assign({}, p, { pi: g.idx[p.pi] }); });
        return c;
      });
      out.unplaced = r.unplaced.map(function (it) { return Object.assign({}, it, { pi: g.idx[it.pi] }); });
      return out;
    }
    function combine(list, done) {
      var c = { sheets: [], unplaced: [], total: 0, maxFree: 0, scatter: 0, cut: 0, cuts: 0, lb: 0, done: done, missing: [] };
      list.forEach(function (r, gi) {
        c.sheets = c.sheets.concat(r.sheets); c.unplaced = c.unplaced.concat(r.unplaced);
        c.total += r.total || 0; c.maxFree = Math.max(c.maxFree, r.maxFree || 0); c.scatter += r.scatter || 0;
        c.cut += r.cut || 0; c.cuts += r.cuts || 0;
        c.lb = c.lb == null || r.lb == null ? null : c.lb + r.lb;
        if (groups[gi].missing) c.missing.push(groups[gi].k);
      });
      return c;
    }
    // szybki wynik dla wszystkich grup, potem po kolei dokładne liczenie
    var res = groups.map(function (g) { return run(g, 0); });
    if (onProgress) onProgress(combine(res, false));
    groups.forEach(function (g, gi) {
      res[gi] = run(g, g.budget, onProgress ? function (p) { res[gi] = remap(p, g); onProgress(combine(res, false)); } : null);
    });
    return combine(res, true);
  }

  return { optimize: optimize, keyOf: keyOf, packFree: packFree, packStrips: packStripsDir, lowerBound: lowerBound };
}
