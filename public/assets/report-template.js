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

    // Optional actions
    savePdf: $('#rtSavePdf'),
    copyText: $('#rtCopyText'),

    // IMPORTANT: matches the real button id in report.html
    generateBtn: $('#generate-btn'),
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
    };
  }

  function toText(m) {
    const lines = [
      'Complaint Preparation (Local Draft)',
      `Generated: ${m.generatedAt}`,
      '',
      'Overview:',
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
    ];
    return lines.join('\n');
  }

  function injectOptionalActionsStyles() {
    if (document.getElementById('oa-styles')) return;
    const css = `
      #optional-actions { margin-top: 8px; }
      #optional-actions .oa-row { position: relative; }
      #optional-actions .oa-input {
        position: absolute; inset: 0; opacity: 0; pointer-events: none;
      }
      #optional-actions .oa-card {
        display: block;
        position: relative;
        border: 2px solid #b7c8ff;
        background: #f4f7ff;
        border-radius: 14px;
        padding: 12px 46px 12px 14px; /* room on RIGHT for the indicator */
        box-shadow: 0 1px 2px rgba(0,0,0,.05);
        transition: box-shadow .15s ease, border-color .15s ease, background .15s ease;
        cursor: pointer;
        scrollbar-gutter: stable;
      }
      #optional-actions .oa-title { font-weight: 600; }
      #optional-actions .oa-note  { display: block; font-size: .92rem; opacity: .75; margin-top: .2rem; }
      #optional-actions .oa-row + .oa-row { margin-top: 10px; }

      /* Toggle indicator (right side) */
      #optional-actions .oa-card::after {
        content: '';
        position: absolute;
        right: 12px; top: 50%;
        width: 18px; height: 18px;
        border-radius: 50%;
        border: 2px solid #2d5bff;
        transform: translateY(-50%);
        box-shadow: 0 0 0 3px rgba(45,91,255,.15);
        background: #fff;
      }
      #optional-actions input:checked + .oa-card::after {
        background: radial-gradient(circle at 50% 50%, #2d5bff 50%, transparent 51%);
      }
      #optional-actions .oa-card:hover {
        box-shadow: 0 6px 20px rgba(32,46,120,.12);
        background: #eef4ff;
        border-color: #8da9ff;
      }
      .actions { margin-top: 12px; }
    `.trim();
    const style = document.createElement('style');
    style.id = 'oa-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // Try to use a locally-hosted jsPDF (keeps CSP strict). If it fails, caller will handle fallback.
  async function getJsPDF() {
    try {
      if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
      await loadScript('/assets/vendor/jspdf.umd.min.js');
      if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
      throw new Error('jsPDF failed to load');
    } catch (e) {
      throw e;
    }
  }

  // Print fallback for "Save as PDF"
  function openPrintWindow(m) {
    const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Report Draft</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; line-height:1.45; padding:24px; }
  h1 { font-size: 18px; margin:0 0 12px; }
  h2 { font-size: 14px; margin:18px 0 6px; }
  p, pre { font-size: 12px; white-space: pre-wrap; }
  .meta { color:#444; font-size: 11px; margin-bottom: 8px; }
  @media print { button { display:none } }
</style>
</head>
<body>
  <h1>Complaint Preparation (Local Draft)</h1>
  <div class="meta">Generated: ${m.generatedAt}</div>
  <h2>Overview</h2>
  <p>
  State: ${m.state}\n
  Practitioner/Org: ${m.practitioner}\n
  Date: ${m.date}\n
  Location: ${m.location}\n
  Procedure/Product: ${m.product}\n
  Harm/Outcome: ${m.outcome}
  </p>
  <h2>Details</h2>
  <p>${(m.details || '').replace(/</g,'&lt;')}</p>
  <h2>Evidence/Documentation</h2>
  <p>${(m.evidence || '').replace(/</g,'&lt;')}</p>
  <h2>Other</h2>
  <p>Witnesses: ${m.witnesses}<br/>Prior board case #: ${m.priorCase}</p>
  <h2>Reporter</h2>
  <p>Name: ${m.reporter.name}<br/>Email: ${m.reporter.email}</p>
  <button onclick="window.print()">Print</button>
  <script>setTimeout(()=>window.print(),200);</script>
</body>
</html>`;
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) throw new Error('Popup blocked');
    win.document.open(); win.document.write(html); win.document.close();
  }

  // Generate a PDF via jsPDF if available; otherwise open the print dialog as a fallback.
  async function downloadPdf(filename, m) {
    try {
      const jsPDF = await getJsPDF();
      const doc = new jsPDF({ unit: 'pt', format: 'letter' });
      const margin = 48, pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
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
      add(`Email: ${m.reporter.email}`);

      doc.save(filename);
      return 'pdf';
    } catch (err) {
      // CSP-safe fallback: open a printable window so user can Save as PDF
      openPrintWindow(m);
      return 'print';
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '-9999px';
        document.body.appendChild(ta); ta.focus(); ta.select();
        const ok = document.execCommand('copy'); ta.remove();
        return ok;
      } catch { return false; }
    }
  }

  // Bind click
  els.generateBtn?.addEventListener('click', async () => {
    if (!els.savePdf?.checked && !els.copyText?.checked) {
      alert('Select at least one option: Save PDF or Copy text.');
      return;
    }
    injectOptionalActionsStyles();

    const model = buildModel();
    const ts = new Date(model.generatedAt).toISOString().replace(/[:.]/g, '-');
    const base = (model.state || 'report').toLowerCase().replace(/\W+/g, '-').replace(/^-+|-+$/g, '');
    const file = `report-template-${base}-${ts}.pdf`;

    let parts = [];
    if (els.savePdf?.checked) {
      const mode = await downloadPdf(file, model);
      parts.push(mode === 'pdf' ? 'saved PDF' : 'opened print dialog');
    }
    if (els.copyText?.checked) {
      const ok = await copyToClipboard(toText(model));
      parts.push(ok ? 'copied text' : 'copy failed');
    }
    alert(`Done: ${parts.join(' & ')}.\nWe do not store your report.`);
  });
})();

