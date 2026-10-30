/* Ported dosing logic (same as calculate.py / public/calculate.js) */

const LAB_RANGES = {
    hemoglobin:   { label: "Hemoglobin",                  min: 2.0, max: 15.0, unit: "g/dL" },
    neutrophil:   { label: "Absolute Neutrophil Count",   min: 0.1, max: 20,   unit: "x10^9/L" },
    reticulocyte: { label: "Absolute Reticulocyte Count", min: 10,  max: 999,  unit: "x10^9/L" },
    platelet:     { label: "Platelet Count",              min: 10,  max: 999,  unit: "x10^9/L" },
};

// Returns a message naming every out-of-range value, or null if all are fine.
// Blank (NaN) values are skipped, because on the Initial Dosing page some labs are optional.
function labRangeMessage(labs) {
    const bad = [];
    for (const key in LAB_RANGES) {
        const v = labs[key], r = LAB_RANGES[key];
        if (v === null || v === undefined || isNaN(v)) continue;
        if (v < r.min || v > r.max) bad.push(`• ${r.label}: ${v} ${r.unit} (expected ${r.min} to ${r.max})`);
    }
    return bad.length
        ? "Laboratory value entered is out of range. Check units and result for accuracy.\n\n" + bad.join("\n")
        : null;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function pythonRound(x) {
    const floor = Math.floor(x);
    const diff = x - floor;
    if (diff < 0.5) return floor;
    if (diff > 0.5) return floor + 1;
    return (floor % 2 === 0) ? floor : floor + 1;
}
const CAPSULE_UNIT = { one: "capsule", other: "capsules" };
const SIKLOS_UNIT  = { one: "scored tablet block", other: "scored tablet blocks" };

// function buildSchedule(capsPerDay, extraCaps) {
//     const schedule = new Array(7).fill(capsPerDay);
//     if (extraCaps > 0) {
//         const step = 7 / extraCaps;
//         const extraIndices = new Set();
//         for (let i = 0; i < extraCaps; i++) extraIndices.add(pythonRound(i * step) % 7);
//         for (const idx of extraIndices) schedule[idx] += 1;
//     }
//     const lines = [];
//     for (let i = 0; i < 7; i++) {
//         const day = DAYS[i];
//         const caps = schedule[i];
//         lines.push(caps === 0 ? `  ${day}: off` : `  ${day}: ${caps} ${caps === 1 ? "capsule" : "capsules"}`);
//     }
//     return lines.join("\n");
// }

// function formatScheduleBlock(capsPerWeek) {
//     let capsPerDay, extraCaps;
//     if (capsPerWeek >= 7) {
//         capsPerDay = Math.floor(capsPerWeek / 7);
//         extraCaps = capsPerWeek % 7;
//     } else {
//         capsPerDay = 0;
//         extraCaps = capsPerWeek;
//     }
//     return buildSchedule(capsPerDay, extraCaps);
// }

function buildSchedule(capsPerDay, extraCaps, unit = CAPSULE_UNIT) {
    const schedule = new Array(7).fill(capsPerDay);
    if (extraCaps > 0) {
        const step = 7 / extraCaps;
        const extraIndices = new Set();
        for (let i = 0; i < extraCaps; i++) extraIndices.add(pythonRound(i * step) % 7);
        for (const idx of extraIndices) schedule[idx] += 1;
    }
    const lines = [];
    for (let i = 0; i < 7; i++) {
        const day = DAYS[i];
        const n = schedule[i];
        lines.push(n === 0 ? `  ${day}: off` : `  ${day}: ${n} ${n === 1 ? unit.one : unit.other}`);
    }
    return lines.join("\n");
}

function formatScheduleBlock(capsPerWeek, unit = CAPSULE_UNIT) {
    let capsPerDay, extraCaps;
    if (capsPerWeek >= 7) {
        capsPerDay = Math.floor(capsPerWeek / 7);
        extraCaps = capsPerWeek % 7;
    } else {
        capsPerDay = 0;
        extraCaps = capsPerWeek;
    }
    return buildSchedule(capsPerDay, extraCaps, unit);
}

function capsuleDosing(dosePerWeek, dosePerDay, typeAmt, dosing, note = "") {
    if (dosePerDay % typeAmt === 0) {
        const caps = Math.floor(dosePerDay / typeAmt);
        const schedule = buildSchedule(caps, 0);
        return `${note}Recommended Starting Dose: ${caps * 7} capsules/week (${Math.round(dosePerDay)} mg daily, ${caps} ${caps === 1 ? "capsule" : "capsules"}/day)\n\nWeekly schedule:\n${schedule}`;
    }
    const capsDown = Math.floor(dosePerWeek / typeAmt);
    const capsUp = Math.ceil(dosePerWeek / typeAmt);
    const currentSchedule = formatScheduleBlock(capsDown);
    const currentMg = (capsDown * typeAmt) / 7;
    const lines = [
        `${note}Recommended Starting Dose:  ${capsDown} capsules/week (~${Math.round(currentMg)} mg daily)\n`,
        `Weekly schedule:\n${currentSchedule}`,
    ];
    if (capsUp !== capsDown) {
        const newWeight = ((capsUp * typeAmt) / 7) / dosing;
        const newDoseMg = (capsUp * typeAmt) / 7;
        const nextSchedule = formatScheduleBlock(capsUp);
        lines.push(
            `\nEscalation (when weight reaches ${newWeight.toFixed(2)} kg):`,
            `${capsUp} capsules/week (${Math.round(newDoseMg)} mg/day average)\n`,
            `Weekly schedule:\n${nextSchedule}`
        );
    }
    return lines.join("\n");
}

function toxicityReasons(labs) {
    const n = labs.neutrophil, p = labs.platelet, r = labs.reticulocyte, hb = labs.hemoglobin;
    const reasons = [];
    if (n < 0.75) reasons.push(`Absolute neutrophil count ${n} ×10⁹/L is below 0.75 ×10⁹/L`);
    if (p < 80) reasons.push(`Platelet count ${p} ×10⁹/L is below 80 ×10⁹/L`);
    if (r < 50 && hb < 7) reasons.push(`Absolute reticulocyte count ${r} ×10⁹/L is below 50 ×10⁹/L with hemoglobin ${hb} g/dL below 7 g/dL`);
    return reasons;
}

function formatToxicityMessage(reasons) {
    return "Laboratory Toxicity detected - dose hold/reduction recommended.\n\n" +
        (reasons.length > 1 ? "Reasons:" : "Reason:") + "\n" +
        reasons.map(r => "• " + r).join("\n") + "\n\n" +
        "Please refer to the toxicity criteria on the About page.";
}

function calculateToxicity(labs) {
    const n = labs.neutrophil, p = labs.platelet, r = labs.reticulocyte, hb = labs.hemoglobin;
    if (n > 3.0 && p > 100 && (r > 50 && hb > 7)) return "Dose increase recommended";
    if (n > 1.5 && p > 120 && ((r > 100 && hb < 8) || (r > 75 && hb > 8))) return "Dose adjustment for weight gain recommended";
    const reasons = toxicityReasons(labs);
    if (reasons.length) return formatToxicityMessage(reasons);
    return "Dose is optimized, do not change";
}

function calculateInitialDosing(weight, medType, dosing, typeAmt, labsTrue = false, labs = null, override = false) {
    if (labsTrue) {
        // A blank (NaN) or 0 ARC is worked out from reticulocyte % and RBC when both are given
        if (!labs.reticulocyte && labs.reticulocyte_percent && labs.rbc) {
            labs.reticulocyte = labs.reticulocyte_percent / 100 * labs.rbc;
        }
        const tox = calculateToxicity(labs);
        if (tox.includes("Laboratory Toxicity") && !override) {
            return tox;
        }
    }
    const MAX_DAILY_DOSE = 2500;
    const rawDose = weight * dosing;
    const dosePerDay = Math.min(rawDose, MAX_DAILY_DOSE);
    const dosePerWeek = dosePerDay * 7;
    let note = "";
    if (rawDose > MAX_DAILY_DOSE) {
        note = `Note: Weight-based dose (${Math.round(rawDose)} mg/day) exceeds the ${MAX_DAILY_DOSE} mg/day maximum. Capping at ${MAX_DAILY_DOSE} mg/day.\n\n`;
    }
    if (medType === "capsule") 
        return capsuleDosing(dosePerWeek, dosePerDay, typeAmt, dosing, note);
    if (medType === "liquid") {
        // 0.1 mL is the finest practical measure, so round the volume first,
        // then show the mg that volume actually delivers.
        const mlPerDay = Math.round(dosePerDay / typeAmt * 10) / 10;
        const mg = Math.round(mlPerDay * typeAmt);
        const dayLines = DAYS.map(day => `  ${day}: ${mlPerDay.toFixed(1)} mL (${mg} mg)`).join("\n");
        return `${note}Recommended Starting Dose: ${mg} mg daily (${mlPerDay.toFixed(1)} mL/day)\n\nWeekly schedule:\n${dayLines}`;
    }
    if (medType === "Siklos") {
        const capsDown = Math.floor(dosePerWeek / 250);
        const capsUp = Math.ceil(dosePerWeek / 250);
        const currentSchedule = formatScheduleBlock(capsDown, SIKLOS_UNIT);
        // const lines = [
        //     `${note}Recommended Starting Dose: (~${Math.round(dosePerDay)} mg once daily)`,
        //     `  → ${capsDown} scored tablet block(s)/week\n`,
        //     `Weekly schedule:\n${currentSchedule}`,
        // ];
            const lines = [
            `${note}Recommended Starting Dose:  ${capsDown} scored tablet blocks (~${Math.round(dosePerDay)} mg once daily)\n`,
            `Weekly schedule:\n${currentSchedule}`,
        ];
        if (capsUp !== capsDown) {
            const newWeight = ((capsUp * 250) / 7) / dosing;
            const nextSchedule = formatScheduleBlock(capsUp, SIKLOS_UNIT);
            lines.push(
                `\nEscalation (when weight reaches ${newWeight.toFixed(2)} kg):`,
                `  → ${capsUp} scored tablet block(s)/week\n`,
                `Weekly schedule:\n${nextSchedule}`
            );
        }
        return lines.join("\n");
    }
    return "Unknown medication type.";
}