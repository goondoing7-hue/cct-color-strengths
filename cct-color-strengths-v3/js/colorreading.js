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
    return CR_PAIRS[a + ">" + b] || ["두 색이 함께 만드는 흐름", `${c(a).ko}의 ${c(a).keywords[0]}과 ${c(b).ko}의 ${c(b).keywords[0]}이 함께 어우러지는 흐름입니다.`];
  }

  // 병 모양 SVG (교재의 컬러오일 보틀을 단순화)
  function bottleSVG(hex, opts) {
    const o = opts || {};
    const isWhite = hex.toLowerCase() === "#f5f5f2";
    const stroke = isWhite ? "#C9C9C4" : "rgba(0,0,0,.12)";
    const w = o.w || 48;
    const h = Math.round(w * 1.42);
    return `
      <svg class="cr-bottle-svg" width="${w}" height="${h}" viewBox="0 0 60 85" aria-hidden="true">
        <rect x="21" y="1" width="18" height="15" rx="3" fill="#E07A2C"/>
        <rect x="21" y="1" width="6" height="15" rx="2" fill="#F2A15A" opacity=".7"/>
        <rect x="24" y="15" width="12" height="5" fill="#C9672A"/>
        <rect x="7" y="19" width="46" height="64" rx="8" fill="${hex}" stroke="${stroke}" stroke-width="1.2"/>
        <rect x="12" y="25" width="6" height="50" rx="3" fill="#fff" opacity="${isWhite ? 0.9 : 0.22}"/>
      </svg>`;
  }

  // ---------- 선택 상태 ----------
  let picks = [];      // 마음에 끌리는 4색 (순서 = 선택 순서)
  let fifth = null;    // 가장 마음에 들지 않는 색
  let step = 1;        // 1: 4색 선택, 2: 5번째 선택
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
  function reset() { picks = []; fifth = null; step = 1; }

  // ---------- 선택 화면 ----------
  function renderPick() {
    const root = document.getElementById("crPickBody");
    if (!root) return;
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
    renderPick();
  }

  // ---------- 해석 원칙 (프로젝트 문서 「컬러리딩_해석원칙.md」 — 최우선) ----------
  // 근거는 ① 각 컬러의 기본 의미 ② 선택 순서 ③ 1·2/2·3/3·4 겹침 ④ 1→4 변화 ⑤ 5번째와 앞 네 컬러의 차이뿐.
  // 따뜻한/차가운 색, 보색, 에너지 높낮이는 심리적 근거로 쓰지 않는다 (데이터의 family/energy/CR_COMPLEMENT 미사용).
  // 3·4번은 미래 예측이 아니라 "앞으로 바라는 나" — 소망·지향으로만 쓴다.
  // 조사만 돌려준다 (‘따옴표’ 뒤에 붙일 때)
  function pp(word, withB, withoutB) { return hasBatchim(word) ? withB : withoutB; }
  function ppEuro(word) { return hasBatchim(word) && !jongIsRieul(word) ? "으로" : "로"; }
  // 조합 메시지의 첫 문장만 (결과지에는 핵심 한 문장만 싣는다)
  function firstSentence(t) {
    const i = String(t).indexOf(". ");
    return i === -1 ? String(t) : String(t).slice(0, i + 1);
  }

  // 3페이지 「다섯 컬러의 흐름으로 읽는 나의 마음」 9개 항목
  function eunC(w) { return j(w, "은", "는"); }

  function buildAspects(sel) {
    const [k1, k2, k3, k4, k5] = sel;
    const C1 = c(k1), C2 = c(k2), C3 = c(k3), C4 = c(k4), C5 = c(k5);
    const P = pair(k1, k2), N = pair(k2, k3), F = pair(k3, k4), E = pair(k1, k4);
    const kw = (C, i) => C.keywords[i] || C.keywords[0];
    const eun = (w) => j(w, "은", "는");
    const four = [C1, C2, C3, C4];

    // 1. 과거 → 현재 : 2번이 겹치는 자리
    const a1 =
      `과거(${C1.ko}·${C2.ko})와 현재(${C2.ko}·${C3.ko})에는 ${j(C2.ko, "이", "가")} 함께 들어 있습니다. ` +
      `현재 선택한 컬러의 흐름에서는 ${C2.ko}의 ‘${C2.ns}’${pp("마음", "이", "가")} 과거부터 지금까지 이어지고 있는 것으로 볼 수 있습니다. ` +
      `과거에는 그 곁에 ${C1.ko}의 ‘${kw(C1, 0)}·${kw(C1, 1)}’${pp(kw(C1, 1), "이", "가")} 있었다면, 지금은 ${C3.ko}의 ‘${kw(C3, 0)}·${kw(C3, 1)}’${pp(kw(C3, 1), "이", "가")} 새롭게 더해졌습니다. ` +
      `${C1.ns}에서 ${C3.ns} 쪽으로 마음의 무게가 옮겨 가고 있을 가능성을 살펴볼 수 있습니다.`;

    // 2. 지금 가장 크게 드러나는 마음 : 2·3번이 함께 놓인 자리의 메시지
    const a2 =
      `현재를 나타내는 ${j(C2.ko, "과", "와")} ${j(C3.ko, "이", "가")} 함께 놓인 자리의 메시지는 ‘${N[0]}’입니다. ` +
      `${C2.ko}의 ‘${kw(C2, 0)}’${pp(kw(C2, 0), "과", "와")} ${C3.ko}의 ‘${kw(C3, 0)}’${pp(kw(C3, 0), "이", "가")} 이 메시지 안에서 만나며, ` +
      `지금은 두 마음이 함께 향하는 곳에 관심이 크게 모여 있을 가능성을 살펴볼 수 있습니다.`;

    // 3. 현재를 이루는 두 가지 마음 : 2번(과거와 겹침) / 3번(앞으로 바라는 나와 겹침)
    const a3 =
      `2번 ${eun(C2.ko)} ‘${C2.need}’${pp("마음", "을", "를")}, 3번 ${eun(C3.ko)} ‘${C3.need}’${pp("마음", "을", "를")} 보여줍니다. ` +
      `${eun(C2.ko)} 과거에서부터 이어져 온 마음이고, ${eun(C3.ko)} 앞으로 바라는 방향으로도 이어지는 마음입니다. ` +
      `지금은 지켜 온 마음과 새로 펼치고 싶은 마음이 함께 나타나며, 두 마음이 서로를 받쳐 주고 있는지 아니면 한쪽이 더 앞서 있는지 살펴볼 수 있습니다.`;

    // 4. 현재 → 앞으로 바라는 나 : 3번이 겹치는 자리
    const kw4 = `${kw(C4, 0)}·${kw(C4, 1)}·${kw(C4, 2)}`;
    const a4 =
      `현재(${C2.ko}·${C3.ko})와 앞으로 바라는 나(${C3.ko}·${C4.ko})에는 ${j(C3.ko, "이", "가")} 함께 들어 있습니다. ` +
      `${j(C3.ns, "은", "는")} 앞으로도 이어가고 싶은 마음으로 나타나고, ${C2.ko}의 ‘${kw(C2, 0)}’${pp(kw(C2, 0), "이", "가")} 있던 자리에는 ${C4.ko}의 ‘${kw4}’${pp(kw(C4, 2), "이", "가")} 들어옵니다. ` +
      `지금 소중히 여기는 ‘${kw(C2, 0)}’의 마음 곁에서, 앞으로는 ‘${kw(C4, 0)}’${pp(kw(C4, 0), "을", "를")} 더 키워가고 싶은 방향으로 마음이 움직이고 있습니다.`;

    // 5. 앞으로 더 중요하게 여기고 싶은 마음 : 3·4번
    const a5 =
      `${j(C3.ko, "과", "와")} ${j(C4.ko, "이", "가")} 전하는 메시지는 ‘${F[0]}’입니다. ` +
      `앞으로 ${C3.ko}의 ‘${kw(C3, 0)}’${pp(kw(C3, 0), "을", "를")} 이어가면서 ${C4.ko}의 ‘${kw(C4, 0)}’${pp(kw(C4, 0), "을", "를")} 삶에서 더 키워가고 싶은 마음이 나타납니다. ` +
      `특히 마지막 자리의 ${eun(C4.ko)} ‘${C4.need}’${pp("마음", "과", "와")} 닿아 있어, 이 마음을 앞으로 더 중요하게 여기고 싶은 방향으로 볼 수 있습니다.`;

    // 6. 처음(1번)과 마지막(4번)
    const a6 =
      `처음 고른 ${eun(C1.ko)} ‘${C1.need}’${pp("마음", "과", "와")}, 마지막 ${eun(C4.ko)} ‘${C4.ns}’${pp("마음", "과", "와")} 닿아 있습니다. ` +
      `처음에는 ‘${kw(C1, 0)}’의 마음이 중요했다면, 앞으로는 ‘${kw(C4, 0)}’의 마음을 향하고 싶은 흐름으로 볼 수 있습니다. ` +
      `두 색을 이어 보면 ‘${E[0]}’의 메시지가 읽힙니다.`;

    // 7. 1~4번 전체에서 반복되는 메시지 : 키워드·세 시기 메시지·마음의 동사
    const chain = four.map((C) => kw(C, 0)).join(" → ");
    const verbs = four.map((C) => C.verb).join(", ");
    const a7 =
      `네 컬러의 첫 키워드를 이어 보면 ${chain}입니다. ` +
      `세 시기의 메시지도 ‘${P[0]}’ → ‘${N[0]}’ → ‘${F[0]}’${ppEuro(F[0])} 이어집니다. ` +
      `이 흐름에서는 ${verbs} 싶은 마음이 한 방향으로 이어지고 있는 것으로 볼 수 있습니다.`;

    // 8. 5번째 — 앞 네 컬러와의 차이, 아직 꺼내 쓰지 못한 자원
    const lastKw = kw(C4, 0);
    const kw5 = `${kw(C5, 0)}·${kw(C5, 1)}·${kw(C5, 2)}`;
    const a8 =
      `앞의 네 컬러가 ${four.map((C) => kw(C, 0)).join("·")}${ppEuro(lastKw)} 이어졌다면, 5번째 ${eun(C5.ko)} ‘${kw5}’${pp(kw(C5, 2), "과", "와")} 닿아 있습니다. ` +
      `${eun(C5.ko)} ‘${C5.need}’${pp("마음", "을", "를")} 보여 주며, 이 마음이 필요하다고 느끼면서도 아직 충분히 꺼내 쓰지 못하고 있을 가능성을 살펴볼 수 있습니다. ` +
      `앞의 흐름 속에서 잠시 뒤로 놓인, 꺼내 쓸 수 있는 하나의 자원으로 볼 수 있습니다.`;

    // 9. 지금 나에게 던져볼 질문 (1개) — "지금, 지금…" 겹침은 피한다
    let ask = C5.ask, when = "지금";
    if (/^지금 /.test(ask)) ask = ask.slice(3);
    else if (/^지금/.test(ask)) when = "요즘";
    const a9 = `‘${F[0]}’${pp(F[0], "을", "를")} 바라고 있는 ${when}, ${ask}`;

    return [
      { t: "과거에서 현재로 이어지는 흐름", d: a1, keys: [k1, k2, k3] },
      { t: "지금 가장 크게 드러나는 마음", d: a2, keys: [k2, k3] },
      { t: "현재를 이루는 두 가지 마음", d: a3, keys: [k2, k3] },
      { t: "현재에서 바라는 방향으로 이어지는 흐름", d: a4, keys: [k2, k3, k4] },
      { t: "앞으로 더 중요하게 여기고 싶은 마음", d: a5, keys: [k3, k4] },
      { t: "처음과 마지막 컬러가 보여주는 변화", d: a6, keys: [k1, k4] },
      { t: "전체 컬러에서 반복되는 메시지", d: a7, chips: [k1, k2, k3, k4].map((k) => ({ key: k, word: kw(c(k), 0) })) },
      { t: "아직 충분히 꺼내지 못한 마음", d: a8, keys: [k5] },
      { t: "지금 나에게 던져볼 질문", d: a9, keys: [k1, k2, k3, k4, k5] },
    ];
  }

  function buildReading(sel, name) {
    if (!sel || sel.length !== 5) return null;
    const [k1, k2, k3, k4, k5] = sel;
    const C1 = c(k1), C2 = c(k2), C3 = c(k3), C4 = c(k4), C5 = c(k5);
    const who = name ? `${name}님` : "당신";
    const P = pair(k1, k2), N = pair(k2, k3), F = pair(k3, k4);

    // 1·2번 — 지금까지 중요하게 사용해 온 마음
    const past = {
      label: "과거의 나", sub: "과거의 나에게 보내는 메시지", keys: [k1, k2], theme: P[0],
      text:
        `${C1.ko}에서 ${euro(C2.ko)} 이어지는 지나온 시간에는 ${q(P[0], "이라는", "라는")} 메시지가 담겨 있습니다. ${firstSentence(P[1])} ` +
        `지금까지는 ${C1.ko}의 ‘${C1.ns}’${pp("마음", "과", "와")} ${C2.ko}의 ‘${C2.ns}’${pp("마음", "을", "를")} 중요하게 사용해 온 것으로 읽힙니다.`,
    };
    // 2·3번 — 지금 가장 크게 작동하는 마음
    const present = {
      label: "현재의 나", sub: "현재의 나에게 보내는 메시지", keys: [k2, k3], theme: N[0],
      text:
        `지금의 나에게 건네는 메시지는 ‘${N[0]}’입니다. ${firstSentence(N[1])} ` +
        `요즘은 ${C2.ko}의 ‘${C2.ns}’${pp("마음", "과", "와")} ${C3.ko}의 ‘${C3.ns}’${pp("마음", "이", "가")} 크게 움직이고 있는 흐름으로 볼 수 있습니다.`,
    };
    // 3·4번 — 앞으로 바라는 나 (예측이 아닌 소망·지향)
    let fs = firstSentence(F[1]);
    if (/싶은 마음이 (함께 )?나타납니다\.$/.test(fs)) fs = "앞으로 " + fs;
    const future = {
      label: "앞으로 바라는 나", sub: "앞으로 바라는 나에게 보내는 메시지", keys: [k3, k4], theme: F[0],
      text:
        `앞으로 바라는 나에게 건네는 메시지는 ‘${F[0]}’입니다. ${fs} ` +
        `마지막 자리에 ${j(C4.ko, "이", "가")} 놓인 만큼, ‘${C4.need}’${pp("마음", "을", "를")} 삶에서 더 키워가고 싶은 방향으로 볼 수 있습니다.`,
    };
    // 5번째 — 원하지만 아직 충분히 꺼내 쓰지 못한 마음 (부족·문제가 아닌 자원)
    const postponed = {
      label: "원하지만 아직 충분히 꺼내 쓰지 못한 마음", sub: "5번째 컬러", keys: [k5],
      theme: `${C5.ko} · ${C5.tag}`,
      text:
        `${eunC(C5.ko)} ‘${C5.held}’${pp("바람", "과", "와")} 닿아 있습니다. ${C5.held2} ` +
        `가장 마음에 들지 않는 색이라고 해서 부정적인 의미는 아닙니다. 아직 손이 잘 가지 않을 뿐, ${C5.ko}의 ‘${C5.keywords[0]}’${pp(C5.keywords[0], "을", "를")} 꺼내 쓰고 싶은 마음이 내 안에 있다는 신호로 볼 수 있습니다.`,
    };

    const aspects = buildAspects(sel);

    const summary =
      `${who}의 다섯 컬러는 ${C1.ko}에서 시작해 ${C2.ko}, ${j(C3.ko, "을", "를")} 지나 ${euro(C4.ko)} 이어지고, 5번째에 ${j(C5.ko, "이", "가")} 놓였습니다. ` +
      `지나온 시간에는 ‘${P[0]}’의 흐름 속에서, ${j(C1.ns, "과", "와")} ${j(C2.ns, "을", "를")} 함께 지켜 왔을 수 있습니다. ` +
      `지금은 ‘${N[0]}’의 시기로, ${j(C2.ns, "과", "와")} ${j(C3.ns, "이", "가")} 함께 나타납니다. ` +
      `앞으로는 ‘${F[0]}’${pp(F[0], "을", "를")} 바라며, ${C3.ko}의 ‘${C3.keywords[0]}’${pp(C3.keywords[0], "을", "를")} 이어가면서 ${C4.ko}의 ‘${C4.keywords[0]}’${pp(C4.keywords[0], "을", "를")} 삶에서 더 키워가고 싶은 마음이 보입니다. ` +
      `한편 5번째 ${eunC(C5.ko)} ${j(C5.ns, "이", "가")} 아직 충분히 꺼내지지 않았을 가능성을 보여줍니다.`;

    const healing = {
      key: k5,
      text: `${eunC(C5.ko)} ‘${C5.prescription}’${pp(C5.prescription, "과", "와")} 닿아 있는 색입니다. 옷이나 소품, 공간 속에서 이 색을 가볍게 가까이해 보며, 아직 꺼내 쓰지 못한 마음을 떠올려 볼 수 있습니다.`,
    };

    return { sel, who, past, present, future, postponed, aspects, summary, healing };
  }

  // ---------- 결과 HTML ----------
  function bottleRowHTML(sel, size) {
    const w = size || 46;
    const items = sel.slice(0, 4).map((k, i) => `
      <div class="cr-row-item">
        ${bottleSVG(c(k).hex, { w })}
        <div class="cr-row-num">${i + 1}</div>
        <div class="cr-row-name">${esc(c(k).ko)}</div>
      </div>`).join("");
    const k5 = sel[4];
    return `
      <div class="cr-row">
        <div class="cr-row-main">${items}</div>
        <div class="cr-row-sep" aria-hidden="true"></div>
        <div class="cr-row-item cr-row-item--fifth">
          ${bottleSVG(c(k5).hex, { w })}
          <div class="cr-row-num">5</div>
          <div class="cr-row-name">${esc(c(k5).ko)}</div>
        </div>
      </div>
      <div class="cr-row-legend">
        <span><i class="cr-arc"></i>1·2 과거</span><span><i class="cr-arc"></i>2·3 현재</span><span><i class="cr-arc"></i>3·4 바라는 나</span><span><i class="cr-arc cr-arc--5"></i>5 꺼내지 못한 마음</span>
      </div>`;
  }

  function chipHTML(k) {
    return `<span class="cr-chip"><i style="background:${c(k).hex}${k === "W" ? ";border:1px solid #b9b9b4;box-sizing:border-box" : ""}"></i>${esc(c(k).ko)}</span>`;
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
        <p class="cr-msg-text">${esc(m.text)}</p>
      </div>`;
  }

  // 항목 제목 옆 — 그 항목이 다루는 컬러를 작은 원으로
  function dotsHTML(keys) {
    if (!keys || !keys.length) return "";
    return `<span class="cr-aspect-dots">${keys.map((k) => `<i title="${esc(c(k).ko)}" style="background:${c(k).hex}${k === "W" ? ";border:1px solid #b9b9b4;box-sizing:border-box" : ""}"></i>`).join("")}</span>`;
  }

  function aspectsHTML(R) {
    return R.aspects.map((a, i) => `
      <div class="cr-aspect">
        <div class="cr-aspect-t"><span class="cr-aspect-n">${i + 1}</span><span class="cr-aspect-tt">${esc(a.t)}</span>${dotsHTML(a.keys)}</div>
        <p class="cr-aspect-d">${esc(a.d)}</p>
        ${a.chips ? `<div class="cr-aspect-chips">${a.chips.map((x) => `<span class="cr-chip"><i style="background:${c(x.key).hex}${x.key === "W" ? ";border:1px solid #b9b9b4;box-sizing:border-box" : ""}"></i>${esc(x.word)}</span>`).join("")}</div>` : ""}
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

  // opts.standalone: 컬러리딩만 진행한 경우 — PART 표시와 CCT 구분선을 뺍니다.
  function buildScreenHTML(R, opts) {
    if (!R) return "";
    const solo = !!(opts && opts.standalone);
    return `
      <section class="cr-section ${solo ? "cr-section--solo" : ""}" id="crSection">
        ${solo ? "" : `<div class="cr-part-kicker">PART 1</div>
        <h2 class="cr-part-title">4병 컬러리딩</h2>`}
        <p class="cr-part-desc">직감으로 고른 다섯 컬러가 과거·현재·앞으로 바라는 나에게 보내는 메시지입니다.</p>
        ${bottleRowHTML(R.sel)}
        ${msgHTML(R.past, 1)}
        ${msgHTML(R.present, 2)}
        ${msgHTML(R.future, 3)}
        ${msgHTML(R.postponed, 5)}
        <h3 class="cr-sub-title">다섯 컬러의 흐름으로 읽는 나의 마음</h3>
        <div class="cr-aspects">${aspectsHTML(R)}</div>
        ${summaryHTML(R)}
        <p class="cr-note">${esc(NOTE)}</p>
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
       <div class="section-desc">직감으로 고른 다섯 컬러가 과거·현재·앞으로 바라는 나에게 보내는 메시지입니다. 1·2번째는 과거, 2·3번째는 현재, 3·4번째는 앞으로 바라는 나, 5번째는 원하지만 아직 충분히 꺼내 쓰지 못한 마음을 보여줍니다.</div>
       <div class="cr-pdf-row">${bottleRowHTML(R.sel, 54)}</div>
       ${msgHTML(R.past, 1)}
       ${msgHTML(R.present, 2)}`,
      `${msgHTML(R.future, 3)}
       ${msgHTML(R.postponed, 5)}
       ${summaryHTML(R)}`,
      `<div class="section-title">다섯 컬러의 흐름으로 읽는 나의 마음</div>
       <div class="section-desc">선택한 순서, 두 컬러가 겹치는 자리, 1번에서 4번으로 옮겨가는 변화, 그리고 5번째 컬러와의 관계를 중심으로 읽은 아홉 가지 흐름입니다.</div>
       <div class="cr-aspects cr-aspects--pdf">${aspectsHTML(R)}</div>
       <p class="cr-note">${esc(NOTE)}</p>`,
    ];
  }

  function logText(sel) {
    if (!sel) return "";
    return sel.slice(0, 4).map((k, i) => `${i + 1}.${c(k).ko}`).join(" ") + ` / 5.${c(sel[4]).ko}`;
  }

  window.CR = {
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
