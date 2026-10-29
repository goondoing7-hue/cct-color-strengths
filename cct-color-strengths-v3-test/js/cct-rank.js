/* ============================================================
   CCT 컬러성격강점검사 — 순위·보완컬러 결정 로직
   (v1 · v2 · v3 공용 — 세 폴더의 이 파일은 항상 같아야 합니다)

   원칙
   - 컬러 점수(5문항 평균)는 절대 바꾸지 않는다. 동점은 "순위(rank)"만 따로 정한다.
   - 6대 강점영역은 CCT의 해석적 분류이며, 동점 처리의 보조 기준으로만 쓴다.

   ① 순위 (TOP1~TOP3에 영향을 주는 동점만 처리)
     1단계 13컬러 평균점수 내림차순
     2단계 동점 컬러가 서로 다른 강점영역이면 → 영역 평균이 높은 컬러가 위
     3단계 같은 영역이거나 영역 평균까지 같으면 → 강제선택(대표문장, 색상명 숨김)
           3개 이상이면 하나 고르고, 남은 컬러로 같은 방식 반복 (TOP3가 정해질 때까지)

   ② 보완컬러 (TOP1의 보완 후보 2개 중 하나)
     1단계 두 후보 점수 차이 0.4 이상 → 점수가 낮은 후보
     2단계 차이 0 또는 0.2 → 후보가 속한 강점영역 평균이 낮은 후보
     3단계 영역 평균까지 (사실상) 같으면 → TOP3에 들지 않은 후보
     4단계 그래도 못 정하면 → 강제선택 1문항

   "사실상 동일" = 영역 평균 차이 0.05 미만 (DOMAIN_EPS)
   ============================================================ */
