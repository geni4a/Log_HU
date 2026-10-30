/*
   Shared by the Initial Dosing page (app.js) and the Dose Optimization page (optimize.js):
   turns the recommendation text into the Day / Dose tables.
*/
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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

// The dose lines that come before "Weekly schedule:" in a block.
function headerLines(block) {
    const lines = [];
    for (const line of block.split("\n")) {
        if (line.trim().startsWith("Weekly schedule")) break;
        if (line.trim()) lines.push(line.trim());
    }
    return lines;
}

function tableHtml(head, rows) {
    return '<table class="rec-table"><thead><tr>' + head.map(h => `<th>${esc(h)}</th>`).join('') +
        '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(c => `<td>${esc(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table>';
}

function scheduleSection(title, block) {
    const rows = parseSchedule(block);
    const lines = headerLines(block);
    return `<h4>${title}</h4><p class="rec-sub">${lines.map(esc).join('<br>')}</p>` +
        tableHtml(['Day', 'Dose'], rows.length ? rows : [['—', lines[0] || '']]);
}