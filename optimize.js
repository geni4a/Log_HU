// ---- Settings you may want to change ----
const OPT_ESCALATION_STEP_MG_PER_KG = 5;   // +5 mg/kg/day when escalating
const OPT_MAX_DAILY_MG = 2500;             // traditional maximum, mg/day
const OPT_MAX_MG_PER_KG = 35;              // traditional maximum, mg/kg/day

const LAB_NAMES = {
    hemoglobin: "Hemoglobin",
    neutrophil: "Absolute Neutrophil Count",
    reticulocyte: "Absolute Reticulocyte Count",
    platelet: "Platelet Count",
};

/*  formulation and dose box  */

// mg in one capsule, one Siklos block (250 mg, as on the Initial Dosing page), or per mL of liquid
function unitMg(medTypeValue) {
    const [kind, amt] = medTypeValue.split('_');
    if (kind === 'Siklos') return 250;
    return parseFloat(amt);
}

// Show the "how many per week" row only for capsules and tablets
function updateFormulationUI() {
    const kind = document.getElementById('medType').value.split('_')[0];
    const usesCount = kind === 'capsule' || kind === 'Siklos';
    document.getElementById('capsRow').style.display = usesCount ? '' : 'none';
    document.getElementById('capsLabel').textContent =
        kind === 'Siklos' ? 'How many scored tablet blocks per week?' : 'How many capsules per week?';
    if (!usesCount) document.getElementById('caps_dose').value = '';
}

// The "per week" count fills the daily dose box
function updateDoseFromCapsules() {
    const caps = parseFloat(document.getElementById('caps_dose').value);
    const medType = document.getElementById('medType').value;
    if (!isNaN(caps) && medType) {
        document.getElementById('dose').value = Math.round(caps * unitMg(medType) / 7);
    }
}
['caps_dose', 'medType'].forEach(function (id) {
    const el = document.getElementById(id);
    el.addEventListener('input', updateDoseFromCapsules);
    el.addEventListener('change', updateDoseFromCapsules);
});
document.getElementById('medType').addEventListener('change', updateFormulationUI);
updateFormulationUI();

// If someone types a dose directly, clear the per-week count so the two never disagree.
document.getElementById('dose').addEventListener('input', function () {
    document.getElementById('caps_dose').value = '';
});

/*  escalation dose and how to take it  */

function escalationMessage(weight, currentDose, medTypeValue) {
    const targetDaily = Math.min(currentDose + OPT_ESCALATION_STEP_MG_PER_KG * weight, OPT_MAX_DAILY_MG, OPT_MAX_MG_PER_KG * weight);
    const confirmText = "Please confirm that the patient is adherent at the current dose before increasing the dose.";

    // No formulation chosen: give the dose in mg only
    if (!medTypeValue) {
        const mg = Math.round(targetDaily);
        return `Based on laboratory results, dose escalation is recommended to ${mg} mg (${(mg / weight).toFixed(1)} mg/kg/day). ${confirmText}\n\nSelect a formulation to see how to take the new dose.`;
    }

    const kind = medTypeValue.split('_')[0];
    const unit = unitMg(medTypeValue);

    // Liquid: round to 0.1 mL
    if (kind === 'liquid') {
        const ml = Math.round(targetDaily / unit * 10) / 10;
        const mg = Math.round(ml * unit);
        if (mg <= currentDose) return `The patient is already at the maximum recommended dose, so no escalation is recommended.`;
        return `Based on laboratory results, dose escalation is recommended to ${mg} mg (${(mg / weight).toFixed(1)} mg/kg/day). ${confirmText}\n\nNew dose: ${ml.toFixed(1)} mL/day`;
    }

    // Capsules or Siklos blocks: round to a whole number per week
    const perWeekNow = currentDose * 7 / unit;
    let perWeek = Math.max(Math.round(targetDaily * 7 / unit), Math.floor(perWeekNow) + 1);
    perWeek = Math.min(perWeek, Math.floor(Math.min(OPT_MAX_DAILY_MG, OPT_MAX_MG_PER_KG * weight) * 7 / unit));
    const mg = Math.round(perWeek * unit / 7);
    if (mg <= currentDose) return `The patient is already at the maximum recommended dose, so no escalation is recommended.`;

    const what = kind === 'Siklos' ? 'scored tablet blocks' : 'capsules';
    const scheduleUnit = kind === 'Siklos' ? SIKLOS_UNIT : CAPSULE_UNIT;
    return `Based on laboratory results, dose escalation is recommended to ${mg} mg (${(mg / weight).toFixed(1)} mg/kg/day). ${confirmText}\n\n` +
           `New dose: ${perWeek} ${what}/week (${mg} mg/day average)\n\n` +
           `Weekly schedule:\n${formatScheduleBlock(perWeek, scheduleUnit)}`;
}

/*  showing the result  */

