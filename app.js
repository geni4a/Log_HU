/* Page wiring */
let lastRecommendation = "";
let lastPdfData = {};


let lastArgs = null;

function proceedDespiteToxicity() {
    const a = lastArgs;
    lastRecommendation = calculateInitialDosing(a.weight, a.medType, a.dosing, a.typeAmt, a.labsTrue, a.labs, true);
    renderResult(lastRecommendation, lastPdfData);
    document.getElementById('resultView').insertAdjacentHTML('afterbegin',
        '<p class="rec-message"><em>Laboratory toxicity was flagged. Dosing is shown after clinician review.</em></p>');
    document.getElementById('downloadPdfBtn').style.display = '';
    notifyParentOfResize();
}
/* 
   Reading the recommendation text. Used by BOTH the on-screen report
   and the PDF, so the two always match.
   */
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
// The dose lines that come before "Weekly schedule:" in a block.
function headerLines(block) {
    const lines = [];
    for (const line of block.split("\n")) {
        if (line.trim().startsWith("Weekly schedule")) break;
        if (line.trim()) lines.push(line.trim());
    }
    return lines;
}

/*
   On-screen report: same structure as the PDF
   */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function tableHtml(head, rows) {
    return '<table class="rec-table"><thead><tr>' + head.map(h => `<th>${esc(h)}</th>`).join('') +
        '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(c => `<td>${esc(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table>';
}

function scheduleSection(title, block) {
    const rows = parseSchedule(block);
    const lines = headerLines(block);
    return `<h4>${title}</h4><p class="rec-sub">${lines.map(esc).join('<br>')}</p>` +
        tableHtml(['Day', 'Dose'], rows.length ? rows : [['\u2014', lines[0] || '']]);
}

function renderResult(rec, d) {
    const view = document.getElementById('resultView');
    const pdfBtn = document.getElementById('downloadPdfBtn');

    // Messages with no dose (for example "Laboratory Toxicity detected...") are shown as plain text.
    // if (!/Recommended dose/.test(rec)) {
    //     view.innerHTML = '<div class="rec-report"><p class="rec-message">' + esc(rec) + '</p></div>';
    //     pdfBtn.style.display = 'none';
    //     return;
    // }
   if (!/Recommended dose/.test(rec)) {
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
            // ['Formulation', d.med_type.replace('_', ' mg ')],
            ['Preferred Starting mg/kg dose', d.dosing + ' mg/kg per day'],
            ['Hydroxyurea Formulation', d.type_amt + ' mg' + d.medType],
            ['Laboratory Values Provided', d.labsTrue ? 'Yes' : 'No'],
            ['Laboratory Toxicity Detected', rec.startsWith("Laboratory Toxicity") ? 'Yes' : 'No'],

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
    // if (labsTrue) {
    //     labs = {
    //         hemoglobin: parseFloat(document.getElementById('hemoglobinInput').value) || 0,
    //         reticulocyte: parseFloat(document.getElementById('reticulocyteInput').value) || 0,
    //         rbc: parseFloat(document.getElementById('rbcInput').value) || 0,
    //         platelet: parseFloat(document.getElementById('plateletInput').value) || 0,
    //         reticulocyte_percent: parseFloat(document.getElementById('reticulocytePercentInput').value) || 0,
    //         neutrophil: parseFloat(document.getElementById('neutrophilInput').value) || 0,
    //     };
    // }
        if (labsTrue) {
        const raw = {
            hemoglobin: parseFloat(document.getElementById('hemoglobinInput').value),
            neutrophil: parseFloat(document.getElementById('neutrophilInput').value),
            reticulocyte: parseFloat(document.getElementById('reticulocyteInput').value),
            platelet: parseFloat(document.getElementById('plateletInput').value),
        };
        // If the ARC will be worked out from RBC and reticulocyte %, check that value too
        const rbc = parseFloat(document.getElementById('rbcInput').value);
        const pct = parseFloat(document.getElementById('reticulocytePercentInput').value);
        if (isNaN(raw.reticulocyte) && !isNaN(rbc) && !isNaN(pct)) raw.reticulocyte = pct / 100 * rbc;

        const rangeMsg = labRangeMessage(raw);
        if (rangeMsg) {
            renderResult(rangeMsg, {});
            document.getElementById('outputBox').style.display = 'block';
            notifyParentOfResize();
            return;
        }
    }

    // const recommendation = calculateInitialDosing(weight, medType, dosing, typeAmt, labsTrue, labs);
    lastArgs = { weight, medType, dosing, typeAmt, labsTrue, labs };
    const recommendation = calculateInitialDosing(weight, medType, dosing, typeAmt, labsTrue, labs);

    lastRecommendation = recommendation;
    lastPdfData = { weight, med_type: medTypeRaw, dosing, type_amt: typeAmt };

    renderResult(recommendation, lastPdfData);
    document.getElementById('outputBox').style.display = 'block';
    document.getElementById('feedbackBox').style.display = 'block';

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
            // ["Formulation", lastPdfData.med_type.replace("_", " mg ")],
            ["Preferred Starting mg/kg dose", lastPdfData.dosing + " mg/kg/day"],
            ["Hydroxyurea Formulation", lastPdfData.type_amt + " mg"],
        ],
    });
    y = doc.lastAutoTable.finalY + 24;


    const { current, escalation } = parseBlocks(lastRecommendation);
    const currentRows = parseSchedule(current);
    const currentHeader = current.split("\n").find(l => l.trim()).trim();

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

// 
/*  Let the parent (Wix) know our height, for iframe resizing  */
function notifyParentOfResize() {
    if (window.parent !== window) {
        window.parent.postMessage({ type: "hu-calculator-resize", height: document.body.scrollHeight }, "*");
    }
}
window.addEventListener('load', notifyParentOfResize);
document.querySelectorAll('input[name="labs"]').forEach(r => r.addEventListener('change', () => setTimeout(notifyParentOfResize, 50)));



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
