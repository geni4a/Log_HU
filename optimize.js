// document.getElementById('optimizeForm').addEventListener('submit', function (e) {
//     e.preventDefault();

//     const labs = {
//         hemoglobin: parseFloat(document.getElementById('hemoglobin').value),
//         neutrophil: parseFloat(document.getElementById('neutrophil').value),
//         reticulocyte: parseFloat(document.getElementById('reticulocyte').value),
//         platelet: parseFloat(document.getElementById('platelet').value),
//     };

//     // Same as the original app: the recommendation is driven by the labs only.
//     // (Weight, dose, adherence, etc. are collected but not used in the calculation.)
//     document.getElementById('resultText').textContent = calculateToxicity(labs);
//     document.getElementById('outputBox').style.display = 'block';
//     notifyParentOfResize();
// });

// function notifyParentOfResize() {
//     if (window.parent !== window) {
//         window.parent.postMessage({ type: "hu-calculator-resize", height: document.body.scrollHeight }, "*");
//     }
// }
// window.addEventListener('load', notifyParentOfResize);
document.getElementById('optimizeForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const labs = {
        hemoglobin: parseFloat(document.getElementById('hemoglobin').value),
        neutrophil: parseFloat(document.getElementById('neutrophil').value),
        reticulocyte: parseFloat(document.getElementById('reticulocyte').value),
        platelet: parseFloat(document.getElementById('platelet').value),
    };
    const currentDose = parseFloat(document.getElementById('dose').value);
    const recentEscalation = document.querySelector('input[name="escalation"]:checked').value === 'true';
    const recentReduction = document.querySelector('input[name="reduction"]:checked').value === 'true';

    let message = calculateToxicity(labs);

    // These rules only apply where the labs would otherwise lead to a dose increase.
    // Lab toxicity and "dose is optimized" are shown as they are.
    const labsSuggestIncrease = message.startsWith("Dose increase") ||
                                message.startsWith("Dose adjustment for weight gain");

    if (labsSuggestIncrease) {
        if (recentReduction) {
            message = "Due to a recent hydroxyurea toxicity and dose reduction, we do not recommend dose escalation at this time.";
        } else if (recentEscalation) {
            message = `Since the dose was recently escalated, we recommend continuing the same dose (${currentDose} mg).`;
        }
    }

    document.getElementById('resultText').textContent = message;
    document.getElementById('outputBox').style.display = 'block';
    notifyParentOfResize();
});

function notifyParentOfResize() {
    if (window.parent !== window) {
        window.parent.postMessage({ type: "hu-calculator-resize", height: document.body.scrollHeight }, "*");
    }
}
window.addEventListener('load', notifyParentOfResize);