(function (root) {
  "use strict";

  var DOMAIN_EPS = 0.05;

  // data.js의 const 전역은 window 속성이 아니므로 이름으로 직접 참조한다.
  /* global CCT_COLORS, CCT_DOMAINS, CCT_COMPLEMENT_MAP */
  function colors() { return typeof CCT_COLORS !== "undefined" ? CCT_COLORS : root.CCT_COLORS; }
  function domains() { return typeof CCT_DOMAINS !== "undefined" ? CCT_DOMAINS : root.CCT_DOMAINS; }
  function compMap() { return typeof CCT_COMPLEMENT_MAP !== "undefined" ? CCT_COMPLEMENT_MAP : root.CCT_COMPLEMENT_MAP; }
  function byKey(k) { return colors().find(function (c) { return c.key === k; }); }
  // 평균점수는 5문항 평균이라 0.2 단위 — 부동소수 오차 없이 비교하려고 ×100 정수로.
  function q(v) { return Math.round((Number(v) || 0) * 100); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }

  function domainOf(key) {
    return domains().find(function (d) { return d.colors.indexOf(key) !== -1; });
  }
  function domainAvg(domain, scores) {
    var sum = 0;
    domain.colors.forEach(function (k) { sum += Number(scores[k]) || 0; });
    return domain.colors.length ? sum / domain.colors.length : 0;
  }
  function domainAvgOf(key, scores) {
    var d = domainOf(key);
    return d ? domainAvg(d, scores) : 0;
  }
  function sameAvg(a, b) { return Math.abs(a - b) < DOMAIN_EPS - 1e-9; }

  function fmt(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function fmt2(v) { return r2(v).toFixed(2).replace(/0$/, ""); }

  /**
   * 순위 결정.
   * @param scores  {RED: 4.4, ...}
   * @param picks   강제선택으로 고른 컬러 key 목록 (선택 순서대로)
   * @param opts    {fallback: true} 이면 강제선택이 필요해도 묻지 않고 기본 순서로 정함
   *                (예전 결과 링크 복원 등 사용자에게 물을 수 없을 때)
   * @return {ranked:[{...color, score, rank}], pending:null|{type:"rank", keys:[...], slot}, notes:[...]}
   */
  function resolveRanking(scores, picks, opts) {
    picks = picks || [];
    opts = opts || {};
    var order = colors().map(function (c, i) { return { key: c.key, idx: i, s: q(scores[c.key]) }; });
    // 1단계: 점수 내림차순 (같은 점수는 일단 기본 컬러 순서)
    order.sort(function (a, b) { return b.s - a.s || a.idx - b.idx; });

    var out = [];
    var notes = [];
    var used = {};
    var pending = null;
    var i = 0;
    while (i < order.length) {
      var j = i;
      while (j < order.length && order[j].s === order[i].s) j++;
      var group = order.slice(i, j).map(function (o) { return o.key; });

      if (group.length === 1 || i >= 3) {
        // 동점이 없거나, TOP3 바깥의 동점 → 순위 처리 불필요
        out = out.concat(group);
        i = j;
        continue;
      }

      // 2단계: 강점영역 평균으로 묶음 나누기 (평균이 사실상 같은 컬러끼리 한 묶음)
      var withAvg = group.map(function (k) {
        return { key: k, avg: domainAvgOf(k, scores), idx: colors().findIndex(function (c) { return c.key === k; }) };
      });
      withAvg.sort(function (a, b) { return b.avg - a.avg || a.idx - b.idx; });
      var sub = [];
      withAvg.forEach(function (w) {
        var last = sub[sub.length - 1];
        if (last && sameAvg(last[0].avg, w.avg)) last.push(w);
        else sub.push([w]);
      });

      var tieNote = {
        type: "tie",
        score: order[i].s / 100,
        keys: group.slice(),
        steps: [],
      };
      if (sub.length > 1) {
        tieNote.steps.push({
          type: "domain",
          items: withAvg.map(function (w) {
            var d = domainOf(w.key);
            return { key: w.key, domain: d ? d.name : "", avg: r2(w.avg) };
          }),
        });
      }

      for (var si = 0; si < sub.length; si++) {
        var keys = sub[si].map(function (w) { return w.key; });
        if (keys.length === 1 || out.length >= 3) {
          out = out.concat(keys);
          continue;
        }
        // 3단계: 강제선택 — TOP3 자리가 남아 있는 동안 하나씩 고른다
        var remaining = keys.slice();
        while (remaining.length > 1 && out.length < 3) {
          var pick = null;
          for (var p = 0; p < picks.length; p++) {
            if (!used[p] && remaining.indexOf(picks[p]) !== -1) { pick = picks[p]; used[p] = true; break; }
          }
          if (!pick) {
            if (!opts.fallback) {
              pending = pending || { type: "rank", keys: remaining.slice(), slot: out.length + 1 };
              // 질문이 남았어도 나머지 순위는 임시로 채워 둔다 (화면에는 안 씀)
            }
            pick = remaining[0];
            tieNote.steps.push({ type: opts.fallback && !pending ? "default" : "pending", keys: remaining.slice(), pick: pick });
          } else {
            tieNote.steps.push({ type: "choice", keys: remaining.slice(), pick: pick });
          }
          out.push(pick);
          remaining.splice(remaining.indexOf(pick), 1);
        }
        out = out.concat(remaining);
      }
      notes.push(tieNote);
      i = j;
    }

    var ranked = out.map(function (k, n) {
      var c = byKey(k);
      var o = {};
      for (var key in c) o[key] = c[key];
      o.score = Number(scores[k]) || 0;
      o.rank = n + 1;
      return o;
    });
    return { ranked: ranked, pending: pending, notes: notes };
  }

  /**
   * 보완컬러 결정.
   * @param top1Key 기준이 되는 주강점 컬러
   * @param ranked  resolveRanking().ranked (TOP3 확인용)
   * @param opts    {pick: "GREEN"} 강제선택 응답, {fallback:true} 묻지 않고 기본 순서
   * @return {chosen, all, step, reason, pending}
   */
  function resolveComplement(top1Key, scores, ranked, opts) {
    opts = opts || {};
    var keys = (compMap()[top1Key] || []).slice();
    var all = keys.map(function (k) {
      var c = byKey(k);
      var o = {};
      for (var key in c) o[key] = c[key];
      o.score = Number(scores[k]) || 0;
      return o;
    });
    if (all.length < 2) return { chosen: all[0], all: all, step: 0, reason: null, pending: null };
    var a = all[0], b = all[1];
    var lowFirst = q(a.score) <= q(b.score) ? [a, b] : [b, a];
    var res = function (chosen, step, info) {
      var other = chosen.key === a.key ? b : a;
      var sorted = [chosen, other];
      return { chosen: chosen, other: other, all: sorted, step: step, info: info || {}, pending: null };
    };

    // 1단계: 점수 차이 0.4 이상
    var diff = Math.abs(q(a.score) - q(b.score));
    if (diff >= 40) return res(lowFirst[0], 1, { diff: diff / 100 });

    // 2단계: 각 후보가 속한 강점영역 평균 비교
    var da = domainOf(a.key), db = domainOf(b.key);
    var avgA = domainAvgOf(a.key, scores), avgB = domainAvgOf(b.key, scores);
    var domainInfo = {
      diff: diff / 100,
      domains: [
        { key: a.key, domain: da ? da.name : "", avg: r2(avgA) },
        { key: b.key, domain: db ? db.name : "", avg: r2(avgB) },
      ],
      sameDomain: da && db && da.key === db.key,
    };
    if (!sameAvg(avgA, avgB)) return res(avgA < avgB ? a : b, 2, domainInfo);

    // 3단계: 한 후보만 이미 TOP3면 → TOP3 밖의 후보
    var top3 = (ranked || []).slice(0, 3).map(function (c) { return c.key; });
    var aIn = top3.indexOf(a.key) !== -1, bIn = top3.indexOf(b.key) !== -1;
    if (aIn !== bIn) {
      var outside = aIn ? b : a;
      domainInfo.top3Key = aIn ? a.key : b.key;
      return res(outside, 3, domainInfo);
    }

    // 4단계: 강제선택
    if (opts.pick && (opts.pick === a.key || opts.pick === b.key)) {
      return res(opts.pick === a.key ? a : b, 4, domainInfo);
    }
    var r = res(lowFirst[0], opts.fallback ? 5 : 4, domainInfo);
    if (!opts.fallback) r.pending = { type: "complement", keys: [a.key, b.key], top1: top1Key };
    return r;
  }

  root.CCTRank = {
    DOMAIN_EPS: DOMAIN_EPS,
    resolveRanking: resolveRanking,
    resolveComplement: resolveComplement,
    domainOf: domainOf,
    domainAvg: domainAvg,
    domainAvgOf: domainAvgOf,
    fmt: fmt,
    fmt2: fmt2,
  };
})(typeof window !== "undefined" ? window : globalThis);
