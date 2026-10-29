/* ==========================================================
   CCT 컬러성격강점검사 — App Logic (v3 · 강의용: 컬러 심리리딩 + CCT)
   ========================================================== */

(function () {
  "use strict";

  // ---------- State ----------
  let shuffledQuestions = [];
  let currentIndex = 0;
  let answers = []; // { color, value } aligned with shuffledQuestions
  let userName = "";
  let verified = false;
  // 동점 처리용 강제선택 응답 (점수는 그대로, 순위·보완컬러만 정함 — js/cct-rank.js)
  //   rank: 순위 동점에서 고른 컬러 key (고른 순서대로)
  //   comp: 보완컬러 최종 동점에서 고른 컬러 key
  const emptyPicks = () => ({ rank: [], comp: null });
  let cctPicks = emptyPicks();
  let decodedCctPicks = null;

  // Simple access-code gate (replaces the earlier Instagram-follow upload check).
  // This is a soft, client-side-only gate — anyone reading the source can see the
  // code — but that's fine for this static-site use case.
  const CCT_ACCESS_CODE = "love"; // v3(강의용) 접근 코드 — 2026-10-13 변경

  // Optional: log each completed test to a Google Sheet via a Google Apps
  // Script Web App. Leave this empty to disable logging entirely (nothing is
  // sent anywhere). Paste your deployed Apps Script "Web app URL" here once
  // you've set it up — see the setup guide provided alongside this app.
  const GS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbw7cwjYx_pNXHYEJAcHArACExeQ2OqxotMC5YHPrK3QaBFgzNNOGj4e6M9dUJrPB5F6zg/exec";

  // ---------- App variant ----------
  // "v1": the end user can download their own detailed PDF report immediately.
  // "v2": the PDF is NOT offered for self-download — the result screen instead
  // tells the user to visit a center in person to receive it, with Naver Map
  // links to each branch. In both variants the detailed PDF is still generated
  // automatically in the background and logged (see GS_WEBHOOK_URL above) so
  // the admin can always look it up later regardless of variant.
  const APP_VARIANT = "v1"; // "v1" | "v2"

  // ---------- 강의용(v3) ----------
  // v1과 동일한 CCT(전체 결과 + PDF 즉시 다운로드)에 앞서 「카마 커뮤니케이션
  // 컬러테라피」 4병 컬러리딩을 진행하고, 두 결과를 한 화면·한 PDF로 보여줍니다.
  // 컬러리딩 데이터·엔진·화면은 js/colorreading*.js (window.CR) 에 있습니다.
  const LECTURE_EDITION = !!(window.CR && window.CR.enabled);
  // 강의용은 입장 후 검사 방식을 고릅니다.
  //   "cr"   : 컬러 심리리딩만
  //   "cct"  : CCT 컬러성격강점검사만 (v1과 동일)
  //   "both" : 컬러리딩 → CCT, 결과를 한 화면·한 PDF로
  let mode = "both";
  const MODE_LABEL = { cr: "v3test·컬러리딩", cct: "v3test·CCT", both: "v3test·통합" };
  function editionLabel() { return LECTURE_EDITION ? MODE_LABEL[mode] : APP_VARIANT; }
  // 이번 결과에 컬러리딩이 포함되는지 (선택이 끝난 경우에만)
  function hasReading() { return LECTURE_EDITION && mode !== "cct" && !!window.CR.getSelection(); }

  const CENTER_LOCATIONS = [
    { name: "럽리브 남양주점", url: "https://naver.me/GubsO7BA" },
    { name: "럽리브 춘천점", url: "https://naver.me/5pwdXIT5" },
  ];

  // ---------- DOM refs ----------
  const screenIntro = document.getElementById("screen-intro");
  const screenQuiz = document.getElementById("screen-quiz");
  const screenResult = document.getElementById("screen-result");
  const screenColorPick = document.getElementById("screen-colorpick");
  const screenMode = document.getElementById("screen-mode");

  const btnStart = document.getElementById("btnStart");
  const btnBack = document.getElementById("btnBack");
  const userNameInput = document.getElementById("userName");

  const progressFill = document.getElementById("progressFill");
  const qNumEl = document.getElementById("qNum");
  const qTotalEl = document.getElementById("qTotal");
  const quizCard = document.getElementById("quizCard");
  const quizQuestion = document.getElementById("quizQuestion");
  const quizScale = document.getElementById("quizScale");

  const resultWrap = document.getElementById("resultWrap");

  const accessCodeInput = document.getElementById("accessCode");
  const accessStatus = document.getElementById("accessStatus");

  // ---------- Init: color-wheel ring on intro ----------
  function buildColorRing() {
    const ring = document.getElementById("colorRing");
    if (!ring) return;
    const size = 132, r = 58, sw = 11;
    const cx = size / 2, cy = size / 2;
    const C = 2 * Math.PI * r;
    const n = CCT_COLORS.length;
    const gapFrac = 0.16; // fraction of each segment that is empty gap
    const segLen = (C / n) * (1 - gapFrac);
    const circles = CCT_COLORS.map((c, i) => {
      const offset = -(C / n) * i;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c.hex}" stroke-width="${sw}"
        stroke-linecap="round" stroke-dasharray="${segLen} ${C - segLen}" stroke-dashoffset="${offset}"
        transform="rotate(-90 ${cx} ${cy})"/>`;
    }).join("");
    ring.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="13 컬러 휠">${circles}</svg>`;
  }

  // ---------- Utils ----------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function showScreen(el) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("is-active"));
    el.classList.add("is-active");
    window.scrollTo(0, 0);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Picks the correct Korean particle for a word, so generated sentences read
  // naturally instead of falling back to the clumsy "은(는)" / "이(가)" form.
  // A Hangul syllable has a final consonant (받침) when its code point offset
  // from 가(U+AC00) is not an exact multiple of 28.
  function josa(word, withBatchim, withoutBatchim) {
    const s = String(word);
    const code = s.charCodeAt(s.length - 1);
    if (code < 0xac00 || code > 0xd7a3) return withoutBatchim; // non-Hangul tail
    return (code - 0xac00) % 28 !== 0 ? withBatchim : withoutBatchim;
  }

  // "으로" vs "로" needs its own helper: unlike 은/는, the ㄹ final consonant
  // (jongseong index 8) takes "로" just like a vowel ending does — 힘으로, but
  // 열정로가 아니라 열정으로 / 물로. josa()'s binary batchim test can't express that.
  function euro(word) {
    const s = String(word);
    const code = s.charCodeAt(s.length - 1);
    if (code < 0xac00 || code > 0xd7a3) return "로";
    const jong = (code - 0xac00) % 28;
    return jong === 0 || jong === 8 ? "로" : "으로";
  }

  function getContrastText(hex) {
    // returns readable ink color (white or dark) for a given background hex
    const num = parseInt(hex.replace("#", ""), 16);
    const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.62 ? "#17161d" : "#ffffff";
  }

  // ---------- Shared color-section template (used on-screen + in PDF) ----------
  // Shared sub-pieces of a color's profile card. Split out so the PDF renderer
  // (below) can place the "intro" half and the "detail" half as two separate,
  // independently-fittable blocks — without this, a single ~190mm-tall card
  // regularly left 60-70mm of blank space at the bottom of a page whenever it
  // didn't quite fit what was left of the current page.
  function colorSectionHeroHTML(color, tagLabel) {
    const textColor = getContrastText(color.hex);
    const overlay = textColor === "#ffffff" ? "rgba(255,255,255,.22)" : "rgba(23,22,29,.10)";
    return `
      <div class="cs-hero" style="background:${color.hex};color:${textColor}">
        <span class="cs-tag" style="background:${overlay};color:${textColor}">${escapeHtml(tagLabel)}</span>
        <h3>${escapeHtml(color.ko)} · ${escapeHtml(color.strength)}</h3>
        <div class="cs-en">${escapeHtml(color.en)}</div>
        <p class="cs-tagline">${escapeHtml(color.core)}</p>
      </div>
    `;
  }

  // opts.comp: 보완 컬러 — 2026-10-08 선생님 요청으로 「건강할 때 / 과도할 때」 없이 컬러 설명만
  function colorSectionIntroBodyHTML(color, opts) {
    const comp = !!(opts && opts.comp);
    return `
      <p class="cs-summary">${escapeHtml(color.summary)}</p>
      ${comp ? "" : `<div class="cs-subhead">이 강점이 드러나는 모습</div>`}
    `;
  }

  function colorSectionDetailBodyHTML(color, opts) {
    const comp = !!(opts && opts.comp);
    const healthyItems = (color.healthy || []).map((h) => `<li>${escapeHtml(h)}</li>`).join("");
    const overuseItems = (color.overuse || []).map((h) => `<li>${escapeHtml(h)}</li>`).join("");
    const actionItems = (color.actions || []).map((h) => `<li>${escapeHtml(h)}</li>`).join("");
    return `
      ${comp ? "" : `<div class="cs-dual">
        <div class="dual-row">
          <div class="dual-label">건강할 때</div>
          <div class="dual-content"><ul>${healthyItems}</ul></div>
        </div>
        <div class="dual-row">
          <div class="dual-label">과도할 때</div>
          <div class="dual-content"><ul>${overuseItems}</ul></div>
        </div>
      </div>`}
      <div class="cs-example">
        <div class="cs-example-label">예시 · 이렇게 활용해보세요</div>
        <ul>${actionItems}</ul>
      </div>
      ${comp ? "" : `<div class="cs-growth"><span>💬</span><span>${escapeHtml(color.growthQuestion)}</span></div>`}
    `;
  }

  // On-screen version: hero + summary are always visible, and the long detail
  // half (건강할 때 / 과도할 때 / 예시 / 질문 — roughly 13 bullets per color)
  // sits behind a disclosure toggle. Expanded-by-default made the result page
  // ~2,800px of near-identical prose; collapsing the details cuts the initial
  // scroll roughly in half while keeping everything one tap away.
  function buildColorSectionScreenHTML(color, tagLabel, panelId, opts) {
    const comp = !!(opts && opts.comp);
    return `
      <div class="color-section">
        ${colorSectionHeroHTML(color, tagLabel)}
        <div class="cs-body">
          <p class="cs-summary">${escapeHtml(color.summary)}</p>
          <button type="button" class="cs-toggle js-toggle" aria-expanded="false" aria-controls="${panelId}" data-target="${panelId}">
            <span class="cs-toggle-label">${comp ? "활용 예시 보기" : "이 강점이 드러나는 모습 보기"}</span>
            <span class="cs-toggle-icon" aria-hidden="true">▾</span>
          </button>
          <div class="cs-details" id="${panelId}">
            ${colorSectionDetailBodyHTML(color, opts)}
          </div>
        </div>
      </div>
    `;
  }

  // PDF version: same visual content, but returned as TWO independent cards
  // (intro: hero+summary, detail: dual/example/growth) so the PDF's page-fill
  // logic can place them separately when the full card doesn't fit a gap.
  function buildColorSectionPdfParts(color, tagLabel, opts) {
    const intro = `
      <div class="color-section">
        ${colorSectionHeroHTML(color, tagLabel)}
        <div class="cs-body">${colorSectionIntroBodyHTML(color, opts)}</div>
      </div>
    `;
    const detail = `
      <div class="color-section">
        <div class="cs-body cs-body-continued">${colorSectionDetailBodyHTML(color, opts)}</div>
      </div>
    `;
    return [intro, detail];
  }

  // One continuous card — hero + summary + healthy/overuse/example in a single
  // .color-section. Used where the whole profile is placed as one unit (the
  // complement deep dive), so it doesn't show the seam between two stacked
  // cards that the intro/detail split produces.
  function buildColorSectionWholeHTML(color, tagLabel) {
    return `
      <div class="color-section">
        ${colorSectionHeroHTML(color, tagLabel)}
        <div class="cs-body">
          ${colorSectionIntroBodyHTML(color)}
          ${colorSectionDetailBodyHTML(color)}
        </div>
      </div>
    `;
  }

  // ---------- Quiz flow ----------
  // 강의용: 이름·코드 확인 → 컬러 5개 선택 → CCT 65문항 → 통합 결과
  function beginFlow() {
    if (!verified) return;
    if (LECTURE_EDITION && screenMode) {
      showScreen(screenMode);
      return;
    }
    startQuiz();
  }

  // 검사 방식 선택 화면에서 고른 방식으로 시작합니다.
  function chooseMode(m) {
    mode = m;
    window.CR.reset();
    if (m === "cct") {
      startQuiz();
      return;
    }
    window.CR.openPick(
      () => (mode === "cr" ? finishReadingOnly() : startQuiz()),
      { finishLabel: mode === "cr" ? "컬러리딩 결과 보기" : "CCT 검사 시작하기" }
    );
    showScreen(screenColorPick);
  }

  // 카드를 눌러 고르고(다시 고를 수 있음) → [선택 완료]로 시작합니다.
  let pendingMode = null;
  const MODE_NAMES = { cr: "컬러 심리리딩", cct: "CCT 컬러성격강점검사", both: "컬러리딩 + CCT" };
  function setPendingMode(m) {
    pendingMode = m;
    if (!screenMode) return;
    screenMode.querySelectorAll("[data-mode]").forEach((btn) => {
      const on = btn.dataset.mode === m;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const confirm = document.getElementById("btnModeConfirm");
    if (confirm) confirm.disabled = !m;
    const hint = document.getElementById("modeHint");
    if (hint) hint.textContent = m ? `선택한 검사 · ${MODE_NAMES[m]}` : "검사를 선택해주세요";
  }

  function bindModeScreen() {
    if (!screenMode) return;
    screenMode.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => setPendingMode(btn.dataset.mode));
    });
    const confirm = document.getElementById("btnModeConfirm");
    if (confirm) confirm.addEventListener("click", () => { if (pendingMode) chooseMode(pendingMode); });
    const back = document.getElementById("btnModeBack");
    if (back) back.addEventListener("click", () => showScreen(screenIntro));
  }

  // 컬러리딩만 진행한 경우: CCT 없이 바로 결과로 갑니다.
  function finishReadingOnly() {
    userName = (userNameInput.value || "").trim().slice(0, 12);
    resultLogged = false;
    pdfDocPromise = null;
    renderReadingResult();
    showScreen(screenResult);
  }

  function startQuiz() {
    userName = (userNameInput.value || "").trim().slice(0, 12);
    shuffledQuestions = shuffle(CCT_QUESTIONS);
    answers = new Array(shuffledQuestions.length).fill(null);
    cctPicks = emptyPicks();
    currentIndex = 0;
    resultLogged = false; // allow a fresh retake to log its own new result
    pdfDocPromise = null; // and to build its own fresh PDF rather than reusing the old one
    qTotalEl.textContent = shuffledQuestions.length;
    quizCard.classList.remove("leaving");
    showScreen(screenQuiz);
    renderQuestion();
  }

  function renderQuestion() {
    const q = shuffledQuestions[currentIndex];
    quizQuestion.textContent = q.text;
    qNumEl.textContent = currentIndex + 1;

    const pct = (currentIndex / shuffledQuestions.length) * 100;
    progressFill.style.width = pct + "%";

    btnBack.disabled = currentIndex === 0;

    quizScale.innerHTML = "";
    const current = answers[currentIndex];

    CCT_SCALE.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "scale-btn";
      btn.dataset.val = opt.value;
      if (current && current.value === opt.value) btn.classList.add("selected");
      btn.innerHTML = `<span class="dot"></span><span>${opt.label}</span>`;
      btn.addEventListener("click", () => selectAnswer(opt.value));
      quizScale.appendChild(btn);
    });
  }

  function selectAnswer(value) {
    const q = shuffledQuestions[currentIndex];
    answers[currentIndex] = { color: q.color, value };

    Array.from(quizScale.children).forEach((btn) => {
      btn.classList.toggle("selected", Number(btn.dataset.val) === value);
      // Prevent rapid double/triple-clicks on the same question from queuing
      // up multiple advance/finish timers (which could otherwise fire the
      // Google Sheets logging call more than once for a single completion).
      btn.disabled = true;
    });

    setTimeout(() => {
      quizCard.classList.add("leaving");
      setTimeout(() => {
        if (currentIndex < shuffledQuestions.length - 1) {
          currentIndex++;
          renderQuestion();
          quizCard.classList.remove("leaving");
        } else {
          finishQuiz();
        }
      }, 220);
    }, 160);
  }

  btnBack.addEventListener("click", () => {
    if (currentIndex > 0) {
      quizCard.classList.add("leaving");
      setTimeout(() => {
        currentIndex--;
        renderQuestion();
        quizCard.classList.remove("leaving");
      }, 220);
    }
  });

  function finishQuiz() {
    progressFill.style.width = "100%";
    const scores = computeScores();
    runTieBreaks(scores, () => {
      renderResult(scores);
      showScreen(screenResult);
    });
  }

  // ---------- 동점 처리 (TOP1~3 순위 · 보완컬러) ----------
  // 점수로 순위·보완컬러가 정해지지 않을 때만 1문항씩 묻는다.
  // 대부분의 응답은 이 화면을 거치지 않고 바로 결과로 간다.
  function runTieBreaks(scores, done) {
    const rk = CCTRank.resolveRanking(scores, cctPicks.rank);
    if (rk.pending) {
      showTieBreak(rk.pending, (key) => {
        cctPicks.rank.push(key);
        runTieBreaks(scores, done);
      });
      return;
    }
    const cp = CCTRank.resolveComplement(rk.ranked[0].key, scores, rk.ranked, { pick: cctPicks.comp });
    if (cp.pending) {
      showTieBreak(cp.pending, (key) => {
        cctPicks.comp = key;
        runTieBreaks(scores, done);
      });
      return;
    }
    done();
  }

  let screenTie = null;
  function ensureTieScreen() {
    if (screenTie) return screenTie;
    screenTie = document.createElement("section");
    screenTie.id = "screen-tiebreak";
    screenTie.className = "screen screen--tiebreak";
    screenQuiz.insertAdjacentElement("afterend", screenTie);
    return screenTie;
  }

  function showTieBreak(pending, onPick) {
    const el = ensureTieScreen();
    const isComp = pending.type === "complement";
    // 색상명은 숨기고 문장만, 순서도 섞어서 보여준다 (색 선호가 아닌 '나와 가까운 모습'을 고르도록).
    const keys = shuffle(pending.keys);
    const many = keys.length > 2;
    const title = isComp
      ? "지금의 나에게 조금 더 도움이 될 것 같은 힘을 선택해주세요."
      : many
        ? "다음 중 평소 나와 가장 가까운 모습을 선택해주세요."
        : "둘 중 평소 나와 더 가까운 모습을 선택해주세요.";
    const sub = isComp
      ? "나의 대표 강점을 균형 있게 쓰도록 돕는 균형 컬러를 정하기 위해 여쭤볼게요."
      : "응답 점수가 같은 강점이 있어 순위를 정하기 위해 여쭤볼게요. 점수는 그대로 유지됩니다.";
    const letters = "ABCDEFGHIJKLM";
    const opts = keys
      .map((k, i) => {
        const text = (isComp ? CCT_BALANCE_STATEMENTS : CCT_TIE_STATEMENTS)[k] || "";
        return `
        <button type="button" class="tb-option" data-key="${k}" aria-pressed="false">
          <span class="tb-letter">${letters[i]}</span>
          <span class="tb-text">${escapeHtml(text)}</span>
        </button>`;
      })
      .join("");
    el.innerHTML = `
      <div class="tb-wrap">
        <div class="tb-kicker">마지막 확인</div>
        <h2 class="tb-title">${title}</h2>
        <p class="tb-sub">${sub}</p>
        <div class="tb-options">${opts}</div>
        <button type="button" class="btn btn-primary tb-confirm" disabled>
          선택 완료
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m0 0l-6-6m6 6l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>`;
    let chosen = null;
    const confirm = el.querySelector(".tb-confirm");
    el.querySelectorAll(".tb-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        chosen = btn.dataset.key;
        el.querySelectorAll(".tb-option").forEach((b) => {
          const on = b === btn;
          b.classList.toggle("is-selected", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        confirm.disabled = false;
      });
    });
    confirm.addEventListener("click", () => {
      if (!chosen) return;
      confirm.disabled = true;
      onPick(chosen);
    });
    showScreen(el);
  }

  // 보완컬러 선택 근거 — 결과지·시트에 같은 문장을 쓴다.
  // v3test_02: 옛 보완컬러 정의 문장("낮은 점수의 컬러를 의미하지 않습니다")은 실제 선정 방식과 맞지 않아 쓰지 않음 → CCT_BAL_DEF (cct-interp.js)
  function complementReasonText(top1, comp) {
    const c = comp.chosen;
    const o = comp.other;
    if (!c || !o) return "";
    const f = (v) => Number(v).toFixed(1);
    const candNames = (CCT_COMPLEMENT_MAP[top1.key] || []).map((k) => cctColorByKey(k).ko).join("·");
    const cand = `${top1.ko}의 균형 후보는 ${candNames}입니다.`;
    const info = comp.info || {};
    const dom = (k) => (info.domains || []).find((d) => d.key === k) || {};
    switch (comp.step) {
      case 1:
        return `${cand} 두 후보의 점수(${c.ko} ${f(c.score)} · ${o.ko} ${f(o.score)}) 차이가 0.4 이상이어서, 상대적으로 덜 사용하고 있는 ${c.ko}${josa(c.ko, "을", "를")} 균형컬러로 정했습니다.`;
      case 2:
        return `${cand} 두 후보의 점수(${c.ko} ${f(c.score)} · ${o.ko} ${f(o.score)})가 비슷해 각 후보가 속한 강점영역의 평균을 비교했습니다. '${dom(c.key).domain}' ${CCTRank.fmt2(dom(c.key).avg)}점이 '${dom(o.key).domain}' ${CCTRank.fmt2(dom(o.key).avg)}점보다 낮아, 그 영역의 ${c.ko}${josa(c.ko, "을", "를")} 균형컬러로 정했습니다.`;
      case 3:
        return `${cand} 두 후보의 점수와 강점영역 평균이 같아, 이미 TOP3 강점인 ${o.ko} 대신 ${c.ko}${josa(c.ko, "을", "를")} 균형컬러로 정했습니다.`;
      case 4:
        return `${cand} 두 후보의 점수와 강점영역 평균이 같아, 직접 고른 '${CCT_BALANCE_STATEMENTS[c.key] || ""}'에 따라 ${c.ko}${josa(c.ko, "을", "를")} 균형컬러로 정했습니다.`;
      default:
        return `${cand} 두 후보의 점수와 강점영역 평균이 같아, 기본 순서에 따라 ${c.ko}${josa(c.ko, "을", "를")} 균형컬러로 정했습니다.`;
    }
  }

  function tieNotesHTML(scores) {
    const notes = rankTieNotes(scores);
    if (!notes.length) return "";
    return `<div class="tie-note">${notes.map((t) => `<p>※ ${escapeHtml(t)}</p>`).join("")}</div>`;
  }

  // 순위 동점 처리 설명 (TOP3에 영향을 준 동점만)
  function rankTieNotes(scores) {
    const rk = CCTRank.resolveRanking(scores, cctPicks.rank, { fallback: true });
    return rk.notes.map((n) => {
      const nm = (k) => cctColorByKey(k).ko;
      const names = n.keys.map(nm).join("·");
      const parts = [];
      n.steps.forEach((st) => {
        if (st.type === "domain") {
          const items = st.items.map((it) => `${nm(it.key)} '${it.domain}' ${CCTRank.fmt2(it.avg)}`).join(", ");
          parts.push(`강점영역 평균(${items})`);
        } else if (st.type === "choice") {
          parts.push(`직접 고른 대표문장(${nm(st.pick)})`);
        } else {
          parts.push(`기본 순서(${nm(st.pick)})`);
        }
      });
      return `${names} 컬러가 ${n.score.toFixed(1)}점으로 같아 순위를 따로 정했습니다 (점수는 그대로 · 기준: ${parts.join(" → ")}).`;
    });
  }

  // ---------- Scoring ----------
  function computeScores() {
    const sums = {};
    const counts = {};
    CCT_COLORS.forEach((c) => { sums[c.key] = 0; counts[c.key] = 0; });
    answers.forEach((a) => {
      if (!a) return;
      sums[a.color] += a.value;
      counts[a.color] += 1;
    });
    const avg = {};
    CCT_COLORS.forEach((c) => {
      avg[c.key] = counts[c.key] ? sums[c.key] / counts[c.key] : 0;
    });
    return avg; // { RED: 4.2, ORANGE: 3.1, ... } on 1-5 scale
  }

  // 점수(score)와 순위(rank)는 따로 둔다 — 동점이어도 점수는 바꾸지 않는다.
  // 강제선택은 runTieBreaks()에서 이미 끝났으므로 여기서는 묻지 않는다
  // (예전 결과 링크처럼 응답이 없으면 기본 컬러 순서로 정함).
  function getRanked(scores) {
    return CCTRank.resolveRanking(scores, cctPicks.rank, { fallback: true }).ranked;
  }

  // 보완컬러: TOP1의 보완 후보 2개 중 — 점수 차이 0.4↑ → 강점영역 평균 → TOP3 여부 → 강제선택
  // (cct-rank.js). 강제선택 응답은 결과지의 TOP1 기준일 때만 쓴다.
  function getComplement(top1Key, scores, ranked) {
    const rk = ranked || getRanked(scores);
    const isReportTop1 = rk[0] && rk[0].key === top1Key;
    return CCTRank.resolveComplement(top1Key, scores, rk, {
      pick: isReportTop1 ? cctPicks.comp : null,
      fallback: true,
    });
  }

  // ---------- Result rendering (on-screen, section-style) ----------
  // ---------- Optional: log completed result to Google Sheets ----------
  let resultLogged = false; // one-shot guard: never log the same completion twice
  // Automatically logs every completed test to the admin's Google Sheet AND
  // attaches the full detailed PDF (saved to the admin's Drive by the Apps
  // Script, linked from the sheet row) — regardless of app variant, so the
  // admin can always look up who took the test and see their exact result,
  // even in the v2 variant where the end user themselves never sees a
  // download button.
  // ---- Result logging: two phases, on purpose ----
  // The detailed PDF now runs to 8 pages, each rendered through html2canvas,
  // plus a footer pass per page. On a phone — especially inside the KakaoTalk
  // webview — that build takes tens of seconds. The old code awaited the whole
  // PDF and only THEN sent anything, so if the reader closed the screen, handed
  // off to another browser, or the webview was memory-killed mid-build, the
  // result was never recorded at all and there was no trace of why.
  //
  // Phase 1 fires immediately with everything except the PDF, via sendBeacon so
  // it survives the page being unloaded. Phase 2 sends the PDF afterwards and
  // fills the same row in. A failed PDF now costs the PDF link only — never
  // the record that the test happened.
  const PDF_LOG_MAX_BYTES = 7 * 1024 * 1024; // Apps Script rejects very large POST bodies

  function newResultId() {
    return "R" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Fire-and-forget POST, but readable when the browser lets us read it.
  //
  // `beacon` uses navigator.sendBeacon, which the browser completes even after
  // the page goes away — but it caps the body at ~64KB, so only the small
  // phase-1 payload may use it.
  //
  // Otherwise we first try an ordinary (readable) request: text/plain keeps it a
  // "simple" CORS request, so no preflight, and Apps Script's redirect target
  // does send Access-Control-Allow-Origin. When that works we can see the
  // status and the script's own reply in the console — which is the only way
  // a silent logging failure ever becomes visible. If reading is blocked we
  // re-send with mode:"no-cors" (write-only). A re-send is safe because the
  // Apps Script keys every write on resultId and ignores repeats.
  async function postToWebhook(payload, opts) {
    const body = JSON.stringify(payload);
    const headers = { "Content-Type": "text/plain;charset=utf-8" };
    const label = `[CCT] 결과 기록 (${payload.phase || "?"})`;

    if (opts && opts.beacon) {
      // 1차(작은 결과 줄)는 sendBeacon으로 보내고, 2026-10-18부터 일반 요청으로 한 번 더 보낸다.
      // 10/12 강의(25명 동시 완료)에서 1차가 유실된 사례가 있었기 때문. Apps Script가
      // 결과ID로 중복을 걸러 내므로 시트에 줄이 두 번 생기지 않는다.
      try {
        if (navigator.sendBeacon) {
          const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
          if (navigator.sendBeacon(GS_WEBHOOK_URL, blob)) console.info(`${label} — sendBeacon 전송 (${body.length}B)`);
        }
      } catch (e) {
        /* fall through */
      }
      try {
        await fetch(GS_WEBHOOK_URL, { method: "POST", mode: "no-cors", headers, body, keepalive: body.length < 60000 });
      } catch (e) {
        console.warn(`${label} — 보조 전송 실패:`, e && e.message);
      }
      return true;
    }

    // 2차(PDF): 읽을 수 있는 요청 → 막히면 no-cors 재전송. 네트워크 오류면 3초 뒤 한 번 더.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(GS_WEBHOOK_URL, { method: "POST", headers, body, redirect: "follow" });
        const text = await res.text();
        console.info(`${label} — HTTP ${res.status}: ${text.slice(0, 200)}`);
        if (res.ok) return true;
      } catch (err) {
        console.warn(`${label} — 응답을 읽지 못함, 재전송합니다:`, err && err.message);
      }
      try {
        await fetch(GS_WEBHOOK_URL, { method: "POST", mode: "no-cors", headers, body });
        return true;
      } catch (e) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    return false;
  }

  // ---------- 결과 저장 안내 (2026-10-18) ----------
  // PDF는 휴대폰에서 만드는 데 수십 초가 걸린다. 그 사이 화면을 닫으면 결과지가 Drive에
  // 저장되지 않으므로(10/8·10/12 사례), 저장이 끝날 때까지 안내를 띄우고 닫기 전에 한 번 묻는다.
  let saveNoticeTimer = null;
  function guardUnload(e) {
    e.preventDefault();
    e.returnValue = "";
    return "";
  }
  function showSaveNotice(state) {
    let el = document.getElementById("saveNotice");
    if (!el) {
      el = document.createElement("div");
      el.id = "saveNotice";
      el.className = "save-notice";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    clearTimeout(saveNoticeTimer);
    if (state === "saving") {
      el.innerHTML = `<span class="save-notice-spin"></span><span>결과를 저장하고 있어요. 잠시만 이 화면을 닫지 말아 주세요.</span>`;
      el.className = "save-notice is-on";
      window.addEventListener("beforeunload", guardUnload);
      return;
    }
    window.removeEventListener("beforeunload", guardUnload);
    if (state === "done") {
      el.innerHTML = `<span class="save-notice-ok">✓</span><span>결과가 저장되었어요.</span>`;
      el.className = "save-notice is-on is-done";
      saveNoticeTimer = setTimeout(() => (el.className = "save-notice"), 2500);
      return;
    }
    el.className = "save-notice";
  }

  async function autoLogResult(scores, ranked, comp) {
    if (!GS_WEBHOOK_URL) return; // logging disabled
    if (resultLogged) return;
    resultLogged = true;
    const boostSt = await getBoostStatus().catch(() => null); // ④ 글자 확대 감지 결과를 "버전" 열에 함께 기록

    const resultId = newResultId();
    const meta = {
      resultId,
      phase: "meta",
      name: userName || "",
      completedAt: new Date().toISOString(),
      appVariant: editionLabel() + boostTag(boostSt),
      colorReading: hasReading() ? window.CR.logText(window.CR.getSelection()) : "",
      top1: `${ranked[0].ko}(${ranked[0].en})`,
      top2: `${ranked[1].ko}(${ranked[1].en})`,
      top3: `${ranked[2].ko}(${ranked[2].en})`,
      complement: `${comp.chosen.ko}(${comp.chosen.en})`,
      // 점수(scores)는 원점수 그대로, 순위는 따로 — 동점이면 같은 점수에 다른 순위
      ranks: ranked.reduce((obj, c) => {
        obj[c.key] = c.rank;
        return obj;
      }, {}),
      rankText: ranked.map((c) => `${c.rank}.${c.ko} ${Number(c.score).toFixed(1)}`).join(" · "),
      tieNote: rankTieNotes(scores).concat([`균형: ${complementReasonText(ranked[0], comp)}`]).join(" / "),
      scores: CCT_COLORS.reduce((obj, c) => {
        obj[c.key] = scores[c.key];
        return obj;
      }, {}),
    };
    // Phase 1 — the row itself. Sent before the PDF build starts.
    showSaveNotice("saving");
    postToWebhook(meta, { beacon: true });

    // Phase 2 — the PDF, attached to the row created above.
    try {
      const { pdfBase64 } = await getPdfDoc(scores, ranked);
      const bytes = Math.round((pdfBase64.length * 3) / 4);
      if (bytes > PDF_LOG_MAX_BYTES) {
        await postToWebhook(Object.assign({}, meta, {
          phase: "pdf",
          pdfError: `PDF 용량 초과 (${(bytes / 1048576).toFixed(1)}MB)`,
        }));
        showSaveNotice("off");
        return;
      }
      const sent = await postToWebhook(Object.assign({}, meta, { phase: "pdf", pdfBytes: bytes, pdfBase64 }));
      showSaveNotice(sent ? "done" : "off");
    } catch (err) {
      console.warn("결과 PDF 전송 실패:", err);
      await postToWebhook(Object.assign({}, meta, {
        phase: "pdf",
        pdfError: String((err && err.message) || err).slice(0, 200),
      }));
      showSaveNotice("off");
    }
  }

  function buildResultActionsHTML() {
    if (APP_VARIANT === "v2") {
      // v2: no self-service PDF download — direct the user to visit a center
      // in person, where the (already auto-generated) detailed PDF is provided.
      const centerButtons = CENTER_LOCATIONS.map(
        (loc) => `
          <a class="btn btn-secondary btn-center" href="${loc.url}" target="_blank" rel="noopener noreferrer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-7.2 7-12a7 7 0 10-14 0c0 4.8 7 12 7 12z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="9" r="2.5" stroke="currentColor" stroke-width="2"/></svg>
            ${escapeHtml(loc.name)} 지도 보기
          </a>
        `
      ).join("");
      return `
        <div class="center-notice">
          <div class="center-notice-title">상세 결과 PDF는 센터 방문 시 제공됩니다</div>
          <p>13개 컬러 전체 프로파일과 상세 해석이 담긴 리포트는 온라인으로 바로 받아보실 수 없고, 아래 센터에서 진단 예약을 하고 센터로 방문하시면 안내받으실 수 있어요.</p>
        </div>
        <div class="result-actions">
          ${centerButtons}
          <button class="btn btn-secondary" id="btnRetry">다시 검사하기</button>
        </div>
      `;
    }

    // v1 (default): the user can download their own detailed PDF right away.
    return `
      <div class="result-actions">
        <button class="btn btn-primary" id="btnPdf">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          상세 결과 PDF 다운로드
        </button>
        <button class="btn btn-secondary" id="btnRetry">다시 검사하기</button>
      </div>
      <div class="toast" id="toast">PDF를 생성하고 있습니다…</div>
    `;
  }

  function renderResult(scores) {
    resetUsed();
    const ranked = getRanked(scores);
    const top1 = ranked[0];
    const comp = getComplement(top1.key, scores, ranked);
    // Fire-and-forget: builds the PDF and logs it to the admin's Google Sheet/
    // Drive in the background. Runs for BOTH variants, and never blocks or
    // breaks the result screen if it fails (see autoLogResult's own try/catch).
    autoLogResult(scores, ranked, comp);

    const resultNote =
      APP_VARIANT === "v2"
        ? `본 결과는 자기보고 기반 성격강점 프로파일이며<br/>정신건강·성격장애를 진단하는 임상 도구가 아닙니다.`
        : `본 결과는 자기보고 기반 성격강점 프로파일이며<br/>정신건강·성격장애를 진단하는 임상 도구가 아닙니다.<br/>
        ${hasReading() ? "컬러리딩과 " : ""}13개 컬러 전체 프로파일·상세 해석은<br/>아래 PDF 리포트에서 확인하실 수 있습니다.`;

    const ctaLabel = APP_VARIANT === "v2" ? "센터 방문 안내 보기" : "상세 결과 PDF 다운로드";

    const html = `
      <div class="result-doc-title">CCT 컬러성격강점검사 분석 결과</div>

      <div class="result-hero">
        <p class="lead">${userName ? escapeHtml(userName) + "님의" : "나의"} 강점 컬러는</p>
        <h1 style="color:${top1.hex}">${top1.ko}</h1>
        <p class="strength-name">${top1.strength} · ${top1.en}</p>
      </div>

      <section class="rs-block">
        <h2 class="rs-title">한눈에 보는 내 결과</h2>
        <div class="quick-grid">${buildQuickCardsHTML(ranked, comp)}</div>
        ${buildQuickFactsHTML(ranked, comp, "아래에서 13개 컬러 전체 프로파일과 상세 해석을 확인하실 수 있습니다.", scores)}
      </section>

      <section class="rs-block">
        <h2 class="rs-title">13개 컬러 프로파일</h2>
        <div class="rs-radar-card">${buildRadarChartHTML(scores)}</div>
        <button type="button" class="rs-toggle js-toggle" aria-expanded="false" aria-controls="rsScores" data-target="rsScores">
          <span class="cs-toggle-label">컬러별 상세 점수 보기</span>
          <span class="cs-toggle-icon" aria-hidden="true">▾</span>
        </button>
        <div class="rs-panel" id="rsScores">
          <div class="bar-chart">${ranked.map((c, i) => buildScoreBarRowHTML(c, i)).join("")}</div>
        </div>
      </section>

      <section class="rs-block">
        <h2 class="rs-title">핵심 강점 컬러</h2>
        ${buildColorSectionScreenHTML(top1, "핵심 강점 컬러", "rsTop1")}
      </section>

      <section class="rs-block" id="rsComplement">
        <h2 class="rs-title">균형 컬러</h2>
        <p class="rs-note">${escapeHtml(BAL_DEF)}</p>
        <div class="color-section">${colorSectionHeroHTML(comp.chosen, "균형 컬러 · 함께 써 볼 자원")}<div class="cs-body">${buildBalanceGuideHTML(ranked, comp, scores)}</div></div>
      </section>

      <p class="result-note">
        ${resultNote}
      </p>

      ${buildResultActionsHTML()}

      <div class="rs-cta-bar" id="rsCtaBar">
        <button type="button" class="btn btn-primary" id="btnCta">${ctaLabel}</button>
      </div>
    `;

    resultWrap.innerHTML = html;

    if (hasReading()) {
      const reading = window.CR.buildReading(window.CR.getSelection(), userName);
      const titleEl = resultWrap.querySelector(".result-doc-title");
      if (reading && titleEl) titleEl.insertAdjacentHTML("afterend", window.CR.buildScreenHTML(reading));
      if (reading && titleEl) window.CR.bindScreen(resultWrap);
    }

    document.getElementById("btnRetry").addEventListener("click", resetApp);
    const btnPdf = document.getElementById("btnPdf");
    if (btnPdf) btnPdf.addEventListener("click", (e) => downloadPdf(scores, ranked, e.currentTarget));

    bindDisclosureToggles(resultWrap);
    fitRadarToWidth(resultWrap);
    bindResultCta(scores, ranked);

    if (!renderResult._resizeBound) {
      renderResult._resizeBound = true;
      window.addEventListener("resize", () => fitRadarToWidth(resultWrap));
    }
  }

  // ---------- 컬러리딩 단독 결과 ----------
  function renderReadingResult() {
    const reading = window.CR.buildReading(window.CR.getSelection(), userName);
    autoLogReading();
    resultWrap.innerHTML = `
      <div class="result-doc-title">컬러리딩 결과</div>
      ${window.CR.buildScreenHTML(reading, { standalone: true })}
      <p class="result-note">
        컬러리딩은 진단이 아닌, 지금의 마음을 함께 읽어보는 대화의 도구입니다.<br/>
        전체 리딩은 아래 PDF 리포트로 받아보실 수 있습니다.
      </p>
      ${buildResultActionsHTML()}
      <div class="rs-cta-bar" id="rsCtaBar">
        <button type="button" class="btn btn-primary" id="btnCta">컬러리딩 PDF 다운로드</button>
      </div>
    `;
    const pdfBtn = document.getElementById("btnPdf");
    if (pdfBtn) {
      pdfBtn.lastChild.textContent = " 컬러리딩 PDF 다운로드";
      pdfBtn.addEventListener("click", (e) => downloadPdf(null, null, e.currentTarget));
    }
    document.getElementById("btnRetry").addEventListener("click", resetApp);
    window.CR.bindScreen(resultWrap);
    bindResultCta(null, null);
  }

  async function autoLogReading() {
    if (!GS_WEBHOOK_URL) return;
    if (resultLogged) return;
    resultLogged = true;
    const boostSt = await getBoostStatus().catch(() => null); // ④ 글자 확대 감지 결과를 "버전" 열에 함께 기록
    const resultId = newResultId();
    const meta = {
      resultId,
      phase: "meta",
      name: userName || "",
      completedAt: new Date().toISOString(),
      appVariant: editionLabel() + boostTag(boostSt),
      colorReading: window.CR.logText(window.CR.getSelection()),
      top1: "", top2: "", top3: "", complement: "",
      scores: {},
    };
    showSaveNotice("saving");
    postToWebhook(meta, { beacon: true });
    try {
      const { pdfBase64 } = await getPdfDoc(null, null);
      const bytes = Math.round((pdfBase64.length * 3) / 4);
      if (bytes > PDF_LOG_MAX_BYTES) {
        await postToWebhook(Object.assign({}, meta, { phase: "pdf", pdfError: `PDF 용량 초과 (${(bytes / 1048576).toFixed(1)}MB)` }));
        showSaveNotice("off");
        return;
      }
      const sent = await postToWebhook(Object.assign({}, meta, { phase: "pdf", pdfBytes: bytes, pdfBase64 }));
      showSaveNotice(sent ? "done" : "off");
    } catch (err) {
      console.warn("컬러리딩 PDF 전송 실패:", err);
      await postToWebhook(Object.assign({}, meta, { phase: "pdf", pdfError: String((err && err.message) || err).slice(0, 200) }));
      showSaveNotice("off");
    }
  }

  // Expand/collapse handlers for every .js-toggle in the result screen.
  function bindDisclosureToggles(root) {
    root.querySelectorAll(".js-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const panel = document.getElementById(btn.dataset.target);
        if (!panel) return;
        const open = panel.classList.toggle("is-open");
        btn.classList.toggle("is-open", open);
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        const label = btn.querySelector(".cs-toggle-label");
        if (label) label.textContent = label.textContent.replace(open ? "보기" : "접기", open ? "접기" : "보기");
      });
    });
  }

  // The radar chart is authored at a fixed 356px square (it has to be, because
  // its labels are absolutely positioned at computed coordinates). On narrow
  // phones that overflows the 24px-padded column, so scale the whole thing down
  // to fit and shrink its container to match the scaled height.
  //
  // NOTE renderResult() runs while #screen-result is still display:none (see
  // finishQuiz: render first, then showScreen), so on the first call every
  // measurement is 0. Retry on subsequent frames until the element actually has
  // a width, and re-fit on resize/orientation change.
  function fitRadarToWidth(root, attempt) {
    const card = root.querySelector(".rs-radar-card");
    const wrap = card && card.querySelector(".radar-wrap");
    if (!card || !wrap) return;

    const natural = wrap.offsetWidth || 356;
    const available = card.clientWidth - 16; // card's own horizontal padding
    if (available <= 0) {
      // not laid out yet — try again next frame (bounded, so a permanently
      // hidden screen can never spin forever)
      const next = (attempt || 0) + 1;
      if (next < 30) requestAnimationFrame(() => fitRadarToWidth(root, next));
      return;
    }

    const scale = Math.min(1, available / natural);
    wrap.style.transformOrigin = "top center";
    wrap.style.transform = scale < 1 ? `scale(${scale})` : "";
    card.style.height = Math.round(natural * scale) + 16 + "px";
  }

  // Floating bottom CTA: gives the primary action a permanent home on a page
  // that is otherwise several screens tall. It hides itself once the real
  // action buttons at the bottom scroll into view, so the two never stack up.
  function bindResultCta(scores, ranked) {
    const bar = document.getElementById("rsCtaBar");
    const cta = document.getElementById("btnCta");
    const actions = resultWrap.querySelector(".result-actions");
    if (!bar || !cta) return;

    cta.addEventListener("click", (e) => {
      if (APP_VARIANT === "v2") {
        const target = resultWrap.querySelector(".center-notice") || actions;
        if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        downloadPdf(scores, ranked, e.currentTarget);
      }
    });

    if (actions && "IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => entries.forEach((en) => bar.classList.toggle("is-hidden", en.isIntersecting)),
        { threshold: 0.1 }
      );
      io.observe(actions);
    }
  }

  // ---------- Detailed PDF report ----------
  // Shared by the profile page's quick summary AND the later "6대 상위
  // 강점영역" flexible block, so both always agree on the same ranking.
  // ---------- v3test_02 (2026-10-28) · CCT 해석 개선 ----------
  // 같은 데이터 문장이 여러 쪽에 반복되지 않도록 "이미 쓴 문장"을 기록한다 (결과지를 만들 때마다 resetUsed()).
  let usedLines = new Set();
  function resetUsed() { usedLines = new Set(); }
  function useLine(t) { if (t) usedLines.add(t); return t; }
  // arr에서 아직 안 쓴 문장을 n개까지 (skip = 건너뛸 번호)
  function takeLines(arr, n, skip) {
    const out = [];
    (arr || []).forEach((t, i) => {
      if (out.length >= n || !t || usedLines.has(t) || (skip && skip.indexOf(i) !== -1)) return;
      out.push(useLine(t));
    });
    return out;
  }
  function f1(v) { return Number(v).toFixed(1); }
  function cmpKo(k) { return cctColorByKey(k).ko; }
  function joinKo(list) { return list.join("·"); }
  // 따옴표·괄호로 끝나는 말에도 조사를 맞게
  function jq(w, a, b) { const s = String(w).replace(/[’'”"」)\]]+$/, ""); return w + josa(s, a, b); }
  const remedyIdx = (k) => ((typeof CCT_REMEDY !== "undefined" && CCT_REMEDY[k]) || []).filter((x) => x != null);
  const relIdx = (k) => (typeof CCT_REL !== "undefined" && CCT_REL[k]) || { h: [], a: [] };
  function balLink(t1, cp) { return (typeof CCT_BAL_LINK !== "undefined" && CCT_BAL_LINK[t1 + ">" + cp]) || null; }
  const BAL_DEF = typeof CCT_BAL_DEF !== "undefined" ? CCT_BAL_DEF : "";

  // 점수 분포 읽기 (0.2점 = 다섯 문항 중 한 문항에서 1점 차이)
  function distParagraph(ranked) {
    const t1 = ranked[0], t2 = ranked[1];
    const scores = ranked.map((c) => c.score);
    const gap = Math.round((t1.score - t2.score) * 10) / 10;
    const q10 = (v) => Math.round(v * 10);
    const near = ranked.filter((c) => q10(c.score) >= q10(t1.score) - 2).length;
    const range = Math.round((Math.max(...scores) - Math.min(...scores)) * 10) / 10;
    const nm = (c) => `<b>${escapeHtml(c.ko)} · ${escapeHtml(c.strength)}</b>`;
    let s;
    if (gap >= 0.4) {
      s = `가장 높게 나타난 강점은 ${nm(t1)}${josa(t1.strength, "이에요", "예요")}(${f1(t1.score)}점). 다음 강점인 ${escapeHtml(t2.ko)}(${f1(t2.score)}점)보다 ${f1(gap)}점 높아, 이번 결과에서는 ${escapeHtml(jq(t1.core, "이", "가"))} 가장 뚜렷하게 드러났어요.`;
    } else if (gap > 0) {
      s = `${nm(t1)}${josa(t1.strength, "이", "가")} ${f1(t1.score)}점으로 가장 높지만, 다음 강점인 ${escapeHtml(t2.ko)}(${f1(t2.score)}점)과 ${f1(gap)}점 차이예요. 0.2점은 다섯 문항 가운데 한 문항에서 1점 정도의 차이라, 순위보다 함께 높게 나타났다는 점을 보는 것이 좋아요.`;
    } else {
      const tied = ranked.filter((c) => c.score === t1.score);
      s = `${tied.map((c) => `<b>${escapeHtml(c.ko)}</b>`).join("·")}${josa(tied[tied.length - 1].ko, "이", "가")} ${f1(t1.score)}점으로 함께 가장 높아요. 이 가운데 ${escapeHtml(t1.ko)}${josa(t1.ko, "을", "를")} 1위로 표시한 것은 점수가 같을 때 쓰는 순서 규칙에 따른 것이에요.`;
    }
    if (near >= 4) s += ` 13개 중 ${near}개 컬러가 ${f1(t1.score - 0.2)}점 이상이라, 하나의 강점이 두드러진다기보다 여러 강점이 고르게 높은 프로필에 가까워요.`;
    if (range <= 0.8) s += ` 가장 높은 점수와 가장 낮은 점수의 차이가 ${f1(range)}점으로, 13개 강점이 비교적 비슷한 수준으로 나타났어요.`;
    return s;
  }

  // 동점 안내 — 계산 과정을 그대로 노출하지 않고 쉬운 말로
  function tiePlainText(scores, ranked) {
    const rk = CCTRank.resolveRanking(scores, cctPicks.rank, { fallback: true });
    const top3 = ranked.slice(0, 3).map((c) => c.key);
    return rk.notes.map((n) => {
      const how = n.steps.some((st) => st.type === "choice") ? "직접 고른 문장" : n.steps.some((st) => st.type === "domain") ? "각 컬러가 속한 강점영역의 평균 비교" : "기본 순서";
      const outside = n.keys.filter((k) => top3.indexOf(k) === -1);
      const names = joinKo(n.keys.map(cmpKo));
      let t = `${names} 컬러가 ${n.score.toFixed(1)}점으로 같아요. TOP 순서는 ${how}로 정했고, 점수는 그대로예요.`;
      if (outside.length) t += ` TOP3 밖에 놓인 ${joinKo(outside.map(cmpKo))}도 같은 점수로 함께 높게 나타난 강점이에요.`;
      return t;
    });
  }
  function tiePlainHTML(scores, ranked) {
    const notes = tiePlainText(scores, ranked);
    return notes.length ? `<div class="tie-note">${notes.map((t) => `<p>※ ${escapeHtml(t)}</p>`).join("")}</div>` : "";
  }

  // 균형컬러를 정한 방법 — "13색 최저가 아님"과 "후보 둘 안에서는 점수 기준"을 구분해서
  function balanceHowText(top1, comp, scores, ranked) {
    const c = comp.chosen, o = comp.other;
    if (!c || !o) return "";
    const cand = (CCT_COMPLEMENT_MAP[top1.key] || []).map(cmpKo);
    let s = `CCT의 초기 이론적 후보표에는 대표 강점마다 균형 후보가 두 가지씩 정해져 있어요. ${top1.ko}의 후보는 ${joinKo(cand)}${josa(cand[cand.length - 1], "이에요", "예요")}. 그래서 13개 컬러 가운데 가장 낮은 점수를 고르는 방식은 아니에요.`;
    const min = Math.min(...Object.values(scores));
    const lows = CCT_COLORS.filter((x) => scores[x.key] === min && cand.indexOf(x.ko) === -1);
    if (lows.length && scores[c.key] !== min) s += ` (가장 낮은 점수는 ${joinKo(lows.map((x) => x.ko))} ${f1(min)}점이지만 후보가 아니에요.)`;
    s += " 다만 두 후보 안에서는 지금 상대적으로 덜 쓰고 있는 쪽을 제안해요. ";
    switch (comp.step) {
      case 1: s += `${c.ko} ${f1(c.score)}점 · ${o.ko} ${f1(o.score)}점으로 0.4점 이상 차이가 나서 ${jq(c.ko, "을", "를")} 균형컬러로 제안했어요.`; break;
      case 2: s += `두 후보의 점수가 비슷해(${c.ko} ${f1(c.score)}점 · ${o.ko} ${f1(o.score)}점) 각 후보가 속한 강점영역의 평균을 비교했고, 평균이 더 낮은 쪽인 ${jq(c.ko, "을", "를")} 제안했어요.`; break;
      case 3: s += `두 후보의 점수와 영역 평균이 같아, 이미 TOP3에 든 ${o.ko} 대신 ${jq(c.ko, "을", "를")} 제안했어요.`; break;
      case 4: s += `두 후보의 점수와 영역 평균이 같아, 직접 고른 문장에 따라 ${jq(c.ko, "을", "를")} 제안했어요.`; break;
      default: s += `두 후보의 점수와 영역 평균이 같아, 기본 순서에 따라 ${jq(c.ko, "을", "를")} 제안했어요.`;
    }
    if (ranked.slice(0, 3).some((x) => x.key === c.key)) s += ` ${c.ko}${josa(c.ko, "은", "는")} 이미 강점으로도 나타났어요. 가지고 있는 자원을 균형을 위해 의식적으로 꺼내 쓰는 쪽으로 보시면 돼요.`;
    return s;
  }

  // 균형 페이지 ①~④ (요청서 9장) — 화면과 PDF 공통
  function buildBalanceGuideHTML(ranked, comp, scores) {
    const t1 = ranked[0], t2 = ranked[1], cp = comp.chosen;
    const L = balLink(t1.key, cp.key);
    const tieTop = t2 && t2.score === t1.score;
    const close = t2 && Math.round(t1.score * 10) - Math.round(t2.score * 10) <= 2;
    // ① 내가 가진 주요 강점
    let p1 = `가장 높게 나타난 강점은 ${escapeHtml(t1.ko)}(${escapeHtml(t1.strength)})${josa(t1.strength, "이에요", "예요")}(${f1(t1.score)}점). ${escapeHtml(t1.core)}이에요.`;
    if (tieTop) { const tied = ranked.filter((c) => c.score === t1.score); const lastS = tied[tied.length - 1].strength; p1 = `${tied.map((c) => `${escapeHtml(c.ko)}(${escapeHtml(c.strength)})`).join("·")}${josa(lastS, "이", "가")} ${f1(t1.score)}점으로 함께 가장 높아요. 균형컬러는 순서 규칙상 1위로 표시된 ${escapeHtml(t1.ko)}${josa(t1.ko, "을", "를")} 기준으로 정했어요.`; }
    else if (close) p1 += ` ${escapeHtml(t2.ko)}(${escapeHtml(t2.strength)}, ${f1(t2.score)})도 바로 뒤에서 함께 높게 나타났어요.`;
    // ② 강점이 지나치게 쓰일 때 — 이 균형 자원이 다루는 과사용 + (해당되면) TOP2
    const overs = [];
    if (L) L.over.forEach((i) => { const t = t1.overuse[i]; if (t && !usedLines.has(t) && overs.length < 2) overs.push([t1, useLine(t)]); });
    const L2 = t2 ? balLink(t2.key, cp.key) : null;
    let t2Note = "";
    if (L2 && (close || tieTop)) {
      const t = (L2.over || []).map((i) => t2.overuse[i]).find((x) => x && !usedLines.has(x));
      if (t) { overs.push([t2, useLine(t)]); t2Note = `${escapeHtml(cp.ko)}${josa(cp.ko, "은", "는")} 함께 높은 ${escapeHtml(t2.ko)}의 균형 후보이기도 해서, 두 강점이 함께 강하게 쓰일 때를 같이 살펴볼 수 있어요.`; }
    }
    const p2 = overs.length
      ? `<ul class="cg-list">${overs.map(([c, t]) => `<li><b>${escapeHtml(c.ko)}</b> ${escapeHtml(t)}</li>`).join("")}</ul><p class="cg-sub">지금 그렇다는 뜻이 아니라, 이 강점을 자주 쓸 때 함께 살펴볼 만한 모습이에요.${t2Note ? " " + t2Note : ""}</p>`
      : `<p class="cg-sub">강점이 지나치게 쓰일 때의 모습은 '실전 지침'에서 함께 살펴봐요.</p>`;
    // ③ 왜 이 균형컬러인가 — 선정 규칙 + 두 자원의 관계
    const p3 = `<p>${escapeHtml(balanceHowText(t1, comp, scores, ranked))}</p>${L ? `<p>${escapeHtml(L.link)}</p>` : `<p>${escapeHtml(cp.ko)}${josa(cp.ko, "은", "는")} ${escapeHtml(cp.core)}이에요.</p>`}`;
    // ④ 일상에서 활용하는 방법 — 이 쌍에 맞는 실천(앞에서 쓰지 않은 것)
    const acts = [];
    if (L) L.use.forEach(([k, i]) => { const t = cctColorByKey(k).actions[i]; if (t && !usedLines.has(t) && acts.length < 3) acts.push(useLine(t)); });
    takeLines(cp.actions, 3 - acts.length, relIdx(cp.key).a).forEach((t) => acts.push(t));
    const p4 = `<ul class="cg-list">${acts.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul><p class="cg-sub">균형의 핵심은 ${escapeHtml(t1.ko)}의 강점을 줄이는 것이 아니라, 그 강점을 유지하면서 ${escapeHtml(cp.ko)}의 자원으로 쓰는 방법을 넓히는 거예요.</p>`;
    const row = (no, t, body) => `<div class="cg-row"><div class="cg-no">${no}</div><div class="cg-body"><div class="cg-t">${t}</div>${body}</div></div>`;
    return `
      <div class="comp-guide">
        ${row("①", "내가 가진 주요 강점", `<p>${p1}</p>`)}
        ${row("②", "강점이 지나치게 쓰일 때", p2)}
        ${row("③", `왜 ${escapeHtml(cp.ko)}인가요?`, p3)}
        ${row("④", "일상에서 써 보는 방법", p4)}
      </div>`;
  }

  // TOP3 조합 분석 — 순위 자리에 동사를 붙이지 않고, 실제 정의·특징 태그로만 (요청서 10장)
  function buildComboAnalysisHTML(ranked) {
    const top3 = ranked.slice(0, 3);
    const parts = [];
    const domainOf = (k) => CCT_DOMAINS.find((d) => d.colors.includes(k));
    // 같은 강점영역
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const a = top3[i], b = top3[j], d = domainOf(a.key);
      if (d && d === domainOf(b.key)) parts.push(`<p>${escapeHtml(a.ko)}(${escapeHtml(a.strength)})${josa(a.strength, "과", "와")} ${escapeHtml(b.ko)}(${escapeHtml(b.strength)})${josa(b.strength, "은", "는")} 모두 '${escapeHtml(d.name)}' 영역에 속해요. ${escapeHtml(d.desc)}과 관련된 두 강점이 함께 높게 나타났어요.</p>`);
    }
    // 공통 특징 태그 (healthy)
    const H = typeof CCT_HTAGS !== "undefined" ? CCT_HTAGS : {};
    const tagMap = {};
    top3.forEach((c) => (H[c.key] || []).forEach((tags, i) => tags.forEach((t) => { (tagMap[t] = tagMap[t] || {}); if (!(c.key in tagMap[t])) tagMap[t][c.key] = i; })));
    const best = Object.entries(tagMap).filter(([, m]) => Object.keys(m).length >= 2).sort((x, y) => Object.keys(y[1]).length - Object.keys(x[1]).length)[0];
    if (best && typeof CCT_TAG_LABEL !== "undefined" && CCT_TAG_LABEL[best[0]]) {
      const [label, scene] = CCT_TAG_LABEL[best[0]];
      const items = top3.filter((c) => c.key in best[1]).map((c) => [c, c.healthy[best[1][c.key]]]).filter(([, t]) => !usedLines.has(t));
      if (items.length >= 2) {
        items.forEach(([, t]) => useLine(t));
        parts.push(`<p>${joinKo(items.map(([c]) => escapeHtml(c.ko)))}의 설명에는 공통적으로 ${escapeHtml(jq(`'${label}'`, "이", "가"))} 들어 있어요.</p><ul class="combo-items">${items.map(([c, t]) => `<li><b>${escapeHtml(c.ko)}</b> ${escapeHtml(t)}</li>`).join("")}</ul><p>그래서 ${escapeHtml(scene)}에서 이 조합이 잘 쓰일 수 있어요.</p>`);
      }
    }
    // 함께 높을 때 살펴볼 점 (overuse 공통 태그 — 가능성으로만)
    const O = typeof CCT_OTAGS !== "undefined" ? CCT_OTAGS : {};
    const om = {};
    top3.forEach((c) => (O[c.key] || []).forEach((t, i) => { (om[t] = om[t] || {}); if (!(c.key in om[t])) om[t][c.key] = i; }));
    const ob = Object.entries(om).find(([, m]) => Object.keys(m).length >= 2);
    if (ob) {
      const items = top3.filter((c) => c.key in ob[1]).map((c) => [c, useLine(c.overuse[ob[1][c.key]])]);
      parts.push(`<div class="combo-watch"><b>함께 높을 때 살펴볼 점</b> ${items.map(([c, t]) => `${escapeHtml(c.ko)}: ${escapeHtml(t)}`).join(" / ")} 두 강점이 함께 강하게 쓰이면 이런 모습이 겹쳐 커질 수 있어요. 지금 그렇다는 뜻이 아니라, 강점을 오래 쓸 때 살펴볼 만한 지점이에요.</div>`);
    }
    if (!parts.length) parts.push(`<p>세 강점은 서로 다른 영역에서 나왔어요. 상황에 따라 먼저 쓰이는 강점이 달라질 수 있으니, 아래 표에서 각 강점이 나타나는 모습을 따로 살펴보세요.</p>`);
    return `<div class="combo-analysis">${parts.join("")}</div>`;
  }




  // 관계 페이지 (요청서 13장 A안) — 사람을 '잘 맞음/불편함'으로 나누지 않는다
  function buildRelationStrengthHTML(ranked, comp) {
    const top3 = ranked.slice(0, 3), cp = comp.chosen;
    const useful = [];
    top3.forEach((c) => relIdx(c.key).h.forEach((i) => { const t = c.healthy[i]; if (t && !usedLines.has(t) && useful.length < 4) useful.push([c, useLine(t)]); }));
    const habits = [];
    top3.forEach((c) => ((typeof CCT_REL_OVER !== "undefined" && CCT_REL_OVER[c.key]) || []).forEach((i) => { const t = c.overuse[i]; if (t && !usedLines.has(t) && habits.length < 2) habits.push([c, useLine(t)]); }));
    const balActs = [];
    relIdx(cp.key).a.forEach((i) => { const t = cp.actions[i]; if (t && !usedLines.has(t) && balActs.length < 2) balActs.push(useLine(t)); });
    if (!balActs.length) takeLines(cp.actions, 1).forEach((t) => balActs.push(t));
    const li = (c, t) => `<li>${c ? `<b style="color:${c.hex}">${escapeHtml(c.ko)}</b> ` : ""}${escapeHtml(t)}</li>`;
    let secNo = 0;
    const sec = (no, t, body) => `<div class="rel-sec"><div class="rel-h"><span>${++secNo}</span>${t}</div>${body}</div>`;
    return `
      <div class="rel-wrap">
        ${useful.length ? sec("1", "관계에서 내 강점이 도움이 되는 상황", `<ul class="rel-list">${useful.map(([c, t]) => li(c, t)).join("")}</ul>`) : ""}
        ${habits.length ? sec("2", "강점을 지나치게 쓸 때 살펴볼 소통 습관", `<ul class="rel-list">${habits.map(([c, t]) => li(c, t)).join("")}</ul><p class="rel-note">상대가 겪는 문제를 말하는 것이 아니라, 대화할 때 내가 한 번 살펴볼 만한 습관이에요.</p>`) : ""}
        ${sec("3", "나와 다른 강점을 가진 사람을 이해하는 관점", `<p class="rel-note">CCT는 사람을 '잘 맞는 사람'과 '불편한 사람'으로 나누지 않아요. 같은 상황에서도 사람마다 먼저 쓰는 강점이 다를 뿐이에요.</p><ul class="rel-q"><li>나와 일하는 방식이 다른 사람은 무엇을 먼저 중요하게 여기는지 물어본 적이 있나요?</li><li>상대의 방식이 답답하게 느껴질 때, 그 방식이 잘 맞는 상황은 언제일지 떠올려 볼 수 있나요?</li></ul>`)}
        ${sec("4", `관계에서 균형 컬러 ${escapeHtml(cp.ko)} 써 보기`, `<ul class="rel-list">${balActs.map((t) => li(null, t)).join("")}</ul>`)}
      </div>`;
  }

  function computeDomainScores(scores) {
    return CCT_DOMAINS.map((d) => {
      const vals = d.colors.map((k) => scores[k]);
      return { ...d, value: vals.reduce((a, b) => a + b, 0) / vals.length };
    }).sort((a, b) => b.value - a.value);
  }

  // Replaces the raw 13-color bar list that used to sit at the bottom of the
  // profile/overview page — that page is meant to be a skimmable "profile",
  // and a wall of 13 bars didn't read that way. This condenses the same
  // profile down to what actually matters at a glance (TOP3 + complement,
  // the single highest domain, and the two axis leanings); the full
  // color-by-color bar list still exists, just moved to a dedicated section
  // at the very end of the report (see buildReportBlocks) instead of living
  // here.
  // The four TOP1-3 + complement stat cards. Shared by the PDF's profile page
  // and the on-screen result, so both always show the same four colors.
  function buildQuickCardsHTML(ranked, comp) {
    // Labels say "강점" / "보완 컬러" outright — plain "TOP1/TOP2/TOP3" left
    // readers thinking these were just "my colors" rather than strength colors.
    // A color can be BOTH a TOP3 strength and the complement (~2.5% of results;
    // in 72% of those the alternate candidate is also a top strength, so
    // swapping colors doesn't fix it). Rendering it twice looked like a bug, so
    // the two labels are merged onto one card instead of duplicating it.
    const topKeys = ranked.slice(0, 3).map((c) => c.key);
    const compIsTop = topKeys.indexOf(comp.chosen.key);
    const cards = ranked.slice(0, 3).map((c, i) => ({
      rank: i === compIsTop ? `강점 TOP${i + 1} · 균형` : `강점 TOP${i + 1}`,
      dual: i === compIsTop,
      c,
    }));
    if (compIsTop === -1) cards.push({ rank: "균형 컬러", dual: false, c: comp.chosen });
    return cards
      .map(
        ({ rank, c, dual }) => `
        <div class="quick-card${dual ? " qc-dual" : ""}">
          <div class="qc-rank">${rank}</div>
          <div class="qc-dot" style="background:${c.hex}"></div>
          <div class="qc-name">${escapeHtml(c.ko)}</div>
          <div class="qc-strength">${escapeHtml(c.strength)}</div>
          <div class="qc-score">${c.score.toFixed(1)} / 5.0</div>
        </div>
      `
      )
      .join("");
  }

  // One-paragraph recap that narrates EXACTLY the four cards shown directly
  // above it (TOP1, TOP2, TOP3, complement) and nothing else. It used to talk
  // about the 6대 강점영역 average and the two reference axes instead — numbers
  // that appear nowhere in those cards — which made the paragraph read as if it
  // belonged to a different section. Keep this paragraph tied to the cards:
  // if it mentions a figure, that figure should be visible right above it.
  function buildQuickFactsHTML(ranked, comp, tailText, scores) {
    const t2 = ranked[1], t3 = ranked[2], cp = comp.chosen;
    const nm = (c) => `<b>${escapeHtml(c.ko)} · ${escapeHtml(c.strength)}</b>`;
    const others = ranked[0].score === t2.score ? `` : `${nm(t2)}, ${nm(t3)}도 함께 높게 나타났어요. `;
    return `
      <div class="quick-facts">
        ${distParagraph(ranked)}
        ${others}균형 컬러로는 ${nm(cp)}${josa(cp.strength, "을", "를")} 제안해요. 대표 강점을 더 유연하게 쓰도록 함께 살펴볼 자원이에요.
        ${tailText}
      </div>
      ${scores ? tiePlainHTML(scores, ranked) : ""}
    `;
  }


  function buildProfileQuickSummaryHTML(ranked, comp, scores) {
    return `
      <div class="quick-summary">
        <div class="section-subtitle">한눈에 보는 요약</div>
        <div class="quick-grid">${buildQuickCardsHTML(ranked, comp)}</div>
        ${buildQuickFactsHTML(ranked, comp, '13개 컬러 전체 점수는 리포트 맨 뒤 "컬러별 상세 점수"에서 확인하실 수 있습니다.', scores)}
      </div>
    `;
  }


  // One 13-color score bar. Single source of truth for the row markup: the PDF
  // appendix maps it into an array (so it can chunk 5-per-block across pages),
  // the on-screen panel just joins them all together.
  function buildScoreBarRowHTML(c, i) {
    const pct = Math.max(4, ((c.score - 1) / 4) * 100);
    return `
      <div class="bar-row ${i < 3 ? "is-top" : ""}">
        <div class="label-line">
          <div class="name"><span class="swatch" style="background:${c.hex}"></span>${escapeHtml(c.ko)} · ${escapeHtml(c.strength)}</div>
          <div class="score">${c.score.toFixed(1)} / 5.0</div>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${c.hex}"></div></div>
      </div>
    `;
  }

  // v3test_02: 옛 「관계에서 만나는 컬러」(잘 맞는/불편한 사람 판정)는 삭제 → buildRelationStrengthHTML


  // Side-by-side "at a glance" comparison of the reader's single strongest
  // color against their complement. Straight from the guide data — score, core
  // definition, domain group, a healthy expression and an overuse warning —
  // so the two profiles can be read against each other in one pass instead of
  // being scattered across two separate sections.
  function buildColorCompareTableHTML(top1, comp) {
    const rows = [
      ["점수", `${top1.score.toFixed(1)} / 5.0`, `${comp.score.toFixed(1)} / 5.0`],
      ["핵심 정의", top1.core, comp.core],
      ["속한 강점영역", top1.group, comp.group],
    ];
    const head = (c, role) => `
      <div class="cmp-col-head">
        <div class="cmp-role">${escapeHtml(role)}</div>
        <div class="cmp-name"><span class="cmp-dot" style="background:${c.hex}"></span>${escapeHtml(c.ko)} · ${escapeHtml(c.strength)}</div>
      </div>`;
    const body = rows.map(([label, a, b]) => `
        <div class="cmp-row">
          <div class="cmp-label">${escapeHtml(label)}</div>
          <div class="cmp-val cmp-val-a">${escapeHtml(a)}</div>
          <div class="cmp-val cmp-val-b">${escapeHtml(b)}</div>
        </div>`).join("");
    return `
      <div class="cmp-table">
        <div class="cmp-row cmp-header">
          <div class="cmp-label"></div>
          <div class="cmp-val">${head(top1, "강점 컬러")}</div>
          <div class="cmp-val">${head(comp, "균형 컬러")}</div>
        </div>
        ${body}
      </div>
    `;
  }


  // ---------- 강점 컬러 × 보완 컬러의 균형 ----------
  // Pairs the reader's single strongest color with their complement and spells
  // out what the two produce together. Every sentence is assembled from fields
  // that already exist for those two colors in the guide data (core / healthy /
  // overuse / actions / growthQuestion) — this section introduces no new
  // psychological claim of its own, it just puts the existing two profiles
  // side by side and names the trade they make.
  function buildStrengthBalanceHTML(top1, comp) {
    const L = balLink(top1.key, comp.key);
    const scenes = L ? L.scenes : [];
    const body = scenes.length
      ? `<div class="syn-scenes">${scenes.map(([w, t]) => `<div class="syn-scene"><div class="syn-when">${escapeHtml(w)}</div><div class="syn-what">${escapeHtml(t)}</div></div>`).join("")}</div>`
      : `<p class="syn-text">두 강점을 함께 쓰는 장면은 '균형 컬러' 쪽의 활용 방법을 참고해 주세요.</p>`;
    return `
      <div class="syn-wrap">
        <div class="syn-row">
          <div class="syn-label">이럴 때 두 자원을 함께 써 보세요</div>
          ${body}
        </div>
      </div>
    `;
  }


  // Radar/spider chart of all 13 colors (SVG shapes only — labels are absolutely
  // positioned HTML so html2canvas renders the Korean text reliably).
  function buildRadarChartHTML(scores) {
    const n = CCT_COLORS.length;
    const maxR = 100;
    const labelR = maxR + 22;
    const textPad = 56;
    const half = labelR + textPad;
    const W = half * 2, H = half * 2;
    const cx = half, cy = half;
    const angleStep = (2 * Math.PI) / n;
    const levels = 4;

    function pt(i, frac) {
      const angle = -Math.PI / 2 + i * angleStep;
      const r = frac * maxR;
      return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
    }

    let gridPolys = "";
    for (let l = 1; l <= levels; l++) {
      const frac = l / levels;
      const pts = CCT_COLORS.map((c, i) => pt(i, frac).join(",")).join(" ");
      gridPolys += `<polygon points="${pts}" fill="none" stroke="#e7e5ec" stroke-width="1"/>`;
    }
    let axisLines = "";
    CCT_COLORS.forEach((c, i) => {
      const [x, y] = pt(i, 1);
      axisLines += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e7e5ec" stroke-width="1"/>`;
    });

    const dataPts = CCT_COLORS.map((c, i) => {
      const frac = Math.max(0.04, Math.min(1, (scores[c.key] - 1) / 4));
      return pt(i, frac);
    });
    const dataPolygon = dataPts.map((p) => p.join(",")).join(" ");
    const dots = CCT_COLORS.map((c, i) => {
      const [x, y] = dataPts[i];
      return `<circle cx="${x}" cy="${y}" r="3.4" fill="${c.hex}" stroke="#fff" stroke-width="1.2"/>`;
    }).join("");

    const labels = CCT_COLORS.map((c, i) => {
      const [x, y] = pt(i, labelR / maxR);
      const dx = x - cx;
      let justify = "center", translateX = "-50%";
      if (dx < -6) { justify = "flex-end"; translateX = "-100%"; }
      else if (dx > 6) { justify = "flex-start"; translateX = "0%"; }
      return `<div class="radar-label" style="left:${x}px;top:${y}px;transform:translate(${translateX},-50%);justify-content:${justify}">
        <span class="radar-label-name">${escapeHtml(c.ko)}</span><span class="radar-label-score">${scores[c.key].toFixed(1)}</span>
      </div>`;
    }).join("");

    return `
      <div class="radar-wrap" style="width:${W}px;height:${H}px;">
        <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
          ${gridPolys}
          ${axisLines}
          <polygon points="${dataPolygon}" fill="rgba(77,90,158,0.16)" stroke="#4D5A9E" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
          ${dots}
        </svg>
        ${labels}
      </div>
    `;
  }

  // Strength / complement summary card (mirrors the "강점지능·약점지능" style
  // reference the user shared — but per the CCT guide's ipsative framing we
  // always call the lower end "보완 컬러" (growth resource), never "약점"/weakness).
  //
  // IMPORTANT: "보완 컬러" here is the SAME color as the deep-dive section below
  // (comp.chosen, from getComplement()/CCT_COMPLEMENT_MAP) — a pre-designed
  // theoretical counterpart to the TOP1 strength (CCT 해석 가이드 5장 표), NOT
  // simply whichever of the 13 colors scored lowest. Keeping this card and the
  // deep-dive section pointing at the same color avoids the report naming two
  // different colors "보완 컬러" in two places.
  function buildProfileSummaryHTML(ranked, top1, comp) {
    const top = ranked.slice(0, 2);
    const topNames = top.map((c) => `${c.ko} · ${c.strength}`).join(", ");
    const topText = `현재 13개 컬러 중 ${top.map((c) => c.ko).join("·")}${josa(top[top.length - 1].ko, "이", "가")} 상대적으로 높게 나타났습니다. ${top.map((c) => c.core).join(", ")} 등을 일상에서 비교적 자연스럽게 활용하고 있는 것으로 보입니다.`;
    const cp = comp.chosen;
    const compText = `${top1.ko}(${top1.strength})의 강점을 더 유연하게 쓰도록 함께 살펴볼 자원이에요. 왜 ${jq(cp.ko, "이", "가")} 제안되었는지, 어떻게 써 볼 수 있는지는 '균형 컬러' 쪽에서 설명해요.`;
    return `
      <div class="rp-summary-card">
        <div class="rp-summary-row is-strength">
          <div class="rp-summary-label">강점 컬러</div>
          <div class="rp-summary-body">
            <h4>${escapeHtml(topNames)}</h4>
            <p>${escapeHtml(topText)}</p>
          </div>
        </div>
        <div class="rp-summary-row is-growth">
          <div class="rp-summary-label">균형 컬러</div>
          <div class="rp-summary-body">
            <h4>${escapeHtml(`${cp.ko} · ${cp.strength}`)}</h4>
            <p>${escapeHtml(compText)}</p>
          </div>
        </div>
      </div>
    `;
  }


  // Explains WHY this specific color was chosen as the complement — the
  // psychological rationale behind the pre-designed pairing, not a "your
  // lowest score" statement. Built from each color's own `core` description so
  // every TOP1×complement combination gets its own coherent contrast, rather
  // than one generic boilerplate sentence.



  // ---------- TOP3 comparison + growth-focused complement + action guide ----------
  // Enneagram-style comparative structure: instead of narrating all 13 colors in
  // full, we compare the top 3 strength colors side by side, give the single
  // complement color its own deep-dive growth section, then close with concrete,
  // actionable guidance. (Full 13-color scores still appear as compact charts —
  // bar chart / domain grid / axis cards — further down, just not as 13 separate
  // narrative cards.)
  function buildComboTypeName(ranked) {
    return ranked.slice(0, 3).map((c) => c.ko).join(" · ") + " 조합";
  }




  function buildTop3CompareHTML(ranked) {
    const top3 = ranked.slice(0, 3);
    const combo = buildComboAnalysisHTML(ranked);
    const rows = top3.map((c, i) => {
      const items = takeLines(c.healthy, 2, relIdx(c.key).h).map((h) => `<li>${escapeHtml(h)}</li>`).join("");
      return `
          <tr>
            <td class="ct-color"><span class="ct-swatch" style="background:${c.hex}"></span>TOP${i + 1} · ${escapeHtml(c.ko)}<br/><small>${f1(c.score)}</small></td>
            <td class="ct-strength">${escapeHtml(c.strength)}<br/><small>${escapeHtml(c.core)}</small></td>
            <td><ul>${items}</ul></td>
          </tr>`;
    }).join("");
    const adj = ranked.slice(3, 5);
    let adjacentNote = "";
    if (adj.length) {
      const same = adj.filter((c) => c.score === top3[2].score);
      adjacentNote = same.length
        ? `<div class="ct-adjacent">4~5위 ${adj.map((c) => `${escapeHtml(c.ko)}(${f1(c.score)}점)`).join(", ")} 가운데 ${joinKo(same.map((c) => escapeHtml(c.ko)))}${josa(same[same.length - 1].ko, "은", "는")} TOP3와 같은 점수예요. 순서 규칙으로 TOP3 밖에 놓였을 뿐, 함께 높은 강점으로 보셔도 돼요.</div>`
        : `<div class="ct-adjacent">4~5위는 ${adj.map((c) => `${escapeHtml(c.ko)}(${f1(c.score)}점)`).join(", ")}이에요. TOP3와 점수 차이가 크지 않다면 상황에 따라 함께 나타날 수 있는 강점이니 참고해 보세요.</div>`;
    }
    return `
      <div class="ct-headline">${escapeHtml(buildComboTypeName(ranked))}</div>
      ${combo}
      <table class="compare-table">
        <thead><tr><th>컬러</th><th>핵심 강점</th><th>이런 모습으로 나타날 수 있어요</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${adjacentNote}`;
  }

  function buildActionGuideHTML(ranked, comp, scores) {
    const top3 = ranked.slice(0, 3);
    // 과사용을 다루는 처방 문장(remedy)은 경고 카드에서 같은 컬러의 조절 방법으로 쓰고, 활용법에서는 뺀다
    const topActionsHtml = top3.map((c, i) => {
      const items = takeLines(c.actions, 3, remedyIdx(c.key).concat(relIdx(c.key).a)).map((a) => `<li>${escapeHtml(a)}</li>`).join("");
      return `
          <div class="ag-item">
            <div class="ag-item-label" style="color:${c.hex}">TOP${i + 1} · ${escapeHtml(c.ko)} · ${escapeHtml(c.strength)}</div>
            <ul>${items}</ul>
          </div>`;
    }).join("");
    const warnCards = top3.map((c, i) => {
      const overs = c.overuse.map((o, n) => [o, n]).filter(([o]) => !usedLines.has(o));
      const items = overs.map(([o]) => `<li>${escapeHtml(useLine(o))}</li>`).join("");
      const rem = (typeof CCT_REMEDY !== "undefined" && CCT_REMEDY[c.key]) || [];
      const ri = overs.map(([, n]) => rem[n]).find((x) => x != null && !usedLines.has(c.actions[x]));
      const balance = ri != null ? `조절이 필요할 때는 — ${escapeHtml(useLine(c.actions[ri]))}` : "";
      if (!items && !balance) return "";
      return `
          <div class="ag-warn-card">
            <div class="ag-warn-head">
              <span class="ag-warn-tag" style="background:${c.hex};color:${getContrastText(c.hex)}">TOP${i + 1} · ${escapeHtml(c.ko)}</span>
              <span class="ag-warn-strength">${escapeHtml(c.strength)}</span>
            </div>
            ${items ? `<ul class="ag-warn-list">${items}</ul>` : ""}
            ${balance ? `<div class="ag-warn-balance">${balance}</div>` : ""}
          </div>`;
    }).join("");
    const checkItems = top3.map((c) => `
        <div class="ag-check">
          <div class="ag-check-tag" style="background:${c.hex};color:${getContrastText(c.hex)}">${escapeHtml(c.ko)}</div>
          <div class="ag-check-q">${escapeHtml(c.growthQuestion)}</div>
        </div>`).join("");
    const mission = [
      ...takeLines(top3[0].actions, 1, relIdx(top3[0].key).a),
      ...takeLines(top3[1].actions, 1, relIdx(top3[1].key).a),
      ...takeLines(comp.chosen.actions, 1, relIdx(comp.chosen.key).a),
      "이번 주에 해 본 것 가운데 가장 도움이 된 한 가지를 짧게 기록해 보세요.",
    ];
    const missionItems = mission.map((m) => `<li>${escapeHtml(m)}</li>`).join("");
    return buildActionGuideBlocks(topActionsHtml, warnCards, checkItems, missionItems).join("");
  }


  // Same content as buildActionGuideHTML, handed back as two page-sized pieces.
  // One combined block measured 275mm against a 261mm usable page, so its tail
  // (이번 주 실천 미션) was being clipped off the sheet.
  function buildActionGuidePartsHTML(ranked, comp, scores) {
    const html = buildActionGuideHTML(ranked, comp, scores);
    const marker = '<div class="ag-block">';
    const pieces = html.split(marker).filter((x) => x.trim()).map((x) => marker + x);
    if (pieces.length < 4) return [html, ""];
    return [pieces.slice(0, 2).join(""), pieces.slice(2).join("")];
  }

  function buildActionGuideBlocks(topActionsHtml, warnCards, checkItems, missionItems) {
    return [`
      <div class="ag-block">
        <div class="section-subtitle">TOP 3 강점 활용법</div>
        <p class="section-desc">각 강점이 실제로 힘을 발휘하는 구체적인 장면입니다.</p>
        <div class="ag-grid">${topActionsHtml}</div>
      </div>
      <div class="ag-block">
        <div class="section-subtitle">과사용 경고 신호 체크리스트</div>
        <p class="section-desc">강점도 지나치게 쓰이면 부담으로 작동할 수 있습니다. 아래 신호가 반복된다면 잠시 속도를 조절해볼 시점입니다.</p>
        <div class="ag-warn-grid">${warnCards}</div>
      </div>
      <div class="ag-block">
        <div class="section-subtitle">스스로 점검하는 질문</div>
        <p class="section-desc">판단이 어려운 순간에 아래 질문을 꺼내보면, 지금 강점을 잘 쓰고 있는지 스스로 가늠할 수 있습니다.</p>
        <div class="ag-checks">${checkItems}</div>
      </div>
      <div class="ag-block">
        <div class="section-subtitle">이번 주 실천 미션</div>
        <div class="ag-mission"><ul>${missionItems}</ul></div>
      </div>
    `];
  }

  // Extra, personalized context for the TOP3 comparison page: where the trio
  // collectively leans on the two reference axes (using the SAME CCT_AXES data
  // as the retired "보조 성향축" cards did), plus a few concrete scenarios
  // where the combination tends to shine. Purely descriptive/informational —
  // never prescriptive or diagnostic.
  function buildTop3SynergyHTML(ranked) {
    const top3 = ranked.slice(0, 3);
    const [t1, t2, t3] = top3;

    // Name the colors rather than counting them — "2개 컬러가 협력 쪽" told the
    // reader nothing about WHICH of their strengths pulls that way.
    const swatchName = (c) =>
      `<b style="color:${c.hex}">${escapeHtml(c.ko)}</b>`;
    const axisNotes = [];
    Object.values(CCT_AXES).forEach((axis) => {
      const leftHits = top3.filter((c) => axis.left.colors.includes(c.key));
      const rightHits = top3.filter((c) => axis.right.colors.includes(c.key));
      const write = (hits, side) =>
        `${hits.map(swatchName).join("과 ")}${josa(hits[hits.length - 1].ko, "이", "가")} '${escapeHtml(
          side.name
        )}' 쪽에 속해, ${escapeHtml(axis.label)} 축에서 ${escapeHtml(side.name)} 지향이 뚜렷한 조합입니다.`;
      if (leftHits.length >= 2 && leftHits.length > rightHits.length) {
        axisNotes.push(write(leftHits, axis.left));
      } else if (rightHits.length >= 2 && rightHits.length > leftHits.length) {
        axisNotes.push(write(rightHits, axis.right));
      }
    });


    return `
      ${
        axisNotes.length
          ? `
        <div class="t3-synergy-block">
          <div class="section-subtitle">이 조합의 종합 성향</div>
          <div class="t3-axis-notes">${axisNotes.map((n) => `<p>${n}</p>`).join("")}</div>
        </div>
      `
          : ""
      }
    `;
  }

  // Venn-style infographic pairing the TOP1 strength color with the complement
  // color — a quick visual anchor for "these two work together" before the
  // written rationale. Labels are absolutely-positioned HTML (not SVG <text>)
  // for the same reason as the radar chart: html2canvas renders Korean text
  // through real DOM/CSS far more reliably than through SVG <text> nodes.
  function buildSynergyVennHTML(top1, compColor) {
    const R = 88;
    const D = 96; // distance between circle centers — controls overlap size
    const W = 340,
      H = 200;
    const leftCx = W / 2 - D / 2,
      rightCx = W / 2 + D / 2,
      cy = H / 2;
    const leftInk = getContrastText(top1.hex);
    const rightInk = getContrastText(compColor.hex);

    return `
      <div class="synergy-venn-wrap" style="width:${W}px;height:${H}px;">
        <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
          <circle cx="${leftCx}" cy="${cy}" r="${R}" fill="${top1.hex}" opacity="0.9" stroke="#ffffff" stroke-width="2" stroke-opacity="0.55"/>
          <circle cx="${rightCx}" cy="${cy}" r="${R}" fill="${compColor.hex}" opacity="0.9" stroke="#ffffff" stroke-width="2" stroke-opacity="0.55"/>
        </svg>
        <div class="synergy-label synergy-label-left" style="left:${leftCx - R * 0.42}px;top:${cy}px;color:${leftInk}">
          <div class="synergy-tag">강점 컬러</div>
          <div class="synergy-name">${escapeHtml(top1.ko)}</div>
          <div class="synergy-sub">${escapeHtml(top1.strength)}</div>
        </div>
        <div class="synergy-label synergy-label-right" style="left:${rightCx + R * 0.42}px;top:${cy}px;color:${rightInk}">
          <div class="synergy-tag">균형 컬러</div>
          <div class="synergy-name">${escapeHtml(compColor.ko)}</div>
          <div class="synergy-sub">${escapeHtml(compColor.strength)}</div>
        </div>
        <div class="synergy-mid-wrap" style="left:${(leftCx + rightCx) / 2}px;top:${cy}px;">
          <div class="synergy-mid-ring"></div>
          <div class="synergy-mid-badge"><div class="synergy-mid-text">균형<br/>포인트</div></div>
        </div>
      </div>
    `;
  }

  // Fills the leftover whitespace under the TOP3 comparison + synergy content
  // with a compact, more visual "who am I" breakdown — one line per TOP color
  // framed as an identity statement (not just a strength label), plus a short
  // closing line tying all three together. `core` fields in data.js are all
  // phrased as "...하는 힘" (a noun phrase ending in "힘"), which reads
  // naturally as "...하는 사람" once the trailing "힘" is swapped for "사람".
  function buildTop3PersonaHTML(ranked) {
    const top3 = ranked.slice(0, 3);
    const items = top3.map((c, i) => {
      const ev = takeLines(c.healthy, 1, relIdx(c.key).h)[0] || "";
      return `
          <div class="persona-item">
            <div class="persona-num" style="background:${c.hex};color:${getContrastText(c.hex)}">${i + 1}</div>
            <div class="persona-body">
              <div class="persona-head"><span class="persona-name" style="color:${c.hex}">${escapeHtml(c.ko)} · ${escapeHtml(c.strength)}</span></div>
              <p class="persona-text"><b>${escapeHtml(jq(c.core, "이", "가"))}</b> 상대적으로 잘 드러나요. ${escapeHtml(ev)}</p>
            </div>
          </div>`;
    }).join("");
    return `
      <div class="t3-persona-block">
        <div class="section-subtitle">컬러로 본 나의 장점</div>
        <div class="persona-grid">${items}</div>
      </div>
    `;
  }


  // Builds the report as an ARRAY of independent { html, flexible } blocks (not one
  // giant string). Each block is rendered to its own canvas and placed on the PDF
  // page as a whole, so a card/paragraph is never sliced across a page break.
  //
  // "flexible: true" marks supplementary blocks (score chart chunks, domain grid,
  // axis cards) that generatePdf() is allowed to pull out of order into a leftover
  // page gap so pages don't end with large blank space. "flexible: false" (rigid)
  // blocks — the cover, the overview, each of the 13 color profile cards, the combo
  // read, and the disclaimer — always stay in their original relative order.
  // 컬러리딩 단독 PDF: 표지 + 컬러리딩 페이지
  function buildReadingOnlyBlocks(name) {
    const dateStr = new Date().toLocaleString("ko-KR", {
      year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const reading = window.CR.buildReading(window.CR.getSelection(), name);
    const blocks = [{
      html: `
        <div class="rp-cover">
          <div class="rp-kicker">LOVELIVE COLOR INSIGHT · COLOR PSYCHOLOGY READING</div>
          <div class="rp-title">${name ? escapeHtml(name) + "님의 " : ""}컬러 심리리딩 결과 리포트</div>
          <div class="rp-swatchbar">${window.CR.colors.map((c) => `<span style="${window.CR.swatchBg(c.key)}"></span>`).join("")}</div>
          <div class="rp-date">검사 일시 · ${dateStr}</div>
        </div>`,
      flexible: false, pageBreakBefore: false,
    }];
    window.CR.buildPdfBlocks(reading, { standalone: true }).forEach((b) => {
      blocks.push({ html: b.html, flexible: false, pageBreakBefore: !!b.pageBreakBefore });
    });
    return blocks;
  }

  function buildReportBlocks(scores, ranked, name) {
    if (LECTURE_EDITION && mode === "cr") return buildReadingOnlyBlocks(name);
    const blocks = [];
    const rigid = (html) => blocks.push({ html, flexible: false, pageBreakBefore: false });
    // Like rigid(), but forces a fresh page before this block even if the
    // current page has room left — used to keep "보완 컬러 심층 분석" from
    // starting mid-page right under the TOP3 comparison section.
    const rigidBreak = (html) => blocks.push({ html, flexible: false, pageBreakBefore: true });
    const flexible = (html) => blocks.push({ html, flexible: true, pageBreakBefore: false });

    const top1 = ranked[0];
    const comp = getComplement(top1.key, scores, ranked);
    resetUsed();
    const dateStr = new Date().toLocaleString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    rigid(`
      <div class="rp-cover">
        <div class="rp-kicker">${hasReading() ? "LOVELIVE COLOR INSIGHT · 컬러 심리리딩 + CCT" : "CCT COLOR CHARACTER STRENGTHS TEST"}</div>
        <div class="rp-title">${name ? escapeHtml(name) + "님의 " : ""}${hasReading() ? "나를 읽는 두 가지 컬러 리포트" : "컬러 성격강점 결과 리포트"}</div>
        ${hasReading() ? `<div class="rp-parts">
          <div><b>PART 1</b><strong>컬러 심리리딩</strong><span>직감으로 고른 다섯 컬러로 본 지금의 나</span></div>
          <div><b>PART 2</b><strong>CCT 컬러 성격강점</strong><span>65문항으로 본 평소 나의 강점</span></div>
        </div>` : ""}
        <div class="rp-swatchbar">${CCT_COLORS.map((c) => `<span style="background:${c.hex}"></span>`).join("")}</div>
        <div class="rp-date">검사 일시 · ${dateStr}</div>
      </div>
    `);

    // 강의용: 표지 바로 아래에서 컬러리딩(PART 1)이 시작되고, CCT(PART 2)는
    // 새 페이지에서 시작합니다.
    let crBlocks = [];
    if (hasReading()) {
      const reading = window.CR.buildReading(window.CR.getSelection(), name);
      crBlocks = window.CR.buildPdfBlocks(reading);
      crBlocks.forEach((b) => (b.pageBreakBefore ? rigidBreak(b.html) : rigid(b.html)));
    }

    let overviewBlock = `${crBlocks.length ? `<div class="ra-part">PART 2 · CCT 컬러 성격강점</div>` : ""}<div class="section-title">13 컬러 전체 프로파일</div>`;
    overviewBlock += `<div class="section-desc">13개 컬러 점수를 한눈에 보여주는 전체 프로파일입니다. 점수는 5점 만점 리커트 평균이며, 본인의 13개 컬러 내부에서 상대적으로 높은 컬러를 중심으로 해석합니다.</div>`;
    overviewBlock += `<div class="rp-overview">`;
    overviewBlock += `<div class="rp-radar-card">${buildRadarChartHTML(scores)}</div>`;
    overviewBlock += buildProfileSummaryHTML(ranked, top1, comp);
    overviewBlock += `</div>`;
    // A skimmable "at a glance" recap (TOP3 + complement cards, top domain,
    // axis leanings) fills the spot the raw 13-color bar list used to sit in —
    // that list now lives in its own section at the very end of the report
    // (see the "컬러별 상세 점수" rigid block below, near the disclaimer).
    overviewBlock += buildProfileQuickSummaryHTML(ranked, comp, scores);
    if (crBlocks.length) rigidBreak(overviewBlock);
    else rigid(overviewBlock);

    // TOP3 comparison (Enneagram-style comparative summary): compares the top 3
    // strength colors side by side, plus additional context (collective axis
    // tilt, scenarios where the combo shines) to make good use of the page.
    // Split rather than one monolith: with longer per-color text this section
    // grew past a single page (measured 285mm against a 261mm usable height) and
    // its tail was clipped. Two rigid halves each fit comfortably.
    rigid(`<div class="section-title">TOP 3 강점 컬러 비교</div>${buildTop3CompareHTML(ranked)}${buildTop3SynergyHTML(ranked)}`);
    rigid(buildTop3PersonaHTML(ranked));

    // The complement color gets its own growth-focused deep dive (healthy/overuse,
    // example usage, growth question) — reusing the same intro/detail split as
    // before so the page-fill pass can still place the two halves independently.
    // rigidBreak() forces this to start on a fresh page rather than continuing
    // wherever the TOP3 comparison page happened to leave off.
    // ONE rigid block: title + rationale + the color card's intro AND detail
    // halves together. Previously the detail half ("건강할 때 / 과도할 때 /
    // 예시") was a separate block and reliably spilled onto the next page,
    // leaving the card cut off right after its "이 강점이 드러나는 모습"
    // heading. The Venn diagram that used to sit here moved to the synergy
    // section below, which is what freed the vertical room for this to fit.
    // Two halves again — as one block this measured 285mm on longer profiles.
    // 균형 컬러 (요청서 9장): ① 주요 강점 ② 지나치게 쓰일 때 ③ 왜 이 균형컬러인가 ④ 일상 활용
    rigidBreak(
      `<div class="section-title">균형 컬러</div><p class="section-desc">${escapeHtml(BAL_DEF)}</p>${colorSectionHeroHTML(comp.chosen, "균형 컬러 · 함께 써 볼 자원")}${buildBalanceGuideHTML(ranked, comp, scores)}`
    );
    // 관계 페이지에 쓸 문장을 먼저 정해 둔다(실전 지침과 겹치지 않게) — 배치는 아래 원래 순서대로
    const relHtml = ranked.length >= 2 ? buildRelationStrengthHTML(ranked, comp) : "";

    // Concrete, actionable guidance: how to use the TOP3 strengths, warning signs
    // of overuse, and a short weekly practice checklist.
    // Each of these three owns a full page from here on, per the report layout:
    // 실전 지침 → 시너지 → 관계 → 6대 강점영역 → 점수 부록.
    const actionParts = buildActionGuidePartsHTML(ranked, comp, scores);
    rigidBreak(`<div class="section-title">실전 지침</div>${actionParts[0]}`);
    rigid(actionParts[1]);

    // ---- Flexible supplementary section (domains / axes) ----
    // Split into small chunks so generatePdf() can slot them into whatever
    // leftover page space the rigid sections above leave behind. The raw
    // 13-color score bars used to be flexible chunks defined alongside these,
    // which meant they could get pulled into the gap between the complement
    // intro and its own detail half (or after the action guide), interrupting
    // an unrelated section mid-flow — see the dedicated rigid appendix near
    // the end of this function for where that list lives now.
    const domainScores = computeDomainScores(scores);
    let domainBlock = `<div class="section-title">6대 강점영역</div>`;
    domainBlock += `<div class="section-desc">CCT에서는 13개의 컬러강점을 해석의 편의를 위해 6개의 강점영역으로 분류합니다. 개별 컬러 점수와 함께 참고용으로 보시면 됩니다.</div>`;
    domainBlock += `<div class="domain-grid">`;
    domainScores.forEach((d) => {
      const pct = Math.max(4, ((d.value - 1) / 4) * 100);
      domainBlock += `
        <div class="domain-row">
          <div class="dname">${d.name}</div>
          <div class="dtrack"><div class="dfill" style="width:${pct}%"></div></div>
          <div class="dscore">${d.value.toFixed(1)}</div>
        </div>
      `;
    });
    domainBlock += `</div>`;
    // Each domain's meaning (CCT_DOMAINS.desc) plus the individual colors that
    // were averaged to produce its bar above, each with its own score. That
    // second part matters: a domain average alone can look flat while hiding a
    // big spread between its member colors, and this makes the composition
    // visible without flipping to the appendix. Two-column card grid so this
    // fills the page it sits on rather than trailing off half way down.
    domainBlock += `<div class="domain-legend">`;
    domainBlock += `<div class="dl-heading">각 영역의 의미와 구성 컬러</div>`;
    domainBlock += `<div class="dl-grid">`;
    domainScores.forEach((d) => {
      const chips = d.colors
        .map((k) => {
          const c = cctColorByKey(k);
          return `
            <div class="dl-chip">
              <span class="dl-dot" style="background:${c.hex}"></span>
              <span class="dl-chip-name">${escapeHtml(c.ko)} · ${escapeHtml(c.strength)}</span>
              <span class="dl-chip-score">${scores[k].toFixed(1)}</span>
            </div>`;
        })
        .join("");
      // A domain average can hide a wide spread between its member colors — e.g.
      // 3.6 and 2.0 average to a flat-looking 2.8. Say so explicitly rather than
      // letting the single bar above imply the whole area sits at one level.
      const memberScores = d.colors.map((k) => scores[k]);
      const hi = Math.max(...memberScores);
      const lo = Math.min(...memberScores);
      const spread = Math.round((hi - lo) * 10) / 10;
      let readNote;
      if (d.colors.length === 1) {
        readNote = `이 영역은 ${escapeHtml(
          cctColorByKey(d.colors[0]).ko
        )} 한 컬러로만 구성되어, 영역 점수가 곧 해당 컬러의 점수입니다.`;
      } else if (spread >= 1.0) {
        readNote = `구성 컬러 간 점수 차이가 ${spread.toFixed(
          1
        )}점으로 큰 편입니다. 평균값보다 위의 개별 컬러 점수를 함께 보시는 것이 정확합니다.`;
      } else {
        readNote = `구성 컬러들이 비슷한 수준으로 나타나, 평균값이 이 영역 전체를 잘 대표합니다.`;
      }

      domainBlock += `
        <div class="dl-card">
          <div class="dl-card-head">
            <div class="dl-name">${escapeHtml(d.name)}</div>
            <div class="dl-score">${d.value.toFixed(1)}</div>
          </div>
          <div class="dl-desc">${escapeHtml(d.desc)}</div>
          <div class="dl-chips">${chips}</div>
          <div class="dl-note">${readNote}</div>
        </div>
      `;
    });
    domainBlock += `</div></div>`;
    // NOT emitted here — this block now rides along on the score-appendix page
    // (see rigidBreak below), directly above "컬러별 상세 점수", because the two
    // are both reference tables and read better together at the back.

    // Rigid so the Venn, the comparison table and the three explanation rows
    // can never be split across a page. This is where the Venn diagram lives
    // now — it belongs with the comparison rather than above the complement
    // card, and moving it is what let the complement section fit one page.
    rigidBreak(`
      <div class="section-title">강점 컬러와 균형 컬러</div>
      <p class="section-desc">가장 높은 강점과 균형 컬러를 나란히 놓고, 두 자원을 함께 써 볼 수 있는 장면을 정리했어요. 균형 후보는 초기 이론적 후보표에 따른 것이에요.</p>
      ${buildSynergyVennHTML(top1, comp.chosen)}
      ${buildColorCompareTableHTML(ranked[0], comp.chosen)}
    `);
    rigid(buildStrengthBalanceHTML(ranked[0], comp.chosen));

    if (ranked.length >= 2) {
      // These boxes are about OTHER PEOPLE — whoever has those colors as their
      // strengths — not about more of the reader's own colors.
      rigidBreak(`
        <div class="section-title">나의 강점이 관계에서 나타나는 방식</div>
        <p class="section-desc">특정 컬러의 사람과 잘 맞는지, 불편한지를 정하지 않아요. 내 강점이 사람들과 함께할 때 어떻게 쓰이는지와, 함께 살펴보면 좋은 점을 정리했어요.</p>
        ${relHtml}
      `);
    }

    // 6대 강점영역 + the meaning of each domain, as a page of its own directly
    // before the raw score appendix.
    rigidBreak(domainBlock);

    // Full color-by-color score list, as its own dedicated appendix at the very
    // end of the report (rigid, not flexible — so unlike before, it can never
    // get pulled forward to patch a gap in an earlier section). The profile
    // page up front now shows the condensed "한눈에 보는 요약" instead; this is
    // for anyone who wants every raw number. rigidBreak() on the first chunk
    // forces this appendix to always start on its own fresh page rather than
    // tacking onto whatever room the preceding section happened to leave behind.
    const barRowsHtml = ranked.map((c, i) => buildScoreBarRowHTML(c, i));
    const CHUNK = 5;
    for (let i = 0; i < barRowsHtml.length; i += CHUNK) {
      const chunk = barRowsHtml.slice(i, i + CHUNK).join("");
      let html = i === 0 ? `<div class="section-title">컬러별 상세 점수 (13개 전체)</div>` : "";
      html += `<div class="bar-chart">${chunk}</div>`;
      if (i === 0) {
        // Fresh page: 6대 강점영역 + its legend own the page before this one.
        rigidBreak(html);
      } else {
        rigid(html);
      }
    }

    rigid(`
      <div class="disclaimer">
        <b>해석 고지</b><br/>
        CCT 결과는 개인의 현재 자기보고를 기반으로 한 성격강점 프로파일입니다. 상황·환경·역할 및 시기에 따라 결과는 달라질 수 있습니다.
        본 결과는 정신건강 문제나 성격장애를 진단하기 위한 자료가 아니며, 자기이해·교육·코칭을 위한 참고자료로 활용하는 것을 권장합니다.
      </div>
    `);

    return blocks;
  }

  // Page geometry (mm) — margins are applied here, not inside the rendered blocks,
  // so a block's own canvas is pure content and can be placed anywhere on the page.
  const PDF_PAGE_W = 210;
  const PDF_PAGE_H = 297;
  const PDF_MARGIN_X = 16;
  const PDF_MARGIN_TOP = 18;
  const PDF_MARGIN_BOTTOM = 18;
  const PDF_BLOCK_GAP = 5;
  const PDF_CONTENT_W = PDF_PAGE_W - PDF_MARGIN_X * 2;

  // Builds the jsPDF document in-memory (no download, no button/UI side effects)
  // and returns { doc, fileName, pdfBase64 }. Used by both the v1 download
  // button and the background admin-logging call, so the actual heavy
  // html2canvas rendering only ever runs once per completed test (see
  // getPdfDoc's caching below).
  // ---------- 휴대폰 '글자 자동 확대' 감지 · 격리 렌더링 (2026-10-08) ----------
  // ④ 감지: 보이지 않는 곳에 PDF와 같은 너비(760px)의 긴 문단과, 화면보다 좁은 짧은 문장을 두고
  //    같은 글자의 실제 폭을 비교합니다. 넓은 문단 쪽만 커져 있으면 자동 확대가 일어난 것입니다.
  // ⑤ 격리: 확대가 감지되면 PDF를 화면 속 별도 창(iframe, 화면 기준 너비 = PDF 너비)에서 그립니다.
  // ⑥ 안내: 그래도 커져 있으면 크롬 등에서 열어 저장하도록 안내하고, 시트 "버전" 열에 기록합니다.
  const BOOST_LIMIT = 1.08;
  const BOOST_SAMPLE = "가나다라마바사아자차카타파하";
  function measureTextBoost(doc) {
    doc = doc || document;
    let wrap = null, narrow = null;
    try {
      wrap = doc.createElement("div");
      wrap.className = "pdf-report";
      wrap.setAttribute("aria-hidden", "true");
      wrap.style.webkitTextSizeAdjust = "none";
      wrap.style.textSizeAdjust = "none";
      wrap.style.maxHeight = "1000000px";
      const longText = "자신의 판단과 능력을 믿고 선택하는 힘이 지금의 나를 이끄는 중심축으로 나타났습니다. ".repeat(12);
      wrap.innerHTML = `<p style="font-size:13px;line-height:1.6;margin:0">${longText}<span class="bp-a" style="white-space:nowrap">${BOOST_SAMPLE}</span></p>`;
      narrow = doc.createElement("div");
      narrow.className = "pdf-report";
      narrow.setAttribute("aria-hidden", "true");
      narrow.style.cssText = "width:150px;max-height:200px;overflow:hidden";
      narrow.innerHTML = `<p style="font-size:13px;line-height:1.6;margin:0"><span class="bp-b" style="white-space:nowrap">${BOOST_SAMPLE}</span></p>`;
      doc.body.appendChild(wrap);
      doc.body.appendChild(narrow);
      const a = wrap.querySelector(".bp-a").getBoundingClientRect().width;
      const b = narrow.querySelector(".bp-b").getBoundingClientRect().width;
      const fs = parseFloat(doc.defaultView.getComputedStyle(wrap.querySelector("p")).fontSize) || 13;
      const r = Math.max(b > 0 ? a / b : 1, fs / 13);
      return Math.round(r * 100) / 100;
    } catch (e) {
      return 1;
    } finally {
      if (wrap) wrap.remove();
      if (narrow) narrow.remove();
    }
  }

  // PDF를 그릴 별도 창(같은 주소, 화면에는 보이지 않음). 이 창의 화면 기준 너비는 800px이라
  // 760px 문단이 '화면보다 넓은 문단'이 되지 않습니다.
  async function createIsolatedPdfHost() {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    iframe.style.cssText = "position:fixed;left:-12000px;top:0;width:800px;height:1200px;border:0;opacity:0;pointer-events:none";
    const cssHref = new URL("css/style.css", document.baseURI).href;
    // html2canvas도 이 창 안에서 따로 불러 씁니다 (바깥 창의 html2canvas로 안쪽을 그리면 작은 글씨의 띄어쓰기가 붙는 문제가 있었음)
    const h2cSrc = new URL("js/vendor/html2canvas.min.js", document.baseURI).href;
    iframe.srcdoc = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=800"><link rel="stylesheet" href="${cssHref}"><script src="${h2cSrc}"><\/script></head><body style="margin:0;background:#fff;-webkit-text-size-adjust:none;text-size-adjust:none"></body></html>`;
    const loaded = new Promise((res) => {
      iframe.addEventListener("load", res, { once: true });
      setTimeout(res, 5000);
    });
    document.body.appendChild(iframe);
    await loaded;
    const doc = iframe.contentDocument;
    // 글꼴(Pretendard 5가지 굵기)을 모두 미리 불러옵니다 — 쓰는 순간에 불러오면 첫 렌더에서 대체 글꼴로 그려져 띄어쓰기가 붙는 일이 있음
    try {
      if (doc.fonts) {
        const faces = [];
        doc.fonts.forEach((f) => faces.push(f.load().catch(() => {})));
        await Promise.all(faces);
        if (doc.fonts.ready) await doc.fonts.ready;
      }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 60));
    return { iframe, doc, html2canvas: iframe.contentWindow && iframe.contentWindow.html2canvas };
  }

  // 결과마다 한 번만 확인합니다: { before: 본 화면 확대 배율, after: 격리 창 확대 배율, isolate: 격리 필요 여부 }
  let boostStatusPromise = null;
  function getBoostStatus() {
    // 점검용: 주소 끝에 ?pdfiso=1 을 붙이면 확대가 없어도 별도 창 방식으로 PDF를 만듭니다.
    if (!boostStatusPromise && /[?&]pdfiso=1/.test(window.location.search)) {
      boostStatusPromise = Promise.resolve({ before: 1, after: 1, isolate: true });
    }
    // 점검용: ?pdfiso=2 는 '보정해도 커지는 기기'를 흉내 내어 안내 창을 띄웁니다.
    if (!boostStatusPromise && /[?&]pdfiso=2/.test(window.location.search)) {
      boostStatusPromise = Promise.resolve({ before: 1.5, after: 1.5, isolate: true });
    }
    if (!boostStatusPromise) {
      boostStatusPromise = (async () => {
        const before = measureTextBoost(document);
        if (before <= BOOST_LIMIT) return { before, after: before, isolate: false };
        let after = before;
        try {
          const host = await createIsolatedPdfHost();
          after = measureTextBoost(host.doc);
          host.iframe.remove();
        } catch (e) {}
        return { before, after, isolate: true };
      })();
    }
    return boostStatusPromise;
  }
  // 시트 "버전" 열에 덧붙이는 짧은 표시 (확대가 없으면 빈 문자열 — 앞부분 v1/v2/v3는 그대로라 폴더 분류에 영향 없음)
  function boostTag(st) {
    if (!st || st.before <= BOOST_LIMIT) return "";
    return ` · 글자확대 ${st.before.toFixed(2)}배→${st.after <= BOOST_LIMIT ? "보정됨" : "보정 안 됨"}`;
  }
  function showBoostNotice() {
    let el = document.getElementById("boostHint");
    if (!el) {
      el = document.createElement("div");
      el.id = "boostHint";
      el.className = "inapp-hint";
      el.innerHTML = `
        <div class="inapp-hint-card">
          <div class="inapp-hint-title">PDF 글자가 크게 저장되었을 수 있어요</div>
          <p class="inapp-hint-text">이 휴대폰의 글자 크기 설정 때문에 PDF 일부 문단이 커지고 빈칸이 생겼을 수 있습니다. <b>크롬(또는 삼성 인터넷)</b>에서 결과를 열어 다시 저장하면 정상으로 저장됩니다. 검사를 다시 하실 필요는 없습니다.</p>
          <div class="inapp-hint-actions">
            <button type="button" class="inapp-btn" id="bhOpen">다른 브라우저에서 결과 열기</button>
            <button type="button" class="inapp-btn inapp-btn-ghost" id="bhClose">닫기</button>
          </div>
        </div>`;
      document.body.appendChild(el);
      el.querySelector("#bhClose").addEventListener("click", () => el.classList.remove("is-open"));
      el.querySelector("#bhOpen").addEventListener("click", () => {
        const url = el.dataset.resultUrl || window.location.href;
        if (!openInExternalBrowser(url)) copyCurrentLink(url).then((ok) => {
          el.querySelector("#bhOpen").textContent = ok ? "결과 링크를 복사했어요. 크롬에 붙여 넣어 주세요" : "주소창의 링크를 크롬에서 열어 주세요";
        });
      });
    }
    el.dataset.resultUrl = lastResultUrl || window.location.href;
    el.classList.add("is-open");
  }
  let lastResultUrl = "";

  async function buildPdfDoc(scores, ranked) {
    const blocks = buildReportBlocks(scores, ranked, userName);

    // ④⑤ 글자 자동 확대 확인 → 확대되는 휴대폰이면 별도 창(iframe)에서 그림
    const boost = await getBoostStatus();
    const isoHost = boost.isolate && boost.after <= BOOST_LIMIT ? await createIsolatedPdfHost() : null;
    const hostDoc = isoHost ? isoHost.doc : document;
    const h2c = (isoHost && isoHost.html2canvas) || html2canvas;
    const container = hostDoc.createElement("div");
    container.className = "pdf-report";
    // 휴대폰의 글자 자동 확대(텍스트 자동 크기 조정)를 끕니다 — PDF 문단이 커져 쪽이 늘어나는 문제 방지
    container.style.webkitTextSizeAdjust = "none";
    container.style.textSizeAdjust = "none";
    container.style.maxHeight = "1000000px"; // 글자 자동 확대가 이 영역을 건너뛰게 함
    // 안드로이드: PDF를 그리는 동안만 화면 기준 너비를 PDF 너비(800px)로 넓혀, 화면보다 넓은 문단을
    // 키우는 '글자 자동 확대'가 작동할 이유를 없앱니다. 끝나면 원래대로 되돌립니다.
    const vpMeta = /Android/i.test(navigator.userAgent) ? document.querySelector('meta[name="viewport"]') : null;
    const vpPrev = vpMeta ? vpMeta.getAttribute("content") : null;
    if (vpMeta) {
      vpMeta.setAttribute("content", "width=800");
      await new Promise((r) => setTimeout(r, 120));
    }
    hostDoc.body.appendChild(container);

    try {
      // ---- Pass 1: measure every block by rendering it to its own canvas ----
      const rendered = [];
      for (let i = 0; i < blocks.length; i++) {
        // wrap in a small bottom-padding buffer so no block's last line of text/glyphs
        // ever sits perfectly flush against the captured canvas edge (which can clip
        // descenders/full-width Hangul glyphs even though CSS overflow is "visible").
        container.innerHTML = `<div class="pdf-block-pad">${blocks[i].html}</div>`;
        await new Promise((r) => setTimeout(r, 30)); // allow layout/paint

        const canvas = await h2c(container, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          windowWidth: container.scrollWidth,
        });

        rendered.push({
          imgData: canvas.toDataURL("image/jpeg", 0.82),
          imgH: (canvas.height * PDF_CONTENT_W) / canvas.width,
          flexible: blocks[i].flexible,
          pageBreakBefore: !!blocks[i].pageBreakBefore,
        });
      }

      // ---- Pass 2: place blocks, gap-filling with flexible blocks to avoid
      // leaving large blank space at the bottom of a page. Rigid blocks (cover,
      // overview, TOP3 compare, complement deep-dive, action guide, combo read,
      // disclaimer) always stay in their original relative order; flexible
      // blocks (chart/domain/axis chunks) can be pulled forward out of order to
      // fill whatever gap a rigid block leaves behind. ----
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      let cursorY = PDF_MARGIN_TOP;
      let isFirstOnPage = true;
      const queue = rendered.slice();

      const USABLE_H = PDF_PAGE_H - PDF_MARGIN_TOP - PDF_MARGIN_BOTTOM;

      let onPage = 0; // 지금 페이지에 놓인 블록 수
      const place = (block, fitH) => {
        // Safety net. The branch below places a block unconditionally when it is
        // first on a fresh page, which for a block TALLER than the page meant it
        // was drawn past the bottom edge and silently clipped — text ran under
        // the footer and off the sheet. Any block that cannot fit is scaled down
        // to the usable height instead (and re-centred horizontally, since it
        // then becomes narrower than the text column). Shrinking a section a few
        // percent is always preferable to losing its last lines.
        let w = PDF_CONTENT_W;
        let h = block.imgH;
        if (h > USABLE_H) {
          w = PDF_CONTENT_W * (USABLE_H / h);
          h = USABLE_H;
        }
        if (fitH && h > fitH) {
          w = w * (fitH / h);
          h = fitH;
        }
        const x = PDF_MARGIN_X + (PDF_CONTENT_W - w) / 2;
        doc.addImage(block.imgData, "JPEG", x, cursorY, w, h);
        cursorY += h + PDF_BLOCK_GAP;
        isFirstOnPage = false;
        onPage++;
      };

      while (queue.length) {
        const head = queue[0];

        // A block flagged pageBreakBefore (e.g. "보완 컬러 심층 분석") always
        // starts a fresh page, even if the current page still has room left.
        if (head.pageBreakBefore && !isFirstOnPage) {
          doc.addPage();
          cursorY = PDF_MARGIN_TOP;
          isFirstOnPage = true;
          onPage = 0;
        }

        const availableH = PDF_PAGE_H - PDF_MARGIN_BOTTOM - cursorY;

        if (isFirstOnPage || head.imgH <= availableH) {
          place(head);
          queue.shift();
          continue;
        }

        // 첫 페이지에 제목(표지 머리)만 남고 본문이 2쪽으로 넘어가지 않도록:
        // 제목 바로 다음 블록이 조금(최대 15%) 넘치면 살짝 줄여서 첫 페이지에 함께 싣습니다.
        if (doc.getNumberOfPages() === 1 && onPage === 1 && head.imgH * 0.85 <= availableH) {
          place(head, availableH);
          queue.shift();
          continue;
        }

        // head doesn't fit the remaining space on this (non-fresh) page — look
        // for a flexible block anywhere later in the queue that DOES fit, and
        // place it here instead of leaving the gap blank.
        let fillIdx = -1;
        for (let k = 1; k < queue.length; k++) {
          if (queue[k].flexible && queue[k].imgH <= availableH) { fillIdx = k; break; }
        }

        if (fillIdx !== -1) {
          place(queue[fillIdx]);
          queue.splice(fillIdx, 1);
        } else {
          doc.addPage();
          cursorY = PDF_MARGIN_TOP;
          isFirstOnPage = true;
          onPage = 0;
        }
      }

      // ---- Page footers ----
      // Drawn as images, not doc.text(): jsPDF's built-in fonts have no Hangul
      // glyphs, so "럽리뷔 코칭진튰" would come out as garbage. Rendering after
      // pagination is what makes "n / total" possible at all — the total isn't
      // known until every block has been placed.
      const totalPages = doc.getNumberOfPages();
      const footerW = PDF_CONTENT_W;
      for (let pageNo = 1; pageNo <= totalPages; pageNo++) {
        container.innerHTML = `
          <div class="rp-pagefoot">
            <span class="rp-pagefoot-name">럽리브 컬러코칭센터</span>
            <span class="rp-pagefoot-num"><em class="rp-pagefoot-ver">v3test_03</em>${pageNo} / ${totalPages}</span>
          </div>`;
        await new Promise((r) => setTimeout(r, 10));
        const fCanvas = await h2c(container, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          windowWidth: container.scrollWidth,
        });
        const footerH = (fCanvas.height * footerW) / fCanvas.width;
        doc.setPage(pageNo);
        doc.addImage(
          fCanvas.toDataURL("image/jpeg", 0.82),
          "JPEG",
          PDF_MARGIN_X,
          PDF_PAGE_H - PDF_MARGIN_BOTTOM + 4,
          footerW,
          footerH
        );
      }

      const fileName = `${LECTURE_EDITION && mode === "cr" ? "컬러리딩_결과리포트" : LECTURE_EDITION && hasReading() ? "컬러심리리딩_CCT_결과리포트" : "CCT_결과리포트"}${userName ? "_" + userName : ""}.pdf`;
      const pdfBase64 = doc.output("datauristring"); // "data:application/pdf;base64,...."
      return { doc, fileName, pdfBase64 };
    } finally {
      container.remove();
      if (isoHost) isoHost.iframe.remove();
      if (vpMeta) vpMeta.setAttribute("content", vpPrev);
    }
  }

  // Caches the in-flight/completed build so the same completed test never
  // re-renders the whole PDF twice (once for background admin-logging, once
  // for a v1 user's manual download click) — both callers await this same
  // promise. Reset on retake (see startQuiz).
  let pdfDocPromise = null;
  function getPdfDoc(scores, ranked) {
    if (!pdfDocPromise) pdfDocPromise = buildPdfDoc(scores, ranked);
    return pdfDocPromise;
  }

  // v1-only: lets the user download their own PDF immediately.
  // ---------- Carrying a finished result to another browser ----------
  // In-app webviews can't save files (see below), and the fix is to continue in
  // the real browser. Re-taking 65 questions there would be absurd, so the
  // finished scores travel in the URL: the target browser restores the exact
  // same result screen and downloads from there. Only the 13 averages and the
  // display name are carried — no answers, nothing sent to any server.
  const RESULT_PARAM = "r";

  function encodeResultParam(scores, name) {
    try {
      const payload = { n: name || "" };
      if (LECTURE_EDITION) payload.m = mode;
      if (scores) payload.s = CCT_COLORS.map((c) => Math.round((scores[c.key] || 0) * 10));
      if (LECTURE_EDITION && mode !== "cct") {
        const sel = window.CR.getSelection();
        if (sel) payload.c = sel.join(",");
      }
      if (scores && cctPicks.rank.length) payload.t = cctPicks.rank.join(",");
      if (scores && cctPicks.comp) payload.p = cctPicks.comp;
      const json = JSON.stringify(payload);
      // btoa() is latin1-only, so UTF-8 the Korean name first.
      const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
      return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    } catch (e) {
      return null;
    }
  }

  function decodeResultParam(raw) {
    try {
      const b64 = String(raw).replace(/-/g, "+").replace(/_/g, "/");
      const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
      const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
      const payload = JSON.parse(new TextDecoder().decode(bytes));
      const validKey = (k) => CCT_COLORS.some((c) => c.key === k);
      decodedCctPicks = {
        rank: typeof payload.t === "string" && payload.t ? payload.t.split(",").filter(validKey) : [],
        comp: typeof payload.p === "string" && validKey(payload.p) ? payload.p : null,
      };
      if (!payload) return null;
      const picks = typeof payload.c === "string" ? payload.c.split(",") : null;
      const name = typeof payload.n === "string" ? payload.n.slice(0, 12) : "";
      // 컬러리딩 단독 결과는 CCT 점수 없이 선택한 색만 담겨 옵니다.
      if (payload.m === "cr") return picks ? { mode: "cr", scores: null, picks, name } : null;
      if (!Array.isArray(payload.s) || payload.s.length !== CCT_COLORS.length) return null;

      const scores = {};
      for (let i = 0; i < CCT_COLORS.length; i++) {
        const v = Number(payload.s[i]) / 10;
        if (!isFinite(v) || v < 1 || v > 5) return null;
        scores[CCT_COLORS[i].key] = v;
      }
      return { mode: payload.m === "cct" ? "cct" : picks ? "both" : "cct", scores, picks, name };
    } catch (e) {
      return null;
    }
  }

  function buildResultUrl(scores, name) {
    const token = encodeResultParam(scores, name);
    if (!token) return null;
    const base = window.location.origin + window.location.pathname;
    return `${base}?${RESULT_PARAM}=${token}`;
  }

  // Restores a result handed over from another browser. Returns true if the
  // result screen was shown, so the caller can skip the normal intro flow.
  // v3test_02 점검용: 주소에 ?debug=1 이 있으면 결과지 블록 HTML을 꺼내 볼 수 있게 (화면·기록에는 영향 없음)
  if (/[?&]debug=1/.test(window.location.search)) {
    window.__cctBlocks = (scores) => buildReportBlocks(scores, getRanked(scores), userName).map((b) => b.html);
  }

  function restoreResultFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get(RESULT_PARAM);
    if (!raw) return false;
    const restored = decodeResultParam(raw);
    if (!restored) return false;
    cctPicks = decodedCctPicks || emptyPicks();

    userName = restored.name;
    if (LECTURE_EDITION) {
      mode = restored.mode;
      window.CR.reset();
      if (restored.picks && !window.CR.setSelection(restored.picks) && mode === "cr") return false;
    }
    // resultLogged guard: this result was already logged to the sheet when it
    // was originally completed — restoring it must not create a duplicate row.
    resultLogged = true;
    if (LECTURE_EDITION && mode === "cr") renderReadingResult();
    else renderResult(restored.scores);
    showScreen(screenResult);
    return true;
  }

  // ---------- In-app browser handling ----------
  // KakaoTalk / Instagram / Facebook / Line in-app webviews block file
  // downloads. jsPDF's doc.save() builds a blob and clicks a hidden
  // <a download>, which those webviews swallow WITHOUT throwing — so the
  // button appears to do nothing at all. Detect the webview up front and give
  // the user a way out instead of letting the download fail silently.
  function detectInAppBrowser() {
    const ua = navigator.userAgent || "";
    if (/KAKAOTALK/i.test(ua)) return "kakao";
    if (/Instagram/i.test(ua)) return "instagram";
    if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "facebook";
    if (/Line\//i.test(ua)) return "line";
    if (/NAVER\(inapp/i.test(ua)) return "naver";
    if (/DaumApps/i.test(ua)) return "daum";
    return null;
  }

  const isAndroid = () => /Android/i.test(navigator.userAgent || "");

  function openInExternalBrowser(targetUrl) {
    const url = targetUrl || window.location.href;
    const kind = detectInAppBrowser();
    if (kind === "kakao") {
      // KakaoTalk's documented escape hatch — works on both iOS and Android.
      window.location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(url);
      return true;
    }
    if (isAndroid()) {
      // Android intent: hand the URL to Chrome directly.
      const bare = url.replace(/^https?:\/\//, "");
      window.location.href =
        "intent://" + bare + "#Intent;scheme=https;package=com.android.chrome;end";
      return true;
    }
    return false; // iOS outside KakaoTalk can't be forced — fall back to copy.
  }

  async function copyCurrentLink(targetUrl) {
    const url = targetUrl || window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch (e) {
      // clipboard API is unavailable in several in-app webviews
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch (e2) {
        return false;
      }
    }
  }


  async function downloadPdf(scores, ranked, btn) {
    // Inside an in-app webview, saving a file is impossible no matter how the
    // bytes are produced: the webview does not save the response itself, it
    // hands the URL to the host app which re-requests it with a plain GET —
    // so a POST-only endpoint (or a blob: URL) can never be fetched. Rather
    // than fail silently, hand the finished result to the real browser and let
    // the download happen there.
    if (detectInAppBrowser()) {
      handOffToBrowser(scores, ranked);
      return;
    }

    const toast = document.getElementById("toast");
    const originalLabel = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "PDF 생성 중…";
    toast.classList.add("show");
    try {
      const { doc, fileName } = await getPdfDoc(scores, ranked);
      doc.save(fileName);
      // ⑥ 격리해도 글자가 커지는 기기라면 다른 브라우저에서 다시 저장하도록 안내
      const bst = await getBoostStatus().catch(() => null);
      if (bst && bst.after > BOOST_LIMIT) {
        try { lastResultUrl = scores ? buildResultUrl(scores, userName) || "" : ""; } catch (e) {}
        showBoostNotice();
      }
    } catch (err) {
      console.error(err);
      alert("PDF 생성 중 문제가 발생했습니다. 다시 시도해주세요.");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalLabel;
      toast.classList.remove("show");
    }
  }

  // Opens the same finished result in the device's real browser, where the
  // normal download works. The scores ride in the URL so nobody has to retake
  // the test — see encodeResultParam() above.
  function handOffToBrowser(scores, ranked) {
    const url = buildResultUrl(scores, userName);
    if (!url) {
      showBrowserHandoffDialog(url);
      return;
    }

    // Try to open the real browser silently — when it works the user just sees
    // Chrome/Safari come up with their result, and any dialog here would be
    // pure noise. The fallback below exists because "we asked the OS to open a
    // browser" is not proof that one opened (Chrome missing on Android, some
    // iOS webviews): if the page is still in the foreground a moment later,
    // nothing happened, and a dead button is exactly the silent failure this
    // whole feature was meant to remove.
    const opened = openInExternalBrowser(url);

    let settled = false;
    const cancel = () => { settled = true; };
    // Leaving for another app fires these; if they fire, the browser opened.
    document.addEventListener("visibilitychange", cancel, { once: true });
    window.addEventListener("pagehide", cancel, { once: true });
    window.addEventListener("blur", cancel, { once: true });

    setTimeout(() => {
      document.removeEventListener("visibilitychange", cancel);
      window.removeEventListener("pagehide", cancel);
      window.removeEventListener("blur", cancel);
      if (settled || document.hidden) return; // browser took over — stay quiet
      showBrowserHandoffDialog(url);
    }, opened ? 2500 : 0);
  }

  function showBrowserHandoffDialog(url) {
    let el = document.getElementById("inappHint");
    if (!el) {
      el = document.createElement("div");
      el.id = "inappHint";
      el.className = "inapp-hint";
      el.innerHTML = `
        <div class="inapp-hint-card">
          <div class="inapp-hint-title">브라우저에서 저장해주세요</div>
          <p class="inapp-hint-text">카카오톡 안에서는 파일을 저장할 수 없습니다. 크롬·사파리로 <b>지금 결과 그대로</b> 넘겨드릴게요. 검사를 다시 하실 필요는 없습니다.</p>
          <div class="inapp-hint-actions">
            <button type="button" class="inapp-btn" id="ihOpen">브라우저에서 결과 열기</button>
            <button type="button" class="inapp-btn inapp-btn-ghost" id="ihCopy">결과 링크 복사</button>
            <button type="button" class="inapp-btn inapp-btn-ghost" id="ihClose">닫기</button>
          </div>
        </div>`;
      document.body.appendChild(el);
      el.querySelector("#ihClose").addEventListener("click", () => el.classList.remove("is-open"));
    }
    // Carry the URL on the element so the dialog is self-describing (and the
    // hand-off is inspectable) rather than living only in a closure.
    el.dataset.resultUrl = url || "";
    const openBtn = el.querySelector("#ihOpen");
    const copyBtn = el.querySelector("#ihCopy");
    // Rebind each time so the buttons always carry the current result URL.
    openBtn.replaceWith(openBtn.cloneNode(true));
    copyBtn.replaceWith(copyBtn.cloneNode(true));
    el.querySelector("#ihOpen").addEventListener("click", () => {
      if (!openInExternalBrowser(url)) {
        el.querySelector("#ihOpen").textContent = "'결과 링크 복사'를 눌러주세요";
      }
    });
    el.querySelector("#ihCopy").addEventListener("click", async (e) => {
      const ok = await copyCurrentLink(url);
      e.target.textContent = ok ? "복사됐어요! 브라우저에 붙여넣기" : "복사 실패 — 주소창에서 복사해주세요";
      setTimeout(() => { e.target.textContent = "결과 링크 복사"; }, 5000);
    });
    el.classList.add("is-open");
  }

  function resetApp() {
    if (LECTURE_EDITION) { window.CR.reset(); mode = "both"; setPendingMode(null); }
    answers = [];
    cctPicks = emptyPicks();
    currentIndex = 0;
    // Drop ?r= so a reload after retaking doesn't resurrect the handed-over
    // result and drop the user straight back onto the old result screen.
    if (window.location.search) {
      history.replaceState(null, "", window.location.pathname);
    }
    showScreen(screenIntro);
  }

  // ---------- Access code + required-name gate (client-side only) ----------
  // Starting the test requires BOTH a filled-in name and the correct access code.
  let accessCodeOk = false;

  function setAccessStatus(kind, msg) {
    accessStatus.textContent = msg;
    accessStatus.className = "access-status" + (kind ? " " + kind : "");
  }

  function updateStartState() {
    const nameOk = (userNameInput.value || "").trim().length > 0;
    verified = accessCodeOk && nameOk;
    btnStart.disabled = !verified;
  }

  function checkAccessCode() {
    const value = (accessCodeInput.value || "").trim().toLowerCase();
    if (!value) {
      accessCodeOk = false;
      setAccessStatus("", "");
    } else if (value === CCT_ACCESS_CODE.toLowerCase()) {
      accessCodeOk = true;
      setAccessStatus("ok", "확인됐어요.");
    } else {
      accessCodeOk = false;
      setAccessStatus("warn", "코드를 다시 확인해주세요.");
    }
    updateStartState();
  }

  function bindAccessCode() {
    accessCodeInput.addEventListener("input", checkAccessCode);
    accessCodeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && verified) beginFlow();
    });
    userNameInput.addEventListener("input", updateStartState);
  }

  // ---------- Bind ----------
  btnStart.addEventListener("click", beginFlow);
  userNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && verified) beginFlow();
  });

  buildColorRing();
  bindAccessCode();
  bindModeScreen();
  restoreResultFromUrl();
})();
