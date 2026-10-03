/* ============================================================
   CCT 강의용 — 4병 컬러리딩: 선택 화면 · 해석 엔진 · 결과 렌더링
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
    past: "그동안 이런 마음으로 지내오셨을 수 있어요.",
    present: "요즘에는 이런 마음이 조금 더 크게 느껴질 수 있어요.",
    future: "앞으로는 이런 마음을 더 키워 가고 싶으실 수 있어요.",
  };
  function meanLine(a, b, slot) {
    const A = c(a), B = c(b);
    if (slot === "past") return `${eunC(A.ko)} ${A.mean}을, ${eunC(B.ko)} ${B.mean}을 의미해요.`;
    if (slot === "present") return `${j(A.ko, "이", "가")} ${A.mean}이라면, ${eunC(B.ko)} ${B.mean}을 의미해요.`;
    return `${eunC(A.ko)} ${A.mean}, ${eunC(B.ko)} ${B.mean}을 담고 있어요.`;
  }
  function flowLine(a, b, slot, core) {
    const A = c(a), B = c(b);
    let lead;
    if (slot === "past") lead = `${A.adjP} ${A.ko}에서 ${B.adj} ${euro(B.ko)} 이어졌다는 것은`;
    else if (slot === "present") lead = `${A.adjP} ${A.ko} 뒤에 ${j(B.ko, "을", "를")} 선택했다는 것은`;
    else lead = `${A.adj} ${A.ko}에 이어 ${B.adj} ${j(B.ko, "을", "를")} 고르셨다는 것은`;
    return `${lead}, ${core}으로 읽을 수 있어요.`;
  }
  function pairMsg(a, b, slot) {
    const pr = pair(a, b);
    const voice = pr[1], line = SLOT_LINE[slot];
    const mean = meanLine(a, b, slot), flow = flowLine(a, b, slot, pr[2]);
    const body = `${mean} ${flow}`;
    return { theme: pr[0], short: pr[5] || pr[0], voice, line, mean, flow, body, text: `“${voice}” ${line} ${body}` };
  }
  // "해내고, 아끼고, 표현하고, 누리" + 끝말
  function stemList(cs, last) {
    return cs.map((C, i) => (i < cs.length - 1 ? C.stem + "고" : C.stem + last)).join(", ");
  }

  // 3페이지 「다섯 컬러의 흐름으로 읽는 나의 마음」 9개 항목
  function buildAspects(sel) {
    const [k1, k2, k3, k4, k5] = sel;
    const C1 = c(k1), C2 = c(k2), C3 = c(k3), C4 = c(k4), C5 = c(k5);
    const N = pair(k2, k3), F = pair(k3, k4), E = pair(k1, k4), M = pair(k2, k4);
    const four = [C1, C2, C3, C4];

    const a1 =
      `2번 ${C2.ko}의 ‘${C2.want}’${pp("마음", "은", "는")} 과거와 현재에 모두 들어 있어서, 예전부터 지금까지 꾸준히 이어져 온 마음이에요. ` +
      `예전에는 이 마음에 “${C1.say}” 하는 마음이 더해졌다면, 요즘은 “${C3.say}” 하는 마음이 더해졌어요.`;
    const a2 = N[3];
    const a3 =
      `요즘은 “${C2.say}” 하는 마음과 “${C3.say}” 하는 마음이 함께 느껴질 수 있어요. ` +
      `앞의 것은 예전부터 이어 온 마음이고, 뒤의 것은 요즘 새로 커진 마음이에요. 지금은 어느 쪽 목소리가 더 크게 들리나요?`;
    const a4 =
      `‘${C3.want}’${pp("마음", "은", "는")} 그대로 이어 가면서, “${C2.say}” 하던 마음은 앞으로 “${C4.say}” 하는 마음으로 바뀌어 가길 바라고 있어요. ` +
      `이 변화를 한마디로 하면 ‘${M[0]}’이에요.`;
    const a5 = F[4];
    const a6 =
      `처음엔 “${C1.say}” 하는 마음이었다면, 마지막엔 “${C4.say}” 하는 마음이에요. ` +
      `${C1.ko}에서 ${euro(C4.ko)}의 변화는, ${E[2]}으로 읽을 수 있어요.`;
    const a7 =
      `네 컬러를 이어 말하면 “${stemList(four, "고")} 싶다”예요. ` +
      `이 중에서 지금 가장 와닿는 말 하나를 골라 보세요.`;
    const a8 =
      `${stemList(four, "느라")} 바빴던 만큼, ${C5.gap} ` +
      `${eunC(C5.ko)} 그 마음을 이제는 조금 챙겨 주고 싶다는 신호예요.`;
    const a9 = C5.ask2;

    return [
      { t: "예전부터 지금까지 이어지는 마음", d: a1, keys: [k1, k2, k3] },
      { t: "요즘 이런 순간이 있을 수 있어요", d: a2, keys: [k2, k3] },
      { t: "요즘 내 안의 두 마음", d: a3, keys: [k2, k3] },
      { t: "지금에서 앞으로 바뀌고 싶은 것", d: a4, keys: [k2, k3, k4] },
      { t: "앞으로 해 보고 싶은 작은 일", d: a5, keys: [k3, k4] },
      { t: "처음과 마지막을 비교하면", d: a6, keys: [k1, k4] },
      { t: "네 컬러가 반복해서 하는 말", d: a7, chips: [k1, k2, k3, k4].map((k) => ({ key: k, word: c(k).keywords[0] })) },
      { t: "아직 꺼내 쓰지 못한 마음", d: a8, keys: [k5] },
      { t: "지금 나에게 던져볼 질문", d: a9, keys: [k1, k2, k3, k4, k5] },
    ];
  }

  function buildReading(sel, name) {
    if (!sel || sel.length !== 5) return null;
    const [k1, k2, k3, k4, k5] = sel;
    const C1 = c(k1), C2 = c(k2), C3 = c(k3), C4 = c(k4), C5 = c(k5);
    const who = name ? `${name}님` : "당신";
    const P = pair(k1, k2), N = pair(k2, k3), F = pair(k3, k4), E = pair(k1, k4);

    const past = Object.assign({ label: "과거의 나", sub: "과거의 나에게 보내는 메시지", keys: [k1, k2] }, pairMsg(k1, k2, "past"));
    const present = Object.assign({ label: "현재의 나", sub: "현재의 나에게 보내는 메시지", keys: [k2, k3] }, pairMsg(k2, k3, "present"));
    const future = Object.assign({ label: "앞으로 바라는 나", sub: "앞으로 바라는 나에게 보내는 메시지", keys: [k3, k4] }, pairMsg(k3, k4, "future"));
    const pLine = "마음에 덜 끌려서 고른 색이지만, 나쁜 뜻은 아니에요.";
    const pMean = `${eunC(C5.ko)} ${C5.mean}을 의미해요.`;
    const pFlow = "이 색이 마지막에 남았다는 것은, 이런 마음이 필요하다고 느끼면서도 아직 충분히 꺼내 쓰지 못한 마음으로 읽을 수 있어요.";
    const pBody = `${pMean} ${pFlow}`;
    const postponed = {
      label: "원하지만 아직 충분히 꺼내 쓰지 못한 마음", sub: "5번째 컬러", keys: [k5],
      theme: C5.t5, short: C5.t5s || C5.t5, voice: C5.v5, line: pLine, mean: pMean, flow: pFlow, body: pBody,
      text: `“${C5.v5}” ${pLine} ${pBody}`,
    };

    const aspects = buildAspects(sel);

    const summary =
      `${who}의 다섯 컬러를 한 줄로 말하면 ‘${E[0]}’이에요. ` +
      `요즘 가장 큰 마음은 ‘${N[0]}’이고, 앞으로는 ‘${F[0]}’을 더 키워 가고 싶으실 수 있어요. ` +
      `그 사이에 ${C5.want5}도 조금 챙겨 주면 좋겠다는 신호가 함께 있어요.`;

    const healing = { key: k5, text: C5.tip };

    return { sel, who, past, present, future, postponed, aspects, summary, healing };
  }

  // ---------- 결과 HTML ----------
  // 다섯 병 + 관계 표시: 위쪽 괄호 = 2·3 현재의 나 / 아래쪽 괄호 = 1·2 과거의 나, 3·4 앞으로 바라는 나, 5 꺼내지 못한 마음
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
        ${br("fifth", "6", "5", "꺼내지<br>못한 마음")}
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

  function aspectsHTML(R) {
    return R.aspects.map((a, i) => `
      <div class="cr-aspect">
        <div class="cr-aspect-t"><span class="cr-aspect-n">${i + 1}</span><span class="cr-aspect-tt">${esc(a.t)}</span>${dotsHTML(a.keys)}</div>
        <p class="cr-aspect-d">${esc(a.d)}</p>
        ${a.chips ? `<div class="cr-aspect-chips">${a.chips.map((x) => `<span class="cr-chip"><i style="${swatchBg(x.key)}"></i>${esc(x.word)}</span>`).join("")}</div>` : ""}
      </div>`).join("");
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
          <div class="cr-healing-t">지금 나에게 필요한 컬러 · ${esc(h.ko)}</div>
          <p>${esc(R.healing.text)}</p>
        </div>
      </div>`;
  }

  const NOTE = "컬러리딩은 지금 이 순간 직감으로 고른 색을 통해 마음의 흐름을 읽어보는 대화의 도구입니다. 심리검사나 진단이 아니며, 고른 색에 좋고 나쁨은 없습니다. 그때의 마음에 따라 선택하는 색은 달라질 수 있습니다.";


  // ---------- 컬러 카드 (결과 화면: 5장을 한 장씩 넘겨 보고, 마지막에 종합 결과) ----------
  // 결과 카드 4장: 과거의 나(1·2) / 현재의 나(2·3) / 앞으로 바라는 나(3·4) / 꺼내지 못한 마음(5)
  const CARDS = [
    { label: "과거의 나", tag: "1·2번 컬러", file: "Past", idx: [0, 1], msg: "past" },
    { label: "현재의 나", tag: "2·3번 컬러", file: "Present", idx: [1, 2], msg: "present" },
    { label: "앞으로 바라는 나", tag: "3·4번 컬러", file: "Future", idx: [2, 3], msg: "future" },
    { label: "꺼내지 못한 마음", tag: "5번 컬러", file: "Hidden", idx: [4], msg: "postponed" },
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
    const means = keys.map((k) => `
            <div class="cr-cm"><i style="${swatchBg(k)}"></i><p><b>${esc(c(k).ko)}</b> ${esc(c(k).mean)}</p></div>`).join("");
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
          <div class="cr-card-voice">“${esc(m.voice)}”</div>
          <div class="cr-card-means">${means}</div>
          <p class="cr-card-flow">${esc(m.flow)}</p>
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

  // 카드 제목을 항상 한 줄로: 넘치면 글자를 조금씩 줄임
  function fitTitles(scope) {
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
            <div class="cr-sum-voice">“${esc(m.voice)}”</div>
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
        <h2 class="cr-part-title">4병 컬러리딩</h2>`}
        <p class="cr-part-desc cr-part-desc--one">다섯 컬러가 지금의 나에게 보내는 메시지예요</p>
        <div class="cr-deck-view" id="crDeckView">${deckHTML(R)}</div>
        <div class="cr-full" id="crFull" hidden>
        ${viewTabsHTML()}
        <div class="cr-full-kicker">종합 컬러리딩 결과</div>
        ${bottleRowHTML(R.sel)}
        ${sumRowsHTML(R)}
        ${summaryHTML(R)}
        <p class="cr-note">${esc(NOTE)}</p>
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

  // PDF용 블록 — 각 블록이 한 페이지(가용 높이 261mm) 안에 들어가도록 나눕니다.
  function buildPdfBlocks(R, opts) {
    if (!R) return [];
    const solo = !!(opts && opts.standalone);
    return [
      `<div class="section-title">${solo ? "" : "PART 1 · "}4병 컬러리딩</div>
       <div class="section-desc">직감으로 고른 다섯 컬러가 과거·현재·앞으로 바라는 나에게 보내는 메시지예요. 1·2번째는 과거, 2·3번째는 현재, 3·4번째는 앞으로 바라는 나, 5번째는 아직 충분히 꺼내 쓰지 못한 마음이에요.</div>
       <div class="cr-pdf-row">${bottleRowHTML(R.sel, 54)}</div>
       ${msgHTML(R.past, 1)}
       ${msgHTML(R.present, 2)}`,
      `${msgHTML(R.future, 3)}
       ${msgHTML(R.postponed, 5)}
       ${summaryHTML(R)}`,
      `<div class="section-title">다섯 컬러의 흐름으로 읽는 나의 마음</div>
       <div class="section-desc">다섯 컬러를 이어 읽으며, 요즘 내 마음을 아홉 가지로 나눠 보았어요.</div>
       <div class="cr-aspects cr-aspects--pdf">${aspectsHTML(R)}</div>
       <p class="cr-note">${esc(NOTE)}</p>`,
    ];
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
