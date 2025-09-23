// public/assets/report-template.js (REPLACEMENT)
// Aligns PDF/text generation with current report.html fields and
// auto-loads jsPDF from /assets/vendor/jspdf.umd.min.js.
(() => {
  const $ = (s) => document.querySelector(s);

  const els = {
    // Updated IDs (with graceful fallback to older IDs if present)
    dateInjection: $('#rtDateInjection') || $('#rtDate'),
    dateSymptoms:  $('#rtDateSymptoms')  || $('#rtDate'),
    dateTreatment: $('#rtDateTreatment') || $('#rtDate'),
    practitioner:  $('#rtPractitioner'),
    licenseNumber: $('#rtlicensenumber'),
    medicalSpecialty: $('#rtMedicalspecialty'),
    org: $('#rtOrg') || $('#rtLocation'),
    cityState: $('#rtCityState') || $('#rtLocation'),
    product: $('#rtProduct'),
    outcome: $('#rtOutcome'),
    details: $('#rtDetails'),
    savePdf: $('#rtSavePdf'),
    copyText: $('#rtCopyText'),
    generateBtn: document.querySelector('#generate-btn, #rtGenerateBtn, [data-action="generate"]'),
  };

  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });

  async function getJsPDF() {
    if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
    await loadScript('/assets/vendor/jspdf.umd.min.js');
    if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
    throw new Error('jsPDF failed to load');
  }

  const val = (el) => (el && el.value ? el.value.trim() : '');

  function buildModel() {
    return {
      generatedAt: new Date().toISOString(),
      dates: {
        injection: val(els.dateInjection),
        symptoms:  val(els.dateSymptoms),
        treatment: val(els.dateTreatment),
      },
      practitioner: val(els.practitioner),
      licenseNumber: val(els.licenseNumber),
      medicalSpecialty: val(els.medicalSpecialty),
      org: val(els.org),
      cityState: val(els.cityState),
      product: val(els.product),
      outcome: val(els.outcome),
      details: val(els.details),
    };
  }

  function toText(m) {
    const lines = [
      'Complaint preparation (local draft)',
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
      'Details / What Happened:',
      m.details || '',
      '',
      'Nothing you enter here is collected or stored by this site when using the information template.',
    ];
    return lines.join('\n');
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      alert('Copied generated report text.');
      return true;
    } catch (e) {
      console.warn('Clipboard API failed, falling back.', e);
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      alert(ok ? 'Copied generated report text.' : 'Copy failed.');
      return ok;
    }
  }

  async function downloadPdf(filename, m) {
    const jsPDF = await getJsPDF();
    const doc = new jsPDF({ unit: 'pt', format: 'letter' }); // 612x792
    const margin = 48;
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const maxW = pageW - margin * 2;

    const text = toText(m);
    const lines = doc.splitTextToSize(text, maxW);

    let y = margin;
    const leading = 16;

    lines.forEach((ln) => {
      if (y > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(ln, margin, y);
      y += leading;
    });

    const safeName =
      (val(els.practitioner) || 'report').replace(/[^a-z0-9-_]+/gi, '_') +
      '_' +
      new Date(m.generatedAt).toISOString().replace(/[:.]/g, '-');

    doc.save(`${safeName}.pdf`);
  }

  function validateActions() {
    if (!els.savePdf?.checked && !els.copyText?.checked) {
      alert('Select at least one option: Save PDF or Copy text.');
      return false;
    }
    return true;
  }

  async function handleGenerate() {
    if (!validateActions()) return;
    const model = buildModel();
    const parts = [];
    if (els.savePdf?.checked) {
      try {
        await downloadPdf('report.pdf', model);
        parts.push('saved PDF');
      } catch (e) {
        console.error('PDF generation failed:', e);
        parts.push('PDF failed');
        alert('PDF generation failed. See console for details.');
      }
    }
    if (els.copyText?.checked) {
      const ok = await copyToClipboard(toText(model));
      parts.push(ok ? 'copied text' : 'copy failed');
    }
    if (parts.length) {
      // eslint-disable-next-line no-alert
      alert(`Done: ${parts.join(' & ')}. We do not store your report.`);
    }
  }

  els.generateBtn && els.generateBtn.addEventListener('click', handleGenerate);
})();