function renderOptimizeResult(text) {
    const view = document.getElementById('resultView');
    const rows = parseSchedule(text);

    // Messages without a schedule (toxicity, optimized, out of range...) stay as plain text
    if (!rows.length) {
        view.innerHTML = '<div class="rec-report"><p class="rec-message">' + esc(text) + '</p></div>';
        return;
    }

    // Everything before "Weekly schedule:" is the message and the new dose line
    const intro = text.slice(0, text.indexOf("Weekly schedule:")).trim();
    view.innerHTML =
        '<div class="rec-report">' +
        '<p class="rec-message">' + esc(intro) + '</p>' +
        '<h4>New Dose Schedule</h4>' +
        tableHtml(['Day', 'Dose'], rows) +
        '<p class="rec-footer">Clinical decision support tool only. Always confirm with a qualified clinician.</p>' +
        '</div>';
}

function show(text) {
    renderOptimizeResult(text);
    document.getElementById('outputBox').style.display = 'block';
    notifyParentOfResize();
}

// Shown when some labs are blank: lets the user go back and add them, or continue without
function showIncompletePrompt(missing) {
    const text = "Not all laboratory values were entered (missing: " + missing.join(", ") + ").\n\n" +
        "If you have them, enter them above and submit again. " +
        "If not, you can proceed: toxicity will be checked using the values you entered, " +
        "but a dose increase cannot be recommended without a complete set of results.";
    document.getElementById('resultView').innerHTML =
        '<div class="rec-report"><p class="rec-message">' + esc(text) + '</p>' +
        '<p><button type="button" id="proceedIncompleteBtn">Proceed without these values</button></p></div>';
    document.getElementById('outputBox').style.display = 'block';
    document.getElementById('proceedIncompleteBtn').addEventListener('click', function () { runOptimize(true); });
    notifyParentOfResize();
}

// Result when the labs are incomplete: toxicity from what we have, never an increase
function incompleteLabsMessage(labs, missing) {
    const note = "Note: not all laboratory values were entered (missing: " + missing.join(", ") + "), so this is based on the available results only.";
    const reasons = toxicityReasons(labs);
    if (reasons.length) return formatToxicityMessage(reasons) + "\n\n" + note;
    return "No laboratory toxicity was identified from the values entered, but a dose increase cannot be recommended without a complete set of laboratory values.\n\n" + note;
}

/*  the calculation  */

function runOptimize(allowIncomplete) {
    const labs = {
        hemoglobin: parseFloat(document.getElementById('hemoglobin').value),
        neutrophil: parseFloat(document.getElementById('neutrophil').value),
        reticulocyte: parseFloat(document.getElementById('reticulocyte').value),
        platelet: parseFloat(document.getElementById('platelet').value),
    };
    const missing = Object.keys(LAB_NAMES).filter(k => isNaN(labs[k])).map(k => LAB_NAMES[k]);

    if (missing.length === 4) return show("Please enter at least one laboratory value.");

    const rangeMsg = labRangeMessage(labs);
    if (rangeMsg) return show(rangeMsg);

    if (missing.length && !allowIncomplete) return showIncompletePrompt(missing);

    const weight = parseFloat(document.getElementById('weight').value);
    const currentDose = parseFloat(document.getElementById('dose').value);
    const medTypeValue = document.getElementById('medType').value;
    const recentEscalation = document.querySelector('input[name="escalation"]:checked').value === 'true';
    const recentReduction = document.querySelector('input[name="reduction"]:checked').value === 'true';

    let message = missing.length ? incompleteLabsMessage(labs, missing) : calculateToxicity(labs);
    const labsIncrease = message.startsWith("Dose increase");
    const labsWeightGain = message.startsWith("Dose adjustment for weight gain");

    const overMax = currentDose > OPT_MAX_DAILY_MG || currentDose / weight > OPT_MAX_MG_PER_KG;
    const maxMessage = "This dose is outside of the traditional maximum dose of 2500 mg per day or 35 mg/kg/day. " +
        "Please confirm entered dose is accurate and adherence is optimized. No further dose escalations are recommended.";

    if (overMax) {
        // Where the labs would have led to an increase, this message replaces it.
        // Toxicity and "optimized" results are kept and the note is added below them.
        message = (labsIncrease || labsWeightGain) ? maxMessage : message + "\n\n" + maxMessage;
    } else if ((labsIncrease || labsWeightGain) && recentReduction) {
        message = "Due to a recent hydroxyurea toxicity and dose reduction, we do not recommend dose escalation at this time.";
    } else if ((labsIncrease || labsWeightGain) && recentEscalation) {
        message = `Since the dose was recently escalated, we recommend continuing the same dose (${currentDose} mg).`;
    } else if (labsIncrease) {
        message = escalationMessage(weight, currentDose, medTypeValue);
    }
    show(message);
}

document.getElementById('optimizeForm').addEventListener('submit', function (e) {
    e.preventDefault();
    runOptimize(false);
});

function notifyParentOfResize() {
    if (window.parent !== window) {
        window.parent.postMessage({ type: "hu-calculator-resize", height: document.body.scrollHeight }, "*");
    }
}
window.addEventListener('load', notifyParentOfResize);