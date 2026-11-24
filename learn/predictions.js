/* learn/predictions.js — 예측 장부 (Prediction Log).
 * 측정 전에 예측을 쓰고, 측정 후 실제값·틀린 이유를 채워 보정도(calibration)를 추적한다.
 * 저장은 study.js 의 Store 를 그대로 사용 (로컬 서버: progress/state.json, 웹: localStorage).
 * 사용자 입력은 전부 textContent 로만 렌더한다.
 */
(function () {
  "use strict";
  var C = window.Onboarding, Store = C.Store, el = C.el, txt = C.txt;
  var CATS = {
    cost: "비용 모델 (roofline·바이트·FLOPs)",
    system: "시스템 모델 (큐잉·스케줄러·배칭)",
    hw: "하드웨어·커널 (효율·대역폭·통신)",
    workload: "워크로드 가정 (분포·길이·트래픽)",
    measure: "측정 오류 (벤치·노이즈·워밍업)",
    other: "기타"
  };
  var BUCKETS = [[50, 59], [60, 69], [70, 79], [80, 89], [90, 99]];

  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function quarter(date) { var y = date.slice(0, 4), m = parseInt(date.slice(5, 7), 10); return y + "-Q" + (Math.floor((m - 1) / 3) + 1); }
  function num(v) { var x = parseFloat(String(v).replace(/,/g, "")); return isNaN(x) ? null : x; }
  function list() { if (!Array.isArray(Store.state.predictions)) Store.state.predictions = []; return Store.state.predictions; }
  function isHit(p) { return Math.abs(p.actual - p.predicted) <= (p.tol / 100) * Math.abs(p.predicted || 1); }
  function dirOk(p) {
    if (p.baseline == null) return null;
    var a = Math.sign(p.actual - p.baseline), b = Math.sign(p.predicted - p.baseline);
    return a === b;
  }

  /* ---------- form ---------- */
  function field(label, input, hint) {
    var w = el("label", { style: "display:block;margin:8px 0;font-size:13.5px" });
    w.appendChild(txt("div", { style: "font-weight:600" }, label));
    w.appendChild(input);
    if (hint) w.appendChild(txt("div", { class: "small" }, hint));
    return w;
  }
  function inp(attrs) { var i = el("input", Object.assign({ type: "text" }, attrs)); i.style.cssText = "width:100%;border:1px solid var(--line);border-radius:8px;padding:6px 8px;font:inherit;background:var(--bg)"; return i; }
  function area(attrs) { var t = el("textarea", attrs); t.style.cssText = "width:100%;min-height:60px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;font:inherit;background:var(--bg)"; return t; }

  function renderForm(box, rerender) {
    box.innerHTML = "";
    var ctx = inp({ placeholder: "m4 / work / incident-2027-03 …" });
    ctx.value = new URLSearchParams(location.search).get("ctx") || "";
    var change = area({ placeholder: "무엇을 바꾸나 — 예: decode CUDA graph 캡처 크기를 [1,2,4,8,16,24,32,48,64]로" });
    var metric = inp({ placeholder: "지표 — 예: TPOT p50 @ 동시성 32" });
    var unit = inp({ placeholder: "ms, tok/s, %, GB …" });
    var base = inp({ placeholder: "현재값 (없으면 비움)" });
    var pred = inp({ placeholder: "예상값" });
    var tol = inp({ value: "10" });
    var conf = el("select"); conf.style.cssText = "border:1px solid var(--line);border-radius:8px;padding:6px 8px;font:inherit;background:var(--bg)";
    [50, 60, 70, 80, 90, 95].forEach(function (c) { var o = el("option", { value: String(c) }); o.textContent = c + "%"; if (c === 70) o.selected = true; conf.appendChild(o); });
    var cat = el("select"); cat.style.cssText = conf.style.cssText;
    Object.keys(CATS).forEach(function (k) { var o = el("option", { value: k }); o.textContent = CATS[k]; cat.appendChild(o); });
    var reason = area({ placeholder: "근거 — 계산식, 참고한 수치·코드 경로. '왜 이 값인가'를 한두 줄로" });

    var g = el("div", { class: "grid2" });
    var L = el("div"), R = el("div");
    L.appendChild(field("맥락", ctx, "모듈 ID 또는 업무 태그"));
    L.appendChild(field("변경 / 가설", change));
    L.appendChild(field("근거", reason));
    R.appendChild(field("지표", metric));
    R.appendChild(field("단위", unit));
    R.appendChild(field("현재값 (baseline)", base, "있으면 '방향(좋아짐/나빠짐)'도 채점합니다"));
    R.appendChild(field("예상값", pred));
    R.appendChild(field("적중 허용 오차 (%)", tol, "|실제 − 예상| ≤ 오차% × |예상| 이면 적중"));
    R.appendChild(field("확신도", conf, "이 오차 안에 들어올 확률"));
    R.appendChild(field("예측이 기대는 주된 모델", cat, "틀렸을 때 어느 모델을 고칠지 미리 정해두기"));
    g.appendChild(L); g.appendChild(R); box.appendChild(g);
    var btn = el("button", { class: "b pri", type: "button" }, "예측 기록");
    var msg = el("span", { class: "small" });
    box.appendChild(btn); box.appendChild(msg);
    btn.onclick = function () {
      var p = num(pred.value);
      if (!change.value.trim() || !metric.value.trim() || p == null) { msg.textContent = " 변경·지표·예상값은 필수"; return; }
      list().push({
        id: "p" + Date.now().toString(36), created: today(), ctx: ctx.value.trim(), change: change.value.trim(),
        metric: metric.value.trim(), unit: unit.value.trim(), baseline: num(base.value), predicted: p,
        tol: num(tol.value) || 10, conf: parseInt(conf.value, 10), model: cat.value, reason: reason.value.trim(),
        status: "open"
      });
      Store.save(); rerender();
    };
  }

  /* ---------- open items ---------- */
  function renderOpen(box, rerender) {
    box.innerHTML = "";
    var open = list().filter(function (p) { return p.status === "open"; });
    if (!open.length) { box.appendChild(txt("p", { class: "small" }, "측정 대기 중인 예측이 없습니다.")); return; }
    open.slice().reverse().forEach(function (p) {
      var c = el("div", { class: "q" });
      var h = el("div", { class: "qh" });
      h.appendChild(txt("b", null, p.metric + " — 예상 " + p.predicted + (p.unit ? " " + p.unit : "") + " (±" + p.tol + "%, 확신 " + p.conf + "%)"));
      h.appendChild(txt("span", { class: "qid" }, p.created + " · " + (p.ctx || "-")));
      c.appendChild(h);
      c.appendChild(txt("div", { class: "prompt" }, p.change));
      if (p.reason) c.appendChild(txt("div", { class: "small" }, "근거: " + p.reason));
      if (p.baseline != null) c.appendChild(txt("div", { class: "small" }, "현재값: " + p.baseline));
      var row = el("div", { class: "grid2" });
      var act = inp({ placeholder: "실제값" });
      var cat = el("select"); cat.style.cssText = "border:1px solid var(--line);border-radius:8px;padding:6px 8px;font:inherit;background:var(--bg);width:100%";
      var o0 = el("option", { value: "" }); o0.textContent = "빗나갔다면 원인 분류"; cat.appendChild(o0);
      Object.keys(CATS).forEach(function (k) { var o = el("option", { value: k }); o.textContent = CATS[k]; cat.appendChild(o); });
      row.appendChild(field("실제값", act)); row.appendChild(field("틀린 이유 (빗나간 경우)", cat));
      c.appendChild(row);
      var lesson = area({ placeholder: "배운 것 — 다음엔 무엇을 고려할지 한 줄" });
      c.appendChild(field("배운 것", lesson));
      var close = el("button", { class: "b pri", type: "button" }, "측정 결과로 닫기");
      var del = el("button", { class: "b", type: "button" }, "삭제");
      c.appendChild(close); c.appendChild(del);
      close.onclick = function () {
        var a = num(act.value); if (a == null) return;
        p.actual = a; p.closed = today(); p.status = "closed"; p.hit = isHit(p);
        p.errCat = p.hit ? "" : (cat.value || "other"); p.lesson = lesson.value.trim();
        Store.save(); rerender();
      };
      del.onclick = function () { Store.state.predictions = list().filter(function (x) { return x !== p; }); Store.save(); rerender(); };
      box.appendChild(c);
    });
  }

  /* ---------- stats ---------- */
  function svgCalibration(closed) {
    var W = 360, H = 260, P = 36;
    var x = function (c) { return P + (c - 50) / 50 * (W - 2 * P); }, y = function (r) { return H - P - r * (H - 2 * P); };
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" style="max-width:420px;background:var(--card);border:1px solid var(--line);border-radius:10px">';
    s += '<line x1="' + x(50) + '" y1="' + y(0.5) + '" x2="' + x(100) + '" y2="' + y(1) + '" style="stroke:var(--gray-bd);stroke-dasharray:4 4"/>';
    s += '<line x1="' + P + '" y1="' + (H - P) + '" x2="' + (W - P) + '" y2="' + (H - P) + '" style="stroke:var(--line)"/><line x1="' + P + '" y1="' + P + '" x2="' + P + '" y2="' + (H - P) + '" style="stroke:var(--line)"/>';
    [50, 60, 70, 80, 90, 100].forEach(function (c) { s += '<text x="' + x(c) + '" y="' + (H - P + 16) + '" font-size="10" text-anchor="middle" style="fill:var(--muted)">' + c + "%</text>"; });
    [0, 0.5, 1].forEach(function (r) { s += '<text x="' + (P - 6) + '" y="' + (y(r) + 3) + '" font-size="10" text-anchor="end" style="fill:var(--muted)">' + Math.round(r * 100) + "%</text>"; });
    s += '<text x="' + (W / 2) + '" y="' + (H - 4) + '" font-size="10.5" text-anchor="middle" style="fill:var(--muted)">기록한 확신도</text>';
    s += '<text x="10" y="' + (H / 2) + '" font-size="10.5" text-anchor="middle" transform="rotate(-90 10 ' + (H / 2) + ')" style="fill:var(--muted)">실제 적중률</text>';
    BUCKETS.forEach(function (b) {
      var items = closed.filter(function (p) { return p.conf >= b[0] && p.conf <= b[1]; });
      if (!items.length) return;
      var rate = items.filter(function (p) { return p.hit; }).length / items.length;
      var mid = items.reduce(function (a, p) { return a + p.conf; }, 0) / items.length;
      var r = Math.min(14, 4 + Math.sqrt(items.length) * 2);
      s += '<circle cx="' + x(mid) + '" cy="' + y(rate) + '" r="' + r + '" style="fill:var(--blue-bg);stroke:var(--blue-ink)"/>';
      s += '<text x="' + (x(mid) + r + 3) + '" y="' + (y(rate) + 3) + '" font-size="10" style="fill:var(--ink)">n=' + items.length + "</text>";
    });
    return s + "</svg>";
  }

  function renderStats(box, qsel) {
    var all = list().filter(function (p) { return p.status === "closed"; });
    var q = qsel.value;
    var closed = q === "all" ? all : all.filter(function (p) { return quarter(p.closed) === q; });
    box.innerHTML = "";
    if (!closed.length) { box.appendChild(txt("p", { class: "small" }, "닫힌 예측이 아직 없습니다. 측정 후 '닫기'를 하면 보정도가 그려집니다.")); return; }
    var hits = closed.filter(function (p) { return p.hit; }).length;
    var withDir = closed.filter(function (p) { return dirOk(p) !== null; });
    var dirHits = withDir.filter(function (p) { return dirOk(p); }).length;
    var meanConf = closed.reduce(function (a, p) { return a + p.conf; }, 0) / closed.length;
    var brier = closed.reduce(function (a, p) { var f = p.conf / 100, o = p.hit ? 1 : 0; return a + (f - o) * (f - o); }, 0) / closed.length;
    var g = el("div", { class: "grid2" });
    var left = el("div", null, svgCalibration(closed) + '<div class="small">점이 점선(완벽한 보정)보다 아래면 과신, 위면 과소신.</div>');
    var right = el("div");
    right.innerHTML =
      "<table><tr><th>지표</th><th>값</th></tr>" +
      "<tr><td>닫힌 예측</td><td>" + closed.length + "</td></tr>" +
      "<tr><td>적중률 (오차 안)</td><td><b>" + Math.round(100 * hits / closed.length) + "%</b></td></tr>" +
      "<tr><td>평균 확신도</td><td>" + Math.round(meanConf) + "% → " + (meanConf / 100 > hits / closed.length + 0.05 ? "<span class='pill bad'>과신</span>" : meanConf / 100 < hits / closed.length - 0.05 ? "<span class='pill warn'>과소신</span>" : "<span class='pill ok'>보정 양호</span>") + "</td></tr>" +
      "<tr><td>방향 적중 (baseline 있는 것)</td><td>" + (withDir.length ? Math.round(100 * dirHits / withDir.length) + "% (" + withDir.length + ")" : "-") + "</td></tr>" +
      "<tr><td>Brier score (낮을수록 좋음)</td><td>" + brier.toFixed(3) + "</td></tr></table>";
    var misses = closed.filter(function (p) { return !p.hit; });
    var cnt = {}; misses.forEach(function (p) { cnt[p.errCat || "other"] = (cnt[p.errCat || "other"] || 0) + 1; });
    var keys = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; });
    var bars = "<div class='small' style='margin-top:10px'><b>빗나간 예측의 원인 분포</b> — 가장 긴 막대가 다음 분기 공부 주제</div>";
    keys.forEach(function (k) {
      var w = Math.round(100 * cnt[k] / misses.length);
      bars += "<div class='small' style='margin:4px 0'>" + CATS[k] + " · " + cnt[k] + "<div class='bar'><i style='width:" + w + "%;background:var(--red-bd)'></i></div></div>";
    });
    if (!misses.length) bars += "<div class='small'>빗나간 예측 없음 — 확신도를 너무 낮게 쓰고 있지 않은지 확인.</div>";
    right.innerHTML += bars;
    g.appendChild(left); g.appendChild(right); box.appendChild(g);
  }

  function renderClosed(box) {
    box.innerHTML = "";
    var closed = list().filter(function (p) { return p.status === "closed"; }).slice().reverse();
    if (!closed.length) return;
    var t = el("table");
    var hr = el("tr"); ["닫은 날", "맥락", "지표", "예상 → 실제", "확신", "결과", "원인", "배운 것"].forEach(function (h) { hr.appendChild(txt("th", null, h)); }); t.appendChild(hr);
    closed.forEach(function (p) {
      var tr = el("tr");
      [p.closed, p.ctx || "-", p.metric, p.predicted + " → " + p.actual + (p.unit ? " " + p.unit : ""), p.conf + "%"].forEach(function (v) { tr.appendChild(txt("td", null, String(v))); });
      var res = el("td", null, p.hit ? "<span class='pill ok'>적중</span>" : "<span class='pill bad'>빗나감</span>"); tr.appendChild(res);
      tr.appendChild(txt("td", null, p.hit ? "" : (CATS[p.errCat] || "")));
      tr.appendChild(txt("td", null, p.lesson || ""));
      t.appendChild(tr);
    });
    box.appendChild(t);
  }

  function reviewPrompt(q) {
    var closed = list().filter(function (p) { return p.status === "closed" && (q === "all" || quarter(p.closed) === q); });
    var slim = closed.map(function (p) { return { ctx: p.ctx, change: p.change, metric: p.metric, unit: p.unit, baseline: p.baseline, predicted: p.predicted, actual: p.actual, tol: p.tol, conf: p.conf, model: p.model, hit: p.hit, errCat: p.errCat, reason: p.reason, lesson: p.lesson }; });
    return "[예측 장부 분기 리뷰 요청] 범위: " + q + "\n" +
      "아래는 내가 측정 전에 쓴 예측과 실제 결과다. 다음을 해줘:\n" +
      "1) 보정도 진단 (확신도 구간별 적중률, 과신/과소신)\n2) 빗나간 예측들의 공통 원인 — 내 멘탈 모델의 어느 부분이 틀렸는지 구체적으로 (비용 모델/시스템 모델/하드웨어/워크로드)\n" +
      "3) 다음 분기 공부 주제 2개와 각각 읽을 1차 자료(arXiv 절 또는 커밋 고정 코드 경로)\n4) 근거가 약했던 예측 패턴\n맞장구 없이, 출처 규칙 지켜서.\n\n" + JSON.stringify(slim, null, 1);
  }

  function exportCSV() {
    var cols = ["id", "created", "closed", "ctx", "change", "metric", "unit", "baseline", "predicted", "actual", "tol", "conf", "model", "hit", "errCat", "reason", "lesson"];
    var esc = function (v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var csv = [cols.join(",")].concat(list().map(function (p) { return cols.map(function (c) { return esc(p[c]); }).join(","); })).join("\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "prediction-log.csv"; a.click();
  }

  C.bootPredictions = function () {
    Store.init().then(function () {
      var formBox = document.getElementById("p-form"), openBox = document.getElementById("p-open"),
        statBox = document.getElementById("p-stats"), closedBox = document.getElementById("p-closed"),
        qsel = document.getElementById("p-quarter"), mode = document.getElementById("p-mode");
      mode.textContent = Store.mode === "server" ? "저장: 로컬 서버 (learn/progress/state.json — git 에 안 올라감)" : "저장: 이 브라우저 localStorage — 백업은 CSV/JSON 내보내기";
      function fillQuarters() {
        var cur = qsel.value || "all"; qsel.innerHTML = "";
        var qs = {}; list().forEach(function (p) { if (p.closed) qs[quarter(p.closed)] = 1; });
        [["all", "전체 기간"]].concat(Object.keys(qs).sort().reverse().map(function (k) { return [k, k]; })).forEach(function (o) {
          var e = el("option", { value: o[0] }); e.textContent = o[1]; qsel.appendChild(e);
        });
        qsel.value = Array.prototype.some.call(qsel.options, function (o) { return o.value === cur; }) ? cur : "all";
      }
      function rerender() {
        fillQuarters(); renderForm(formBox, rerender); renderOpen(openBox, rerender); renderStats(statBox, qsel); renderClosed(closedBox);
        document.getElementById("p-count").textContent = "열린 예측 " + list().filter(function (p) { return p.status === "open"; }).length + " · 닫힌 예측 " + list().filter(function (p) { return p.status === "closed"; }).length;
      }
      qsel.onchange = function () { renderStats(statBox, qsel); };
      document.getElementById("p-review").onclick = function () { var b = this; C.copy(reviewPrompt(qsel.value)).then(function () { b.textContent = "복사됨 ✓"; setTimeout(function () { b.textContent = "Claude 분기 리뷰 프롬프트 복사"; }, 1500); }); };
      document.getElementById("p-csv").onclick = exportCSV;
      rerender();
    });
  };
})();
