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
          ${isStep1 ? "다음" : "CCT 검사 시작하기"}
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

  function openPick(onDone) {
    onDoneCb = onDone;
    reset();
    renderPick();
  }

  // ---------- 해석 엔진 ----------
  // 전체 흐름: 1·2번째(과거 쪽)와 3·4번째(미래 쪽)의 에너지 차이, 색 계열의 쏠림,
  // 깊은 색(블랙·브라운·인디고)이 놓인 위치, 5번째와 1번째의 보색 관계를 함께 봅니다.
  function analyzeFlow(sel) {
    const [k1, k2, k3, k4, k5] = sel;
    const e = [k1, k2, k3, k4].map((k) => c(k).energy);
    const delta = e[2] + e[3] - (e[0] + e[1]);
    const fam = { warm: 0, cool: 0, nature: 0, base: 0 };
    [k1, k2, k3, k4].forEach((k) => { fam[c(k).family]++; });

    let shape, shapeText;
    if (delta >= 3) {
      shape = "rising";
      shapeText = "앞쪽의 차분하고 깊은 색에서 뒤쪽의 밝고 활기찬 색으로 옮겨가는, 안에서 밖으로 열려 가는 흐름입니다. 안으로 모아 두었던 힘이 점점 바깥으로 표현되려는 시기로 볼 수 있습니다.";
    } else if (delta <= -3) {
      shape = "settling";
      shapeText = "앞쪽의 밝고 활기찬 색에서 뒤쪽의 차분하고 깊은 색으로 옮겨가는, 밖에서 안으로 모여드는 흐름입니다. 바깥으로 쏟던 에너지를 거두어 정리하고 다지려는 시기로 볼 수 있습니다.";
    } else {
      shape = "steady";
      shapeText = "앞뒤 색의 온도가 크게 달라지지 않는, 비슷한 결의 에너지가 이어지는 흐름입니다. 지금 가고 있는 방향을 일관되게 다져 가려는 마음으로 볼 수 있습니다.";
    }

    let famText = "";
    if (fam.warm >= 3) famText = "고른 색 가운데 따뜻한 색이 많아, 사람·감정·행동처럼 바깥을 향한 에너지가 크게 움직이고 있습니다.";
    else if (fam.cool >= 3) famText = "고른 색 가운데 차가운 색이 많아, 생각·내면·정리처럼 안쪽을 향한 에너지가 크게 움직이고 있습니다.";
    else if (fam.nature >= 2) famText = "자연의 색이 두 개 이상 함께 있어, 무엇보다 균형과 회복, 편안한 관계를 원하는 마음이 큽니다.";
    else if (fam.base >= 2) famText = "무채색과 대지의 색이 두 개 이상 함께 있어, 삶의 한 단락을 정리하고 새로운 시작을 준비하는 전환의 시기로 읽힙니다.";
    else famText = "따뜻한 색과 차가운 색이 고루 섞여 있어, 행동과 생각, 관계와 나 사이를 오가며 균형을 찾아가는 모습입니다.";

    const deep = ["Bk", "Br", "In"];
    let depthText = "";
    const deepFront = [k1, k2].some((k) => deep.includes(k));
    const deepBack = [k3, k4].some((k) => deep.includes(k));
    if (deepFront && !deepBack) depthText = "깊고 어두운 색이 과거 쪽에 놓여 있어, 힘든 시간을 지나 빛으로 나아가고 있는 모습도 함께 보입니다.";
    else if (deepBack && !deepFront) depthText = "깊은 색이 미래 쪽에 놓여 있어, 서두르기보다 먼저 정리와 회복의 시간을 거치려는 마음으로 볼 수 있습니다.";

    let compText = "";
    if (CR_COMPLEMENT[k1] && CR_COMPLEMENT[k1] === k5) {
      compText = `5번째 ${c(k5).ko}${hasBatchim(c(k5).ko) ? "은" : "는"} 가장 먼저 끌린 ${j(c(k1).ko, "과", "와")} 마주 보는 보완색입니다. 평소 자주 쓰는 방식과 정반대의 힘을 미뤄두고 있어서, 그 힘을 조금씩 들여올수록 마음의 균형이 잡힐 수 있습니다.`;
    }

    const shapeLabel = { rising: "안에서 밖으로 열리는 흐름", settling: "밖에서 안으로 모이는 흐름", steady: "한결같이 이어지는 흐름" }[shape];
    return { shape, shapeLabel, shapeText, famText, depthText, compText };
  }

  function buildReading(sel, name) {
    if (!sel || sel.length !== 5) return null;
    const [k1, k2, k3, k4, k5] = sel;
    const C1 = c(k1), C2 = c(k2), C3 = c(k3), C4 = c(k4), C5 = c(k5);
    const who = name ? `${name}님` : "당신";
    const P = pair(k1, k2), N = pair(k2, k3), F = pair(k3, k4);
    const flow = analyzeFlow(sel);

    const past = {
      label: "과거의 나", sub: "과거의 나에게 보내는 메시지", keys: [k1, k2], theme: P[0],
      text:
        `${C1.ko}에서 ${euro(C2.ko)} 이어지는 지나온 시간에는 ${q(P[0], "이라는", "라는")} 메시지가 담겨 있습니다. ${P[1]} ` +
        `이 시간 동안 다져 온 ${j(C1.gs, "이", "가")} 지금의 나를 받쳐 주는 바탕이 되었을 수 있습니다.`,
    };
    const present = {
      label: "현재의 나", sub: "현재의 나에게 보내는 메시지", keys: [k2, k3], theme: N[0],
      text:
        `지금의 나에게 건네는 메시지는 ‘${N[0]}’입니다. ${N[1]} ` +
        `요즘은 ${j(C2.ns, "과", "와")} ${j(C3.ns, "이", "가")} 함께 움직이고 있는 시기로 볼 수 있습니다.`,
    };
    const future = {
      label: "미래의 나", sub: "미래의 나에게 보내는 메시지", keys: [k3, k4], theme: F[0],
      text:
        `앞으로의 나에게 건네는 메시지는 ‘${F[0]}’입니다. ${F[1]} ` +
        `마지막 자리에 ${j(C4.ko, "이", "가")} 놓인 만큼, ${C4.future}`,
    };
    const postponed = {
      label: "원하지만 미뤄지고 있는 부분", sub: "5번째 컬러", keys: [k5],
      theme: `${C5.ko} · ${C5.tag}`,
      text:
        `${C5.postponed} ` +
        `가장 마음에 들지 않는 색이라고 해서 부정적인 의미는 아닙니다. 지금은 손이 잘 가지 않지만, 마음 깊은 곳에서는 ${C5.ko}의 ${q(C5.keywords[0], "이", "가")} 필요하다는 신호로 볼 수 있습니다.`,
    };

    const aspects = [
      {
        t: "과거에서 현재로 이어지는 흐름",
        d: `${C1.ko}의 ‘${C1.keywords[0]}’에서 시작해 지금은 ${C3.ko}의 ${q(C3.keywords[0], "이", "가")} 더해지는 흐름입니다. ${flow.shapeText}`,
      },
      {
        t: "지금 가장 중요한 욕구와 관심",
        d: `현재 자리의 두 색을 보면, ${C2.need}, 그리고 ${j(C3.need, "이", "가")} 가장 크게 자리하고 있을 수 있습니다. 요즘 마음이 자주 머무는 곳이 이 두 가지와 닿아 있는지 살펴보세요.`,
      },
      {
        t: "타고난 성향과 자주 쓰는 방식",
        d: `가장 먼저 손이 간 ${C1.ko}${hasBatchim(C1.ko) ? "은" : "는"} 평소 자연스럽게 쓰는 마음의 방식을 보여줍니다. ${C1.essence} 그래서 ${j(C1.gift, "을", "를")} 익숙하게 꺼내 쓰는 편일 수 있습니다.`,
      },
      {
        t: "사람들과 관계를 맺을 때",
        d: `평소 관계에서는 ${C1.relation} 요즘은 ${C3.ko}의 결이 더해져, ${C3.relation}`,
      },
      {
        t: "지금 가지고 있는 강점",
        d: `${C2.ko}의 ${C2.gs}, 그리고 ${C3.ko}의 ${j(C3.gs, "이", "가")} 지금 가장 잘 쓰이고 있는 힘입니다. 여기에 ${C4.ko}의 ${q(C4.keywords[0], "이", "가")} 앞으로 더해질 자원으로 기다리고 있습니다.`,
        chips: [k1, k2, k3, k4].map((k) => ({ key: k, word: c(k).keywords[0] })),
      },
      {
        t: "스트레스를 받거나 균형이 깨졌을 때",
        d: `${C1.stress} 이럴 때는 5번째 ${C5.ko}의 ${q(C5.keywords[0], "을", "를")} 떠올려 보세요. 미뤄두었던 그 힘이 균형을 되찾는 열쇠가 될 수 있습니다.`,
      },
      {
        t: "충분히 표현하지 못하고 있는 부분",
        d: `${j(C5.ko, "을", "를")} 가장 마지막에 골랐다는 것은 ${j(C5.need, "을", "를")} 지금은 충분히 꺼내 쓰지 못하고 있다는 뜻일 수 있습니다. ${C5.ko}의 키워드인 ‘${C5.keywords.slice(0, 3).join("·")}’ 가운데 요즘 일부러 피하고 있는 것이 있는지 돌아보세요.`,
      },
      {
        t: "앞으로 향하고 싶은 방향",
        d: `${C3.ko}에서 ${euro(C4.ko)} 이어지는 흐름은 ‘${C4.keywords[0]}·${C4.keywords[1]}’의 방향을 가리킵니다. ${C4.future}`,
      },
      {
        t: "5번째 컬러가 보여주는 마음의 과제",
        d: `${C5.ko}${hasBatchim(C5.ko) ? "은" : "는"} 언젠가 꼭 하고 싶지만 아직 미뤄두고 있는 일과 닿아 있습니다. 스스로에게 이렇게 물어보세요. “${C5.ask}”`,
      },
    ];

    const extra = [flow.famText, flow.depthText, flow.compText].filter(Boolean).join(" ");
    const summary =
      `${who}의 다섯 컬러는 ${C1.ko}에서 시작해 ${C2.ko}, ${j(C3.ko, "을", "를")} 지나 ${euro(C4.ko)} 이어지고, 마지막에 ${j(C5.ko, "이", "가")} 놓였습니다. ` +
      `지나온 시간에는 ‘${P[0]}’의 흐름 속에서 ${j(C1.gs, "을", "를")} 바탕 삼아 살아왔을 수 있습니다. ` +
      `지금은 ‘${N[0]}’의 시기로, ${j(C2.ns, "과", "와")} ${j(C3.ns, "이", "가")} 함께 자리하고 있습니다. ` +
      `앞으로는 ‘${F[0]}’의 방향으로, ${C4.ko}의 ${j(C4.keywords[0], "과", "와")} ${j(C4.keywords[1], "을", "를")} 향해 나아가려는 마음이 보입니다. ` +
      `한편 마지막에 놓인 ${C5.ko}${hasBatchim(C5.ko) ? "은" : "는"} ${j(C5.ns, "을", "를")} 아직 미뤄두고 있음을 알려줍니다. ` +
      (extra ? extra + " " : "") +
      `${C5.ko}의 ${j(C5.prescription, "을", "를")} 일상에 조금씩 들여 보면, 지금의 흐름이 한결 균형 있게 이어질 수 있습니다.`;

    const healing = {
      key: k5,
      text: `${C5.ko}${hasBatchim(C5.ko) ? "은" : "는"} 지금의 나에게 ${j(C5.prescription, "을", "를")} 채워주는 색입니다. 옷이나 소품, 음식, 공간 속에서 이 색을 가볍게 가까이해 보세요. 싫어하는 색도 조금씩 생활에 들여올 때 마음의 균형이 넓어집니다.`,
    };

    return { sel, who, past, present, future, postponed, aspects, flow, summary, healing };
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
        <span><i class="cr-arc"></i>1·2 과거</span><span><i class="cr-arc"></i>2·3 현재</span><span><i class="cr-arc"></i>3·4 미래</span><span><i class="cr-arc cr-arc--5"></i>5 미뤄진 마음</span>
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

  function aspectsHTML(R) {
    return R.aspects.map((a, i) => `
      <div class="cr-aspect">
        <div class="cr-aspect-t"><span class="cr-aspect-n">${i + 1}</span>${esc(a.t)}</div>
        <p class="cr-aspect-d">${esc(a.d)}</p>
        ${a.chips ? `<div class="cr-aspect-chips">${a.chips.map((x) => `<span class="cr-chip"><i style="background:${c(x.key).hex}${x.key === "W" ? ";border:1px solid #b9b9b4;box-sizing:border-box" : ""}"></i>${esc(x.word)}</span>`).join("")}</div>` : ""}
      </div>`).join("");
  }

  function summaryHTML(R) {
    const h = c(R.healing.key);
    return `
      <div class="cr-summary">
        <div class="cr-summary-kicker">종합 컬러리딩 · ${esc(R.flow.shapeLabel)}</div>
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

  function buildScreenHTML(R) {
    if (!R) return "";
    return `
      <section class="cr-section" id="crSection">
        <div class="cr-part-kicker">PART 1</div>
        <h2 class="cr-part-title">4병 컬러리딩</h2>
        <p class="cr-part-desc">직감으로 고른 다섯 컬러가 과거·현재·미래의 나에게 보내는 메시지입니다.</p>
        ${bottleRowHTML(R.sel)}
        ${msgHTML(R.past, 1)}
        ${msgHTML(R.present, 2)}
        ${msgHTML(R.future, 3)}
        ${msgHTML(R.postponed, 5)}
        <h3 class="cr-sub-title">컬러로 읽는 나의 마음</h3>
        <div class="cr-aspects">${aspectsHTML(R)}</div>
        ${summaryHTML(R)}
        <p class="cr-note">${esc(NOTE)}</p>
      </section>
      <div class="cr-part-divider">
        <div class="cr-part-kicker">PART 2</div>
        <div class="cr-part-title cr-part-title--sm">CCT 컬러성격강점 결과</div>
        <p class="cr-part-desc">65문항 자기보고로 살펴본, 내가 일상에서 자주 쓰는 성격강점입니다.</p>
      </div>`;
  }

  // PDF용 블록 — 각 블록이 한 페이지(가용 높이 261mm) 안에 들어가도록 나눕니다.
  function buildPdfBlocks(R) {
    if (!R) return [];
    return [
      `<div class="section-title">PART 1 · 4병 컬러리딩</div>
       <div class="section-desc">직감으로 고른 다섯 컬러가 과거·현재·미래의 나에게 보내는 메시지입니다. 1·2번째는 과거, 2·3번째는 현재, 3·4번째는 미래, 5번째는 원하지만 미뤄지고 있는 마음을 보여줍니다.</div>
       <div class="cr-pdf-row">${bottleRowHTML(R.sel, 54)}</div>
       ${msgHTML(R.past, 1)}
       ${msgHTML(R.present, 2)}`,
      `${msgHTML(R.future, 3)}
       ${msgHTML(R.postponed, 5)}
       ${summaryHTML(R)}`,
      `<div class="section-title">컬러로 읽는 나의 마음</div>
       <div class="section-desc">다섯 컬러의 위치와 조합, 전체 흐름을 함께 보고 정리한 아홉 가지 관점입니다.</div>
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
