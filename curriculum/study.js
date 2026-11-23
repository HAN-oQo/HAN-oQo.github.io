/* curriculum/study.js — 커리큘럼 학습 엔진 (빌드 없음).
 *
 * 저장 모드 두 가지:
 *  - server : `python3 tools/study_server.py` 로 띄운 로컬 서버. 진행 상태를
 *             curriculum/progress/state.json 에, Claude 채점 결과를
 *             curriculum/progress/feedback.json 에서 읽는다 (둘 다 gitignore).
 *  - local  : GitHub Pages 등 정적 호스팅. 브라우저 localStorage 에만 저장.
 * 콘텐츠(모듈·퀴즈)는 curriculum/data/*.json — 신뢰된 저자 콘텐츠라 HTML 허용.
 * 사용자 입력(답안)은 항상 textContent 로만 렌더한다.
 */
(function () {
  "use strict";
  var KEY = "curriculum-state-v1";
  var EMPTY = function () { return { answers: {}, checks: {}, feedback: {}, notes: {}, predictions: [] }; };

  var Store = {
    mode: "local", state: EMPTY(), serverFeedback: {},
    init: function () {
      var self = this;
      try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) self.state = Object.assign(EMPTY(), s); } catch (e) {}
      return fetch("/api/state", { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error("no server");
        return r.json();
      }).then(function (j) {
        self.mode = "server";
        if (j.state && Object.keys(j.state.answers || {}).length + Object.keys(j.state.checks || {}).length + (j.state.predictions || []).length > 0) {
          self.state = Object.assign(EMPTY(), j.state);
        }
        self.serverFeedback = j.feedback || {};
      }).catch(function () { self.mode = "local"; });
    },
    fb: function (qid) { return this.serverFeedback[qid] || this.state.feedback[qid] || null; },
    save: function () {
      try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) {}
      if (this.mode === "server") {
        fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(this.state) }).catch(function () {});
      }
    }
  };

  /* ---------- helpers ---------- */
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (html != null) e.innerHTML = html;
    return e;
  }
  function txt(tag, attrs, t) { var e = el(tag, attrs); e.textContent = t; return e; }
  function getJSON(u) { return fetch(u, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); }); }
  function qs(k) { return new URLSearchParams(location.search).get(k); }
  function copy(t) {
    if (navigator.clipboard) return navigator.clipboard.writeText(t);
    var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta); return Promise.resolve();
  }
  function kindTag(k) { var m = { paper: "논문", code: "코드", doc: "공식문서", blog: "2차자료" }; return '<span class="kind k-' + k + '">' + (m[k] || k) + "</span>"; }
  function resList(list) {
    if (!list || !list.length) return "";
    return '<ul class="res">' + list.map(function (r) {
      var a = r.url ? '<a href="' + r.url + '" target="_blank" rel="noopener">' + r.label + "</a>" : r.label;
      return "<li>" + kindTag(r.kind || "paper") + a + (r.note ? ' <span class="small">— ' + r.note + "</span>" : "") + "</li>";
    }).join("") + "</ul>";
  }
  function allQuestions(mod) { return [].concat(mod.diagnostic || [], mod.check || []); }

  /* answered & correctness, including Claude-graded text answers */
  function qStatus(q) {
    var a = Store.state.answers[q.id];
    if (!a) return "none";
    if (q.type === "text") {
      var f = Store.fb(q.id);
      if (!f) return "pending";
      return f.score >= 2 ? "ok" : (f.score >= 1 ? "partial" : "bad");
    }
    return a.ok ? "ok" : "bad";
  }
  function modProgress(mod) {
    var qsx = allQuestions(mod), done = 0, total = qsx.length;
    qsx.forEach(function (q) { var s = qStatus(q); if (s !== "none") done++; });
    var checks = (mod.done || []).length + ((mod.toy && mod.toy.done) || []).length + ((mod.lab && mod.lab.done) || []).length;
    var cdone = 0;
    Object.keys(Store.state.checks).forEach(function (k) { if (k.indexOf(mod.id + ":") === 0 && Store.state.checks[k]) cdone++; });
    total += checks; done += cdone;
    return { done: done, total: total, pct: total ? Math.round(100 * done / total) : 0 };
  }

  /* ---------- grading prompt (Claude) ---------- */
  function gradePrompt(mod, q, answer) {
    return [
      "[추론 도장 채점 요청] 모듈 " + mod.id.toUpperCase() + " · " + mod.title,
      "문항 ID: " + q.id,
      "문항: " + q.prompt.replace(/<[^>]+>/g, ""),
      "채점 기준(rubric):", (q.rubric || []).map(function (r, i) { return "  " + (i + 1) + ". " + r; }).join("\n"),
      "내 답안:", answer,
      "",
      "규칙: 0(오답)/1(부분)/2(정답)으로 채점하고, 맞은 부분은 인정하고 빠진 부분만 보완하라. 오해의 출처를 짚고 다시 읽을 자료(원 논문 절 또는 코드 경로)를 지목하라. 맞장구 금지.",
      "출력 마지막에 이 JSON 한 줄을 달아라: {\"" + q.id + "\": {\"score\": N, \"verdict\": \"한 줄\", \"comment\": \"보완 설명\"}}"
    ].join("\n");
  }

  /* ---------- question renderer ---------- */
  function renderQ(mod, q, idx, onChange) {
    var box = el("div", { class: "q", id: "q-" + q.id });
    var head = el("div", { class: "qh" });
    var typeName = { mcq: "객관식", num: "계산", text: "서술형" }[q.type] || q.type;
    head.appendChild(el("span", null, "<b>Q" + (idx + 1) + "</b> <span class=\"pill\">" + typeName + "</span>" + (q.topic ? '<span class="pill blue">' + q.topic + "</span>" : "")));
    var stat = el("span"); head.appendChild(stat);
    box.appendChild(head);
    box.appendChild(el("div", { class: "prompt" }, q.prompt));
    var exp = el("div", { class: "exp" }); exp.style.display = "none";
    var prev = Store.state.answers[q.id];

    function showExplain() {
      var html = "";
      if (q.explain) html += q.explain;
      if (q.pitfall) html += '<div class="call warn"><b>이걸 틀리면 실무에서:</b> ' + q.pitfall + "</div>";
      if (q.refs) html += "<div class=\"small\"><b>다시 볼 자료</b></div>" + resList(q.refs);
      exp.innerHTML = html; exp.style.display = html ? "block" : "none";
    }
    function paintStatus() {
      var s = qStatus(q);
      var m = { none: ["", ""], ok: ["정답", "ok"], bad: ["오답", "bad"], partial: ["부분 정답", "warn"], pending: ["Claude 채점 대기", "purple"] }[s];
      stat.innerHTML = m[0] ? '<span class="pill ' + m[1] + '">' + m[0] + "</span>" : '<span class="qid">' + q.id + "</span>";
    }

    if (q.type === "mcq") {
      var name = "r-" + q.id;
      var labels = q.options.map(function (o, i) {
        var lab = el("label", { class: "opt" });
        var inp = el("input", { type: "radio", name: name, value: String(i) });
        lab.appendChild(inp); lab.appendChild(el("span", null, " " + o));
        box.appendChild(lab); return lab;
      });
      var btn = el("button", { class: "b pri", type: "button" }, "제출");
      box.appendChild(btn);
      var mark = function (choice) {
        labels.forEach(function (l, i) { l.classList.remove("right", "wrong"); if (i === q.answer) l.classList.add("right"); else if (i === choice) l.classList.add("wrong"); });
        showExplain();
      };
      if (prev) { var c = prev.v; var r = box.querySelector('input[value="' + c + '"]'); if (r) r.checked = true; mark(c); }
      btn.onclick = function () {
        var sel = box.querySelector("input[name='" + name + "']:checked"); if (!sel) return;
        var c = parseInt(sel.value, 10);
        Store.state.answers[q.id] = { v: c, ok: c === q.answer, ts: Date.now() }; Store.save();
        mark(c); paintStatus(); onChange && onChange();
      };
    } else if (q.type === "num") {
      var row = el("div");
      var inp = el("input", { class: "num", type: "text", placeholder: "숫자" + (q.unit ? " (" + q.unit + ")" : "") });
      row.appendChild(inp); if (q.unit) row.appendChild(txt("span", { class: "small" }, " " + q.unit));
      var btn2 = el("button", { class: "b pri", type: "button" }, "제출"); row.appendChild(btn2);
      box.appendChild(row);
      var tol = q.tol == null ? 0.1 : q.tol;
      if (prev) { inp.value = prev.v; showExplain(); }
      btn2.onclick = function () {
        var v = parseFloat(String(inp.value).replace(/,/g, "")); if (isNaN(v)) return;
        var ok = Math.abs(v - q.answer) <= Math.abs(q.answer) * tol;
        Store.state.answers[q.id] = { v: v, ok: ok, ts: Date.now() }; Store.save();
        showExplain(); paintStatus(); onChange && onChange();
      };
      box.appendChild(el("div", { class: "small" }, "허용 오차 ±" + Math.round(tol * 100) + "%"));
    } else {
      var ta = el("textarea", { placeholder: "답을 쓰고 저장하세요. 채점은 Claude가 합니다 (로컬 세션: 자동 / 웹: 프롬프트 복사)." });
      if (prev) ta.value = prev.v;
      box.appendChild(ta);
      var save = el("button", { class: "b pri", type: "button" }, "저장");
      var cp = el("button", { class: "b", type: "button" }, "채점 프롬프트 복사");
      var showModel = el("button", { class: "b", type: "button" }, "답안 뼈대 보기");
      box.appendChild(save); box.appendChild(cp); box.appendChild(showModel);
      var fbBox = el("div", { class: "exp" }); fbBox.style.display = "none"; box.appendChild(fbBox);
      var model = el("div", { class: "exp" }); model.style.display = "none"; box.appendChild(model);
      var paintFb = function () {
        var f = Store.fb(q.id);
        if (!f) { fbBox.style.display = "none"; return; }
        fbBox.style.display = "block"; fbBox.innerHTML = "";
        var cls = f.score >= 2 ? "ok" : f.score >= 1 ? "warn" : "bad";
        var c = el("div", { class: "call " + cls });
        c.appendChild(txt("b", null, "Claude 채점 " + f.score + "/2 — " + (f.verdict || "")));
        if (f.comment) { var p = el("div"); p.textContent = f.comment; p.style.whiteSpace = "pre-wrap"; p.style.marginTop = "6px"; c.appendChild(p); }
        fbBox.appendChild(c);
      };
      paintFb();
      save.onclick = function () {
        if (!ta.value.trim()) return;
        var old = Store.state.answers[q.id];
        if (old && old.v !== ta.value) delete Store.state.feedback[q.id];
        Store.state.answers[q.id] = { v: ta.value, ok: null, ts: Date.now() }; Store.save();
        paintStatus(); onChange && onChange();
        save.textContent = "저장됨 ✓"; setTimeout(function () { save.textContent = "저장"; }, 1400);
      };
      cp.onclick = function () { copy(gradePrompt(mod, q, ta.value || "(미작성)")).then(function () { cp.textContent = "복사됨 ✓"; setTimeout(function () { cp.textContent = "채점 프롬프트 복사"; }, 1400); }); };
      showModel.onclick = function () {
        if (model.style.display === "block") { model.style.display = "none"; return; }
        var h = "";
        if (q.rubric) h += "<b>채점 기준</b><ul>" + q.rubric.map(function (r) { return "<li>" + r + "</li>"; }).join("") + "</ul>";
        if (q.model) h += "<b>답안 뼈대</b><div>" + q.model + "</div>";
        if (q.refs) h += resList(q.refs);
        model.innerHTML = h; model.style.display = "block";
      };
    }
    box.appendChild(exp);
    paintStatus();
    return box;
  }

  function checklist(prefix, items, onChange) {
    var wrap = el("div");
    (items || []).forEach(function (it, i) {
      var key = prefix + ":" + i;
      var lab = el("label", { class: "chk" });
      var cb = el("input", { type: "checkbox" }); cb.checked = !!Store.state.checks[key];
      cb.onchange = function () { Store.state.checks[key] = cb.checked; Store.save(); onChange && onChange(); };
      lab.appendChild(cb); lab.appendChild(el("span", null, it)); wrap.appendChild(lab);
    });
    return wrap;
  }

  function topicState(mod, topicId) {
    var qsx = (mod.diagnostic || []).filter(function (q) { return q.topic === topicId; });
    if (!qsx.length) return "none";
    var st = qsx.map(qStatus);
    if (st.every(function (s) { return s === "ok"; })) return "pass";
    if (st.some(function (s) { return s === "bad" || s === "partial"; })) return "weak";
    if (st.some(function (s) { return s === "pending"; })) return "pending";
    return "none";
  }

  /* ---------- module page ---------- */
  function renderModule(root, mod, index) {
    root.innerHTML = "";
    var crumbs = el("p", { class: "crumb" }, '<a href="../">Home</a> · <a href="./">Inference Dojo</a> · ' + mod.id.toUpperCase());
    root.appendChild(crumbs);
    root.appendChild(el("h1", null, mod.id.toUpperCase() + ". " + mod.title));
    root.appendChild(el("p", { class: "sub" }, "W" + mod.week + " · 약 " + mod.hours + "시간 · " + (mod.summary || "")));
    var progBox = el("div", { class: "box" }); root.appendChild(progBox);
    function paintProg() {
      var p = modProgress(mod);
      progBox.innerHTML = '<div class="small">진행도 ' + p.done + "/" + p.total + " (" + p.pct + '%) · <span class="mode">저장: ' + (Store.mode === "server" ? "로컬 서버 (progress/)" : "브라우저 localStorage") + "</span></div>" +
        '<div class="bar"><i style="width:' + p.pct + '%"></i></div>' +
        (mod.maps_to ? '<div class="small" style="margin-top:6px">대응 업무: ' + mod.maps_to.map(function (m) { return '<span class="pill">' + m + "</span>"; }).join("") + "</div>" : "") +
        (mod.jp ? '<div class="small">용어: ' + mod.jp.join(" · ") + "</div>" : "");
    }
    paintProg();

    var nav = el("div", { class: "mnav" },
      '<a href="#diag">① 사전 진단</a><a href="#topics">② 개념·자료</a><a href="#lab">③ 실전 랩</a><a href="#toy">④ 토이</a><a href="#check">⑤ 확인 퀴즈</a><a href="#interview">⑥ 면접</a><a href="#done">⑦ 완료 판정</a>');
    root.appendChild(nav);

    if (mod.prereq && mod.prereq.length) root.appendChild(el("div", { class: "small" }, "선행: " + mod.prereq.join(", ")));
    if (mod.goals) root.appendChild(el("div", { class: "box" }, "<b>학습 목표</b><ul>" + mod.goals.map(function (g) { return "<li>" + g + "</li>"; }).join("") + "</ul>"));
    if (mod.intro) root.appendChild(el("div", null, mod.intro));

    /* ① diagnostic */
    root.appendChild(el("h2", { id: "diag" }, "① 사전 진단"));
    root.appendChild(el("div", { class: "call" }, "이미 아는 토픽을 건너뛰기 위한 진단입니다. 토픽의 진단 문항을 모두 맞히면 ② 에서 그 토픽이 <b>건너뛰기 가능</b>으로 표시됩니다. 서술형은 Claude 채점 후 반영됩니다."));
    var topicsBox; // forward
    var refreshAll = function () { paintProg(); paintTopics(); };
    (mod.diagnostic || []).forEach(function (q, i) { root.appendChild(renderQ(mod, q, i, refreshAll)); });

    /* ② topics */
    root.appendChild(el("h2", { id: "topics" }, "② 핵심 개념과 자료 (짧게, 출처 중심)"));
    topicsBox = el("div"); root.appendChild(topicsBox);
    function paintTopics() {
      topicsBox.innerHTML = "";
      (mod.topics || []).forEach(function (t) {
        var s = topicState(mod, t.id);
        var badge = { pass: '<span class="pill ok">진단 통과 → 건너뛰기 가능</span>', weak: '<span class="pill bad">진단 약함 → 집중</span>', pending: '<span class="pill purple">채점 대기</span>', none: '<span class="pill">미진단</span>' }[s];
        var d = el("details", { class: "box" });
        if (s !== "pass") d.setAttribute("open", "");
        d.innerHTML = "<summary><b>" + t.name + "</b> " + badge + "</summary>" +
          (t.pitfall ? '<div class="call warn"><b>모르면 틀리는 판단:</b> ' + t.pitfall + "</div>" : "") +
          (t.body || "") + resList(t.read);
        topicsBox.appendChild(d);
      });
    }
    paintTopics();

    /* ③ real-engine lab */
    if (mod.lab) {
      root.appendChild(el("h2", { id: "lab" }, "③ 실전 랩 — 실제 엔진을 고치거나 확장하기"));
      var L = mod.lab;
      var lb = el("div", { class: "box" });
      lb.innerHTML = "<h3 style='margin-top:0'>" + L.title + "</h3>" +
        (L.why ? '<div class="small">' + L.why + "</div>" : "") +
        (L.steps ? "<ol>" + L.steps.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ol>" : "") +
        (L.gpu ? '<div class="call ok"><b>(a) 단일 GPU:</b> ' + L.gpu + "</div>" : "") +
        (L.nogpu ? '<div class="call"><b>(b) GPU 없이:</b> ' + L.nogpu + "</div>" : "") +
        resList(L.read);
      root.appendChild(lb);
      if (L.done) { root.appendChild(el("div", { class: "small" }, "<b>랩 완료 조건</b>")); root.appendChild(checklist(mod.id + ":lab", L.done, paintProg)); }
    }

    /* ④ toy project */
    if (mod.toy) {
      var T = mod.toy;
      root.appendChild(el("h2", { id: "toy" }, "④ 토이 프로젝트 — " + T.title));
      var tb = el("div", { class: "box" });
      tb.innerHTML = (T.maps_to ? '<div class="small">대응 업무: ' + T.maps_to + "</div>" : "") +
        '<div class="small">예상 소요: ' + (T.hours || "?") + "시간</div>" +
        (T.spec ? "<b>스펙</b><ul>" + T.spec.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ul>" : "") +
        (T.gpu ? '<div class="call ok"><b>(a) 단일 GPU판:</b> ' + T.gpu + "</div>" : "") +
        (T.nogpu ? '<div class="call"><b>(b) GPU 없는 판:</b> ' + T.nogpu + "</div>" : "");
      root.appendChild(tb);
      if (T.done) { root.appendChild(el("div", { class: "small" }, "<b>완료 조건</b>")); root.appendChild(checklist(mod.id + ":toy", T.done, paintProg)); }
      root.appendChild(el("div", { class: "call" }, "측정하기 <b>전에</b> 예측부터 → <a href='predictions.html?ctx=" + mod.id + "'>예측 장부에 기록</a> (변경, 예상 수치, 확신도, 근거)"));
      if (T.hints) {
        root.appendChild(el("div", { class: "small", style: "margin-top:10px" }, "<b>막혔을 때 — 힌트는 순서대로 하나씩 여세요</b>"));
        T.hints.forEach(function (h, i) { root.appendChild(el("details", { class: "hint" }, "<summary>힌트 " + (i + 1) + "</summary>" + h)); });
      }
    }

    /* ⑤ check quiz */
    root.appendChild(el("h2", { id: "check" }, "⑤ 확인 퀴즈"));
    if (mod.check && mod.check.length) {
      mod.check.forEach(function (q, i) { root.appendChild(renderQ(mod, q, i, refreshAll)); });
    } else {
      root.appendChild(el("div", { class: "call warn" }, "확인 퀴즈는 진단 결과(약한 토픽)에 맞춰 <b>공부 세션에서 Claude가 생성</b>합니다. 레포에서 Claude를 열고 <code>공부 띄워줘</code> 또는 <code>" + mod.id.toUpperCase() + " 확인 퀴즈 만들어줘</code> 라고 하세요. 생성된 문항은 <code>curriculum/data/" + mod.id + ".json</code> 에 추가됩니다."));
    }

    /* ⑥ interview */
    root.appendChild(el("h2", { id: "interview" }, "⑥ 면접 질문"));
    (mod.interview || []).forEach(function (iq, i) {
      var d = el("div", { class: "q" });
      d.innerHTML = "<div class='prompt'><b>I" + (i + 1) + ".</b> " + iq.q + "</div>";
      var det = el("details", { class: "hint" }, "<summary>좋은 답변의 뼈대</summary><ul>" + iq.skeleton.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ul>");
      d.appendChild(det); root.appendChild(d);
    });

    /* ⑦ done */
    root.appendChild(el("h2", { id: "done" }, "⑦ 모듈 완료 판정"));
    root.appendChild(checklist(mod.id + ":done", mod.done, paintProg));

    /* prev / next */
    var i = index.modules.findIndex(function (m) { return m.id === mod.id; });
    var pn = el("div", { class: "box small" });
    var prevM = index.modules[i - 1], nextM = index.modules[i + 1];
    pn.innerHTML = (prevM ? '← <a href="module.html?m=' + prevM.id + '">' + prevM.id.toUpperCase() + ". " + prevM.title + "</a>" : "") +
      (prevM && nextM ? " &nbsp;|&nbsp; " : "") +
      (nextM ? '<a href="module.html?m=' + nextM.id + '">' + nextM.id.toUpperCase() + ". " + nextM.title + "</a> →" : "");
    root.appendChild(pn);
    if (location.hash) { var t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
  }

  /* ---------- dashboard ---------- */
  function renderDashboard(root, index, mods) {
    var tgt = root.querySelector("#dash"); if (!tgt) return;
    tgt.innerHTML = "";
    var next = null;
    index.modules.forEach(function (m) {
      var mod = mods[m.id]; var p = mod ? modProgress(mod) : { pct: 0, done: 0, total: 0 };
      if (!next && p.pct < 100) next = m;
      var a = el("a", { class: "card", href: "module.html?m=" + m.id });
      a.innerHTML = '<span class="pill blue">W' + m.week + "</span><span class=\"pill\">" + m.hours + "h</span>" + (m.weak ? '<span class="pill warn">약점 영역</span>' : "") +
        "<h3>" + m.id.toUpperCase() + ". " + m.title + "</h3><p>" + m.summary + "</p>" +
        '<div class="bar"><i style="width:' + p.pct + '%"></i></div><div class="small">' + p.done + "/" + p.total + " · " + p.pct + "%</div>";
      tgt.appendChild(a);
    });
    var nx = root.querySelector("#next");
    if (nx && next) nx.innerHTML = '다음 할 일 → <a href="module.html?m=' + next.id + '"><b>' + next.id.toUpperCase() + ". " + next.title + "</b></a>";
    var md = root.querySelector("#mode");
    if (md) md.textContent = Store.mode === "server" ? "저장 모드: 로컬 서버 (curriculum/progress/ — git 에 안 올라감)" : "저장 모드: 이 브라우저 localStorage (기기 간 동기화 안 됨 — 백업 버튼 사용)";

    /* pending grading */
    var pend = [];
    index.modules.forEach(function (m) {
      var mod = mods[m.id]; if (!mod) return;
      allQuestions(mod).forEach(function (q) { if (q.type === "text" && qStatus(q) === "pending") pend.push(gradePrompt(mod, q, Store.state.answers[q.id].v)); });
    });
    var pb = root.querySelector("#pending");
    if (pb) {
      pb.innerHTML = "";
      pb.appendChild(el("span", { class: "small" }, "채점 대기 서술형: <b>" + pend.length + "</b>개 "));
      if (pend.length) {
        var b = el("button", { class: "b", type: "button" }, "전부 한 번에 채점 프롬프트 복사");
        b.onclick = function () { copy(pend.join("\n\n---\n\n")).then(function () { b.textContent = "복사됨 ✓"; }); };
        pb.appendChild(b);
      }
    }
  }

  function wireBackup(root, rerender) {
    var ex = root.querySelector("#btn-export"), im = root.querySelector("#btn-import"), fbb = root.querySelector("#btn-fb");
    if (ex) ex.onclick = function () {
      var blob = new Blob([JSON.stringify(Store.state, null, 2)], { type: "application/json" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "curriculum-progress.json"; a.click();
    };
    if (im) im.onclick = function () {
      var inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json";
      inp.onchange = function () {
        var f = inp.files[0]; if (!f) return; var r = new FileReader();
        r.onload = function () { try { Store.state = Object.assign(EMPTY(), JSON.parse(r.result)); Store.save(); rerender(); } catch (e) { alertBox("JSON 파싱 실패"); } };
        r.readAsText(f);
      }; inp.click();
    };
    if (fbb) fbb.onclick = function () {
      var ta = root.querySelector("#fb-in"); var raw = (ta.value || "").trim(); if (!raw) return;
      var objs = raw.match(/\{[\s\S]*\}/g) || []; var n = 0;
      objs.forEach(function (s) { try { var o = JSON.parse(s); Object.keys(o).forEach(function (k) { if (o[k] && typeof o[k].score === "number") { Store.state.feedback[k] = o[k]; n++; } }); } catch (e) {} });
      Store.save(); ta.value = ""; alertBox(n + "개 채점 결과 반영"); rerender();
    };
  }
  function alertBox(msg) { var m = document.getElementById("toast"); if (!m) return; m.textContent = msg; m.style.display = "block"; setTimeout(function () { m.style.display = "none"; }, 2200); }

  /* ---------- boot ---------- */
  window.Curriculum = {
    Store: Store, el: el, txt: txt, copy: copy,
    bootModule: function () {
      var root = document.getElementById("app");
      var id = qs("m") || "m1";
      Store.init().then(function () {
        return Promise.all([getJSON("data/modules.json"), getJSON("data/" + id + ".json")]);
      }).then(function (r) { document.title = id.toUpperCase() + " · " + r[1].title; renderModule(root, r[1], r[0]); })
        .catch(function (e) { root.innerHTML = '<div class="call bad">불러오기 실패: ' + String(e) + "<br>file:// 로 열면 JSON 을 못 읽습니다. <code>python3 tools/study_server.py</code> 로 띄우세요.</div>"; });
    },
    bootDashboard: function () {
      var root = document.getElementById("app");
      Store.init().then(function () { return getJSON("data/modules.json"); }).then(function (index) {
        return Promise.all(index.modules.map(function (m) { return getJSON("data/" + m.id + ".json").catch(function () { return null; }); }))
          .then(function (arr) {
            var mods = {}; index.modules.forEach(function (m, i) { mods[m.id] = arr[i]; });
            var rerender = function () { renderDashboard(root, index, mods); };
            rerender(); wireBackup(root, rerender);
          });
      }).catch(function (e) { var d = root.querySelector("#dash"); if (d) d.innerHTML = '<div class="call bad">불러오기 실패: ' + String(e) + "</div>"; });
    }
  };
})();
