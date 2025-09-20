// public/assets/report-template.js
(() => {
  const $ = (s) => document.querySelector(s);
  const els = {
    state: $('#rtState'),
    practitioner: $('#rtPractitioner'),
    date: $('#rtDate'),
    location: $('#rtLocation'),
    product: $('#rtProduct'),
    outcome: $('#rtOutcome'),
    details: $('#rtDetails'),
    evidence: $('#rtEvidence'),
    witnesses: $('#rtWitnesses'),
    priorCase: $('#rtPriorCase'),
    yourName: $('#rtYourName'),
    yourEmail: $('#rtYourEmail'),
    savePdf: $('#rtSavePdf'),
    copyText: $('#rtCopyText'),
    // Bind to the actual button id; keep backward-compatibility with older ids
    generateBtn: document.querySelector('#generate-btn, #rtGenerateBtn, [data-action="generate"]'),
  };

  function buildModel() {
    const now = new Date().toISOString();
    return {
      generatedAt: now,
      state: (els.state?.value || '').trim(),
      practitioner: (els.practitioner?.value || '').trim(),
      date: els.date?.value || '',
      location: (els.location?.value || '').trim(),
      product: (els.product?.value || '').trim(),
      outcome: (els.outcome?.value || '').trim(),
      details: (els.details?.value || '').trim(),
      evidence: (els.evidence?.value || '').trim(),
      witnesses: (els.witnesses?.value || '').trim(),
      priorCase: (els.priorCase?.value || '').trim(),
      reporter: {
        name: (els.yourName?.value || '').trim(),
        email: (els.yourEmail?.value || '').trim(),
      },
      notice: 'This draft is generated locally. We do not store your report.',
    };
  }

  function toText(m) {
    const lines = [
      'Complaint preparation (local draft)',
      `Generated: ${m.generatedAt}`,
      '',
      `State: ${m.state}`,
      `Practitioner/Org: ${m.practitioner}`,
      `Date: ${m.date}`,
      `Location: ${m.location}`,
      `Procedure/Product: ${m.product}`,
      `Harm/Outcome: ${m.outcome}`,
      '',
      'Details:',
      m.details || '',
      '',
      'Evidence/Documentation:',
      m.evidence || '',
      '',
      'Other:',
      `Witnesses: ${m.witnesses}`,
      `Prior board case #: ${m.priorCase}`,
      '',
      'Reporter:',
      `  Name: ${m.reporter.name}`,
      `  Email: ${m.reporter.email}`,
      '',
      m.notice,
    ];
    return lines.join('\n');
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // === Only dependency: load jsPDF from a LOCAL file to avoid CSP/CDN issues ===
  async function getJsPDF() {
    if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
    // Local vendor file (add it at /public/assets/vendor/jspdf.umd.min.js)
    await loadScript('/assets/vendor/jspdf.umd.min.js');
    if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
    throw new Error('jsPDF failed to load');
  }

  async function downloadPdf(filename, m) {
    const jsPDF = await getJsPDF();
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const margin = 48;
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const maxW = pageW - margin * 2;
    let y = margin;

    const add = (text, { bold = false, size = 11, leading = 16 } = {}) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, maxW);
      for (const line of lines) {
        if (y > pageH - margin) { doc.addPage(); y = margin; }
        doc.text(line, margin, y);
        y += leading;
      }
    };

    add('Complaint Preparation (Local Draft)', { size: 18, bold: true, leading: 26 });
    add(`Generated: ${m.generatedAt}`, { size: 10, leading: 14 }); y += 6;

    add('Overview', { bold: true });
    add(`State: ${m.state}`);
    add(`Practitioner/Org: ${m.practitioner}`);
    add(`Date: ${m.date}`);
    add(`Location: ${m.location}`);
    add(`Procedure/Product: ${m.product}`);
    add(`Harm/Outcome: ${m.outcome}`); y += 6;

    add('Details', { bold: true });
    add(m.details || ''); y += 6;

    add('Evidence/Documentation', { bold: true });
    add(m.evidence || ''); y += 6;

    add('Other', { bold: true });
    add(`Witnesses: ${m.witnesses}`);
    add(`Prior board case #: ${m.priorCase}`); y += 6;

    add('Reporter', { bold: true });
    add(`Name: ${m.reporter.name}`);
    add(`Email: ${m.reporter.email}`); y += 10;

    add(m.notice, { size: 9, leading: 13 });

    doc.save(filename);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  els.generateBtn?.addEventListener('click', async () => {
    if (!els.savePdf?.checked && !els.copyText?.checked) {
      alert('Select at least one option: Save PDF or Copy text.');
      return;
    }

    const model = buildModel();
    const ts = new Date(model.generatedAt).toISOString().replace(/[:.]/g, '-');
    const base = (model.state || 'report').replace(/\s+/g, '-');
    const file = `report-template-${base}-${ts}.pdf`;

    let parts = [];
    if (els.savePdf?.checked) {
      try {
        await downloadPdf(file, model);
        parts.push('saved PDF');
      } catch (e) {
        console.error('PDF generation failed:', e);
        parts.push('PDF failed');
      }
    }
    if (els.copyText?.checked) {
      const ok = await copyToClipboard(toText(model));
      parts.push(ok ? 'copied text' : 'copy failed');
    }
    alert(`Done: ${parts.join(' & ')}.\nWe do not store your report.`);
  });
})();
