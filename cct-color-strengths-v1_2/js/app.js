/* ==========================================================
   CCT 컬러성격강점검사 — App Logic (v2)
   ========================================================== */

(function () {
  "use strict";

  // ---------- State ----------
  let shuffledQuestions = [];
  let currentIndex = 0;
  let answers = []; // { color, value } aligned with shuffledQuestions
  let userName = "";
  let verified = false;

  // Simple access-code gate (replaces the earlier Instagram-follow upload check).
  // This is a soft, client-side-only gate — anyone reading the source can see the
  // code — but that's fine for this static-site use case.
  const CCT_ACCESS_CODE = "live";

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

  const CENTER_LOCATIONS = [
    { name: "럽리브 남양주점", url: "https://naver.me/GubsO7BA" },
    { name: "럽리브 춘천점", url: "https://naver.me/5pwdXIT5" },
  ];

  // ---------- DOM refs ----------
  const screenIntro = document.getElementById("screen-intro");
  const screenQuiz = document.getElementById("screen-quiz");
  const screenResult = document.getElementById("screen-result");

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
    [screenIntro, screenQuiz, screenResult].forEach((s) => s.classList.remove("is-active"));
    el.classList.add("is-active");
    window.scrollTo(0, 0);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
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

  function colorSectionIntroBodyHTML(color) {
    return `
      <p class="cs-summary">${escapeHtml(color.summary)}</p>
      <div class="cs-subhead">이 강점이 드러나는 모습</div>
    `;
  }

  function colorSectionDetailBodyHTML(color) {
    const healthyItems = (color.healthy || []).map((h) => `<li>${escapeHtml(h)}</li>`).join("");
    const overuseItems = (color.overuse || []).map((h) => `<li>${escapeHtml(h)}</li>`).join("");
    const actionItems = (color.actions || []).map((h) => `<li>${escapeHtml(h)}</li>`).join("");
    return `
      <div class="cs-dual">
        <div class="dual-row">
          <div class="dual-label">건강할 때</div>
          <div class="dual-content"><ul>${healthyItems}</ul></div>
        </div>
        <div class="dual-row">
          <div class="dual-label">과도할 때</div>
          <div class="dual-content"><ul>${overuseItems}</ul></div>
        </div>
      </div>
      <div class="cs-example">
        <div class="cs-example-label">예시 · 이렇게 활용해보세요</div>
        <ul>${actionItems}</ul>
      </div>
      <div class="cs-growth"><span>💬</span><span>${escapeHtml(color.growthQuestion)}</span></div>
    `;
  }

  // On-screen version: hero + summary are always visible, and the long detail
  // half (건강할 때 / 과도할 때 / 예시 / 질문 — roughly 13 bullets per color)
  // sits behind a disclosure toggle. Expanded-by-default made the result page
  // ~2,800px of near-identical prose; collapsing the details cuts the initial
  // scroll roughly in half while keeping everything one tap away.
  function buildColorSectionScreenHTML(color, tagLabel, panelId) {
    return `
      <div class="color-section">
        ${colorSectionHeroHTML(color, tagLabel)}
        <div class="cs-body">
          <p class="cs-summary">${escapeHtml(color.summary)}</p>
          <button type="button" class="cs-toggle js-toggle" aria-expanded="false" aria-controls="${panelId}" data-target="${panelId}">
            <span class="cs-toggle-label">이 강점이 드러나는 모습 보기</span>
            <span class="cs-toggle-icon" aria-hidden="true">▾</span>
          </button>
          <div class="cs-details" id="${panelId}">
            ${colorSectionDetailBodyHTML(color)}
          </div>
        </div>
      </div>
    `;
  }

  // PDF version: same visual content, but returned as TWO independent cards
  // (intro: hero+summary, detail: dual/example/growth) so the PDF's page-fill
  // logic can place them separately when the full card doesn't fit a gap.
  function buildColorSectionPdfParts(color, tagLabel) {
    const intro = `
      <div class="color-section">
        ${colorSectionHeroHTML(color, tagLabel)}
        <div class="cs-body">${colorSectionIntroBodyHTML(color)}</div>
      </div>
    `;
    const detail = `
      <div class="color-section">
        <div class="cs-body cs-body-continued">${colorSectionDetailBodyHTML(color)}</div>
      </div>
    `;
    return [intro, detail];
  }

  // ---------- Quiz flow ----------
  function startQuiz() {
    userName = (userNameInput.value || "").trim().slice(0, 12);
    shuffledQuestions = shuffle(CCT_QUESTIONS);
    answers = new Array(shuffledQuestions.length).fill(null);
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
    renderResult(scores);
    showScreen(screenResult);
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

  function getRanked(scores) {
    return CCT_COLORS.map((c) => ({ ...c, score: scores[c.key] })).sort((a, b) => b.score - a.score);
  }

  function getComplement(top1Key, scores) {
    const compKeys = CCT_COMPLEMENT_MAP[top1Key] || [];
    const candidates = compKeys.map((k) => ({ ...cctColorByKey(k), score: scores[k] }));
    candidates.sort((a, b) => a.score - b.score); // lowest currently-used candidate first
    return { chosen: candidates[0], all: candidates };
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
  async function autoLogResult(scores, ranked, comp) {
    if (!GS_WEBHOOK_URL) return; // logging disabled
    if (resultLogged) return;
    resultLogged = true;
    try {
      const { pdfBase64 } = await getPdfDoc(scores, ranked);
      const payload = {
        name: userName || "",
        completedAt: new Date().toISOString(),
        appVariant: APP_VARIANT,
        top1: `${ranked[0].ko}(${ranked[0].en})`,
        top2: `${ranked[1].ko}(${ranked[1].en})`,
        top3: `${ranked[2].ko}(${ranked[2].en})`,
        complement: `${comp.chosen.ko}(${comp.chosen.en})`,
        scores: CCT_COLORS.reduce((obj, c) => {
          obj[c.key] = scores[c.key];
          return obj;
        }, {}),
        pdfBase64, // data URI ("data:application/pdf;base64,...") — Apps Script saves this to Drive
      };
      // mode:"no-cors" + text/plain avoids a CORS preflight, which a simple
      // Apps Script Web App deployment doesn't handle. We never read the
      // response — this is fire-and-forget and must never block or break
      // the result screen if the network/webhook is unavailable.
      fetch(GS_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch (err) {
      console.warn("결과 기록 전송 실패:", err);
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
          <p>13개 컬러 전체 프로파일과 상세 해석이 담긴 리포트는 온라인으로 바로 받아보실 수 없고, 아래 센터를 방문하시면 안내받으실 수 있어요.</p>
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
    const ranked = getRanked(scores);
    const top1 = ranked[0];
    const comp = getComplement(top1.key, scores);
    // Fire-and-forget: builds the PDF and logs it to the admin's Google Sheet/
    // Drive in the background. Runs for BOTH variants, and never blocks or
    // breaks the result screen if it fails (see autoLogResult's own try/catch).
    autoLogResult(scores, ranked, comp);
    const nameLabel = userName ? `${escapeHtml(userName)}님의` : "나의";

    const resultNote =
      APP_VARIANT === "v2"
        ? `본 결과는 자기보고 기반 성격강점 프로파일이며, 정신건강·성격장애를 진단하는 임상 도구가 아닙니다.`
        : `본 결과는 자기보고 기반 성격강점 프로파일이며, 정신건강·성격장애를 진단하는 임상 도구가 아닙니다.<br/>
        13개 컬러 전체 프로파일과 상세 해석은 아래 PDF 리포트에서 확인하실 수 있습니다.`;

    const ctaLabel = APP_VARIANT === "v2" ? "센터 방문 안내 보기" : "상세 결과 PDF 다운로드";

    const html = `
      <div class="result-hero">
        <div class="eyebrow">CCT 컬러성격강점검사 · 결과</div>
        <p class="lead">${nameLabel} 컬러는</p>
        <h1 style="color:${top1.hex}">${top1.ko}</h1>
        <p class="strength-name">${top1.strength} · ${top1.en}</p>
      </div>

      <section class="rs-block">
        <h2 class="rs-title">한눈에 보는 내 결과</h2>
        <div class="quick-grid">${buildQuickCardsHTML(ranked, comp)}</div>
        ${buildQuickFactsHTML(scores, "아래에서 13개 컬러 전체 프로파일과 상세 해석을 확인하실 수 있습니다.")}
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
        <h2 class="rs-title">보완 컬러</h2>
        <p class="rs-note">
          13개 중 가장 낮은 점수가 아니라, ${escapeHtml(top1.ko)}와(과) 심리적으로 대비되는 이론적 짝 중
          상대적으로 덜 활용된 컬러예요.
        </p>
        ${buildColorSectionScreenHTML(comp.chosen, "앞으로 더 활용해볼 자원", "rsComp")}
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
  function computeDomainScores(scores) {
    return CCT_DOMAINS.map((d) => {
      const vals = d.colors.map((k) => scores[k]);
      return { ...d, value: vals.reduce((a, b) => a + b, 0) / vals.length };
    }).sort((a, b) => b.value - a.value);
  }

  // Same left/right average-percentage math as renderAxis() below, but
  // returning plain numbers (no HTML) for the one-line quick-summary blurb.
  function axisLean(axis, scores) {
    const leftAvg = axis.left.colors.reduce((s, k) => s + scores[k], 0) / axis.left.colors.length;
    const rightAvg = axis.right.colors.reduce((s, k) => s + scores[k], 0) / axis.right.colors.length;
    const total = leftAvg + rightAvg || 1;
    const rightPct = Math.max(6, Math.min(94, (rightAvg / total) * 100));
    const leftPct = 100 - rightPct;
    const lean = rightPct >= leftPct ? axis.right : axis.left;
    return { leftPct, rightPct, lean, leanPct: Math.max(leftPct, rightPct) };
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
    const cards = [
      ...ranked.slice(0, 3).map((c, i) => ({ rank: `TOP${i + 1}`, c })),
      { rank: "보완", c: comp.chosen },
    ];
    return cards
      .map(
        ({ rank, c }) => `
        <div class="quick-card">
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

  // One-paragraph recap of the top domain + both axis leanings. `tailText` lets
  // each surface close the paragraph with its own pointer (the PDF sends the
  // reader to its appendix; the screen points at the chart just below it).
  function buildQuickFactsHTML(scores, tailText) {
    const topDomain = computeDomainScores(scores)[0];
    const axis1 = axisLean(CCT_AXES.leadCollab, scores);
    const axis2 = axisLean(CCT_AXES.empathyObjective, scores);
    return `
      <div class="quick-facts">
        6대 상위 강점영역 중에서는 <b>${escapeHtml(topDomain.name)}</b>(${topDomain.value.toFixed(1)})이 가장 높게 나타났습니다.
        보조 성향축에서는 <b>${escapeHtml(axis1.lean.name)}</b> 쪽이 ${axis1.leanPct.toFixed(0)}%, <b>${escapeHtml(axis2.lean.name)}</b> 쪽이 ${axis2.leanPct.toFixed(0)}%로 조금 더 우세하게 나타났습니다.
        ${tailText}
      </div>
    `;
  }

  function buildProfileQuickSummaryHTML(ranked, comp, scores) {
    return `
      <div class="quick-summary">
        <div class="section-subtitle">한눈에 보는 요약</div>
        <div class="quick-grid">${buildQuickCardsHTML(ranked, comp)}</div>
        ${buildQuickFactsHTML(scores, '13개 컬러 전체 점수는 리포트 맨 뒤 "컬러별 상세 점수"에서 확인하실 수 있습니다.')}
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

  // Infographic-style axis card: each side now shows its % share AND small
  // color-swatch dots for the actual colors that make up that side, plus tick
  // marks on the track — so the abstract axis stays visibly tied back to the
  // concrete 13 colors instead of being just a plain unlabeled bar.
  function renderAxis(axis, scores) {
    const leftAvg = axis.left.colors.reduce((s, k) => s + scores[k], 0) / axis.left.colors.length;
    const rightAvg = axis.right.colors.reduce((s, k) => s + scores[k], 0) / axis.right.colors.length;
    const total = leftAvg + rightAvg || 1;
    const rightPct = Math.max(6, Math.min(94, (rightAvg / total) * 100));
    const leftPct = 100 - rightPct;

    const dotsHTML = (colors) =>
      colors
        .map((k) => {
          const c = cctColorByKey(k);
          return `<span class="axis-dot" style="background:${c.hex}"></span>`;
        })
        .join("");

    return `
      <div class="axis-card">
        <div class="axis-sides">
          <div class="axis-side">
            <div class="axis-side-name">${escapeHtml(axis.left.name)} <span class="axis-side-pct">${leftPct.toFixed(0)}%</span></div>
            <div class="axis-dots">${dotsHTML(axis.left.colors)}</div>
          </div>
          <div class="axis-side axis-side-right">
            <div class="axis-side-name">${escapeHtml(axis.right.name)} <span class="axis-side-pct">${rightPct.toFixed(0)}%</span></div>
            <div class="axis-dots">${dotsHTML(axis.right.colors)}</div>
          </div>
        </div>
        <div class="axis-track">
          <div class="axis-tick" style="left:25%"></div>
          <div class="axis-tick" style="left:50%"></div>
          <div class="axis-tick" style="left:75%"></div>
          <div class="axis-thumb" style="left:${rightPct}%"></div>
        </div>
        <div class="axis-desc">${axis.desc}</div>
      </div>
    `;
  }

  function renderCombo(top1, top2) {
    const text = `이 조합을 가진 사람은 “${top1.question}”과(와) “${top2.question}”라는 두 질문 모두에서 강점을 보일 수 있습니다. 실제 상황에서는 ${top1.ko}의 ‘${top1.core}’으로 상황을 시작하고, ${top2.ko}의 ‘${top2.core}’으로 흐름을 이어가는 방식이 자연스럽게 나타날 수 있습니다. 두 강점이 함께 발휘될 때는 ${top1.strength}과 ${top2.strength}이 서로를 보완하며 시너지를 만들 수 있지만, 두 강점 모두 과도하게 사용되는 상황이라면 각각의 "과도하게 사용될 때" 항목을 함께 점검해보는 것이 좋습니다.`;
    return `
      <div class="combo-card">
        <div class="combo-chips">
          <span class="combo-chip" style="background:${top1.hex}">${top1.ko} · ${top1.strength}</span>
          <span class="combo-plus">+</span>
          <span class="combo-chip" style="background:${top2.hex}">${top2.ko} · ${top2.strength}</span>
        </div>
        <p>${text}</p>
      </div>
    `;
  }

  // Relationship-fit read for the TOP1+TOP2 combo: which colors tend to click
  // easily vs. which tend to feel a little friction-prone, plus what synergy
  // and what to watch for in each case. Grounded in data already established
  // elsewhere in the report rather than inventing new relationships:
  // "잘 맞는 컬러" = other colors sharing TOP1/TOP2's 6대 영역 (CCT_DOMAINS) —
  // a similar value orientation reads as easy rapport. "불편할 수 있는 컬러" =
  // TOP1's CCT_COMPLEMENT_MAP candidates — the same "psychologically
  // contrasting orientation" pairing already used for the complement deep-dive,
  // reframed here for how it can feel in a relationship rather than personal growth.
  function buildRelationshipFitHTML(top1, top2) {
    const domainOf = (key) => CCT_DOMAINS.find((d) => d.colors.includes(key));
    const top1Domain = domainOf(top1.key);
    const top2Domain = domainOf(top2.key);

    const goodKeys = Array.from(
      new Set([...(top1Domain ? top1Domain.colors : []), ...(top2Domain ? top2Domain.colors : [])])
    ).filter((k) => k !== top1.key && k !== top2.key);
    const goodColors = goodKeys.map((k) => cctColorByKey(k));

    const frictionKeys = CCT_COMPLEMENT_MAP[top1.key] || [];
    const frictionColors = frictionKeys.map((k) => cctColorByKey(k));

    const domainNames = Array.from(new Set([top1Domain && top1Domain.name, top2Domain && top2Domain.name].filter(Boolean))).join(
      ", "
    );

    const chipRow = (colors) =>
      colors
        .map((c) => `<span class="fit-chip" style="background:${c.hex};color:${getContrastText(c.hex)}">${escapeHtml(c.ko)}</span>`)
        .join("");

    return `
      <div class="fit-block">
        <div class="fit-col fit-good">
          <div class="fit-label">잘 맞을 수 있는 컬러</div>
          <div class="fit-chips">${chipRow(goodColors)}</div>
          <p class="fit-text">${escapeHtml(top1.ko)}·${escapeHtml(top2.ko)}와(과) 같은 '${escapeHtml(domainNames)}' 영역에 속한 컬러들입니다. 가치관과 접근 방식의 결이 비슷해 대화가 자연스럽게 통하고, 서로를 이해하는 데 큰 노력이 들지 않는 편입니다. 다만 비슷한 성향끼리는 놓치는 부분도 비슷할 수 있어, 가끔은 다른 관점을 가진 사람을 의도적으로 곁에 두는 것도 도움이 됩니다.</p>
        </div>
        <div class="fit-col fit-friction">
          <div class="fit-label">다소 불편하게 느껴질 수 있는 컬러</div>
          <div class="fit-chips">${chipRow(frictionColors)}</div>
          <p class="fit-text">${escapeHtml(top1.ko)}과(와) 심리적으로 대비되는 지향을 가진 컬러들입니다. 일하는 속도나 우선순위를 정하는 기준이 달라 처음에는 다소 부딪히거나 답답하게 느껴질 수 있습니다. 다만 이 차이 덕분에 ${escapeHtml(top1.ko)} 혼자서는 놓치기 쉬운 지점을 채워줄 수 있으니, 불편함 자체보다 "무엇을 다르게 보고 있는지"를 먼저 확인하는 태도가 도움이 됩니다.</p>
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
    const topText = `현재 13개 컬러 중 ${top.map((c) => c.ko).join("과 ")}이(가) 상대적으로 높게 나타났습니다. ${top
      .map((c) => c.core)
      .join(", ")} 등을 일상에서 비교적 자연스럽게 활용하고 있는 것으로 보입니다.`;

    const compColor = comp.chosen;
    const compText = `${top1.ko}(${top1.strength})의 핵심 강점인 '${top1.core}'과(와) 심리적으로 대비되는 지향을 가진 컬러입니다. 점수가 낮다고 부족하거나 잘못된 것이 아니라, 아직 충분히 활용되지 않은 성장 자원에 가깝습니다. ${compColor.ko}의 '${compColor.core}'을(를) 의도적으로 시도해보면 ${top1.ko} 하나에만 치우치지 않는 균형 잡힌 강점 조합을 만들 수 있습니다.`;

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
          <div class="rp-summary-label">보완 컬러</div>
          <div class="rp-summary-body">
            <h4>${escapeHtml(`${compColor.ko} · ${compColor.strength}`)}</h4>
            <p>${escapeHtml(compText)}</p>
            <p class="rp-summary-note">※ 보완 컬러는 13개 중 최저 점수가 아니라, 핵심 강점 컬러와 심리적으로 대비되는 이론적 짝(CCT 해석 가이드 5장 표 기준) 중 상대적으로 덜 활용된 컬러를 의미합니다. 아래 "보완 컬러 심층 분석"에서 그 근거를 더 자세히 설명합니다.</p>
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
  function buildComplementRationaleHTML(top1, compColor) {
    return `
      <div class="comp-rationale">
        <div class="comp-rationale-label">왜 이 컬러가 보완 컬러인가요?</div>
        <p>
          보완 컬러는 13개 컬러 중 점수가 가장 낮은 컬러를 그대로 가리키는 것이 아닙니다. CCT 해석 가이드에서
          컬러마다 미리 설계해 둔 "이론적 짝" 후보들 중, 지금 상대적으로 덜 활용되고 있는 컬러를 의미합니다.
          ${top1.ko}이(가) '${top1.core}'을(를) 통해 발휘되는 힘이라면, ${compColor.ko}은(는) '${compColor.core}'을(를)
          통해 발휘되는 힘입니다. 서로 다른 지향의 두 강점이 함께 성장할 때, 한 가지 강점에만 의존하지 않는
          균형 잡힌 대응이 가능해집니다.
        </p>
      </div>
    `;
  }

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

  function buildTripleComboText(top1, top2, top3) {
    return `이 조합을 가진 사람은 상황에 따라 세 가지 강점을 유연하게 오갑니다. ${top1.ko}의 '${top1.core}'로 상황을 마주하고, ${top2.ko}의 '${top2.core}'로 관점을 넓히며, ${top3.ko}의 '${top3.core}'로 마무리를 짓는 흐름이 자연스럽게 나타날 수 있습니다. 세 강점이 균형 있게 발휘되면 서로의 빈틈을 메워주는 시너지가 나지만, 세 강점 모두 과도하게 사용되는 상황이라면 아래 "과사용 경고 신호"를 함께 점검해보는 것이 좋습니다.`;
  }

  function buildTop3CompareHTML(ranked) {
    const top3 = ranked.slice(0, 3);
    const rows = top3
      .map((c, i) => {
        const healthyItems = (c.healthy || [])
          .slice(0, 2)
          .map((h) => `<li>${escapeHtml(h)}</li>`)
          .join("");
        const overuseItems = (c.overuse || [])
          .slice(0, 2)
          .map((h) => `<li>${escapeHtml(h)}</li>`)
          .join("");
        return `
          <tr>
            <td class="ct-color"><span class="ct-swatch" style="background:${c.hex}"></span>TOP${i + 1} · ${escapeHtml(c.ko)}</td>
            <td class="ct-strength">${escapeHtml(c.strength)}</td>
            <td><ul>${healthyItems}</ul></td>
            <td><ul>${overuseItems}</ul></td>
          </tr>
        `;
      })
      .join("");

    const adjacent = ranked.slice(3, 5);
    const adjacentNote = adjacent.length
      ? `<div class="ct-adjacent">4~5위는 ${adjacent.map((c) => escapeHtml(c.ko)).join(", ")}입니다. TOP3와 점수 차이가 크지 않아 상황에 따라 함께 나타날 수 있는 인접 강점이니 참고해보세요.</div>`
      : "";

    return `
      <div class="ct-headline">${escapeHtml(buildComboTypeName(ranked))}</div>
      <p class="ct-combo-text">${escapeHtml(buildTripleComboText(top3[0], top3[1], top3[2]))}</p>
      <table class="compare-table">
        <thead>
          <tr><th>컬러</th><th>핵심 강점</th><th>건강할 때</th><th>과도할 때</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${adjacentNote}
    `;
  }

  function buildActionGuideHTML(ranked, comp) {
    const top3 = ranked.slice(0, 3);

    const topActionsHtml = top3
      .map((c, i) => {
        const items = (c.actions || [])
          .slice(0, 2)
          .map((a) => `<li>${escapeHtml(a)}</li>`)
          .join("");
        return `
          <div class="ag-item">
            <div class="ag-item-label" style="color:${c.hex}">TOP${i + 1} · ${escapeHtml(c.ko)}</div>
            <ul>${items}</ul>
          </div>
        `;
      })
      .join("");

    const warnItems = top3
      .slice(0, 2)
      .flatMap((c) => (c.overuse || []).slice(0, 1).map((o) => `<li><b>${escapeHtml(c.ko)}</b> — ${escapeHtml(o)}</li>`))
      .join("");

    const missionCandidates = [
      (top3[0].actions || [])[0],
      (comp.chosen.actions || [])[0],
      "오늘 하루, 보완 컬러의 관점으로 한 번 더 생각해보고 짧게 기록을 남겨보세요.",
    ].filter(Boolean);
    const missionItems = missionCandidates.map((m) => `<li>${escapeHtml(m)}</li>`).join("");

    return `
      <div class="ag-block">
        <div class="section-subtitle">TOP 3 강점 활용법</div>
        <div class="ag-grid">${topActionsHtml}</div>
      </div>
      <div class="ag-block">
        <div class="section-subtitle">과사용 경고 신호 체크리스트</div>
        <div class="ag-warn"><ul>${warnItems}</ul></div>
      </div>
      <div class="ag-block">
        <div class="section-subtitle">이번 주 실천 미션</div>
        <div class="ag-mission"><ul>${missionItems}</ul></div>
      </div>
    `;
  }

  // Extra, personalized context for the TOP3 comparison page: where the trio
  // collectively leans on the two reference axes (using the SAME CCT_AXES data
  // as the "보조 성향축" cards further down), plus a few concrete scenarios
  // where the combination tends to shine. Purely descriptive/informational —
  // never prescriptive or diagnostic.
  function buildTop3SynergyHTML(ranked) {
    const top3 = ranked.slice(0, 3);
    const [t1, t2, t3] = top3;

    const axisNotes = [];
    Object.values(CCT_AXES).forEach((axis) => {
      const leftCount = top3.filter((c) => axis.left.colors.includes(c.key)).length;
      const rightCount = top3.filter((c) => axis.right.colors.includes(c.key)).length;
      if (leftCount >= 2 && leftCount > rightCount) {
        axisNotes.push(
          `TOP3 중 ${leftCount}개 컬러가 '${axis.left.name}' 쪽에 속해 있어, ${axis.label} 축에서 ${axis.left.name} 지향이 뚜렷한 조합입니다.`
        );
      } else if (rightCount >= 2 && rightCount > leftCount) {
        axisNotes.push(
          `TOP3 중 ${rightCount}개 컬러가 '${axis.right.name}' 쪽에 속해 있어, ${axis.label} 축에서 ${axis.right.name} 지향이 뚜렷한 조합입니다.`
        );
      }
    });

    const momentsItems = [
      `${t1.ko}의 '${t1.core}'으로 시작해 ${t2.ko}의 '${t2.core}'으로 관점을 넓히고, ${t3.ko}의 '${t3.core}'으로 마무리 짓는 일`,
      `서로 다른 세 강점이 동시에 필요한, 복잡하고 시간이 촉박한 문제를 풀어야 할 때`,
      `팀 안에서 이 세 가지 역할을 상황에 따라 번갈아 맡아야 하는 순간`,
    ];

    return `
      ${
        axisNotes.length
          ? `
        <div class="t3-synergy-block">
          <div class="section-subtitle">이 조합의 종합 성향</div>
          <div class="t3-axis-notes">${axisNotes.map((n) => `<p>${escapeHtml(n)}</p>`).join("")}</div>
        </div>
      `
          : ""
      }
      <div class="t3-synergy-block">
        <div class="section-subtitle">이 조합이 빛나는 순간</div>
        <ul class="t3-moments">${momentsItems.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>
      </div>
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
          <div class="synergy-tag">보완 컬러</div>
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
    const toIdentity = (core) => (core.endsWith("힘") ? core.slice(0, -1) + "사람" : `${core}을(를) 가진 사람`);

    const items = top3
      .map((c, i) => {
        const identity = toIdentity(c.core);
        const evidence = (c.healthy && c.healthy[0]) || "";
        return `
          <div class="persona-item">
            <div class="persona-num" style="background:${c.hex};color:${getContrastText(c.hex)}">${i + 1}</div>
            <div class="persona-body">
              <div class="persona-head">
                <span class="persona-name" style="color:${c.hex}">${escapeHtml(c.ko)} · ${escapeHtml(c.strength)}</span>
              </div>
              <p class="persona-text">당신은 <b>${escapeHtml(identity)}</b>입니다. ${escapeHtml(evidence)}</p>
            </div>
          </div>
        `;
      })
      .join("");

    const identityLine = top3.map((c) => c.strength).join(" · ");
    const nameLine = top3.map((c) => c.ko).join("·");

    return `
      <div class="t3-persona-block">
        <div class="section-subtitle">컬러로 본 나의 장점</div>
        <div class="persona-grid">${items}</div>
        <p class="persona-summary">${escapeHtml(nameLine)}가 겹쳐질 때, 당신은 <b>${escapeHtml(identityLine)}</b>이 동시에 드러나는 사람으로 요약될 수 있습니다.</p>
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
  function buildReportBlocks(scores, ranked, name) {
    const blocks = [];
    const rigid = (html) => blocks.push({ html, flexible: false, pageBreakBefore: false });
    // Like rigid(), but forces a fresh page before this block even if the
    // current page has room left — used to keep "보완 컬러 심층 분석" from
    // starting mid-page right under the TOP3 comparison section.
    const rigidBreak = (html) => blocks.push({ html, flexible: false, pageBreakBefore: true });
    const flexible = (html) => blocks.push({ html, flexible: true, pageBreakBefore: false });

    const top1 = ranked[0];
    const comp = getComplement(top1.key, scores);
    const dateStr = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

    rigid(`
      <div class="rp-cover">
        <div class="rp-kicker">CCT COLOR CHARACTER STRENGTHS TEST</div>
        <div class="rp-title">${name ? escapeHtml(name) + "님의 " : ""}컬러 성격강점 결과 리포트</div>
        <div class="rp-date">${dateStr} 생성</div>
        <div class="rp-swatchbar">${CCT_COLORS.map((c) => `<span style="background:${c.hex}"></span>`).join("")}</div>
      </div>
    `);

    let overviewBlock = `<div class="section-title">13 컬러 전체 프로파일</div>`;
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
    rigid(overviewBlock);

    // TOP3 comparison (Enneagram-style comparative summary): compares the top 3
    // strength colors side by side, plus additional context (collective axis
    // tilt, scenarios where the combo shines) to make good use of the page.
    rigid(
      `<div class="section-title">TOP 3 강점 컬러 비교</div>${buildTop3CompareHTML(ranked)}${buildTop3SynergyHTML(ranked)}${buildTop3PersonaHTML(ranked)}`
    );

    // The complement color gets its own growth-focused deep dive (healthy/overuse,
    // example usage, growth question) — reusing the same intro/detail split as
    // before so the page-fill pass can still place the two halves independently.
    // rigidBreak() forces this to start on a fresh page rather than continuing
    // wherever the TOP3 comparison page happened to leave off.
    const [compIntro, compDetail] = buildColorSectionPdfParts(comp.chosen, "보완 컬러 · 성장 자원");
    rigidBreak(
      `<div class="section-title">보완 컬러 심층 분석</div>${buildSynergyVennHTML(top1, comp.chosen)}${buildComplementRationaleHTML(top1, comp.chosen)}${compIntro}`
    );
    rigid(compDetail);

    // Concrete, actionable guidance: how to use the TOP3 strengths, warning signs
    // of overuse, and a short weekly practice checklist.
    rigid(`<div class="section-title">실전 지침</div>${buildActionGuideHTML(ranked, comp)}`);

    // ---- Flexible supplementary section (domains / axes) ----
    // Split into small chunks so generatePdf() can slot them into whatever
    // leftover page space the rigid sections above leave behind. The raw
    // 13-color score bars used to be flexible chunks defined alongside these,
    // which meant they could get pulled into the gap between the complement
    // intro and its own detail half (or after the action guide), interrupting
    // an unrelated section mid-flow — see the dedicated rigid appendix near
    // the end of this function for where that list lives now.
    const domainScores = computeDomainScores(scores);
    let domainBlock = `<div class="section-subtitle">6대 상위 강점영역</div>`;
    domainBlock += `<div class="section-desc">13개 컬러를 이론적으로 묶은 상위 구조입니다. 표본 데이터 검증 이전의 초기 분류로 참고용입니다.</div>`;
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
    flexible(domainBlock);

    flexible(`
      <div class="section-subtitle">보조 성향축 (참고 지표) · 주도 ↔ 협력</div>
      ${renderAxis(CCT_AXES.leadCollab, scores)}
    `);
    flexible(`
      <div class="section-subtitle">보조 성향축 (참고 지표) · 공감 ↔ 객관</div>
      ${renderAxis(CCT_AXES.empathyObjective, scores)}
    `);

    if (ranked.length >= 2) {
      rigid(`
        <div class="section-title">TOP 컬러 조합 해석</div>
        ${renderCombo(ranked[0], ranked[1])}
        ${buildRelationshipFitHTML(ranked[0], ranked[1])}
      `);
    }

    // Full color-by-color score list, as its own dedicated appendix at the very
    // end of the report (rigid, not flexible — so unlike before, it can never
    // get pulled forward to patch a gap in an earlier section). The profile
    // page up front now shows the condensed "한눈에 보는 요약" instead; this is
    // for anyone who wants every raw number. rigidBreak() on the first chunk
    // forces this appendix to always start on its own fresh page rather than
    // tacking onto whatever room "TOP 컬러 조합 해석" happened to leave behind.
    const barRowsHtml = ranked.map((c, i) => buildScoreBarRowHTML(c, i));
    const CHUNK = 5;
    for (let i = 0; i < barRowsHtml.length; i += CHUNK) {
      const chunk = barRowsHtml.slice(i, i + CHUNK).join("");
      let html = i === 0 ? `<div class="section-title">컬러별 상세 점수 (13개 전체)</div>` : "";
      html += `<div class="bar-chart">${chunk}</div>`;
      if (i === 0) {
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
      <div class="rp-footer">CCT Color Character Strengths Test · Result Interpretation Guide v1.0 기반</div>
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
  async function buildPdfDoc(scores, ranked) {
    const blocks = buildReportBlocks(scores, ranked, userName);

    const container = document.createElement("div");
    container.className = "pdf-report";
    document.body.appendChild(container);

    try {
      // ---- Pass 1: measure every block by rendering it to its own canvas ----
      const rendered = [];
      for (let i = 0; i < blocks.length; i++) {
        // wrap in a small bottom-padding buffer so no block's last line of text/glyphs
        // ever sits perfectly flush against the captured canvas edge (which can clip
        // descenders/full-width Hangul glyphs even though CSS overflow is "visible").
        container.innerHTML = `<div class="pdf-block-pad">${blocks[i].html}</div>`;
        await new Promise((r) => setTimeout(r, 30)); // allow layout/paint

        const canvas = await html2canvas(container, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          windowWidth: container.scrollWidth,
        });

        rendered.push({
          imgData: canvas.toDataURL("image/jpeg", 0.95),
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

      const place = (block) => {
        doc.addImage(block.imgData, "JPEG", PDF_MARGIN_X, cursorY, PDF_CONTENT_W, block.imgH);
        cursorY += block.imgH + PDF_BLOCK_GAP;
        isFirstOnPage = false;
      };

      while (queue.length) {
        const head = queue[0];

        // A block flagged pageBreakBefore (e.g. "보완 컬러 심층 분석") always
        // starts a fresh page, even if the current page still has room left.
        if (head.pageBreakBefore && !isFirstOnPage) {
          doc.addPage();
          cursorY = PDF_MARGIN_TOP;
          isFirstOnPage = true;
        }

        const availableH = PDF_PAGE_H - PDF_MARGIN_BOTTOM - cursorY;

        if (isFirstOnPage || head.imgH <= availableH) {
          place(head);
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
        }
      }

      const fileName = `CCT_결과리포트${userName ? "_" + userName : ""}.pdf`;
      const pdfBase64 = doc.output("datauristring"); // "data:application/pdf;base64,...."
      return { doc, fileName, pdfBase64 };
    } finally {
      document.body.removeChild(container);
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
  async function downloadPdf(scores, ranked, btn) {
    const toast = document.getElementById("toast");
    const originalLabel = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "PDF 생성 중…";
    toast.classList.add("show");
    try {
      const { doc, fileName } = await getPdfDoc(scores, ranked);
      doc.save(fileName);
    } catch (err) {
      console.error(err);
      alert("PDF 생성 중 문제가 발생했습니다. 다시 시도해주세요.");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalLabel;
      toast.classList.remove("show");
    }
  }

  function resetApp() {
    answers = [];
    currentIndex = 0;
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
      if (e.key === "Enter" && verified) startQuiz();
    });
    userNameInput.addEventListener("input", updateStartState);
  }

  // ---------- Bind ----------
  btnStart.addEventListener("click", startQuiz);
  userNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && verified) startQuiz();
  });

  buildColorRing();
  bindAccessCode();
})();
