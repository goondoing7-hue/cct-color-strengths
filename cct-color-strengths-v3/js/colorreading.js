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

  // ---------- 3페이지: 흐름으로 읽는 9개 항목 ----------
  const FAM_LABEL = { warm: "따뜻한", cool: "차가운", nature: "자연", base: "무채색·대지" };
  const FAM_COLOR = { warm: "따뜻한 색", cool: "차가운 색", nature: "자연의 색", base: "무채색·대지의 색" };
  // 같은 계열이 이어질 때 반복되는 마음 / 그 계열이 향하는 곳
  const FAM_THEME = {
    warm: { power: "따뜻함을 밖으로 꺼내 쓰는 힘", dir: "사람과 감정, 행동처럼 바깥을 향한", lean: "마음을 밖으로 꺼내 표현하고 나누려는 마음" },
    cool: { power: "생각을 안으로 모으고 정리하는 힘", dir: "생각과 내면, 정리처럼 안쪽을 향한", lean: "안으로 생각을 모으고 정리하려는 마음" },
    nature: { power: "균형과 회복을 찾는 마음", dir: "쉼과 균형, 편안함을 향한", lean: "균형을 찾고 편안하게 회복하려는 마음" },
    base: { power: "정리하고 새로 시작하려는 마음", dir: "정리와 새로운 시작을 향한", lean: "한 단락을 정리하고 새로 시작하려는 마음" },
  };

  // 조사만 돌려준다 (‘따옴표’ 뒤에 붙일 때)
  function pp(word, withB, withoutB) { return hasBatchim(word) ? withB : withoutB; }
  function ppEuro(word) { return hasBatchim(word) && !jongIsRieul(word) ? "으로" : "로"; }

  function buildAspects(sel, flow) {
    const [k1, k2, k3, k4, k5] = sel;
    const C1 = c(k1), C2 = c(k2), C3 = c(k3), C4 = c(k4), C5 = c(k5);
    const N = pair(k2, k3), F = pair(k3, k4), E = pair(k1, k4);
    const kw = (C, i) => C.keywords[i] || C.keywords[0];
    const eun = (w) => j(w, "은", "는");
    const four = [C1, C2, C3, C4];

    // 1. 과거 → 현재 : 2번이 겹치는 자리
    const a1 =
      `과거(${C1.ko}·${C2.ko})와 현재(${C2.ko}·${C3.ko})에는 ${j(C2.ko, "이", "가")} 함께 들어 있습니다. ` +
      `현재 선택한 컬러의 흐름에서는 ${C2.ko}의 ‘${C2.ns}’${pp("마음", "이", "가")} 과거부터 지금까지 이어지고 있는 것으로 볼 수 있습니다. ` +
      `과거에는 그 곁에 ${C1.ko}의 ‘${kw(C1, 0)}·${kw(C1, 1)}’${pp(kw(C1, 1), "이", "가")} 있었다면, 지금은 ${C3.ko}의 ‘${kw(C3, 0)}·${kw(C3, 1)}’${pp(kw(C3, 1), "이", "가")} 새롭게 더해졌습니다. ` +
      `${C1.ns}에서 ${C3.ns} 쪽으로 마음의 무게가 옮겨 가고 있을 가능성을 살펴볼 수 있습니다.`;

    // 2. 지금 가장 크게 드러나는 마음 : 2·3번의 공통점
    let famLine, lean;
    if (C2.family === C3.family) {
      famLine = `현재를 나타내는 ${C2.ko}${pp(C3.ko, "과", "와")}`;
      famLine = `현재를 나타내는 ${j(C2.ko, "과", "와")} ${eun(C3.ko)} 모두 ${FAM_LABEL[C2.family]} 계열로, ${FAM_THEME[C2.family].dir} 마음과 닿아 있습니다.`;
      lean = FAM_THEME[C2.family].lean;
    } else {
      famLine = `현재를 나타내는 ${eun(C2.ko)} ${FAM_LABEL[C2.family]} 계열, ${eun(C3.ko)} ${FAM_LABEL[C3.family]} 계열로, 결이 다른 두 색이 한자리에 있습니다.`;
      lean = `${C2.ko}의 ‘${kw(C2, 0)}’${pp(kw(C2, 0), "과", "와")} ${C3.ko}의 ‘${kw(C3, 0)}’${pp(kw(C3, 0), "을", "를")} 함께 아우르려는 마음`;
    }
    const a2 =
      `${famLine} 이 조합이 전하는 메시지는 ‘${N[0]}’입니다. ` +
      `지금은 ${j(lean, "이", "가")} 크게 드러나 있을 가능성을 살펴볼 수 있습니다.`;

    // 3. 현재를 이루는 두 가지 마음 : 2번 vs 3번
    const de = C3.energy - C2.energy;
    let contrast;
    if (de >= 1) contrast = `${j(C2.ko, "이", "가")} 조금 더 안쪽에 머무는 마음이라면, ${eun(C3.ko)} 바깥으로 펼쳐지는 마음에 가깝습니다.`;
    else if (de <= -1) contrast = `${j(C2.ko, "이", "가")} 바깥으로 펼쳐지는 마음이라면, ${eun(C3.ko)} 조금 더 안쪽으로 모이는 마음에 가깝습니다.`;
    else contrast = `두 색은 에너지의 결이 비슷하지만, 바라보는 곳이 조금 다른 두 마음입니다.`;
    const a3 =
      `2번 ${eun(C2.ko)} ‘${C2.need}’${pp("마음", "을", "를")}, 3번 ${eun(C3.ko)} ‘${C3.need}’${pp("마음", "을", "를")} 보여줍니다. ` +
      `${contrast} ` +
      `지금은 ${j(C2.ns, "과", "와")} ${j(C3.ns, "이", "가")} 함께 나타납니다. 두 마음이 서로를 받쳐 주고 있는지, 아니면 한쪽이 더 앞서 있는지 살펴볼 수 있습니다.`;

    // 4. 현재 → 미래 : 3번이 겹치는 자리
    const kw4 = `${kw(C4, 0)}·${kw(C4, 1)}·${kw(C4, 2)}`;
    const a4 =
      `현재(${C2.ko}·${C3.ko})와 미래(${C3.ko}·${C4.ko})에는 ${j(C3.ko, "이", "가")} 함께 들어 있습니다. ` +
      `${C3.ko}의 ‘${C3.ns}’${pp("마음", "은", "는")} 앞으로도 이어지고, ${C2.ko}의 ‘${kw(C2, 0)}’${pp(kw(C2, 0), "이", "가")} 있던 자리에는 ${C4.ko}의 ‘${kw4}’${pp(kw(C4, 2), "이", "가")} 들어옵니다. ` +
      `현재 선택한 컬러의 흐름에서는 ‘${kw(C2, 0)}’의 마음 곁으로 ‘${kw(C4, 0)}’의 마음이 점점 앞으로 나올 가능성을 살펴볼 수 있습니다.`;

    // 5. 앞으로 더 중요해지는 마음 : 3·4번
    const a5 =
      `미래를 나타내는 ${j(C3.ko, "과", "와")} ${j(C4.ko, "이", "가")} 전하는 메시지는 ‘${F[0]}’입니다. ` +
      `앞으로는 ${C3.ko}의 ‘${kw(C3, 0)}’${pp(kw(C3, 0), "이", "가")} ${C4.ko}의 ‘${kw(C4, 0)}’${ppEuro(kw(C4, 0))} 이어지는 방향이 중요해질 수 있습니다. ` +
      `특히 마지막 자리의 ${eun(C4.ko)} ‘${C4.need}’${pp("마음", "과", "와")} 닿아 있어, 이 마음을 앞으로 더 중요하게 여기게 될 가능성을 살펴볼 수 있습니다.`;

    // 6. 처음(1번)과 마지막(4번)
    let change;
    if (CR_COMPLEMENT[k1] === k4) change = "두 색은 서로 마주 보는 보색이어서, 처음과는 반대쪽의 마음을 향해 가는 큰 전환으로 볼 수 있습니다.";
    else if (C1.family === C4.family) change = `두 색은 같은 ${FAM_LABEL[C1.family]} 계열에 있어, 처음 중요했던 마음이 결을 유지한 채 모습을 바꿔 가는 흐름으로 볼 수 있습니다.`;
    else if (C4.energy - C1.energy >= 2) change = "차분하고 깊은 색에서 밝은 색으로, 안에 모아 둔 마음이 바깥으로 열려 가는 변화로 볼 수 있습니다.";
    else if (C1.energy - C4.energy >= 2) change = "밝은 색에서 차분하고 깊은 색으로, 바깥으로 쏟던 마음을 안으로 모아 가는 변화로 볼 수 있습니다.";
    else change = "결이 다른 두 색이 처음과 끝에 놓여, 처음 중요했던 마음 위에 새로운 마음을 더해 가는 변화로 볼 수 있습니다.";
    const a6 =
      `처음 고른 ${eun(C1.ko)} ‘${C1.need}’${pp("마음", "과", "와")}, 마지막 ${eun(C4.ko)} ‘${C4.ns}’${pp("마음", "과", "와")} 닿아 있습니다. ` +
      `${change} 두 색을 이어 보면 ‘${E[0]}’의 메시지가 읽힙니다.`;

    // 7. 1~4번 전체에서 반복되는 메시지
    const famCount = {};
    four.forEach((C) => { famCount[C.family] = (famCount[C.family] || 0) + 1; });
    const top = Object.keys(famCount).sort((x, y) => famCount[y] - famCount[x])[0];
    const nameList = four.map((C) => C.ko).join("·");
    const chain = four.map((C) => kw(C, 0)).join(" → ");
    const energyLine = { rising: "뒤로 갈수록 에너지가 밝아지는 흐름입니다", settling: "뒤로 갈수록 에너지가 차분해지는 흐름입니다", steady: "에너지의 높낮이도 크게 달라지지 않습니다" }[flow.shape];
    let a7;
    if (famCount[top] >= 3) {
      const famPhrase = famCount[top] === 4 ? `네 컬러가 모두 ${FAM_LABEL[top]} 계열이고` : `네 컬러 가운데 세 개가 ${FAM_LABEL[top]} 계열이고`;
      a7 =
        `${nameList}, ${famPhrase} ${energyLine}. ` +
        `네 자리에서 ‘${FAM_THEME[top].power}’${pp("힘", "이", "가")} 반복되고, 키워드로는 ${chain}${pp(kw(C4, 0), "이", "가")} 이어집니다. ` +
        `지금은 ${FAM_THEME[top].dir} 에너지가 과거에서 미래까지 이어지고 있을 가능성을 살펴볼 수 있습니다.`;
    } else {
      const fams = Object.keys(famCount).map((f) => FAM_COLOR[f]).join(", ");
      a7 =
        `${nameList}에는 ${fams}${pp("색", "이", "가")} 고루 섞여 있고, ${energyLine}. ` +
        `키워드로는 ${chain}${pp(kw(C4, 0), "이", "가")} 이어집니다. ` +
        `지금은 서로 다른 결의 마음을 오가며 그 사이의 균형을 찾아가고 있을 가능성을 살펴볼 수 있습니다.`;
    }

    // 8. 5번째 — 아직 충분히 꺼내지 못한 마음 (문제·부족이 아닌 자원)
    const fams4 = four.map((C) => C.family);
    const parts8 = [];
    if (!fams4.includes(C5.family)) parts8.push(`5번째 ${eun(C5.ko)} 다섯 컬러 가운데 유일한 ${FAM_LABEL[C5.family]} 계열의 색입니다.`);
    else parts8.push(`5번째 ${eun(C5.ko)} 앞의 네 컬러와 같은 ${FAM_LABEL[C5.family]} 계열이지만, 가장 마지막에 놓인 색입니다.`);
    parts8.push(`${eun(C5.ko)} ‘${C5.need}’${pp("마음", "과", "와")} 닿아 있습니다.`);
    if (famCount[top] >= 3 && C5.family !== top) parts8.push(`${FAM_THEME[top].dir} 에너지를 쓰는 동안, ${j(C5.ns, "은", "는")} 뒤로 밀려 있을 수 있습니다.`);
    const compIdx = [k1, k2, k3, k4].findIndex((k) => CR_COMPLEMENT[k] === k5);
    if (compIdx !== -1) {
      const Cc = four[compIdx];
      parts8.push(`또 ${eun(C5.ko)} ${compIdx + 1}번 ${j(Cc.ko, "과", "와")} 마주 보는 보색입니다. ${Cc.ko}의 ‘${kw(Cc, 0)}’ 곁에서 ${C5.ko}의 ‘${kw(C5, 0)}’${pp(kw(C5, 0), "이", "가")} 함께 필요하다고 느끼고 있을 가능성을 살펴볼 수 있습니다.`);
    }
    parts8.push(compIdx !== -1
      ? `마음 한편에서 꺼내 쓰이기를 기다리고 있는 하나의 자원으로 볼 수 있습니다.`
      : `지금 마음속에서는 필요성을 느끼면서도 아직 충분히 꺼내 쓰지 못한, 하나의 자원으로 볼 수 있습니다.`);
    const a8 = parts8.join(" ");

    // 9. 지금 나에게 던져볼 질문 (1개)
    // 5번째 질문 앞에 지금의 흐름을 붙여 한 문장으로 ("지금, 지금…" 겹침은 피한다)
    let ask = C5.ask, when = "지금";
    if (/^지금 /.test(ask)) ask = ask.slice(3);
    else if (/^지금/.test(ask)) when = "요즘";
    const a9 = `‘${F[0]}’${ppEuro(F[0])} 나아가고 있는 ${when}, ${ask}`;

    return [
      { t: "과거에서 현재로 이어지는 흐름", d: a1, keys: [k1, k2, k3] },
      { t: "지금 가장 크게 드러나는 마음", d: a2, keys: [k2, k3] },
      { t: "현재를 이루는 두 가지 마음", d: a3, keys: [k2, k3] },
      { t: "현재에서 미래로 이어지는 변화", d: a4, keys: [k2, k3, k4] },
      { t: "앞으로 더 중요해지는 마음", d: a5, keys: [k3, k4] },
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

    // 3페이지 「다섯 컬러의 흐름으로 읽는 나의 마음」 — 9개 항목.
    // 성격·대인관계·스트레스 같은 성향 추정은 하지 않고, 컬러리딩 구조
    // (1·2 과거 / 2·3 현재 / 3·4 미래 / 5 아직 꺼내 쓰지 못한 마음) 안에서
    // 순서·겹치는 컬러·1→4 변화·5번째와의 관계만 읽습니다. 단정 대신 "~가능성을 살펴볼 수 있습니다".
    const aspects = buildAspects(sel, flow);
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

  // opts.standalone: 컬러리딩만 진행한 경우 — PART 표시와 CCT 구분선을 뺍니다.
  function buildScreenHTML(R, opts) {
    if (!R) return "";
    const solo = !!(opts && opts.standalone);
    return `
      <section class="cr-section ${solo ? "cr-section--solo" : ""}" id="crSection">
        ${solo ? "" : `<div class="cr-part-kicker">PART 1</div>
        <h2 class="cr-part-title">4병 컬러리딩</h2>`}
        <p class="cr-part-desc">직감으로 고른 다섯 컬러가 과거·현재·미래의 나에게 보내는 메시지입니다.</p>
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
       <div class="section-desc">직감으로 고른 다섯 컬러가 과거·현재·미래의 나에게 보내는 메시지입니다. 1·2번째는 과거, 2·3번째는 현재, 3·4번째는 미래, 5번째는 원하지만 미뤄지고 있는 마음을 보여줍니다.</div>
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
