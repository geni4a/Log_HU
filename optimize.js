document.getElementById('optimizeForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const labs = {
        hemoglobin: parseFloat(document.getElementById('hemoglobin').value),
        neutrophil: parseFloat(document.getElementById('neutrophil').value),
        reticulocyte: parseFloat(document.getElementById('reticulocyte').value),
        platelet: parseFloat(document.getElementById('platelet').value),
    };

    // Same as the original app: the recommendation is driven by the labs only.
    // (Weight, dose, adherence, etc. are collected but not used in the calculation.)
    document.getElementById('resultText').textContent = calculateToxicity(labs);
    document.getElementById('outputBox').style.display = 'block';
    notifyParentOfResize();
});

function notifyParentOfResize() {
    if (window.parent !== window) {
        window.parent.postMessage({ type: "hu-calculator-resize", height: document.body.scrollHeight }, "*");
    }
}
window.addEventListener('load', notifyParentOfResize);
