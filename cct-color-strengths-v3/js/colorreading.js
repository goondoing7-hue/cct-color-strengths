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

  // ---------- 문체 (2026-10-03) ----------
  // 고객이 읽고 "아, 나 요즘 진짜 그런데" 싶게 — 쉬운 일상어, 해요체.
  // 조합은 두 컬러가 만나 생긴 하나의 마음을 먼저 말하고(속마음 한 줄) 이유는 1~2문장.
  // 각 설명 최대 2~3문장, 항목끼리 같은 내용을 반복하지 않는다.
  // CR_PAIRS[k] = [제목, 속마음, 이유, 요즘 이런 순간, 해 보고 싶은 작은 일]
  function eunC(w) { return j(w, "은", "는"); }
  const SLOT_LINE = {
    past: "그동안 이런 마음으로 지내 오셨을 수 있어요.",
    present: "요즘 이 마음이 가장 크게 느껴질 수 있어요.",
    future: "앞으로는 이런 모습으로 지내고 싶은 바람이에요.",
  };
  function cardText(pr, slot) {
    return `“${pr[1]}” ${SLOT_LINE[slot]} ${pr[2]}`;
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
      `‘${C2.want}’${pp("마음", "은", "는")} 예전부터 지금까지 쭉 이어지고 있어요. ` +
      `예전엔 그 옆에 “${C1.say}”${pp(C1.say, "이", "가")} 있었다면, 지금은 “${C3.say}”${pp(C3.say, "이", "가")} 그 자리를 채웠어요.`;
    const a2 = N[3];
    const a3 =
      `“${C2.say}”${pp(C2.say, "과", "와")} ‘${C3.want}’${pp("마음", "이", "가")} 요즘 나란히 있어요. ` +
      `앞의 것은 예전부터 지켜 온 마음이고, 뒤의 것은 앞으로도 이어 가고 싶은 마음이에요. 지금 어느 쪽이 더 크게 느껴지시나요?`;
    const a4 =
      `‘${C3.want}’${pp("마음", "은", "는")} 그대로 두고, “${C2.say}” 자리에 “${C4.say}”${pp(C4.say, "이", "가")} 들어오고 있어요. ` +
      `이 변화를 한마디로 하면 ‘${M[0]}’이에요.`;
    const a5 = F[4];
    const a6 =
      `처음엔 “${C1.say}”였다면, 마지막엔 “${C4.say}”예요. ` +
      `${E[2]}`;
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

    const past = { label: "과거의 나", sub: "과거의 나에게 보내는 메시지", keys: [k1, k2], theme: P[0], text: cardText(P, "past") };
    const present = { label: "현재의 나", sub: "현재의 나에게 보내는 메시지", keys: [k2, k3], theme: N[0], text: cardText(N, "present") };
    const future = { label: "앞으로 바라는 나", sub: "앞으로 바라는 나에게 보내는 메시지", keys: [k3, k4], theme: F[0], text: cardText(F, "future") };
    const postponed = {
      label: "원하지만 아직 충분히 꺼내 쓰지 못한 마음", sub: "5번째 컬러", keys: [k5],
      theme: C5.t5,
      text: `“${C5.v5}” 마음에 들지 않아서 고른 색이지만 나쁜 뜻은 아니에요. 필요하다고 느끼면서도 아직 손이 덜 간 마음이에요.`,
    };

    const aspects = buildAspects(sel);

    const summary =
      `${who}의 다섯 컬러를 한 줄로 말하면 ‘${E[0]}’이에요. ` +
      `요즘 가장 큰 마음은 ‘${N[0]}’이고, 앞으로는 ‘${F[0]}’을 바라고 계세요. ` +
      `그 사이에 ${C5.want5}도 조금 챙겨 주면 좋겠다는 신호가 함께 있어요.`;

    const healing = { key: k5, text: C5.tip };

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
        <p class="cr-msg-text">${esc(m.text)}</p>
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

  // opts.standalone: 컬러리딩만 진행한 경우 — PART 표시와 CCT 구분선을 뺍니다.
  function buildScreenHTML(R, opts) {
    if (!R) return "";
    const solo = !!(opts && opts.standalone);
    return `
      <section class="cr-section ${solo ? "cr-section--solo" : ""}" id="crSection">
        ${solo ? "" : `<div class="cr-part-kicker">PART 1</div>
        <h2 class="cr-part-title">4병 컬러리딩</h2>`}
        <p class="cr-part-desc">직감으로 고른 다섯 컬러가 과거·현재·앞으로 바라는 나에게 보내는 메시지예요.</p>
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
