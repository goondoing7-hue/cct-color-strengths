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
  const APP_VARIANT = "v2"; // "v1" | "v2"

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

  function getComplement(top1Key, scores, ranked) {
    const compKeys = CCT_COMPLEMENT_MAP[top1Key] || [];
    const candidates = compKeys.map((k) => ({ ...cctColorByKey(k), score: scores[k] }));
    // Lowest currently-used candidate first — the complement is meant to be the
    // contrast resource the person leans on LEAST.
    candidates.sort((a, b) => a.score - b.score);

    // Tie-break only: when candidates score exactly the same, prefer one that
    // isn't already a TOP3 strength. Calling a top strength "아직 덜 활용된
    // 자원" contradicts the rest of the report, and with tied scores the order
    // was arbitrary anyway. Never overrides a genuine score difference.
    if (ranked && candidates.length > 1 && candidates[0].score === candidates[1].score) {
      const topKeys = ranked.slice(0, 3).map((c) => c.key);
      const outside = candidates.filter((c) => !topKeys.includes(c.key));
      if (outside.length) {
        const pick = outside[0];
        return { chosen: pick, all: candidates };
      }
    }
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
        13개 컬러 전체 프로파일과 상세 해석은<br/>아래 PDF 리포트에서 확인하실 수 있습니다.`;

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
        ${buildQuickFactsHTML(ranked, comp, "아래에서 13개 컬러 전체 프로파일과 상세 해석을 확인하실 수 있습니다.")}
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
          13개 중 가장 낮은 점수가 아니라, ${escapeHtml(top1.ko)}${josa(top1.ko, "과", "와")} 심리적으로 대비되는 이론적 짝 중
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
      rank: i === compIsTop ? `강점 TOP${i + 1} · 보완` : `강점 TOP${i + 1}`,
      dual: i === compIsTop,
      c,
    }));
    if (compIsTop === -1) cards.push({ rank: "보완 컬러", dual: false, c: comp.chosen });
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
  function buildQuickFactsHTML(ranked, comp, tailText) {
    const t1 = ranked[0];
    const t2 = ranked[1];
    const t3 = ranked[2];
    const cp = comp.chosen;
    const nm = (c) => `<b>${escapeHtml(c.ko)} · ${escapeHtml(c.strength)}</b>`;

    // The complement is picked from TOP1's theoretical contrast pair, which is
    // NOT guaranteed to sit outside the TOP3 — so the same color can legitimately
    // appear as both a strength and the complement. Saying "아직 덜 활용되고
    // 있다" about a color the reader just saw ranked in their TOP3 reads as a
    // flat contradiction, so that case gets its own honest phrasing instead.
    const compIsAlsoStrength = ranked.slice(0, 3).some((c) => c.key === cp.key);
    const compLine = compIsAlsoStrength
      ? `${nm(cp)}${josa(cp.strength, "은", "는")} 강점으로도 나타났지만 동시에 ${escapeHtml(t1.ko)}${josa(t1.ko, "과", "와")} 심리적으로 대비되는 짝이기도 해서 보완 컬러로도 함께 제시됩니다. 이미 갖고 있는 자원인 만큼, 상황에 따라 의식적으로 꺼내 쓰면 균형을 잡는 데 도움이 됩니다.`
      : `${nm(cp)}${josa(cp.strength, "은", "는")} 이 강점들과 심리적으로 대비되는 자리에 있는 보완 컬러로, 아직 상대적으로 덜 활용되고 있어 의식적으로 꺼내 쓸수록 전체 균형이 좋아집니다.`;

    return `
      <div class="quick-facts">
        가장 뚜렷하게 드러난 강점 컬러는 ${nm(t1)}입니다. ${escapeHtml(t1.core)}${josa(t1.core, "이", "가")} 지금의 나를 이끄는 중심축으로 나타났습니다.
        여기에 ${nm(t2)}, ${nm(t3)}${josa(t3.strength, "이", "가")} 함께 작동하면서 ${escapeHtml(t1.ko)}의 강점을 한층 입체적으로 받쳐 줍니다.
        ${compLine}
        ${tailText}
      </div>
    `;
  }

  function buildProfileQuickSummaryHTML(ranked, comp, scores) {
    return `
      <div class="quick-summary">
        <div class="section-subtitle">한눈에 보는 요약</div>
        <div class="quick-grid">${buildQuickCardsHTML(ranked, comp)}</div>
        ${buildQuickFactsHTML(ranked, comp, '13개 컬러 전체 점수는 리포트 맨 뒤 "컬러별 상세 점수"에서 확인하실 수 있습니다.')}
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

  // Relationship-fit read for the TOP1+TOP2 combo: which colors tend to click
  // easily vs. which tend to feel a little friction-prone, plus what synergy
  // and what to watch for in each case. Grounded in data already established
  // elsewhere in the report rather than inventing new relationships:
  // "잘 맞는 컬러" = other colors sharing TOP1/TOP2's 6대 영역 (CCT_DOMAINS) —
  // a similar value orientation reads as easy rapport. "불편할 수 있는 컬러" =
  // TOP1's CCT_COMPLEMENT_MAP candidates — the same "psychologically
  // contrasting orientation" pairing already used for the complement deep-dive,
  // reframed here for how it can feel in a relationship rather than personal growth.
  // Takes the full ranked list: the fit columns are driven by TOP1/TOP2, but
  // the closing "내 강점이 상대에게 닿는 방식" cards cover all three.
  function buildRelationshipFitHTML(ranked) {
    const top1 = ranked[0];
    const top2 = ranked[1];
    const domainOf = (key) => CCT_DOMAINS.find((d) => d.colors.includes(key));
    const top1Domain = domainOf(top1.key);
    const top2Domain = domainOf(top2.key);

    const domainKeys = Array.from(
      new Set([...(top1Domain ? top1Domain.colors : []), ...(top2Domain ? top2Domain.colors : [])])
    ).filter((k) => k !== top1.key && k !== top2.key);
    const complementKeys = CCT_COMPLEMENT_MAP[top1.key] || [];

    // A color can legitimately qualify for BOTH lists: it shares a 강점영역
    // with TOP1/TOP2 (so values line up) while ALSO being TOP1's theoretical
    // contrast pair (so pace and priorities differ). That happens in 46 of the
    // 156 possible TOP1+TOP2 pairings, and printing the same color under both
    // headings reads as a contradiction — so the overlap is pulled out into its
    // own honestly-labelled group instead of being silently assigned to one.
    const bothKeys = domainKeys.filter((k) => complementKeys.includes(k));
    const goodKeys = domainKeys.filter((k) => !bothKeys.includes(k));
    const frictionKeys = complementKeys.filter((k) => !bothKeys.includes(k));

    const goodColors = goodKeys.map((k) => cctColorByKey(k));
    const frictionColors = frictionKeys.map((k) => cctColorByKey(k));
    const bothColors = bothKeys.map((k) => cctColorByKey(k));

    const domainNames = Array.from(
      new Set([top1Domain && top1Domain.name, top2Domain && top2Domain.name].filter(Boolean))
    ).join(", ");

    const chipRow = (colors) =>
      colors
        .map((c) => `<span class="fit-chip" style="background:${c.hex};color:${getContrastText(c.hex)}">${escapeHtml(c.ko)}</span>`)
        .join("");

    // Dedup can empty either column (8 pairings leave no "잘 맞을" color, 3 leave
    // no "불편할" color), so both sides fall back to an explanation rather than
    // rendering an empty chip row.
    const goodBody = goodColors.length
      ? `<div class="fit-chips">${chipRow(goodColors)}</div>
         <p class="fit-text">${escapeHtml(top1.ko)}·${escapeHtml(top2.ko)}${josa(top2.ko, "과", "와")} 같은 '${escapeHtml(
          domainNames
        )}' 영역에 속한 컬러들입니다. 가치관과 접근 방식의 결이 비슷해 대화가 자연스럽게 통하고, 서로를 이해하는 데 큰 노력이 들지 않는 편입니다. 다만 비슷한 성향끼리는 놓치는 부분도 비슷할 수 있어, 가끔은 다른 관점을 가진 사람을 의도적으로 곁에 두는 것도 도움이 됩니다.</p>`
      : `<p class="fit-text">내 TOP 컬러와 같은 영역에 속하면서 아래 '양면적' 조건에 걸리지 않는 컬러가 이번 결과에는 없습니다. 같은 영역의 컬러가 모두 ${escapeHtml(
          top1.ko
        )}의 대비 짝과 겹쳤기 때문이며, 관계가 나쁘다는 뜻이 아닙니다.</p>`;

    const frictionBody = frictionColors.length
      ? `<div class="fit-chips">${chipRow(frictionColors)}</div>
         <p class="fit-text">${escapeHtml(top1.ko)}${josa(top1.ko, "과", "와")} 심리적으로 대비되는 지향을 가진 컬러들입니다. 일하는 속도나 우선순위를 정하는 기준이 달라 처음에는 다소 부딪히거나 답답하게 느껴질 수 있습니다. 다만 이 차이 덕분에 ${escapeHtml(
          top1.ko
        )} 혼자서는 놓치기 쉬운 지점을 채워줄 수 있으니, 불편함 자체보다 "무엇을 다르게 보고 있는지"를 먼저 확인하는 태도가 도움이 됩니다.</p>`
      : `<p class="fit-text">${escapeHtml(
          top1.ko
        )}의 대비 짝이 모두 아래 '양면적' 그룹에 포함되어, 일방적으로 불편하기만 한 컬러는 이번 결과에 없습니다.</p>`;

    const bothBlock = bothColors.length
      ? `
        <div class="fit-col fit-mixed">
          <div class="fit-label">양면적으로 작용할 수 있는 사람 (해당 컬러가 강점인 사람)</div>
          <div class="fit-chips">${chipRow(bothColors)}</div>
          <p class="fit-text">위 두 조건에 동시에 해당하는 컬러입니다. 나와 같은 '${escapeHtml(
            domainNames
          )}' 영역에 속해 지향하는 가치와 대화의 결은 잘 맞지만, 동시에 ${escapeHtml(top1.ko)}${josa(
          top1.ko,
          "과",
          "와"
        )} 심리적으로 대비되는 짝이기도 합니다. 큰 방향에는 쉽게 합의가 되는데 그 방향을 어떤 속도와 순서로 갈지에서는 의견이 갈리기 쉬운 관계로, 목표에 먼저 합의한 뒤 방법을 조율하면 서로의 빈틈을 잘 메워주는 조합이 됩니다.</p>
        </div>
      `
      : "";

    // What each listed person actually brings, one line per color straight from
    // that color's own healthy[] entry — so the chips above are more than a
    // bare list of names.
    const bringRow = (colors) =>
      colors
        .map(
          (c) => `
          <div class="fit-bring">
            <span class="fit-bring-dot" style="background:${c.hex}"></span>
            <span class="fit-bring-name">${escapeHtml(c.ko)} · ${escapeHtml(c.strength)}</span>
            <span class="fit-bring-text">${escapeHtml((c.healthy || [])[0] || "")}</span>
          </div>`
        )
        .join("");

    const allListed = [...goodColors, ...bothColors, ...frictionColors];
    const bringBlock = allListed.length
      ? `
        <div class="fit-extra">
          <div class="section-subtitle">이 사람들이 관계에 가져오는 것</div>
          <p class="section-desc">위에 나온 각 컬러가 강점인 사람이 관계에서 실제로 잘 해내는 일입니다. 잘 맞는 쪽이든 불편한 쪽이든, 상대가 무엇을 잘하는지 알고 있으면 대화의 출발점이 달라집니다.</p>
          <div class="fit-brings">${bringRow(allListed)}</div>
        </div>
      `
      : "";

    // How the reader's own top strengths can land on the other side — all three
    // TOP colors, each with its own card. The "이렇게 비칠 수 있어요" lines are
    // that color's overuse entries (the guide already phrases them in
    // interpersonal terms) and the closing line is one of its healthy entries,
    // so each card shows the same strength's two faces rather than only the
    // negative one.
    const effectCards = ranked
      .slice(0, 3)
      .map((c, i) => {
        const overs = (c.overuse || [])
          .slice(0, 2)
          .map((o) => `<li>${escapeHtml(o)}</li>`)
          .join("");
        const healthyLine = (c.healthy || [])[1] || (c.healthy || [])[0] || "";
        return `
          <div class="fx-card">
            <div class="fx-head">
              <span class="fx-tag" style="background:${c.hex};color:${getContrastText(c.hex)}">TOP${i + 1} · ${escapeHtml(
          c.ko
        )}</span>
              <span class="fx-strength">${escapeHtml(c.strength)}</span>
            </div>
            <div class="fx-sub">과하게 나올 때 상대가 겪을 수 있는 일</div>
            <ul class="fx-list">${overs}</ul>
            <div class="fx-good">건강하게 작동할 때는 — ${escapeHtml(healthyLine)}</div>
          </div>`;
      })
      .join("");
    const myEffectBlock = `
        <div class="fit-extra">
          <div class="section-subtitle">내 강점이 상대에게 닿는 방식</div>
          <p class="section-desc">관계의 어려움은 상대의 성향만이 아니라 내 강점이 과하게 나올 때도 생깁니다. 같은 강점이라도 조절되면 상대에게 도움이 되고, 지나치면 부담이 됩니다. TOP 3 강점 각각의 두 얼굴을 정리했습니다.</p>
          <div class="fx-grid">${effectCards}</div>
        </div>
      `;

    // Where the reader and each friction-side color are literally looking at
    // different things — both halves are the two colors' own core definitions,
    // put next to each other. Names the source of the friction instead of just
    // labelling it "불편할 수 있음".
    const diffColors = [...frictionColors, ...bothColors];
    const diffRows = diffColors
      .map(
        (c) => `
        <div class="fit-diff-row">
          <div class="fit-diff-who"><span class="fit-bring-dot" style="background:${c.hex}"></span>${escapeHtml(c.ko)}</div>
          <div class="fit-diff-cols">
            <div class="fit-diff-cell"><span class="fit-diff-tag">나</span>${escapeHtml(top1.core)}</div>
            <div class="fit-diff-cell"><span class="fit-diff-tag">상대</span>${escapeHtml(c.core)}</div>
          </div>
        </div>`
      )
      .join("");
    const diffBlock = diffColors.length
      ? `
        <div class="fit-extra">
          <div class="section-subtitle">서로 다르게 보고 있는 지점</div>
          <p class="section-desc">부딪힘의 원인은 대개 성격이 아니라 무엇을 먼저 보느냐의 차이입니다. 내 TOP1 강점과 상대 강점이 각각 무엇에 초점을 두는지 나란히 놓았습니다.</p>
          <div class="fit-diffs">${diffRows}</div>
        </div>
      `
      : "";

    return `
      <div class="fit-block">
        <div class="fit-col fit-good">
          <div class="fit-label">잘 맞을 수 있는 사람 (해당 컬러가 강점인 사람)</div>
          ${goodBody}
        </div>
        <div class="fit-col fit-friction">
          <div class="fit-label">다소 불편하게 느껴질 수 있는 사람 (해당 컬러가 강점인 사람)</div>
          ${frictionBody}
        </div>
      </div>
      ${bothBlock}
      ${bringBlock}
      ${diffBlock}
      ${myEffectBlock}
    `;
  }

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
      ["잘 드러나는 모습", (top1.healthy || [])[0] || "", (comp.healthy || [])[0] || ""],
      ["지나칠 때", (top1.overuse || [])[0] || "", (comp.overuse || [])[0] || ""],
      ["스스로 점검할 질문", top1.growthQuestion, comp.growthQuestion],
    ];
    const head = (c, role) => `
      <div class="cmp-col-head">
        <div class="cmp-role">${escapeHtml(role)}</div>
        <div class="cmp-name"><span class="cmp-dot" style="background:${c.hex}"></span>${escapeHtml(c.ko)} · ${escapeHtml(
      c.strength
    )}</div>
      </div>`;
    const body = rows
      .map(
        ([label, a, b]) => `
        <div class="cmp-row">
          <div class="cmp-label">${escapeHtml(label)}</div>
          <div class="cmp-val cmp-val-a">${escapeHtml(a)}</div>
          <div class="cmp-val cmp-val-b">${escapeHtml(b)}</div>
        </div>`
      )
      .join("");
    return `
      <div class="cmp-table">
        <div class="cmp-row cmp-header">
          <div class="cmp-label"></div>
          <div class="cmp-val">${head(top1, "강점 컬러")}</div>
          <div class="cmp-val">${head(comp, "보완 컬러")}</div>
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
    const chip = (c) =>
      `<span class="syn-chip" style="background:${c.hex};color:${getContrastText(c.hex)}">${escapeHtml(c.ko)} · ${escapeHtml(
        c.strength
      )}</span>`;

    const pick = (arr, i) => (arr && arr[i] ? arr[i] : "");
    const steps = [
      pick(top1.actions, 0),
      pick(comp.actions, 0),
      `중요한 결정 앞에서는 "${escapeHtml(top1.growthQuestion)}"와 "${escapeHtml(comp.growthQuestion)}"를 나란히 놓고 점검해봅니다.`,
    ].filter(Boolean);

    return `
      <div class="syn-wrap">
        <div class="syn-pair">${chip(top1)}<span class="syn-plus">+</span>${chip(comp)}</div>

        <div class="syn-row">
          <div class="syn-label">두 컬러가 함께 만드는 힘</div>
          <p class="syn-text">${escapeHtml(top1.ko)}${josa(top1.ko, "은", "는")} '${escapeHtml(top1.core)}'${josa(
      top1.core,
      "이",
      "가"
    )} 중심이고, ${escapeHtml(comp.ko)}${josa(comp.ko, "은", "는")} '${escapeHtml(comp.core)}'${josa(
      comp.core,
      "이",
      "가"
    )} 중심입니다. 방향이 서로 반대이기 때문에, 한쪽이 놓치는 지점을 다른 쪽이 정확히 메워줍니다. ${escapeHtml(
      top1.ko
    )}${euro(top1.ko)} 일을 움직이고 ${escapeHtml(comp.ko)}${euro(
      comp.ko
    )} 그 움직임을 다듬는 흐름이 만들어질 때, 속도와 완성도를 동시에 챙기는 조합이 됩니다.</p>
        </div>

        <div class="syn-row">
          <div class="syn-label">균형이 무너질 때 생기는 일</div>
          <p class="syn-text">${escapeHtml(top1.ko)}에만 기대면 ${escapeHtml(
      (pick(top1.overuse, 0) || "").replace(/\.$/, "")
    )}. 이때 ${escapeHtml(comp.ko)}의 '${escapeHtml(comp.core)}'${josa(
      comp.core,
      "이",
      "가"
    )} 제동 장치가 되어 줍니다. 반대로 ${escapeHtml(comp.ko)} 쪽으로만 기울면 ${escapeHtml(
      (pick(comp.overuse, 0) || "").replace(/\.$/, "")
    )}. 두 컬러 중 어느 쪽도 정답이 아니라, 상황에 따라 비중을 바꿔 쓰는 것이 핵심입니다.</p>
        </div>

        <div class="syn-row">
          <div class="syn-label">이렇게 번갈아 써보세요</div>
          <ul class="syn-list">${steps.map((s) => `<li>${escapeHtml(s).replace(/&quot;/g, '"')}</li>`).join("")}</ul>
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
    const topText = `현재 13개 컬러 중 ${top.map((c) => c.ko).join("·")}${josa(top[top.length - 1].ko, "이", "가")} 상대적으로 높게 나타났습니다. ${top
      .map((c) => c.core)
      .join(", ")} 등을 일상에서 비교적 자연스럽게 활용하고 있는 것으로 보입니다.`;

    const compColor = comp.chosen;
    const compText = `${top1.ko}(${top1.strength})의 핵심 강점인 '${top1.core}'${josa(top1.core, "과", "와")} 심리적으로 대비되는 지향을 가진 컬러입니다. 점수가 낮다고 부족하거나 잘못된 것이 아니라, 아직 충분히 활용되지 않은 성장 자원에 가깝습니다. ${compColor.ko}의 '${compColor.core}'${josa(compColor.core, "을", "를")} 의도적으로 시도해보면 ${top1.ko} 하나에만 치우치지 않는 균형 잡힌 강점 조합을 만들 수 있습니다.`;

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
          ${top1.ko}${josa(top1.ko, "이", "가")} '${top1.core}'${josa(top1.core, "을", "를")} 통해 발휘되는 힘이라면, ${compColor.ko}${josa(compColor.ko, "은", "는")} '${compColor.core}'${josa(compColor.core, "을", "를")}
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

  function buildActionGuideHTML(ranked, comp, scores) {
    const top3 = ranked.slice(0, 3);

    // 3 actions per color (was 2) — this section owns a full page now, and the
    // guide data carries 5 per color, so there is no need to truncate so hard.
    const topActionsHtml = top3
      .map((c, i) => {
        const items = (c.actions || [])
          .slice(0, 3)
          .map((a) => `<li>${escapeHtml(a)}</li>`)
          .join("");
        return `
          <div class="ag-item">
            <div class="ag-item-label" style="color:${c.hex}">TOP${i + 1} · ${escapeHtml(c.ko)} · ${escapeHtml(c.strength)}</div>
            <ul>${items}</ul>
          </div>
        `;
      })
      .join("");

    // Grouped per TOP color rather than one flat list — the flat version made
    // it hard to see which warning belonged to which strength. Each card also
    // closes with the balancing move, taken from that color's complement pair
    // so the reader gets a correction, not just a warning.
    const warnCards = top3
      .map((c, i) => {
        const items = (c.overuse || []).map((o) => `<li>${escapeHtml(o)}</li>`).join("");
        // MUST use getComplement() — the same score-aware rule the report's own
        // 보완 컬러 uses. Taking CCT_COMPLEMENT_MAP[key][0] blindly (as this
        // once did) picked a different color than the 보완 컬러 section for the
        // very same TOP1, so the report contradicted itself across two pages.
        const balancePick = getComplement(c.key, scores);
        const balanceColor = balancePick && balancePick.chosen ? balancePick.chosen : null;
        const isReportComplement = balanceColor && balanceColor.key === comp.chosen.key;
        const balance = balanceColor
          ? `조절이 필요할 때는 ${isReportComplement ? "보완 컬러인 " : ""}<b style="color:${
              balanceColor.hex
            }">${escapeHtml(balanceColor.ko)}</b>의 '${escapeHtml(balanceColor.core)}'${josa(
              balanceColor.core,
              "을",
              "를"
            )} 잠시 빌려오면 균형이 잡힙니다.`
          : "";
        return `
          <div class="ag-warn-card">
            <div class="ag-warn-head">
              <span class="ag-warn-tag" style="background:${c.hex};color:${getContrastText(c.hex)}">TOP${i + 1} · ${escapeHtml(
          c.ko
        )}</span>
              <span class="ag-warn-strength">${escapeHtml(c.strength)}</span>
            </div>
            <ul class="ag-warn-list">${items}</ul>
            ${balance ? `<div class="ag-warn-balance">${balance}</div>` : ""}
          </div>`;
      })
      .join("");

    // The guide already ships one self-check question per color; collecting the
    // TOP3 + complement ones gives the reader a concrete way to tell whether a
    // strength is being used well or overused, which the lists above only imply.
    const checkColors = [...top3, comp.chosen];
    const checkItems = checkColors
      .map(
        (c, i) => `
        <div class="ag-check">
          <div class="ag-check-tag" style="background:${c.hex};color:${getContrastText(c.hex)}">${escapeHtml(c.ko)}</div>
          <div class="ag-check-q">${escapeHtml(c.growthQuestion)}</div>
        </div>`
      )
      .join("");

    const missionCandidates = [
      (top3[0].actions || [])[0],
      (top3[1] && top3[1].actions ? top3[1].actions[1] : null),
      (comp.chosen.actions || [])[0],
      "오늘 하루, 보완 컬러의 관점으로 한 번 더 생각해보고 짧게 기록을 남겨보세요.",
    ].filter(Boolean);
    const missionItems = missionCandidates.map((m) => `<li>${escapeHtml(m)}</li>`).join("");

    return `
      <div class="ag-block">
        <div class="section-subtitle">TOP 3 강점 활용법</div>
        <p class="section-desc">각 강점이 실제로 힘을 발휘하는 구체적인 장면입니다.</p>
        <div class="ag-grid">${topActionsHtml}</div>
      </div>
      <div class="ag-block">
        <div class="section-subtitle">과사용 경고 신호 체크리스트</div>
        <p class="section-desc">강점은 지나치면 약점처럼 작동합니다. 아래 신호가 반복된다면 잠시 속도를 조절해볼 시점입니다.</p>
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
    `;
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
          <div class="t3-axis-notes">${axisNotes.map((n) => `<p>${n}</p>`).join("")}</div>
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
    const toIdentity = (core) => (core.endsWith("힘") ? core.slice(0, -1) + "사람" : `${core}${josa(core, "을", "를")} 가진 사람`);

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
    const comp = getComplement(top1.key, scores, ranked);
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
    // ONE rigid block: title + rationale + the color card's intro AND detail
    // halves together. Previously the detail half ("건강할 때 / 과도할 때 /
    // 예시") was a separate block and reliably spilled onto the next page,
    // leaving the card cut off right after its "이 강점이 드러나는 모습"
    // heading. The Venn diagram that used to sit here moved to the synergy
    // section below, which is what freed the vertical room for this to fit.
    rigidBreak(
      `<div class="section-title">보완 컬러 심층 분석</div>${buildComplementRationaleHTML(
        top1,
        comp.chosen
      )}${buildColorSectionWholeHTML(comp.chosen, "보완 컬러 · 성장 자원")}`
    );

    // Concrete, actionable guidance: how to use the TOP3 strengths, warning signs
    // of overuse, and a short weekly practice checklist.
    // Each of these three owns a full page from here on, per the report layout:
    // 실전 지침 → 시너지 → 관계 → 6대 강점영역 → 점수 부록.
    rigidBreak(`<div class="section-title">실전 지침</div>${buildActionGuideHTML(ranked, comp, scores)}`);

    // ---- Flexible supplementary section (domains / axes) ----
    // Split into small chunks so generatePdf() can slot them into whatever
    // leftover page space the rigid sections above leave behind. The raw
    // 13-color score bars used to be flexible chunks defined alongside these,
    // which meant they could get pulled into the gap between the complement
    // intro and its own detail half (or after the action guide), interrupting
    // an unrelated section mid-flow — see the dedicated rigid appendix near
    // the end of this function for where that list lives now.
    const domainScores = computeDomainScores(scores);
    let domainBlock = `<div class="section-title">6대 상위 강점영역</div>`;
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
      <div class="section-title">강점 컬러와 보완 컬러의 시너지</div>
      <p class="section-desc">가장 뚜렷한 강점 컬러와, 그와 심리적으로 대비되는 보완 컬러를 나란히 비교하고 두 컬러가 함께 작동할 때 만들어지는 효과를 정리했습니다.</p>
      ${buildSynergyVennHTML(top1, comp.chosen)}
      ${buildColorCompareTableHTML(ranked[0], comp.chosen)}
      ${buildStrengthBalanceHTML(ranked[0], comp.chosen)}
    `);

    if (ranked.length >= 2) {
      // These boxes are about OTHER PEOPLE — whoever has those colors as their
      // strengths — not about more of the reader's own colors.
      rigidBreak(`
        <div class="section-title">관계에서 만나는 컬러</div>
        <p class="section-desc">내 TOP 컬러를 기준으로, 그 컬러가 강점인 사람들과 어떤 관계를 맺기 쉬운지 정리했습니다. 사람 자체의 좋고 나쁨이 아니라 성향의 결이 얼마나 비슷한지를 뜻합니다.</p>
        ${buildRelationshipFitHTML(ranked)}
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
  // ---------- Carrying a finished result to another browser ----------
  // In-app webviews can't save files (see below), and the fix is to continue in
  // the real browser. Re-taking 65 questions there would be absurd, so the
  // finished scores travel in the URL: the target browser restores the exact
  // same result screen and downloads from there. Only the 13 averages and the
  // display name are carried — no answers, nothing sent to any server.
  const RESULT_PARAM = "r";

  function encodeResultParam(scores, name) {
    try {
      const payload = {
        n: name || "",
        s: CCT_COLORS.map((c) => Math.round((scores[c.key] || 0) * 10)),
      };
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
      if (!payload || !Array.isArray(payload.s) || payload.s.length !== CCT_COLORS.length) return null;

      const scores = {};
      for (let i = 0; i < CCT_COLORS.length; i++) {
        const v = Number(payload.s[i]) / 10;
        if (!isFinite(v) || v < 1 || v > 5) return null;
        scores[CCT_COLORS[i].key] = v;
      }
      return { scores, name: typeof payload.n === "string" ? payload.n.slice(0, 12) : "" };
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
  function restoreResultFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get(RESULT_PARAM);
    if (!raw) return false;
    const restored = decodeResultParam(raw);
    if (!restored) return false;

    userName = restored.name;
    // resultLogged guard: this result was already logged to the sheet when it
    // was originally completed — restoring it must not create a duplicate row.
    resultLogged = true;
    renderResult(restored.scores);
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
    answers = [];
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
  restoreResultFromUrl();
})();
