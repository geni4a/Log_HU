/* Page wiring */
let lastRecommendation = "";
let lastPdfData = {};
let lastArgs = null;

// Clinician confirmed they want dosing despite flagged lab toxicity
function proceedDespiteToxicity() {
    const a = lastArgs;
    lastRecommendation = calculateInitialDosing(a.weight, a.medType, a.dosing, a.typeAmt, a.labsTrue, a.labs, true);
    lastPdfData.toxicity = true;
    renderResult(lastRecommendation, lastPdfData);
    document.getElementById('resultView').insertAdjacentHTML('afterbegin',
        '<p class="rec-message"><em>Laboratory toxicity was flagged. Dosing is shown after clinician review.</em></p>');
    document.getElementById('downloadPdfBtn').style.display = '';
    notifyParentOfResize();
}

/* Splits the recommendation into current and escalation blocks (parseSchedule etc. are in render.js) */
function parseBlocks(text) {
    const idx = text.indexOf("Escalation");
    if (idx === -1) return { current: text, escalation: null };
    return { current: text.slice(0, idx).trim(), escalation: text.slice(idx).trim() };
}
// Readable formulation name for the report and the PDF
function formulationLabel(raw) {
    const [kind, amt] = raw.split('_');
    if (kind === 'capsule') return amt + ' mg capsule';
    if (kind === 'Siklos') return 'Siklos (1000 mg scored tablet)';
    return 'Liquid suspension ' + amt + ' mg/mL';
}

// The Laboratory Toxicity row of the summary table
function toxicityStatus(d) {
    if (!d.labsTrue) return 'Not assessed';
    return d.toxicity ? 'Yes (dosing shown after clinician review)' : 'No';
}

function renderResult(rec, d) {
    const view = document.getElementById('resultView');
    const pdfBtn = document.getElementById('downloadPdfBtn');

    // Messages with no dose (toxicity, out-of-range values, ...) are shown as plain text.
    if (!/Recommended (Starting )?Dose:/i.test(rec)) {
        const isToxicity = rec.startsWith("Laboratory Toxicity");
        view.innerHTML = '<div class="rec-report"><p class="rec-message">' + esc(rec) + '</p>' +
            (isToxicity ? '<p><button type="button" id="overrideBtn">I understand, proceed with dosing recommendations</button></p>' : '') +
            '</div>';
        pdfBtn.style.display = 'none';
        const overrideBtn = document.getElementById('overrideBtn');
        if (overrideBtn) overrideBtn.addEventListener('click', proceedDespiteToxicity);
        return;
    }
    pdfBtn.style.display = '';

    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const { current, escalation } = parseBlocks(rec);
    view.innerHTML =
        '<div class="rec-report">' +
        '<h3>Hydroxyurea Initial Dosing Recommendation</h3>' +
        `<p class="rec-date">Generated: ${date}</p><hr>` +
        '<h4>Prescription Summary</h4>' +
        tableHtml(['Parameter', 'Value'], [
            ['Patient Weight', d.weight + ' kg'],
            ['Preferred Starting mg/kg dose', d.dosing + ' mg/kg per day'],
            ['Hydroxyurea Formulation', formulationLabel(d.med_type)],
            ['Laboratory Values Provided', d.labsTrue ? 'Yes' : 'No'],
            ['Laboratory Toxicity Detected', toxicityStatus(d)],
        ]) +
        scheduleSection('Recommended Starting Dose Schedule', current) +
        (escalation ? scheduleSection('Escalation Schedule', escalation) : '') +
        '<p class="rec-footer">Clinical decision support tool only. Always confirm with a qualified clinician.</p>' +
        '</div>';
}

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
        // A blank lab stays NaN (not 0), so a skipped optional field can't trigger a false toxicity
        labs = {
            hemoglobin: parseFloat(document.getElementById('hemoglobinInput').value),
            reticulocyte: parseFloat(document.getElementById('reticulocyteInput').value),
            rbc: parseFloat(document.getElementById('rbcInput').value) || 0,
            platelet: parseFloat(document.getElementById('plateletInput').value),
            reticulocyte_percent: parseFloat(document.getElementById('reticulocytePercentInput').value) || 0,
            neutrophil: parseFloat(document.getElementById('neutrophilInput').value),
        };

        if (isNaN(labs.neutrophil)) {
            renderResult("Please enter the Absolute Neutrophil Count.", {});
            document.getElementById('outputBox').style.display = 'block';
            notifyParentOfResize();
            return;
        }

        // Check the ARC that will actually be used, including one derived from RBC and %
        const arc = isNaN(labs.reticulocyte) && labs.rbc && labs.reticulocyte_percent
            ? labs.reticulocyte_percent / 100 * labs.rbc : labs.reticulocyte;
        const rangeMsg = labRangeMessage({ ...labs, reticulocyte: arc });
        if (rangeMsg) {
            renderResult(rangeMsg, {});
            document.getElementById('outputBox').style.display = 'block';
            notifyParentOfResize();
            return;
        }
    }

    lastArgs = { weight, medType, dosing, typeAmt, labsTrue, labs };
    const recommendation = calculateInitialDosing(weight, medType, dosing, typeAmt, labsTrue, labs);

    lastRecommendation = recommendation;
    lastPdfData = { weight, med_type: medTypeRaw, dosing, type_amt: typeAmt, labsTrue, toxicity: false };

    renderResult(recommendation, lastPdfData);
    document.getElementById('outputBox').style.display = 'block';

    notifyParentOfResize();
});


/*  PDF download (same jsPDF logic as the original app)  */
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
            ["Preferred Starting mg/kg dose", lastPdfData.dosing + " mg/kg/day"],
            ["Hydroxyurea Formulation", formulationLabel(lastPdfData.med_type)],
            ["Laboratory Values Provided", lastPdfData.labsTrue ? "Yes" : "No"],
            ["Laboratory Toxicity Detected", toxicityStatus(lastPdfData)],
        ],
    });
    y = doc.lastAutoTable.finalY + 24;


    const { current, escalation } = parseBlocks(lastRecommendation);
    const currentRows = parseSchedule(current);
    const currentHeader = current.split("\n").map(l => l.trim()).find(l => /^Recommended/i.test(l)) || current.split("\n").find(l => l.trim()).trim();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text("Recommended Starting Dose Schedule", margin, y);
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

/*  Let the parent (Wix) know our height, for iframe resizing  */
function notifyParentOfResize() {
    if (window.parent !== window) {
        window.parent.postMessage({ type: "hu-calculator-resize", height: document.body.scrollHeight }, "*");
    }
}
window.addEventListener('load', notifyParentOfResize);
document.querySelectorAll('input[name="labs"]').forEach(r => r.addEventListener('change', () => setTimeout(notifyParentOfResize, 50)));


/*  ARC from RBC and reticulocyte %, filled in as the user types  */
function updateArcFromRbc() {
    const rbc = parseFloat(document.getElementById('rbcInput').value);
    const pct = parseFloat(document.getElementById('reticulocytePercentInput').value);
    if (!isNaN(rbc) && !isNaN(pct)) {
        document.getElementById('reticulocyteInput').value = Math.round(pct / 100 * rbc * 10) / 10;
    }
}
['rbcInput', 'reticulocytePercentInput'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', updateArcFromRbc);
});

// If someone types the ARC directly, clear the two it would be derived from.
document.getElementById('reticulocyteInput').addEventListener('input', function () {
    document.getElementById('rbcInput').value = '';
    document.getElementById('reticulocytePercentInput').value = '';
});