//   Page wiring
let lastRecommendation = "";
let lastPdfData = {};

document.querySelectorAll('input[name="labs"]').forEach(radio => {
    radio.addEventListener('change', () => {
        const show = radio.value === 'true' && radio.checked;
        document.getElementById('labDetailsBox').style.display = show ? 'block' : 'none';
    });
});

document.getElementById('dosingForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const medTypeRaw = document.getElementById('medTypeDropdown').value;
    const [medType, typeAmtStr] = medTypeRaw.split('_');
    const typeAmt = parseInt(typeAmtStr, 10);
    const dosing = parseFloat(document.getElementById('dosingDropdown').value);
    const weight = parseFloat(document.getElementById('weightInput').value);
    const labsTrue = document.querySelector('input[name="labs"]:checked').value === 'true';

    let labs = null;
    if (labsTrue) {
        labs = {
            hemoglobin: parseFloat(document.getElementById('hemoglobinInput').value) || 0,
            reticulocyte: parseFloat(document.getElementById('reticulocyteInput').value) || 0,
            rbc: parseFloat(document.getElementById('rbcInput').value) || 0,
            platelet: parseFloat(document.getElementById('plateletInput').value) || 0,
            reticulocyte_percent: parseFloat(document.getElementById('reticulocytePercentInput').value) || 0,
            neutrophil: parseFloat(document.getElementById('neutrophilInput').value) || 0,
        };
    }

    const recommendation = calculateInitialDosing(weight, medType, dosing, typeAmt, labsTrue, labs);

    lastRecommendation = recommendation;
    lastPdfData = { weight, med_type: medTypeRaw, dosing, type_amt: typeAmt };

    document.getElementById('resultText').textContent = recommendation;
    document.getElementById('outputBox').style.display = 'block';
    document.getElementById('feedbackBox').style.display = 'block';

    notifyParentOfResize();
});

/* ---- PDF download (same jsPDF logic as the original app) ---- */
document.getElementById('downloadPdfBtn').addEventListener('click', function () {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const margin = 50;
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    let y = margin;

    const tableStyle = {
        theme: "plain",
        margin: { left: margin, right: margin },
        styles: { fontSize: 10, cellPadding: 5, lineColor: [180, 180, 180], lineWidth: 0.5 },
        headStyles: { fontStyle: "bold", fillColor: [240, 240, 240], textColor: [0, 0, 0] },
        columnStyles: { 0: { cellWidth: 180 } },
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text("Hydroxyurea Initial Dosing Recommendation", margin, y);
    y += 18;

    const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text("Generated: " + dateStr, margin, y);
    y += 16;

    doc.setDrawColor(0);
    doc.line(margin, y, pageW - margin, y);
    y += 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text("Prescription Summary", margin, y);
    y += 6;

    doc.autoTable({
        ...tableStyle,
        startY: y,
        head: [["Parameter", "Value"]],
        body: [
            ["Patient Weight", lastPdfData.weight + " kg"],
            ["Formulation", lastPdfData.med_type.replace("_", " mg ")],
            ["Starting Dose", lastPdfData.dosing + " mg/kg/day"],
            ["Capsule Strength", lastPdfData.type_amt + " mg"],
        ],
    });
    y = doc.lastAutoTable.finalY + 24;

    function parseSchedule(text) {
        const rows = [];
        for (const line of text.split("\n")) {
            const trimmed = line.trim();
            for (const day of DAYS) {
                if (trimmed.startsWith(day + ":")) rows.push([day, trimmed.slice(day.length + 1).trim()]);
            }
        }
        return rows;
    }
    function parseBlocks(text) {
        const idx = text.indexOf("Escalation");
        if (idx === -1) return { current: text, escalation: null };
        return { current: text.slice(0, idx).trim(), escalation: text.slice(idx).trim() };
    }

    const { current, escalation } = parseBlocks(lastRecommendation);
    const currentRows = parseSchedule(current);
    const currentHeader = current.split("\n").find(l => l.trim()).trim();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text("Current Dosing Schedule", margin, y);
    y += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text(currentHeader, margin, y);
    y += 8;

    doc.autoTable({
        ...tableStyle,
        startY: y,
        head: [["Day", "Dose"]],
        body: currentRows.length > 0 ? currentRows : [["—", currentHeader]],
    });
    y = doc.lastAutoTable.finalY + 24;

    if (escalation) {
        const escalationRows = parseSchedule(escalation);
        const escalationHeader = escalation.split("\n").find(l => l.trim()).trim();

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.text("Escalation Schedule", margin, y);
        y += 16;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        doc.text(escalationHeader, margin, y);
        y += 8;

        doc.autoTable({
            ...tableStyle,
            startY: y,
            head: [["Day", "Dose"]],
            body: escalationRows.length > 0 ? escalationRows : [["—", escalationHeader]],
        });
    }

    doc.setDrawColor(180, 180, 180);
    doc.line(margin, pageH - 40, pageW - margin, pageH - 40);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text("Clinical decision support tool only. Always confirm with a qualified clinician.", pageW / 2, pageH - 24, { align: "center" });

    doc.save("HU_dosing_" + lastPdfData.weight + "kg_" + dateStr.replace(/ /g, "_") + ".pdf");
});

/* ---- Feedback submission -------------------------------------
   TODO: point this at a real endpoint before relying on it.
   Easiest options: a Formspree endpoint (formspree.io), or a
   Google Apps Script Web App URL that appends to a Sheet.
   Until FEEDBACK_ENDPOINT is set, this just logs to the console
   so the button doesn't silently fail on you.
------------------------------------------------------------------ */
const FEEDBACK_ENDPOINT = ""; // e.g. "https://formspree.io/f/xxxxxxx"

document.getElementById('submitFeedbackBtn').addEventListener('click', async function () {
    const status = document.getElementById('feedback-status');
    const feedbackText = document.getElementById('feedback-text').value;

    const payload = {
        weight: lastPdfData.weight,
        med_type: lastPdfData.med_type,
        dosing: lastPdfData.dosing,
        type_amt: lastPdfData.type_amt,
        recommendation: lastRecommendation,
        feedback_text: feedbackText,
    };

    if (!FEEDBACK_ENDPOINT) {
        console.log("Feedback (no endpoint configured yet):", payload);
        status.textContent = "Feedback endpoint not set up yet — logged locally for now.";
        return;
    }

    status.textContent = "Submitting...";
    try {
        const res = await fetch(FEEDBACK_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        status.textContent = res.ok ? "Thanks for your feedback!" : "Something went wrong.";
    } catch (err) {
        status.textContent = "Something went wrong.";
    }
});

/* ---- Let the parent (Wix) know our height, for iframe resizing ---- */
function notifyParentOfResize() {
    if (window.parent !== window) {
        window.parent.postMessage({ type: "hu-calculator-resize", height: document.body.scrollHeight }, "*");
    }
}
window.addEventListener('load', notifyParentOfResize);
document.querySelectorAll('input[name="labs"]').forEach(r => r.addEventListener('change', () => setTimeout(notifyParentOfResize, 50)));
