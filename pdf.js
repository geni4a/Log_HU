/*
   Shared PDF builder, used by both calculators (needs jsPDF and jsPDF-AutoTable loaded).

   createReportPdf({
       title:    "Hydroxyurea Initial Dosing Recommendation",
       summary:  [["Patient Weight", "23.5 kg"], ...],            // Parameter / Value table
       sections: [
           { title: "...", header: "line under the title", rows: [["Sunday", "2 capsules"], ...] },  // Day/Dose table
           { title: "...", text: "plain paragraph(s)" }                                               // text only
       ],
       filename: "HU_dosing.pdf"
   })
*/
function createReportPdf(opts) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const margin = 50;
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const bottom = pageH - 60;       // keep clear of the footer
    let y = margin;

    const tableStyle = {
        theme: "plain",
        margin: { left: margin, right: margin, bottom: 60 },
        styles: { fontSize: 10, cellPadding: 5, lineColor: [180, 180, 180], lineWidth: 0.5 },
        headStyles: { fontStyle: "bold", fillColor: [240, 240, 240], textColor: [0, 0, 0] },
        columnStyles: { 0: { cellWidth: 180 } },
    };
    const room = need => { if (y + need > bottom) { doc.addPage(); y = margin; } };

    const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(0, 0, 0);
    doc.text(opts.title, margin, y);
    y += 18;

    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(80, 80, 80);
    doc.text("Generated: " + dateStr, margin, y);
    y += 16;

    doc.setDrawColor(0);
    doc.line(margin, y, pageW - margin, y);
    y += 20;

    if (opts.summary && opts.summary.length) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(0, 0, 0);
        doc.text("Summary", margin, y);
        y += 6;
        doc.autoTable({ ...tableStyle, startY: y, head: [["Parameter", "Value"]], body: opts.summary });
        y = doc.lastAutoTable.finalY + 24;
    }

    (opts.sections || []).forEach(function (s) {
        room(60);
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(0, 0, 0);
        doc.text(s.title, margin, y);
        y += 16;

        if (s.header) {
            doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(60, 60, 60);
            const lines = doc.splitTextToSize(s.header, pageW - 2 * margin);
            doc.text(lines, margin, y);
            y += lines.length * 12 - 4;
        }
        if (s.rows && s.rows.length) {
            doc.autoTable({ ...tableStyle, startY: y + 4, head: [["Day", "Dose"]], body: s.rows });
            y = doc.lastAutoTable.finalY + 24;
        }
        if (s.text) {
            doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(30, 30, 30);
            doc.splitTextToSize(s.text, pageW - 2 * margin).forEach(function (line) {
                room(14);
                doc.text(line, margin, y);
                y += 13;
            });
            y += 14;
        }
    });

    // Footer on every page
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setDrawColor(180, 180, 180);
        doc.line(margin, pageH - 40, pageW - margin, pageH - 40);
        doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(120, 120, 120);
        doc.text("Clinical decision support tool only. Always confirm with a qualified clinician.", pageW / 2, pageH - 24, { align: "center" });
    }

    doc.save(opts.filename + ".pdf");
}

// "October_31_2026", for file names
function pdfDateStamp() {
    return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }).replace(/[ ,]+/g, "_");
}