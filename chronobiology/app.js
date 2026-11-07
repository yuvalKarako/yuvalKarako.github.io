(function () {
  "use strict";

  const LECTURES = window.LECTURES || [];
  const QUESTIONS = window.QUESTIONS || [];
  const STORE_KEY = "chrono-quiz-v1";
  const DIFF = { 1: "קל", 2: "בינוני", 3: "קשה" };
  const KEYS = ["א", "ב", "ג", "ד", "ה"];
  const main = document.getElementById("main");
  const announcer = document.getElementById("announcer");

  // ---------- ids ----------
  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  QUESTIONS.forEach(q => { q.id = q.l + "-" + hash(q.q); });
  const byId = Object.fromEntries(QUESTIONS.map(q => [q.id, q]));
  const lectureById = Object.fromEntries(LECTURES.map(l => [l.id, l]));

  // ---------- storage ----------
  let storageOk = true;
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const s = raw ? JSON.parse(raw) : {};
      return { q: s.q || {}, sessions: s.sessions || [], active: s.active || null, setup: s.setup || null };
    } catch (e) {
      storageOk = false;
      return { q: {}, sessions: [], active: null, setup: null };
    }
  }
  let state = load();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); storageOk = true; }
    catch (e) { storageOk = false; }
  }
  function rec(id) { return state.q[id] || (state.q[id] = { n: 0, c: 0, s: 0, last: null, flag: false }); }
  function isMastered(id) { const r = state.q[id]; return !!r && r.s >= 2; }
  function isSeen(id) { const r = state.q[id]; return !!r && r.n > 0; }
  function isWrongLast(id) { const r = state.q[id]; return !!r && r.n > 0 && r.last === false; }

  // ---------- helpers ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // **bold** support inside question data
  const fmt = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  function shuffle(a) {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    return b;
  }
  function announce(t) { announcer.textContent = ""; setTimeout(() => { announcer.textContent = t; }, 30); }
  function statsFor(ids) {
    let seen = 0, mastered = 0, attempts = 0, correct = 0;
    ids.forEach(id => {
      const r = state.q[id];
      if (r && r.n) { seen++; attempts += r.n; correct += r.c; if (r.s >= 2) mastered++; }
    });
    return { total: ids.length, seen, mastered, attempts, correct, acc: attempts ? Math.round(100 * correct / attempts) : null };
  }
  const idsOfLecture = lid => QUESTIONS.filter(q => q.l === lid).map(q => q.id);
  function bar(st) {
    const m = st.total ? 100 * st.mastered / st.total : 0;
    const s = st.total ? 100 * (st.seen - st.mastered) / st.total : 0;
    return `<div class="bar" aria-hidden="true"><i class="m" style="width:${m}%"></i><i class="s" style="width:${s}%"></i></div>`;
  }
  function setNav(name) {
    document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("active", a.dataset.nav === name));
  }
  function focusMain() { main.focus({ preventScroll: true }); window.scrollTo(0, 0); }

  // ---------- sessions ----------
  function startSession(ids, label) {
    if (!ids.length) { alert("אין שאלות שמתאימות לבחירה הזו."); return; }
    state.active = {
      label, idx: 0,
      items: ids.map(id => {
        const q = byId[id];
        const idx = q.o.map((_, i) => i);
        const pinned = idx.filter(i => q.o[i].startsWith("!"));
        const free = shuffle(idx.filter(i => !q.o[i].startsWith("!")));
        return { id, order: free.concat(pinned), chosen: null };
      })
    };
    save();
    location.hash = "#quiz";
    if (location.hash === "#quiz") route();
  }
  function quickStart(kind, lid) {
    let pool = QUESTIONS.slice();
    let label = "תרגול";
    if (lid) { pool = pool.filter(q => q.l === lid); label = lectureById[lid].title; }
    if (kind === "new") { pool = pool.filter(q => !isSeen(q.id)); label = "שאלות חדשות"; }
    if (kind === "wrong") { pool = pool.filter(q => isWrongLast(q.id)); label = "חזרה על טעויות"; }
    if (kind === "exam") { pool = pool.filter(q => q.x); label = "מה שנאמר שיהיה במבחן"; }
    if (kind === "mix") { label = "תרגול מעורב"; }
    let ids = shuffle(pool.map(q => q.id));
    if (!lid) ids = ids.slice(0, 20);
    startSession(ids, label);
  }

  // ---------- views ----------
  function viewHome() {
    setNav("home");
    const all = statsFor(QUESTIONS.map(q => q.id));
    const wrongCount = QUESTIONS.filter(q => isWrongLast(q.id)).length;
    const examCount = QUESTIONS.filter(q => q.x).length;
    const active = state.active && state.active.idx < state.active.items.length;
    main.innerHTML = `
      <h1>תרגול לקורס שעונים ביולוגיים</h1>
      <p class="lead">${QUESTIONS.length} שאלות אמריקאיות לפי ההרצאות, בשלוש רמות קושי. אחרי כל תשובה, נכונה או לא, מופיע הסבר מלא - כך שלומדים תוך כדי תרגול.</p>
      ${active ? `<div class="card" style="margin-bottom:1rem"><b>יש לך סבב פתוח:</b> ${esc(state.active.label)} - שאלה ${state.active.idx + 1} מתוך ${state.active.items.length}.<div class="btn-row"><a class="btn primary" href="#quiz">להמשיך מאיפה שעצרתי</a></div></div>` : ""}
      <div class="stats">
        <div class="stat"><b>${all.seen}/${all.total}</b><span>שאלות שנענו</span></div>
        <div class="stat"><b>${all.acc === null ? "-" : all.acc + "%"}</b><span>דיוק</span></div>
        <div class="stat"><b>${all.mastered}</b><span>שאלות בשליטה</span></div>
        <div class="stat"><b>${wrongCount}</b><span>לחזור עליהן</span></div>
      </div>
      <div class="quick">
        <button class="btn primary" data-quick="mix">תרגול מעורב <small>20 שאלות מכל הקורס</small></button>
        <button class="btn" data-quick="exam">מה שנאמר שיהיה במבחן <small>${examCount} שאלות</small></button>
        <button class="btn" data-quick="wrong" ${wrongCount ? "" : "disabled"}>חזרה על טעויות <small>${wrongCount ? wrongCount + " שאלות" : "אין כרגע"}</small></button>
      </div>
      <div class="btn-row"><a class="btn" href="#practice">תרגול מותאם: לפי הרצאות ורמת קושי</a></div>
      <h2>לפי הרצאות</h2>
      <div class="lectures">${LECTURES.map(l => {
        const st = statsFor(idsOfLecture(l.id));
        return `<div class="lecture">
          <div><h3>${esc(l.title)}</h3><div class="meta">${esc(l.lecturer)} · ${st.total} שאלות · נענו ${st.seen}${st.acc === null ? "" : " · דיוק " + st.acc + "%"}</div></div>
          <button class="btn" data-lecture="${l.id}">לתרגל</button>
          ${bar(st)}
        </div>`;
      }).join("")}</div>
      <p class="count-note">בפס ההתקדמות: ירוק - שאלות בשליטה (שתי תשובות נכונות ברצף), טורקיז - שאלות שנענו.</p>
    `;
    main.querySelectorAll("[data-quick]").forEach(b => b.addEventListener("click", () => quickStart(b.dataset.quick)));
    main.querySelectorAll("[data-lecture]").forEach(b => b.addEventListener("click", () => quickStart("lecture", +b.dataset.lecture)));
  }

  function viewPractice() {
    setNav("practice");
    const setup = state.setup || { lectures: LECTURES.map(l => l.id), diffs: [1, 2, 3], pool: "all", count: "20" };
    function pool() {
      return QUESTIONS.filter(q => setup.lectures.includes(q.l) && setup.diffs.includes(q.d) && (
        setup.pool === "all" ? true :
        setup.pool === "new" ? !isSeen(q.id) :
        setup.pool === "wrong" ? isWrongLast(q.id) :
        setup.pool === "notmastered" ? !isMastered(q.id) :
        setup.pool === "exam" ? !!q.x :
        setup.pool === "flag" ? !!(state.q[q.id] && state.q[q.id].flag) : true));
    }
    function render() {
      const p = pool();
      const n = setup.count === "all" ? p.length : Math.min(p.length, +setup.count);
      main.innerHTML = `
        <h1>תרגול מותאם</h1>
        <p class="lead">בוחרים הרצאות, רמת קושי ואיזה שאלות לכלול.</p>
        <div class="card">
          <div class="field"><span class="label">הרצאות <button class="link-btn" data-all="1">כולן</button>·<button class="link-btn" data-all="0">אף אחת</button></span>
            <div class="chips">${LECTURES.map(l => `<button class="chip small" aria-pressed="${setup.lectures.includes(l.id)}" data-l="${l.id}">${esc(l.short)}</button>`).join("")}</div></div>
          <div class="field"><span class="label">רמת קושי</span>
            <div class="chips">${[1, 2, 3].map(d => `<button class="chip" aria-pressed="${setup.diffs.includes(d)}" data-d="${d}">${DIFF[d]}</button>`).join("")}</div></div>
          <div class="field"><span class="label">אילו שאלות</span>
            <div class="chips">${[["all", "הכול"], ["new", "רק חדשות"], ["notmastered", "שעוד לא בשליטה"], ["wrong", "טעיתי בהן"], ["exam", "נאמר שיהיו במבחן"], ["flag", "סימנתי לחזרה"]].map(([k, t]) => `<button class="chip" aria-pressed="${setup.pool === k}" data-p="${k}">${t}</button>`).join("")}</div></div>
          <div class="field"><span class="label">כמה שאלות</span>
            <div class="chips">${["10", "20", "40", "all"].map(c => `<button class="chip" aria-pressed="${setup.count === c}" data-c="${c}">${c === "all" ? "כל המתאימות" : c}</button>`).join("")}</div></div>
          <p class="count-note">${p.length} שאלות מתאימות לבחירה${p.length ? ` - בסבב יהיו ${n}` : ""}.</p>
          <div class="btn-row"><button class="btn primary" id="go" ${p.length ? "" : "disabled"}>להתחיל</button></div>
        </div>`;
      main.querySelectorAll("[data-l]").forEach(b => b.onclick = () => { const id = +b.dataset.l; setup.lectures = setup.lectures.includes(id) ? setup.lectures.filter(x => x !== id) : setup.lectures.concat(id); persist(); });
      main.querySelectorAll("[data-all]").forEach(b => b.onclick = () => { setup.lectures = b.dataset.all === "1" ? LECTURES.map(l => l.id) : []; persist(); });
      main.querySelectorAll("[data-d]").forEach(b => b.onclick = () => { const d = +b.dataset.d; setup.diffs = setup.diffs.includes(d) ? setup.diffs.filter(x => x !== d) : setup.diffs.concat(d); persist(); });
      main.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { setup.pool = b.dataset.p; persist(); });
      main.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { setup.count = b.dataset.c; persist(); });
      main.querySelector("#go").onclick = () => {
        let ids = shuffle(pool().map(q => q.id));
        if (setup.count !== "all") ids = ids.slice(0, +setup.count);
        startSession(ids, "תרגול מותאם");
      };
    }
    function persist() { state.setup = setup; save(); render(); }
    render();
  }

  function viewQuiz() {
    setNav("practice");
    const S = state.active;
    if (!S) { location.hash = "#home"; return; }
    if (S.idx >= S.items.length) { viewSummary(); return; }
    const it = S.items[S.idx];
    const q = byId[it.id];
    if (!q) { S.idx++; save(); viewQuiz(); return; }
    const L = lectureById[q.l];
    const answered = it.chosen !== null;
    const r = state.q[q.id];
    main.innerHTML = `
      <div class="quiz-top"><span>${esc(S.label)}</span><span>שאלה ${S.idx + 1} מתוך ${S.items.length}</span></div>
      <div class="progress-line"><i style="width:${100 * (S.idx + (answered ? 1 : 0)) / S.items.length}%"></i></div>
      <div class="card">
        <div class="tags"><span class="tag">${esc(L.short)}</span><span class="tag d${q.d}">${DIFF[q.d]}</span>${q.x ? '<span class="tag exam">נאמר שיהיה במבחן</span>' : ""}</div>
        <p class="question">${fmt(q.q)}</p>
        <div class="options" role="group" aria-label="תשובות">${it.order.map((oi, k) => {
          let cls = "";
          if (answered) { if (oi === q.a) cls = "correct"; else if (oi === it.chosen) cls = "wrong"; else cls = "dim"; }
          return `<button class="option ${cls}" data-oi="${oi}" ${answered ? "disabled" : ""}><span class="key">${KEYS[k]}</span><span>${fmt(q.o[oi].replace(/^!/, ""))}</span></button>`;
        }).join("")}</div>
        <div id="fb"></div>
        <div class="quiz-actions">
          <button class="flag" id="flag" aria-pressed="${!!(r && r.flag)}">${r && r.flag ? "★ מסומנת לחזרה" : "☆ לסמן לחזרה"}</button>
          <div>${answered ? `<button class="btn primary" id="next">${S.idx + 1 < S.items.length ? "לשאלה הבאה" : "לסיכום הסבב"}</button>` : `<button class="btn ghost" id="skip">לדלג</button>`}</div>
        </div>
      </div>`;
    if (answered) showFeedback(q, it);
    main.querySelectorAll(".option").forEach(b => b.addEventListener("click", () => answer(+b.dataset.oi)));
    const flag = main.querySelector("#flag");
    flag.onclick = () => { const rr = rec(q.id); rr.flag = !rr.flag; save(); viewQuiz(); };
    const next = main.querySelector("#next");
    if (next) { next.onclick = goNext; next.focus({ preventScroll: true }); }
    const skip = main.querySelector("#skip");
    if (skip) skip.onclick = () => { S.items.push(S.items.splice(S.idx, 1)[0]); save(); viewQuiz(); };
  }
  function showFeedback(q, it) {
    const ok = it.chosen === q.a;
    const fb = main.querySelector("#fb");
    fb.innerHTML = `<div class="feedback ${ok ? "ok" : "no"}">
      <h3>${ok ? "✓ נכון!" : "✗ לא מדויק"}</h3>
      ${ok ? "" : `<p class="answer-line">התשובה הנכונה: ${fmt(q.o[q.a].replace(/^!/, ""))}</p>`}
      <p>${fmt(q.e)}</p>
      <p class="source">מתוך: ${esc(lectureById[q.l].title)} (${esc(lectureById[q.l].lecturer)})</p>
    </div>`;
  }
  function answer(oi) {
    const S = state.active; const it = S.items[S.idx]; const q = byId[it.id];
    if (it.chosen !== null) return;
    it.chosen = oi;
    const r = rec(q.id); const ok = oi === q.a;
    r.n++; if (ok) { r.c++; r.s++; } else { r.s = 0; } r.last = ok;
    save();
    announce(ok ? "תשובה נכונה" : "תשובה לא נכונה");
    viewQuiz();
    const fb = main.querySelector("#fb");
    if (fb && window.innerWidth < 700) fb.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function goNext() {
    const S = state.active; S.idx++;
    if (S.idx >= S.items.length) {
      const total = S.items.length, correct = S.items.filter(i => i.chosen === byId[i.id].a).length;
      state.sessions.push({ t: Date.now(), label: S.label, total, correct });
      state.sessions = state.sessions.slice(-50);
    }
    save(); viewQuiz(); focusMain();
  }

  function viewSummary() {
    const S = state.active;
    const done = S.items.filter(i => i.chosen !== null);
    const correct = done.filter(i => i.chosen === byId[i.id].a).length;
    const pct = done.length ? Math.round(100 * correct / done.length) : 0;
    main.innerHTML = `
      <h1>סיכום הסבב</h1>
      <div class="card"><div class="score">${pct}%</div><p>${correct} תשובות נכונות מתוך ${done.length} · ${esc(S.label)}</p>
        <div class="btn-row">
          ${done.length - correct ? '<button class="btn primary" id="retry">לתרגל שוב את הטעויות מהסבב</button>' : ""}
          <button class="btn" id="again">סבב חדש עם אותן שאלות</button>
          <a class="btn ghost" href="#home">לבית</a>
        </div></div>
      <h2>כל השאלות בסבב</h2>
      <div class="review">${done.map(i => {
        const q = byId[i.id]; const ok = i.chosen === q.a;
        return `<details><summary><span class="mark ${ok ? "ok" : "no"}">${ok ? "✓" : "✗"}</span><span>${fmt(q.q)}</span></summary>
          <div class="body">${ok ? "" : `<p><b>ענית:</b> ${fmt(q.o[i.chosen].replace(/^!/, ""))}</p>`}<p><b>התשובה הנכונה:</b> ${fmt(q.o[q.a].replace(/^!/, ""))}</p><p>${fmt(q.e)}</p></div></details>`;
      }).join("")}</div>`;
    const retry = main.querySelector("#retry");
    if (retry) retry.onclick = () => startSession(shuffle(done.filter(i => i.chosen !== byId[i.id].a).map(i => i.id)), "תיקון טעויות מהסבב");
    main.querySelector("#again").onclick = () => startSession(shuffle(S.items.map(i => i.id)), S.label);
  }

  function viewProgress() {
    setNav("progress");
    const all = statsFor(QUESTIONS.map(q => q.id));
    const rows = LECTURES.map(l => ({ l, st: statsFor(idsOfLecture(l.id)) }));
    const diffRows = [1, 2, 3].map(d => ({ d, st: statsFor(QUESTIONS.filter(q => q.d === d).map(q => q.id)) }));
    const sess = state.sessions.slice().reverse().slice(0, 12);
    const weak = rows.filter(r => r.st.attempts >= 3).sort((a, b) => a.st.acc - b.st.acc).slice(0, 3);
    main.innerHTML = `
      <h1>ההתקדמות שלי</h1>
      <div class="stats">
        <div class="stat"><b>${Math.round(100 * all.seen / all.total)}%</b><span>כיסוי המאגר</span></div>
        <div class="stat"><b>${all.acc === null ? "-" : all.acc + "%"}</b><span>דיוק כולל</span></div>
        <div class="stat"><b>${all.mastered}</b><span>בשליטה מתוך ${all.total}</span></div>
        <div class="stat"><b>${state.sessions.length}</b><span>סבבים שהושלמו</span></div>
      </div>
      ${weak.length ? `<div class="card"><b>כדאי לחזק:</b> ${weak.map(w => `${esc(w.l.short)} (${w.st.acc}%)`).join(" · ")}</div>` : ""}
      <h2>לפי הרצאה</h2>
      <div class="card"><table class="table"><thead><tr><th>הרצאה</th><th>נענו</th><th>דיוק</th><th>שליטה</th></tr></thead><tbody>
        ${rows.map(({ l, st }) => `<tr><td>${esc(l.short)}</td><td class="num">${st.seen}/${st.total}</td><td class="num">${st.acc === null ? "-" : st.acc + "%"}</td><td class="num">${st.mastered}</td></tr>`).join("")}
      </tbody></table></div>
      <h2>לפי רמת קושי</h2>
      <div class="card"><table class="table"><thead><tr><th>רמה</th><th>נענו</th><th>דיוק</th><th>שליטה</th></tr></thead><tbody>
        ${diffRows.map(({ d, st }) => `<tr><td>${DIFF[d]}</td><td class="num">${st.seen}/${st.total}</td><td class="num">${st.acc === null ? "-" : st.acc + "%"}</td><td class="num">${st.mastered}</td></tr>`).join("")}
      </tbody></table></div>
      <h2>סבבים אחרונים</h2>
      <div class="card">${sess.length ? `<table class="table"><thead><tr><th>מתי</th><th>סבב</th><th>ציון</th></tr></thead><tbody>${sess.map(s => `<tr><td class="num">${new Date(s.t).toLocaleDateString("he-IL")} ${new Date(s.t).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</td><td>${esc(s.label)}</td><td class="num">${s.correct}/${s.total}</td></tr>`).join("")}</tbody></table>` : '<p class="empty">עוד לא הושלמו סבבים.</p>'}</div>
      <p class="count-note">"בשליטה" = ענית נכון על השאלה פעמיים ברצף. טעות מאפסת את הרצף. ${storageOk ? "ההתקדמות נשמרת בדפדפן הזה בלבד." : "<b>שימו לב: הדפדפן חוסם שמירה, ולכן ההתקדמות לא תישמר.</b>"}</p>
      <div class="btn-row"><button class="btn ghost" id="reset">איפוס ההתקדמות</button></div>`;
    main.querySelector("#reset").onclick = () => {
      if (confirm("למחוק את כל ההתקדמות והסבבים בדפדפן הזה?")) { state = { q: {}, sessions: [], active: null, setup: null }; save(); viewProgress(); }
    };
  }

  // ---------- router ----------
  function route() {
    const h = location.hash.replace("#", "") || "home";
    if (h === "practice") viewPractice();
    else if (h === "quiz") viewQuiz();
    else if (h === "progress") viewProgress();
    else viewHome();
  }
  window.addEventListener("hashchange", () => { route(); focusMain(); });
  document.addEventListener("keydown", e => {
    if (location.hash !== "#quiz" || !state.active) return;
    if (e.target.closest && e.target.closest("input,textarea")) return;
    const it = state.active.items[state.active.idx];
    if (!it) return;
    if (it.chosen === null && /^[1-5]$/.test(e.key)) {
      const k = +e.key - 1; if (it.order[k] !== undefined) answer(it.order[k]);
    } else if (it.chosen !== null && (e.key === "Enter" || e.key === "ArrowLeft")) {
      e.preventDefault(); goNext();
    }
  });
  route();
})();
