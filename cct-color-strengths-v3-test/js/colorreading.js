/* ============================================================
   CCT 강의용 — 컬러 심리리딩: 선택 화면 · 해석 엔진 · 결과 렌더링
   의존: colorreading-data.js (CR_COLORS, CR_PAIRS, CR_COMPLEMENT, CR_FIFTH_EXCLUDE)
   app.js 에는 window.CR 하나만 노출합니다.
   ============================================================ */
(function () {
  "use strict";

  const byKey = {};
  CR_COLORS.forEach((c) => { byKey[c.key] = c; });

  // ---------- 유틸 ----------
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function hasBatchim(word) {
    const w = String(word || "").replace(/[\s'’”"」)]+$/g, "");
    const ch = w.charCodeAt(w.length - 1);
    if (ch < 0xac00 || ch > 0xd7a3) return false;
    return (ch - 0xac00) % 28 !== 0;
  }
  function jongIsRieul(word) {
    const w = String(word || "").replace(/[\s'’”"」)]+$/g, "");
    const ch = w.charCodeAt(w.length - 1);
    if (ch < 0xac00 || ch > 0xd7a3) return false;
    return (ch - 0xac00) % 28 === 8;
  }
  // 은/는, 이/가, 을/를, 과/와, 이에요/예요 …
  function j(word, withB, withoutB) { return word + (hasBatchim(word) ? withB : withoutB); }
  function euro(word) { return word + (hasBatchim(word) && !jongIsRieul(word) ? "으로" : "로"); }
  const c = (k) => byKey[k];
  // ‘키워드’ + 조사 (인용부호 뒤 조사를 받침에 맞춰 붙임)
  function q(word, withB, withoutB) { return "‘" + word + "’" + (hasBatchim(word) ? withB : withoutB); }
  function pair(a, b) {
    return CR_PAIRS[a + ">" + b] || [`${c(a).want}과 ${c(b).want}`, `${c(a).say}. 그리고 ${c(b).say}.`, `${c(a).ko}와 ${c(b).ko}가 함께 놓여 있어요.`, "", ""];
  }

  // 병 모양 SVG (교재의 컬러오일 보틀을 단순화)
  // 작은 컬러 원/칩의 배경 — 화이트는 검은 선 테두리 + 가운데 흰색
  function swatchBg(k) {
    return k === "W" ? "background:#fff;border:1.5px solid #17161d;box-sizing:border-box" : `background:${c(k).hex}`;
  }

  function bottleSVG(hex, opts) {
    const o = opts || {};
    // 화이트는 검은 선 테두리 + 가운데 흰색
    const isWhite = hex.toLowerCase() === "#f5f5f2";
    const stroke = isWhite ? "#17161d" : "rgba(0,0,0,.12)";
    if (isWhite) hex = "#ffffff";
    const w = o.w || 48;
    const h = Math.round(w * 1.42);
    return `
      <svg class="cr-bottle-svg" width="${w}" height="${h}" viewBox="0 0 60 85" aria-hidden="true">
        <rect x="21" y="1" width="18" height="15" rx="3" fill="#E07A2C"/>
        <rect x="21" y="1" width="6" height="15" rx="2" fill="#F2A15A" opacity=".7"/>
        <rect x="24" y="15" width="12" height="5" fill="#C9672A"/>
        <rect x="7" y="19" width="46" height="64" rx="8" fill="${hex}" stroke="${stroke}" stroke-width="${isWhite ? 1.6 : 1.2}"/>
        ${isWhite ? "" : `<rect x="12" y="25" width="6" height="50" rx="3" fill="#fff" opacity="0.22"/>`}
      </svg>`;
  }

  // ---------- 선택 상태 ----------
  let picks = [];      // 마음에 끌리는 4색 (순서 = 선택 순서)
  let fifth = null;    // 가장 마음에 들지 않는 색
  let step = 1;        // 0: 마음 가라앉히기(10초 호흡), 1: 4색 선택, 2: 5번째 선택
  let onDoneCb = null;
  let finishLabel = "CCT 검사 시작하기";

  function getSelection() {
    return picks.length === 4 && fifth ? picks.concat([fifth]) : null;
  }
  function setSelection(keys) {
    if (!Array.isArray(keys) || keys.length !== 5) return false;
    if (!keys.every((k) => byKey[k])) return false;
    if (new Set(keys).size !== 5) return false;
    picks = keys.slice(0, 4);
    fifth = keys[4];
    return true;
  }
  function reset() { stopCalm(); picks = []; fifth = null; step = 1; }

  // ---------- 0단계: 10초 호흡으로 마음 가라앉히기 ----------
  const CALM_SEC = 10;
  let calmTimer = null;
  let audioCtx = null;
  function stopCalm() { if (calmTimer) { clearInterval(calmTimer); calmTimer = null; } }

  // 끝 알림 — 진동(안드로이드 등). 아이폰은 웹 진동을 지원하지 않아 아주 작은 종소리로 함께 알린다.
  function notifyCalmEnd() {
    try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (e) {}
    try {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      [660, 880].forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "sine";
        o.frequency.value = f;
        const t = now + i * 0.28;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        o.connect(g).connect(audioCtx.destination);
        o.start(t);
        o.stop(t + 0.95);
      });
    } catch (e) {}
  }

  function renderCalm(root) {
    root.innerHTML = `
      <div class="cr-calm">
        <div class="cr-calm-title">컬러를 고르기 전에,<br/>잠깐 마음을 가라앉혀 볼까요?</div>
        <ol class="cr-calm-steps">
          <li>편하게 앉아 어깨의 힘을 풀어 주세요.</li>
          <li>아래 <b>10초 시작</b>을 누르고 눈을 감아 주세요.</li>
          <li>코로 천천히 들이마시고, 입으로 길게 내쉬어 주세요.</li>
          <li>휴대폰이 <b>진동</b>하면 천천히 눈을 떠 주세요.</li>
        </ol>
        <div class="cr-calm-circle" id="crCalmCircle">
          <div class="cr-calm-num" id="crCalmNum">${CALM_SEC}</div>
          <div class="cr-calm-label" id="crCalmLabel">준비되면 시작을 눌러 주세요</div>
        </div>
        <div class="cr-calm-actions" id="crCalmActions">
          <button type="button" class="btn btn-primary cr-calm-start" id="crCalmStart">10초 시작</button>
          <button type="button" class="cr-calm-skip" id="crCalmSkip">건너뛰고 바로 고르기</button>
        </div>
      </div>`;
    const goPick = () => { stopCalm(); step = 1; renderPick(); window.scrollTo(0, 0); };
    root.querySelector("#crCalmSkip").addEventListener("click", goPick);
    root.querySelector("#crCalmStart").addEventListener("click", () => {
      // 소리는 사용자가 누른 순간에만 켤 수 있어 여기서 준비해 둔다 (아이폰 대비)
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC && !audioCtx) audioCtx = new AC();
        if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
      } catch (e) {}
      const circle = root.querySelector("#crCalmCircle");
      const num = root.querySelector("#crCalmNum");
      const label = root.querySelector("#crCalmLabel");
      const actions = root.querySelector("#crCalmActions");
      actions.innerHTML = `<div class="cr-calm-running">눈을 감고, 천천히 호흡해 보세요</div>`;
      circle.classList.add("is-running");
      const start = Date.now();
      stopCalm();
      calmTimer = setInterval(() => {
        const t = (Date.now() - start) / 1000;
        const left = Math.max(0, Math.ceil(CALM_SEC - t));
        num.textContent = left;
        label.textContent = t % 10 < 4 ? "들이마시고…" : "길게 내쉬고…";
        if (t >= CALM_SEC) {
          stopCalm();
          circle.classList.remove("is-running");
          circle.classList.add("is-done");
          num.textContent = "";
          label.textContent = "좋아요";
          notifyCalmEnd();
          actions.innerHTML = `
            <div class="cr-calm-after">이제 천천히 눈을 뜨고,<br/>지금 눈에 들어오는 색을 골라 보세요.</div>
            <button type="button" class="btn btn-primary cr-calm-start" id="crCalmGo">컬러 고르기</button>`;
          actions.querySelector("#crCalmGo").addEventListener("click", goPick);
        }
      }, 100);
    });
  }

  // ---------- 선택 화면 ----------
  function renderPick() {
    const root = document.getElementById("crPickBody");
    if (!root) return;
    const breath = document.querySelector("#screen-colorpick .cr-breath");
    if (breath) breath.style.display = step === 0 ? "none" : "";
    if (step === 0) { renderCalm(root); return; }
    const isStep1 = step === 1;
    const pool = isStep1
      ? CR_COLORS
      : CR_COLORS.filter((x) => !picks.includes(x.key) && !CR_FIFTH_EXCLUDE.includes(x.key));

    const slots = [0, 1, 2, 3].map((i) => {
      const k = picks[i];
      return `<div class="cr-slot ${k ? "is-filled" : ""}">
        <div class="cr-slot-bottle">${k ? bottleSVG(c(k).hex, { w: 34 }) : ""}</div>
        <div class="cr-slot-num">${i + 1}</div>
      </div>`;
    }).join("") + `
      <div class="cr-slot cr-slot--fifth ${fifth ? "is-filled" : ""}">
        <div class="cr-slot-bottle">${fifth ? bottleSVG(c(fifth).hex, { w: 34 }) : ""}</div>
        <div class="cr-slot-num">5</div>
      </div>`;

    const grid = pool.map((x) => {
      const order = picks.indexOf(x.key);
      const chosen = isStep1 ? order !== -1 : fifth === x.key;
      const badge = isStep1 ? (order !== -1 ? order + 1 : "") : (chosen ? "5" : "");
      return `<button type="button" class="cr-pick ${chosen ? "is-chosen" : ""}" data-key="${x.key}" aria-pressed="${chosen}">
        ${bottleSVG(x.hex)}
        <span class="cr-pick-name">${esc(x.ko)}</span>
        ${badge ? `<span class="cr-pick-badge">${badge}</span>` : ""}
      </button>`;
    }).join("");

    const guide = isStep1
      ? `<div class="cr-step-title">마음에 끌리는 색 <b>4개</b>를 순서대로 골라주세요</div>
         <div class="cr-step-sub">가장 끌리는 색부터 차례로 누르면 1→4 순서로 놓입니다. 다시 누르면 취소돼요.</div>`
      : `<div class="cr-step-title">이제 <b>가장 마음에 들지 않는 색</b> 1개를 골라주세요</div>
         <div class="cr-step-sub">남은 색 중에서 골라주세요. (화이트·블랙 같은 무채색은 제외합니다)</div>`;

    const ready = isStep1 ? picks.length === 4 : !!fifth;
    root.innerHTML = `
      <div class="cr-slots" aria-label="선택한 컬러">${slots}</div>
      ${guide}
      <div class="cr-grid">${grid}</div>
      <div class="cr-pick-actions">
        <button type="button" class="btn btn-secondary" id="crBack">${isStep1 ? "다시 고르기" : "이전으로"}</button>
        <button type="button" class="btn btn-primary" id="crNext" ${ready ? "" : "disabled"}>
          ${isStep1 ? "다음" : esc(finishLabel)}
        </button>
      </div>`;

    root.querySelectorAll(".cr-pick").forEach((btn) => {
      btn.addEventListener("click", () => {
        const k = btn.dataset.key;
        if (step === 1) {
          const i = picks.indexOf(k);
          if (i !== -1) picks.splice(i, 1);
          else if (picks.length < 4) picks.push(k);
        } else {
          fifth = fifth === k ? null : k;
        }
        renderPick();
      });
    });
    root.querySelector("#crBack").addEventListener("click", () => {
      if (step === 1) { picks = []; } else { step = 1; fifth = null; }
      renderPick();
    });
    root.querySelector("#crNext").addEventListener("click", () => {
      if (step === 1 && picks.length === 4) {
        step = 2;
        if (fifth && (picks.includes(fifth) || CR_FIFTH_EXCLUDE.includes(fifth))) fifth = null;
        renderPick();
        const scr = document.getElementById("screen-colorpick");
        if (scr) scr.scrollTop = 0;
        window.scrollTo(0, 0);
      } else if (step === 2 && fifth && onDoneCb) {
        onDoneCb(getSelection());
      }
    });
  }

  function openPick(onDone, opts) {
    onDoneCb = onDone;
    finishLabel = (opts && opts.finishLabel) || "CCT 검사 시작하기";
    reset();
    step = 0; // 먼저 10초 호흡 → 컬러 고르기
    renderPick();
  }

  // ---------- 해석 원칙 (프로젝트 문서 「컬러리딩_해석원칙.md」 — 최우선) ----------
  // 근거는 ① 각 컬러의 기본 의미 ② 선택 순서 ③ 1·2/2·3/3·4 겹침 ④ 1→4 변화 ⑤ 5번째와 앞 네 컬러의 차이뿐.
  // 따뜻한/차가운 색, 보색, 에너지 높낮이는 심리적 근거로 쓰지 않는다 (데이터의 family/energy/CR_COMPLEMENT 미사용).
  // 3·4번은 미래 예측이 아니라 "앞으로 바라는 나" — 소망·지향으로만 쓴다.
  // 조사만 돌려준다 (‘따옴표’ 뒤에 붙일 때)
  function pp(word, withB, withoutB) { return hasBatchim(word) ? withB : withoutB; }
  function ppEuro(word) { return hasBatchim(word) && !jongIsRieul(word) ? "으로" : "로"; }

  // ---------- 문체 (2026-10-03) ----------
  // 고객이 읽고 "아, 나 요즘 진짜 그런데" 싶게 — 쉬운 일상어, 해요체.
  // 조합은 두 컬러가 만나 생긴 하나의 마음을 먼저 말하고(속마음 한 줄) 이유는 1~2문장.
  // 각 설명 최대 2~3문장, 항목끼리 같은 내용을 반복하지 않는다.
  // CR_PAIRS[k] = [제목, 속마음, 이유, 요즘 이런 순간, 해 보고 싶은 작은 일]
  function eunC(w) { return j(w, "은", "는"); }
  // (v3_21) 결과 문장 3단 구조
  //  ① 큰 메시지: “속마음” + 자리 문장
  //  ② 각 컬러의 의미를 따로, 짧게 (CR_COLORS.mean)
  //  ③ A에서 B로 이어졌기 때문에 지금 이런 마음으로 읽을 수 있다 (CR_PAIRS[k][2])
  //  자리마다 ②·③의 말머리를 다르게 써서 기계적으로 반복되지 않게 한다.
  const SLOT_LINE = {
    past: "그동안 이렇게 지내 오셨을 수 있어요.",
    present: "요즘에는 이런 생각이 조금 더 크게 들 수 있어요.",
    future: "앞으로는 이런 모습을 더 키워 가고 싶으실 수 있어요.",
  };
  // (v3_33) 컬러는 의인화하지 않고 "○○는 ~을 의미해요"로, 결과는 고른 순서에서 나온 해석으로만 설명
  const SLOT_NO = { past: [1, 2], present: [2, 3], future: [3, 4] };
  function meanOf(k) { return `${c(k).mean}${hasBatchim(c(k).mean) ? "을" : "를"}`; }
  function meanLine(a, b, slot) {
    const A = c(a), B = c(b);
    if (slot === "past") return `${eunC(A.ko)} ${meanOf(a)}, ${eunC(B.ko)} ${meanOf(b)} 의미해요.`;
    if (slot === "present") return `${j(A.ko, "이", "가")} ${meanOf(a)} 의미한다면, ${eunC(B.ko)} ${meanOf(b)} 의미해요.`;
    return `${eunC(A.ko)} ${meanOf(a)} 의미하고, ${eunC(B.ko)} ${meanOf(b)} 의미해요.`;
  }
  function flowLine(a, b, slot, core) {
    const A = c(a), B = c(b), [n1, n2] = SLOT_NO[slot];
    let lead;
    if (slot === "past") lead = `${n1}번 ${A.ko} 다음에 ${n2}번 ${j(B.ko, "을", "를")} 고른 것은`;
    else if (slot === "present") lead = `${n1}번 ${A.ko}에 이어 ${n2}번 ${j(B.ko, "을", "를")} 고른 순서는`;
    else lead = `${n1}번 ${A.ko}${j(A.ko, "과", "와").slice(-1)} ${n2}번 ${j(B.ko, "을", "를")} 이어서 보면`;
    return `${lead}, ${core}으로 읽을 수 있어요.`;
  }
  // ---------- v3test_02 (2026-10-28) · 해석 객체 ----------
  // 컬러 의미는 조합이 기대는 '측면'으로 (js/cr-interp.js — CR_ASPECTS / CR_PAIR_INTERP / CR_FIFTH_DIR)
  // 시범 조합이 아니면 기존 CR_PAIRS 문장 + 색의 기본 측면(0번)을 씁니다.
  function jq(w, withB, withoutB) {
    const core = String(w).replace(/[’'”"」)\]\s]+$/, "");
    return w + (hasBatchim(core) ? withB : withoutB);
  }
  function eulT(w) { return jq(w, "을", "를"); }
  function iT(w) { return jq(w, "이", "가"); }
  function euroT(w) { const core = String(w).replace(/[’'”"」)\]\s]+$/, ""); return w + (hasBatchim(core) && !jongIsRieul(core) ? "으로" : "로"); }
  function aspById(id) {
    if (typeof CR_ASPECTS === "undefined") return null;
    for (const k in CR_ASPECTS) { const a = CR_ASPECTS[k].find((x) => x.id === id); if (a) return a; }
    return null;
  }
  function baseAsp(k) {
    const L = typeof CR_ASPECTS !== "undefined" ? CR_ASPECTS[k] : null;
    return L && L[0] ? L[0] : { id: k + "0", m: c(k).mean, kw: c(k).keywords[0] };
  }
  function interpOf(a, b) { return (typeof CR_PAIR_INTERP !== "undefined" && CR_PAIR_INTERP[a + ">" + b]) || null; }
  function pairAsps(a, b) {
    const S = interpOf(a, b);
    return S ? [aspById(S.asp[0]) || baseAsp(a), aspById(S.asp[1]) || baseAsp(b)] : [baseAsp(a), baseAsp(b)];
  }
  function meanLine2(a, b, slot, ma, mb) {
    const A = c(a), B = c(b);
    if (slot === "past") return `${eunC(A.ko)} ${eulT(ma)}, ${eunC(B.ko)} ${eulT(mb)} 의미해요.`;
    if (slot === "present") return `${j(A.ko, "이", "가")} ${eulT(ma)} 의미한다면, ${eunC(B.ko)} ${eulT(mb)} 의미해요.`;
    return `${eunC(A.ko)} ${eulT(ma)} 의미하고, ${eunC(B.ko)} ${eulT(mb)} 의미해요.`;
  }
  function flowLead(a, b, slot) {
    const A = c(a), B = c(b), [n1, n2] = SLOT_NO[slot];
    if (slot === "past") return `${n1}번 ${A.ko} 다음에 ${n2}번 ${j(B.ko, "을", "를")} 고른 것은`;
    if (slot === "present") return `${n1}번 ${A.ko}에 이어 ${n2}번 ${j(B.ko, "을", "를")} 고른 순서는`;
    return `${n1}번 ${A.ko}${j(A.ko, "과", "와").slice(-1)} ${n2}번 ${j(B.ko, "을", "를")} 이어서 보면`;
  }
  function pairMsg(a, b, slot) {
    const pr = pair(a, b), S = interpOf(a, b), [xa, xb] = pairAsps(a, b);
    const line = SLOT_LINE[slot];
    const mean = meanLine2(a, b, slot, xa.m, xb.m);
    const flow = S ? `${flowLead(a, b, slot)}, ${euroT(S.core)} 읽을 수 있어요.${S.more ? " " + S.more : ""}` : flowLine(a, b, slot, pr[2]);
    const body = `${mean} ${flow}`;
    const theme = S ? S.theme : pr[0], short = S ? S.short : (pr[5] || pr[0]), voice = S ? S.voice : pr[1];
    return { theme, short, voice, line, mean, flow, body, means: [[a, xa.m], [b, xb.m]], asps: [xa, xb], sample: S, text: `“${voice}” ${line} ${body}` };
  }

  // 5번째 = 가장 마음에 들지 않은 색 (STEP1-1 40~41쪽 · STEP2 6쪽) — 사실 → 상징 → 이유는 사람마다 → 돌아볼 방향(고객이 고름)
  const FIFTH_LABEL = "가장 마음에 들지 않은 색";
  const FIFTH_VIEW = "교재에서는 이 자리의 색을, 지금은 멀리 두고 있거나 필요 없다고 느끼지만 마음 한편에서는 바라거나 언젠가 해야겠다고 생각하는 것과 연결해 살펴봐요.";
  function fifthOf(k) { return (typeof CR_FIFTH_DIR !== "undefined" && CR_FIFTH_DIR[k]) || { mean: c(k).mean, dirs: [] }; }

  function buildReading(sel, name) {
    if (!sel || sel.length !== 5) return null;
    const [k1, k2, k3, k4, k5] = sel;
    const C5 = c(k5);
    const who = name ? `${name}님` : "당신";

    const past = Object.assign({ label: "과거의 나", sub: "과거의 나에게 보내는 메시지", keys: [k1, k2] }, pairMsg(k1, k2, "past"));
    const present = Object.assign({ label: "현재의 나", sub: "현재의 나에게 보내는 메시지", keys: [k2, k3] }, pairMsg(k2, k3, "present"));
    const future = Object.assign({ label: "앞으로 바라는 나", sub: "앞으로 바라는 나에게 보내는 메시지", keys: [k3, k4] }, pairMsg(k3, k4, "future"));

    const F5 = fifthOf(k5);
    const pMean = `${eunC(C5.ko)} ${eulT(F5.mean)} 상징해요. ${j(who, "은", "는")} 이 색을 가장 마음에 들지 않는 색으로 골랐어요.`;
    const pLine = "색이 끌리지 않는 이유는 기억이나 이미지, 취향처럼 사람마다 달라요.";
    const pFlow = "아래 세 가지 방향 가운데 지금의 나에게 마음에 걸리는 것이 있는지 살펴보세요.";
    const pQ = `${C5.ko}${pp(C5.ko, "이", "가")} 뜻하는 것 가운데, 지금의 나에게 의미 있는 쪽은 어디일까요?`;
    const postponed = {
      label: FIFTH_LABEL, sub: "5번째 컬러", keys: [k5],
      theme: `${j(C5.ko, "을", "를")} 가장 마음에 들지 않는 색으로 골랐어요`, short: `${C5.ko} · 가장 마음에 들지 않은 색`,
      voice: pQ, voiceIsQuestion: true, line: pLine, mean: pMean, flow: pFlow, cardFlow: `${pLine} ${pFlow}`,
      view: FIFTH_VIEW, body: `${pMean} ${pLine} ${pFlow}`,
      means: [[k5, F5.mean]], dirs: F5.dirs, text: `${pMean} ${pLine} ${pFlow} ${pQ}`,
    };

    // 화면 요약 — 1·4번 조합으로 전체를 요약하지 않는다 (해석원칙 2026-10-18)
    const sN = present.short, sF = future.short;
    const summary =
      `${who}의 결과에서 요즘은 ‘${sN}’${pp(sN, "이", "가")} 크게 느껴지고, 앞으로는 ‘${sF}’ 쪽을 향하는 바람이 보여요. ` +
      `가장 마음에 들지 않은 색으로는 ${j(C5.ko, "을", "를")} 골랐어요.`;
    const healing = { key: k5, title: `${j(C5.ko, "을", "를")} 생활에서 가볍게 만나 보기`, text: `${C5.tip} 내키지 않는다면 억지로 할 필요는 없어요.` };

    const pdf = buildPdfDetail(sel, who, { past, present, future, postponed, healing });
    return { sel, who, past, present, future, postponed, summary, healing, pdf };
  }

  // ---------- PDF 전용 문장 ----------
  // 종합 컬러리딩 (요청서 5장) = ① 현재 마음의 중심 ② 과거→현재→앞으로의 변화 ③ 함께 살펴볼 부분(원문에 긴장 표현이 있을 때만)
  //                            ④ 나를 돌보는 방향(실천 + 5번째) + 질문형 정리
  function wa(w) { return j(w, "과", "와"); }
  function buildPdfDetail(sel, who, M) {
    const [k1, k2, k3, k4, k5] = sel;
    const C2 = c(k2), C3 = c(k3), C4 = c(k4), C5 = c(k5);
    const { past: mP, present: mN, future: mF, postponed: m5 } = M;
    const F = pair(k3, k4);
    const sP = mP.sample, sN = mN.sample, sF = mF.sample;
    const gist = (m) => (m.sample ? m.sample.gist : `‘${m.short}’`);
    const gP = gist(mP), gN = gist(mN), gF = gist(mF);
    const whoI = j(who, "이", "가");
    const heal = { key: k5, title: M.healing.title, text: M.healing.text };

    // ① 현재 마음의 중심
    const p1 = `${whoI} 고른 순서에서 지금의 마음을 보여 주는 것은 2번 ${wa(C2.ko)} 3번 ${C3.ko}의 조합이에요. ` +
      `요즘은 ${iT(gN)} 마음의 중심에 있는 것으로 읽을 수 있어요.`;
    // ② 변화 — 2·3번 색이 앞뒤 결과에서 같은 측면이면 '이어짐', 다른 측면이면 '다른 모습'으로 (두 조합 모두 시범 데이터가 있을 때만)
    let saidDiff = false;
    const side = (no, C, xa, xb, na, nb) => {
      if (!xa || !xb) return "";
      if (xa.id === xb.id) return `${no}번 ${eunC(C.ko)} ${wa(na)} ${nb} 모두에서 ${eulT(xa.m)} 뜻해, 그 마음이 이어지고 있어요.`;
      const tail = saidDiff ? "" : " 같은 색이 시기에 따라 다른 모습으로 쓰이고 있어요.";
      saidDiff = true;
      return `${no}번 ${eunC(C.ko)} ${na}에서는 ${eulT(xa.m)}, ${nb}에서는 ${eulT(xb.m)} 뜻해요.${tail}`;
    };
    const s2 = sP && sN ? side(2, C2, mP.asps[1], mN.asps[0], "과거 결과", "현재 결과") : "";
    const s3 = sN && sF ? side(3, C3, mN.asps[1], mF.asps[0], "현재 결과", "앞으로 바라는 결과") : "";
    const p2 = `그동안의 결과(1·2번)에서는 ${iT(gP)} 보였어요. ${s2 ? s2 + " " : ""}` +
      `앞으로 바라는 결과(3·4번)에서는 ${sF ? eulT(gF) + " 바라는 마음이" : iT(gF)} 보여요. ${s3 ? s3 + " " : ""}` +
      `앞으로 바라는 결과는 정해진 미래가 아니라, 내가 향하고 싶은 쪽이에요.`;
    // ③ 함께 살펴볼 부분 — 조합 원문에 긴장 표현이 있을 때만
    // 많아야 두 가지 — 현재·앞으로 바라는 결과를 먼저 (과거는 2문단에서 이미 다룸)
    const tens = [[sP, "그동안의 결과"], [sN, "현재 결과"], [sF, "앞으로 바라는 결과"]].filter(([x]) => x && x.tension).slice(-2);
    const p3 = tens.length
      ? `${tens.map(([x, nm]) => `${nm}에는 ${iT(x.tension)}`).join(", ")} 함께 들어 있어요. ` +
        tens.map(([x]) => x.tnote).filter(Boolean).join(" ") + " 지금 꼭 그렇다는 뜻이 아니라, 결과에 함께 나타난 부분이라 한 번 살펴볼 만해요."
      : "";
    // ④ 나를 돌보는 방향 — 앞 문단에서 이어지는 실천 + 5번째 색
    const actFrom = (tens.length ? tens[tens.length - 1][0] : null) || [sF, sN, sP].find((x) => x && x.act) || null;
    const act = actFrom && actFrom.act ? actFrom.act : (F[4] ? `앞으로 바라는 결과와 이어지는 작은 일로는 이런 것이 있어요. “${F[4]}”` : "");
    const ask = [sP, sN, sF].map((x) => x && x.ask).filter(Boolean).join(" ");
    const F5 = fifthOf(k5);
    const p4 = `${act ? act + " " : ""}${ask ? ask + " " : ""}` +
      `그리고 가장 마음에 들지 않는 색으로 고른 ${eunC(C5.ko)} ${eulT(F5.mean)} 상징해요. ` +
      (F5.dirs.length
        ? `색이 끌리지 않는 이유는 사람마다 다르니, 앞에 적은 세 가지 방향 가운데 마음에 걸리는 것이 있을 때만 그 옆의 작은 실천 하나부터 해 보세요.`
        : `${j(C5.ko, "을", "를")} 볼 때 떠오르는 것부터 가볍게 적어 보세요.`);
    // 정리 — 질문형 (STEP3 '피드백은 질문형으로')
    const nm = who === "당신" ? "나" : who;
    const p5 = `정리하면, 그동안은 ${gP}, 요즘은 ${gN}, 앞으로는 ${euroT(gF)} 이어지는 흐름이에요. 지금의 ${nm}${who === "당신" ? "와도" : "이 느끼기에도"} 비슷한가요?`;
    const closing = [
      { h: "현재 마음의 중심", t: p1 },
      { h: "과거에서 현재, 앞으로 이어지는 변화", t: p2 },
      p3 ? { h: "함께 살펴볼 부분", t: p3 } : null,
      { h: "나를 돌보는 방향", t: p4 },
      { h: "", t: p5 },
    ].filter(Boolean);
    const closingNote = "끌리는 색은 시기에 따라 달라질 수 있으니, 시간이 지나 다시 골라 비교해 보세요. 요즘 혼자 감당하기 버겁다면 믿을 만한 사람이나 전문가와 이야기를 나눠 보세요.";

    // 2쪽 키워드 상자 — 이번 결과에서 각 색이 뜻한 측면
    const kAsp = [mP.asps[0], mN.asps[0], mN.asps[1], mF.asps[1]];
    const keyword = { t: "이번 결과에서 네 컬러가 뜻한 것", keys: [k1, k2, k3, k4],
      lead: "같은 색도 어떤 조합에 놓이느냐에 따라 뜻하는 측면이 달라요. 이번 결과에서 네 컬러가 뜻한 것을 모아 보면 이래요.",
      list: [k1, k2, k3, k4].map((k, i) => [k, `#${kAsp[i].kw}`, kAsp[i].m]),
      body: ["이 가운데 지금의 나와 가장 가깝게 느껴지는 키워드 하나를 골라 보세요."] };

    const shP = mP.short, shN = mN.short, shF = mF.short;
    const questions = { t: "지금 나에게 던져볼 질문", keys: [k1, k2, k3, k4, k5],
      lead: `과거의 나, 현재의 나, 앞으로 바라는 나, 가장 마음에 들지 않은 색에서 생각해 볼 질문이에요. 정답은 없고, 떠오르는 대로 적어도 충분해요.`,
      qs: [
        ["과거의 나", `‘${shP}’${pp(shP, "이", "가")} 컸던 때를 떠올려 보면, 그때 나에게 힘이 된 것은 무엇이었나요?`],
        ["현재의 나", `요즘 ‘${shN}’${pp(shN, "이", "가")} 가장 크게 느껴지는 때는 언제인가요?`],
        ["앞으로 바라는 나", `‘${shF}’${pp(shF, "을", "를")} 위해 이번 달에 해 볼 수 있는 한 가지는 무엇인가요?`],
        [FIFTH_LABEL, `${C5.ko}${pp(C5.ko, "이", "가")} 마음에 들지 않았던 이유를 떠올려 보면, 어떤 기억이나 이미지가 생각나나요?`],
      ],
      body: [] };
    return { heal, closing, closingNote, keyword, questions };
  }

  // ---------- 결과 HTML ----------
  // 다섯 병 + 관계 표시: 위쪽 괄호 = 2·3 현재의 나 / 아래쪽 괄호 = 1·2 과거의 나, 3·4 앞으로 바라는 나, 5 가장 마음에 들지 않은 색
  // 6칸 그리드(병 4칸 · 구분선 · 5번 병)로 괄호 끝이 각 병의 정가운데에 오도록 맞춥니다.
  function bottleRowHTML(sel, size) {
    const w = size || 46;
    const item = (k, i) => `
      <div class="cr-row-item" style="grid-column:${i < 4 ? i + 1 : 6}">
        ${bottleSVG(c(k).hex, { w })}
        <div class="cr-row-num">${i + 1}</div>
        <div class="cr-row-name">${esc(c(k).ko)}</div>
      </div>`;
    const br = (cls, col, num, label) => `
      <div class="cr-br cr-br--${cls}" style="grid-column:${col}">
        <i class="cr-br-line"></i><span class="cr-br-t"><b>${num}</b> ${label}</span>
      </div>`;
    return `
      <div class="cr-rel">
        ${br("present", "2 / 4", "2·3", "현재의 나")}
        ${sel.map(item).join("")}
        <div class="cr-rel-sep" aria-hidden="true"></div>
        ${br("past", "1 / 3", "1·2", "과거의 나")}
        ${br("future", "3 / 5", "3·4", "앞으로 바라는 나")}
        ${br("fifth", "6", "5", "가장 마음에<br>들지 않은 색")}
      </div>`;
  }

  function chipHTML(k) {
    return `<span class="cr-chip"><i style="${swatchBg(k)}"></i>${esc(c(k).ko)}</span>`;
  }

  function msgHTML(m, idx) {
    const chips = m.keys.map(chipHTML).join(`<span class="cr-plus">+</span>`);
    return `
      <div class="cr-msg cr-msg--${idx}">
        <div class="cr-msg-head">
          <span class="cr-msg-label">${esc(m.label)}</span>
          <span class="cr-msg-chips">${chips}</span>
        </div>
        <div class="cr-msg-theme">${esc(m.theme)}</div>
        ${m.voice ? `<div class="cr-msg-voice">“${esc(m.voice)}”<span>${esc(m.line)}</span></div>
        <p class="cr-msg-text">${esc(m.body)}</p>` : `<p class="cr-msg-text">${esc(m.text)}</p>`}
      </div>`;
  }

  // 항목 제목 옆 — 그 항목이 다루는 컬러를 작은 원으로
  function dotsHTML(keys) {
    if (!keys || !keys.length) return "";
    return `<span class="cr-aspect-dots">${keys.map((k) => `<i title="${esc(c(k).ko)}" style="${swatchBg(k)}"></i>`).join("")}</span>`;
  }

  function summaryHTML(R) {
    const h = c(R.healing.key);
    return `
      <div class="cr-summary">
        <div class="cr-summary-kicker">종합 컬러리딩</div>
        <p>${esc(R.summary)}</p>
      </div>
      <div class="cr-healing">
        <div class="cr-healing-bottle">${bottleSVG(h.hex, { w: 40 })}</div>
        <div>
          <div class="cr-healing-t">${esc(R.healing.title)}</div>
          <p>${esc(R.healing.text)}</p>
        </div>
      </div>`;
  }

  // 첫 문장(…대화의 도구입니다.) 뒤에서 줄을 바꿉니다.
  function noteHTML() { const i = NOTE.indexOf("니다. ") + 3; return `${esc(NOTE.slice(0, i))}<br>${esc(NOTE.slice(i + 1))}`; }
  const NOTE = "컬러리딩은 지금 이 순간 직감으로 고른 색을 통해 지금의 나를 살펴보는 대화의 도구입니다. 심리검사나 진단이 아니며, 고른 색에 좋고 나쁨은 없습니다. 그때의 마음에 따라 선택하는 색은 달라질 수 있습니다.";


  // ---------- 컬러 카드 (결과 화면: 5장을 한 장씩 넘겨 보고, 마지막에 종합 결과) ----------
  // 결과 카드 4장: 과거의 나(1·2) / 현재의 나(2·3) / 앞으로 바라는 나(3·4) / 가장 마음에 들지 않은 색(5)
  const CARDS = [
    { label: "과거의 나", tag: "1·2번 컬러", file: "Past", idx: [0, 1], msg: "past" },
    { label: "현재의 나", tag: "2·3번 컬러", file: "Present", idx: [1, 2], msg: "present" },
    { label: "앞으로 바라는 나", tag: "3·4번 컬러", file: "Future", idx: [2, 3], msg: "future" },
    { label: "가장 마음에 들지 않은 색", tag: "5번 컬러", file: "Least", idx: [4], msg: "postponed" },
  ];
  let lastR = null;

  // 흰색과 섞은 연한 색 (카드 윗부분 배경)
  function tint(hex, amt) {
    const v = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16));
    return "#" + v.map((x) => Math.round(x + (255 - x) * amt).toString(16).padStart(2, "0")).join("");
  }
  function accent(k) { return k === "W" ? "#17161d" : c(k).hex; }
  function soft(k, amt) { return k === "W" ? (amt > 0.9 ? "#ffffff" : "#f4f4f2") : tint(c(k).hex, amt); }

  function colorCardHTML(R, i, opts) {
    const D = CARDS[i];
    const keys = D.idx.map((n) => R.sel[n]);
    const m = R[D.msg];
    const exp = !!(opts && opts.export);
    const k1 = keys[0], k2 = keys[keys.length - 1];
    const topBg = keys.length > 1
      ? `linear-gradient(135deg, ${soft(k1, 0.82)} 0%, ${soft(k2, 0.82)} 100%)`
      : `linear-gradient(180deg, ${soft(k1, 0.82)} 0%, ${soft(k1, 0.94)} 100%)`;
    const noBg = keys.length > 1 ? `linear-gradient(135deg, ${accent(k1)} 0%, ${accent(k2)} 100%)` : accent(k1);
    const bw = keys.length > 1 ? (exp ? 74 : 70) : (exp ? 84 : 80);
    const bottles = keys.map((k, n) => `
            <div class="cr-cb">
              <div class="cr-cb-bottle">${bottleSVG(c(k).hex, { w: bw })}</div>
              <div class="cr-cb-num">${D.idx[n] + 1}</div>
              <div class="cr-cb-name">${esc(c(k).ko)}</div>
            </div>`).join(`<div class="cr-cb-arrow" aria-hidden="true">›</div>`);
    const means = (m.means || keys.map((k) => [k, c(k).mean])).map(([k, mm]) => `
            <div class="cr-cm"><i style="${swatchBg(k)}"></i><p><b>${esc(c(k).ko)}</b> ${esc(mm)}</p></div>`).join("");
    const dirs = m.dirs && m.dirs.length ? `<ul class="cr-card-dirs">${m.dirs.map(([d]) => `<li>${esc(d)}</li>`).join("")}</ul>` : "";
    return `
      <article class="cr-card cr-card--read${exp ? " cr-card--export" : ""}" style="--cr-accent:${accent(k2)}">
        <div class="cr-card-top" style="background:${topBg}">
          <div class="cr-card-meta">
            <span class="cr-card-no" style="background:${noBg}">${i + 1}</span>
            <span class="cr-card-pos">${esc(D.label)}</span>
          </div>
          <div class="cr-cb-row${keys.length === 1 ? " cr-cb-row--one" : ""}">${bottles}</div>
        </div>
        <div class="cr-card-body">
          <div class="cr-card-title"><span class="cr-fit">${esc(m.short)}</span></div>
          ${m.voiceIsQuestion ? `<div class="cr-card-ask">${esc(m.voice)}</div>` : voiceHTML(m.voice)}
          <div class="cr-card-means">${means}</div>
          <p class="cr-card-flow">${esc(m.cardFlow || m.flow)}</p>
          ${dirs}
        </div>
        <div class="cr-card-foot">${esc(R.who)}의 마음 컬러 · ${esc(D.tag)}<span>LOVLIVE COLOR INSIGHT</span></div>
      </article>`;
  }

  const ICON_DL = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const N_CARDS = CARDS.length;

  function deckHTML(R) {
    const slides = CARDS.map((_, i) => `
      <div class="cr-slide" data-i="${i}">
        ${colorCardHTML(R, i)}
      </div>`).join("");
    const minis = R.sel.map((k, i) => `
      <div class="cr-end-bottle${i === 4 ? " is-fifth" : ""}">${bottleSVG(c(k).hex, { w: 34 })}<span>${i + 1}</span></div>`).join("");
    const last = `
      <div class="cr-slide cr-slide--end" data-i="${N_CARDS}">
        <div class="cr-card cr-card--end">
          <div class="cr-end-kicker">다섯 컬러를 모아 보면</div>
          <div class="cr-end-bottles">${minis}</div>
          <p class="cr-end-text">${esc(R.summary.split(/(?<=요\.)\s/)[0])}</p>
          <button type="button" class="btn btn-primary cr-end-go" data-view="full">종합 결과 보기 ›</button>
          <button type="button" class="cr-end-saveall" data-save="all">${ICON_DL}카드 ${N_CARDS}장 한 번에 저장</button>
        </div>
      </div>`;
    const dots = Array.from({ length: N_CARDS + 1 }, (_, i) => `<button type="button" class="cr-dot${i === 0 ? " is-on" : ""}" data-go="${i}" aria-label="${i + 1}번째 카드"></button>`).join("");
    return `
      <div class="cr-deck" id="crDeck">
        <div class="cr-deck-track" id="crDeckTrack">${slides}${last}</div>
        <div class="cr-deck-nav">
          <button type="button" class="cr-nav-btn" id="crPrev" aria-label="이전 카드">‹</button>
          <div class="cr-dots">${dots}</div>
          <button type="button" class="cr-nav-btn" id="crNext2" aria-label="다음 카드">›</button>
        </div>
        <div class="cr-deck-tools">
          <span class="cr-deck-count" id="crDeckCount">1 / ${N_CARDS + 1}</span>
          <button type="button" class="cr-save-cur" id="crSaveCur">${ICON_DL}이 카드 저장</button>
        </div>
      </div>`;
  }

  // 화면 위쪽 단계 표시: ① 컬러 카드 ↔ ② 종합 결과 (눌러서 오갈 수 있음)
  function viewTabsHTML() {
    return `
      <div class="cr-views" role="tablist" aria-label="컬러리딩 결과 보기">
        <button type="button" class="cr-view-tab is-on" data-view="deck" data-go="0" role="tab" aria-selected="true"><b>1</b>컬러 카드</button>
        <span class="cr-view-arrow" aria-hidden="true">›</span>
        <button type="button" class="cr-view-tab" data-view="full" role="tab" aria-selected="false"><b>2</b>종합 결과</button>
      </div>`;
  }

  // ---- 카드 이미지 저장 ----
  function inApp() { return /KAKAOTALK|Instagram|FBAN|FBAV|Line\/|NAVER\(inapp|DaumApps|everytimeApp/i.test(navigator.userAgent || ""); }
  function isTouch() { try { return window.matchMedia("(pointer: coarse)").matches; } catch (e) { return false; } }

  async function renderCardBlob(R, i) {
    if (!window.html2canvas) throw new Error("이미지 도구를 불러오지 못했어요");
    const box = document.createElement("div");
    box.className = "cr-export-box";
    box.innerHTML = colorCardHTML(R, i, { export: true });
    document.body.appendChild(box);
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      fitTitles(box);
      await new Promise((r) => setTimeout(r, 40));
      const canvas = await window.html2canvas(box.firstElementChild, { scale: 3, backgroundColor: "#ffffff", useCORS: true });
      return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("이미지를 만들지 못했어요"))), "image/png"));
    } finally {
      box.remove();
    }
  }

  function showImageSheet(urls) {
    const el = document.createElement("div");
    el.className = "cr-imgsheet";
    el.innerHTML = `
      <div class="cr-imgsheet-panel">
        <div class="cr-imgsheet-head">
          <b>이미지를 길게 눌러 저장해 주세요</b>
          <button type="button" class="cr-imgsheet-close" aria-label="닫기">✕</button>
        </div>
        <div class="cr-imgsheet-list">${urls.map((u) => `<img src="${u}" alt="컬러 카드" />`).join("")}</div>
      </div>`;
    const close = () => { el.remove(); urls.forEach((u) => URL.revokeObjectURL(u)); };
    el.addEventListener("click", (e) => { if (e.target === el || e.target.closest(".cr-imgsheet-close")) close(); });
    document.body.appendChild(el);
  }

  async function saveCards(R, indices, btn) {
    const label = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.textContent = "이미지 만드는 중…"; }
    try {
      const blobs = [];
      for (const i of indices) blobs.push(await renderCardBlob(R, i));
      // 파일 이름은 영문으로 (일부 브라우저가 한글 파일명을 'download'로 바꿔 버림)
      const files = blobs.map((b, n) => {
        const i = indices[n];
        return new File([b], `LoveLive_ColorCard_${i + 1}_${CARDS[i].file}.png`, { type: "image/png" });
      });
      if (inApp()) { showImageSheet(blobs.map((b) => URL.createObjectURL(b))); return; }
      if (isTouch() && navigator.canShare && navigator.canShare({ files })) {
        try { await navigator.share({ files, title: "나의 마음 컬러 카드" }); return; }
        catch (e) { if (e && e.name === "AbortError") return; }
      }
      for (const f of files) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(f);
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        await new Promise((r) => setTimeout(r, 350));
      }
    } catch (e) {
      alert("카드 이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = label; }
    }
  }

  // 카드 속마음: 문장이 두 개면 문장마다 한 줄씩(두 번째 문장은 둘째 줄부터), 한 문장이면 최대 두 줄
  const ICON_QUOTE = `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10.2 5.5C6.4 6.6 4 9.6 4 13.8V19h6.3v-6.2H7.2c.2-2.4 1.4-4 3.6-4.9l-.6-2.4zm9.8 0c-3.8 1.1-6.2 4.1-6.2 8.3V19h6.3v-6.2H17c.2-2.4 1.4-4 3.6-4.9L20 5.5z"/></svg>`;
  function voiceHTML(v) {
    // 문장마다 한 줄. 한 문장 안에 쉼표가 있으면 쉼표 뒤를 다음 줄로 (최대 두 줄 유지)
    let ss = String(v || "").split(/(?<=[.?!…])\s+/).filter(Boolean);
    if (ss.length === 1) {
      const m = ss[0].match(/^(.+?,)\s+(.+)$/);
      if (m) ss = [m[1], m[2]];
    }
    // v3_42: 글자 따옴표 대신 상자 위쪽 가운데에 카드 색 따옴표 아이콘
    const q = `<span class="cr-vq" aria-hidden="true">${ICON_QUOTE}</span>`;
    if (ss.length > 1) {
      return `<div class="cr-card-voice cr-card-voice--multi">${q}${ss.map((x) => `<span class="cr-vl">${esc(x)}</span>`).join("")}</div>`;
    }
    return `<div class="cr-card-voice">${q}<span class="cr-vt">${esc(v)}</span></div>`;
  }
  function fitVoices(scope) {
    scope.querySelectorAll(".cr-card-voice").forEach((el) => {
      el.style.fontSize = "";
      let size = parseFloat(getComputedStyle(el).fontSize) || 13.5;
      let n = 0;
      if (el.classList.contains("cr-card-voice--multi")) {
        const over = () => Array.from(el.querySelectorAll(".cr-vl")).some((l) => l.scrollWidth > l.clientWidth + 0.5);
        while (over() && size > 11 && n++ < 30) { size -= 0.5; el.style.fontSize = size + "px"; }
      } else {
        const t = el.querySelector(".cr-vt");
        const lines = () => (t ? t.getClientRects().length : 1);
        while (lines() > 2 && size > 11 && n++ < 30) { size -= 0.5; el.style.fontSize = size + "px"; }
      }
    });
  }

  // 카드 제목을 항상 한 줄로: 넘치면 글자를 조금씩 줄임
  function fitTitles(scope) {
    fitVoices(scope);
    scope.querySelectorAll(".cr-fit").forEach((el) => {
      const box = el.parentElement;
      el.style.fontSize = "";
      let size = parseFloat(getComputedStyle(el).fontSize) || 17;
      let n = 0;
      while (el.scrollWidth > box.clientWidth && size > 12 && n++ < 30) { size -= 0.5; el.style.fontSize = size + "px"; }
    });
  }

  // 결과 화면에 넣은 뒤 호출 — 카드 넘기기·점·저장, ① 컬러 카드 ↔ ② 종합 결과 화면 전환
  function bindScreen(root) {
    const scope = root || document;
    const sec = scope.querySelector("#crSection");
    const deckView = scope.querySelector("#crDeckView");
    const deck = scope.querySelector("#crDeck");
    const track = scope.querySelector("#crDeckTrack");
    const full = scope.querySelector("#crFull");
    const R = lastR;
    if (!sec || !deck || !track || !full || !R) return;
    const slides = Array.from(track.querySelectorAll(".cr-slide"));
    const dots = Array.from(deck.querySelectorAll(".cr-dot"));
    const count = deck.querySelector("#crDeckCount");
    let cur = 0;
    const setCur = (i) => {
      cur = i;
      dots.forEach((d, n) => d.classList.toggle("is-on", n === i));
      if (count) count.textContent = `${i + 1} / ${slides.length}`;
      deck.querySelector("#crPrev").disabled = i === 0;
      deck.querySelector("#crNext2").disabled = i === slides.length - 1;
      const sc = deck.querySelector("#crSaveCur");
      if (sc) sc.hidden = i >= N_CARDS;
    };
    // 카드 가운데 위치를 track 기준으로 계산 (offsetLeft는 화면 폭에 따라 기준이 달라져 순서가 어긋남)
    const centerOf = (s) => {
      const tr = track.getBoundingClientRect(), r = s.getBoundingClientRect();
      return r.left - tr.left + track.scrollLeft + r.width / 2;
    };
    const go = (i, instant) => {
      const s = slides[Math.max(0, Math.min(slides.length - 1, i))];
      track.scrollTo({ left: centerOf(s) - track.clientWidth / 2, behavior: instant ? "auto" : "smooth" });
    };
    let raf = 0;
    track.addEventListener("scroll", () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mid = track.scrollLeft + track.clientWidth / 2;
        let best = 0, bd = 1e9;
        slides.forEach((s, n) => { const d = Math.abs(centerOf(s) - mid); if (d < bd) { bd = d; best = n; } });
        if (best !== cur) setCur(best);
      });
    }, { passive: true });
    dots.forEach((d) => d.addEventListener("click", () => go(Number(d.dataset.go))));
    deck.querySelector("#crPrev").addEventListener("click", () => go(cur - 1));
    deck.querySelector("#crNext2").addEventListener("click", () => go(cur + 1));
    deck.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") go(cur + 1); if (e.key === "ArrowLeft") go(cur - 1); });
    deck.querySelectorAll("[data-save]").forEach((b) => b.addEventListener("click", () => {
      const v = b.dataset.save;
      saveCards(R, v === "all" ? CARDS.map((_, n) => n) : [Number(v)], b);
    }));
    const saveCur = deck.querySelector("#crSaveCur");
    if (saveCur) saveCur.addEventListener("click", () => { if (cur < N_CARDS) saveCards(R, [cur], saveCur); });

    // 카드 화면은 스크롤 없이 한 화면에: 카드가 화면보다 크면 카드 전체를 조금 줄임
    const cards = slides.map((sl) => sl.querySelector(".cr-card"));
    const fitDeck = () => {
      if (deckView.hidden) return;
      fitTitles(deck);
      cards.forEach((cd) => { cd.style.zoom = ""; });
      const H = Math.max(...cards.map((cd) => cd.getBoundingClientRect().height));
      const below = deck.querySelector(".cr-deck-nav").offsetHeight + deck.querySelector(".cr-deck-tools").offsetHeight + 26;
      const top = track.getBoundingClientRect().top + window.scrollY;
      const avail = window.innerHeight - top - below;
      const z = Math.max(0.7, Math.min(1, avail / H));
      if (z < 0.995) cards.forEach((cd) => { cd.style.zoom = String(z); });
    };

    // 화면 전환: 카드 화면(is-deck)에서는 카드만, 종합 결과에서는 나머지 결과·버튼까지
    const tabs = Array.from(sec.querySelectorAll(".cr-view-tab"));
    const show = (view, first) => {
      const isFull = view === "full";
      deckView.hidden = isFull;
      full.hidden = !isFull;
      tabs.forEach((t) => { const on = t.dataset.view === view; t.classList.toggle("is-on", on); t.setAttribute("aria-selected", on ? "true" : "false"); });
      sec.classList.toggle("is-full", isFull);
      sec.classList.toggle("is-deck", !isFull);
      window.scrollTo({ top: 0, behavior: first ? "auto" : "smooth" });
      if (!isFull) requestAnimationFrame(() => { fitDeck(); go(cur, true); setCur(cur); });
    };
    let rz = 0;
    window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(fitDeck, 120); });
    sec.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.view === "deck" && b.dataset.go != null) cur = Number(b.dataset.go);
      show(b.dataset.view);
    }));
    setCur(0);
    show("deck", true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitDeck);
  }

  // 종합 결과(화면용) — 네 메시지를 한눈에: 보틀 + 자리 + 짧은 제목 + 속마음
  function sumRowsHTML(R) {
    return `<div class="cr-sums">${CARDS.map((D) => {
      const m = R[D.msg];
      const keys = D.idx.map((n) => R.sel[n]);
      return `
        <div class="cr-sum">
          <div class="cr-sum-bottles">${keys.map((k) => bottleSVG(c(k).hex, { w: 20 })).join("")}</div>
          <div class="cr-sum-body">
            <div class="cr-sum-label">${esc(D.label)} <span>${esc(D.tag.replace(" 컬러", ""))}</span></div>
            <div class="cr-sum-title">${esc(m.short)}</div>
            <div class="cr-sum-voice">${m.voiceIsQuestion ? esc(m.voice) : `“${esc(m.voice)}”`}</div>
          </div>
        </div>`;
    }).join("")}</div>`;
  }

  // opts.standalone: 컬러리딩만 진행한 경우 — PART 표시와 CCT 구분선을 뺍니다.
  function buildScreenHTML(R, opts) {
    if (!R) return "";
    lastR = R;
    const solo = !!(opts && opts.standalone);
    return `
      <section class="cr-section is-deck ${solo ? "cr-section--solo" : ""}" id="crSection">
        ${solo ? "" : `<div class="cr-part-kicker">PART 1</div>
        <h2 class="cr-part-title">컬러 심리리딩</h2>`}
        <p class="cr-part-desc cr-part-desc--one">고른 순서로 살펴본 지금의 나예요</p>
        <div class="cr-deck-view" id="crDeckView">${deckHTML(R)}</div>
        <div class="cr-full" id="crFull" hidden>
        ${viewTabsHTML()}
        <div class="cr-full-kicker">종합 컬러리딩 결과</div>
        ${bottleRowHTML(R.sel)}
        ${sumRowsHTML(R)}
        ${summaryHTML(R)}
        <p class="cr-note">${noteHTML()}</p>
        <div class="cr-full-back">
          <button type="button" class="cr-back-btn" data-view="deck" data-go="0">‹ 컬러 카드 다시 보기</button>
        </div>
        </div>
      </section>
      ${solo ? "" : `<div class="cr-part-divider">
        <div class="cr-part-kicker">PART 2</div>
        <div class="cr-part-title cr-part-title--sm">CCT 컬러성격강점 결과</div>
        <p class="cr-part-desc">65문항 자기보고로 살펴본, 내가 일상에서 자주 쓰는 성격강점입니다.</p>
      </div>`}`;
  }

  // ---------- PDF (A · 정돈 리포트형, v3_31) ----------
  // 반환: [{ html, pageBreakBefore }] — app.js가 순서대로 배치합니다.
  const RA_POS = { past: "1·2번", present: "2·3번", future: "3·4번", postponed: "5번" };
  function raDot(k) { return `<i class="ra-dot" style="${swatchBg(k)}"></i>`; }
  function raMsgHTML(m, no, key) {
    const route = m.keys.map((k) => `${raDot(k)}${esc(c(k).ko)}`).join(`<span class="ra-arrow">→</span>`);
    const means = (m.means || m.keys.map((k) => [k, c(k).mean])).map(([k, mm]) => `<div class="ra-mm">${raDot(k)}<b>${esc(c(k).ko)}</b> ${esc(mm)}</div>`).join("");
    const isFifth = key === "postponed";
    const dirs = isFifth && m.dirs && m.dirs.length
      ? `<div class="ra-dirs"><div class="ra-h6">돌아볼 수 있는 방향 · 마음에 걸리는 것 하나를 골라 보세요</div>${m.dirs.map(([d, a], n) => `<div class="ra-dir"><b>${n + 1}</b><div><span>${esc(d)}</span><em>${esc(a)}</em></div></div>`).join("")}</div>` : "";
    return `
      <div class="ra-msg">
        <div class="ra-mh"><span class="ra-ml"><b>0${no}</b>${esc(m.label)}</span><span class="ra-mc">${route}<em>${RA_POS[key]}</em></span></div>
        <div class="ra-mt">${esc(m.theme)}</div>
        ${m.voiceIsQuestion ? `<div class="ra-mq ra-mq--ask">${esc(m.voice)}<small>${esc(m.line)}</small></div>` : `<div class="ra-mq">“${esc(m.voice)}”<small>${esc(m.line)}</small></div>`}
        <div class="ra-mg">
          <div><div class="ra-h6">${isFifth ? "이 색이 상징하는 것" : "컬러의 의미"}</div>${means}</div>
          <div><div class="ra-h6">${isFifth ? "이 자리를 읽는 관점" : "이어진 해석"}</div><p>${esc(isFifth ? m.view + " " + m.flow : m.flow)}</p></div>
        </div>
        ${dirs}
      </div>`;
  }
  // v3_38 · 대분류 머리: 번호 상자 + 제목 + 영문 + 굵은 밑줄로 구분을 분명하게
  const RA_SEC_EN = { "01": "MY FIVE COLORS", "02": "FOUR READINGS", "03": "OVERALL READING" };
  function raSec(no, title) { return `<div class="ra-sec"><b><i>${no}</i></b><span>${esc(title)}</span><em>${RA_SEC_EN[no] || ""}</em></div>`; }

  function raAspectHTML(a, i) {
    const dots = a.keys.map(raDot).join("");
    const list = a.list ? `<div class="ra-alist">${a.list.map(([k, say, tail]) => `<div>${raDot(k)}<b>${esc(c(k).ko)}</b><span class="ra-say">${esc(say)}</span><span class="ra-tail">${esc(tail)}</span></div>`).join("")}</div>` : "";
    const quote = a.quote ? `<div class="ra-aq">“${esc(a.quote)}”</div>` : "";
    const rows = a.rows ? `<div class="ra-arows">${a.rows.map(([k, lb, tx]) => `<div class="ra-arow"><div class="ra-arow-k">${raDot(k)}<b>${esc(c(k).ko)}</b><small>${esc(lb)}</small></div><p>${esc(tx)}</p></div>`).join("")}</div>` : "";
    const qs = a.qs ? `<div class="ra-qs">${a.qs.map(([lb, q], n) => `<div class="ra-q"><b>Q${n + 1}</b><span><em>${esc(lb)}</em>${esc(q)}</span></div><div class="ra-lines"><i></i></div>`).join("")}</div>` : "";
    const memo = "";
    return `
      <div class="ra-asp">
        <div class="ra-ah">${i >= 0 ? `<span class="ra-an">${String(i + 1).padStart(2, "0")}</span>` : `<span class="ra-tag"><i>TIP</i></span>`}<span class="ra-at">${esc(a.t)}</span><span class="ra-adots">${dots}</span></div>
        <div class="ra-alead">${esc(a.lead)}</div>
        ${quote}${list}${rows}
        ${a.body.map((p) => `<p class="ra-ap">${esc(p)}</p>`).join("")}
        ${qs}

        ${memo}
      </div>`;
  }

  // v3_37 · 컬러 보틀 비교 카드 (관계 02~04)
  function raBarColor(k) { return k === "W" ? "#d9d6de" : c(k).hex; }
  function raCmpHTML(it, no) {
    const dots = it.keys.map(raDot).join("");
    const col = (o) => `
      <div class="ra-col" style="border-top-color:${raBarColor(o.k)}">
        <div class="ra-col-h">
          <span class="ra-col-b">${bottleSVG(c(o.k).hex, { w: 26 })}</span>
          <div><div class="ra-col-k">${esc(o.pos)} · ${esc(c(o.k).ko)}</div><div class="ra-col-l">${esc(o.lb)}</div></div>
        </div>
        ${o.main ? `<div class="ra-col-m">${esc(o.main)}</div>` : ""}
        ${o.why ? `<p class="ra-col-why">${esc(o.why)}</p>` : ""}
        ${o.lines ? o.lines.map(([h, t]) => `<div class="ra-col-f"><em>${esc(h)}</em><span>${esc(t)}</span></div>`).join("") : ""}
      </div>`;
    const cols = it.arrow
      ? `<div class="ra-cols ra-cols--2">${col(it.cols[0])}<div class="ra-col-arr">→</div>${col(it.cols[1])}</div>`
      : `<div class="ra-cols ra-cols--${it.cols.length}">${it.cols.map(col).join("")}</div>`;
    const f = it.foot || {};
    const foot = f.items
      ? `<div class="ra-tips"><div class="ra-tips-t">${esc(f.t)}</div>${f.items.map((x) => `<div class="ra-tip">${esc(x)}</div>`).join("")}</div>`
      : f.p ? `<p class="ra-ap ra-cmp-foot">${esc(f.p)}</p>` : "";
    return `
      <div class="ra-asp ra-cmp">
        <div class="ra-ah"><span class="ra-an">${String(no).padStart(2, "0")}</span><span class="ra-at">${esc(it.t)}</span><span class="ra-adots">${dots}</span></div>
        <div class="ra-alead">${esc(it.lead)}</div>
        ${cols}
        ${foot}
      </div>`;
  }
  // v3_40 · 실천 아래 "왜 도움이 되는지" 줄 앞에 붙는 작은 화살표 아이콘 (↳)
  const WHY_IC = `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 1.5v4.2a2 2 0 0 0 2 2h5" fill="none" stroke="#8b7cc4" stroke-width="1.6" stroke-linecap="round"/><path d="M7.4 5.4l2.3 2.3-2.3 2.3" fill="none" stroke="#8b7cc4" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  // v3_38 · 생활 속에 적용하기 (일상 · 업무 · 공부) — 한 페이지를 이 항목 하나로
  function raLifeHTML(it, no) {
    const dots = it.keys.map(raDot).join("");
    const row = ([k, lb, tx, why]) => `
      <div class="ra-lrow">
        <div class="ra-arow-k">${raDot(k)}<b>${esc(c(k).ko)}</b><small>${esc(lb)}</small></div>
        <div class="ra-lrow-t"><p class="ra-lrow-do">${esc(tx)}</p>${why ? `<p class="ra-lrow-why"><i class="ra-why-ic">${WHY_IC}</i><span>${esc(why)}</span></p>` : ""}</div>
      </div>`;
    const part = (pt) => `
      <div class="ra-life">
        <div class="ra-life-h"><span>${esc(pt.h)}</span></div>
        <p class="ra-life-i">${esc(pt.intro)}</p>
        <div class="ra-lrows">${pt.rows.map(row).join("")}</div>
      </div>`;
    return `
      <div class="ra-asp ra-lifes">
        <div class="ra-ah"><span class="ra-an">${String(no).padStart(2, "0")}</span><span class="ra-at">${esc(it.t)}</span><span class="ra-adots">${dots}</span></div>
        <div class="ra-alead">${esc(it.lead)}</div>
        ${it.parts.map(part).join("")}
        <p class="ra-ap ra-life-end">${esc(it.end)}</p>
      </div>`;
  }
  // v3_38 · 종합 컬러리딩 + 마무리 질문 (마지막 페이지 한 장)
  function raCloseHTML(X, sel) {
    const Q = X.questions;
    return `
      ${raSec("03", "종합 컬러리딩")}
      <div class="ra-close">
        <div class="ra-close-top">
          <div class="ra-close-q">“</div>
          <div class="ra-close-bottles">${sel.map((k, i) => `<span>${bottleSVG(c(k).hex, { w: 18 })}<em>${i + 1}</em></span>`).join("")}</div>
        </div>
        ${X.closing.map((p) => `<p>${p.h ? `<b class="ra-close-h">${esc(p.h)}</b>` : ""}${esc(p.t)}</p>`).join("")}
        <div class="ra-close-q ra-close-q--end">”</div>
      </div>
      <p class="ra-close-note">${esc(X.closingNote)}</p>
      <div class="ra-endq">
        <div class="ra-endq-t">${esc(Q.t)}</div>
        <p class="ra-endq-d">${esc(Q.lead)}</p>
        ${Q.qs.map(([lb, q], n) => `<div class="ra-endq-q"><b>Q${n + 1}</b><em>${esc(lb)}</em><span>${esc(q)}</span></div><div class="ra-endq-line"></div>`).join("")}
      </div>
      <p class="ra-note">${noteHTML()}</p>`;
  }

  function buildPdfBlocks(R, opts) {
    if (!R) return [];
    const solo = !!(opts && opts.standalone);
    const X = R.pdf;
    const blocks = [];
    blocks.push({ pageBreakBefore: false, html: `
      ${solo ? "" : `<div class="ra-part">PART 1 · 컬러 심리리딩</div>`}
      ${raSec("01", "나의 다섯 컬러")}
      <div class="ra-desc">직감으로 고른 다섯 컬러의 의미를 고른 순서에 따라 살펴봐요. 1·2번째는 과거, 2·3번째는 현재, 3·4번째는 앞으로 바라는 나, 5번째는 가장 마음에 들지 않은 색이에요.</div>
      <div class="cr-pdf-row">${bottleRowHTML(R.sel, 54)}</div>
      ${raSec("02", "네 가지 결과")}
      ${raMsgHTML(R.past, 1, "past")}
      ${raMsgHTML(R.present, 2, "present")}` });
    blocks.push({ pageBreakBefore: true, html: `
      ${raMsgHTML(R.future, 3, "future")}
      ${raMsgHTML(R.postponed, 4, "postponed")}
      <div class="ra-heal">
        <div class="ra-heal-b">${bottleSVG(c(X.heal.key).hex, { w: 34 })}</div>
        <div><div class="ra-heal-t">${esc(X.heal.title)}</div><p>${esc(X.heal.text)}</p></div>
      </div>` });
    // v3_43: 관계·생활 적용(옛 3·4쪽) 삭제 — 키워드는 2쪽 5번째 색·생활에서 만나 보기 아래에 (번호 없이)
    blocks.push({ pageBreakBefore: false, html: `<div class="ra-asps ra-kw">${raAspectHTML(X.keyword, -1)}</div>` });
    // 03 종합 컬러리딩 + 지금 나에게 던져볼 질문 — 마지막 한 페이지 안에서 마무리
    blocks.push({ pageBreakBefore: true, html: raCloseHTML(X, R.sel) });
    return blocks;
  }

  function logText(sel) {
    if (!sel) return "";
    return sel.slice(0, 4).map((k, i) => `${i + 1}.${c(k).ko}`).join(" ") + ` / 5.${c(sel[4]).ko}`;
  }

  window.CR = {
    bindScreen,
    swatchBg,
    enabled: true,
    colors: CR_COLORS,
    openPick,
    getSelection,
    setSelection,
    reset,
    buildReading,
    buildScreenHTML,
    buildPdfBlocks,
    logText,
    bottleSVG,
  };
})();
