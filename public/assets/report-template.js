/* public/assets/report-template.js
   Purpose: Generate a clean text report from the current form and
   support Copy + Save to PDF. Keeps all visible copy verbatim.
   Assumes jsPDF is available globally at window.jspdf.jsPDF.
*/

(function () {
  const $ = (s) => document.querySelector(s);

  // Map to the updated IDs in report.html
  const els = {
    dateInjection: $('#rtDateInjection'),
    dateSymptoms: $('#rtDateSymptoms'),
    dateTreatment: $('#rtDateTreatment'),
    practitioner: $('#rtPractitioner'),
    licenseNumber: $('#rtlicensenumber'),
    medicalSpecialty: $('#rtMedicalspecialty'),
    org: $('#rtOrg'),
    cityState: $('#rtCityState'),
    product: $('#rtProduct'),
    outcome: $('#rtOutcome'),
    details: $('#rtDetails'),
    savePdf: $('#rtSavePdf'),
    copyText: $('#rtCopyText'),
  };

  function val(node) {
    return (node && node.value ? node.value : '').trim();
  }

  function buildModel() {
    return {
      generatedAt: new Date().toISOString(),
      dates: {
        injection: val(els.dateInjection),
        symptoms: val(els.dateSymptoms),
        treatment: val(els.dateTreatment),
      },
      practitioner: val(els.practitioner),
      licenseNumber: val(els.licenseNumber),
      medicalSpecialty: val(els.medicalSpecialty),
      org: val(els.org),
      cityState: val(els.cityState),
      product: val(els.product),
      outcome: val(els.outcome),
      details: val(els.details), // keep verbatim; this is your on-page template text if pasted
      notice:
        'Nothing you enter here is collected or stored by this site when using the information template.',
    };
  }

  // Build the exact text payload we’ll copy and drop into the PDF.
  function buildText(m) {
    const lines = [
      'Report – Draft for State Board Filing',
      `Generated: ${new Date(m.generatedAt).toLocaleString()}`,
      '',
      `Physician Name: ${m.practitioner}`,
      `License Number: ${m.licenseNumber}`,
      `Medical Specialty: ${m.medicalSpecialty}`,
      `Practice / Organization Name: ${m.org}`,
      `Location (City / State): ${m.cityState}`,
      `Product Administered: ${m.product}`,
      `Harm / Adverse Effect: ${m.outcome}`,
      '',
      'Dates:',
      `  • Date of Injection: ${m.dates.injection}`,
      `  • Date Symptoms Recognized: ${m.dates.symptoms}`,
      `  • Date Treatment Sought: ${m.dates.treatment}`,
      '',
      'Details / What Happened (verbatim):',
      m.details || '',
      '',
      m.notice,
    ];
    return lines.join('\n');
  }

  async function onCopy() {
    const text = buildText(buildModel());
    try {
      await navigator.clipboard.writeText(text);
      toast('Report text copied to clipboard.');
    } catch (e) {
      alert('Copy failed. You can select the generated text manually.\n\n' + e);
    }
  }

  function onSavePdf() {
    const text = buildText(buildModel());
    const jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) {
      alert(
        'PDF library (jsPDF) was not found. Please ensure jsPDF is loaded on this page.'
      );
      return;
    }

    const doc = new jsPDF({ unit: 'pt', format: 'letter' }); // 612x792
    const margin = 48;
    const lineHeight = 14;
    const maxWidth = 612 - margin * 2;
    const lines = doc.splitTextToSize(text, maxWidth);

    let y = margin;
    const startY = margin;
    const pageHeight = 792;

    lines.forEach((ln) => {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = startY;
      }
      doc.text(ln, margin, y);
      y += lineHeight;
    });

    const nameHint = (val(els.practitioner) || 'report').replace(/[^a-z0-9-_]+/gi, '_');
    doc.save(`${nameHint}_draft.pdf`);
  }

  function toast(msg) {
    // simple unobtrusive toast without dependencies
    let t = document.getElementById('rtToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'rtToast';
      t.style.position = 'fixed';
      t.style.bottom = '16px';
      t.style.right = '16px';
      t.style.padding = '10px 14px';
      t.style.background = 'rgba(0,0,0,0.75)';
      t.style.color = '#fff';
      t.style.borderRadius = '8px';
      t.style.fontSize = '14px';
      t.style.zIndex = '9999';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    setTimeout(() => (t.style.opacity = '0'), 2000);
  }

  // Wire up events (no-op if buttons are absent)
  els.copyText && els.copyText.addEventListener('click', onCopy);
  els.savePdf && els.savePdf.addEventListener('click', onSavePdf);
})();
