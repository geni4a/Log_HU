/* ---------------------------------------------------------------
   Ported dosing logic (same as calculate.py / public/calculate.js)
   --------------------------------------------------------------- */
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function pythonRound(x) {
    const floor = Math.floor(x);
    const diff = x - floor;
    if (diff < 0.5) return floor;
    if (diff > 0.5) return floor + 1;
    return (floor % 2 === 0) ? floor : floor + 1;
}

function buildSchedule(capsPerDay, extraCaps) {
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
        const caps = schedule[i];
        lines.push(caps === 0 ? `  ${day}: off` : `  ${day}: ${caps} ${caps === 1 ? "capsule" : "capsules"}`);
    }
    return lines.join("\n");
}

function formatScheduleBlock(capsPerWeek) {
    let capsPerDay, extraCaps;
    if (capsPerWeek >= 7) {
        capsPerDay = Math.floor(capsPerWeek / 7);
        extraCaps = capsPerWeek % 7;
    } else {
        capsPerDay = 0;
        extraCaps = capsPerWeek;
    }
    return buildSchedule(capsPerDay, extraCaps);
}

function capsuleDosing(dosePerWeek, dosePerDay, typeAmt, dosing, note = "") {
    if (dosePerDay % typeAmt === 0) {
        const caps = Math.floor(dosePerDay / typeAmt);
        const schedule = buildSchedule(caps, 0);
        return `${note}Recommended dose: ${Math.round(dosePerDay)} mg/day (${caps} ${caps === 1 ? "capsule" : "capsules"}/day)\n\nWeekly schedule:\n${schedule}`;
    }
    const capsDown = Math.floor(dosePerWeek / typeAmt);
    const capsUp = Math.ceil(dosePerWeek / typeAmt);
    const currentSchedule = formatScheduleBlock(capsDown);
    const currentMg = (capsDown * typeAmt) / 7;
    const lines = [
        `Recommended dose: ~${Math.round(dosePerDay)} mg/day`,
        `  → ${capsDown} capsules/week (${Math.round(currentMg)} mg/day average)\n`,
        `Weekly schedule:\n${currentSchedule}`,
    ];
    if (capsUp !== capsDown) {
        const newWeight = ((capsUp * typeAmt) / 7) / dosing;
        const newDoseMg = (capsUp * typeAmt) / 7;
        const nextSchedule = formatScheduleBlock(capsUp);
        lines.push(
            `\nEscalation (when weight reaches ${newWeight.toFixed(2)} kg):`,
            `  → ${capsUp} capsules/week (${Math.round(newDoseMg)} mg/day average)\n`,
            `Weekly schedule:\n${nextSchedule}`
        );
    }
    return lines.join("\n");
}

function toxicityReasons(labs) {
    const n = labs.neutrophil, p = labs.platelet, r = labs.reticulocyte, hb = labs.hemoglobin;
    const reasons = [];
    if (n < 0.75) reasons.push(`neutrophils ${n} x10^9/L (<0.75)`);
    if (p < 80) reasons.push(`platelets ${p} x10^9/L (<80)`);
    if (r < 50 && hb < 7) reasons.push(`reticulocytes ${r} x10^9/L (<50) with hemoglobin ${hb} g/dL (<7)`);
    return reasons;
}

function calculateToxicity(labs) {
    const n = labs.neutrophil, p = labs.platelet, r = labs.reticulocyte, hb = labs.hemoglobin;
    if (n > 3.0 && p > 100 && (r > 50 && hb > 7)) return "Dose increase recommended";
    if (n > 1.5 && p > 120 && ((r > 100 && hb < 8) || (r > 75 && hb > 8))) return "Dose adjustment for weight gain recommended";
    const reasons = toxicityReasons(labs);
    if (reasons.length) return "Laboratory Toxicity - dose hold/reduction recommended: " + reasons.join("; ") + ".";

    // if (n < 0.75 || p < 80 || (r < 50 && hb < 7)) return "Laboratory Toxicity - dose hold/reduction recommended";
    return "Dose is optimized, do not change";
}

function calculateInitialDosing(weight, medType, dosing, typeAmt, labsTrue = false, labs = null) {
    if (labsTrue) {
        if (labs.reticulocyte === 0 && labs.reticulocyte_percent && labs.rbc) {
            labs.reticulocyte = labs.reticulocyte_percent * labs.rbc;
        }
        const tox = calculateToxicity(labs);
        if (tox.includes("Laboratory Toxicity")) {
            // return "Laboratory Toxicity detected. Please review the patient's labs before calculating the initiating hydroxyurea dose.";
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
    if (medType === "capsule") return capsuleDosing(dosePerWeek, dosePerDay, typeAmt, dosing, note);
    if (medType === "liquid") {
        // 0.1 mL is the finest practical measure, so round the volume first,
        // then show the mg that volume actually delivers.
        const mlPerDay = Math.round(dosePerDay / typeAmt * 10) / 10;
        return `Recommended dose: ${Math.round(mlPerDay * typeAmt)} mg/day (${mlPerDay.toFixed(1)} mL/day)`;
    }
    if (medType === "Siklos") {
        const capsDown = Math.floor(dosePerWeek / 250);
        const capsUp = Math.ceil(dosePerWeek / 250);
        const currentSchedule = formatScheduleBlock(capsDown);
        const lines = [
            `Recommended dose: ~${Math.round(dosePerDay)} mg/day`,
            `  → ${capsDown} scored tablet block(s)/week\n`,
            `Weekly schedule:\n${currentSchedule}`,
        ];
        if (capsUp !== capsDown) {
            const newWeight = ((capsUp * 250) / 7) / dosing;
            const nextSchedule = formatScheduleBlock(capsUp);
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
