/* smart.js - SMART on FHIR prefill for the Initial Dosing page.
 *
 * After launch.html sends the user through the EHR's login, index.html loads
 * this file. It reads the patient's weight and CBC results from the FHIR
 * server and fills the form. Everything stays in the browser. Values are only
 * ever prefilled, never submitted, and the clinician can change any of them.
 *
 * If the page was not opened through a SMART launch, this file does nothing.
 */
(function (root) {
  "use strict";

  const LOINC = "http://loinc.org";
  const STALE_DAYS = 30;

  // Which LOINC codes count as each value. The first code is the most
  // common one; the others are common variants.
  const ANALYTES = {
    weight:              { label: "Weight",                       codes: ["29463-7", "3141-9"] },
    hemoglobin:          { label: "Hemoglobin",                   codes: ["718-7", "20509-6"] },
    platelet:            { label: "Platelet count",               codes: ["777-3", "26515-7", "778-1"] },
    neutrophil:          { label: "Absolute neutrophil count",    codes: ["751-8", "26499-4", "753-2"] },
    reticulocyte:        { label: "Absolute reticulocyte count",  codes: ["14196-0"] },
    reticulocytePercent: { label: "Reticulocyte %",               codes: ["4679-7", "17849-1"] },
    rbc:                 { label: "RBC count",                    codes: ["789-8", "26453-1"] }
  };

  const FIELD_IDS = {
    weight: "weightInput",
    hemoglobin: "hemoglobinInput",
    platelet: "plateletInput",
    neutrophil: "neutrophilInput",
    reticulocyte: "reticulocyteInput",
    reticulocytePercent: "reticulocytePercentInput",
    rbc: "rbcInput"
  };

  // Needed to decide whether to switch the "labs available" answer to Yes.
  const REQUIRED_LABS = ["hemoglobin", "platelet", "neutrophil", "reticulocyte"];

  // Unit tables: multiply the server's number by the factor to get the
  // unit the calculator uses. Keys are lower-case with spaces removed.
  const WEIGHT_TO_KG = {
    "kg": 1, "g": 0.001,
    "[lb_av]": 0.45359237, "lb_av": 0.45359237, "lb": 0.45359237, "lbs": 0.45359237,
    "[oz_av]": 0.028349523125, "oz": 0.028349523125
  };
  const HB_TO_G_DL = { "g/dl": 1, "g/l": 0.1, "mg/dl": 0.001 };
  const COUNT_TO_E9_L = {
    "10*9/l": 1, "10^9/l": 1, "x10^9/l": 1,
    "10*3/ul": 1, "10^3/ul": 1, "10*3/mm3": 1, "10*3/mcl": 1, "k/ul": 1,
    "10*12/l": 1000, "10*6/ul": 1000, "10*6/mm3": 1000, "10*6/mcl": 1000, "m/ul": 1000,
    "/ul": 0.001, "/mm3": 0.001, "/mcl": 0.001, "10*6/l": 0.001
  };
  const PERCENT = { "%": 1 };

  const BAD_STATUS = new Set(["entered-in-error", "cancelled", "registered"]);

  function normalizeUnit(u) {
    if (typeof u !== "string") return "";
    return u.toLowerCase()
      .replace(/\{[^}]*\}/g, "")
      .replace(/[µμ]/g, "u")
      .replace(/\s+/g, "");
  }

  // Returns the value in the calculator's unit, or null if the unit is not
  // recognized or the result is something like "<5" instead of a number.
  function convert(key, q) {
    if (!q || typeof q.value !== "number" || !isFinite(q.value) || q.comparator) return null;
    const table = key === "weight" ? WEIGHT_TO_KG
      : key === "hemoglobin" ? HB_TO_G_DL
      : key === "reticulocytePercent" ? PERCENT
      : COUNT_TO_E9_L;
    const candidates = [q.code, q.unit];
    for (let i = 0; i < candidates.length; i++) {
      const factor = table[normalizeUnit(candidates[i])];
      if (factor !== undefined) return q.value * factor;
    }
    return null;
  }

  function obsDate(o) {
    return o.effectiveDateTime ||
      (o.effectivePeriod && o.effectivePeriod.start) ||
      o.effectiveInstant || o.issued || null;
  }

  // Newest usable result for one analyte.
  function pickLatest(key, resources, warnings) {
    const usable = (resources || [])
      .filter(function (r) {
        return r && r.resourceType === "Observation" && !BAD_STATUS.has(r.status) && r.valueQuantity;
      })
      .sort(function (a, b) { return (Date.parse(obsDate(b)) || 0) - (Date.parse(obsDate(a)) || 0); });
    for (let i = 0; i < usable.length; i++) {
      const v = convert(key, usable[i].valueQuantity);
      if (v !== null) return { value: v, date: obsDate(usable[i]) };
      const q = usable[i].valueQuantity;
      warnings.push(ANALYTES[key].label + ": skipped a result with unrecognized units (" +
        (q.unit || q.code || "none") + ") or a non-numeric value.");
    }
    return null;
  }

  function buildResult(byKey, now) {
    const warnings = [];
    const found = {};
    Object.keys(ANALYTES).forEach(function (key) {
      const hit = pickLatest(key, byKey[key], warnings);
      if (hit) found[key] = hit;
    });

    // No absolute reticulocyte count? Work it out from % and RBC (in x10^9/L).
    let derivedArc = false;
    if (!found.reticulocyte && found.reticulocytePercent && found.rbc) {
      const a = Date.parse(found.reticulocytePercent.date) || 0;
      const b = Date.parse(found.rbc.date) || 0;
      found.reticulocyte = {
        value: found.reticulocytePercent.value / 100 * found.rbc.value,
        date: a <= b ? found.reticulocytePercent.date : found.rbc.date
      };
      derivedArc = true;
    }

    Object.keys(found).forEach(function (key) {
      const t = Date.parse(found[key].date);
      found[key].stale = isFinite(t) ? (now - t) / 86400000 > STALE_DAYS : false;
      found[key].value = Number(found[key].value.toFixed(2));
    });

    const missingLabs = REQUIRED_LABS.filter(function (k) { return !found[k]; });
    return {
      found: found,
      warnings: warnings,
      derivedArc: derivedArc,
      missingLabs: missingLabs,
      labsComplete: missingLabs.length === 0
    };
  }

  /* ---------------- browser-only part ---------------- */

  function el(doc, tag, text, className) {
    const e = doc.createElement(tag);
    if (text) e.textContent = text;
    if (className) e.className = className;
    return e;
  }

  function showBanner(doc, build) {
    const old = doc.getElementById("smartBanner");
    if (old) old.remove();
    const box = el(doc, "div", "", "smart-banner");
    box.id = "smartBanner";
    build(box);
    const form = doc.getElementById("dosingForm");
    form.parentNode.insertBefore(box, form);
  }

  function dateOnly(d) { return d ? String(d).slice(0, 10) : "date unknown"; }

  function applyToForm(doc, res, patientName) {
    Object.keys(FIELD_IDS).forEach(function (key) {
      const input = doc.getElementById(FIELD_IDS[key]);
      if (input && res.found[key]) {
        input.value = res.found[key].value;
        input.classList.add("prefilled");
        input.addEventListener("input", function () { input.classList.remove("prefilled"); }, { once: true });
      }
    });

    // Only switch labs to "Yes" when all four required values were found.
    // A blank lab is read as 0, which the toxicity check would treat as a
    // dangerously low count, so a partial set is never turned on automatically.
    let labsEnabled = false;
    if (res.labsComplete) {
      const yes = doc.getElementById("labs_yes");
      if (yes) {
        yes.checked = true;
        yes.dispatchEvent(new root.Event("change", { bubbles: true }));
        labsEnabled = true;
      }
    }

    showBanner(doc, function (box) {
      box.appendChild(el(doc, "strong", "Loaded from the EHR" + (patientName ? " for " + patientName : "") + "."));
      const list = doc.createElement("ul");
      Object.keys(ANALYTES).forEach(function (key) {
        const f = res.found[key];
        if (!f) return;
        const unit = key === "weight" ? " kg" : key === "hemoglobin" ? " g/dL"
          : key === "reticulocytePercent" ? " %" : " x10^9/L";
        let line = ANALYTES[key].label + ": " + f.value + unit + " (" + dateOnly(f.date) + ")";
        if (key === "reticulocyte" && res.derivedArc) line += " - calculated from RBC and reticulocyte %";
        if (f.stale) line += " - older than " + STALE_DAYS + " days";
        list.appendChild(el(doc, "li", line, f.stale ? "stale" : ""));
      });
      box.appendChild(list);

      const notFound = Object.keys(ANALYTES).filter(function (k) {
        return !res.found[k] && !(k === "reticulocytePercent" || k === "rbc") ;
      }).map(function (k) { return ANALYTES[k].label; });
      if (notFound.length) box.appendChild(el(doc, "p", "Not found in the record: " + notFound.join(", ") + "."));

      if (!res.found.weight) {
        box.appendChild(el(doc, "p", "No weight was found, so enter it manually."));
      }
      if (!labsEnabled) {
        box.appendChild(el(doc, "p",
          "Baseline labs were not switched on because some required values are missing" +
          (res.missingLabs.length ? " (" + res.missingLabs.map(function (k) { return ANALYTES[k].label; }).join(", ") + ")" : "") +
          ". If you answer Yes, enter every lab value; a blank value is counted as 0."));
      }
      res.warnings.forEach(function (w) { box.appendChild(el(doc, "p", w, "warn")); });
      box.appendChild(el(doc, "p", "Highlighted fields were filled automatically. Check them before relying on the recommendation.", "note"));
    });
  }

  function showMessage(doc, text) {
    showBanner(doc, function (box) {
      box.classList.add("error");
      box.appendChild(el(doc, "p", text));
    });
  }

  async function fetchObservations(client) {
    const pid = encodeURIComponent(client.patient.id);
    const errors = [];
    const byKey = {};
    await Promise.all(Object.keys(ANALYTES).map(async function (key) {
      const codes = ANALYTES[key].codes
        .map(function (c) { return encodeURIComponent(LOINC + "|" + c); })
        .join(",");
      try {
        let res = await client.request("Observation?patient=" + pid + "&code=" + codes + "&_sort=-date&_count=5");
        if (Array.isArray(res)) res = res[0];
        byKey[key] = ((res && res.entry) || []).map(function (e) { return e.resource; });
      } catch (e) {
        byKey[key] = [];
        errors.push(ANALYTES[key].label);
      }
    }));
    return { byKey: byKey, errors: errors };
  }

  async function init() {
    const doc = root.document;
    if (!doc.getElementById("dosingForm")) return;

    const params = new root.URLSearchParams(root.location.search);
    const returning = params.has("state") || params.has("error");
    let hasSession = false;
    try { hasSession = !!root.sessionStorage.getItem("SMART_KEY"); } catch (e) { /* storage blocked */ }

    // The EHR opened this page directly (index.html) instead of launch.html,
    // so the login step never ran. Say so instead of silently doing nothing.
    if (params.has("iss") && !returning) {
      showMessage(doc, "This page was opened by an EHR launch, but the login step was skipped. " +
        "The app's launch URL must point to launch.html, not index.html. You can still enter values manually.");
      return;
    }
    if (!returning && !hasSession) return; // opened normally: nothing to do

    if (!root.FHIR) {
      showMessage(doc, "The SMART client library did not load (it comes from cdn.jsdelivr.net), so patient data cannot be fetched. " +
        "Check that this network allows that address. You can still enter values manually.");
      return;
    }

    if (params.has("error")) {
      showMessage(doc, "The EHR did not grant access (" + params.get("error") + "). You can still enter values manually.");
      return;
    }

    let client;
    try {
      client = await root.FHIR.oauth2.ready();
    } catch (e) {
      if (returning) showMessage(doc, "Could not finish connecting to the EHR. You can still enter values manually.");
      return;
    }
    root.SMART_ACTIVE = true;

    if (!client.patient || !client.patient.id) {
      showMessage(doc, "Connected to the EHR, but no patient was selected. Enter values manually.");
      return;
    }

    let patientName = "";
    try {
      const p = await client.patient.read();
      const n = p && p.name && p.name[0];
      if (n) patientName = [].concat(n.given || [], n.family || []).join(" ");
    } catch (e) { /* name is optional */ }

    const fetched = await fetchObservations(client);
    if (fetched.errors.length === Object.keys(ANALYTES).length) {
      showMessage(doc, "Connected, but the EHR refused every results request. This app needs read access to Observation (scope patient/Observation.rs). Enter values manually.");
      return;
    }
    const res = buildResult(fetched.byKey, Date.now());
    if (fetched.errors.length) {
      res.warnings.push("Could not retrieve: " + fetched.errors.join(", ") + ".");
    }
    applyToForm(doc, res, patientName);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { convert: convert, pickLatest: pickLatest, buildResult: buildResult, ANALYTES: ANALYTES };
  }
  if (typeof window !== "undefined") {
    if (window.document.readyState === "loading") {
      window.document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);